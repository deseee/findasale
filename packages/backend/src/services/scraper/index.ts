/**
 * ADR-073: Directory Scraper Phase 1 — Main orchestrator
 * Runs scraping jobs, manages dedup, tracks audit trail
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ParsedListing } from './htmlParser';
import { checkDuplicate } from './dedupe';
import { RateLimiter, defaultRateLimiter } from './rateLimiter';
import { scrapeEstateSalesNet } from './sources/estatesalesnet';
import { scrapeGarageSaleFinder } from './sources/garageSaleFinder';
import { scrapeFacebookMarketplace } from './sources/facebook-marketplace';
import { scrapeTheSaleSeker } from './sources/saleSeeker';
import { enrichOrganizer } from './enrichment';

export interface ScrapeJob {
  source: string;
  metro: string;
  organizerId?: string;
}

export interface ScrapedItem extends ParsedListing {
  sourceUrl: string;
  sourceName: string;
  sourceItemId?: string;
  scrapedMetadata?: Record<string, any>;
}

/** Singleton system organizer ID (cached after first lookup) */
let _systemOrganizerId: string | null = null;

/**
 * Get or create the system organizer used for all unmanaged scraped listings.
 * This is a singleton placeholder — real organizer is linked when a sale is claimed.
 */
export async function getOrCreateSystemOrganizer(): Promise<string> {
  if (_systemOrganizerId) return _systemOrganizerId;

  const SYSTEM_EMAIL = 'system-scraper@finda.sale';

  const existing = await prisma.user.findUnique({
    where: { email: SYSTEM_EMAIL },
    include: { organizer: { select: { id: true } } },
  });

  if (existing?.organizer?.id) {
    _systemOrganizerId = existing.organizer.id;
    return existing.organizer.id;
  }

  // Create system user + organizer
  const created = await prisma.user.create({
    data: {
      email: SYSTEM_EMAIL,
      name: 'FindA.Sale Directory',
      role: 'ORGANIZER',
      roles: ['ORGANIZER'],
      organizer: {
        create: {
          businessName: 'FindA.Sale Directory',
          phone: '000-000-0000',
          address: 'National',
          isClaimed: false,
          isUnmanagedListing: true,
        },
      },
    },
    include: { organizer: { select: { id: true } } },
  });

  _systemOrganizerId = created.organizer!.id;
  console.log(`[scraper] Created system organizer: ${_systemOrganizerId}`);

  // Fire-and-forget enrichment (non-blocking)
  enrichOrganizer(
    created.organizer!.id,
    'FindA.Sale Directory',
    'National',
    'US'
  ).catch((err) => console.error('[scraper] Enrichment failed silently:', err));

  return _systemOrganizerId!;
}

/**
 * Normalize a business name for dedup matching: lowercase, remove non-alphanumeric, collapse whitespace.
 * Example: "Antque Mall & Co." → "antque mall co"
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '') // Remove special chars except spaces
    .replace(/\s+/g, ' ') // Collapse multiple spaces to single
    .trim();
}

/**
 * Recalculate corroboration score based on source count.
 * 1 source = 0.5, 2 = 0.7, 3 = 0.85, 4+ = 0.95
 */
function recalculateCorroborationScore(sourceCount: number): number {
  if (sourceCount <= 1) return 0.5;
  if (sourceCount === 2) return 0.7;
  if (sourceCount === 3) return 0.85;
  return 0.95;
}

/**
 * Convert lat/lng to grid cell for proximity matching.
 * gridSizeMeters defaults to 100m ≈ 0.0009 degrees
 */
function geocodeToGrid(lat: number, lng: number, gridSizeMeters: number = 100): string {
  const cellSize = gridSizeMeters / 111000;
  const gridLat = Math.floor(lat / cellSize);
  const gridLng = Math.floor(lng / cellSize);
  return `${gridLat}:${gridLng}`;
}

/**
 * Generate dedupeKey from business name and city.
 * Format: normalized-name:normalized-city
 */
