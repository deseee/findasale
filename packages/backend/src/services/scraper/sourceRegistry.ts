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
import { runYellowPagesCaScraper } from './sources/yellowPagesCaScraper';
import { scrapeFleaMarketZone } from './sources/fleaMarketZoneScraper';
import { scrapeStorageAuctionsNet } from './sources/storageAuctionsNetScraper';
import { scrapeStorageTreasures } from './sources/storageTreasuresScraper';
import { scrapePropertyRoom } from './sources/propertyRoomScraper';

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
    // cronSchedule removed — ESN is handled by GH Actions (scrape-estatesalesnet.yml); metro-slug cron always returned 0 results
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
    enabled: true,
    qualityTier: 'high',
    legalNote: 'Public member directory — no ToS prohibition found',
    run: scrapeNAADirectory,
  },
  {
    id: 'AuctionNinja',
    displayName: 'AuctionNinja',
    type: 'directory',
    runMode: 'metro-loop',
    enabled: true,
    // No cronSchedule — triggered via GitHub Actions (GH Actions → Railway API POST).
    // Railway cron removed to avoid cost; GH Actions is the durable scheduler.
    qualityTier: 'medium',
    legalNote: 'No explicit scraper ban — rate limit strictly, public fields only',
    run: scrapeAuctionNinja,
  },
  {
    id: 'YellowPagesCA',
    displayName: 'YellowPages.ca (Canada)',
    type: 'directory',
    runMode: 'national-once',
    enabled: true,
    cronSchedule: '0 5 * * 1', // Monday 05:00 UTC
    qualityTier: 'medium',
    legalNote: 'Public business directory — same parent company as Canada411 (Thryv Canada). Public fields only, 1 req/sec rate limit.',
    // national-once: no metro or organizerId context needed; wrap to match interface
    run: async (_metro: string, _organizerId: string, _rateLimiter: RateLimiter): Promise<ScrapeStats> => {
      const s = await runYellowPagesCaScraper();
      return {
        itemsFound: s.fetched,
        itemsCreated: s.upserted,
        itemsUpdated: 0,
        itemsSkipped: s.fetched - s.matched,
        itemsFailed: 0,
      };
    },
  },
,
  {
    id: 'FleaMarketZone',
    displayName: 'FleaMarketZone.com',
    type: 'directory',
    runMode: 'national-once',
    enabled: true,
    // No cronSchedule — triggered via GitHub Actions (scrape-fleamarketzone.yml).
    qualityTier: 'medium',
    legalNote: 'ToS confirmed CLEAR — no anti-scraping language. robots.txt open. Public venue directory.',
    run: scrapeFleaMarketZone,
  },
  {
    id: 'StorageAuctionsNet',
    displayName: 'StorageAuctions.net',
    type: 'directory',
    runMode: 'national-once',
    enabled: false, // PARKED — AngularJS-rendered, no static listings. See storageAuctionsNetScraper.ts.
    qualityTier: 'low',
    legalNote: 'ToS confirmed CLEAR — blank robots.txt Disallow. Site is JS-rendered; parked pending headless browser implementation.',
    run: scrapeStorageAuctionsNet,
  },
  {
    id: 'PropertyRoom',
    displayName: 'PropertyRoom.com',
    type: 'directory',
    runMode: 'national-once',
    enabled: true,
    // No cronSchedule — triggered via GitHub Actions (scrape-propertyroom.yml).
    qualityTier: 'high',
    legalNote: 'ToS confirmed CLEAR — no anti-scraping clause. /about-us/partners not disallowed in robots.txt. Public partner directory of named law enforcement agencies.',
    run: scrapePropertyRoom,
  },
  {
    id: 'StorageTreasures',
    displayName: 'StorageTreasures.com',
    type: 'directory',
    runMode: 'national-once',
    enabled: false, // PARKED — Full Next.js SPA; public API key capped at 50 truncated records.
    // Unpark path: Playwright headless rendering OR authenticated Cognito JWT API session.
    // 36,943 US storage facilities confirmed in API; inaccessible via public key.
    // robots.txt: Open (Allow: / for all agents). ToS: GRAY area, robotsAllow:true in appConfig.
    qualityTier: 'medium',
    legalNote: 'ToS gray area (MySpace-era boilerplate, no explicit scraper ban). robots.txt open. robotsAllow:true confirmed in page appConfig. Parked on data access grounds, not legal.',
    run: scrapeStorageTreasures,
  },
];

export function getSourceById(id: string): ScraperSourceDef | undefined {
  return SOURCE_REGISTRY.find((s) => s.id === id);
}

export function getEnabledSources(): ScraperSourceDef[] {
  return SOURCE_REGISTRY.filter((s) => s.enabled && !s.prohibited);
}

export const VALID_SOURCE_IDS: string[] = SOURCE_REGISTRY.map((s) => s.id);
