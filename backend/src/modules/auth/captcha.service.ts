import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import * as crypto from 'crypto';

@Injectable()
export class CaptchaService {
  private readonly logger = new Logger(CaptchaService.name);

  constructor(private readonly redisService: RedisService) {}

  /**
   * Helper to generate a random 5-character string from safe character pool.
   * Avoids ambiguous characters: O, 0, I, l, 1, S, 5.
   */
  generateCaptchaText(length: number = 5): string {
    const chars = '2346789ABCDEFGHJKLMNPQRTVWXYZ';
    let text = '';
    for (let i = 0; i < length; i++) {
      text += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return text;
  }

  /**
   * Generates a secure, highly distorted, OCR-resistant SVG CAPTCHA.
   */
  generateCustomSvg(text: string): string {
    const width = 150;
    const height = 50;
    
    // Background gradient in dark theme
    const bgGradientStart = '#111827';
    const bgGradientEnd = '#1f2937';

    // Standard secure font-families
    const fonts = [
      'Arial, sans-serif',
      'Courier New, monospace',
      'Georgia, serif',
      'Impact, sans-serif',
      'Trebuchet MS, sans-serif',
      'Verdana, sans-serif',
      'Times New Roman, serif',
      'Comic Sans MS, sans-serif'
    ];

    const textColors = [
      '#ffffff', // bright white
      '#e2e8f0', // light slate
      '#fecaca', // light red
      '#fed7aa', // light orange
      '#fef08a', // light yellow
      '#bbf7d0', // light green
      '#99f6e4', // light teal
      '#bfdbfe', // light blue
      '#c084fc', // light purple
      '#f472b6', // light pink
    ];

    const noiseColors = [
      'rgba(99, 102, 241, 0.4)', // indigo
      'rgba(59, 130, 246, 0.4)', // blue
      'rgba(16, 185, 129, 0.4)', // green
      'rgba(239, 68, 68, 0.4)',  // red
      'rgba(245, 158, 11, 0.4)',  // amber
      'rgba(255, 255, 255, 0.25)' // white
    ];

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${width} ${height}" style="aspect-ratio: ${width}/${height}; display: block; width: 100%; height: 100%;">`;
    
    const gradId = `bgGrad-${Math.random().toString(36).substring(2, 9)}`;
    svg += `
      <defs>
        <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${bgGradientStart}" />
          <stop offset="100%" stop-color="${bgGradientEnd}" />
        </linearGradient>
      </defs>
    `;

    // 1. Draw gradient background
    svg += `<rect width="${width}" height="${height}" fill="url(#${gradId})" />`;

    // 2. Draw background noise texture (subtle grid patterns)
    for (let i = 0; i < width; i += 15) {
      svg += `<line x1="${i}" y1="0" x2="${i}" y2="${height}" stroke="rgba(255, 255, 255, 0.05)" stroke-width="0.5" />`;
    }
    for (let i = 0; i < height; i += 10) {
      svg += `<line x1="0" y1="${i}" x2="${width}" y2="${i}" stroke="rgba(255, 255, 255, 0.05)" stroke-width="0.5" />`;
    }

    // 3. Draw random geometric shapes in background
    const shapeCount = 6 + Math.floor(Math.random() * 6);
    for (let i = 0; i < shapeCount; i++) {
      const shapeType = Math.floor(Math.random() * 3);
      const color = noiseColors[Math.floor(Math.random() * noiseColors.length)];
      if (shapeType === 0) {
        // Triangle
        const x1 = Math.random() * width;
        const y1 = Math.random() * height;
        const x2 = x1 + (Math.random() * 16 - 8);
        const y2 = y1 + (Math.random() * 16 - 8);
        const x3 = x1 + (Math.random() * 16 - 8);
        const y3 = y1 + (Math.random() * 16 - 8);
        svg += `<polygon points="${x1},${y1} ${x2},${y2} ${x3},${y3}" fill="${color}" opacity="0.18" />`;
      } else if (shapeType === 1) {
        // Circle
        const cx = Math.random() * width;
        const cy = Math.random() * height;
        const r = 2 + Math.random() * 6;
        svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" opacity="0.18" />`;
      } else {
        // Rectangle
        const rx = Math.random() * width;
        const ry = Math.random() * height;
        const rw = 4 + Math.random() * 10;
        const rh = 4 + Math.random() * 10;
        const deg = Math.random() * 360;
        svg += `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" transform="rotate(${deg}, ${rx}, ${ry})" fill="${color}" opacity="0.18" />`;
      }
    }

    // 4. Draw random dots (100-300 dots for noise)
    const dotCount = 120 + Math.floor(Math.random() * 120);
    for (let i = 0; i < dotCount; i++) {
      const cx = Math.random() * width;
      const cy = Math.random() * height;
      const r = 0.5 + Math.random() * 0.9;
      const color = noiseColors[Math.floor(Math.random() * noiseColors.length)];
      svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" />`;
    }

    // 5. Draw characters (highly randomized, rotated, variable font family & sizes)
    const len = text.length;
    const charWidth = (width - 24) / len;

    for (let i = 0; i < len; i++) {
      const char = text[i];
      const fontFamily = fonts[Math.floor(Math.random() * fonts.length)];
      const fontSize = 28 + Math.floor(Math.random() * 7); // 28px to 35px
      const fontWeight = Math.random() > 0.5 ? 'bold' : '900';
      const rotation = -35 + Math.floor(Math.random() * 71); // -35 to +35 degrees
      const fill = textColors[Math.floor(Math.random() * textColors.length)];
      
      // Calculate coordinates with random offset
      const x = 12 + i * charWidth + (Math.random() * 4 - 2);
      const y = 33 + (Math.random() * 8 - 4);

      svg += `<text x="${x}" y="${y}" font-family="${fontFamily}" font-size="${fontSize}" font-weight="${fontWeight}" fill="${fill}" transform="rotate(${rotation}, ${x}, ${y})" style="pointer-events: none; user-select: none;">${char}</text>`;
    }

    // 6. Draw curved interference lines (4-8 curved lines)
    const lineCount = 5 + Math.floor(Math.random() * 4); // 5 to 8 lines
    for (let i = 0; i < lineCount; i++) {
      const startX = -10 + Math.random() * 25;
      const startY = 5 + Math.random() * 40;
      const endX = (width - 15) + Math.random() * 25;
      const endY = 5 + Math.random() * 40;
      
      const cp1x = 25 + Math.random() * 45;
      const cp1y = -10 + Math.random() * 70;
      const cp2x = 75 + Math.random() * 45;
      const cp2y = -10 + Math.random() * 70;

      const color = noiseColors[Math.floor(Math.random() * noiseColors.length)];
      const strokeWidth = 1.2 + Math.random() * 1.6;
      
      svg += `<path d="M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}" stroke="${color}" stroke-width="${strokeWidth}" fill="none" />`;
    }

    // 7. Draw random arcs
    const arcCount = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < arcCount; i++) {
      const x1 = Math.random() * width;
      const y1 = Math.random() * height;
      const x2 = x1 + (Math.random() * 36 - 18);
      const y2 = y1 + (Math.random() * 36 - 18);
      const rx = 10 + Math.random() * 25;
      const ry = 10 + Math.random() * 25;
      const sweepFlag = Math.random() > 0.5 ? 1 : 0;
      const color = noiseColors[Math.floor(Math.random() * noiseColors.length)];
      const strokeWidth = 1.0 + Math.random() * 0.8;

      svg += `<path d="M ${x1} ${y1} A ${rx} ${ry} 0 0 ${sweepFlag} ${x2} ${y2}" stroke="${color}" stroke-width="${strokeWidth}" fill="none" />`;
    }

    svg += '</svg>';
    return svg;
  }

  /**
   * Generates a new classic alphanumeric SVG captcha.
   * Stores the answer in Redis with 2 minutes expiration.
   */
  async generateCaptcha(): Promise<{ captchaId: string; captchaSvg: string }> {
    const text = this.generateCaptchaText(5);
    const svg = this.generateCustomSvg(text);
    const captchaId = crypto.randomUUID();
    
    // Store text in uppercase to support case-insensitive comparison
    // Expire CAPTCHA after 2 minutes (120 seconds)
    await this.redisService.set(`captcha:${captchaId}`, text.toUpperCase(), 120);

    this.logger.log(`Generated CAPTCHA ID ${captchaId} with expected value: ${text.toUpperCase()}`);

    return {
      captchaId,
      captchaSvg: svg,
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