function generateDedupeKey(name: string, city: string): string {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, '-');
  return `${normalize(name)}:${normalize(city)}`;
}

/**
 * Validate and sanitize an email address for storage.
 * Returns the email if valid and external (not @system.finda.sale), otherwise null.
 */
function isValidExternalEmail(email?: string): string | null {
  if (!email || typeof email !== 'string') return null;
  const trimmed = email.trim();
  // Basic email regex check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) return null;
  // Exclude system emails
  if (trimmed.includes('@system.finda.sale')) return null;
  return trimmed;
}

/**
 * Get or create a scraped organizer with per-source attribution.
 * One system user per business per source (e.g., scraper+john-doe-estatesalesnet@system.finda.sale)
 * Automatically triggers enrichment to fill in phone, website, logo.
 *
 * Dedup strategy (in priority order):
 * 1. googlePlaceId (exact match)
 * 2. foursquareVenueId (exact match)
 * 3. hereBusinessId (exact match)
 * 4. name + city (normalized case-insensitive DB match)
 *
 * When a match is found, backfill missing cross-source IDs to merge data.
 *
 * ADR-075: Business category filter — only estate/antique/consignment/secondary sale categories allowed.
 * Off-target categories (tire shops, hotels, fast food, government, etc.) are rejected at ingest time.
 */
