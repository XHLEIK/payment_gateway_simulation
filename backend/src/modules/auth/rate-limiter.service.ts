import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { AuditLoggerService } from './audit-logger.service';

@Injectable()
export class RateLimiterService {
  private readonly logger = new Logger(RateLimiterService.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly auditLogger: AuditLoggerService,
  ) {}

  /**
   * Tracks and enforces registration limit: 3 account creations per IP per hour.
   * Throws a 429 Too Many Requests exception if exceeded.
   */
  async checkRegistrationLimit(ip: string): Promise<void> {
    const key = `rate:register:${ip}`;
    const client = this.redisService.getClient();

    // Increment request count
    const current = await client.incr(key);

    if (current === 1) {
      // Set TTL to 1 hour (3600 seconds)
      await client.expire(key, 3600);
    }

    if (current > 3) {
      this.auditLogger.logRegistrationAttempt('unknown', ip, false, 'Rate limit exceeded (3/hr)');
      throw new HttpException(
        'Too many registration attempts. Please try again in an hour.',
        HttpStatus.TOO_MANY_REQUESTS
      );
    }
  }

  /**
   * Tracks and enforces login rate limits:
   * - Max 5 attempts per minute (IP-based and account-based)
   * - Max 20 attempts per hour (IP-based and account-based)
   */
  async checkLoginRateLimit(ip: string, email: string): Promise<void> {
    const minKeyIp = `rate:login:min:${ip}`;
    const hrKeyIp = `rate:login:hr:${ip}`;
    const minKeyEmail = `rate:login:min:${email}`;
    const hrKeyEmail = `rate:login:hr:${email}`;

    const client = this.redisService.getClient();

    // Multi-key checking pipeline to optimize latency
    const pipeline = client.pipeline();
    pipeline.incr(minKeyIp);
    pipeline.incr(hrKeyIp);
    pipeline.incr(minKeyEmail);
    pipeline.incr(hrKeyEmail);
    
    // Set expirations if first increment
    const results = await pipeline.exec();
    if (!results) return;

    // Check outputs
    const minIpVal = results[0][1] as number;
    const hrIpVal = results[1][1] as number;
    const minEmailVal = results[2][1] as number;
    const hrEmailVal = results[3][1] as number;

    const expirePipeline = client.pipeline();
    if (minIpVal === 1) expirePipeline.expire(minKeyIp, 60); // 1 minute
    if (hrIpVal === 1) expirePipeline.expire(hrKeyIp, 3600); // 1 hour
    if (minEmailVal === 1) expirePipeline.expire(minKeyEmail, 60);
    if (hrEmailVal === 1) expirePipeline.expire(hrKeyEmail, 3600);
    await expirePipeline.exec();

    // Check thresholds: 5/min, 20/hr
    if (minIpVal > 5 || minEmailVal > 5) {
      throw new HttpException(
        'Too many login attempts. Please wait 1 minute before retrying.',
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    if (hrIpVal > 20 || hrEmailVal > 20) {
      throw new HttpException(
        'Too many login attempts. Account rate limit exceeded. Please try again in an hour.',
        HttpStatus.TOO_MANY_REQUESTS
      );
    }
  }

  /**
   * Checks if a user or IP is currently in a temporary 15-minute lockout state.
   */
  async isLockedOut(ip: string, email: string): Promise<boolean> {
    const lockKeyIp = `lock:login:${ip}`;
    const lockKeyEmail = `lock:login:${email}`;

    const ipLock = await this.redisService.get(lockKeyIp);
    const emailLock = await this.redisService.get(lockKeyEmail);

    return !!(ipLock || emailLock);
  }

  /**
   * Checks if a CAPTCHA challenge is required for the user.
   * Required after 5 failed login attempts from this IP or for this account.
   */
  async isCaptchaRequired(ip: string, email: string): Promise<boolean> {
    const failIp = await this.getFailedAttemptCount(ip);
    const failEmail = await this.getFailedAttemptCount(email);

    return failIp >= 5 || failEmail >= 5;
  }

  async getFailedCount(ip: string, email: string): Promise<number> {
    const failIp = await this.getFailedAttemptCount(ip);
    const failEmail = await this.getFailedAttemptCount(email);
    return Math.max(failIp, failEmail);
  }

  /**
   * Tracks a failed login attempt. Locks the account or IP if limits are exceeded.
   */
  async recordFailedAttempt(ip: string, email: string): Promise<void> {
    const client = this.redisService.getClient();
    const keyIp = `fail:count:${ip}`;
    const keyEmail = `fail:count:${email}`;

    // Increment counters
    const failIp = await client.incr(keyIp);
    const failEmail = await client.incr(keyEmail);

    // Keep failed attempt windows alive for 24 hours to track long brute force trends
    await client.expire(keyIp, 86400);
    await client.expire(keyEmail, 86400);

    const maxFails = Math.max(failIp, failEmail);

    // Audit log failed login
    let lockUntil: Date | undefined;

    // Lock conditions
    if (maxFails >= 10 && maxFails < 20) {
      // 15-minute temporary lockout
      const lockDuration = 900; // 15 minutes
      lockUntil = new Date(Date.now() + lockDuration * 1000);

      await this.redisService.set(`lock:login:${ip}`, '1', lockDuration);
      await this.redisService.set(`lock:login:${email}`, '1', lockDuration);
    } else if (maxFails >= 20) {
      // Critical security lockout (locks until manual reset / security review)
      const lockDuration = 86400; // 24 hours
      lockUntil = new Date(Date.now() + lockDuration * 1000);

      await this.redisService.set(`lock:login:${ip}`, '1', lockDuration);
      await this.redisService.set(`lock:login:${email}`, '1', lockDuration);

      this.logger.error(`CRITICAL BRUTE FORCE DETECTED: IP ${ip} or Email ${email} has failed login 20+ times!`);
    }

    this.auditLogger.logFailedLogin(email, ip, maxFails, lockUntil);
  }

  /**
   * Resets all login failed attempt counters and lockout flags upon successful login.
   */
  async resetAttempts(ip: string, email: string): Promise<void> {
    const client = this.redisService.getClient();
    const pipeline = client.pipeline();

    pipeline.del(`fail:count:${ip}`);
    pipeline.del(`fail:count:${email}`);
    pipeline.del(`lock:login:${ip}`);
    pipeline.del(`lock:login:${email}`);

    await pipeline.exec();
  }

  /**
   * Helper to retrieve failed attempt count from Redis.
   */
  private async getFailedAttemptCount(identifier: string): Promise<number> {
    const val = await this.redisService.get(`fail:count:${identifier}`);
    return val ? parseInt(val, 10) : 0;
  }
}
