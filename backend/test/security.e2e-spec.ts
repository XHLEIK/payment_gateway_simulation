import * as path from 'path';
require('dotenv').config({ path: path.join(__dirname, '../.env') });

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { RedisService } from '../src/modules/redis/redis.service';
import { CaptchaService } from '../src/modules/auth/captcha.service';

describe('Authentication Security (e2e)', () => {
  let app: INestApplication<App>;
  let redisService: RedisService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      // Mock CaptchaService to isolate testing and avoid hitting local Redis captcha keys during E2E tests
      .overrideProvider(CaptchaService)
      .useValue({
        generateCaptcha: async () => ({
          captchaId: 'mock-captcha-id',
          captchaSvg: '<svg>mock-svg</svg>',
        }),
        verifyCaptcha: async (captchaId: string, captchaValue: string) => {
          if (!captchaId || !captchaValue) return false;
          if (captchaValue === 'invalid_value') return false;
          return true;
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    
    // Parse cookies in tests
    const cookieParser = require('cookie-parser');
    app.use(cookieParser());

    // Register global ValidationPipe to test DTO constraints
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
    
    await app.init();
    redisService = app.get(RedisService);
  });

  beforeEach(async () => {
    // Clear all Redis keys related to rate limits and lockouts before each test
    const client = redisService.getClient();
    const keys = await client.keys('rate:*');
    if (keys.length > 0) await client.del(...keys);
    const failKeys = await client.keys('fail:*');
    if (failKeys.length > 0) await client.del(...failKeys);
    const lockKeys = await client.keys('lock:*');
    if (lockKeys.length > 0) await client.del(...lockKeys);
    const sessionKeys = await client.keys('session:*');
    if (sessionKeys.length > 0) await client.del(...sessionKeys);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('CAPTCHA Verification', () => {
    it('should reject registration attempts if CAPTCHA fields are missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          name: 'Security Test',
          email: 'test_sec_reg@regilly.com',
          password: 'Password@123456',
          confirmPassword: 'Password@123456',
        })
        .expect(400);

      expect(res.body.message).toContain('captchaId must be a string');
    });

    it('should reject registration attempts if CAPTCHA value is invalid', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          name: 'Security Test',
          email: 'test_sec_reg@regilly.com',
          password: 'Password@123456',
          confirmPassword: 'Password@123456',
          captchaId: 'mock-captcha-id',
          captchaValue: 'invalid_value',
        })
        .expect(400);

      expect(res.body.message).toContain('CAPTCHA verification failed');
    });
  });

  describe('Password Complexity Validation', () => {
    it('should reject passwords shorter than 12 characters', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          name: 'Security Test',
          email: 'test_sec_reg_short@regilly.com',
          password: 'Pass@123',
          confirmPassword: 'Pass@123',
          captchaId: 'mock-captcha-id',
          captchaValue: 'mock-captcha-value',
        })
        .expect(400);

      expect(res.body.message).toContain('Password must be at least 12 characters long');
    });

    it('should reject common or simple passwords', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          name: 'Security Test',
          email: 'test_sec_reg_common@regilly.com',
          password: 'qwertyuiopasdf',
          confirmPassword: 'qwertyuiopasdf',
          captchaId: 'mock-captcha-id',
          captchaValue: 'mock-captcha-value',
        })
        .expect(400);

      expect(res.body.message).toContain('Password must contain at least one uppercase letter');
    });
  });

  describe('Session Security & Fixation Prevention', () => {
    it('should rotate session ID on login', async () => {
      const loginRes1 = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: 'user@regilly.com',
          password: 'Subham@1234',
        })
        .expect(200);

      const cookie1 = loginRes1.headers['set-cookie'][0];
      const sessionId1 = cookie1.split(';')[0].split('=')[1];

      // Clear rates to prevent rate limit on second login
      const client = redisService.getClient();
      const keys = await client.keys('rate:*');
      if (keys.length > 0) await client.del(...keys);

      const loginRes2 = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: 'user@regilly.com',
          password: 'Subham@1234',
        })
        .expect(200);

      const cookie2 = loginRes2.headers['set-cookie'][0];
      const sessionId2 = cookie2.split(';')[0].split('=')[1];

      expect(sessionId1).not.toBe(sessionId2);
    });

    it('should reject session-authenticated requests if session is destroyed / logged out', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: 'user@regilly.com',
          password: 'Subham@1234',
        })
        .expect(200);

      const cookie = loginRes.headers['set-cookie'][0];
      const csrfToken = loginRes.body.csrfToken;

      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Cookie', [cookie])
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Cookie', [cookie])
        .set('X-CSRF-Token', csrfToken)
        .expect(200);

      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Cookie', [cookie])
        .expect(401);
    });
  });

  describe('CSRF Validation', () => {
    it('should reject state-changing requests when CSRF token is missing', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: 'user@regilly.com',
          password: 'Subham@1234',
        })
        .expect(200);

      const cookie = loginRes.headers['set-cookie'][0];

      await request(app.getHttpServer())
        .post('/api/payments/withdraw')
        .set('Cookie', [cookie])
        .send({ amount: 100 })
        .expect(403);
    });

    it('should reject state-changing requests with invalid CSRF token', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: 'user@regilly.com',
          password: 'Subham@1234',
        })
        .expect(200);

      const cookie = loginRes.headers['set-cookie'][0];

      await request(app.getHttpServer())
        .post('/api/payments/withdraw')
        .set('Cookie', [cookie])
        .set('X-CSRF-Token', 'malicious_csrf_token')
        .send({ amount: 100 })
        .expect(403);
    });

    it('should accept state-changing requests with valid CSRF token', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: 'user@regilly.com',
          password: 'Subham@1234',
        })
        .expect(200);

      const cookie = loginRes.headers['set-cookie'][0];
      const csrfToken = loginRes.body.csrfToken;

      const res = await request(app.getHttpServer())
        .post('/api/payments/withdraw')
        .set('Cookie', [cookie])
        .set('X-CSRF-Token', csrfToken)
        .send({ amount: 100, pin: '123456' });

      expect(res.status).not.toBe(403);
    });
  });

  describe('Brute Force Lockout & CAPTCHA Requirements', () => {
    it('should trigger CAPTCHA requirements after 5 failed logins', async () => {
      const testEmail = 'brute_force_test@regilly.com';

      // Perform 5 failed login attempts
      for (let i = 0; i < 5; i++) {
        // Clear rate limiter to avoid 429 throttling
        const client = redisService.getClient();
        const keys = await client.keys('rate:*');
        if (keys.length > 0) await client.del(...keys);

        const res = await request(app.getHttpServer())
          .post('/api/auth/login')
          .send({ email: testEmail, password: 'WrongPassword123!' });
        
        console.log(`[DEBUG TEST] Attempt ${i + 1} status:`, res.status, res.body);
      }

      const res = await request(app.getHttpServer())
        .get(`/api/auth/captcha-required?email=${testEmail}`)
        .expect(200);

      expect(res.body.captchaRequired).toBe(true);
    });
  });
});
