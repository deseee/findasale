/**
 * ADR-073: Deduplication logic for scraped listings
 * Prevents inserting duplicate sales from the same or different sources
 * Enhanced with address normalization and geocoding checks
 */

import { prisma } from '../../lib/prisma';
import { ParsedListing } from './htmlParser';

export interface DedupeResult {
  isDuplicate: boolean;
  existingSaleId?: string;
  reason?: string;
  /** 'rollForward' = caller should UPDATE the existing sale's dates/source
   *  identifiers to the new occurrence instead of just touching lastScrapedAt.
   *  Undefined/'skip' preserves all existing behavior for every other tier. */
  action?: 'skip' | 'rollForward';
}

/**
 * Normalize an address for comparison purposes.
 * Collapses variations in street suffix spelling, directional abbreviations, and punctuation.
 * Example: "123 Main Street" → "123 main st"
 *         "456 East Oak Avenue" → "456 e oak ave"
 */
export function normalizeAddress(addr: string): string {
  if (!addr) return '';
  return addr
    .toLowerCase()
    .replace(/\bstreet\b/gi, 'st')
    .replace(/\bavenue\b/gi, 'ave')
    .replace(/\bboulevard\b/gi, 'blvd')
    .replace(/\bdrive\b/gi, 'dr')
    .replace(/\bplace\b/gi, 'pl')
    .replace(/\bcourt\b/gi, 'ct')
    .replace(/\bdistrict\b/gi, 'dist')
    .replace(/\broad\b/gi, 'rd')
    .replace(/\blane\b/gi, 'ln')
    .replace(/\bway\b/gi, 'way')
    .replace(/\bcircle\b/gi, 'cir')
    .replace(/\beast\b/gi, 'e')
    .replace(/\bwest\b/gi, 'w')
    .replace(/\bnorth\b/gi, 'n')
    .replace(/\bsouth\b/gi, 's')
    .replace(/[^\w\s,]/g, '') // remove punctuation except commas
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalize a scraped event TITLE for address-independent dedup of recurring
 * Facebook events (weekly flea markets, monthly swap meets, etc). Lowercases,
 * strips punctuation, and removes the volatile tokens that differ between
 * occurrences of the SAME recurring sale:
 *   - month names, weekday names, years, and bare day numbers / ordinals,
 *   - "annual", and filler ("the").
 * So "1st Annual Wyoming Flea Market - July 2026" and
 * "Wyoming Flea Market (August 5)" both normalize to "wyoming flea market".
 * Pure + exported for unit testing.
 */
export function normalizeEventTitle(title: string): string {
  if (!title) return '';
  let s = title.toLowerCase();
  // Month names (full + common abbreviations).
  s = s.replace(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b\.?/g,
    ' '
  );
  // Weekday names (full + abbreviations).
  s = s.replace(
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thurs|fri|sat|sun)\b\.?/g,
    ' '
  );
  // Years, bare day numbers, and ordinals ("1st", "22nd").
  s = s.replace(/\b\d{1,4}(?:st|nd|rd|th)?\b/g, ' ');
  // "annual" and "the".
  s = s.replace(/\bannual\b/g, ' ');
  s = s.replace(/\bthe\b/g, ' ');
  // Remaining punctuation -> space, then collapse whitespace.
  s = s.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return s;
}

// Generic sale-type / filler words. When a normalized title consists ONLY of
// these, it names no specific sale and must NOT drive the title+city dedup tier.
const GENERIC_TITLE_WORDS =
  /\b(estate|garage|yard|moving|rummage|barn|multi|family|multifamily|community|neighborhood|neighbourhood|huge|big|giant|mega|sale|sales|flea|market|swap|meet|indoor|outdoor|auction|liquidation|downsizing|consignment|event)\b/g;

/**
 * True when a normalized title retains a DISTINCTIVE core after removing generic
 * sale-type / filler words -- i.e. it names a specific business or market
 * ("queen bee estate sale" -> core "queen bee"; "wyoming flea market" -> core
 * "wyoming") rather than being a bare generic type ("estate sale" -> core "").
 * The address-independent title+city dedup tier fires ONLY when this is true, so
 * it can never collapse two unrelated generic-titled sales in the same city.
 * Pure + exported for unit testing.
 */
export function hasDistinctiveTitleCore(normalizedTitle: string): boolean {
  if (!normalizedTitle) return false;
  const core = normalizedTitle.replace(GENERIC_TITLE_WORDS, ' ').replace(/\s+/g, ' ').trim();
  return core.length >= 3;
}

