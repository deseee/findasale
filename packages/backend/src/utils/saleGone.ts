/**
 * "This sale is permanently gone" signal for the /sales/[id] ISR renderer (2026-11-19, GSC 404 cleanup).
 *
 * GET /sales/:id answers 410 with a SaleGoneBody instead of a plain 404, ONLY to our own trusted
 * renderer (x-ssr-secret; see getSale), when the sale is removed for good:
 *  - hard-deleted by pruneScrapedSales (a PrunedSaleTombstone row exists; looked up per id, so it is
 *    not bounded by the 5,000-id Global Config window the middleware uses),
 *  - soft-deleted (Sale.deletedAt set: organizer/admin delete, emergency takedown, quarterly archival),
 *  - CANCELLED by the organizer (cancelSale only moves DRAFT/PUBLISHED -> CANCELLED, never back).
 * ARCHIVED is NOT gone: expireStaleVenueCron restores those on the next scrape.
 *
 * The frontend turns citySlug into a 301 to /city/<slug>; without a slug it keeps the plain 404.
 */
import { prisma } from '../lib/prisma';
import { canonicalCitySlug, CITY_SLUG_PATTERN } from './citySlug';
import { withCitySlugFallback } from './tombstoneCitySlugColumn';

export const SALE_GONE_CODE = 'SALE_GONE' as const;

export interface SaleGoneBody {
  message: string;
  code: typeof SALE_GONE_CODE;
  citySlug: string | null;
}

/** Sale statuses that never return to a public page. */
const GONE_STATUSES = new Set(['CANCELLED']);

function goneBody(citySlug: string | null | undefined): SaleGoneBody {
  const slug = typeof citySlug === 'string' && CITY_SLUG_PATTERN.test(citySlug) ? citySlug : null;
  return { message: 'Sale removed', code: SALE_GONE_CODE, citySlug: slug };
}

/**
 * For a Sale row that still exists: the gone body when it is soft-deleted or in a terminal
 * non-public status, otherwise null (the caller keeps its normal behavior).
 */
export function saleGoneBodyForRow(sale: {
  deletedAt: Date | null;
  status: string;
  city: string | null;
  state: string | null;
}): SaleGoneBody | null {
  if (!sale.deletedAt && !GONE_STATUSES.has(sale.status)) return null;
  return goneBody(canonicalCitySlug(sale.city, sale.state));
}

/** For an id with no Sale row: the gone body when the id was pruned (tombstoned), else null. */
export async function prunedSaleGoneBody(id: string): Promise<SaleGoneBody | null> {
  if (typeof id !== 'string' || id.length === 0 || id.length > 64) return null;
  // Column may not exist yet (migration applied after deploy): then look up by id only, no slug.
  return withCitySlugFallback(
    async () => {
      const t = await prisma.prunedSaleTombstone.findUnique({ where: { id }, select: { citySlug: true } });
      return t ? goneBody(t.citySlug) : null;
    },
    async () => {
      const t = await prisma.prunedSaleTombstone.findUnique({ where: { id }, select: { id: true } });
      return t ? goneBody(null) : null;
    }
  );
}
