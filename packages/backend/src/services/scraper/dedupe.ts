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
 * Check if a scraped listing is a duplicate of an existing sale
 *
 * Dedup strategy (in priority order):
 * 1. sourceUrl exact match (strongest signal — same listing already imported)
 * 2. sourceItemId match within same source
 * 3. Exact address + city + state + date overlap
 * 4. Normalized address + city + state + date overlap (handles formatting variations)
 * 5. Geographic proximity (lat/lng within ~100m) + date overlap
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

    // 2. Check sourceItemId match within same source
    if (sourceItemId) {
      const existing = await prisma.sale.findFirst({
        where: {
          scrapedMetadata: {
            path: ['sourceItemId'],
            equals: sourceItemId,
          },
          sourceName,
        },
        select: { id: true },
      });
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
