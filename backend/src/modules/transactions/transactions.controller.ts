import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';
import { TransactionStatus, TransactionType } from './entities/transaction.entity';

@Controller('transactions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

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
}

// Quick custom inline definition of ForbiddenException to ensure imports compile
import { ForbiddenException } from '@nestjs/common';
