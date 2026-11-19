/**
 * Pure guards for pages/sales/[id].tsx getStaticProps (2026-11-19, GSC 404 cleanup).
 * Kept free of Next/React imports so lib/__tests__/salePage.test.ts can run them under node:test.
 */
import { CITY_SLUG_PATTERN } from './citySlug';

/**
 * Sale.id is Prisma `@default(cuid())` (schema.prisma `model Sale`): 25 lowercase alphanumerics
 * starting with "c". The check mirrors pages/organizers/[id].tsx (/^[a-z0-9]{20,30}$/) so it can
 * never reject a real id, while still turning away truncated ids (/sales/c, /sales/cm), route
 * placeholders, percent-encoded junk and lone surrogates (which made encodeURIComponent throw).
 */
const SALE_ID_PATTERN = /^[a-z0-9]{20,30}$/;

export function isValidSaleId(id: unknown): id is string {
  try {
    return typeof id === 'string' && SALE_ID_PATTERN.test(id);
  } catch {
    return false;
  }
}

/**
 * Body of the backend's 410 for a removed sale (packages/backend/src/utils/saleGone.ts).
 * Returns the /city/<slug> path to 301 to, or null when there is no usable slug.
 */
export function goneSaleRedirectPath(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const { code, citySlug } = body as { code?: unknown; citySlug?: unknown };
  if (code !== 'SALE_GONE') return null;
  if (typeof citySlug !== 'string' || !CITY_SLUG_PATTERN.test(citySlug)) return null;
  return `/city/${citySlug}`;
}

/**
 * Thin sale page: nothing on it but a title, date and place. No public items, no photos and
 * (almost) no description. These are what GSC files under "Discovered/Crawled - currently not
 * indexed" and "Duplicate, Google chose different canonical", so the page is noindex. KEEP IN SYNC
 * with packages/backend/src/utils/thinSale.ts (GET /sales/sitemap leaves the same sales out).
 */
export const THIN_SALE_MIN_DESCRIPTION_CHARS = 50;

export function isThinSale(sale: {
  items?: unknown[] | null;
  photoUrls?: unknown[] | null;
  description?: string | null;
}): boolean {
  const itemCount = Array.isArray(sale.items) ? sale.items.length : 0;
  const photoCount = Array.isArray(sale.photoUrls) ? sale.photoUrls.length : 0;
  const descriptionChars = typeof sale.description === 'string' ? sale.description.trim().length : 0;
  return itemCount === 0 && photoCount === 0 && descriptionChars < THIN_SALE_MIN_DESCRIPTION_CHARS;
}
