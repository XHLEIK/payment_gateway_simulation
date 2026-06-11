import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionsService } from '../transactions/transactions.service';
import { TransactionStatus, TransactionType } from '../transactions/entities/transaction.entity';
import { PaymentRequest, PaymentRequestStatus } from './entities/payment-request.entity';
import { UsersService } from '../users/users.service';
import { WalletsService } from '../wallets/wallets.service';
import { randomBytes, createHmac } from 'crypto';
import axios from 'axios';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly webhookSecret: string;
  private readonly port: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly transactionsService: TransactionsService,
    @InjectRepository(PaymentRequest)
    private readonly paymentRequestRepository: Repository<PaymentRequest>,
    private readonly usersService: UsersService,
    private readonly walletsService: WalletsService,
  ) {
    this.webhookSecret = this.configService.get<string>('webhook.secret', 'appsc_webhook_secret_hmac_key_2026');
    this.port = this.configService.get<number>('port', 3001);
  }

  // 1. Generate Order (Mock Payment Gateway API call)
  async generateOrderId(amount: number): Promise<{ orderId: string; amount: number; signature: string }> {
    const orderId = `ORD-${randomBytes(6).toString('hex').toUpperCase()}`;
    
    // Generate a valid mock signature that the client can send back
    const signature = this.generateMockSignature(orderId, amount);

    return {
      orderId,
      amount,
      signature,
    };
  }

  // 2. Verify Payment (Mock Signature Check)
  async verifyPayment(orderId: string, signature: string, amount: number): Promise<boolean> {
    const expectedSignature = this.generateMockSignature(orderId, amount);
    if (signature !== expectedSignature) {
      this.logger.warn(`Signature mismatch for Order ${orderId}. Expected ${expectedSignature}, got ${signature}`);
      return false;
    }
    return true;
  }

  // Helper: Create secure signature for checkout validation
  private generateMockSignature(orderId: string, amount: number): string {
    return createHmac('sha256', this.webhookSecret)
      .update(`${orderId}:${amount}`)
      .digest('hex');
  }

  // 3. Trigger Mock Gateway Webhook asynchronously
  async triggerAsynchronousWebhook(orderId: string, amount: number, userId: string) {
    // Simulate network delay of 2 seconds before firing the webhook callback
    setTimeout(async () => {
      try {
        const transaction = await this.transactionsService.findByGatewayOrderId(orderId);
        if (!transaction) {
          this.logger.error(`Webhook trigger failed: Transaction for order ${orderId} not found`);
          return;
        }

        // Simulate 80% success rate
        const isSuccess = Math.random() < 0.8;
        const status = isSuccess ? TransactionStatus.SUCCESS : TransactionStatus.FAILED;

        const payload = {
          orderId,
          amount,
          userId,
          status,
          gatewayPaymentId: `PAY-${randomBytes(6).toString('hex').toUpperCase()}`,
          timestamp: new Date().toISOString(),
        };

        // Compute HMAC signature for webhook payload verification
        const payloadStr = JSON.stringify(payload);
        const signature = createHmac('sha256', this.webhookSecret)
          .update(payloadStr)
          .digest('hex');

        this.logger.log(`Firing Mock Webhook for Order ${orderId} with status ${status}`);

        // Post to local webhook endpoint
        const url = `http://localhost:${this.port}/api/payments/webhook`;
        await axios.post(url, payload, {
          headers: {
            'Content-Type': 'application/json',
            'x-gateway-signature': signature,
          },
        });
        
        this.logger.log(`Mock Webhook for Order ${orderId} posted successfully.`);
      } catch (err: any) {
        this.logger.error(`Failed to execute mock webhook callback for ${orderId}:`, err.message);
      }
    }, 2000);
  }

  // Verify HMAC header signature
  verifyWebhookSignature(payload: any, signature: string): boolean {
    const payloadStr = JSON.stringify(payload);
    const expectedSignature = createHmac('sha256', this.webhookSecret)
      .update(payloadStr)
      .digest('hex');
    return signature === expectedSignature;
  }

  // === PAYMENT REQUESTS (REQUEST MONEY) METHODS ===

  async createRequest(payeeId: string, recipientEmail: string, amount: number): Promise<PaymentRequest> {
    if (amount <= 0) {
      throw new BadRequestException('Request amount must be positive');
    }

    const payer = await this.usersService.findByEmail(recipientEmail);
    if (!payer) {
      throw new NotFoundException('Recipient candidate does not exist');
    }

    if (payeeId === payer.id) {
      throw new BadRequestException('Cannot request payment from yourself');
    }

    const request = this.paymentRequestRepository.create({
      payerId: payer.id,
      payeeId,
      amount,
      status: PaymentRequestStatus.PENDING,
    });

    return this.paymentRequestRepository.save(request);
  }

  async getReceivedRequests(payerId: string): Promise<PaymentRequest[]> {
    return this.paymentRequestRepository.find({
      where: { payerId, status: PaymentRequestStatus.PENDING },
      relations: { payee: true },
      order: { createdAt: 'DESC' },
    });
  }

  async getSentRequests(payeeId: string): Promise<PaymentRequest[]> {
    return this.paymentRequestRepository.find({
      where: { payeeId },
      relations: { payer: true },
      order: { createdAt: 'DESC' },
    });
  }

  async approveRequest(requestId: string, payerId: string, pin: string): Promise<any> {
    const request = await this.paymentRequestRepository.findOne({
      where: { id: requestId },
      relations: { payee: true },
    });

    if (!request) {
      throw new NotFoundException(`Payment request ${requestId} not found`);
    }

    if (request.payerId !== payerId) {
      throw new BadRequestException('You are not authorized to approve this payment request');
    }

    if (request.status !== PaymentRequestStatus.PENDING) {
      throw new BadRequestException(`Payment request is already ${request.status.toLowerCase()}`);
    }

    // Execute transfer using WalletsService.sendMoney (deadlock-free sorted locks)
    const transferResult = await this.walletsService.sendMoney(
      payerId,
      request.payee.email,
      request.amount,
      pin,
      `REQ-APP-${requestId}`,
    );

    // If transfer succeeded without exception, update request status to APPROVED
    request.status = PaymentRequestStatus.APPROVED;
    await this.paymentRequestRepository.save(request);

    return {
      message: 'Payment request approved and paid successfully',
      transferResult,
    };
  }

  async rejectRequest(requestId: string, payerId: string): Promise<any> {
    const request = await this.paymentRequestRepository.findOne({
      where: { id: requestId },
    });

    if (!request) {
      throw new NotFoundException(`Payment request ${requestId} not found`);
    }

    if (request.payerId !== payerId) {
      throw new BadRequestException('You are not authorized to reject this payment request');
    }

    if (request.status !== PaymentRequestStatus.PENDING) {
      throw new BadRequestException(`Payment request is already ${request.status.toLowerCase()}`);
    }

    request.status = PaymentRequestStatus.REJECTED;
    await this.paymentRequestRepository.save(request);

    return {
      message: 'Payment request rejected successfully',
    };
  }
}
