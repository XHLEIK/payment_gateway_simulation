import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../../modules/users/users.service';
import { RedisService } from '../../modules/redis/redis.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly usersService: UsersService,
    private readonly redisService: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    // 1. Extract session ID from cookie or Authorization bearer header as fallback
    let sessionId = request.cookies ? request.cookies['regilly_session'] : null;

    if (!sessionId && request.headers.authorization) {
      const parts = request.headers.authorization.split(' ');
      if (parts[0] === 'Bearer' && parts[1]) {
        sessionId = parts[1];
      }
    }

    if (!sessionId) {
      throw new UnauthorizedException('No active session found. Please log in.');
    }

    // 2. Fetch session from Redis
    const sessionStr = await this.redisService.get(`session:${sessionId}`);
    if (!sessionStr) {
      throw new UnauthorizedException('Session expired or invalid. Please log in.');
    }

    let session: any;
    try {
      session = JSON.parse(sessionStr);
    } catch (err) {
      throw new UnauthorizedException('Malformed session payload');
    }

    // 3. Check session expiration
    const now = new Date();
    const expiresAt = new Date(session.expires_at);
    if (now > expiresAt) {
      await this.redisService.del(`session:${sessionId}`);
      throw new UnauthorizedException('Session expired. Please log in.');
    }

    // 4. Validate user profile is still active and valid in Postgres DB
    const user = await this.usersService.findById(session.user_id);
    if (!user) {
      await this.redisService.del(`session:${sessionId}`);
      throw new UnauthorizedException('User profile no longer exists');
    }

    // 5. Update session last_activity and slide expiration (rolling session window)
    const newExpiresAt = new Date(Date.now() + 86400 * 1000); // 24 hours from now
    session.last_activity = now.toISOString();
    session.expires_at = newExpiresAt.toISOString();

    await this.redisService.set(`session:${sessionId}`, JSON.stringify(session), 86400);

    // Update cookie expiration on response to keep it in sync
    if (request.cookies && request.cookies['regilly_session']) {
      response.cookie('regilly_session', sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        expires: newExpiresAt,
      });
    }

    // 6. Inject the user into the request context (compatibility with @CurrentUser and RolesGuard)
    request.user = {
      id: user.id,
      userId: user.id, // Backward compatibility: some controllers reference id, others reference userId
      name: user.name,
      email: user.email,
      role: user.role,
    };
    
    // Inject the active session data for rotation/CSRF purposes
    request.session = session;

    return true;
  }
}
