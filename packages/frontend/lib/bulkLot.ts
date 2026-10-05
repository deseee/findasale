/**
 * bulkLot (ADR-136, roadmap #659): types, copy, input parsing and error wording for bulk lots in the browser.
 *
 * Plain data and functions: no React, no axios, no env reads, no network. Covered by lib/__tests__/bulkLot.test.ts
 * (copy lint: no "AI", no "estate sale", no em dashes). Run: npm test   (node:test through tsx)
 *
 * The browser does NO pricing arithmetic. Every price on screen (the price list, the line total at the register) is
 * built by the server (GET /api/bulk-lots/..., POST /api/bulk-lots/item/:id/quote). This module only parses what a
 * person typed and formats numbers for display.
 */

export const MIN_LOT_CARDS = 2;
export const MAX_LOT_CARDS = 1_000_000;
export const MAX_PRICE_PER_THOUSAND_DOLLARS = 100_000;

export interface BulkLotLadderRow {
  cards: number;
  cardsLabel: string;
  cents: number;
  priceLabel: string;
  isAll: boolean;
}

/** One bulk lot as the server describes it (public fields, plus the organizer fields when present). */
export interface BulkLot {
  itemId: string;
  saleId: string | null;
  title: string;
  description: string | null;
  game: string;
  lotKind: string;
  lotKindLabel: string;
  pricePerThousandCents: number | null;
  pricePerThousandLabel: string | null;
  perCardLabel: string | null;
  totalCards: number;
  soldCards: number;
  remainingCards: number;
  remainingLabel: string;
  soldOut: boolean;
  available: boolean;
  ladder: BulkLotLadderRow[];
  photoUrl: string | null;
  status?: string;
  isActive?: boolean;
  draftStatus?: string | null;
}

export interface BulkQuote {
  itemId: string;
  cards: number;
  cents: number;
  amount: number;
  remainingCards: number;
}

export interface BulkVocabulary {
  kinds: string[];
  labels: Record<string, string>;
  defaultKind: string;
  defaultGame: string;
}

export interface BulkStatus {
  enabled: boolean;
  vocabulary: BulkVocabulary | null;
}

