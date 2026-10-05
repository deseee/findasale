/**
 * bulkLotEbay (ADR-136 Addendum C, roadmap #659): types, copy, input parsing and error wording for selling a bulk lot on
 * eBay as fixed-size bundles.
 *
 * Plain data and functions: no React, no axios, no env reads, no network. Covered by lib/__tests__/bulkLotEbay.test.ts
 * (includes the copy lint for every string a person sees). Run: npm test   (node:test through tsx)
 *
 * The browser does NO pricing arithmetic. The bundle price, the bundles available and the leftover cards come from the
 * server (GET /api/bulk-lots/ebay/item/:id). This module only parses what a person typed.
 */

export interface BundleView {
  itemId: string;
  hasSettings: boolean;
  enabled: boolean;
  bundleSize: number;
  adjustmentPercent: number;
  ebayTitle: string | null;
  titlePreview: string;
  condition: string;
  language: string;
  package: { weightOz: number; lengthIn: number; widthIn: number; heightIn: number; confirmed: boolean; suggested: { weightOz: number; lengthIn: number; widthIn: number; heightIn: number } };
  stock: { remainingCards: number; remainingLabel: string; bundlesAvailable: number; leftoverCards: number };
  price: { pricePerThousandCents: number | null; bundleCents: number | null; bundleLabel: string | null; summary: string | null };
  listing: {
    hasOffer: boolean;
    isLive: boolean;
    endedForStock: boolean;
    listedQty: number | null;
    listedPriceCents: number | null;
    lastSyncAt: string | null;
    lastSyncStatus: string | null;
    lastSyncError: string | null;
    nextAction: string;
    ebayUrl: string | null;
  };
  blockers: string[];
  limits: { minBundleSize: number; maxBundleSize: number; presets: readonly number[] };
  sync?: { status: string; action: string; ok: boolean; message: string };
}

export const EBAY_BUNDLE_COPY = {
  heading: 'Sell on eBay as bundles',
  intro: 'eBay buyers order a fixed bundle of cards. Each bundle sold takes that many cards out of this lot, and your counter and storefront stay in step.',
  enableLabel: 'List this lot on eBay as bundles',
  sizeLabel: 'Cards in one bundle',
  sizeHelp: 'The bundle price comes from your price per 1,000 cards. A lot sold in 500-card bundles lists 1 bundle for every 500 cards on hand.',
  sizeLockedHelp: 'The size is locked while the eBay listing is live. Turn eBay bundles off so the listing ends, then change the size.',
  adjustLabel: 'Premium or discount, percent',
  adjustHelp: 'Use 0 for your register price. A discount is a negative number, for example -10.',
  titleLabel: 'eBay title (optional)',
  titleHelp: 'Leave blank to use the title shown below. eBay allows 80 characters.',
  conditionLabel: 'Condition',
  languageLabel: 'Card language',
  packageHeading: 'Packed bundle',
  packageHelp: 'Weigh a packed bundle and measure the box. Shipping is calculated from these numbers, so enter the real ones.',
  weightLabel: 'Weight, ounces',
  lengthLabel: 'Length, inches',
  widthLabel: 'Width, inches',
  heightLabel: 'Height, inches',
  confirmLabel: 'These are the real weight and size of a packed bundle',
  useSuggested: 'Use the suggested box',
  saveButton: 'Save bundle settings',
  savingButton: 'Saving',
  listButton: 'List on eBay',
  listingButton: 'Listing',
  syncButton: 'Sync now',
  syncingButton: 'Checking',
  saved: 'Bundle settings saved.',
  listed: 'Listed on eBay.',
  synced: 'Checked against eBay.',
  stockLine: (bundles: number, leftover: number): string =>
    `${bundles.toLocaleString('en-US')} ${bundles === 1 ? 'bundle' : 'bundles'} available${leftover > 0 ? `, ${leftover.toLocaleString('en-US')} cards left over` : ''}`,
  liveLine: (qty: number | null): string => (qty === null ? 'Not listed yet' : `Live on eBay with ${qty.toLocaleString('en-US')} ${qty === 1 ? 'bundle' : 'bundles'}`),
  endedForStockLine: 'Ended on eBay because fewer cards are left than one bundle. It relists on its own when cards are added back.',
  skippedExport: (count: number): string =>
    `${count.toLocaleString('en-US')} ${count === 1 ? 'bulk lot was' : 'bulk lots were'} left out of this file. Bulk lots are sold by the card at your counter and on your storefront.`,
  loadFailed: 'Could not load the eBay bundle settings. Try again in a moment.',
  genericError: 'Something went wrong. Try again in a moment.',
} as const;

