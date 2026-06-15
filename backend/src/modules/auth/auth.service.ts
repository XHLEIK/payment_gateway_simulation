import { Injectable, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { CreateAdminDto } from './dto/create-admin.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { PasswordSecurityService } from './password-security.service';
import { CaptchaService } from './captcha.service';
import { RateLimiterService } from './rate-limiter.service';
import { AuditLoggerService } from './audit-logger.service';
import { RedisService } from '../redis/redis.service';
import { UserRole } from '../users/entities/user.entity';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly passwordSecurityService: PasswordSecurityService,
    private readonly captchaService: CaptchaService,
    private readonly rateLimiterService: RateLimiterService,
    private readonly auditLogger: AuditLoggerService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Registers a new user with CAPTCHA check and password security validation.
   */
  async register(dto: RegisterDto, ip: string) {
    this.auditLogger.logRegistrationAttempt(dto.email, ip, true);

    // 1. Enforce IP-based rate limiting (Max 3 creations per hour)
    await this.rateLimiterService.checkRegistrationLimit(ip);

    // 2. Mandatory CAPTCHA validation
    const isCaptchaValid = await this.captchaService.verifyCaptcha(dto.captchaId, dto.captchaValue);
    if (!isCaptchaValid) {
      this.auditLogger.logCaptchaFailure(dto.email, ip, 'register');
      throw new BadRequestException('CAPTCHA verification failed. Please try again.');
    }

    // 3. Confirm password validation
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    // 4. Enforce strong password guidelines
    this.passwordSecurityService.validatePassword(dto.password);

    // Hash the password and save
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(dto.password, salt);

    const user = await this.usersService.create(dto.name, dto.email, passwordHash, UserRole.USER);

    // Create session for the newly registered user
    const sessionData = await this.createSession(user.id, ip, 'User Registration Agent');
    return {
      session: sessionData,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }

  /**
   * Authenticates a user, checking failed login counters, locks, rate limits, and CAPTCHAs.
   */
  async login(dto: LoginDto, ip: string, userAgent: string) {
    this.auditLogger.logLoginAttempt(dto.email, ip, true);

    // 1. Enforce general login rate limiting (5 attempts/min, 20 attempts/hr)
    await this.rateLimiterService.checkLoginRateLimit(ip, dto.email);

    // 2. Check for active temporary lockout (10 failed attempts -> 15 min lock)
    const locked = await this.rateLimiterService.isLockedOut(ip, dto.email);
    if (locked) {
      this.auditLogger.logFailedLogin(dto.email, ip, 10, new Date(Date.now() + 15 * 60 * 1000));
      throw new UnauthorizedException('Account temporarily locked due to excessive failed attempts. Please try again later.');
    }

    // 3. Mandatory CAPTCHA validation (bypassed in test environment)
    if (process.env.NODE_ENV !== 'test') {
      if (!dto.captchaId || !dto.captchaValue) {
        throw new BadRequestException('CAPTCHA verification is required');
      }
      const isCaptchaValid = await this.captchaService.verifyCaptcha(dto.captchaId, dto.captchaValue);
      if (!isCaptchaValid) {
        this.auditLogger.logCaptchaFailure(dto.email, ip, 'login');
        throw new BadRequestException('CAPTCHA verification failed. Please try again.');
      }
    }

    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      await this.rateLimiterService.recordFailedAttempt(ip, dto.email);
      throw new UnauthorizedException('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isMatch) {
      await this.rateLimiterService.recordFailedAttempt(ip, dto.email);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Successful Login: Reset attempts counters
    await this.rateLimiterService.resetAttempts(ip, dto.email);

    // Generate session
    const sessionData = await this.createSession(user.id, ip, userAgent);

    return {
      session: sessionData,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }

  /**
   * Destroys an active session.
   */
  async logout(sessionId: string, userId: string) {
    if (sessionId) {
      await this.redisService.del(`session:${sessionId}`);
      this.auditLogger.logSessionDestroyed(userId, sessionId, 'User manual logout');
    }
  }

  /**
   * Generates a new secure session and CSRF token and saves it to Redis.
   */
  async createSession(userId: string, ip: string, userAgent: string) {
    // Generate secure session ID
    const sessionId = crypto.randomBytes(32).toString('hex');
    
    // Generate secure CSRF token
    const csrfToken = crypto.randomBytes(32).toString('hex');

    const now = new Date();
    const expiresAt = new Date(Date.now() + 86400 * 1000); // 24 hours TTL

    const sessionPayload = {
      session_id: sessionId,
      user_id: userId,
      csrf_token: csrfToken,
      created_at: now.toISOString(),
      last_activity: now.toISOString(),
      ip_address: ip,
      user_agent: userAgent,
      expires_at: expiresAt.toISOString(),
    };

    // Save session in Redis with 24 hours TTL (86400 seconds)
    await this.redisService.set(`session:${sessionId}`, JSON.stringify(sessionPayload), 86400);

    this.auditLogger.logSessionCreated(userId, sessionId, ip);

    return {
      id: sessionId,
      csrfToken: csrfToken,
      expiresAt: expiresAt,
    };
  }

  /**
   * Rotates a session (creates a new session ID and CSRF token, destroying the old one).
   */
  async rotateSession(oldSessionId: string, userId: string, ip: string, userAgent: string) {
    if (oldSessionId) {
      await this.redisService.del(`session:${oldSessionId}`);
      this.auditLogger.logSessionDestroyed(userId, oldSessionId, 'Session rotated');
    }
    return this.createSession(userId, ip, userAgent);
  }

  async validateUserById(id: string) {
    return this.usersService.findById(id);
  }

  /**
   * Registers a new administrator. Accessible only by authorized administrators.
   */
  async createAdmin(dto: CreateAdminDto, creatorId: string, ip: string) {
    try {
      // 1. Confirm password validation
      if (dto.password !== dto.confirmPassword) {
        throw new BadRequestException('Passwords do not match');
      }

      // 2. Enforce strong password guidelines
      this.passwordSecurityService.validatePassword(dto.password);

      // Hash the password
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(dto.password, salt);

      // Create admin account
      const user = await this.usersService.create(dto.name, dto.email, passwordHash, UserRole.ADMIN);

      this.auditLogger.logAdminCreation(dto.email, creatorId, ip, true);

      return {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      };
    } catch (err: any) {
      this.auditLogger.logAdminCreation(dto.email, creatorId, ip, false, err.message);
      throw err;
    }
  }

  /**
   * Securely modifies the authenticated user's password.
   * Invalidates other active user sessions upon completion.
   */
  async changePassword(userId: string, dto: ChangePasswordDto, ip: string, currentSessionId?: string) {
    try {
      // 1. Fetch user record
      const user = await this.usersService.findById(userId);

      // 2. Verify current password
      const isMatch = await bcrypt.compare(dto.currentPassword, user.passwordHash);
      if (!isMatch) {
        throw new BadRequestException('Incorrect current password');
      }

      // 3. Confirm new password matching
      if (dto.newPassword !== dto.confirmNewPassword) {
        throw new BadRequestException('New passwords do not match');
      }

      // 4. Verify password complexity/strength
      this.passwordSecurityService.validatePassword(dto.newPassword);

      // 5. Prevent reuse of current password
      const isReuse = await bcrypt.compare(dto.newPassword, user.passwordHash);
      if (isReuse) {
        throw new BadRequestException('New password cannot be the same as your current password');
      }

      // 6. Hash new password
      const salt = await bcrypt.genSalt(10);
      user.passwordHash = await bcrypt.hash(dto.newPassword, salt);
      await this.usersService['userRepository'].save(user);

      // 7. Invalidate other sessions
      await this.invalidateUserSessions(userId, currentSessionId);

      this.auditLogger.logPasswordChange(userId, ip, true);
      return { success: true };
    } catch (err: any) {
      this.auditLogger.logPasswordChange(userId, ip, false, err.message);
      throw err;
    }
  }

  /**
   * Helper to invalidate all other active sessions of the user from Redis.
   */
  async invalidateUserSessions(userId: string, currentSessionId?: string) {
    const client = this.redisService.getClient();
    const keys = await client.keys('session:*');
    if (keys.length === 0) return;

    for (const key of keys) {
      const sessionId = key.split(':')[1];
      if (sessionId === currentSessionId) {
        continue;
      }
      const val = await client.get(key);
      if (val) {
        try {
          const session = JSON.parse(val);
          if (session.user_id === userId) {
            await client.del(key);
            this.auditLogger.logSessionDestroyed(userId, sessionId, 'Force session eviction (password changed)');
          }
        } catch (e) {
          // ignore
        }
      }
    }
  }
}
