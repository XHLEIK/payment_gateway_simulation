import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationType } from './entities/notification.entity';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly UNREAD_KEY_PREFIX = 'notif_unread';

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    private readonly redisService: RedisService,
  ) {}

  // Create a single notification row and increment the Redis unread counter atomically
  async create(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    metadata?: Record<string, any>,
  ): Promise<Notification> {
    const notification = this.notificationRepository.create({
      userId,
      type,
      title,
      message,
      isRead: false,
      metadata: metadata || null,
    });

    const saved = await this.notificationRepository.save(notification);

    // Keep the Redis unread cache counter updated in O(1) time
    try {
      const key = `${this.UNREAD_KEY_PREFIX}:${userId}`;
      const client = this.redisService.getClient();
      await client.incr(key);
    } catch (err) {
      this.logger.warn(`Failed to increment Redis unread counter for user ${userId}`);
    }

    return saved;
  }

  // Bulk-create notifications (e.g. notifying all administrators when a P2P transfer reversal is claimed)
  async createBulk(
    userIds: string[],
    type: NotificationType,
    title: string,
    message: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    const notifications = userIds.map((userId) =>
      this.notificationRepository.create({
        userId,
        type,
        title,
        message,
        isRead: false,
        metadata: metadata || null,
      }),
    );

    await this.notificationRepository.save(notifications);

    // Update all users' unread counts in Redis in a single pipeline execution
    try {
      const client = this.redisService.getClient();
      const pipeline = client.pipeline();
      userIds.forEach((userId) => {
        pipeline.incr(`${this.UNREAD_KEY_PREFIX}:${userId}`);
      });
      await pipeline.exec();
    } catch (err) {
      this.logger.warn('Failed to bulk increment Redis unread counters');
    }
  }

  // Fetch paginated notification feed. Displays unread notifications first, then older read items.
  async findAll(userId: string, page: number = 1, limit: number = 20) {
    const offset = (page - 1) * limit;

    const [items, total] = await this.notificationRepository
      .createQueryBuilder('n')
      .where('n.userId = :userId', { userId })
      .orderBy('n.isRead', 'ASC') // false (unread) first
      .addOrderBy('n.createdAt', 'DESC')
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // O(1) lookup of unread count from Redis. Falls back to SQL count if cache is cold.
  async getUnreadCount(userId: string): Promise<number> {
    try {
      const key = `${this.UNREAD_KEY_PREFIX}:${userId}`;
      const cached = await this.redisService.get(key);
      if (cached !== null) {
        const count = parseInt(cached, 10);
        return isNaN(count) ? 0 : Math.max(0, count);
      }
    } catch (err) {
      this.logger.warn(`Redis unread count miss for user ${userId}, falling back to DB`);
    }

    // Database count fallback. Uses partial index on 'isRead = false' for performance.
    const count = await this.notificationRepository.count({
      where: { userId, isRead: false },
    });

    // Seed back to Redis so next read is O(1)
    try {
      const key = `${this.UNREAD_KEY_PREFIX}:${userId}`;
      await this.redisService.set(key, String(count));
    } catch (err) {
      // Non-critical
    }

    return count;
  }

  // Marks a single notification as read and decrements the Redis unread count
  async markRead(notificationId: string, userId: string): Promise<void> {
    const notification = await this.notificationRepository.findOne({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.isRead) {
      return; // Already marked read, do nothing
    }

    notification.isRead = true;
    await this.notificationRepository.save(notification);

    // Decr the unread counter in Redis
    try {
      const key = `${this.UNREAD_KEY_PREFIX}:${userId}`;
      const client = this.redisService.getClient();
      await client.decr(key);
    } catch (err) {
      this.logger.warn(`Failed to decrement Redis unread counter for user ${userId}`);
    }
  }

  // Marks all unread notifications as read.
  async markAllRead(userId: string): Promise<void> {
    await this.notificationRepository
      .createQueryBuilder()
      .update(Notification)
      .set({ isRead: true })
      .where('userId = :userId AND isRead = false', { userId })
      .execute();

    // Reset Redis unread cache counter back to 0
    try {
      const key = `${this.UNREAD_KEY_PREFIX}:${userId}`;
      await this.redisService.set(key, '0');
    } catch (err) {
      this.logger.warn(`Failed to reset Redis unread counter for user ${userId}`);
    }
  }
}
