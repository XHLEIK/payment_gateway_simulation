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

@Module({
  imports: [
    TypeOrmModule.forFeature([Wallet, Transaction, DailyLimit]),
    UsersModule,
    RedisModule,
    NotificationsModule,
  ],
  providers: [WalletsService],
  controllers: [WalletController],
  exports: [WalletsService],
})
export class WalletModule {}
