import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Refund } from './entities/refund.entity';
import { RefundsService } from './refunds.service';
import { RefundsController } from './refunds.controller';
import { TransactionsModule } from '../transactions/transactions.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  // Import repositories and modules. We include AnalyticsModule to record daily stats on approved refund actions.
  imports: [
    TypeOrmModule.forFeature([Refund]),
    TransactionsModule,
    NotificationsModule,
    AnalyticsModule,
  ],
  providers: [RefundsService],
  controllers: [RefundsController],
  exports: [RefundsService],
})
export class RefundsModule {}
