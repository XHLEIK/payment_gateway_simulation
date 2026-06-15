import { Injectable, Logger } from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class BotDetectionService {
  private readonly logger = new Logger(BotDetectionService.name);

  // Blacklist of known automation user-agent fragments
  private readonly botUserAgentFragments = [
    'headlesschrome', 'puppeteer', 'selenium', 'webdriver', 'phantomjs',
    'axios', 'postman', 'python-requests', 'curl', 'wget', 'zgrab',
    'scrapy', 'python-urllib', 'httpclient', 'apache-httpclient'
  ];

  /**
   * Analyzes an Express request object to assess if it originates from an automated bot/script.
   * Returns true if suspicious, triggering an automatic CAPTCHA challenge.
   */
  isSuspicious(req: Request): boolean {
    const userAgent = (req.headers['user-agent'] || '').toLowerCase();
    const secWebdriver = req.headers['sec-ch-ua-arch'] || req.headers['sec-webdriver'];
    const acceptLanguage = req.headers['accept-language'];

    // 1. Missing user agent is highly suspicious
    if (!userAgent) {
      this.logger.warn(`Suspicious traffic: Request from ${req.ip} has no User-Agent header`);
      return true;
    }

    // 2. Check for automation tools or script clients in user-agent strings
    for (const fragment of this.botUserAgentFragments) {
      if (userAgent.includes(fragment)) {
        this.logger.warn(`Bot detected: User-Agent matches fragment "${fragment}". UA: ${userAgent}`);
        return true;
      }
    }

    // 3. Automation-related request headers (e.g. sec-webdriver)
    if (secWebdriver) {
      this.logger.warn(`Bot detected: WebDriver header present. IP: ${req.ip}`);
      return true;
    }

    // 4. Standard browsers almost always include accept-language. API tools/headless scrapers often omit it.
    // Check Accept-Language header (ignore non-GET/POST/PUT state-changing actions if Accept-Language is blank, but verify it)
    if (!acceptLanguage && req.method !== 'GET') {
      this.logger.warn(`Suspicious traffic: Missing Accept-Language header from IP: ${req.ip}`);
      return true;
    }

    return false;
  }
}
