/**
 * StorageBattles.com scraper adapter
 * Source: https://www.storagebattles.com
 * ToS: Same as StorageTreasures.com — storagebattles.com is a white-label alias
 *   of the StorageTreasures platform (confirmed via appConfig base64 decode).
 * robots.txt: Not served (empty response — Cloudflare/Next.js handled).
 *
 * PARKED — StorageBattles.com is a StorageTreasures white-label alias.
 * The site runs the identical Next.js SPA as StorageTreasures.com. Confirmed via
 * the __NEXT_DATA__ appConfig field: appUrl = "https://www.storagetreasures.com",
 * publicUrl = "https://www.storagetreasures.com", apiEndPoint points to
 * api.st-prd-1.aws.storagetreasures.com — the same backend as StorageTreasures.
 *
 * All access constraints from StorageTreasures apply identically:
 * - Full Next.js SPA, no server-rendered listing data
 * - Public API key capped at 50 truncated records
 * - 36,943 US storage facilities in the underlying database
 *
 * This source is redundant with the StorageTreasures scraper entry. Do not build
 * a separate scraper — any future StorageTreasures unpark will cover this domain.
 *
 * Verified: 2026-06-10 — decoded appConfig confirms storagetreasures.com backend;
 * footer shows "OpenTech Alliance, Inc." (StorageTreasures parent company).
 *
 * ADR-073: Directory Scraper — redundant alias of StorageTreasures (already parked)
 */

import { RateLimiter } from '../rateLimiter';
import { ScrapeStats } from '../sourceRegistry';

/**
 * StorageBattles scraper — parked (StorageTreasures white-label alias, same SPA/API).
 * Returns zero stats cleanly. Any future unpark should go through StorageTreasures.
 */
export async function scrapeStorageBattles(
  _metro: string,
  _organizerId: string,
  _rateLimiter: RateLimiter
): Promise<ScrapeStats> {
  // PARKED: storagebattles.com is a white-label alias of StorageTreasures.com.
  // Same Next.js SPA, same API backend (api.st-prd-1.aws.storagetreasures.com).
  // Redundant with StorageTreasures scraper entry (also parked, same constraints).
  // Verified: 2026-06-10 — appConfig appUrl = storagetreasures.com.
  console.log('[StorageBattles] PARKED: StorageTreasures white-label alias — covered by StorageTreasures scraper entry. Exiting cleanly.');

  return {
    itemsFound: 0,
    itemsCreated: 0,
    itemsUpdated: 0,
    itemsSkipped: 0,
    itemsFailed: 0,
  };
}
