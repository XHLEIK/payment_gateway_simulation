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

// Reports controller to handle downloading transactions history as CSV file format
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  // Route to download transaction histories as CSV
  // Allows candidates to download their personal transactions,
  // and Admins to pull global transaction data with filters.
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
      limit: 10000, // Hard limit max 10k items for export to prevent server memory bloat
      status,
      from,
      to,
      type,
      minAmount: minAmount ? parseFloat(minAmount as any) : undefined,
      maxAmount: maxAmount ? parseFloat(maxAmount as any) : undefined,
      search,
    };

    // If the requester is not an Administrator, restrict the search results to just their own transactions.
    if (user.role !== UserRole.ADMIN) {
      filters.userId = user.userId;
    }

    const { items } = await this.transactionsService.findAll(filters);

    // CSV header row labels
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

    // Map the Transaction entity instances into flat arrays of strings
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

    // Build the CSV content block. Escape quotes to avoid broken columns when reading in Excel/Google Sheets.
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

    // Return the result directly as a downloadable attachment stream
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=transactions-report-${Date.now()}.csv`,
    );

    return res.status(200).send(csvContent);
  }
}
