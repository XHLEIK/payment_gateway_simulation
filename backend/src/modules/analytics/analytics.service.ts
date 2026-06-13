import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { DailyTransactionStats } from './entities/daily-transaction-stats.entity';
import { RedisService } from '../redis/redis.service';
import { TransactionType } from '../transactions/entities/transaction.entity';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  private readonly CACHE_TTL = 300; // Cache stats summaries in Redis for 5 minutes

  constructor(
    @InjectRepository(DailyTransactionStats)
    private readonly statsRepository: Repository<DailyTransactionStats>,
    private readonly redisService: RedisService,
  ) {}

  // Atomic update of pre-aggregated daily stats. Runs inside the active serializable transaction.
  async updateDailyStats(
    dateStr: string,
    isSuccess: boolean,
    amount: number,
    type: TransactionType,
    manager: EntityManager,
  ): Promise<void> {
    const repo = manager.getRepository(DailyTransactionStats);
    
    // Attempt to find today's stats row
    let stats = await repo.findOne({ where: { date: dateStr } });
    
    if (stats) {
      if (isSuccess) {
        stats.successCount += 1;
        stats.totalVolume = parseFloat((stats.totalVolume + amount).toFixed(2));
        
        // Categorize transaction type to update separate telemetry counts
        if (type === TransactionType.TRANSFER) {
          stats.transferCount += 1;
        } else if (type === TransactionType.REFUND) {
          stats.refundCount += 1;
        } else {
          stats.paymentCount += 1;
        }
      } else {
        stats.failedCount += 1;
      }
      await repo.save(stats);
    } else {
      // Row doesn't exist yet for today, create a new record
      stats = repo.create({
        date: dateStr,
        successCount: isSuccess ? 1 : 0,
        failedCount: isSuccess ? 0 : 1,
        totalVolume: isSuccess ? amount : 0.0,
        transferCount: (isSuccess && type === TransactionType.TRANSFER) ? 1 : 0,
        refundCount: (isSuccess && type === TransactionType.REFUND) ? 1 : 0,
        paymentCount: (isSuccess && type !== TransactionType.TRANSFER && type !== TransactionType.REFUND) ? 1 : 0,
      });
      await repo.save(stats);
    }

    // Invalidate Redis dashboard cache keys since stats have changed
    await this.redisService.del('analytics_summary_weekly');
    await this.redisService.del('analytics_summary_monthly');
  }

  // Returns weekly or monthly aggregated statistics. Uses Redis cache to shield PostgreSQL.
  async getSummary(period: string = 'weekly'): Promise<any> {
    const cacheKey = `analytics_summary_${period}`;
    const cachedData = await this.redisService.get(cacheKey);

    if (cachedData) {
      this.logger.log(`Analytics summary cache hit for period: ${period}`);
      return JSON.parse(cachedData);
    }

    this.logger.log(`Analytics summary cache miss for period: ${period}. Fetching from database...`);

    const daysToLoad = period === 'monthly' ? 30 : 7;
    const dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - daysToLoad);
    const dateLimitStr = dateLimit.toISOString().split('T')[0];

    // Load records within the specified time window
    const statsRecords = await this.statsRepository.createQueryBuilder('stats')
      .where('stats.date >= :dateLimitStr', { dateLimitStr })
      .orderBy('stats.date', 'ASC')
      .getMany();

    // Sum up totals across all loaded days
    let totalSuccess = 0;
    let totalFailed = 0;
    let totalVolume = 0;
    let totalTransfers = 0;
    let totalRefunds = 0;
    let totalPayments = 0;
    const dailyVolumeChart: any[] = [];

    statsRecords.forEach((record) => {
      totalSuccess += record.successCount;
      totalFailed += record.failedCount;
      totalVolume += record.totalVolume;
      totalTransfers += record.transferCount;
      totalRefunds += record.refundCount;
      totalPayments += record.paymentCount;
      
      dailyVolumeChart.push({
        date: record.date,
        volume: record.totalVolume,
        successCount: record.successCount,
        failedCount: record.failedCount,
        transferCount: record.transferCount,
        refundCount: record.refundCount,
        paymentCount: record.paymentCount,
      });
    });

    const totalTransactions = totalSuccess + totalFailed;
    const successRate = totalTransactions > 0 ? (totalSuccess / totalTransactions) * 100 : 100;

    const summary = {
      totalSuccess,
      totalFailed,
      totalVolume: parseFloat(totalVolume.toFixed(2)),
      successRate: parseFloat(successRate.toFixed(2)),
      totalTransfers,
      totalRefunds,
      totalPayments,
      dailyVolumeChart,
    };

    // Cache the aggregated summary in Redis so subsequent dashboard loads are instant
    await this.redisService.set(cacheKey, JSON.stringify(summary), this.CACHE_TTL);

    return summary;
  }
}
