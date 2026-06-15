import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule } from '@nestjs/config';
import { UsersModule } from '../users/users.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { CaptchaService } from './captcha.service';
import { PasswordSecurityService } from './password-security.service';
import { RateLimiterService } from './rate-limiter.service';
import { AuditLoggerService } from './audit-logger.service';
import { BotDetectionService } from './bot-detection.service';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    ConfigModule,
  ],
  providers: [
    AuthService,
    CaptchaService,
    PasswordSecurityService,
    RateLimiterService,
    AuditLoggerService,
    BotDetectionService,
  ],
  controllers: [AuthController],
  exports: [
    AuthService,
    CaptchaService,
    PasswordSecurityService,
    RateLimiterService,
    AuditLoggerService,
    BotDetectionService,
  ],
})
export class AuthModule {}
