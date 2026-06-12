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
import { scrapeStorageAuctionsCom } from './sources/storageAuctionsComScraper';
import { scrapeStorageTreasures } from './sources/storageTreasuresScraper';
import { scrapePropertyRoom } from './sources/propertyRoomScraper';
import { scrapePublicSurplus } from './sources/publicSurplusScraper';
import { scrapeMunicibid } from './sources/municibidScraper';
import { scrapeGovPlanet } from './sources/govPlanetScraper';
import { scrapeGovernmentLiquidation } from './sources/governmentLiquidationScraper';
import { scrapeHandbid } from './sources/handbidScraper';
import { scrapeAmericanFleaMarkets } from './sources/americanFleaMarketsScraper';
import { scrapeFleaMarketDirectory } from './sources/fleaMarketDirectoryScraper';
import { scrapeFleaMarketCom } from './sources/fleaMarketComScraper';
import { scrapeFleaMarketsNet } from './sources/fleaMarketsNetScraper';
import { scrapeFleaMarketRover } from './sources/fleaMarketRoverScraper';
import { scrapeVendorsByState } from './sources/vendorsByStateScraper';
import { runNFMAMembersScraper } from './sources/nfmaMembersScraper';
import { scrapeBidSpotter } from './sources/bidSpotterScraper';
import { scrapeBid13 } from './sources/bid13Scraper';
import { scrapeIBidNow } from './sources/ibidNowScraper';
import { scrapeLockerFox } from './sources/lockerFoxScraper';
import { scrapeStorageUnitAuctionList } from './sources/storageUnitAuctionListScraper';
import { scrapeStorageBattles } from './sources/storageBattlesScraper';
import { scrapeInvaluable } from './sources/invaluableAuctionHouseScraper';
import { runAuctionZipScraper } from './sources/auctionZipScraper';
import { scrapeSellMyAntiques } from './sources/sellMyAntiquesScraper';
import { scrapeProxibid } from './sources/proxibidScraper';
import { scrapeFleamapket } from './sources/fleamapketScraper';
import { scrapeEstateSalesOrg } from './sources/estatesalesOrgScraper';
import { scrapeSwapmeetDirectory } from './sources/swapmeetDirectoryScraper';
import { scrapeNASMM } from './sources/nasmmScraper';

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
    enabled: true, // UNPARKED 2026-06-11 — Novi AMS JSON API endpoint discovered in page source. POST /members/directory-customer-list returns 2,384 structured member records. No Playwright needed.
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
    enabled: true,
    // No cronSchedule — triggered via GitHub Actions (scrape-storageauctionsnet.yml, Thursdays 09:00 UTC).
    qualityTier: 'low',
    legalNote: 'ToS confirmed CLEAR — blank robots.txt Disallow. Real API endpoint: GET /block/auction/getallonline/{page}/esoon (unauthenticated JSON). ~32 active auctions / ~2 pages at any time. update.storageauctions.net is a WebSocket/push server (all REST paths 404) — not the data API. Confirmed reachable 2026-06-10.',
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
    id: 'StorageAuctionsCom',
    displayName: 'StorageAuctions.com',
    type: 'directory',
    runMode: 'national-once',
    enabled: true,
    // No cronSchedule — triggered via GitHub Actions (scrape-storageauctions-com.yml).
    qualityTier: 'high',
    legalNote: "ToS GRAY — page is CSR-only, no server-rendered text available. robots.txt: Allow: / (only auth paths blocked). Public API at core-service.auctions.storageauctions.com/public/auctions requires no auth. 3,100+ US storage facility auction operators. Confirmed 2026-06-10.",
    run: scrapeStorageAuctionsCom,
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
  {
    id: 'Municibid',
    displayName: 'Municibid',
    type: 'directory',
    runMode: 'national-once',
    enabled: false, // PARKED — ToS PROHIBITED: explicit ban on automated access and scraping (Section c).
    prohibited: true,
    qualityTier: 'high',
    legalNote: 'ToS PROHIBITED — Section (c) explicitly bans automated access and scraping. Unpark requires written data partnership agreement with Municibid. Verified 2026-06-10 (ToS updated 05/04/26).',
    run: scrapeMunicibid,
  },
  {
    id: 'PublicSurplus',
    displayName: 'PublicSurplus.com',
    type: 'directory',
    runMode: 'national-once',
    enabled: true,
    // No cronSchedule — triggered via GitHub Actions (scrape-publicsurplus.yml).
    qualityTier: 'high',
    legalNote: 'ToS pages return HTTP 500 (server error, not a block). Privacy Policy has zero prohibition language. robots.txt: User-agent: * disallows only /images/. Verified 2026-06-10.',
    run: scrapePublicSurplus,
  },
  {
    id: 'GovPlanet',
    displayName: 'GovPlanet.com',
    type: 'directory',
    runMode: 'national-once',
    enabled: false, // PARKED — ToS PROHIBITED: Section 1.3(c) of IronPlanet/GovPlanet Terms (April 17, 2026) explicitly bans automated access, scraping, and data collection tools.
    prohibited: true,
    qualityTier: 'high',
    legalNote: 'ToS PROHIBITED — Section 1.3(c) bans "any robot, spider, scraper, data mining tool, data gathering or extraction tool, or any other automated means." Operated by IronPlanet, Inc. (Ritchie Bros. / RB Global). /sellers page is static HTML with ~45 named gov agencies. Unpark requires data partnership with Ritchie Bros. Verified 2026-06-10.',
    run: scrapeGovPlanet,
  },
  {
    id: 'GovernmentLiquidation',
    displayName: 'GovernmentLiquidation.com',
    type: 'directory',
    runMode: 'national-once',
    enabled: false, // PARKED — ToS PROHIBITED (Liquidity Services, same parent as GovDeals) + Cloudflare bot protection blocks all programmatic access.
    prohibited: true,
    qualityTier: 'high',
    legalNote: 'ToS PROHIBITED — Operated by Liquidity Services, Inc. (same parent as GovDeals). Same explicit anti-scraping ToS as GovDeals. Cloudflare blocks all automated fetches. Primary US DoD surplus platform (DLA Disposition Services). Unpark requires data partnership with Liquidity Services. Verified 2026-06-10.',
    run: scrapeGovernmentLiquidation,
  },
  {
    id: 'Handbid',
    displayName: 'Handbid.com',
    type: 'directory',
    runMode: 'national-once',
    enabled: false, // PARKED — Wrong category: 789 orgs are nonprofits/charities/PTAs, not gov surplus or secondary sale organizers.
    qualityTier: 'low',
    legalNote: 'ToS CLEAR — zero anti-scraping language. robots.txt fully open (Allow: / for all agents). events.handbid.com/organizations is static HTML, 789 orgs across 33 pages. Parked on CATEGORY grounds only: orgs are nonprofits/school PTAs/charities. Unpark if FindA.Sale expands to fundraising auction events. Verified 2026-06-10.',
    run: scrapeHandbid,
  },
  // ─── Flea Market Directory Sources (all PARKED — 2026-06-10 investigation) ────
  {
    id: 'AmericanFleaMarkets',
    displayName: 'AmericanFleaMarkets.com',
    type: 'directory',
    runMode: 'national-once',
    enabled: false, // PARKED — domain returns empty HTTP response, appears dead/inactive.
    qualityTier: 'medium',
    legalNote: 'robots.txt: empty (no response). ToS: inaccessible. Domain dead — empty HTTP response on all paths. Verified 2026-06-10.',
    run: scrapeAmericanFleaMarkets,
  },
  {
    id: 'FleaMarketDirectory',
    displayName: 'FleaMarketDirectory.com',
    type: 'directory',
    runMode: 'national-once',
    enabled: false, // PARKED — domain redirects to USWantads.com (unrelated general classifieds).
    qualityTier: 'low',
    legalNote: 'Domain permanently redirects to uswantads.com (general classifieds, not a flea market directory). No venue data at destination. Verified 2026-06-10.',
    run: scrapeFleaMarketDirectory,
  },
  {
    id: 'FleaMarketCom',
    displayName: 'FleaMarket.com',
    type: 'directory',
    runMode: 'national-once',
    enabled: false, // PARKED — domain returns empty HTTP response, appears dead/inactive.
    qualityTier: 'medium',
    legalNote: 'robots.txt: empty (no response). ToS: inaccessible. Domain dead — empty HTTP response on all paths. Verified 2026-06-10.',
    run: scrapeFleaMarketCom,
  },
  {
    id: 'FleaMarketsNet',
    displayName: 'FleaMarkets.net',
    type: 'directory',
    runMode: 'national-once',
    enabled: false, // PARKED — domain is for sale on GoDaddy Afternic, no directory content.
    qualityTier: 'low',
    legalNote: 'Domain is a parked/for-sale listing on GoDaddy Afternic. No flea market directory content. Verified 2026-06-10.',
    run: scrapeFleaMarketsNet,
  },
  {
    id: 'FleaMarketRover',
    displayName: 'FleaMarketRover.com',
    type: 'directory',
    runMode: 'national-once',
    enabled: false, // PARKED — domain returns empty HTTP response, appears dead/inactive.
    qualityTier: 'medium',
    legalNote: 'robots.txt: empty (no response). ToS: inaccessible. Domain dead — empty HTTP response on all paths. Verified 2026-06-10.',
    run: scrapeFleaMarketRover,
  },
  {
    id: 'VendorsByState',
    displayName: 'VendorsByStateUSA.com / VendorsByState.com',
    type: 'directory',
    runMode: 'national-once',
    enabled: false, // PARKED — both domain variants return empty HTTP response.
    qualityTier: 'medium',
    legalNote: 'Both vendorsbystateusa.com and vendorsbystate.com return empty HTTP responses. Domains appear dead or expired. Verified 2026-06-10.',
    run: scrapeVendorsByState,
  },
  {
    id: 'NFMAMembers',
    displayName: 'National Flea Market Association (fleamarkets.org)',
    type: 'directory',
    runMode: 'national-once',
    enabled: false, // PARKED — Wix.com JS-rendered member list; no static data in HTML.
    qualityTier: 'high',
    legalNote: 'robots.txt: OPEN (Allow: /). Privacy Policy: no anti-scraping language. Member list at /nfma-member-markets is Wix JS-rendered — static HTML returns shell with zero records. Unpark: Playwright or Wix Data API. Note: nfma.org is the wrong org (Municipal Analysts). Verified 2026-06-10.',
    run: async (_metro: string, _organizerId: string, _rateLimiter: RateLimiter): Promise<ScrapeStats> => {
      await runNFMAMembersScraper();
      return { itemsFound: 0, itemsCreated: 0, itemsUpdated: 0, itemsSkipped: 0, itemsFailed: 0 };
    },
  },
  // ─── Storage Auction Sources (2026-06-10 investigation) ───────────────────
  {
    id: 'BidSpotter',
    displayName: 'BidSpotter.com',
    type: 'directory',
    runMode: 'national-once',
    enabled: true,
    // No cronSchedule — triggered via GitHub Actions (scrape-bidspotter.yml).
    qualityTier: 'high',
    legalNote: 'ToS CLEAR — /en-us/about-us/legal/website-terms-and-conditions: standard copyright, no anti-scraping clause. robots.txt disallows only /Account*, /admin, /api, /Search*. Auctioneers directory at /en-us/auctioneers serves static HTML via XHR header (~35 US auction houses). Proxibid subsidiary. Verified 2026-06-10.',
    run: scrapeBidSpotter,
  },
  {
    id: 'Bid13',
    displayName: 'Bid13.com',
    type: 'directory',
    runMode: 'national-once',
    enabled: true, // ACTIVE — /api/v1/search.php JSON endpoint confirmed 2026-06-12.
    qualityTier: 'medium',
    legalNote: 'ToS CLEAR — no anti-scraping language (terms-of-service page reviewed 2026-06-12). robots.txt: /api/v1/ path not blocked, crawl-delay: 5 s (respected). API endpoint /api/v1/search.php discovered via bid13_search.js custom module. Confirmed returning live JSON facility data.',
    run: scrapeBid13,
  },
  {
    id: 'IBidNow',
    displayName: 'iBidNow.com',
    type: 'directory',
    runMode: 'national-once',
    enabled: false, // PARKED — GoDaddy Afternic parked/for-sale domain. Not a live product.
    qualityTier: 'low',
    legalNote: 'Not a live storage auction platform. All URLs redirect to GoDaddy Afternic domain sale page (/lander). robots.txt served from Afternic infrastructure. Verified 2026-06-10.',
    run: scrapeIBidNow,
  },
  {
    id: 'LockerFox',
    displayName: 'LockerFox.com',
    type: 'directory',
    runMode: 'national-once',
    enabled: false, // PROHIBITED — ToS §1.4.2 bans robots/spiders; §1.4.6 bans commercial data harvesting without written permission.
    prohibited: true,
    qualityTier: 'high',
    legalNote: 'ToS PROHIBITED — §1.4.2: bans robots/spiders without express written permission. §1.4.6: bans commercial content harvesting without written permission. robots.txt also disallows /auctions/. Site has static HTML listings (technically feasible) — legal prohibition is the only blocker. Unpark requires written data partnership agreement with Lockerfox, LLC (Cornelius, NC). Verified 2026-06-10.',
    run: scrapeLockerFox,
  },
  {
    id: 'StorageUnitAuctionList',
    displayName: 'StorageUnitAuctionList.com',
    type: 'directory',
    runMode: 'national-once',
    enabled: false, // PARKED — paid subscriber-only database. All listings behind paywall + Cloudflare blocks VM IPs.
    qualityTier: 'high',
    legalNote: 'Paid subscriber paywall — 51,000+ facilities, 10,000+ auctions/month, all 50 states. Data is proprietary (staff-verified, not public scrape). Cloudflare blocks VM/server IPs. Unpark: data licensing agreement OR authenticated session scraping (requires paid subscription). Verified 2026-06-10.',
    run: scrapeStorageUnitAuctionList,
  },
  {
    id: 'StorageBattles',
    displayName: 'StorageBattles.com',
    type: 'directory',
    runMode: 'national-once',
    enabled: false, // PARKED — StorageTreasures white-label alias. Same Next.js SPA, same API backend.
    qualityTier: 'low',
    legalNote: 'Confirmed StorageTreasures alias: __NEXT_DATA__ appConfig.appUrl = storagetreasures.com, apiEndPoint = api.st-prd-1.aws.storagetreasures.com. Same constraints as StorageTreasures (parked). Redundant — any StorageTreasures unpark covers this domain. Verified 2026-06-10.',
    run: scrapeStorageBattles,
  },
  // ─── Auction House / Estate Sale / Antique Dealer Directories (2026-06-10) ───
  {
    id: 'Invaluable',
    displayName: 'Invaluable.com (Auction House Directory)',
    type: 'directory',
    runMode: 'national-once',
    enabled: true,
    qualityTier: 'high',
    legalNote: 'ToS GRAY — ToS page is JS-rendered (CSR-only), not accessible via static fetch. robots.txt blank (no Disallow rules). Public unauthenticated JSON REST API at /auction-houses endpoint linked from main nav. 8,158 US auction houses with name, city, state, phone, email, website. Same GRAY classification as StorageAuctions.com. Verified 2026-06-10.',
    run: scrapeInvaluable,
  },
  {
    id: 'AuctionZip',
    displayName: 'AuctionZip.com (Auctioneer Directory)',
    type: 'directory',
    runMode: 'national-once',
    enabled: true,
    qualityTier: 'high',
    legalNote: "ToS CLEAR — ToS Section 4 states content is public information usable for personal and commercial use. robots.txt disallows only /cgi-bin/*, /search, /my-account, /login, /bidNow — /Auctioneer-Directory/ explicitly allowed. Static HTML A–Z letter pages, ~25,000 US auction houses. Verified 2026-06-10.",
    run: async (_metro: string, _organizerId: string, _rateLimiter: RateLimiter): Promise<ScrapeStats> => {
      await runAuctionZipScraper();
      return {
        itemsFound: 0,
        itemsCreated: 0,
        itemsUpdated: 0,
        itemsSkipped: 0,
        itemsFailed: 0,
      };
    },
  },
  {
    id: 'SellMyAntiques',
    displayName: 'SellMyAntiques.com (Antique Dealer Directory)',
    type: 'directory',
    runMode: 'national-once',
    enabled: false,
    qualityTier: 'medium',
    legalNote: 'ToS CLEAR — no anti-scraping clause. robots.txt blank. Site is fully JS-rendered (Next.js SPA); /dealers returns empty shell via static fetch. Unpark: Playwright headless or REST API discovery via DevTools. Strong Phase 2 candidate for ANTIQUE_DEALER ingestion. Verified 2026-06-10.',
    run: scrapeSellMyAntiques,
  },
  {
    id: 'Proxibid',
    displayName: 'Proxibid.com',
    type: 'directory',
    runMode: 'national-once',
    enabled: false,
    prohibited: true,
    qualityTier: 'high',
    legalNote: 'ToS PROHIBITED — Proxibid Unified User Agreement (PDF /docs/ProxibidUUA.pdf): §10(h) bans scraping/spidering/crawling; §11.1(v) explicit prohibited use; §12 IP protection. ~30,000 auction houses on platform. Parent: Auction Technology Group (ATG). Note: BidSpotter (also ATG) has separate CLEAR ToS. Unpark requires written data partnership with ATG. Verified 2026-06-10.',
    run: scrapeProxibid,
  },
  {
    id: 'Fleamapket',
    displayName: 'Fleamapket.com (Flea Market & Antique Directory)',
    type: 'directory',
    runMode: 'national-once',
    enabled: true,
    // No cronSchedule — triggered via GitHub Actions (scrape-fleamapket.yml).
    qualityTier: 'high',
    legalNote: 'robots.txt explicitly ALLOWS /listing/, /listing-category/, /listing-region/. ToS: no anti-scraping language found. Static WordPress HTML. ~400 US flea markets, antique malls, and auction houses with structured JSON-LD data (name, address, phone, website, lat/lng). Verified 2026-06-12.',
    run: scrapeFleamapket,
  },
  {
    id: 'EstateSalesOrg',
    displayName: 'EstateSales.org (Estate Sale Company Directory)',
    type: 'directory',
    runMode: 'national-once',
    enabled: true,
    qualityTier: 'high',
    legalNote: 'robots.txt: Permissive for *; ClaudeBot blocked from /photos ONLY — company directory is not blocked. ToS: No anti-scraping prohibition found. Server-rendered HTML confirmed. ~4,000 US estate sale companies with name, city, state, phone (optional), website (optional). Verified 2026-06-12.',
    run: scrapeEstateSalesOrg,
  },
  {
    id: 'SwapmeetDirectory',
    displayName: 'SwapmeetDirectory.com (Flea Market & Swap Meet Directory)',
    type: 'directory',
    runMode: 'national-once',
    enabled: true,
    qualityTier: 'medium',
    legalNote: 'robots.txt fully open (only blocks /wp-admin and WooCommerce paths). No ToS scraping prohibition found. ~890 US flea market and swap meet listings with name, city, state, phone, website, lat/lng. Verified 2026-06-12.',
    run: scrapeSwapmeetDirectory,
  },
  {
    id: 'NASMM',
    displayName: 'NASMM.org (Senior Move Manager Directory)',
    type: 'directory',
    runMode: 'national-once',
    enabled: true,
    qualityTier: 'medium',
    legalNote: 'Public member directory. robots.txt Crawl-Delay: 10 enforced internally with 10–12s inter-state delay. /find-a-move-manager/ path not disallowed. ~900 US senior move manager companies — frequently run or refer estate sales. Verified 2026-06-12.',
    run: scrapeNASMM,
  },
];

export function getSourceById(id: string): ScraperSourceDef | undefined {
  return SOURCE_REGISTRY.find((s) => s.id === id);
}

export function getEnabledSources(): ScraperSourceDef[] {
  return SOURCE_REGISTRY.filter((s) => s.enabled && !s.prohibited);
}

export const VALID_SOURCE_IDS: string[] = SOURCE_REGISTRY.map((s) => s.id);
