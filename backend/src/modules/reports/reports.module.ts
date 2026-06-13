import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { TransactionsModule } from '../transactions/transactions.module';

// Modulating report generation workflows.
// Depends on TransactionsModule to retrieve and filter histories for file export.
@Module({
  imports: [TransactionsModule],
  controllers: [ReportsController],
})
export class ReportsModule {}