async function getOrCreateScrapedOrganizer(
  businessName: string,
  sourceName: string,
  city: string,
  state: string,
  esnOrgId?: number,
  googlePlaceId?: string,
  foursquareVenueId?: string,
  hereBusinessId?: string,
  businessCategory?: string,
  contactEmail?: string
): Promise<string | null> {
  // ADR-075: Validate businessCategory against allowlist
  const VALID_CATEGORIES = new Set([
    'ESTATE_SALE_CO',
    'AUCTION_HOUSE',
    'ANTIQUE_MALL',
    'ANTIQUE_DEALER',
    'CONSIGNMENT',
    'THRIFT_STORE',
    'FLEA_MARKET',
    'VINTAGE',
    'LIQUIDATION',
    'USED_FURNITURE',
    'PAWN_SHOP',
    'USED_BOOKSTORE',
    'RECORD_STORE',
    'USED_ELECTRONICS',
    'COIN_DEALER',
    'RESALE_SHOP',
    'USED_SPORTING_GOODS',
    'JEWELRY_RESALE',
  ]);

  if (businessCategory && !VALID_CATEGORIES.has(businessCategory)) {
    console.log(
      `[Ingest] Rejected organizer — off-target category`
    );
    return null;
  }
  // ADR-077 Phase 2: Multi-source dedup + corroboration merge
  // Check by googlePlaceId first — strongest dedup signal.
  if (googlePlaceId) {
    const byPlaceId = await prisma.organizer.findFirst({
      where: { googlePlaceId },
      select: { id: true, googlePlaceId: true, foursquareVenueId: true, hereBusinessId: true, contactEmail: true, sourceCount: true, sourcesJson: true },
    });
    if (byPlaceId) {
      // Backfill missing source IDs and email, merge corroboration data
      const updates: Record<string, unknown> = {};
      if (foursquareVenueId && !byPlaceId.foursquareVenueId) updates.foursquareVenueId = foursquareVenueId;
      if (hereBusinessId && !byPlaceId.hereBusinessId) updates.hereBusinessId = hereBusinessId;
      if (esnOrgId) updates.esnOrgId = esnOrgId;
      if (businessCategory) updates.businessCategory = businessCategory;
      const validEmail = isValidExternalEmail(contactEmail);
      if (validEmail && !byPlaceId.contactEmail) updates.contactEmail = validEmail;

      // Corroboration merge: increment source count and update sourcesJson
      const newSourceCount = (byPlaceId.sourceCount || 1) + 1;
      const currentSources = (byPlaceId.sourcesJson as any[]) || [];
      const newSource = { sourceName, sourceId: googlePlaceId, lastSeen: new Date().toISOString() };
      const updatedSources = [...currentSources, newSource];

      updates.sourceCount = newSourceCount;
      updates.sourcesJson = updatedSources;
      updates.corroborationScore = recalculateCorroborationScore(newSourceCount);
      updates.updatedAt = new Date();

      if (Object.keys(updates).length > 0) {
        await prisma.organizer.update({ where: { id: byPlaceId.id }, data: updates });
      }
      return byPlaceId.id;
    }
  }

  // Check by foursquareVenueId if present
  if (foursquareVenueId) {
    const byFoursquare = await prisma.organizer.findFirst({
      where: { foursquareVenueId },
      select: { id: true, googlePlaceId: true, foursquareVenueId: true, hereBusinessId: true, contactEmail: true, sourceCount: true, sourcesJson: true },
    });
    if (byFoursquare) {
      const updates: Record<string, unknown> = {};
      if (googlePlaceId && !byFoursquare.googlePlaceId) updates.googlePlaceId = googlePlaceId;
      if (hereBusinessId && !byFoursquare.hereBusinessId) updates.hereBusinessId = hereBusinessId;
      if (esnOrgId) updates.esnOrgId = esnOrgId;
      if (businessCategory) updates.businessCategory = businessCategory;
      const validEmail = isValidExternalEmail(contactEmail);
      if (validEmail && !byFoursquare.contactEmail) updates.contactEmail = validEmail;

      // Corroboration merge
      const newSourceCount = (byFoursquare.sourceCount || 1) + 1;
      const currentSources = (byFoursquare.sourcesJson as any[]) || [];
      const newSource = { sourceName, sourceId: foursquareVenueId, lastSeen: new Date().toISOString() };
      const updatedSources = [...currentSources, newSource];

      updates.sourceCount = newSourceCount;
      updates.sourcesJson = updatedSources;
      updates.corroborationScore = recalculateCorroborationScore(newSourceCount);
      updates.updatedAt = new Date();

      if (Object.keys(updates).length > 0) {
        await prisma.organizer.update({ where: { id: byFoursquare.id }, data: updates });
      }
      return byFoursquare.id;
    }
  }

  // Check by hereBusinessId if present
  if (hereBusinessId) {
    const byHere = await prisma.organizer.findFirst({
      where: { hereBusinessId },
      select: { id: true, googlePlaceId: true, foursquareVenueId: true, hereBusinessId: true, contactEmail: true, sourceCount: true, sourcesJson: true },
    });
    if (byHere) {
      const updates: Record<string, unknown> = {};
      if (googlePlaceId && !byHere.googlePlaceId) updates.googlePlaceId = googlePlaceId;
      if (foursquareVenueId && !byHere.foursquareVenueId) updates.foursquareVenueId = foursquareVenueId;
      if (esnOrgId) updates.esnOrgId = esnOrgId;
      if (businessCategory) updates.businessCategory = businessCategory;
      const validEmail = isValidExternalEmail(contactEmail);
      if (validEmail && !byHere.contactEmail) updates.contactEmail = validEmail;

      // Corroboration merge
      const newSourceCount = (byHere.sourceCount || 1) + 1;
      const currentSources = (byHere.sourcesJson as any[]) || [];
      const newSource = { sourceName, sourceId: hereBusinessId, lastSeen: new Date().toISOString() };
      const updatedSources = [...currentSources, newSource];

      updates.sourceCount = newSourceCount;
      updates.sourcesJson = updatedSources;
      updates.corroborationScore = recalculateCorroborationScore(newSourceCount);
      updates.updatedAt = new Date();

      if (Object.keys(updates).length > 0) {
        await prisma.organizer.update({ where: { id: byHere.id }, data: updates });
      }
      return byHere.id;
    }
  }

  // Fallback: Try to find existing organizer by dedupeKey first, then normalized businessName + city
  const dedupeKey = generateDedupeKey(businessName, city);
  const byDedupeKey = await prisma.organizer.findFirst({
    where: { dedupeKey },
    select: { id: true, businessName: true, googlePlaceId: true, foursquareVenueId: true, hereBusinessId: true, contactEmail: true, sourceCount: true, sourcesJson: true },
  });

  if (byDedupeKey) {
    const updates: Record<string, unknown> = {};
    if (googlePlaceId && !byDedupeKey.googlePlaceId) updates.googlePlaceId = googlePlaceId;
    if (foursquareVenueId && !byDedupeKey.foursquareVenueId) updates.foursquareVenueId = foursquareVenueId;
    if (hereBusinessId && !byDedupeKey.hereBusinessId) updates.hereBusinessId = hereBusinessId;
    if (esnOrgId) updates.esnOrgId = esnOrgId;
    if (businessCategory) updates.businessCategory = businessCategory;
    const validEmail = isValidExternalEmail(contactEmail);
    if (validEmail && !byDedupeKey.contactEmail) updates.contactEmail = validEmail;

    // Corroboration merge
    const newSourceCount = (byDedupeKey.sourceCount || 1) + 1;
    const currentSources = (byDedupeKey.sourcesJson as any[]) || [];
    const newSource = { sourceName, sourceId: dedupeKey, lastSeen: new Date().toISOString() };
    const updatedSources = [...currentSources, newSource];

    updates.sourceCount = newSourceCount;
    updates.sourcesJson = updatedSources;
    updates.corroborationScore = recalculateCorroborationScore(newSourceCount);
    updates.updatedAt = new Date();

    if (Object.keys(updates).length > 0) {
      await prisma.organizer.update({ where: { id: byDedupeKey.id }, data: updates });
    }
    return byDedupeKey.id;
  }

  // Fallback: Try to find existing organizer by normalized businessName + city
  // Fetch candidates in the same city that are unmanaged listings, then match by normalized name
  const candidates = await prisma.organizer.findMany({
    where: {
      isUnmanagedListing: true,
      address: { contains: city },
    },
    select: { id: true, businessName: true, googlePlaceId: true, foursquareVenueId: true, hereBusinessId: true, contactEmail: true, sourceCount: true, sourcesJson: true },
  });

  const normalizedName = normalizeName(businessName);
  const existing = candidates.find((c) => normalizeName(c.businessName) === normalizedName);

  if (existing) {
    // Backfill all source IDs and email we now have
    const updates: Record<string, unknown> = {};
    if (googlePlaceId && !existing.googlePlaceId) updates.googlePlaceId = googlePlaceId;
    if (foursquareVenueId && !existing.foursquareVenueId) updates.foursquareVenueId = foursquareVenueId;
    if (hereBusinessId && !existing.hereBusinessId) updates.hereBusinessId = hereBusinessId;
    if (esnOrgId) updates.esnOrgId = esnOrgId;
    if (businessCategory) updates.businessCategory = businessCategory;
    const validEmail = isValidExternalEmail(contactEmail);
    if (validEmail && !existing.contactEmail) updates.contactEmail = validEmail;

    // Corroboration merge
    const newSourceCount = (existing.sourceCount || 1) + 1;
    const currentSources = (existing.sourcesJson as any[]) || [];
    const newSource = { sourceName, sourceId: `${normalizedName}:${city}`, lastSeen: new Date().toISOString() };
    const updatedSources = [...currentSources, newSource];

    updates.sourceCount = newSourceCount;
    updates.sourcesJson = updatedSources;
    updates.corroborationScore = recalculateCorroborationScore(newSourceCount);
    updates.updatedAt = new Date();

    // Set dedupeKey if not already set
    if (!existing.dedupeKey) {
      updates.dedupeKey = dedupeKey;
    }

    if (Object.keys(updates).length > 0) {
      await prisma.organizer.update({ where: { id: existing.id }, data: updates });
    }
    return existing.id;
  }

  // Create new organizer
  // Email pattern: scraper+{slug}-{city}-{state}-{source}@system.finda.sale
  // Include city+state to avoid collisions across metros (e.g. two "Goodwill" locations)
  const slug = businessName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40);
  const citySlug = city.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 20);
  const stateSlug = state.toLowerCase().slice(0, 3);
  const sourceSlug = sourceName.toLowerCase();
  const systemEmail = `scraper+${slug}-${citySlug}-${stateSlug}-${sourceSlug}@system.finda.sale`;

  let newOrgId: string;
  try {
    const validEmail = isValidExternalEmail(contactEmail);
    const created = await prisma.user.create({
      data: {
        email: systemEmail,
        name: businessName,
        password: null,
        role: 'ORGANIZER',
        roles: ['ORGANIZER'],
        organizer: {
          create: {
            businessName,
            phone: null,
            address: `${city}, ${state}`,
            bio: `Sale organizer based in ${city}, ${state}.`,
            isClaimed: false,
            isUnmanagedListing: true,
            esnOrgId,
            googlePlaceId,
            businessCategory,
            contactEmail: validEmail || null,
            dedupeKey: generateDedupeKey(businessName, city),
            sourceCount: 1,
            sourcesJson: [{ sourceName, sourceId: googlePlaceId, lastSeen: new Date().toISOString() }],
            corroborationScore: 0.5,
          },
        },
      },
      include: { organizer: { select: { id: true } } },
    });
    newOrgId = created.organizer!.id;
  } catch (err: any) {
    // P2002 = unique constraint on email — either a race condition or a same-name/same-city
    // business from a different source. Retry with a timestamp suffix to get a unique email.
    if (err?.code === 'P2002' && err?.meta?.target?.includes('email')) {
      const validEmail = isValidExternalEmail(contactEmail);
      const fallbackEmail = `scraper+${slug}-${citySlug}-${stateSlug}-${sourceSlug}-${Date.now()}@system.finda.sale`;
      const created2 = await prisma.user.create({
        data: {
          email: fallbackEmail,
          name: businessName,
          password: null,
          role: 'ORGANIZER',
          roles: ['ORGANIZER'],
          organizer: {
            create: {
              businessName,
              phone: null,
              address: `${city}, ${state}`,
              bio: `Sale organizer based in ${city}, ${state}.`,
              isClaimed: false,
              isUnmanagedListing: true,
              esnOrgId,
              googlePlaceId,
              businessCategory,
              contactEmail: validEmail || null,
              dedupeKey: generateDedupeKey(businessName, city),
              sourceCount: 1,
              sourcesJson: [{ sourceName, sourceId: googlePlaceId, lastSeen: new Date().toISOString() }],
              corroborationScore: 0.5,
            },
          },
        },
        include: { organizer: { select: { id: true } } },
      });
      newOrgId = created2.organizer!.id;
    } else {
      throw err;
    }
  }
  console.log(`[scraper] Created organizer: ${newOrgId}`);

  // Fire enrichment non-blocking
  enrichOrganizer(newOrgId, businessName, city, state).catch((err) =>
    console.error('[scraper] Enrichment failed (non-blocking):', err)
  );

  return newOrgId;
}

