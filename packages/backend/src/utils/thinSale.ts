/**
 * Thin sale pages (2026-11-19, GSC "Discovered/Crawled - not indexed" + "Duplicate, Google chose
 * different canonical" cleanup): a sale with no public items, no photos and (almost) no description
 * is a title, a date and a place, nothing Google wants to index. The frontend renders it noindex
 * (packages/frontend/lib/seo/salePage.ts isThinSale) and GET /sales/sitemap leaves it out.
 * KEEP THE THRESHOLD AND RULE IN SYNC WITH THE FRONTEND COPY.
 */
import { prisma } from '../lib/prisma';
import { PUBLIC_ITEM_FILTER } from '../helpers/itemQueries';

export const THIN_SALE_MIN_DESCRIPTION_CHARS = 50;

/** Caller has already established the sale has no public items and no photos. */
export function hasThinDescription(description: string | null | undefined): boolean {
  const chars = typeof description === 'string' ? description.trim().length : 0;
  return chars < THIN_SALE_MIN_DESCRIPTION_CHARS;
}

/**
 * GET /sales/sitemap rows: PUBLISHED, not deleted, not an inventory container, and not thin. Most recently
 * updated first, at most `take` before the thin filter. Two queries: SQL drops sales with no photos, no public
 * items and no description at all; the few that qualified only on a description are re-checked for length here.
 */
export async function listSitemapSales(take: number): Promise<Array<{ id: string; updatedAt: Date }>> {
  const sales = await prisma.sale.findMany({
    where: {
      status: 'PUBLISHED',
      deletedAt: null,
      isInventoryContainer: false,
      OR: [
        { photoUrls: { isEmpty: false } },
        { items: { some: PUBLIC_ITEM_FILTER } },
        { AND: [{ description: { not: null } }, { description: { not: '' } }] },
      ],
    },
    select: { id: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
    take,
  });
  if (sales.length === 0) return sales;
  const descriptionOnly = await prisma.sale.findMany({
    where: { id: { in: sales.map((s) => s.id) }, photoUrls: { isEmpty: true }, items: { none: PUBLIC_ITEM_FILTER } },
    select: { id: true, description: true },
  });
  const thinIds = new Set(descriptionOnly.filter((s) => hasThinDescription(s.description)).map((s) => s.id));
  return thinIds.size ? sales.filter((s) => !thinIds.has(s.id)) : sales;
}
