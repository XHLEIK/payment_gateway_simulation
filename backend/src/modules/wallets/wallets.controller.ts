import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { WalletsService } from './wallets.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';
import { DataSource } from 'typeorm';
import { Transaction, TransactionType, TransactionStatus } from '../transactions/entities/transaction.entity';
import { TransactionAudit } from '../transactions/entities/transaction-audit.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { randomBytes } from 'crypto';

// Handles candidate wallet actions (checking balances, sending money, transaction limits).
// Secured globally by JwtAuthGuard and RolesGuard.
@Controller('wallet')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WalletController {
  constructor(
    private readonly walletsService: WalletsService,
    private readonly dataSource: DataSource,
    private readonly notificationsService: NotificationsService,
  ) {}

  // Get current candidate's wallet balance
  @Get('balance')
  async getBalance(@CurrentUser() user: any) {
    const balance = await this.walletsService.getBalance(user.userId);
    return { balance };
  }

  // Get history of transfers, payments, credits, and debits for this user
  @Get('history')
  async getHistory(@CurrentUser() user: any) {
    return this.walletsService.getHistory(user.userId);
  }

  // Get daily spending limits and current usage for the caller
  @Get('daily-limit')
  async getDailyLimit(@CurrentUser() user: any) {
    return this.walletsService.getDailySpendSummary(user.userId);
  }

  // Admin-only route to modify daily spending limits for specific candidates (e.g. for high-volume accounts)
  @Post('daily-limit/:userId')
  @Roles(UserRole.ADMIN)
  async setDailyLimit(
    @Param('userId') userId: string,
    @Body('limit') limit: number,
  ) {
    return this.walletsService.setDailyLimit(userId, limit);
  }

  // Admin-only route to credit money directly to user wallets (simulates deposit/top-up flows)
  @Post('credit')
  @Roles(UserRole.ADMIN)
  async creditWallet(
    @CurrentUser() admin: any,
    @Body() body: { userId: string; amount: number },
  ) {
    const { userId, amount } = body;
    
    // We run the credit inside a SERIALIZABLE transaction to prevent concurrent modification anomalies
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      // 1. Create a successful CREDIT transaction history row
      const txnRef = `TXN-${randomBytes(4).toString('hex').toUpperCase()}`;
      const txn = manager.getRepository(Transaction).create({
        referenceId: txnRef,
        userId,
        amount,
        type: TransactionType.CREDIT,
        status: TransactionStatus.SUCCESS,
        requestId: `ADMIN-CREDIT-${Date.now()}-${randomBytes(2).toString('hex')}`,
      });
      const savedTxn = await manager.getRepository(Transaction).save(txn);

      // 2. Add funds to the wallet (this acquires a pessimistic lock internally)
      const updatedWallet = await this.walletsService.credit(userId, amount, manager);

      // 3. Log a record to the transaction audit trail
      const audit = manager.getRepository(TransactionAudit).create({
        transactionId: savedTxn.id,
        fromStatus: null,
        toStatus: TransactionStatus.SUCCESS,
        actor: `admin:${admin.userId}`,
      } as any);
      await manager.getRepository(TransactionAudit).save(audit);

      return {
        message: 'Wallet credited successfully',
        balance: updatedWallet.balance,
        referenceId: txnRef,
      };
    });
  }

  // Candidate route to send money directly to another user by email
  @Post('send-money')
  async sendMoney(
    @CurrentUser() user: any,
    @Body() body: {
      recipientEmail: string;
      amount: number;
      pin: string;
      requestId: string;
      simulateFailure?: boolean;
      simulateProcessing?: boolean;
    },
  ) {
    const { recipientEmail, amount, pin, requestId, simulateFailure, simulateProcessing } = body;

    // Delegate business logic to wallets service
    const result = await this.walletsService.sendMoney(
      user.userId,
      recipientEmail,
      amount,
      pin,
      requestId,
      simulateFailure || false,
      simulateProcessing || false,
    );

    // If the transfer went through immediately, send a push-alert history event
    if (!simulateFailure && !simulateProcessing && result.balance !== undefined) {
      try {
        await this.notificationsService.create(
          user.userId, 
          NotificationType.PAYMENT_RECEIVED,
          'Transfer Sent',
          `You sent ₹${amount.toFixed(2)} to ${recipientEmail}`,
          { referenceId: result.referenceId },
        );
      } catch (err) {
        // Notification errors shouldn't crash/rollback the financial transfer
      }
    }

    return result;
  }

  // ============================================================
  //  PROCESSING TRANSFER ADMIN ENDPOINTS
  // ============================================================

  // Approves a pending/processing direct transfer. Moves money from sender to receiver.
  @Post('approve-processing/:id')
  @Roles(UserRole.ADMIN)
  async approveProcessingTransfer(
    @Param('id') id: string,
    @CurrentUser() admin: any,
  ) {
    const result = await this.walletsService.approveProcessingTransfer(id, admin.userId);

    // Notify the sender that the transfer is now complete
    try {
      const txn = await this.dataSource.getRepository(Transaction).findOne({ where: { id } });
      if (txn) {
        await this.notificationsService.create(
          txn.userId,
          NotificationType.PROCESSING_APPROVED,
          'Transfer Approved',
          `Your transfer of ₹${txn.amount} (${txn.referenceId}) has been approved by admin and processed.`,
          { transactionId: txn.id, referenceId: txn.referenceId },
        );
      }
    } catch (err) {
      // Keep going even if notifications fail
    }

    return result;
  }

  // Rejects a pending/processing direct transfer, failing the transaction without moving funds.
  @Post('reject-processing/:id')
  @Roles(UserRole.ADMIN)
  async rejectProcessingTransfer(
    @Param('id') id: string,
    @CurrentUser() admin: any,
  ) {
    const result = await this.walletsService.rejectProcessingTransfer(id, admin.userId);

    // Send push notification to alert the sender of the rejection
    try {
      const txn = await this.dataSource.getRepository(Transaction).findOne({ where: { id } });
      if (txn) {
        await this.notificationsService.create(
          txn.userId,
          NotificationType.PROCESSING_REJECTED,
          'Transfer Rejected',
          `Your transfer of ₹${txn.amount} (${txn.referenceId}) has been rejected by admin. No funds were moved.`,
          { transactionId: txn.id, referenceId: txn.referenceId },
        );
      }
    } catch (err) {
      // Keep going even if notifications fail
    }

    return result;
  }
}
