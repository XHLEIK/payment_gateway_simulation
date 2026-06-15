import { Injectable, BadRequestException } from '@nestjs/common';

@Injectable()
export class PasswordSecurityService {
  // Static list of top 100 most common/leaked passwords
  private readonly commonPasswords = new Set([
    '123456', 'password', '123456789', '12345678', '12345', 'qwerty', '1234567', 
    'google', 'letmein1', 'password123', 'admin', 'admin123', 'welcome', 'superman',
    'football', 'iloveyou', 'secret', 'monkey', '123123', 'computer', 'keyboard',
    'shadow', 'dragon', 'killer', 'wizard', 'master', 'hunter', 'cookie', 'butter',
    'coffee', 'boston', 'orange', 'yellow', 'purple', 'silver', 'golden', 'spring',
    'summer', 'winter', 'autumn', 'soccer', 'tennis', 'hockey', 'boxing', 'runner',
    'active', 'secure', 'system', 'subham', 'regilly', 'payment', 'gateway', 'wallet',
    'Subham@1234', 'Subham1234', 'user123', 'admin1234', 'password@123', 'pass@123'
  ]);

  /**
   * Validates a password against ASVS requirements.
   * Throws a BadRequestException with a clear message if checks fail.
   */
  validatePassword(password: string): void {
    if (!password) {
      throw new BadRequestException('Password is required');
    }

    // 1. Length check: Minimum 12 characters
    if (password.length < 12) {
      throw new BadRequestException('Password must be at least 12 characters long');
    }

    // 2. Complexity checks
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);

    if (!hasUppercase || !hasLowercase || !hasNumber || !hasSpecial) {
      throw new BadRequestException(
        'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
      );
    }

    // 3. Prevent common / leaked passwords
    const lowerPassword = password.toLowerCase();
    if (this.commonPasswords.has(password) || this.commonPasswords.has(lowerPassword)) {
      throw new BadRequestException('The password chosen is too common and easily guessable');
    }

    // 4. Prevent sequential/repetitive character patterns (e.g. '12345', 'abcde', 'aaaaa')
    if (this.hasSequentialPatterns(lowerPassword)) {
      throw new BadRequestException('Password cannot contain sequential or highly repetitive patterns');
    }
  }

  /**
   * Helper to check for sequential alphanumeric series of length 4 or more,
   * or repeated single character runs of length 4 or more.
   */
  private hasSequentialPatterns(password: string): boolean {
    // Check for repetitive characters like 'aaaa'
    for (let i = 0; i < password.length - 3; i++) {
      if (
        password[i] === password[i + 1] &&
        password[i] === password[i + 2] &&
        password[i] === password[i + 3]
      ) {
        return true;
      }
    }

    // Check for sequential character ranges (e.g. 'abcd', '1234')
    for (let i = 0; i < password.length - 3; i++) {
      const code1 = password.charCodeAt(i);
      const code2 = password.charCodeAt(i + 1);
      const code3 = password.charCodeAt(i + 2);
      const code4 = password.charCodeAt(i + 3);

      // Ascending sequence
      if (code2 === code1 + 1 && code3 === code2 + 1 && code4 === code3 + 1) {
        return true;
      }

      // Descending sequence
      if (code2 === code1 - 1 && code3 === code2 - 1 && code4 === code3 - 1) {
        return true;
      }
    }

    return false;
  }
}
