/**
 * In-memory rate limiters for the public MCP server.
 *
 * Two layers, both keyed by client IP (Express `trust proxy` resolves the real
 * client behind Railway's edge):
 * - toolLimiter: per tool, per IP, per minute (limits below).
 * - httpLimiter: all MCP HTTP requests per IP per minute, so protocol traffic
 *   that never reaches a tool (initialize, tools/list, pings) is bounded too.
 *
 * State is per process. The service runs one replica; if it is scaled out, each
 * replica enforces its own budget (still bounded, just multiplied by replicas).
 */

import { RateLimitStore } from '../types';

const WINDOW_MS = 60_000;

/** Requests per minute per IP for each tool. */
export const TOOL_RATE_LIMITS: Record<string, number> = {
  search_sales: 20,
  search_items: 20,
  find_item_for_sale: 20,
  get_sale: 40,
  get_item: 40,
  get_trending_sales: 20,
  get_sales_starting_soon: 20,
  list_cities: 10,
  list_sale_types: 30,
  list_categories: 10,
};

const DEFAULT_TOOL_LIMIT = 20;

/** All MCP HTTP requests (any method) per IP per minute. */
export const HTTP_REQUESTS_PER_MINUTE = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '120', 10) || 120;

class WindowLimiter {
  private store: RateLimitStore = {};

  constructor(private readonly windowMs: number) {}

  /** Records a hit and returns true when it is within `limit`. */
  hit(key: string, bucket: string, limit: number): boolean {
    const now = Date.now();
    const perKey = (this.store[key] ??= {});
    const entry = perKey[bucket];
    if (!entry || now >= entry.resetAt) {
      perKey[bucket] = { count: 1, resetAt: now + this.windowMs };
      return true;
    }
    entry.count++;
    return entry.count <= limit;
  }

  /** Milliseconds until the bucket resets. */
  resetIn(key: string, bucket: string): number {
    const entry = this.store[key]?.[bucket];
    return entry ? Math.max(0, entry.resetAt - Date.now()) : 0;
  }

  cleanup(): void {
    const now = Date.now();
    for (const key of Object.keys(this.store)) {
      const buckets = this.store[key];
      for (const b of Object.keys(buckets)) {
        if (buckets[b].resetAt <= now) delete buckets[b];
      }
      if (Object.keys(buckets).length === 0) delete this.store[key];
    }
  }
}

const toolWindow = new WindowLimiter(WINDOW_MS);
const httpWindow = new WindowLimiter(WINDOW_MS);

export const rateLimiter = {
  /** Per-tool check. Returns null when allowed, else seconds until retry. */
  checkTool(ip: string, toolName: string): number | null {
    const limit = TOOL_RATE_LIMITS[toolName] ?? DEFAULT_TOOL_LIMIT;
    if (toolWindow.hit(ip, toolName, limit)) return null;
    return Math.max(1, Math.ceil(toolWindow.resetIn(ip, toolName) / 1000));
  },
  /** Per-IP HTTP check. Returns null when allowed, else seconds until retry. */
  checkHttp(ip: string): number | null {
    if (httpWindow.hit(ip, 'http', HTTP_REQUESTS_PER_MINUTE)) return null;
    return Math.max(1, Math.ceil(httpWindow.resetIn(ip, 'http') / 1000));
  },
  cleanup(): void {
    toolWindow.cleanup();
    httpWindow.cleanup();
  },
};

setInterval(() => rateLimiter.cleanup(), 5 * 60 * 1000).unref();