export const BULK_COPY = {
  // Organizer panel (inside the card record panel)
  panelHeading: 'Sell by the thousand',
  panelIntro: 'Bulk commons and uncommons sell by count at a price per 1,000 cards. Turn this item into a bulk lot to set how many cards you have and what 1,000 cost.',
  panelIsLot: 'This item is a bulk lot.',
  panelNeedsCard: 'Save the card details above first. Then you can turn this item into a bulk lot.',
  enableButton: 'Turn into a bulk lot',
  enablingButton: 'Saving',
  saveButton: 'Save changes',
  savingButton: 'Saving',
  totalCardsLabel: 'Cards in this lot',
  totalCardsHelp: 'Counts every card, for example 4,200.',
  addCardsLabel: 'Add cards (restock)',
  addCardsHelp: 'Adds to the cards you already have.',
  priceLabel: 'Price per 1,000 cards',
  priceHelp: 'In dollars, for example 8.00. A sale of 1,500 cards costs 1.5 times this price.',
  kindLabel: 'Lot type',
  soldSoFar: 'Sold so far',
  remaining: 'Cards left',
  pricePerCard: 'About',
  ebayNote: 'Bulk lots are sold at your counter and on your storefront. They are not listed on eBay.',
  listedOnEbayNote: 'An item that is listed on eBay cannot become a bulk lot.',
  panelSaved: 'Bulk lot saved.',
  panelEnabled: 'This item is now a bulk lot.',
  panelLoadError: 'We could not load the bulk lot details. Try again.',
  retry: 'Try again',

  // Management page
  managePageTitle: 'Bulk lots',
  managePageIntro: 'Add commons, uncommons and other bulk by the thousand. Shoppers see the price per 1,000 and a price list. Your register asks for how many cards to sell.',
  manageBackToItems: 'Back to add items',
  manageNewHeading: 'Add a bulk lot',
  manageNameLabel: 'Name',
  manageNamePlaceholder: 'Commons and uncommons, mixed sets',
  manageCreate: 'Add bulk lot',
  manageCreating: 'Adding',
  manageListHeading: 'Your bulk lots',
  manageEmpty: 'No bulk lots in this sale yet.',
  manageLoading: 'Loading bulk lots',
  manageViewPublic: 'View the public price list',
  manageDisabled: 'Bulk lots are not turned on for your shop yet.',
  manageEdit: 'Edit',
  manageClose: 'Close',
  manageCreated: 'Bulk lot added.',

  // Register
  regHeading: 'How many cards?',
  regQuantityLabel: 'Number of cards',
  regQuantityPlaceholder: 'For example 1500',
  regQuickLabel: 'Quick amounts',
  regTotalLabel: 'Total for these cards',
  regChecking: 'Checking the total',
  regAdd: 'Add to cart',
  regCancel: 'Cancel',
  regAllLabel: 'All',
  regOnlineOnly: 'Bulk lots need an internet connection at the register.',
  regPayHint: 'Bulk lots are paid with cash, Venmo or Zelle.',
  regUnconfirmed: 'We could not confirm this sale. Check your recent sales before you try again.',
  regLotBadge: 'Bulk lot',
  regCardsSuffix: 'cards',

  // Public pages
  publicHeading: 'Bulk cards by the thousand',
  publicIntro: 'Prices are per 1,000 cards. Buy any amount in store.',
  publicPriceListHeading: 'Price list',
  publicCardsColumn: 'Cards',
  publicPriceColumn: 'Price',
  publicEmpty: 'There are no bulk lots in this sale right now.',
  publicSoldOut: 'Sold out',
  publicBackToSale: 'Back to the sale',
  publicLoadError: 'We could not load the price list. Try again.',
  publicInStoreNote: 'Bulk lots are paid for at the register with cash, Venmo or Zelle.',
  publicPerThousand: 'per 1,000 cards',
  publicLinkLabel: 'Bulk cards by the thousand',

  // Errors
  errorGeneric: 'Something went wrong. Try again in a moment.',
  errorNetwork: 'We could not reach the server. Check your connection and try again.',
  errorQuantity: 'Enter a whole number of cards, 1 or more.',
  errorQuantityTooMany: 'That is more cards than are left in this lot.',
  errorTotal: 'Enter a whole number of cards between 2 and 1,000,000.',
  errorPrice: 'Enter a price per 1,000 cards above $0.00, for example 8.00.',
  errorName: 'Enter a name for the lot.',
  errorAddCards: 'Enter the cards to add as a whole number, 1 or more.',
  errorBoth: 'Change the total or add cards, not both.',
  errorNothingToSave: 'Nothing has changed yet.',
} as const;

/** Wording for each code the server can send. The server's own text is used first; this map is the fallback. */
export const BULK_ERROR_COPY: Record<string, string> = {
  BULK_DISABLED: 'Bulk lots are not turned on for this shop yet.',
  BULK_VALIDATION: 'Some of the bulk lot details need another look.',
  BULK_NOT_FOUND: 'That item was not found.',
  BULK_NOT_LOT: 'That item is not a bulk lot.',
  BULK_ALREADY_LOT: 'That item is already a bulk lot.',
  BULK_NOT_ELIGIBLE: 'Only a fixed price item that is still available and not listed on eBay can become a bulk lot.',
  BULK_HAS_SALES: 'This item has already sold, so it cannot become a bulk lot.',
  BULK_TOTAL_BELOW_SOLD: 'The total cannot be lower than the number of cards already sold.',
  BULK_QUANTITY_REQUIRED: 'Enter how many cards to sell from this bulk lot.',
  BULK_CHECK_FAILED: 'Could not check whether this item is a bulk lot. Try again in a moment.',
  BULK_CHANNEL_UNSUPPORTED: 'Bulk lots can be sold at the register with cash, Venmo or Zelle. Other payment methods are not available for bulk lots yet.',
  BAD_QUANTITY: 'Enter a whole number of cards, 1 or more.',
  BAD_PRICE: 'This bulk lot does not have a valid price per 1,000 cards.',
  QUANTITY_TOO_SMALL: 'That many cards rounds to less than one cent at this price. Sell a larger quantity.',
  NOT_AVAILABLE: 'This bulk lot is sold out or not available.',
  INSUFFICIENT_STOCK: 'There are not enough cards left in this bulk lot.',
  PRICE_CHANGED: 'The price changed since this was added. Re-check the quantity and total.',
  NOT_YOUR_SALE: 'That sale does not belong to your account.',
  SALE_NOT_FOUND: 'Sale not found.',
  RATE_LIMITED: 'Too many requests. Please slow down.',
  SERVER_ERROR: 'Something went wrong. Try again in a moment.',
};

