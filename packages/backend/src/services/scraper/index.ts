/**
 * ADR-073: Directory Scraper Phase 1 — Main orchestrator
 * Runs scraping jobs, manages dedup, tracks audit trail
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ParsedListing } from './htmlParser';
import { checkDuplicate } from './dedupe';
import { RateLimiter, defaultRateLimiter } from './rateLimiter';
import { enrichOrganizer } from './enrichment';
import { getSourceById } from './sourceRegistry';
import {
  isGenericEmail,
  registrableDomain,
  emailDomain,
  domainMatchesBusiness,
  FAMOUS_UNRELATED_DOMAINS,
} from '../emailProvenance';
import {
  isBlockedWebsiteDomain,
  isAggregatorDomain,
  classifySocialHost,
} from '../../config/domainBlocklist';
import { triggerSaleAndCityRevalidation, citySlugFromCityState } from '../revalidationService';

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
    .replace(/\s*&\s*/g, ' and ')  // expand & → and BEFORE stripping
    .replace(/\s*\+\s*/g, ' and ') // expand + → and too
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
  const normalize = (s: string) =>
    s.toLowerCase()
      .replace(/\s*&\s*/g, ' and ')
      .replace(/\s*\+\s*/g, ' and ')
      .replace(/[^a-z0-9\s]/g, '')
      .trim()
      .replace(/\s+/g, '-');
  return `${normalize(name)}:${normalize(city)}`;
}

/**
 * Decode and sanitise a raw scraped email before storage.
 *
 * Handles the three malformed-email patterns found in the wild:
 *   1. HTML entity encoding  — &#116;&#104;&#101;&#099;&#111;&#064;… (decimal or hex &#x…;)
 *   2. Percent-encoding      — %40 → @, %20 → space, %2e → dot
 *   3. Leading/trailing junk — " info@…" (space), "email:%20…" prefix, trailing "/", "&nbsp;"
 *
 * Returns the cleaned, lowercased email if it passes format validation,
 * or null if the result is still malformed.
 */
