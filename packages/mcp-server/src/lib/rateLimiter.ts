/**
 * In-Memory Rate Limiter for MCP Tools
 *
 * Tracks requests per IP per tool name.
 * Respects per-tool rate limits defined in spec.
 */

import { RateLimitStore } from '../types';

// Rate limits per tool (requests per minute)
const RATE_LIMITS: Record<string, number> = {
  search_sales: 10,
  search_items: 15,
  get_sale: 30,
  get_item: 30,
  list_cities: 5,
  list_sale_types: 999999, // unlimited
  list_categories: 999999, // unlimited
};

const WINDOW_MS = 60000; // 1 minute

class InMemoryRateLimiter {
  private store: RateLimitStore = {};

  /**
   * Check if a request is allowed
   * @returns true if allowed, false if rate limited
   */
  isAllowed(ip: string, toolName: string): boolean {
    const limit = RATE_LIMITS[toolName];
    if (!limit || limit >= 999999) {
      // Unlimited
      return true;
    }

    // Initialize IP bucket if needed
    if (!this.store[ip]) {
      this.store[ip] = {};
    }

    const now = Date.now();
    const toolEntry = this.store[ip][toolName];

    // New entry or window expired
    if (!toolEntry || now >= toolEntry.resetAt) {
      this.store[ip][toolName] = {
        count: 1,
        resetAt: now + WINDOW_MS,
      };
      return true;
    }

    // Increment count
    toolEntry.count++;

    // Check if exceeded limit
    if (toolEntry.count > limit) {
      return false;
    }

    return true;
  }

  /**
   * Get remaining requests for this IP/tool
   */
  getRemaining(ip: string, toolName: string): number {
    const limit = RATE_LIMITS[toolName];
    if (!limit || limit >= 999999) {
      return 999999;
    }

    const toolEntry = this.store[ip]?.[toolName];
    const now = Date.now();

    // Window expired or no entry
    if (!toolEntry || now >= toolEntry.resetAt) {
      return limit;
    }

    return Math.max(0, limit - toolEntry.count);
  }

  /**
   * Get time until rate limit resets (ms)
   */
  getResetTime(ip: string, toolName: string): number {
    const toolEntry = this.store[ip]?.[toolName];
    if (!toolEntry) {
      return 0;
    }

    const now = Date.now();
    const timeUntilReset = Math.max(0, toolEntry.resetAt - now);
    return timeUntilReset;
  }

  /**
   * Cleanup old entries (call periodically)
   */
  cleanup(): void {
    const now = Date.now();
    for (const ip in this.store) {
      const hasValidEntry = Object.values(this.store[ip]).some(
        (entry) => entry.resetAt > now
      );
      if (!hasValidEntry) {
        delete this.store[ip];
      }
    }
  }
}

export const rateLimiter = new InMemoryRateLimiter();

// Run cleanup every 5 minutes
setInterval(() => {
  rateLimiter.cleanup();
}, 5 * 60 * 1000);
