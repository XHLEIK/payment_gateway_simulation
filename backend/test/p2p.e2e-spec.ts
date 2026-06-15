import * as path from 'path';
require('dotenv').config({ path: path.join(__dirname, '../.env') });

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../src/modules/redis/redis.service';
import { CaptchaService } from '../src/modules/auth/captcha.service';

// End-to-End integration suite testing the P2P money transfers,
// security PIN locking, settings resets, and payment request logic.
describe('P2P & PIN Security (e2e)', () => {
  let app: INestApplication<App>;
  let adminToken: string;
  let senderToken: string;
  let recipientToken: string;
  let senderId: string;
  let recipientId: string;
  
  // Use timestamp suffix to keep email registers unique per test run
  const uniqueSuffix = Date.now();
  const senderEmail = `sender-${uniqueSuffix}@regilly.com`;
  const recipientEmail = `recipient-${uniqueSuffix}@regilly.com`;
  const password = 'TestPassword@123';

  // Bootstraps full system database connections and registers our mock testers
  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CaptchaService)
      .useValue({
        verifyToken: async () => true, // Mock CAPTCHA verification to pass during tests
      })
      .compile();

    const configService = moduleFixture.get(ConfigService);
    console.log('--- TEST DB CONFIG ---');
    console.log('DB NAME:', configService.get('database.name'));
    console.log('DB USERNAME:', configService.get('database.username'));
    console.log('DB HOST:', configService.get('database.host'));
    console.log('DB PORT:', configService.get('database.port'));

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    // Clear Redis keys to prevent lockout / throttling issues during test setup
    const redis = moduleFixture.get(RedisService);
    const client = redis.getClient();
    const keys = await client.keys('rate:*');
    if (keys.length > 0) await client.del(...keys);
    const failKeys = await client.keys('fail:*');
    if (failKeys.length > 0) await client.del(...failKeys);
    const lockKeys = await client.keys('lock:*');
    if (lockKeys.length > 0) await client.del(...lockKeys);
    const sessionKeys = await client.keys('session:*');
    if (sessionKeys.length > 0) await client.del(...sessionKeys);

    // 1. Log in as admin to get auth tokens for crediting wallets
    const adminLoginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@regilly.com', password: 'Subham@1234' });
    console.log('Admin login status:', adminLoginRes.status);
    console.log('Admin login body:', adminLoginRes.body);
    adminToken = adminLoginRes.body.access_token;

    // 2. Register sender candidate
    const registerSenderRes = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ 
        name: 'Sender Candidate', 
        email: senderEmail, 
        password,
        captchaToken: '1x00000000000000000000AA'
      });
    senderId = registerSenderRes.body.user.id;

    // 3. Register recipient candidate
    const registerRecipientRes = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ 
        name: 'Recipient Candidate', 
        email: recipientEmail, 
        password,
        captchaToken: '1x00000000000000000000AA'
      });
    recipientId = registerRecipientRes.body.user.id;

    // 4. Authenticate sender
    const senderLoginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: senderEmail, password });
    senderToken = senderLoginRes.body.access_token;

    // 5. Authenticate recipient
    const recipientLoginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: recipientEmail, password });
    recipientToken = recipientLoginRes.body.access_token;

    // 6. Give the sender user ₹5000 via admin credit endpoint
    const creditRes = await request(app.getHttpServer())
      .post('/api/wallet/credit')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: senderId, amount: 5000 });
    console.log('Credit response status:', creditRes.status);
    console.log('Credit response body:', creditRes.body);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('User Email & PIN Setup Checks', () => {
    // Check if recipient candidate account is visible by their email address
    it('should check if a recipient email exists', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/users/check-email')
        .set('Authorization', `Bearer ${senderToken}`)
        .query({ email: recipientEmail })
        .expect(200);
      expect(res.body.exists).toBe(true);
      expect(res.body.name).toBe('Recipient Candidate');
    });

    // Check that querying a non-existent email throws a 404
    it('should throw 404 for non-existent email checks', async () => {
      await request(app.getHttpServer())
        .get('/api/users/check-email')
        .set('Authorization', `Bearer ${senderToken}`)
        .query({ email: 'nonexistent@regilly.com' })
        .expect(404);
    });

    // Newly registered users should not have a transaction PIN set yet
    it('should verify user initially has no transaction PIN', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/users/has-pin')
        .set('Authorization', `Bearer ${senderToken}`)
        .expect(200);
      expect(res.body.hasPin).toBe(false);
    });

    // Users must be able to configure a new 6-digit transaction PIN
    it('should successfully set a 6-digit transaction PIN', async () => {
      await request(app.getHttpServer())
        .post('/api/users/set-pin')
        .set('Authorization', `Bearer ${senderToken}`)
        .send({ pin: '123456' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/users/has-pin')
        .set('Authorization', `Bearer ${senderToken}`)
        .expect(200);
      expect(res.body.hasPin).toBe(true);
    });
  });

  describe('PIN Locking Brute-Force Protection', () => {
    it('should increment attempt counters on wrong PIN and lock user after 5 attempts', async () => {
      // 1st wrong attempt -> should report 4 attempts remaining
      let res = await request(app.getHttpServer())
        .post('/api/wallet/send-money')
        .set('Authorization', `Bearer ${senderToken}`)
        .send({ recipientEmail, amount: 100, pin: '000000', requestId: `req-wrong-1-${uniqueSuffix}` })
        .expect(400);
      expect(res.body.message).toContain('4 attempt(s) remaining');

      // 2nd, 3rd, 4th wrong attempts
      await request(app.getHttpServer())
        .post('/api/wallet/send-money')
        .set('Authorization', `Bearer ${senderToken}`)
        .send({ recipientEmail, amount: 100, pin: '000000', requestId: `req-wrong-2-${uniqueSuffix}` })
        .expect(400);
      await request(app.getHttpServer())
        .post('/api/wallet/send-money')
        .set('Authorization', `Bearer ${senderToken}`)
        .send({ recipientEmail, amount: 100, pin: '000000', requestId: `req-wrong-3-${uniqueSuffix}` })
        .expect(400);
      await request(app.getHttpServer())
        .post('/api/wallet/send-money')
        .set('Authorization', `Bearer ${senderToken}`)
        .send({ recipientEmail, amount: 100, pin: '000000', requestId: `req-wrong-4-${uniqueSuffix}` })
        .expect(400);

      // 5th wrong attempt -> Account lockout occurs
      res = await request(app.getHttpServer())
        .post('/api/wallet/send-money')
        .set('Authorization', `Bearer ${senderToken}`)
        .send({ recipientEmail, amount: 100, pin: '000000', requestId: `req-wrong-5-${uniqueSuffix}` })
        .expect(400);
      expect(res.body.message).toContain('locked for 15 minutes');

      // Subsequent attempt with a valid PIN should still fail immediately due to the lock
      res = await request(app.getHttpServer())
        .post('/api/wallet/send-money')
        .set('Authorization', `Bearer ${senderToken}`)
        .send({ recipientEmail, amount: 100, pin: '123456', requestId: `req-locked-${uniqueSuffix}` })
        .expect(400);
      expect(res.body.message).toContain('locked. Try again in');
    });

    it('should unlock candidate when a new PIN is successfully configured', async () => {
      // Re-set PIN to unlock user and clear lock attempts
      await request(app.getHttpServer())
        .post('/api/users/set-pin')
        .set('Authorization', `Bearer ${senderToken}`)
        .send({ pin: '654321' })
        .expect(201);

      // Send money should now succeed with the new PIN
      const sendRes = await request(app.getHttpServer())
        .post('/api/wallet/send-money')
        .set('Authorization', `Bearer ${senderToken}`)
        .send({ recipientEmail, amount: 1000, pin: '654321', requestId: `req-ok-${uniqueSuffix}` });
      
      console.log('sendMoney response:', sendRes.body);
      expect(sendRes.status).toBe(201);
      
      expect(sendRes.body.message).toContain('transferred successfully');
      expect(sendRes.body.balance).toBe(4000); // Initial 5000 - 1000 transfer = 4000
    });
  });

  describe('Payment Requests (Request Money)', () => {
    let paymentRequestId: string;

    // Users can submit a billing request to another user
    it('should allow payee to request money from payer', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/payments/requests')
        .set('Authorization', `Bearer ${recipientToken}`) // Recipient requests from Sender
        .send({ recipientEmail: senderEmail, amount: 500 })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.amount).toBe(500);
      expect(res.body.status).toBe('PENDING');
      paymentRequestId = res.body.id;
    });

    // Payer can load their inbox of pending billing requests
    it('should allow payer to fetch received pending requests', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/payments/requests/received')
        .set('Authorization', `Bearer ${senderToken}`)
        .expect(200);

      expect(res.body.length).toBeGreaterThanOrEqual(1);
      const req = res.body.find((r: any) => r.id === paymentRequestId);
      expect(req).toBeDefined();
      expect(req.amount).toBe(500);
      expect(req.payee.email).toBe(recipientEmail);
    });

    // Payer should be able to decline/reject requests
    it('should allow payer to reject a payment request', async () => {
      const tempReqRes = await request(app.getHttpServer())
        .post('/api/payments/requests')
        .set('Authorization', `Bearer ${recipientToken}`)
        .send({ recipientEmail: senderEmail, amount: 200 })
        .expect(201);

      const tempId = tempReqRes.body.id;

      // Reject the request
      await request(app.getHttpServer())
        .post(`/api/payments/requests/${tempId}/reject`)
        .set('Authorization', `Bearer ${senderToken}`)
        .expect(201);
    });

    // Payer should be able to approve a billing request by supplying their transaction PIN
    it('should allow payer to approve a request with PIN and trigger transfer', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/payments/requests/${paymentRequestId}/approve`)
        .set('Authorization', `Bearer ${senderToken}`)
        .send({ pin: '654321' });

      console.log('approveRequest response:', res.body);
      expect(res.status).toBe(201);

      expect(res.body.message).toContain('approved and paid successfully');
      
      // Sender's wallet balance: 4000 - 500 = ₹3500
      const balanceRes = await request(app.getHttpServer())
        .get('/api/wallet/balance')
        .set('Authorization', `Bearer ${senderToken}`)
        .expect(200);
      expect(balanceRes.body.balance).toBe(3500);

      // Recipient's wallet balance: 1000 (from sender direct transfer) + 500 (from request approval) = ₹1500
      const recBalanceRes = await request(app.getHttpServer())
        .get('/api/wallet/balance')
        .set('Authorization', `Bearer ${recipientToken}`)
        .expect(200);
      expect(recBalanceRes.body.balance).toBe(1500);
    });
  });
});
