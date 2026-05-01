/**
 * Deduplication logic for scraped listings
 * Prevents inserting duplicate sales from the same or different sources
 */

import { prisma } from '../../lib/prisma';
import { ParsedListing } from './htmlParser';

export interface DedupeResult {
  isDuplicate: boolean;
  existingSaleId?: string;
  reason?: string;
}

/**
 * Check if a scraped listing is a duplicate of an existing sale
 * Uses: (address + startDate within 1 day) OR (sourceUrl match) OR (sourceItemId match)
 */
export async function checkDuplicate(
  listing: Partial<ParsedListing>,
  sourceName: string,
  sourceUrl: string,
  sourceItemId?: string
): Promise<DedupeResult> {
  try {
    // Check exact sourceUrl match (same source, same sale)
    if (sourceUrl) {
      const existing = await prisma.sale.findFirst({
        where: { sourceUrl },
      });
      if (existing) {
        return {
          isDuplicate: true,
          existingSaleId: existing.id,
          reason: 'Exact sourceUrl match',
        };
      }
    }

    // Check sourceItemId match
    if (sourceItemId) {
      const existingItem = await prisma.item.findFirst({
        where: { sourceItemId },
      });
      if (existingItem) {
        return {
          isDuplicate: true,
          existingSaleId: existingItem.saleId || undefined,
          reason: 'Exact sourceItemId match',
        };
      }
    }

    // Fuzzy match: address + date proximity (within 1 day)
    if (listing.address && listing.city && listing.state && listing.startDate) {
      const startDateMin = new Date(listing.startDate);
      startDateMin.setDate(startDateMin.getDate() - 1);
      const startDateMax = new Date(listing.startDate);
      startDateMax.setDate(startDateMax.getDate() + 1);

      const existing = await prisma.sale.findFirst({
        where: {
          address: listing.address,
          city: listing.city,
          state: listing.state,
          startDate: {
            gte: startDateMin,
            lte: startDateMax,
          },
          OR: [
            { sourceName: null }, // Native listings
            { sourceName: sourceName }, // Same source
          ],
        },
      });

      if (existing) {
        return {
          isDuplicate: true,
          existingSaleId: existing.id,
          reason: 'Fuzzy match on address + date',
        };
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
