/**
 * googleMerchantFeed.ts — Feature #463: Google Merchant Center free product-listings feed
 *
 * Builds a tab-separated (TSV) product feed conforming to the Google Merchant Center
 * product data specification. The feed is read-only and surfaces eligible FindA.Sale
 * items as free product listings on Google Shopping.
 *
 * Spec reference: https://support.google.com/merchants/answer/7052112
 *
 * Scope (an item is INCLUDED only when ALL hold):
 *   - Item.status === 'AVAILABLE'
 *   - Item.isActive === true
 *   - Item.deletedAt === null
 *   - Item.draftStatus === 'PUBLISHED'
 *   - parent Sale.status === 'PUBLISHED'
 *   - parent Sale.deletedAt === null
 *
 * Per-row exclusions (item is skipped even if in scope):
 *   - empty photoUrls
 *   - price null or <= 0
 *   - listingType is AUCTION or REVERSE_AUCTION (Merchant Center is fixed-price only)
 *
 * Never emits a 0-byte feed — when no items qualify, a header-only TSV is returned.
 *
 * Feature #463 (shipping): per-item shipping is sourced from the organizer's
 * existing eBay shipping config via computeItemShipping(). Shippability is
 * opt-in per organizer — items the organizer cannot ship (no config, local-pickup,
 * heavy/oversized/fragile, no parseable rate) are DROPPED, never given a flat default.
 */

import {
  computeItemShipping,
  FeedPolicyMapping,
} from './googleMerchantShipping';

const SITE_BASE_URL = 'https://finda.sale';

// Google Merchant TSV columns, in order.
export const GOOGLE_MERCHANT_COLUMNS = [
  'id',
  'title',
  'description',
  'link',
  'image_link',
  'additional_image_link',
  'availability',
  'price',
  'condition',
  'brand',
  'gtin',
  'mpn',
  'identifier_exists',
  'product_type',
  'shipping',
  'shipping_label',
  'shipping_weight',
  'ships_from_country',
  'max_handling_time',
] as const;

/**
 * Minimal Item shape required by the feed builder. Kept structural (not the full
 * Prisma type) so the builder is decoupled from unrelated schema churn.
 */
export interface FeedItem {
  id: string;
  title: string;
  description: string | null;
  price: number | null;
  currency: string | null;
  photoUrls: string[];
  condition: string | null;
  brand: string | null;
  upc: string | null;
  ean: string | null;
  isbn: string | null;
  mpn: string | null;
  category: string | null;
  status: string;
  isActive: boolean;
  deletedAt: Date | null;
  draftStatus: string;
  listingType: string;
  // Feature #463 shipping inputs
  tags: string[];
  ebayShippingOverride: string | null;
  packageWeightOz: number | null;
  sale: {
    status: string;
    deletedAt: Date | null;
    // Organizer's eBay shipping config — null when organizer has no EbayPolicyMapping.
    organizer: {
      ebayPolicyMapping: FeedPolicyMapping | null;
    } | null;
  } | null;
}

/**
 * Strip HTML tags and decode the most common entities, then collapse whitespace.
 * Returns '' for null/undefined input.
 */
function stripHtml(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .replace(/<[^>]*>/g, ' ') // remove tags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Sanitize a single TSV cell. TSV is tab-delimited and newline-terminated, so
 * any tab/newline inside a value must be neutralized to a space.
 */
function tsvCell(value: string | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[\t\r\n]+/g, ' ').trim();
}

/**
 * Returns true when an item passes the inclusion scope and per-row exclusions.
 */
export function isFeedEligible(item: FeedItem): boolean {
  // Inclusion scope
  if (item.status !== 'AVAILABLE') return false;
  if (item.isActive !== true) return false;
  if (item.deletedAt !== null) return false;
  if (item.draftStatus !== 'PUBLISHED') return false;
  if (!item.sale) return false;
  if (item.sale.status !== 'PUBLISHED') return false;
  if (item.sale.deletedAt !== null) return false;

  // Per-row exclusions
  if (!item.photoUrls || item.photoUrls.length === 0) return false;
  if (item.price === null || item.price === undefined || item.price <= 0) return false;
  if (item.listingType === 'AUCTION' || item.listingType === 'REVERSE_AUCTION') return false;

  return true;
}

