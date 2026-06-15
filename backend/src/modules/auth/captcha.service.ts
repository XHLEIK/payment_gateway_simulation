import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class CaptchaService {
  private readonly logger = new Logger(CaptchaService.name);
  private readonly secretKey: string;

  constructor(private readonly configService: ConfigService) {
    this.secretKey = this.configService.get<string>('turnstile.secretKey') || '';
  }

  /**
   * Verifies the Turnstile token directly with Cloudflare.
   * @param token The Turnstile response token from the frontend
   * @param remoteIp The client's IP address
   */
  async verifyToken(token: string, remoteIp?: string): Promise<boolean> {
    this.logger.log(`Using CAPTCHA Secret Key: "${this.secretKey}"`);
    if (!token) {
      this.logger.warn('CAPTCHA verification failed: Token is missing');
      return false;
    }

    try {
      const url = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
      
      const params = new URLSearchParams();
      params.append('secret', this.secretKey);
      params.append('response', token);
      if (remoteIp) {
        params.append('remoteip', remoteIp);
      }

      const response = await axios.post(url, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 5000,
      });

      const { success, 'error-codes': errorCodes } = response.data;

      if (!success) {
        this.logger.warn(`CAPTCHA verification failed. Error codes: ${JSON.stringify(errorCodes)}`);
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error('Failed to communicate with Turnstile verification endpoint:', error);
      return false;
    }
  }
}
