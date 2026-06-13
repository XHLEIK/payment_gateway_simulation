import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DailyTransactionStats } from './entities/daily-transaction-stats.entity';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';

@Module({
  // Register the pre-aggregated daily stats table with TypeORM
  imports: [TypeOrmModule.forFeature([DailyTransactionStats])],
  providers: [AnalyticsService],
  controllers: [AnalyticsController],
  exports: [AnalyticsService], // Exported because webhook callback handlers need to update stats upon successful transaction commit
})
export class AnalyticsModule {}
