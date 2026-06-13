import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { TransactionsModule } from '../transactions/transactions.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { PaymentRequest } from './entities/payment-request.entity';
import { UsersModule } from '../users/users.module';
import { WalletModule } from '../wallets/wallets.module';

@Module({
  // Import payment requests repository and business logic dependencies
  imports: [
    TypeOrmModule.forFeature([PaymentRequest]),
    TransactionsModule,
    AnalyticsModule,
    UsersModule,
    WalletModule,
  ],
  providers: [PaymentsService],
  controllers: [PaymentsController],
  exports: [PaymentsService],
})
export class PaymentsModule {}