/** Wording for each backend code, used when the server sent a code but no text. */
export const EBAY_BUNDLE_ERROR_COPY: Record<string, string> = {
  BUNDLE_DISABLED: 'eBay bundles for bulk lots are not turned on yet.',
  BUNDLE_VALIDATION: 'Some of the bundle settings are not valid.',
  BUNDLE_NOT_FOUND: 'That lot was not found.',
  BUNDLE_NOT_LOT: 'That item is not a bulk lot.',
  BUNDLE_NOT_ENABLED: 'Turn on eBay bundles for this lot first, and choose a bundle size.',
  BUNDLE_BELOW_ONE: 'This lot has fewer cards left than one bundle.',
  BUNDLE_PRICE_INVALID: 'Set a price per 1,000 cards above $0.00 before listing bundles on eBay.',
  BUNDLE_PRICE_TOO_HIGH: 'This bundle would be priced above the limit this app sends to eBay. Choose a smaller bundle size or a discount.',
  BUNDLE_PACKAGE_UNCONFIRMED: 'Confirm the box weight and size for this bundle before listing. Weigh a packed bundle and enter the real numbers.',
  BUNDLE_NOT_CONNECTED: 'Connect your eBay account first.',
  BUNDLE_EBAY_FAILED: 'eBay did not accept the change. Nothing was changed on your counter stock.',
  RATE_LIMITED: 'Too many requests. Please slow down.',
  SERVER_ERROR: EBAY_BUNDLE_COPY.genericError,
};

/** Server text wins (it is already plain language); the code is the fallback. */
export function describeBundleError(code: string | null | undefined, text: string | null | undefined): string {
  if (typeof text === 'string' && text.trim()) return text.trim();
  if (code && EBAY_BUNDLE_ERROR_COPY[code]) return EBAY_BUNDLE_ERROR_COPY[code];
  return EBAY_BUNDLE_COPY.genericError;
}

/**
 * True while the bundle size cannot change: an eBay offer exists, it has not been ended for stock, and eBay has been told
 * a quantity. Mirrors the server rule (saveBundleSettings answers 409 BUNDLE_VALIDATION otherwise).
 */
export function isBundleSizeLocked(view: Pick<BundleView, 'listing'>): boolean {
  const l = view.listing;
  return l.hasOffer && !l.endedForStock && typeof l.listedQty === 'number';
}

function cleanNumberText(text: string): string {
  return text.replace(/[\s,]/g, '');
}

/** A whole number of cards inside the server's limits, or null. */
export function parseBundleSize(text: string, min: number, max: number): number | null {
  const cleaned = cleanNumberText(text);
  if (!/^\d{1,6}$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return n >= min && n <= max ? n : null;
}

/** A signed percent such as "-10" or "12.5" (at most 2 decimals), inside min and max, or null. */
export function parsePercent(text: string, min: number, max: number): number | null {
  const cleaned = cleanNumberText(text);
  if (cleaned === '') return 0;
  if (!/^-?\d{1,3}(\.\d{1,2})?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return n >= min && n <= max ? n : null;
}

/** A positive measurement with at most 2 decimals, inside min and max, or null. */
export function parseMeasure(text: string, min: number, max: number): number | null {
  const cleaned = cleanNumberText(text);
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return n >= min && n <= max ? n : null;
}

/** The count of bulk lots an export left out, read from the X-Skipped-Bulk-Lots response header (any casing). */
export function readSkippedLotCount(headers: unknown): number {
  if (!headers || typeof headers !== 'object') return 0;
  const h = headers as Record<string, unknown> & { get?: (name: string) => unknown };
  const raw = typeof h.get === 'function' ? h.get('x-skipped-bulk-lots') : undefined;
  const direct = raw ?? h['x-skipped-bulk-lots'] ?? h['X-Skipped-Bulk-Lots'];
  const n = Number(direct);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/** Narrow a GET or PUT response body to a BundleView, or null when it is not one. */
export function readBundleView(body: unknown): BundleView | null {
  const data = (body as { data?: unknown } | null | undefined)?.data as Partial<BundleView> | undefined;
  if (!data || typeof data !== 'object') return null;
  if (typeof data.itemId !== 'string' || typeof data.bundleSize !== 'number' || !data.stock || !data.listing || !data.package || !data.limits) return null;
  return data as BundleView;
}

/** Every string a person can see from this module, for the copy lint. */
export function allBundleCopy(): string[] {
  const out: string[] = [];
  for (const v of Object.values(EBAY_BUNDLE_COPY)) {
    if (typeof v === 'string') out.push(v);
  }
  out.push(EBAY_BUNDLE_COPY.stockLine(1, 0), EBAY_BUNDLE_COPY.stockLine(3, 120), EBAY_BUNDLE_COPY.liveLine(null), EBAY_BUNDLE_COPY.liveLine(1), EBAY_BUNDLE_COPY.liveLine(4), EBAY_BUNDLE_COPY.skippedExport(1), EBAY_BUNDLE_COPY.skippedExport(3));
  out.push(...Object.values(EBAY_BUNDLE_ERROR_COPY));
  return out;
}
