import { Injectable, NestMiddleware, ForbiddenException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { RedisService } from '../../modules/redis/redis.service';

@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  constructor(private readonly redisService: RedisService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const method = req.method;

    // 1. Skip CSRF validation for safe HTTP methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      return next();
    }

    // 2. Skip CSRF validation for public/webhook endpoints
    const path = req.path || '';
    if (
      path.endsWith('/auth/login') ||
      path.endsWith('/auth/register') ||
      path.includes('/payments/webhook') // Webhooks are authenticated via HMAC timing-safe verify
    ) {
      return next();
    }

    // 3. Extract session ID from cookie
    const sessionId = req.cookies ? req.cookies['regilly_session'] : null;
    if (!sessionId) {
      // Unauthenticated state-changing requests will be blocked by AuthGuards anyway,
      // but let's allow it to pass to the guard for correct 401 response instead of 403.
      return next();
    }

    // 4. Retrieve session from Redis
    const sessionStr = await this.redisService.get(`session:${sessionId}`);
    if (!sessionStr) {
      // Expired or invalid session
      return next();
    }

    let session: any;
    try {
      session = JSON.parse(sessionStr);
    } catch (e) {
      return next();
    }

    // 5. Verify the CSRF token
    const clientCsrfToken =
      req.headers['x-csrf-token'] || req.headers['x-xsrf-token'] || (req.body && req.body._csrf);
      
    if (!clientCsrfToken || clientCsrfToken !== session.csrf_token) {
      throw new ForbiddenException('Invalid or missing CSRF token');
    }

    next();
  }
}
