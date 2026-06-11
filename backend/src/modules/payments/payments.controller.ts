import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Headers,
  UseGuards,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  BadRequestException,
  Req,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { TransactionsService } from '../transactions/transactions.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';
import { Transaction, TransactionStatus, TransactionType } from '../transactions/entities/transaction.entity';
import { DataSource } from 'typeorm';
import { Throttle } from '@nestjs/throttler';

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly transactionsService: TransactionsService,
    private readonly analyticsService: AnalyticsService,
    private readonly dataSource: DataSource,
  ) {}

  // 1. Initiate Payment Checkout Order (Client request to create transaction + gateway order)
  @Post('initiate')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // Throttle checkout order requests
  async initiate(
    @CurrentUser() user: any,
    @Body() dto: InitiatePaymentDto,
  ) {
    // A. Create/check transaction in database
    const txn = await this.transactionsService.initiate(
      user.userId,
      dto.amount,
      dto.type,
      dto.requestId,
    );

    // B. If transaction is already processed, return it directly
    if (txn.status !== TransactionStatus.INITIATED) {
      return {
        transactionId: txn.id,
        referenceId: txn.referenceId,
        status: txn.status,
        amount: txn.amount,
      };
    }

    // C. Contact mock gateway to generate a mock order
    const gatewayOrder = await this.paymentsService.generateOrderId(dto.amount);

    // D. Associate gateway order ID with our transaction record
    txn.gatewayOrderId = gatewayOrder.orderId;
    await this.dataSource.getRepository(txn.constructor).save(txn);

    return {
      transactionId: txn.id,
      referenceId: txn.referenceId,
      orderId: gatewayOrder.orderId,
      amount: gatewayOrder.amount,
      signature: gatewayOrder.signature,
      status: txn.status,
    };
  }

  // 2. Verify Client Payment Submit (Trigger processing step + queue background webhook callback)
  @Post('verify')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 15, ttl: 60000 } })
  async verify(
    @CurrentUser() user: any,
    @Body() dto: VerifyPaymentDto,
    @Req() req: any,
  ) {
    const txn = await this.transactionsService.findByGatewayOrderId(dto.orderId);
    if (!txn) {
      throw new BadRequestException(`No active transaction found for order ID: ${dto.orderId}`);
    }

    if (txn.status !== TransactionStatus.INITIATED) {
      return {
        message: 'Transaction is already in processing or complete',
        status: txn.status,
      };
    }

    // Validate mock signature
    const isValid = await this.paymentsService.verifyPayment(dto.orderId, dto.signature, txn.amount);
    if (!isValid) {
      throw new BadRequestException('Invalid transaction signature');
    }

    // Transition state from INITIATED -> PROCESSING
    const correlationId = req['correlationId'];
    await this.transactionsService.transitionStatus(
      txn.id,
      TransactionStatus.PROCESSING,
      undefined,
      'client_submit',
      correlationId,
    );

    // Fire webhook asynchronously from the mock gateway simulation
    await this.paymentsService.triggerAsynchronousWebhook(dto.orderId, txn.amount, user.userId);

    return {
      message: 'Payment verified, processing webhook callback',
      status: TransactionStatus.PROCESSING,
    };
  }

  // 3. Public Webhook Callback (Updates transaction state & adjusts wallet balance in a SERIALIZABLE transaction)
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 60000 } }) // Webhook receiver rate limiter
  async webhook(
    @Headers('x-gateway-signature') signature: string,
    @Body() payload: any,
    @Req() req: any,
  ) {
    if (!signature) {
      throw new UnauthorizedException('Missing signature header');
    }

    const isValid = this.paymentsService.verifyWebhookSignature(payload, signature);
    if (!isValid) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const { orderId, status, gatewayPaymentId } = payload;
    const correlationId = req['correlationId'] || 'webhook-thread';

    // Process webhook updates under serializable transactions to guarantee strict state progression
    await this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const txnRepo = manager.getRepository(Transaction);
      const txn = await txnRepo.findOne({ where: { gatewayOrderId: orderId } });

      if (!txn) {
        throw new BadRequestException(`Transaction with order ID ${orderId} not found`);
      }

      // Check if already processed (webhook idempotency check)
      if (txn.status === TransactionStatus.SUCCESS || txn.status === TransactionStatus.FAILED) {
        return;
      }

      // Update state machine and execute balance changes
      await this.transactionsService.transitionStatus(
        txn.id,
        status,
        gatewayPaymentId,
        'gateway_webhook',
        correlationId,
        manager,
      );

      // Update aggregated daily statistics via application services (updated upon successful transaction commit)
      const today = new Date().toISOString().split('T')[0];
      await this.analyticsService.updateDailyStats(
        today,
        status === TransactionStatus.SUCCESS,
        txn.amount,
        manager,
      );
    });

    return { received: true };
  }

  @Post('requests')
  @UseGuards(JwtAuthGuard)
  async createRequest(
    @CurrentUser() user: any,
    @Body() body: { recipientEmail: string; amount: number },
  ) {
    const { recipientEmail, amount } = body;
    return this.paymentsService.createRequest(user.userId, recipientEmail, amount);
  }

  @Get('requests/received')
  @UseGuards(JwtAuthGuard)
  async getReceivedRequests(@CurrentUser() user: any) {
    return this.paymentsService.getReceivedRequests(user.userId);
  }

  @Get('requests/sent')
  @UseGuards(JwtAuthGuard)
  async getSentRequests(@CurrentUser() user: any) {
    return this.paymentsService.getSentRequests(user.userId);
  }

  @Post('requests/:id/approve')
  @UseGuards(JwtAuthGuard)
  async approveRequest(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body('pin') pin: string,
  ) {
    return this.paymentsService.approveRequest(id, user.userId, pin);
  }

  @Post('requests/:id/reject')
  @UseGuards(JwtAuthGuard)
  async rejectRequest(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.paymentsService.rejectRequest(id, user.userId);
  }
}


