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

  /**
   * Create a notification and atomically increment Redis unread counter.
   * O(1) write + O(1) Redis INCR.
   */
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

    // Atomic O(1) increment of unread counter in Redis
    try {
      const key = `${this.UNREAD_KEY_PREFIX}:${userId}`;
      const client = this.redisService.getClient();
      await client.incr(key);
    } catch (err) {
      this.logger.warn(`Failed to increment Redis unread counter for user ${userId}`);
    }

    return saved;
  }

  /**
   * Bulk-create notifications for multiple users (e.g., all admins).
   */
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

    // Increment all Redis counters
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

  /**
   * Paginated notification list. Uses priority-queue ordering:
   * unread notifications first (sorted by createdAt DESC),
   * then read notifications (sorted by createdAt DESC).
   */
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

  /**
   * O(1) unread count from Redis with DB fallback.
   */
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

    // Fallback: COUNT(*) query with partial index → still fast
    const count = await this.notificationRepository.count({
      where: { userId, isRead: false },
    });

    // Seed Redis cache for future O(1) lookups
    try {
      const key = `${this.UNREAD_KEY_PREFIX}:${userId}`;
      await this.redisService.set(key, String(count));
    } catch (err) {
      // Non-critical
    }

    return count;
  }

  /**
   * Mark single notification as read. O(1) Redis DECR.
   */
  async markRead(notificationId: string, userId: string): Promise<void> {
    const notification = await this.notificationRepository.findOne({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.isRead) {
      return; // Already read, idempotent
    }

    notification.isRead = true;
    await this.notificationRepository.save(notification);

    // Atomic O(1) decrement
    try {
      const key = `${this.UNREAD_KEY_PREFIX}:${userId}`;
      const client = this.redisService.getClient();
      await client.decr(key);
    } catch (err) {
      this.logger.warn(`Failed to decrement Redis unread counter for user ${userId}`);
    }
  }

  /**
   * Mark all notifications as read. Bulk UPDATE + Redis DEL.
   */
  async markAllRead(userId: string): Promise<void> {
    await this.notificationRepository
      .createQueryBuilder()
      .update(Notification)
      .set({ isRead: true })
      .where('userId = :userId AND isRead = false', { userId })
      .execute();

    // Reset Redis counter to 0
    try {
      const key = `${this.UNREAD_KEY_PREFIX}:${userId}`;
      await this.redisService.set(key, '0');
    } catch (err) {
      this.logger.warn(`Failed to reset Redis unread counter for user ${userId}`);
    }
  }
}
