/**
 * Rate Limiter for scraper requests
 * Enforces 1 req/sec globally + robots.txt compliance + exponential backoff on 429
 */

import robotsParser from 'robots-parser';

interface RateLimitConfig {
  requestsPerSecond: number;
  backoffMultiplier: number;
  maxRetries: number;
}

export class RateLimiter {
  private lastRequestTime: number = 0;
  private config: RateLimitConfig;
  private robotsTxt: Map<string, any> = new Map();
  private backoffDelays: Map<string, number> = new Map();

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = {
      requestsPerSecond: config.requestsPerSecond || 1,
      backoffMultiplier: config.backoffMultiplier || 2,
      maxRetries: config.maxRetries || 3,
    };
  }

  /**
   * Load robots.txt from a domain
   */
  async loadRobotsTxt(baseUrl: string): Promise<void> {
    try {
      const url = new URL(baseUrl);
      const robotsUrl = `${url.protocol}//${url.host}/robots.txt`;
      const response = await fetch(robotsUrl, { signal: AbortSignal.timeout(5000) });
      if (response.ok) {
        const text = await response.text();
        this.robotsTxt.set(url.host, robotsParser(robotsUrl, text));
      }
    } catch (error) {
      console.warn(`Failed to load robots.txt from ${baseUrl}:`, error);
      // Proceed without robots.txt data
    }
  }

  /**
   * Check if a path is allowed by robots.txt
   */
  isAllowed(url: string, userAgent: string = 'FindASaleBot/1.0'): boolean {
    try {
      const parsed = new URL(url);
      const robots = this.robotsTxt.get(parsed.host);
      if (!robots) return true; // Allow if no robots.txt

      const pathname = parsed.pathname + parsed.search;
      return robots.isAllowed(userAgent, pathname) !== false;
    } catch {
      return true; // Allow on parse error
    }
  }

  /**
   * Wait before making a request (respects rate limit + backoff)
   */
  async waitBeforeRequest(domain: string): Promise<void> {
    const minInterval = 1000 / this.config.requestsPerSecond; // ms between requests
    const timeSinceLastRequest = Date.now() - this.lastRequestTime;

    // Check for backoff delay
    const backoffDelay = this.backoffDelays.get(domain) || 0;
    const requiredWait = Math.max(minInterval, backoffDelay);

    if (timeSinceLastRequest < requiredWait) {
      await new Promise((resolve) =>
        setTimeout(resolve, requiredWait - timeSinceLastRequest)
      );
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Record a 429 (Too Many Requests) and apply backoff
   */
  recordBackoff(domain: string, retryAfterSeconds?: number): void {
    const currentBackoff = this.backoffDelays.get(domain) || 1000;
    const newBackoff = retryAfterSeconds
      ? retryAfterSeconds * 1000
      : currentBackoff * this.config.backoffMultiplier;

    this.backoffDelays.set(domain, newBackoff);
    console.log(`Backoff applied for ${domain}: ${newBackoff}ms`);
  }

  /**
   * Clear backoff delay after successful request
   */
  clearBackoff(domain: string): void {
    this.backoffDelays.delete(domain);
  }
}

export const defaultRateLimiter = new RateLimiter({
  requestsPerSecond: 1,
  backoffMultiplier: 2,
  maxRetries: 3,
});
