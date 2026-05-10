/**
 * ADR-073: Directory Scraper — Source Registry
 * Single source of truth for all scraper source definitions.
 * Replaces hardcoded if/else chains in runScrapeRun and scraperCron.
 */

import { RateLimiter } from './rateLimiter';
import { scrapeEstateSalesNet } from './sources/estatesalesnet';
import { scrapeGarageSaleFinder } from './sources/garageSaleFinder';
import { scrapeFacebookMarketplace } from './sources/facebook-marketplace';
import { scrapeNAADirectory } from './sources/naaAuctioneerDirectory';
import { scrapeAuctionNinja } from './sources/auctionNinjaScraper';

export type SourceType = 'directory' | 'licensing' | 'crawl-queue' | 'places-api';
export type SourceRunMode = 'metro-loop' | 'national-once';
export type QualityTier = 'high' | 'medium' | 'low';

export interface ScrapeStats {
  itemsFound: number;
  itemsCreated: number;
  itemsUpdated: number;
  itemsSkipped: number;
  itemsFailed: number;
}

export interface ScraperSourceDef {
  id: string;
  displayName: string;
  type: SourceType;
  runMode: SourceRunMode;
  enabled: boolean;
  cronSchedule?: string;
  qualityTier: QualityTier;
  legalNote?: string;
  prohibited?: boolean; // if true, never run — legal block
  run: (metro: string, organizerId: string, rateLimiter: RateLimiter) => Promise<ScrapeStats>;
}

/**
 * Adapter: wrap the legacy { created, updated, skipped, failed } shape into ScrapeStats.
 */
function wrapLegacyStats(
  fn: (metro: string, organizerId: string, rateLimiter: RateLimiter) => Promise<{ created: number; updated: number; skipped: number; failed: number }>
): (metro: string, organizerId: string, rateLimiter: RateLimiter) => Promise<ScrapeStats> {
  return async (metro, organizerId, rateLimiter) => {
    const s = await fn(metro, organizerId, rateLimiter);
    return {
      itemsFound: s.created + s.updated + s.skipped + s.failed,
      itemsCreated: s.created,
      itemsUpdated: s.updated,
      itemsSkipped: s.skipped,
      itemsFailed: s.failed,
    };
  };
}

export const SOURCE_REGISTRY: ScraperSourceDef[] = [
  {
    id: 'EstateSalesNet',
    displayName: 'EstateSales.NET',
    type: 'directory',
    runMode: 'metro-loop',
    enabled: true,
    cronSchedule: '0 0 * * *',
    qualityTier: 'high',
    run: wrapLegacyStats(scrapeEstateSalesNet),
  },
  {
    id: 'GarageSaleFinder',
    displayName: 'GarageSaleFinder.com',
    type: 'directory',
    runMode: 'metro-loop',
    enabled: true,
    cronSchedule: '0 6 * * *',
    qualityTier: 'medium',
    run: wrapLegacyStats(scrapeGarageSaleFinder),
  },
  {
    id: 'FacebookMarketplace',
    displayName: 'Facebook Marketplace',
    type: 'directory',
    runMode: 'metro-loop',
    enabled: true,
    cronSchedule: '0 12 * * *',
    qualityTier: 'low',
    run: wrapLegacyStats(scrapeFacebookMarketplace),
  },
  {
    id: 'NAAFindAnAuctioneer',
    displayName: 'NAA Find an Auctioneer',
    type: 'directory',
    runMode: 'national-once',
    enabled: false,
    qualityTier: 'high',
    legalNote: 'Public member directory — no ToS prohibition found',
    run: scrapeNAADirectory,
  },
  {
    id: 'AuctionNinja',
    displayName: 'AuctionNinja',
    type: 'directory',
    runMode: 'metro-loop',
    enabled: false,
    qualityTier: 'medium',
    legalNote: 'No explicit scraper ban — rate limit strictly, public fields only',
    run: scrapeAuctionNinja,
  },
];

export function getSourceById(id: string): ScraperSourceDef | undefined {
  return SOURCE_REGISTRY.find((s) => s.id === id);
}

export function getEnabledSources(): ScraperSourceDef[] {
  return SOURCE_REGISTRY.filter((s) => s.enabled && !s.prohibited);
}

export const VALID_SOURCE_IDS: string[] = SOURCE_REGISTRY.map((s) => s.id);
