import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Wallet } from './entities/wallet.entity';
import { DailyLimit } from './entities/daily-limit.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { WalletsService } from './wallets.service';
import { WalletController } from './wallets.controller';
import { UsersModule } from '../users/users.module';
import { RedisModule } from '../redis/redis.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  // Import necessary repositories and modules. We include AnalyticsModule to update daily stats during P2P transfers.
  imports: [
    TypeOrmModule.forFeature([Wallet, Transaction, DailyLimit]),
    UsersModule,
    RedisModule,
    NotificationsModule,
    AnalyticsModule,
  ],
  providers: [WalletsService],
  controllers: [WalletController],
  exports: [WalletsService],
})
export class WalletModule {}
