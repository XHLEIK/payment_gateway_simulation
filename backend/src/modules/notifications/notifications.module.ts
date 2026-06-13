import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { RedisModule } from '../redis/redis.module';

// Bundle notifications management here.
// Standard users check their alerts via GET /notifications, and other services
// (like wallets/refunds) inject the exported service to trigger transaction alerts.
@Module({
  imports: [
    // Register typeorm entities for storing persistent notifications
    TypeOrmModule.forFeature([Notification]),
    // Injected so we can utilize Redis pub/sub or caching for real-time notifications
    RedisModule,
  ],
  providers: [NotificationsService],
  controllers: [NotificationsController],
  exports: [NotificationsService],
})
export class NotificationsModule {}

