import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AuditLoggerService {
  private readonly logger = new Logger('SecurityAuditLog');

  /**
   * Logs a registration attempt.
   */
  logRegistrationAttempt(email: string, ip: string, success: boolean, reason?: string) {
    const maskedEmail = this.maskEmail(email);
    this.logger.log(
      `[REGISTRATION_ATTEMPT] Email: ${maskedEmail} | IP: ${ip} | Success: ${success}${
        reason ? ` | Reason: ${reason}` : ''
      }`
    );
  }

  /**
   * Logs a login attempt.
   */
  logLoginAttempt(email: string, ip: string, success: boolean, reason?: string) {
    const maskedEmail = this.maskEmail(email);
    this.logger.log(
      `[LOGIN_ATTEMPT] Email: ${maskedEmail} | IP: ${ip} | Success: ${success}${
        reason ? ` | Reason: ${reason}` : ''
      }`
    );
  }

  /**
   * Logs a failed login.
   */
  logFailedLogin(email: string, ip: string, attemptCount: number, lockedUntil?: Date) {
    const maskedEmail = this.maskEmail(email);
    this.logger.warn(
      `[FAILED_LOGIN] Email: ${maskedEmail} | IP: ${ip} | Failed Attempts: ${attemptCount}${
        lockedUntil ? ` | LOCKED_UNTIL: ${lockedUntil.toISOString()}` : ''
      }`
    );
  }

  /**
   * Logs a password reset event.
   */
  logPasswordReset(email: string, ip: string, success: boolean) {
    const maskedEmail = this.maskEmail(email);
    this.logger.log(`[PASSWORD_RESET] Email: ${maskedEmail} | IP: ${ip} | Success: ${success}`);
  }

  /**
   * Logs session creation.
   */
  logSessionCreated(userId: string, sessionId: string, ip: string) {
    const maskedSessionId = this.maskSessionId(sessionId);
    this.logger.log(
      `[SESSION_CREATED] UserID: ${userId} | SessionID: ${maskedSessionId} | IP: ${ip}`
    );
  }

  /**
   * Logs session destruction.
   */
  logSessionDestroyed(userId: string, sessionId: string, reason: string) {
    const maskedSessionId = this.maskSessionId(sessionId);
    this.logger.log(
      `[SESSION_DESTROYED] UserID: ${userId} | SessionID: ${maskedSessionId} | Reason: ${reason}`
    );
  }

  /**
   * Logs a CAPTCHA failure.
   */
  logCaptchaFailure(email: string, ip: string, context: 'login' | 'register') {
    const maskedEmail = this.maskEmail(email);
    this.logger.warn(`[CAPTCHA_FAILURE] Context: ${context} | Email: ${maskedEmail} | IP: ${ip}`);
  }

  /**
   * Helper to mask email address to prevent PII leakage in logs.
   */
  private maskEmail(email: string): string {
    if (!email || !email.includes('@')) return 'unknown';
    const [local, domain] = email.split('@');
    if (local.length <= 2) {
      return `*@${domain}`;
    }
    return `${local.slice(0, 2)}***@${domain}`;
  }

  /**
   * Helper to mask session IDs in logs.
   */
  private maskSessionId(sessionId: string): string {
    if (!sessionId) return 'none';
    if (sessionId.length <= 8) return '********';
    return `${sessionId.slice(0, 4)}...${sessionId.slice(-4)}`;
  }
}
