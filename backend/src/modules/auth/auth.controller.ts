import { Controller, Post, Get, Body, UseGuards, Req, Res, Query, HttpStatus, HttpCode } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RateLimiterService } from './rate-limiter.service';
import { Throttle } from '@nestjs/throttler';
import { CaptchaService } from './captcha.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { CreateAdminDto } from './dto/create-admin.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly rateLimiterService: RateLimiterService,
    private readonly captchaService: CaptchaService,
  ) {}

  /**
   * Helper to extract client IP address accurately.
   */
  private getClientIp(req: any): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      return (typeof forwarded === 'string' ? forwarded : forwarded[0]).split(',')[0].trim();
    }
    return req.ip || '127.0.0.1';
  }

  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    const ip = this.getClientIp(req);
    const result = await this.authService.register(dto, ip);

    // Set HTTP-Only session cookie
    res.cookie('regilly_session', result.session.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      expires: result.session.expiresAt,
    });

    return {
      user: result.user,
      csrfToken: result.session.csrfToken,
      access_token: result.session.id, // Support E2E tests and Bearer token client compatibility
    };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 100, ttl: 60000 } }) // Allow custom Redis-backed RateLimiterService to enforce the actual, granular limits
  async login(
    @Body() dto: LoginDto,
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    const ip = this.getClientIp(req);
    const userAgent = req.headers['user-agent'] || 'unknown';
    const result = await this.authService.login(dto, ip, userAgent);

    // Set HTTP-Only session cookie
    res.cookie('regilly_session', result.session.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      expires: result.session.expiresAt,
    });

    return {
      user: result.user,
      csrfToken: result.session.csrfToken,
      access_token: result.session.id, // Support E2E tests and Bearer token client compatibility
    };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    const sessionId = req.cookies ? req.cookies['regilly_session'] : null;
    await this.authService.logout(sessionId, req.user.id);

    // Clear HTTP-Only session cookie
    res.clearCookie('regilly_session', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
    });

    return { success: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Req() req: any) {
    const user = await this.authService.validateUserById(req.user.id);
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      csrfToken: req.session ? req.session.csrf_token : null,
    };
  }

  @Get('csrf')
  async getCsrf(
    @Req() req: any,
    @Res() res: any,
  ) {
    const sessionId = req.cookies ? req.cookies['regilly_session'] : null;
    if (!sessionId) {
      return res.status(HttpStatus.OK).json({ csrfToken: null });
    }

    const sessionStr = await this.rateLimiterService['redisService'].get(`session:${sessionId}`);
    if (!sessionStr) {
      return res.status(HttpStatus.OK).json({ csrfToken: null });
    }

    try {
      const session = JSON.parse(sessionStr);
      return res.status(HttpStatus.OK).json({ csrfToken: session.csrf_token });
    } catch (e) {
      return res.status(HttpStatus.OK).json({ csrfToken: null });
    }
  }

  @Get('captcha-required')
  async checkCaptchaRequired(
    @Query('email') email: string,
    @Req() req: any,
  ) {
    const ip = this.getClientIp(req);
    const failCount = await this.rateLimiterService.getFailedCount(ip, email || '');
    return {
      captchaRequired: failCount >= 5,
      captchaShown: failCount >= 3,
    };
  }

  @Get('captcha')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async getCaptcha() {
    return this.captchaService.generateCaptcha();
  }

  @Post('create-admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async createAdmin(
    @Body() dto: CreateAdminDto,
    @Req() req: any,
  ) {
    const ip = this.getClientIp(req);
    return this.authService.createAdmin(dto, req.user.id, ip);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @Req() req: any,
  ) {
    const ip = this.getClientIp(req);
    let currentSessionId = req.cookies ? req.cookies['regilly_session'] : null;
    if (!currentSessionId && req.headers.authorization) {
      const parts = req.headers.authorization.split(' ');
      if (parts[0] === 'Bearer' && parts[1]) {
        currentSessionId = parts[1];
      }
    }
    return this.authService.changePassword(req.user.id, dto, ip, currentSessionId);
  }
}
