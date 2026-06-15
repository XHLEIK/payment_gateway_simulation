import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import * as svgCaptcha from 'svg-captcha';
import * as crypto from 'crypto';

@Injectable()
export class CaptchaService {
  private readonly logger = new Logger(CaptchaService.name);

  constructor(private readonly redisService: RedisService) {}

  /**
   * Generates a new classic alphanumeric SVG captcha.
   * Stores the answer in Redis with 5 minutes expiration.
   */
  async generateCaptcha(): Promise<{ captchaId: string; captchaSvg: string }> {
    const captcha = svgCaptcha.create({
      size: 5,
      noise: 3,
      color: false, // Don't use color tags in SVG so CSS can style it cleanly if needed
      background: '#09090b', // match visual design dark theme background
      width: 150,
      height: 50,
      fontSize: 45,
    });

    const captchaId = crypto.randomUUID();
    
    // Store text in uppercase to support case-insensitive comparison
    await this.redisService.set(`captcha:${captchaId}`, captcha.text.toUpperCase(), 300);

    this.logger.log(`Generated CAPTCHA ID ${captchaId} with expected value: ${captcha.text.toUpperCase()}`);

    return {
      captchaId,
      captchaSvg: captcha.data,
    };
  }

  /**
   * Verifies the user's captcha attempt.
   * Evicts the token immediately after check to prevent replay attacks.
   */
  async verifyCaptcha(captchaId: string, captchaValue: string): Promise<boolean> {
    if (!captchaId || !captchaValue) {
      this.logger.warn('CAPTCHA verification failed: captchaId or captchaValue is missing');
      return false;
    }

    const key = `captcha:${captchaId}`;
    const storedValue = await this.redisService.get(key);
    
    // Evict key immediately (one-time use)
    if (storedValue) {
      await this.redisService.del(key);
    }

    if (!storedValue) {
      this.logger.warn(`CAPTCHA verification failed: No captcha found in Redis for ID ${captchaId}`);
      return false;
    }

    const isValid = storedValue === captchaValue.trim().toUpperCase();
    if (!isValid) {
      this.logger.warn(`CAPTCHA verification failed: user input "${captchaValue}" does not match stored value "${storedValue}"`);
    } else {
      this.logger.log(`CAPTCHA verification succeeded for ID ${captchaId}`);
    }

    return isValid;
  }
}