/** Whole number of cards from what a person typed ("1,500", "1500", " 1 500 "). Null when it is not a whole number in range. */
export function parseCardCount(text: string, max: number = MAX_LOT_CARDS): number | null {
  if (typeof text !== 'string') return null;
  const cleaned = text.replace(/[\s,]/g, '');
  if (!/^\d{1,9}$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return n >= 1 && n <= max ? n : null;
}

/** Lot size: a whole number from MIN_LOT_CARDS to MAX_LOT_CARDS. */
export function parseLotTotal(text: string): number | null {
  const n = parseCardCount(text, MAX_LOT_CARDS);
  return n !== null && n >= MIN_LOT_CARDS ? n : null;
}

/** Price per 1,000 in dollars from what a person typed ("8", "8.5", "$8.00"). At most 2 decimals, above zero, within the cap. */
export function parsePricePerThousand(text: string): number | null {
  if (typeof text !== 'string') return null;
  const cleaned = text.replace(/[\s,$]/g, '');
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return n > 0 && n <= MAX_PRICE_PER_THOUSAND_DOLLARS ? n : null;
}

/** "4,200". Deterministic (no locale lookup). */
export function formatCardCount(n: number): string {
  const whole = Math.trunc(Number.isFinite(n) ? n : 0);
  const sign = whole < 0 ? '-' : '';
  return sign + String(Math.abs(whole)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Label for a cart line: "Commons and uncommons (1,500 cards)". */
export function cartLabelForLot(title: string, cards: number): string {
  return `${title} (${formatCardCount(cards)} ${BULK_COPY.regCardsSuffix})`;
}

/** Reads GET /api/bulk-lots/status. Anything unexpected counts as off. */
export function readBulkStatus(body: unknown): BulkStatus {
  const data = (body as { data?: { enabled?: unknown; vocabulary?: unknown } } | null | undefined)?.data;
  const enabled = data?.enabled === true;
  const v = data?.vocabulary as Partial<BulkVocabulary> | undefined;
  const vocabulary =
    v && Array.isArray(v.kinds) && v.labels && typeof v.labels === 'object'
      ? {
          kinds: v.kinds.filter((k): k is string => typeof k === 'string'),
          labels: v.labels as Record<string, string>,
          defaultKind: typeof v.defaultKind === 'string' ? v.defaultKind : (v.kinds[0] as string),
          defaultGame: typeof v.defaultGame === 'string' ? v.defaultGame : 'MTG',
        }
      : null;
  return { enabled, vocabulary: enabled ? vocabulary : null };
}

export interface ReadableBulkError {
  code: string | null;
  status: number | null;
  message: string;
}

/** Turns an axios error into text a person can act on. */
export function describeBulkError(err: unknown): ReadableBulkError {
  const e = err as { response?: { status?: number; data?: Record<string, unknown> } } | null | undefined;
  const response = e?.response;
  if (!response) return { code: null, status: null, message: BULK_COPY.errorNetwork };
  const status = typeof response.status === 'number' ? response.status : null;
  const data = (response.data ?? {}) as { error?: unknown; message?: unknown; code?: unknown };
  const code = typeof data.code === 'string' ? data.code : null;
  const serverText = typeof data.error === 'string' && data.error.trim() ? data.error : typeof data.message === 'string' && data.message.trim() ? data.message : '';
  const message = serverText || (code && BULK_ERROR_COPY[code]) || BULK_COPY.errorGeneric;
  return { code, status, message };
}

/** Every user-facing string in this module, for the copy lint test. */
export function allBulkCopy(): string[] {
  return [...Object.values(BULK_COPY), ...Object.values(BULK_ERROR_COPY)];
}