/**
 * Main scraping entry point.
 * Supports: EstateSalesNet | GarageSaleFinder
 */
export async function runScrapeRun(source: string, metro: string): Promise<void> {
  const jobId = await createScrapeJob(source, metro);
  const rateLimiter = new RateLimiter({ requestsPerSecond: 1, maxRetries: 3 });

  try {
    console.log(`[scraper] Starting job ${jobId} — ${source} / ${metro}`);

    const systemOrganizerId = await getOrCreateSystemOrganizer();

    let stats = { created: 0, updated: 0, skipped: 0, failed: 0 };

    if (source === 'EstateSalesNet') {
      stats = await scrapeEstateSalesNet(metro, systemOrganizerId, rateLimiter);
    } else if (source === 'GarageSaleFinder') {
      stats = await scrapeGarageSaleFinder(metro, systemOrganizerId, rateLimiter);
    } else if (source === 'FacebookMarketplace') {
      stats = await scrapeFacebookMarketplace(metro, systemOrganizerId, rateLimiter);
    } else if (source === 'SaleSeker') {
      stats = await scrapeTheSaleSeker(metro, systemOrganizerId, rateLimiter);
    } else {
      console.warn(`[scraper] Unknown source: ${source} — skipping`);
    }

    const itemsFound = stats.created + stats.skipped + stats.failed;
    console.log(`[scraper] Job ${jobId} complete — found ${itemsFound}, created ${stats.created}, skipped ${stats.skipped}, failed ${stats.failed}`);

    await finishScrapeJob(jobId, 'SUCCESS', {
      itemsFound,
      itemsCreated: stats.created,
      itemsUpdated: stats.updated,
      itemsSkipped: stats.skipped,
      itemsFailed: stats.failed,
    });
  } catch (error) {
    console.error(`[scraper] Job ${jobId} failed:`, error);
    await finishScrapeJob(jobId, 'FAILED', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Create a new ScrapedSalesJob record
 */
async function createScrapeJob(source: string, metro: string): Promise<number> {
  const job = await prisma.scrapedSalesJob.create({
    data: { source, metro, status: 'RUNNING' },
  });
  return job.id;
}

/**
 * Finish a scrape job with final status and stats
 */
async function finishScrapeJob(
  jobId: number,
  status: 'SUCCESS' | 'PARTIAL_FAILURE' | 'FAILED',
  stats: {
    itemsFound?: number;
    itemsCreated?: number;
    itemsUpdated?: number;
    itemsSkipped?: number;
    itemsFailed?: number;
    error?: string;
  }
): Promise<void> {
  await prisma.scrapedSalesJob.update({
    where: { id: jobId },
    data: {
      status,
      completedAt: new Date(),
      itemsFound: stats.itemsFound ?? 0,
      itemsCreated: stats.itemsCreated ?? 0,
      itemsUpdated: stats.itemsUpdated ?? 0,
      itemsSkipped: stats.itemsSkipped ?? 0,
      itemsFailed: stats.itemsFailed ?? 0,
      error: stats.error,
    },
  });
}

/**
 * Map a saleType string to auto-generated tags for a new listing.
 * Only applied on create — never overwrites organizer-curated tags on update.
 */
function saleTypeToTags(saleType?: string): string[] {
  switch (saleType) {
    case 'ESTATE':
      return ['estate-sale'];
    case 'AUCTION':
      return ['auction'];
    case 'GARAGE':
      return ['garage-sale'];
    case 'FLEA_MARKET':
      return ['flea-market'];
    default:
      return [];
  }
}

/**
 * Ingest a single scraped listing into the database.
 * Handles dedup, validation, and DB insertion.
 */
export async function ingestScrapedListing(
  listing: ScrapedItem,
  organizerId?: string
): Promise<{ saleId?: string; status: 'created' | 'updated' | 'skipped' | 'failed'; reason?: string }> {
  try {
    // Dedup check
    const dupeResult = await checkDuplicate(
      listing,
      listing.sourceName,
      listing.sourceUrl,
      listing.sourceItemId
    );

    if (dupeResult.isDuplicate) {
      // Update lastScrapedAt to keep listings fresh
      if (dupeResult.existingSaleId) {
        await prisma.sale.update({
          where: { id: dupeResult.existingSaleId },
          data: { lastScrapedAt: new Date() },
        });
      }
      return {
        saleId: dupeResult.existingSaleId,
        status: 'skipped',
        reason: `Duplicate: ${dupeResult.reason}`,
      };
    }

    // Validate required fields. Address is intentionally NOT required —
    // EstateSalesNet (and similar directories) routinely hide street addresses
    // for security/privacy until the day of the sale. ZIP is also not required
    // Some sources don't provide postal codes. City + state
    // is sufficient to place the sale on the map. Address and ZIP can be filled in later.
    if (!listing.title || !listing.city || !listing.state || !listing.startDate || !listing.endDate) {
      return {
        status: 'failed',
        reason: 'Missing required fields (title, city, state, startDate, endDate)',
      };
    }

    // RETAIL deduplication: check if same address already exists
    if (listing.saleType === 'RETAIL') {
      const existing = await prisma.sale.findFirst({
        where: {
          address: listing.address || '',
          city: listing.city,
          state: listing.state,
          saleType: 'RETAIL',
        },
      });
      
      if (existing) {
        // Update existing record with better data
        const updates: any = {};
        if (listing.description) updates.description = listing.description;
        if (listing.photoUrls && listing.photoUrls.length > 0) updates.photoUrls = listing.photoUrls;
        if (listing.scrapedMetadata) {
          updates.scrapedMetadata = {
            ...((existing.scrapedMetadata as Record<string, unknown>) || {}),
            ...(listing.scrapedMetadata as Record<string, unknown>),
          };
        }
        
        if (Object.keys(updates).length > 0) {
          await prisma.sale.update({
            where: { id: existing.id },
            data: { ...updates, lastScrapedAt: new Date() },
          });
        }
        
        return {
          saleId: existing.id,
          status: 'updated',
          reason: 'RETAIL duplicate merged',
        };
      }
    }

    // Resolve organizer — organizer name always wins over passed organizerId.
    // organizerId is only used as a fallback when the listing has no named organizer.
    let finalOrganizerId: string;
    if (listing.organizerName && listing.organizerName.trim()) {
      const createdOrgId = await getOrCreateScrapedOrganizer(
        listing.organizerName.trim(),
        listing.sourceName,
        listing.city,
        listing.state,
        listing.esnOrgId,
        listing.googlePlaceId,
        listing.foursquareVenueId,
        listing.hereBusinessId,
        listing.businessCategory,
        listing.organizerEmail
      );
      // ADR-075: If organizer was rejected due to off-target category, skip this listing
      if (createdOrgId === null) {
        return {
          status: 'skipped',
          reason: 'Organizer rejected — off-target business category',
        };
      }
      finalOrganizerId = createdOrgId;
    } else if (organizerId) {
      finalOrganizerId = organizerId;
    } else {
      finalOrganizerId = await getOrCreateSystemOrganizer();
    }

    // Update directoryMostRecentSource for scraped listings (from Foursquare, HERE, OSM)
    if (listing.sourceName && ['Foursquare', 'HEREPlaces', 'OSM'].includes(listing.sourceName)) {
      await prisma.organizer.update({
        where: { id: finalOrganizerId },
        data: {
          directoryMostRecentSource: listing.sourceName,
          directoryMostRecentAt: new Date(),
        },
      });
    }

    // Extract lat/lng from top-level or scrapedMetadata (ESN stores them in metadata)
    const lat =
      (listing as any).lat ??
      (listing.scrapedMetadata?.lat as number | undefined) ??
      null;
    const lng =
      (listing as any).lng ??
      (listing.scrapedMetadata?.lng as number | undefined) ??
      null;

    // Create the Sale
    const sale = await prisma.sale.create({
      data: {
        title: listing.title,
        address: listing.address,
        city: listing.city,
        state: listing.state,
        zip: listing.zip ?? '', // ZIP may be absent for some sources — empty string satisfies schema non-null
        startDate: listing.startDate,
        endDate: listing.endDate,
        description: listing.description ?? null,
        status: 'PUBLISHED',
        saleType: listing.saleType ?? 'ESTATE',
        isAuctionSale: listing.saleType === 'AUCTION',
        lat,
        lng,
        photoUrls: listing.photoUrls ?? [],
        tags: saleTypeToTags(listing.saleType),
        organizerId: finalOrganizerId,
        sourceUrl: listing.sourceUrl,
        sourceName: listing.sourceName,
        lastScrapedAt: new Date(),
        scrapeVersion: 1,
        scrapedMetadata: listing.scrapedMetadata ?? Prisma.JsonNull,
      },
    });

    return { saleId: sale.id, status: 'created' };
  } catch (error) {
    console.error('[scraper] Failed to ingest listing:', error);
    return {
      status: 'failed',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

// Re-export utilities for adapters
export { defaultRateLimiter };
export * from './htmlParser';
export * from './dedupe';
export * from './rateLimiter';