/**
 * Map FindA.Sale condition to Google Merchant condition enum (new | used).
 * Google only accepts: new, refurbished, used. We collapse everything that
 * isn't explicitly NEW to "used" per spec C.
 */
function mapCondition(condition: string | null): string {
  return condition && condition.toUpperCase() === 'NEW' ? 'new' : 'used';
}

/**
 * Pick the first non-null product identifier for the gtin column.
 * UPC/EAN/ISBN are all valid GTIN values for Merchant Center.
 */
function pickGtin(item: FeedItem): string | null {
  return item.upc || item.ean || item.isbn || null;
}

/**
 * Build a single Google Merchant TSV row (array of cell strings, column order)
 * for an item assumed to already be eligible.
 *
 * Returns null when the item must be EXCLUDED for shipping reasons (Feature #463):
 * the organizer cannot ship it (no eBay config, local-pickup-only, don't-list,
 * heavy/oversized/fragile, or no parseable rate). Null rows never reach the TSV.
 */
export function buildFeedRow(item: FeedItem): string[] | null {
  // Feature #463: per-item shipping from the organizer's eBay config.
  // null → exclude the item entirely (opt-in shippability; no flat default).
  const policyMapping = item.sale?.organizer?.ebayPolicyMapping ?? null;
  const shipping = computeItemShipping(
    {
      category: item.category,
      tags: item.tags || [],
      ebayShippingOverride: item.ebayShippingOverride,
      packageWeightOz: item.packageWeightOz,
    },
    policyMapping
  );
  if (!shipping) return null;

  const title = tsvCell(item.title).substring(0, 150);

  const strippedDescription = stripHtml(item.description);
  const description = tsvCell(strippedDescription || item.title);

  const link = `${SITE_BASE_URL}/items/${item.id}`;
  const imageLink = tsvCell(item.photoUrls[0] || '');
  // additional_image_link: photoUrls[1..10], comma-joined (Merchant allows up to 10)
  const additionalImages = (item.photoUrls.slice(1, 11) || [])
    .filter(Boolean)
    .map((u) => tsvCell(u))
    .join(',');

  const availability = item.status === 'AVAILABLE' ? 'in_stock' : 'out_of_stock';

  const currency = item.currency || 'USD';
  const price = `${(item.price as number).toFixed(2)} ${currency}`;

  const condition = mapCondition(item.condition);

  const brand = item.brand ? tsvCell(item.brand) : '';
  const gtin = pickGtin(item);
  const gtinCell = gtin ? tsvCell(gtin) : '';
  const mpn = item.mpn ? tsvCell(item.mpn) : '';

  // identifier_exists = "no" when there is NO gtin AND NO mpn AND NO brand.
  // Otherwise omit (empty) — Google defaults to "yes".
  const hasIdentifier = Boolean(gtin) || Boolean(item.mpn) || Boolean(item.brand);
  const identifierExists = hasIdentifier ? '' : 'no';

  const productType = item.category ? tsvCell(item.category) : '';

  return [
    tsvCell(item.id),
    title,
    description,
    link,
    imageLink,
    additionalImages,
    availability,
    price,
    condition,
    brand,
    gtinCell,
    mpn,
    identifierExists,
    productType,
    tsvCell(shipping.shipping),
    tsvCell(shipping.shippingLabel),
    tsvCell(shipping.shippingWeight || ''),
    tsvCell(shipping.shipsFromCountry),
    tsvCell(shipping.maxHandlingTime),
  ];
}

/**
 * Build the full TSV feed string from a list of items. Filters to eligible items,
 * always emits the header row (never a 0-byte feed), and tab-joins cells.
 */
export function buildGoogleMerchantTsv(items: FeedItem[]): string {
  const header = GOOGLE_MERCHANT_COLUMNS.join('\t');
  const rows: string[] = [header];

  for (const item of items) {
    if (!isFeedEligible(item)) continue;
    const row = buildFeedRow(item);
    // Feature #463: null row → item excluded for shipping reasons. Skip it so
    // unshippable items never reach the TSV.
    if (!row) continue;
    rows.push(row.join('\t'));
  }

  // Trailing newline so the file is well-formed even when header-only.
  return rows.join('\n') + '\n';
}
