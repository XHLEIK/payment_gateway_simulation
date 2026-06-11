import {
  Controller,
  Get,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { TransactionsService } from '../transactions/transactions.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';
import { TransactionStatus, TransactionType } from '../transactions/entities/transaction.entity';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get('download')
  async downloadCsv(
    @CurrentUser() user: any,
    @Res() res: any,
    @Query('status') status?: TransactionStatus,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('type') type?: TransactionType,
    @Query('minAmount') minAmount?: number,
    @Query('maxAmount') maxAmount?: number,
    @Query('search') search?: string,
    @Query('format') format?: string,
  ) {
    const filters: any = {
      page: 1,
      limit: 10000,
      status,
      from,
      to,
      type,
      minAmount: minAmount ? parseFloat(minAmount as any) : undefined,
      maxAmount: maxAmount ? parseFloat(maxAmount as any) : undefined,
      search,
    };

    if (user.role !== UserRole.ADMIN) {
      filters.userId = user.userId;
    }

    const { items } = await this.transactionsService.findAll(filters);

    const headers = [
      'Date',
      'Reference ID',
      'User Name',
      'User Email',
      'Transaction Type',
      'Amount (INR)',
      'Status',
      'Gateway Order ID',
      'Gateway Payment ID',
    ];

    const rows = items.map((item) => [
      item.createdAt.toISOString(),
      item.referenceId,
      item.user?.name || 'N/A',
      item.user?.email || 'N/A',
      item.type,
      item.amount.toString(),
      item.status,
      item.gatewayOrderId || 'N/A',
      item.gatewayPaymentId || 'N/A',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) =>
        row
          .map((val) => {
            const escaped = val.replace(/"/g, '""');
            return `"${escaped}"`;
          })
          .join(','),
      ),
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=transactions-report-${Date.now()}.csv`,
    );

    return res.status(200).send(csvContent);
  }
}
