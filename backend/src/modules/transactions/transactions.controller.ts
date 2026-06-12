import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  ForbiddenException,
  Req,
} from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';
import { TransactionStatus, TransactionType } from './entities/transaction.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { UsersService } from '../users/users.service';

@Controller('transactions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TransactionsController {
  constructor(
    private readonly transactionsService: TransactionsService,
    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
  ) {}

  @Get()
  async findAll(
    @CurrentUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: TransactionStatus,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('type') type?: TransactionType,
    @Query('minAmount') minAmount?: number,
    @Query('maxAmount') maxAmount?: number,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'ASC' | 'DESC',
  ) {
    const filters: any = {
      page: page ? parseInt(page as any, 10) : 1,
      limit: limit ? parseInt(limit as any, 10) : 20,
      status,
      from,
      to,
      type,
      minAmount: minAmount ? parseFloat(minAmount as any) : undefined,
      maxAmount: maxAmount ? parseFloat(maxAmount as any) : undefined,
      search,
      sortBy,
      sortOrder,
    };

    // If the authenticated user is NOT an admin, force filter by their own userId
    if (user.role !== UserRole.ADMIN) {
      filters.userId = user.userId;
    }

    const result = await this.transactionsService.findAll(filters);

    // Filter properties returned to frontend (exposing referenceId instead of raw UUIDs for client layout)
    return {
      items: result.items.map((item) => ({
        id: item.id,
        referenceId: item.referenceId,
        amount: item.amount,
        type: item.type,
        status: item.status,
        gatewayOrderId: item.gatewayOrderId,
        gatewayPaymentId: item.gatewayPaymentId,
        linkedTransactionId: item.linkedTransactionId,
        reversalReason: item.reversalReason,
        createdAt: item.createdAt,
        user: user.role === UserRole.ADMIN ? {
          id: item.user?.id,
          name: item.user?.name,
          email: item.user?.email,
        } : undefined,
      })),
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    };
  }

  @Get('pending-reversals')
  @Roles(UserRole.ADMIN)
  async getPendingReversals() {
    const txns = await this.transactionsService.findPendingReversals();
    // Only return sender transactions (TXN-SND-*) to avoid duplicates
    return txns
      .filter((t) => t.referenceId.startsWith('TXN-SND-'))
      .map((t) => ({
        id: t.id,
        referenceId: t.referenceId,
        amount: t.amount,
        status: t.status,
        reversalReason: t.reversalReason,
        linkedTransactionId: t.linkedTransactionId,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        user: t.user ? { id: t.user.id, name: t.user.name, email: t.user.email } : null,
      }));
  }

  @Get('processing-transfers')
  @Roles(UserRole.ADMIN)
  async getProcessingTransfers() {
    const txns = await this.transactionsService.findProcessingTransfers();
    return txns.map((t) => ({
      id: t.id,
      referenceId: t.referenceId,
      amount: t.amount,
      status: t.status,
      createdAt: t.createdAt,
      user: t.user ? { id: t.user.id, name: t.user.name, email: t.user.email } : null,
    }));
  }

  @Get(':id')
  async findOne(@CurrentUser() user: any, @Param('id') id: string) {
    const txn = await this.transactionsService.findOne(id);
    
    // Ensure standard users cannot inspect other people's transactions
    if (user.role !== UserRole.ADMIN && txn.userId !== user.userId) {
      throw new ForbiddenException('You are not authorized to view this transaction');
    }

    return {
      id: txn.id,
      referenceId: txn.referenceId,
      amount: txn.amount,
      type: txn.type,
      status: txn.status,
      gatewayOrderId: txn.gatewayOrderId,
      gatewayPaymentId: txn.gatewayPaymentId,
      linkedTransactionId: txn.linkedTransactionId,
      reversalReason: txn.reversalReason,
      createdAt: txn.createdAt,
      auditLogs: txn.auditLogs.map((log) => ({
        fromStatus: log.fromStatus,
        toStatus: log.toStatus,
        actor: log.actor,
        timestamp: log.timestamp,
      })),
      refunds: txn.refunds.map((refund) => ({
        id: refund.id,
        amount: refund.amount,
        reason: refund.reason,
        status: refund.status,
        createdAt: refund.createdAt,
      })),
    };
  }

  // ============================================================
  //  REVERSAL ENDPOINTS
  // ============================================================

  @Post(':id/request-reversal')
  async requestReversal(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body('reason') reason: string,
  ) {
    if (!reason || reason.trim().length < 3) {
      throw new ForbiddenException('Please provide a valid reason for the reversal request');
    }

    const result = await this.transactionsService.requestReversal(id, user.userId, reason);

    // Notify all admins about the reversal request
    const allUsers = await this.usersService.findAll();
    const adminIds = allUsers.filter((u) => u.role === UserRole.ADMIN).map((u) => u.id);

    if (adminIds.length > 0) {
      await this.notificationsService.createBulk(
        adminIds,
        NotificationType.REVERSAL_REQUESTED,
        'New Reversal Request',
        `User requested reversal for transfer ${result.senderTxn.referenceId} (₹${result.senderTxn.amount}). Reason: ${reason}`,
        { transactionId: id, referenceId: result.senderTxn.referenceId },
      );
    }

    return {
      message: 'Reversal request submitted successfully. Awaiting admin approval.',
      senderTransaction: result.senderTxn.referenceId,
      status: result.senderTxn.status,
    };
  }

  @Post(':id/approve-reversal')
  @Roles(UserRole.ADMIN)
  async approveReversal(
    @CurrentUser() admin: any,
    @Param('id') id: string,
  ) {
    const result = await this.transactionsService.approveReversal(id, admin.userId);

    // Notify both sender and receiver
    await this.notificationsService.create(
      result.senderTxn.userId,
      NotificationType.REVERSAL_APPROVED,
      'Reversal Approved',
      `Your reversal request for ${result.senderTxn.referenceId} has been approved. ₹${result.senderTxn.amount} has been credited back to your wallet.`,
      { transactionId: result.senderTxn.id },
    );
    await this.notificationsService.create(
      result.receiverTxn.userId,
      NotificationType.REVERSAL_APPROVED,
      'Transfer Reversed',
      `Transfer ${result.receiverTxn.referenceId} (₹${result.receiverTxn.amount}) has been reversed by admin. The amount has been deducted from your wallet.`,
      { transactionId: result.receiverTxn.id },
    );

    return {
      message: 'Reversal approved. Funds have been transferred back.',
      senderBalance: result.senderTxn.balanceAfter,
      receiverBalance: result.receiverTxn.balanceAfter,
    };
  }

  @Post(':id/reject-reversal')
  @Roles(UserRole.ADMIN)
  async rejectReversal(
    @CurrentUser() admin: any,
    @Param('id') id: string,
  ) {
    const txn = await this.transactionsService.rejectReversal(id, admin.userId);

    // Notify the sender
    await this.notificationsService.create(
      txn.userId,
      NotificationType.REVERSAL_REJECTED,
      'Reversal Rejected',
      `Your reversal request for ${txn.referenceId} has been rejected by admin. The transaction remains as successful.`,
      { transactionId: txn.id },
    );

    return {
      message: 'Reversal rejected. Transaction remains as SUCCESS.',
      status: txn.status,
    };
  }
}
