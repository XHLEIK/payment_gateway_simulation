import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { DailyTransactionStats } from './entities/daily-transaction-stats.entity';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  private readonly CACHE_TTL = 300; // 5 minutes cache TTL

  constructor(
    @InjectRepository(DailyTransactionStats)
    private readonly statsRepository: Repository<DailyTransactionStats>,
    private readonly redisService: RedisService,
  ) {}

  // 1. Update Aggregated Stats inside the active Serializable transaction block
  async updateDailyStats(
    dateStr: string,
    isSuccess: boolean,
    amount: number,
    manager: EntityManager,
  ): Promise<void> {
    const repo = manager.getRepository(DailyTransactionStats);
    
    // Acquire row-level lock or select the stats record
    let stats = await repo.findOne({ where: { date: dateStr } });
    
    if (stats) {
      if (isSuccess) {
        stats.successCount += 1;
        stats.totalVolume = parseFloat((stats.totalVolume + amount).toFixed(2));
      } else {
        stats.failedCount += 1;
      }
      await repo.save(stats);
    } else {
      stats = repo.create({
        date: dateStr,
        successCount: isSuccess ? 1 : 0,
        failedCount: isSuccess ? 0 : 1,
        totalVolume: isSuccess ? amount : 0.0,
      });
      await repo.save(stats);
    }

    // Invalidate Redis cache when stats change
    await this.redisService.del('analytics_summary_weekly');
    await this.redisService.del('analytics_summary_monthly');
  }

  // 2. Query Aggregated Stats with Redis Caching
  async getSummary(period: string = 'weekly'): Promise<any> {
    const cacheKey = `analytics_summary_${period}`;
    const cachedData = await this.redisService.get(cacheKey);

    if (cachedData) {
      this.logger.log(`Analytics summary cache hit for period: ${period}`);
      return JSON.parse(cachedData);
    }

    this.logger.log(`Analytics summary cache miss for period: ${period}. Aggregating from database...`);

    const daysToLoad = period === 'monthly' ? 30 : 7;
    const dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - daysToLoad);
    const dateLimitStr = dateLimit.toISOString().split('T')[0];

    const statsRecords = await this.statsRepository.createQueryBuilder('stats')
      .where('stats.date >= :dateLimitStr', { dateLimitStr })
      .orderBy('stats.date', 'ASC')
      .getMany();

    // Sum up totals
    let totalSuccess = 0;
    let totalFailed = 0;
    let totalVolume = 0;
    const dailyVolumeChart: { date: string; volume: number; successCount: number; failedCount: number }[] = [];

    statsRecords.forEach((record) => {
      totalSuccess += record.successCount;
      totalFailed += record.failedCount;
      totalVolume += record.totalVolume;
      dailyVolumeChart.push({
        date: record.date,
        volume: record.totalVolume,
        successCount: record.successCount,
        failedCount: record.failedCount,
      });
    });

    const totalTransactions = totalSuccess + totalFailed;
    const successRate = totalTransactions > 0 ? (totalSuccess / totalTransactions) * 100 : 100;

    const summary = {
      totalSuccess,
      totalFailed,
      totalVolume: parseFloat(totalVolume.toFixed(2)),
      successRate: parseFloat(successRate.toFixed(2)),
      dailyVolumeChart,
    };

    // Cache results for 5 minutes
    await this.redisService.set(cacheKey, JSON.stringify(summary), this.CACHE_TTL);

    return summary;
  }
}
