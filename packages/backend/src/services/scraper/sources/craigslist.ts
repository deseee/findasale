/**
 * Craigslist scraper adapter — Phase 2 STUB
 * Disabled: Craigslist ToS explicitly prohibits scraping.
 * Keeping stub for future evaluation / partnership path.
 * ADR-073: Directory Scraper Phase 1
 */

import { RateLimiter } from '../rateLimiter';

export async function scrapeCraigslist(
  _metro: string,
  _organizerId: string,
  _rateLimiter: RateLimiter
): Promise<{ created: number; updated: number; skipped: number; failed: number }> {
  console.log('[Craigslist] Scraper disabled — Phase 2 / partnership required');
  return { created: 0, updated: 0, skipped: 0, failed: 0 };
}