// Bounded gap (days) within which a distinctive-title+city match against an
// ALREADY-ENDED FB Events row is treated as the SAME recurring listing's next
// occurrence (roll the existing Sale forward) rather than an unrelated new sale
// reusing a similar name. Covers weekly + monthly cadences with margin for the
// 7-day metro-shard scrape cron. See STATE.md P2 "231 groups w/ 2+ copies".
const RECURRING_ROLL_FORWARD_MAX_GAP_DAYS = 45;

/**
 * Check if a scraped listing is a duplicate of an existing sale
 *
 * Dedup strategy (in priority order):
 * 1. sourceUrl exact match (strongest signal — same listing already imported)
 * 2. sourceItemId match within same source
 * 3. Exact address + city + state + date overlap
 * 4. Normalized address + city + state + date overlap (handles formatting variations)
 * 5. Geographic proximity (lat/lng within ~100m) + date overlap
 * 6. Normalized title + city match within an overlapping window, address-independent,
 *    SCOPED to Facebook Events + guarded to a distinctive title core (catches
 *    recurring FB events that have no address and rotate their event id/url).
 */
export async function checkDuplicate(
  listing: Partial<ParsedListing>,
  sourceName: string,
  sourceUrl: string,
  sourceItemId?: string
): Promise<DedupeResult> {
  try {
    // 1. Check exact sourceUrl match (same source, same sale)
    if (sourceUrl) {
      const existing = await prisma.sale.findFirst({
        where: { sourceUrl },
        select: { id: true },
      });
      if (existing) {
        return {
          isDuplicate: true,
          existingSaleId: existing.id,
          reason: 'Exact sourceUrl match',
        };
      }
    }

    // 2. Check sourceItemId match within same source.
    // Uses JSONB containment (@>) so the partial GIN index Sale_scrapedMetadata_gin_idx
    // is used. Prisma's path/equals emits #> path-equality which CANNOT use a
    // jsonb_path_ops GIN index (Sentry slow-query fix 2026-06-18). Semantics preserved:
    // top-level "sourceItemId" key equals the given value, scoped to the same source.
    if (sourceItemId) {
      const rows = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Sale"
        WHERE "scrapedMetadata" @> ${JSON.stringify({ sourceItemId })}::jsonb
          AND "sourceName" = ${sourceName}
        LIMIT 1
      `;
      const existing = rows[0];
      if (existing) {
        return {
          isDuplicate: true,
          existingSaleId: existing.id,
          reason: `Exact sourceItemId match (${sourceItemId}) @ ${sourceName}`,
        };
      }
    }

    // 3. Exact match: address + city + state + date overlap
    if (listing.address && listing.city && listing.state && listing.startDate && listing.endDate) {
      const existing = await prisma.sale.findFirst({
        where: {
          address: listing.address,
          city: listing.city,
          state: listing.state,
          // Date overlap: existing sale's window overlaps with the incoming listing's window
          startDate: { lte: listing.endDate },
          endDate: { gte: listing.startDate },
        },
        select: { id: true },
      });

      if (existing) {
        return {
          isDuplicate: true,
          existingSaleId: existing.id,
          reason: 'Exact address match + date overlap',
        };
      }
    }

    // 4. Normalized address match: account for "Street" vs "St", directional abbreviations, punctuation
    if (listing.address && listing.city && listing.state && listing.startDate && listing.endDate) {
      const normalizedIncoming = normalizeAddress(listing.address);
      const candidates = await prisma.sale.findMany({
        where: {
          city: listing.city,
          state: listing.state,
          // Date overlap
          startDate: { lte: listing.endDate },
          endDate: { gte: listing.startDate },
        },
        select: { id: true, address: true },
      });

      for (const candidate of candidates) {
        if (candidate.address && normalizeAddress(candidate.address) === normalizedIncoming) {
          return {
            isDuplicate: true,
            existingSaleId: candidate.id,
            reason: 'Normalized address match (handles "Street" vs "St", directionals, etc)',
          };
        }
      }
    }

    // 5. Geographic proximity check: if both lat/lng available, check if ~100m apart
    if ((listing as any).lat && (listing as any).lng && listing.city && listing.startDate && listing.endDate) {
      const incomingLat = (listing as any).lat as number;
      const incomingLng = (listing as any).lng as number;

      const candidates = await prisma.sale.findMany({
        where: {
          lat: { not: null },
          lng: { not: null },
          city: listing.city,
          startDate: { lte: listing.endDate },
          endDate: { gte: listing.startDate },
        },
        select: { id: true, lat: true, lng: true },
      });

      for (const candidate of candidates) {
        if (candidate.lat && candidate.lng) {
          // Rough distance: (lat_diff^2 + lng_diff^2)^0.5 in degrees
          // At the equator, 1 degree ≈ 111km, so 0.001 degree ≈ 111m
          const latDiff = Math.abs(candidate.lat - incomingLat);
          const lngDiff = Math.abs(candidate.lng - incomingLng);
          const distanceDegrees = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);

          // 0.001 degrees ≈ 100m radius
          if (distanceDegrees < 0.001) {
            const distanceMeters = Math.round(distanceDegrees * 111000);
            return {
              isDuplicate: true,
              existingSaleId: candidate.id,
              reason: `Location proximity match (~${distanceMeters}m away)`,
            };
          }
        }
      }
    }

    // 6. Address-independent title + city match (Facebook Events ONLY).
    // ~71% of FB-Events listings carry no address, so tiers 3-5 (all of which
    // require one) never fire for them -- a recurring weekly/monthly event
    // therefore re-ingests as a brand-new sale each run unless the exact
    // sourceUrl / sourceItemId also repeats (it often does not: FB rotates the
    // event id per occurrence). This tier catches those via normalized title +
    // city within an overlapping active window. It is deliberately SCOPED to
    // Facebook-Events rows and guarded by hasDistinctiveTitleCore so it can only
    // merge listings sharing a real business/market name -- never two generic
    // "Estate Sale" / "Garage Sale" listings in the same city.
    if (
      sourceName === 'Facebook Events' &&
      listing.title &&
      listing.city &&
      listing.state &&
      listing.startDate &&
      listing.endDate
    ) {
      const normalizedIncoming = normalizeEventTitle(listing.title);
      if (hasDistinctiveTitleCore(normalizedIncoming)) {
        const candidates = await prisma.sale.findMany({
          where: {
            sourceName: 'Facebook Events',
            city: listing.city,
            state: listing.state,
          },
          select: { id: true, title: true, startDate: true, endDate: true },
        });

        for (const candidate of candidates) {
          if (!candidate.title || normalizeEventTitle(candidate.title) !== normalizedIncoming) continue;

          const overlaps =
            candidate.startDate <= listing.endDate && candidate.endDate >= listing.startDate;
          if (overlaps) {
            return {
              isDuplicate: true,
              existingSaleId: candidate.id,
              action: 'skip',
              reason: 'Normalized title + city match (FB Events, address-independent)',
            };
          }

          // Recurring-instance roll-forward: only when the existing row has ALREADY
          // fully ended (never collapses a still-live/upcoming distinct listing) and
          // the new occurrence falls within the bounded recurrence gap.
          const alreadyEnded = candidate.endDate < new Date() && candidate.endDate < listing.startDate;
          if (alreadyEnded) {
            const gapMs = listing.startDate.getTime() - candidate.endDate.getTime();
            const gapDays = gapMs / 86_400_000;
            if (gapDays <= RECURRING_ROLL_FORWARD_MAX_GAP_DAYS) {
              return {
                isDuplicate: true,
                existingSaleId: candidate.id,
                action: 'rollForward',
                reason: `Recurring FB Event — new occurrence ${gapDays.toFixed(1)}d after prior instance ended (title+city match)`,
              };
            }
          }
        }
      }
    }

    return { isDuplicate: false };
  } catch (error) {
    console.error('Dedup check failed:', error);
    // On error, treat as non-duplicate to avoid blocking the scrape
    return { isDuplicate: false };
  }
}

/**
 * Bulk check for duplicates (returns dedupe results keyed by index)
 */
export async function checkDuplicateBulk(
  listings: Array<{
    listing: Partial<ParsedListing>;
    sourceName: string;
    sourceUrl: string;
    sourceItemId?: string;
  }>
): Promise<Map<number, DedupeResult>> {
  const results = new Map<number, DedupeResult>();

  for (let i = 0; i < listings.length; i++) {
    const { listing, sourceName, sourceUrl, sourceItemId } = listings[i];
    const result = await checkDuplicate(listing, sourceName, sourceUrl, sourceItemId);
    results.set(i, result);
  }

  return results;
}
