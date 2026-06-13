import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

// Redis service wrapping the ioredis library. Handles key caching, token blacklists,
// and state storage. Integrates into NestJS lifecycle hooks (OnModuleInit, OnModuleDestroy)
// to automatically close database sockets when the Nest server shuts down.
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis;
  private readonly logger = new Logger(RedisService.name);

  constructor(private readonly configService: ConfigService) {}

  // Triggered automatically during NestJS application bootstrap phase
  onModuleInit() {
    const host = this.configService.get<string>('redis.host', '127.0.0.1');
    const port = this.configService.get<number>('redis.port', 6379);
    const password = this.configService.get<string>('redis.password');

    this.logger.log(`Initializing Redis client connecting to ${host}:${port}`);

    // Create client instance. Disable maxRetriesPerRequest to support bull queues if needed later.
    this.client = new Redis({
      host,
      port,
      password,
      maxRetriesPerRequest: null,
      // Implement back-off retry logic if Redis goes down momentarily
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    this.client.on('connect', () => {
      this.logger.log('Redis connected successfully.');
    });

    this.client.on('error', (err) => {
      this.logger.error('Redis connection error:', err);
    });
  }

  // Triggered during NestJS shutdown phase (e.g. server restarts, SIGTERM)
  async onModuleDestroy() {
    if (this.client) {
      this.logger.log('Closing Redis connection...');
      await this.client.quit();
    }
  }

  // Raw getter in case we need direct access to ioredis features (like pipelines, multi/exec)
  getClient(): Redis {
    return this.client;
  }

  // Fetch cached value. Handles Redis failure gracefully to avoid crashing the caller service.
  async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch (err) {
      this.logger.error(`Failed to GET key ${key} from Redis:`, err);
      return null; // Return null so the calling route can fallback to Postgres (resilient caching)
    }
  }

  // Cache a value in Redis with optional TTL (Time To Live in seconds)
  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    try {
      if (ttlSeconds) {
        await this.client.set(key, value, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, value);
      }
    } catch (err) {
      this.logger.error(`Failed to SET key ${key} in Redis:`, err);
    }
  }

  // Evict cache key
  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (err) {
      this.logger.error(`Failed to DEL key ${key} from Redis:`, err);
    }
  }
}
