import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from './entities/transaction.entity';
import { TransactionAudit } from './entities/transaction-audit.entity';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { WalletModule } from '../wallets/wallets.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, TransactionAudit]),
    WalletModule,
  ],
  providers: [TransactionsService],
  controllers: [TransactionsController],
  exports: [TransactionsService],
})
export class TransactionsModule {}