function cleanScrapedEmail(raw: string): string | null {
  if (!raw) return null;
  let cleaned = raw;

  // 1. Decode HTML entities — decimal (&#116;) and hex (&#x74;) and named (&amp; &quot;)
  cleaned = cleaned
    .replace(/&#x([0-9a-fA-F]+);/g, (_: string, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#([0-9]+);?/g, (_: string, dec: string) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, '');

  // 2. Percent-decode (e.g. %40 → @, %20 → space, %2e → .)
  try { cleaned = decodeURIComponent(cleaned); } catch { /* leave as-is if malformed */ }

  // 3. Strip "email:" or "Email:" prefix
  cleaned = cleaned.replace(/^email:\s*/i, '');

  // 4. Strip surrounding whitespace, quotes, angle brackets
  cleaned = cleaned.trim().replace(/^["'<]+|["'>]+$/g, '').trim();

  // 5. Strip trailing slash / backslash
  cleaned = cleaned.replace(/[\/\\]+$/, '').trim();

  // 6. Basic email format validation: one @, dot in domain, no spaces or remaining junk
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleaned)) return null;
  if (cleaned.includes('%') || cleaned.includes('&') || cleaned.includes(' ') || cleaned.includes('#')) return null;
  if (cleaned.length < 5) return null;

  return cleaned.toLowerCase();
}

/**
 * Validate and sanitize an email address for storage.
 * Decodes HTML entities and percent-encoding before format checking.
 * Returns the cleaned email if valid and external (not @system.finda.sale), otherwise null.
 */
function isValidExternalEmail(email?: string): string | null {
  if (!email || typeof email !== 'string') return null;
  const cleaned = cleanScrapedEmail(email);
  if (!cleaned) return null;
  // Exclude system emails
  if (cleaned.includes('@system.finda.sale')) return null;
  return cleaned;
}

/**
 * Gate a scraped website (from Google Places / Foursquare / HERE) before attaching it.
 * Rejects famous-unrelated mega-brand domains and domains with no name overlap with the
 * business — the guard that stops the wrong site (e.g. disney/club33) being scraped later.
 * Returns the website if acceptable, otherwise null (and logs the skip).
 */
function gateScrapedWebsite(website?: string, businessName?: string, sourceOwnDomain?: string): string | null {
  if (!website) return null;
  const dom = registrableDomain(website);
  if (!dom) {
    console.warn(`[Ingest] Skipped website — unparseable domain: ${website}`);
    return null;
  }
  // Defense-in-depth: reject any blocklisted host (aggregator / social / famous-unrelated)
  // before the name-overlap check, so a blocked domain can never survive as a website even
  // if a caller reaches this gate without first going through routeScrapedWebsite.
  if (isBlockedWebsiteDomain(website)) {
    console.warn(`[Ingest] Skipped website — blocklisted domain: ${dom}`);
    return null;
  }
  // Self-domain guard: never store the source's own directory/aggregator domain as a website.
  if (sourceOwnDomain && dom === sourceOwnDomain) {
    console.warn(`[Ingest] Skipped website — source's own domain: ${dom}`);
    return null;
  }
  if (FAMOUS_UNRELATED_DOMAINS.has(dom)) {
    console.warn(`[Ingest] Skipped website — famous unrelated domain: ${dom}`);
    return null;
  }
  if (!domainMatchesBusiness(dom, businessName)) {
    console.warn(`[Ingest] Skipped website — domain '${dom}' has no name overlap with '${businessName ?? ''}'`);
    return null;
  }
  return website;
}

/**
 * Route a scraped "website" candidate to the destination it actually belongs in.
 * Root cause of the Railway abuse complaint (2026-07): aggregator/social URLs were stored in
 * Organizer.website, which the enrichment/re-fetch pipelines then hammered daily with 403/404s.
 * Routing:
 *   - our own finda.sale domain   -> dropped (never stored as an organizer website)
 *   - social hosts (fb/ig/x/...)  -> the matching Organizer social column (never website)
 *   - aggregator/directory hosts  -> listingUrl (captured, but never fetched as a website)
 *   - a real business site         -> website (after the existing name-overlap gate)
 * Only the destination that applies is returned; unusable candidates return {}.
 */
function routeScrapedWebsite(
  candidate: string | undefined | null,
  businessName?: string,
  sourceOwnDomain?: string
): { website?: string; listingUrl?: string; social?: { field: string; value: string } } {
  if (!candidate) return {};
  const trimmed = candidate.trim();
  if (!trimmed) return {};

  // Self-domain guard — never store our own finda.sale domain as an organizer website.
  if (registrableDomain(trimmed) === 'finda.sale') {
    console.warn(`[Ingest] Skipped website — self-domain (finda.sale): ${trimmed}`);
    return {};
  }

  // Social host -> dedicated social column, never website.
  const social = classifySocialHost(trimmed);
  if (social) return { social };

  // Aggregator / directory host -> listingUrl, never website (and never fetched).
  if (isAggregatorDomain(trimmed)) return { listingUrl: trimmed };

  // Any remaining blocklisted host (famous-unrelated mega-brand, social-without-column) -> drop.
  if (isBlockedWebsiteDomain(trimmed)) {
    console.warn(`[Ingest] Skipped website — blocklisted domain: ${trimmed}`);
    return {};
  }

  // Real business site -> existing name-overlap gate.
  const gated = gateScrapedWebsite(trimmed, businessName, sourceOwnDomain);
  return gated ? { website: gated } : {};
}

/**
 * Apply a routed scraped website onto a Prisma `updates` object. `website` only fills when the
 * existing record has none (never overwrites a good site); a social URL is written to its column
 * and an aggregator/`explicitListingUrl` is captured in listingUrl. Never lets a social/aggregator
 * URL reach Organizer.website.
 */
function applyScrapedWebsite(
  updates: Record<string, unknown>,
  existingWebsite: string | null | undefined,
  website: string | undefined,
  businessName?: string,
  explicitListingUrl?: string
): void {
  const routed = routeScrapedWebsite(website, businessName);
  if (routed.website) {
    if (!existingWebsite) updates.website = routed.website;
  } else if (routed.social) {
    updates[routed.social.field] = routed.social.value;
  }
  const listingUrl = routed.listingUrl ?? (explicitListingUrl ? explicitListingUrl.trim() : undefined);
  if (listingUrl) updates.listingUrl = listingUrl;
}

/**
 * Gate a scraped contact email (from a directory listing) before storing it.
 * Rejects generic mailboxes (info@/admin@/…) and wrong-entity domains (no match to the
 * org website domain AND no token overlap with the business name). Directory-sourced
 * emails are stored with method 'directory_listing' + low confidence so the outreach send
 * gate will NOT email them until emailDiscoveryService re-verifies them.
 * Returns provenance fields to merge into the update, or null if rejected.
 */
function gateScrapedEmail(
  email: string | null,
  website: string | null | undefined,
  businessName?: string
): { contactEmail: string; emailDiscoveryMethod: string; emailDiscoveryConfidence: number; emailDiscoveredAt: Date } | null {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  if (isGenericEmail(normalized)) {
    console.warn(`[Ingest] Rejected generic scraped email: ${normalized}`);
    return null;
  }
  const eDom = emailDomain(normalized);
  if (!eDom) return null;
  const eDomReg = registrableDomain(eDom) ?? eDom;
  const siteDom = registrableDomain(website ?? undefined);
  const matchesSite = siteDom != null && eDomReg === siteDom;
  if (!matchesSite && !domainMatchesBusiness(eDomReg, businessName)) {
    console.warn(`[Ingest] Rejected scraped email '${normalized}' — domain '${eDomReg}' matches neither site '${siteDom ?? 'none'}' nor business '${businessName ?? ''}'`);
    return null;
  }
  // Directory-listing source: stored but NOT send-eligible until re-discovered/verified.
  return {
    contactEmail: email.trim(),
    emailDiscoveryMethod: 'directory_listing',
    emailDiscoveryConfidence: 0.3,
    emailDiscoveredAt: new Date(),
  };
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
export async function getOrCreateScrapedOrganizer(
  businessName: string,
  sourceName: string,
  city: string,
  state: string,
  esnOrgId?: number,
  googlePlaceId?: string,
  foursquareVenueId?: string,
  hereBusinessId?: string,
  businessCategory?: string,
  contactEmail?: string,
  phone?: string,
  website?: string,
  lat?: number,
  lng?: number,
  isStateLicensed?: boolean,
  licenseState?: string,
  licenseNumber?: string,
  sourceLabel?: string,
  listingUrl?: string
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

  // Resolve effective source label: explicit param wins; then sourceName (always present); then 'StateLicensing' for licensed orgs
  const effectiveSourceLabel = sourceLabel ?? sourceName ?? (isStateLicensed ? 'StateLicensing' : undefined);

  // ADR-077 Phase 2: Multi-source dedup + corroboration merge
  // Check by googlePlaceId first — strongest dedup signal.
  if (googlePlaceId) {
    const byPlaceId = await prisma.organizer.findFirst({
      where: { googlePlaceId },
      select: { id: true, googlePlaceId: true, foursquareVenueId: true, hereBusinessId: true, contactEmail: true, phone: true, website: true, sourceCount: true, sourcesJson: true, lat: true, lng: true, isStateLicensed: true, licenseState: true, licenseNumber: true },
    });
    if (byPlaceId) {
      // Backfill missing source IDs and email, merge corroboration data
      const updates: Record<string, unknown> = {};
      if (foursquareVenueId && !byPlaceId.foursquareVenueId) updates.foursquareVenueId = foursquareVenueId;
      if (hereBusinessId && !byPlaceId.hereBusinessId) updates.hereBusinessId = hereBusinessId;
      if (esnOrgId) updates.esnOrgId = esnOrgId;
      if (businessCategory) updates.businessCategory = businessCategory;
      const validEmail = isValidExternalEmail(contactEmail);
      // Provenance + wrong-entity guard (bounce-incident fix): directory-listing emails
      // are stored as low-confidence/non-send-eligible until re-verified.
      const emailGate = gateScrapedEmail(validEmail, byPlaceId.website ?? website, businessName);
      if (emailGate && !byPlaceId.contactEmail) {
        updates.contactEmail = emailGate.contactEmail;
        updates.emailDiscoveryMethod = emailGate.emailDiscoveryMethod;
        updates.emailDiscoveryConfidence = emailGate.emailDiscoveryConfidence;
        updates.emailDiscoveredAt = emailGate.emailDiscoveredAt;
      }
      if (phone && !byPlaceId.phone) updates.phone = phone;
      applyScrapedWebsite(updates, byPlaceId.website, website, businessName, listingUrl);
      if (lat !== undefined && lat !== null && !byPlaceId.lat) updates.lat = lat;
      if (lng !== undefined && lng !== null && !byPlaceId.lng) updates.lng = lng;
      if (isStateLicensed && !byPlaceId.isStateLicensed) updates.isStateLicensed = isStateLicensed;
      if (licenseState && !byPlaceId.licenseState) updates.licenseState = licenseState;
      if (licenseNumber && !byPlaceId.licenseNumber) updates.licenseNumber = licenseNumber;
      if (effectiveSourceLabel) {
        updates.directoryMostRecentSource = effectiveSourceLabel;
        updates.directoryMostRecentAt = new Date();
      }

      // Corroboration merge: only increment if this sourceName is genuinely new
      const currentSources = (byPlaceId.sourcesJson as any[]) || [];
      const sourceAlreadyPresent = currentSources.some((s: any) => s.sourceName === sourceName);
      if (!sourceAlreadyPresent) {
        const newSourceCount = (byPlaceId.sourceCount || 1) + 1;
        const newSource = { sourceName, sourceId: googlePlaceId, lastSeen: new Date().toISOString() };
        updates.sourceCount = newSourceCount;
        updates.sourcesJson = [...currentSources, newSource];
        updates.corroborationScore = recalculateCorroborationScore(newSourceCount);
      }
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
      select: { id: true, googlePlaceId: true, foursquareVenueId: true, hereBusinessId: true, contactEmail: true, phone: true, website: true, sourceCount: true, sourcesJson: true, lat: true, lng: true, isStateLicensed: true, licenseState: true, licenseNumber: true },
    });
    if (byFoursquare) {
      const updates: Record<string, unknown> = {};
      if (googlePlaceId && !byFoursquare.googlePlaceId) updates.googlePlaceId = googlePlaceId;
      if (hereBusinessId && !byFoursquare.hereBusinessId) updates.hereBusinessId = hereBusinessId;
      if (esnOrgId) updates.esnOrgId = esnOrgId;
      if (businessCategory) updates.businessCategory = businessCategory;
      const validEmail = isValidExternalEmail(contactEmail);
      // Provenance + wrong-entity guard (bounce-incident fix): directory-listing emails
      // are stored as low-confidence/non-send-eligible until re-verified.
      const emailGate = gateScrapedEmail(validEmail, byFoursquare.website ?? website, businessName);
      if (emailGate && !byFoursquare.contactEmail) {
        updates.contactEmail = emailGate.contactEmail;
        updates.emailDiscoveryMethod = emailGate.emailDiscoveryMethod;
        updates.emailDiscoveryConfidence = emailGate.emailDiscoveryConfidence;
        updates.emailDiscoveredAt = emailGate.emailDiscoveredAt;
      }
      if (phone && !byFoursquare.phone) updates.phone = phone;
      applyScrapedWebsite(updates, byFoursquare.website, website, businessName, listingUrl);
      if (lat !== undefined && lat !== null && !byFoursquare.lat) updates.lat = lat;
      if (lng !== undefined && lng !== null && !byFoursquare.lng) updates.lng = lng;
      if (isStateLicensed && !byFoursquare.isStateLicensed) updates.isStateLicensed = isStateLicensed;
      if (licenseState && !byFoursquare.licenseState) updates.licenseState = licenseState;
      if (licenseNumber && !byFoursquare.licenseNumber) updates.licenseNumber = licenseNumber;
      if (effectiveSourceLabel) {
        updates.directoryMostRecentSource = effectiveSourceLabel;
        updates.directoryMostRecentAt = new Date();
      }

      // Corroboration merge: only increment if this sourceName is genuinely new
      const currentSources = (byFoursquare.sourcesJson as any[]) || [];
      const sourceAlreadyPresent = currentSources.some((s: any) => s.sourceName === sourceName);
      if (!sourceAlreadyPresent) {
        const newSourceCount = (byFoursquare.sourceCount || 1) + 1;
        const newSource = { sourceName, sourceId: foursquareVenueId, lastSeen: new Date().toISOString() };
        updates.sourceCount = newSourceCount;
        updates.sourcesJson = [...currentSources, newSource];
        updates.corroborationScore = recalculateCorroborationScore(newSourceCount);
      }
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
      select: { id: true, googlePlaceId: true, foursquareVenueId: true, hereBusinessId: true, contactEmail: true, phone: true, website: true, sourceCount: true, sourcesJson: true, lat: true, lng: true, isStateLicensed: true, licenseState: true, licenseNumber: true },
    });
    if (byHere) {
      const updates: Record<string, unknown> = {};
      if (googlePlaceId && !byHere.googlePlaceId) updates.googlePlaceId = googlePlaceId;
      if (foursquareVenueId && !byHere.foursquareVenueId) updates.foursquareVenueId = foursquareVenueId;
      if (esnOrgId) updates.esnOrgId = esnOrgId;
      if (businessCategory) updates.businessCategory = businessCategory;
      const validEmail = isValidExternalEmail(contactEmail);
      // Provenance + wrong-entity guard (bounce-incident fix): directory-listing emails
      // are stored as low-confidence/non-send-eligible until re-verified.
      const emailGate = gateScrapedEmail(validEmail, byHere.website ?? website, businessName);
      if (emailGate && !byHere.contactEmail) {
        updates.contactEmail = emailGate.contactEmail;
        updates.emailDiscoveryMethod = emailGate.emailDiscoveryMethod;
        updates.emailDiscoveryConfidence = emailGate.emailDiscoveryConfidence;
        updates.emailDiscoveredAt = emailGate.emailDiscoveredAt;
      }
      if (phone && !byHere.phone) updates.phone = phone;
      applyScrapedWebsite(updates, byHere.website, website, businessName, listingUrl);
      if (lat !== undefined && lat !== null && !byHere.lat) updates.lat = lat;
      if (lng !== undefined && lng !== null && !byHere.lng) updates.lng = lng;
      if (isStateLicensed && !byHere.isStateLicensed) updates.isStateLicensed = isStateLicensed;
      if (licenseState && !byHere.licenseState) updates.licenseState = licenseState;
      if (licenseNumber && !byHere.licenseNumber) updates.licenseNumber = licenseNumber;
      if (effectiveSourceLabel) {
        updates.directoryMostRecentSource = effectiveSourceLabel;
        updates.directoryMostRecentAt = new Date();
      }

      // Corroboration merge: only increment if this sourceName is genuinely new
      const currentSources = (byHere.sourcesJson as any[]) || [];
      const sourceAlreadyPresent = currentSources.some((s: any) => s.sourceName === sourceName);
      if (!sourceAlreadyPresent) {
        const newSourceCount = (byHere.sourceCount || 1) + 1;
        const newSource = { sourceName, sourceId: hereBusinessId, lastSeen: new Date().toISOString() };
        updates.sourceCount = newSourceCount;
        updates.sourcesJson = [...currentSources, newSource];
        updates.corroborationScore = recalculateCorroborationScore(newSourceCount);
      }
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
    select: { id: true, businessName: true, googlePlaceId: true, foursquareVenueId: true, hereBusinessId: true, contactEmail: true, phone: true, website: true, sourceCount: true, sourcesJson: true, lat: true, lng: true, isStateLicensed: true, licenseState: true, licenseNumber: true },
  });

  if (byDedupeKey) {
    const updates: Record<string, unknown> = {};
    if (googlePlaceId && !byDedupeKey.googlePlaceId) updates.googlePlaceId = googlePlaceId;
    if (foursquareVenueId && !byDedupeKey.foursquareVenueId) updates.foursquareVenueId = foursquareVenueId;
    if (hereBusinessId && !byDedupeKey.hereBusinessId) updates.hereBusinessId = hereBusinessId;
    if (esnOrgId) updates.esnOrgId = esnOrgId;
    if (businessCategory) updates.businessCategory = businessCategory;
    const validEmail = isValidExternalEmail(contactEmail);
    // Provenance + wrong-entity guard (bounce-incident fix): directory-listing emails
    // are stored as low-confidence/non-send-eligible until re-verified.
    const emailGate = gateScrapedEmail(validEmail, byDedupeKey.website ?? website, businessName);
    if (emailGate && !byDedupeKey.contactEmail) {
      updates.contactEmail = emailGate.contactEmail;
      updates.emailDiscoveryMethod = emailGate.emailDiscoveryMethod;
      updates.emailDiscoveryConfidence = emailGate.emailDiscoveryConfidence;
      updates.emailDiscoveredAt = emailGate.emailDiscoveredAt;
    }
    if (phone && !byDedupeKey.phone) updates.phone = phone;
    applyScrapedWebsite(updates, byDedupeKey.website, website, businessName, listingUrl);
    if (lat !== undefined && lat !== null && !byDedupeKey.lat) updates.lat = lat;
    if (lng !== undefined && lng !== null && !byDedupeKey.lng) updates.lng = lng;
    if (isStateLicensed && !byDedupeKey.isStateLicensed) updates.isStateLicensed = isStateLicensed;
    if (licenseState && !byDedupeKey.licenseState) updates.licenseState = licenseState;
    if (licenseNumber && !byDedupeKey.licenseNumber) updates.licenseNumber = licenseNumber;
    if (effectiveSourceLabel) {
      updates.directoryMostRecentSource = effectiveSourceLabel;
      updates.directoryMostRecentAt = new Date();
    }

    // Corroboration merge: only increment if this sourceName is genuinely new
    const currentSources = (byDedupeKey.sourcesJson as any[]) || [];
    const sourceAlreadyPresent = currentSources.some((s: any) => s.sourceName === sourceName);
    if (!sourceAlreadyPresent) {
      const newSourceCount = (byDedupeKey.sourceCount || 1) + 1;
      const newSource = { sourceName, sourceId: dedupeKey, lastSeen: new Date().toISOString() };
      updates.sourceCount = newSourceCount;
      updates.sourcesJson = [...currentSources, newSource];
      updates.corroborationScore = recalculateCorroborationScore(newSourceCount);
    }
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
    select: { id: true, businessName: true, googlePlaceId: true, foursquareVenueId: true, hereBusinessId: true, contactEmail: true, phone: true, website: true, dedupeKey: true, sourceCount: true, sourcesJson: true, lat: true, lng: true, isStateLicensed: true, licenseState: true, licenseNumber: true },
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
    // Provenance + wrong-entity guard (bounce-incident fix): directory-listing emails
    // are stored as low-confidence/non-send-eligible until re-verified.
    const emailGate = gateScrapedEmail(validEmail, existing.website ?? website, businessName);
    if (emailGate && !existing.contactEmail) {
      updates.contactEmail = emailGate.contactEmail;
      updates.emailDiscoveryMethod = emailGate.emailDiscoveryMethod;
      updates.emailDiscoveryConfidence = emailGate.emailDiscoveryConfidence;
      updates.emailDiscoveredAt = emailGate.emailDiscoveredAt;
    }
    if (phone && !existing.phone) updates.phone = phone;
    applyScrapedWebsite(updates, existing.website, website, businessName, listingUrl);
    if (lat !== undefined && lat !== null && !existing.lat) updates.lat = lat;
    if (lng !== undefined && lng !== null && !existing.lng) updates.lng = lng;
    if (isStateLicensed && !existing.isStateLicensed) updates.isStateLicensed = isStateLicensed;
    if (licenseState && !existing.licenseState) updates.licenseState = licenseState;
    if (licenseNumber && !existing.licenseNumber) updates.licenseNumber = licenseNumber;
    if (effectiveSourceLabel) {
      updates.directoryMostRecentSource = effectiveSourceLabel;
      updates.directoryMostRecentAt = new Date();
    }

    // Corroboration merge: only increment if this sourceName is genuinely new
    const currentSources = (existing.sourcesJson as any[]) || [];
    const sourceAlreadyPresent = currentSources.some((s: any) => s.sourceName === sourceName);
    if (!sourceAlreadyPresent) {
      const newSourceCount = (existing.sourceCount || 1) + 1;
      const newSource = { sourceName, sourceId: `${normalizedName}:${city}`, lastSeen: new Date().toISOString() };
      updates.sourceCount = newSourceCount;
      updates.sourcesJson = [...currentSources, newSource];
      updates.corroborationScore = recalculateCorroborationScore(newSourceCount);
    }
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
    // Provenance + wrong-entity guards on initial create (bounce-incident fix).
    const emailGate = gateScrapedEmail(validEmail, website, businessName);
    const routedWebsite = routeScrapedWebsite(website, businessName);
    const effectiveListingUrl = routedWebsite.listingUrl ?? (listingUrl ? listingUrl.trim() : undefined);
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
            phone: phone ?? null,
            address: `${city}, ${state}`,
            bio: `Sale organizer based in ${city}, ${state}.`,
            isClaimed: false,
            isUnmanagedListing: true,
            esnOrgId,
            googlePlaceId,
            businessCategory,
            contactEmail: emailGate?.contactEmail ?? null,
            emailDiscoveryMethod: emailGate?.emailDiscoveryMethod ?? null,
            emailDiscoveryConfidence: emailGate?.emailDiscoveryConfidence ?? null,
            emailDiscoveredAt: emailGate?.emailDiscoveredAt ?? null,
            website: routedWebsite.website ?? null,
            listingUrl: effectiveListingUrl ?? null,
            lat: lat ?? null,
            lng: lng ?? null,
            dedupeKey: generateDedupeKey(businessName, city),
            sourceCount: 1,
            sourcesJson: [{ sourceName, sourceId: googlePlaceId, lastSeen: new Date().toISOString() }],
            corroborationScore: 0.5,
            isStateLicensed: isStateLicensed ?? null,
            licenseState: licenseState ?? null,
            licenseNumber: licenseNumber ?? null,
            directoryMostRecentSource: effectiveSourceLabel ?? null,
            directoryMostRecentAt: effectiveSourceLabel ? new Date() : null,
          },
        },
      },
      include: { organizer: { select: { id: true } } },
    });
    newOrgId = created.organizer!.id;
    // Route a social URL captured at create time to its dedicated column (never website).
    if (routedWebsite.social) {
      try {
        await prisma.organizer.update({
          where: { id: newOrgId },
          data: { [routedWebsite.social.field]: routedWebsite.social.value } as Prisma.OrganizerUpdateInput,
        });
      } catch (err) {
        console.warn('[scraper] Failed to set social field on new organizer (non-blocking):', err);
      }
    }
  } catch (err: any) {
    // P2002 = unique constraint on email — the record already exists (race condition
    // or this business was previously ingested from the same source). Look up the
    // existing User by the canonical system email and return its organizer ID.
    // Never create a duplicate with a timestamp suffix.
    if (err?.code === 'P2002' && err?.meta?.target?.includes('email')) {
      const existingUser = await prisma.user.findUnique({
        where: { email: systemEmail },
        include: { organizer: { select: { id: true } } },
      });
      if (existingUser?.organizer?.id) {
        console.log(`[scraper] P2002 — reusing existing organizer for ${systemEmail}: ${existingUser.organizer.id}`);
        return existingUser.organizer.id;
      }
      // If lookup also fails (extremely rare), surface the original error
      throw err;
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

// ---------------------------------------------------------------------------
// Batch ingest helpers (ADR-073 perf: replaces serial N+1 per-row upserts)
// ---------------------------------------------------------------------------

/**
 * Row shape accepted by batchUpsertScrapedOrganizers.
 * Mirrors the getOrCreateScrapedOrganizer param list so callers can build
 * rows from the same parsed data without changing call semantics.
 */
export interface ScrapedOrganizerRow {
  businessName: string;
  sourceName: string;
  city: string;
  state: string;
  esnOrgId?: number;
  googlePlaceId?: string;
  foursquareVenueId?: string;
  hereBusinessId?: string;
  businessCategory?: string;
  contactEmail?: string;
  phone?: string;
  website?: string;
  lat?: number;
  lng?: number;
  isStateLicensed?: boolean;
  licenseState?: string;
  licenseNumber?: string;
  sourceLabel?: string;
  listingUrl?: string;
}

/**
 * Batch-upsert scraped organizers.  Processes `rows` in chunks of `batchSize`
 * (default 100) to avoid memory pressure on large CSVs (e.g. Oregon 80k rows).
 *
 * Per-batch algorithm:
 *  1. ADR-075 category filter — reject off-target rows in JS (no DB round-trip).
 *  2. Dedupe within the batch itself by dedupeKey so we never attempt to insert
 *     the same business twice in one createMany call.
 *  3. Single findMany against dedupeKey IN [...] to find existing records.
 *  4. createMany (skipDuplicates:true) for genuinely new rows.
 *  5. Grouped updateMany for rows that already exist (license fields, corroboration).
 *
 * Returns an array of organizer IDs in the same order as `rows`
 * (null for rows that were rejected or failed).
 *
 * IMPORTANT: This function does NOT fire enrichOrganizer for new records —
 * callers that need enrichment should use getOrCreateScrapedOrganizer instead,
 * or fire enrichment separately after the batch returns.
 */
export async function batchUpsertScrapedOrganizers(
  rows: ScrapedOrganizerRow[],
  batchSize: number = 100
): Promise<(string | null)[]> {
  const VALID_CATEGORIES = new Set([
    'ESTATE_SALE_CO', 'AUCTION_HOUSE', 'ANTIQUE_MALL', 'ANTIQUE_DEALER',
    'CONSIGNMENT', 'THRIFT_STORE', 'FLEA_MARKET', 'VINTAGE', 'LIQUIDATION',
    'USED_FURNITURE', 'PAWN_SHOP', 'USED_BOOKSTORE', 'RECORD_STORE',
    'USED_ELECTRONICS', 'COIN_DEALER', 'RESALE_SHOP', 'USED_SPORTING_GOODS',
    'JEWELRY_RESALE',
  ]);

  const results: (string | null)[] = new Array(rows.length).fill(null);

  // Process in chunks to bound memory usage
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const chunk = rows.slice(offset, offset + batchSize);

    // Step 1: Category filter (pure JS — no DB)
    const accepted: { row: ScrapedOrganizerRow; originalIdx: number }[] = [];
    for (let i = 0; i < chunk.length; i++) {
      const row = chunk[i];
      if (row.businessCategory && !VALID_CATEGORIES.has(row.businessCategory)) {
        // Rejected — result stays null
        continue;
      }
      accepted.push({ row, originalIdx: offset + i });
    }

    if (accepted.length === 0) continue;

    // Step 2: Dedupe within the batch by dedupeKey (keep last occurrence per key)
    const seenKeys = new Map<string, number>(); // dedupeKey -> index in accepted[]
    for (let i = 0; i < accepted.length; i++) {
      const dk = generateDedupeKey(accepted[i].row.businessName, accepted[i].row.city);
      seenKeys.set(dk, i);
    }
    // Rebuild accepted to only include the winning row per dedupeKey
    const deduped = Array.from(seenKeys.values()).map(i => accepted[i]);
    // Map from dedupeKey -> originalIdx for result assignment
    const keyToOriginalIdx = new Map<string, number>();
    for (const { row, originalIdx } of deduped) {
      keyToOriginalIdx.set(generateDedupeKey(row.businessName, row.city), originalIdx);
    }
    // Also map remaining duplicates (same dedupeKey) to the winning row's result later
    const keyToDupOriginalIdxs = new Map<string, number[]>();
    for (const { row, originalIdx } of accepted) {
      const dk = generateDedupeKey(row.businessName, row.city);
      if (!keyToOriginalIdx.has(dk) || keyToOriginalIdx.get(dk) !== originalIdx) {
        if (!keyToDupOriginalIdxs.has(dk)) keyToDupOriginalIdxs.set(dk, []);
        keyToDupOriginalIdxs.get(dk)!.push(originalIdx);
      }
    }

    const dedupeKeys = deduped.map(({ row }) => generateDedupeKey(row.businessName, row.city));

    // Step 3: Single findMany to fetch existing records by dedupeKey
    const existing = await prisma.organizer.findMany({
      where: { dedupeKey: { in: dedupeKeys } },
      select: {
        id: true, dedupeKey: true, sourceCount: true, sourcesJson: true,
        contactEmail: true, phone: true, website: true,
        googlePlaceId: true, foursquareVenueId: true, hereBusinessId: true,
        lat: true, lng: true, isStateLicensed: true, licenseState: true, licenseNumber: true,
      },
    });

    const existingByKey = new Map(existing.map(e => [e.dedupeKey ?? '', e]));

    // Step 4: Split into creates vs updates
    const toCreate: typeof deduped = [];
    const toUpdate: typeof deduped = [];

    for (const item of deduped) {
      const dk = generateDedupeKey(item.row.businessName, item.row.city);
      if (existingByKey.has(dk)) {
        toUpdate.push(item);
      } else {
        toCreate.push(item);
      }
    }

    // Step 5a: createMany for new records (skipDuplicates handles any races)
    if (toCreate.length > 0) {
      // We need to create User + Organizer pairs. Prisma createMany doesn't support
      // nested creates, so we fall back to individual getOrCreateScrapedOrganizer calls
      // for the create path. The key optimization is that the lookup queries are
      // batched (Step 3 above), so we only call getOrCreate for confirmed-new rows.
      for (const { row, originalIdx } of toCreate) {
        try {
          const id = await getOrCreateScrapedOrganizer(
            row.businessName, row.sourceName, row.city, row.state,
            row.esnOrgId, row.googlePlaceId, row.foursquareVenueId, row.hereBusinessId,
            row.businessCategory, row.contactEmail, row.phone, row.website,
            row.lat, row.lng, row.isStateLicensed, row.licenseState, row.licenseNumber,
            row.sourceLabel, row.listingUrl,
          );
          results[originalIdx] = id;
          // Propagate id to in-batch duplicates
          const dk = generateDedupeKey(row.businessName, row.city);
          for (const dupIdx of keyToDupOriginalIdxs.get(dk) ?? []) {
            results[dupIdx] = id;
          }
        } catch (err) {
          console.error(`[batchUpsert] Create failed for ${row.businessName}:`, err);
        }
      }
    }

    // Step 5b: batch updates for existing records — group all field changes
    // then fire one prisma.organizer.update per record (still individual but
    // skips the 4 lookup queries that getOrCreateScrapedOrganizer does).
    for (const { row, originalIdx } of toUpdate) {
      const dk = generateDedupeKey(row.businessName, row.city);
      const existingRecord = existingByKey.get(dk)!;
      results[originalIdx] = existingRecord.id;
      // Propagate to in-batch duplicates
      for (const dupIdx of keyToDupOriginalIdxs.get(dk) ?? []) {
        results[dupIdx] = existingRecord.id;
      }

      const updates: Record<string, unknown> = {};
      if (row.googlePlaceId && !existingRecord.googlePlaceId) updates.googlePlaceId = row.googlePlaceId;
      if (row.foursquareVenueId && !existingRecord.foursquareVenueId) updates.foursquareVenueId = row.foursquareVenueId;
      if (row.hereBusinessId && !existingRecord.hereBusinessId) updates.hereBusinessId = row.hereBusinessId;
      if (row.esnOrgId) updates.esnOrgId = row.esnOrgId;
      if (row.businessCategory) updates.businessCategory = row.businessCategory;

      const validEmail = isValidExternalEmail(row.contactEmail);
      const emailGate = gateScrapedEmail(validEmail, existingRecord.website ?? row.website, row.businessName);
      if (emailGate && !existingRecord.contactEmail) {
        updates.contactEmail = emailGate.contactEmail;
        updates.emailDiscoveryMethod = emailGate.emailDiscoveryMethod;
        updates.emailDiscoveryConfidence = emailGate.emailDiscoveryConfidence;
        updates.emailDiscoveredAt = emailGate.emailDiscoveredAt;
      }
      if (row.phone && !existingRecord.phone) updates.phone = row.phone;
      applyScrapedWebsite(updates, existingRecord.website, row.website, row.businessName, row.listingUrl);
      if (row.lat != null && !existingRecord.lat) updates.lat = row.lat;
      if (row.lng != null && !existingRecord.lng) updates.lng = row.lng;
      if (row.isStateLicensed && !existingRecord.isStateLicensed) updates.isStateLicensed = row.isStateLicensed;
      if (row.licenseState && !existingRecord.licenseState) updates.licenseState = row.licenseState;
      if (row.licenseNumber && !existingRecord.licenseNumber) updates.licenseNumber = row.licenseNumber;

      const effectiveLabel = row.sourceLabel ?? row.sourceName ?? (row.isStateLicensed ? 'StateLicensing' : undefined);
      if (effectiveLabel) {
        updates.directoryMostRecentSource = effectiveLabel;
        updates.directoryMostRecentAt = new Date();
      }

      // Corroboration score
      const currentSources = (existingRecord.sourcesJson as any[]) ?? [];
      const sourceAlreadyPresent = currentSources.some((s: any) => s.sourceName === row.sourceName);
      if (!sourceAlreadyPresent) {
        const newCount = (existingRecord.sourceCount || 1) + 1;
        updates.sourceCount = newCount;
        updates.sourcesJson = [...currentSources, { sourceName: row.sourceName, sourceId: dk, lastSeen: new Date().toISOString() }];
        updates.corroborationScore = recalculateCorroborationScore(newCount);
      }

      updates.updatedAt = new Date();

      if (Object.keys(updates).length > 1) { // >1 because updatedAt is always set
        try {
          await prisma.organizer.update({ where: { id: existingRecord.id }, data: updates });
        } catch (err) {
          console.error(`[batchUpsert] Update failed for ${row.businessName}:`, err);
        }
      }
    }

    const batchNum = Math.floor(offset / batchSize) + 1;
    console.log(`[batchUpsert] Batch ${batchNum}: ${toCreate.length} created, ${toUpdate.length} updated, ${chunk.length - accepted.length} rejected`);
  }

  return results;
}


/**
 * Main scraping entry point.
 * Dispatches to the registered source handler via SOURCE_REGISTRY.
 */
export async function runScrapeRun(source: string, metro: string): Promise<void> {
  const jobId = await createScrapeJob(source, metro);
  const rateLimiter = new RateLimiter({ requestsPerSecond: 1, maxRetries: 3 });

  try {
    console.log(`[scraper] Starting job ${jobId} — ${source} / ${metro}`);

    const systemOrganizerId = await getOrCreateSystemOrganizer();

    const sourceDef = getSourceById(source);
    if (!sourceDef) {
      console.warn(`[scraper] Unknown source: ${source} — skipping`);
      await finishScrapeJob(jobId, 'SUCCESS', {});
      return;
    }

    if (sourceDef.prohibited) {
      console.warn(`[scraper] Source ${source} is legally prohibited — skipping`);
      await finishScrapeJob(jobId, 'SUCCESS', {});
      return;
    }

    const stats = await sourceDef.run(metro, systemOrganizerId, rateLimiter);

    console.log(
      `[scraper] Job ${jobId} complete — found ${stats.itemsFound}, created ${stats.itemsCreated}, updated ${stats.itemsUpdated}, skipped ${stats.itemsSkipped}, failed ${stats.itemsFailed}`
    );

    await finishScrapeJob(jobId, 'SUCCESS', {
      itemsFound: stats.itemsFound,
      itemsCreated: stats.itemsCreated,
      itemsUpdated: stats.itemsUpdated,
      itemsSkipped: stats.itemsSkipped,
      itemsFailed: stats.itemsFailed,
    });

    if (stats.itemsFound === 0) {
      // 0 results is a normal SUCCESS outcome for low-volume metros — the empty
      // job is already recorded in ScrapedSalesJob. Real failures throw and are
      // captured in the catch block below. Do NOT Sentry-capture here (noise).
      console.log(`[scraper] ${source} (${metro}) returned 0 results — no listings this run`);
    }
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

// --- Freshness-touch batching (Sentry slow-query fix 2026-06-18) ---
// Per-duplicate lastScrapedAt updates were the #1 slow-query offender: one
// `UPDATE ... RETURNING` per duplicate, each rewriting all 26 Sale indexes
// (only ~8% HOT updates). We buffer the IDs and flush via a single updateMany
// (no RETURNING). Auto-flushes at FRESHNESS_FLUSH_CHUNK; scrape passes also call
// flushFreshnessTouches() at the end so the final partial batch is persisted.
const FRESHNESS_FLUSH_CHUNK = 100;
const freshnessTouchBuffer: string[] = [];

async function flushFreshnessTouchBatch(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    await prisma.sale.updateMany({
      where: { id: { in: ids } },
      data: { lastScrapedAt: new Date() },
    });
  } catch (err) {
    console.error('[scraper] flushFreshnessTouches failed:', err);
  }
}

async function enqueueFreshnessTouch(saleId: string): Promise<void> {
  freshnessTouchBuffer.push(saleId);
  if (freshnessTouchBuffer.length >= FRESHNESS_FLUSH_CHUNK) {
    const batch = freshnessTouchBuffer.splice(0, freshnessTouchBuffer.length);
    await flushFreshnessTouchBatch(batch);
  }
}

/**
 * Flush any buffered lastScrapedAt freshness touches. Call at the end of every
 * scrape pass so the final partial batch is persisted.
 */
export async function flushFreshnessTouches(): Promise<void> {
  const batch = freshnessTouchBuffer.splice(0, freshnessTouchBuffer.length);
  await flushFreshnessTouchBatch(batch);
}

// --- On-demand ISR revalidation batching (ADR 2026-07-11) ---
// Mirrors the freshness-touch buffering pattern above: individual scraped-listing
// creates/updates are buffered per scrape pass and flushed once, batched by
// affected city, instead of firing one HTTP revalidation request per listing.
//
// Lever #4 (2026-07-15, Vercel free-tier ISR-write reduction -- see
// claude_docs/STATE.md Blocked Queue "Vercel Free-Tier Usage Caps"):
// proactively revalidating every individual new /sales/[id] path here was
// itself a major driver of the 252%+ ISR-write overage -- a single scraper
// run can create hundreds of new Sale rows, and firing one revalidate() call
// per row is as expensive as the "first visitor" writes it was meant to
// avoid. Individual /sales/[id] pages are now left to their existing lazy
// first-visit ISR behavior (lower traffic, and per-item revalidation would
// explode call volume). Only a small, deduped, priority-ranked batch of
// /city/[slug] paths -- the actual aggregation pages this run affects, and
// the ones ADR-073 identified as the ISR-write-heavy path -- is proactively
// revalidated per run, capped at MAX_SCRAPER_REVALIDATION_CITY_PATHS and
// ranked by how many sales this run touched in that city (highest-value
// first). Kill switch: POST_SCRAPE_REVALIDATION_ENABLED=false reverts to
// pure lazy/time-based ISR with no proactive calls at all.
const POST_SCRAPE_REVALIDATION_ENABLED = process.env.POST_SCRAPE_REVALIDATION_ENABLED !== 'false';
const MAX_SCRAPER_REVALIDATION_CITY_PATHS = 25;

const revalidationCityTouchCounts = new Map<string, number>();

function enqueueRevalidationTouch(_saleId: string | undefined, city: string | null | undefined, state: string | null | undefined): void {
  const citySlug = citySlugFromCityState(city, state);
  if (!citySlug) return;
  revalidationCityTouchCounts.set(citySlug, (revalidationCityTouchCounts.get(citySlug) ?? 0) + 1);
}

/**
 * Flush any buffered scraper revalidation touches. Call at the end of every
 * scrape pass (same call sites as flushFreshnessTouches()) so this run's
 * highest-value affected /city/[slug] pages revalidate on-demand instead of
 * waiting on the blanket time-based ISR fallback -- bounded to a small batch
 * (see MAX_SCRAPER_REVALIDATION_CITY_PATHS) so this itself never becomes a
 * new source of ISR-write volume. Individual /sales/[id] pages are
 * intentionally NOT proactively revalidated here (see comment above). Never
 * throws -- a revalidation failure must not fail the scrape run.
 */
export async function flushScraperRevalidation(): Promise<void> {
  const touchedCities = Array.from(revalidationCityTouchCounts.entries());
  revalidationCityTouchCounts.clear();
  if (touchedCities.length === 0) return;

  if (!POST_SCRAPE_REVALIDATION_ENABLED) {
    console.log(`[scraper] flushScraperRevalidation skipped (POST_SCRAPE_REVALIDATION_ENABLED=false) -- ${touchedCities.length} city path(s) touched this run`);
    return;
  }

  const citySlugs = touchedCities
    .sort((a, b) => b[1] - a[1]) // highest-value (most sales touched this run) first
    .slice(0, MAX_SCRAPER_REVALIDATION_CITY_PATHS)
    .map(([slug]) => slug);

  try {
    await triggerSaleAndCityRevalidation([], citySlugs);
  } catch (err) {
    console.error('[scraper] flushScraperRevalidation failed:', err);
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
    // --- Date normalisation at the ingest BOUNDARY (S1176) ---
    // Every listing that arrives over HTTP (POST /api/internal/scraper/ingest,
    // internalScraperController.ts:22 `items = req.body?.items`) has been through
    // JSON.stringify in its GitHub-Actions runner script (run-search-facebook-events.ts:258,
    // run-estatesalesnet.ts:131, run-foursquare-places.ts, run-here-places.ts), so its
    // startDate/endDate are ISO STRINGS, not Date instances -- even though ScrapedItem
    // declares them `Date` (htmlParser.ts:13). In-process callers (estatesalesnet.ts:259,
    // facebook-marketplace.ts:324, garageSaleFinder.ts:124) do pass real Dates.
    // Normalising ONCE here means every downstream consumer -- checkDuplicate() below,
    // the 45-day sanity check, the RETAIL branch, the Prisma writes -- can trust the type,
    // instead of each call site needing its own `instanceof Date ? ... : new Date(...)`
    // guard (the 2026-07-19 ~30h silent-zeroed-ingest outage was exactly one such
    // unguarded call site; dedupe.ts:301 was a second, still-live one).
    const startDate = listing.startDate instanceof Date ? listing.startDate : new Date(listing.startDate as any);
    const endDate = listing.endDate instanceof Date ? listing.endDate : new Date(listing.endDate as any);
    const startValid = !!listing.startDate && !isNaN(startDate.getTime());
    const endValid = !!listing.endDate && !isNaN(endDate.getTime());
    if (!startValid || !endValid) {
      // LOUD failure: a zeroed ingest must be diagnosable from the logs alone.
      // The bad raw value is echoed so the offending mapper is identifiable without
      // DB access, and the reason string is aggregated by internalScraperController's
      // topFailureReasons() and surfaced in the GitHub Actions run output.
      const reason = `Unparseable date on scraped listing (startDate=${JSON.stringify(listing.startDate)}, endDate=${JSON.stringify(listing.endDate)}) -- not ingested`;
      console.error(`[scraper] INGEST DATE PARSE FAILURE source=${listing.sourceName} url=${listing.sourceUrl} :: ${reason}`);
      return { status: 'failed', reason };
    }
    // Write the normalised Dates back so downstream reads of listing.startDate /
    // listing.endDate (dedupe, Prisma create/update payloads) are type-correct too.
    listing.startDate = startDate;
    listing.endDate = endDate;

    // Dedup check
    const dupeResult = await checkDuplicate(
      listing,
      listing.sourceName,
      listing.sourceUrl,
      listing.sourceItemId
    );

    if (dupeResult.isDuplicate) {
      if (dupeResult.action === 'rollForward' && dupeResult.existingSaleId) {
        try {
          await prisma.sale.update({
            where: { id: dupeResult.existingSaleId },
            data: {
              startDate: listing.startDate,
              endDate: listing.endDate,
              sourceUrl: listing.sourceUrl,
              lastScrapedAt: new Date(),
              ...(listing.scrapedMetadata
                ? { scrapedMetadata: listing.scrapedMetadata as Prisma.InputJsonValue }
                : {}),
            },
          });
          return {
            saleId: dupeResult.existingSaleId,
            status: 'updated',
            reason: `Recurring event rolled forward: ${dupeResult.reason}`,
          };
        } catch (err) {
          console.error('[scraper] roll-forward update failed, falling back to skip:', err);
          // fall through to the normal skip path so a transient DB error never
          // blocks the run or risks a duplicate insert
        }
      }
      // Buffer the lastScrapedAt touch — flushed in bulk via updateMany (Sentry fix 2026-06-18)
      if (dupeResult.existingSaleId) {
        await enqueueFreshnessTouch(dupeResult.existingSaleId);
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

    // Sanity-check the scraped date window (C-2 fix, weekly-audit-2026-07-18.md).
    // A malformed/mismatched start+end pair -- e.g. an old real FB `start_timestamp`
    // (sometimes the series' original/other occurrence for a recurring event) paired
    // with a much later `end_timestamp` -- has shipped multi-month "sale" windows that
    // read as permanently "TODAY"/"Live" once the far-future end date is reached by
    // "now" (566-row TODAY/Live badge bug, S1130; same defect class reproduced live
    // 2026-07-19 across multiple sources, not just Facebook Events, hence the check
    // lives here in the shared ingest path rather than only in the FB Events mapper).
    // isOngoing listings (permanent storefronts -- Foursquare/HERE) are exempt: they
    // intentionally use a rolling ~1-year window and are never a dated "sale" event.
    // 45 days -- generous ceiling for even a multi-weekend estate/consignment clearance,
    // with headroom above FacebookMarketplace's legitimate 30-day default window
    // (facebook-marketplace.ts) so this never false-rejects real listings.
    const MAX_SALE_DURATION_MS = 45 * 24 * 60 * 60 * 1000;
    // startDate/endDate were normalised to real Dates (and validated as parseable)
    // at the top of this function -- see the ingest-boundary block above. The original
    // 2026-07-19 outage was a raw .getTime() here on an ISO string; that class of bug
    // is now prevented at the boundary rather than re-guarded at each call site.
    if (
      !listing.isOngoing &&
      endDate.getTime() - startDate.getTime() > MAX_SALE_DURATION_MS
    ) {
      const reason = `Implausible date window (${startDate.toISOString()} -> ${endDate.toISOString()}) exceeds 45-day sanity cap -- likely mismatched start/end fields, not ingested`;
      console.warn(`[scraper] INGEST DATE WINDOW REJECT source=${listing.sourceName} url=${listing.sourceUrl} :: ${reason}`);
      return { status: 'failed', reason };
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

        // Always refresh date window on every RETAIL dedup hit — venue records
        // (flea markets, consignment shops) need a rolling 1-year window, not the
        // frozen date from initial ingestion.
        updates.startDate = new Date();
        updates.endDate = (() => { const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d; })();

        // Always touch lastScrapedAt unconditionally — even if no other field changed,
        // we still want to record that we saw this record during this scrape run.
        await prisma.sale.update({
          where: { id: existing.id },
          data: { ...updates, lastScrapedAt: new Date() },
        });
        
        enqueueRevalidationTouch(existing.id, listing.city, listing.state);
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
      const orgLat: number | undefined =
        (listing as any).lat ??
        (listing.scrapedMetadata?.lat as number | undefined) ??
        undefined;
      const orgLng: number | undefined =
        (listing as any).lng ??
        (listing.scrapedMetadata?.lng as number | undefined) ??
        undefined;
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
        listing.organizerEmail,
        listing.organizerPhone,
        listing.organizerWebsite,
        orgLat,
        orgLng
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
        saleSubtype: listing.saleSubtype ?? null,
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
        // Bug fix (566-row TODAY/Live badge bug, S1130 diagnostic): directory-style
        // sources (Foursquare/HERE) set isOngoing on the ScrapedItem to flag
        // always-live business listings. Non-RETAIL saleTypes are create-only on
        // rescrape (dates never refresh), so without this flag the frozen
        // scrape-time startDate/endDate window eventually reads as a nonsensical
        // multi-month "TODAY"/"Live" badge as real time drifts past it.
        isOngoing: listing.isOngoing ?? false,
      },
    });

    enqueueRevalidationTouch(sale.id, listing.city, listing.state);
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
