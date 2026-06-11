import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Wallet } from './entities/wallet.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { WalletsService } from './wallets.service';
import { WalletController } from './wallets.controller';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Wallet, Transaction]),
    UsersModule,
  ],
  providers: [WalletsService],
  controllers: [WalletController],
  exports: [WalletsService],
})
export class WalletModule {}
