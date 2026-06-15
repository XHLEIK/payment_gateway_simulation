import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from './entities/transaction.entity';
import { TransactionAudit } from './entities/transaction-audit.entity';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { WalletModule } from '../wallets/wallets.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';

// Transactions module handles all balance transfers, auditing, and query logic.
// We require WalletsModule for balance checks/locking, NotificationsModule for alerts,
// and UsersModule to verify account existence during transfer validation.
@Module({
  imports: [
    // Register the main Transaction and history audit log tables
    TypeOrmModule.forFeature([Transaction, TransactionAudit]),
    WalletModule,
    NotificationsModule,
    UsersModule,
    AuthModule,
  ],
  providers: [TransactionsService],
  controllers: [TransactionsController],
  exports: [TransactionsService],
})
export class TransactionsModule {}

