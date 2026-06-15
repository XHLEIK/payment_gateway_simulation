import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import configuration from './config/configuration';
import { RedisModule } from './modules/redis/redis.module';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { CsrfMiddleware } from './common/middleware/csrf.middleware';

// Core Business Modules (keeping imports modular and isolated by domains)
import { UsersModule } from './modules/users/users.module';
import { WalletModule } from './modules/wallets/wallets.module';
import { AuthModule } from './modules/auth/auth.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { RefundsModule } from './modules/refunds/refunds.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { ReportsModule } from './modules/reports/reports.module';
import { DisputesModule } from './modules/disputes/disputes.module';
import { NotificationsModule } from './modules/notifications/notifications.module';

import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    // Global configurations using values loaded from configuration.ts
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    
    // Asynchronously connect to PostgreSQL. Reads configs from configuration.ts
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('database.host'),
        port: configService.get<number>('database.port'),
        username: configService.get<string>('database.username'),
        password: configService.get<string>('database.password'),
        database: configService.get<string>('database.name'),
        autoLoadEntities: true,
        // synchronize must be false in production to prevent TypeORM from randomly altering schema structures.
        // We rely on schema.sql or migrations instead.
        synchronize: false, 
        logging: false,
        extra: {
          // Connection pooling is critical for handling high concurrent load
          min: configService.get<number>('database.poolMin', 2),
          max: configService.get<number>('database.poolMax', 10),
        },
      }),
    }),
    
    // Rate limiter module to prevent API abuse (Brute-forcing endpoints)
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100, // Enforce a global limit of 100 requests per minute
      },
    ]),
    
    // Register business logic domains
    RedisModule,
    UsersModule,
    WalletModule,
    AuthModule,
    TransactionsModule,
    RefundsModule,
    PaymentsModule,
    AnalyticsModule,
    ReportsModule,
    DisputesModule,
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Enable the rate-limiting throttler guard globally
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware, CsrfMiddleware).forRoutes('*');
  }
}
