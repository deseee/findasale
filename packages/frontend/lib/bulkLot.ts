/**
 * bulkLot (ADR-136, roadmap #659): types, copy, input parsing and error wording for bulk lots in the browser.
 *
 * Plain data and functions: no React, no axios, no env reads, no network. Covered by lib/__tests__/bulkLot.test.ts
 * (copy lint: no "AI", no "estate sale", no em dashes). Run: npm test   (node:test through tsx)
 *
 * The browser does NO pricing arithmetic for anything a shopper or cashier is charged. Every price on screen (the price
 * list, the line total at the register, the pack price on a card) is built by the server (GET /api/bulk-lots/...,
 * POST /api/bulk-lots/item/:id/quote). This module only parses what a person typed and formats numbers for display.
 * ONE exception (ADR-136 Addendum E): packPriceCentsPreview below mirrors the server's pack price formula so the vendor
 * sees the pack price while typing a pack size, before saving. It is a preview only: the server's number is the one
 * saved, shown and charged, and lib/__tests__/bulkLotPacks.test.ts keeps the two formulas in step with golden numbers.
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
  // ADR-136 Addendum E: packs. All built by the server; null or 0 when the lot is not sold in packs (or the server is older).
  packSize?: number | null;
  packCents?: number | null;
  packLabel?: string | null;
  packPriceLabel?: string | null;
  packsAvailable?: number;
  packsAvailableLabel?: string | null;
  leftoverCards?: number;
  packAvailable?: boolean;
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
  regPayHint: 'On card and QR sales the cards come out of stock when the payment goes through. If another sale takes them first, the payment is refunded.',
  regPerThousandSuffix: 'per 1,000 cards',
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
  publicInStoreNote: 'Bulk lots are bought at the register. Tell the shop how many cards you want.',
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

  // Packs (ADR-136 Addendum E): organizer panel
  packHeading: 'Sell in packs',
  packIntro: 'Pick a pack size, for example 1,000 cards. Shoppers and the other vendors at your market buy whole packs at one price. Your own register still sells any number of cards.',
  packSizeLabel: 'Cards per pack',
  packSizeHelp: 'A whole number from 100 to 5,000, and no bigger than the lot.',
  packPresetsLabel: 'Quick sizes',
  packPriceLabel: 'Price of one pack',
  packPriceNeedsPrice: 'Enter a price per 1,000 cards to see the pack price.',
  packPriceRounding: 'Rounded to the nearest cent. A pack always costs this much, however many you sell.',
  packSizeSaved: 'Pack size saved.',
  packSizeCleared: 'This lot is no longer sold in packs.',
  packSaveButton: 'Save pack size',
  packClearButton: 'Stop selling in packs',
  packNotSold: 'Not sold in packs.',
  packLeftoverNote: 'Cards that do not make a whole pack can still be sold at your own register.',
  packLockedNote: 'This lot has packs in a cart or on hold right now. You can change the pack size after they are paid for or released.',
  errorPackSize: 'Enter a pack size from 100 to 5,000 cards.',
  errorPackTooBig: 'The pack size cannot be bigger than the number of cards in the lot.',
  errorPackPrice: 'A pack at this price rounds to less than one cent, or costs more than $99,999.99.',

  // Packs: register (hub cart) and public pages
  regPackBadge: 'Packs',
  regPackAdd: 'Add pack',
  regPackCount: 'Number of packs',
  regPackCountRange: 'From 1 to 50 packs.',
  regPackNoneLeft: 'No packs left',
  regPackAskCards: 'This lot is sold in packs here. Add a pack, or ask the vendor for a number of cards.',
  regPackLine: 'pack',
  regPacksLine: 'packs',
  publicPackHeading: 'Sold in packs',
  publicPackNote: 'Packs are a fixed number of cards at one price. Buy a pack online for pickup, or any amount in store.',
  publicPickupNote: 'Pickup at the shop. Packs cannot be shipped yet.',
  buyPackNoneLeft: 'No packs left',
  buyPackHeading: 'Buy a pack',
  buyPackCountLabel: 'Packs',
  buyPackTotalLabel: 'Total',
  buyPackPickup: 'Pickup at the shop. No shipping and no coupons on bulk packs.',
  buyPackPay: 'Pay for packs',
  buyPackRefreshNote: 'Something changed while you were paying. Close this and check the price again.',
  buyPackDoNotPayAgain: 'Please do not pay again.',
  buyPackButton: 'Buy a pack',
  buyPackEmailLabel: 'Email',
  buyPackNameLabel: 'Your name',
  buyPackGuestNeeded: 'Enter your name and a valid email so the shop can reach you.',
  buyPackPaid: 'Thank you. Your packs are paid for. Pick them up at the shop.',
  buyPackClose: 'Close',
  buyPackCancel: 'Cancel',
  buyPackCountError: 'Choose from 1 to 50 packs.',
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
  BULK_CHANNEL_UNSUPPORTED: 'This bulk lot cannot be bought this way yet. Ask the shop to ring it up at the register.',
  BULK_SOLD_OUT_AFTER_PAYMENT: 'The cards in this bulk lot ran out while the payment was being completed. The card payment is being refunded. Start the sale again with the cards that are left.',
  BULK_PACK_INVALID: 'Pack size must be a whole number of cards from 100 to 5,000, and no bigger than the lot.',
  BULK_PACK_COUNT: 'Choose from 1 to 50 packs.',
  BULK_PACK_ONLY: 'This bulk lot is sold in packs. Add whole packs.',
  BULK_NOT_PACK: 'This bulk lot is not sold in packs.',
  BULK_PACK_LOCKED: 'This lot has packs in a cart or on hold right now. Change the pack size after they are paid for or released.',
  BULK_PACK_TOO_PRICEY: 'A pack would cost more than $99,999.99. Choose a smaller pack size or a lower price.',
  BULK_PACK_PICKUP_ONLY: 'Bulk packs are pickup only for now. Turn off shipping and try again.',
  BULK_PACK_NO_DISCOUNT: 'Coupons and item discounts do not apply to bulk packs.',
  BULK_PACK_TOO_CHEAP: 'This pack costs too little to sell online. Buy it at the shop.',
  BULK_PACK_CART_UNSUPPORTED: 'Buy a bulk pack on its own. Packs cannot go in a cart checkout yet.',
  BULK_PACK_RETRY_TOKEN: 'Refresh the page and try again.',
  BULK_PACK_DUPLICATE_PAYMENT: 'This order was already paid. The second payment is being refunded.',
  BULK_RECORD_FAILED: 'Your card was charged but the order could not be confirmed. Please do not pay again. Contact the shop.',
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

// ---------------------------------------------------------------------------
// Packs (ADR-136 Addendum E)
// ---------------------------------------------------------------------------

export const PACK_SIZE_MIN = 100;
export const PACK_SIZE_MAX = 5000;
/** Quick picks next to the pack size field. Any whole number from the minimum to the maximum is allowed. */
export const PACK_SIZE_PRESETS: readonly number[] = [100, 250, 500, 1000, 2500, 5000];
export const MAX_PACKS_PER_LINE = 50;
/** Same ceiling the server uses for one pack, in cents ($99,999.99). */
export const PACK_MAX_PRICE_CENTS = 9_999_999;

/** Pack size from what a person typed ("1,000"). Null unless it is a whole number from 100 to 5,000. */
export function parsePackSizeInput(text: string): number | null {
  const n = parseCardCount(text, PACK_SIZE_MAX);
  return n !== null && n >= PACK_SIZE_MIN ? n : null;
}

/** Number of packs from what a person typed. Null unless it is a whole number from 1 to 50. */
export function parsePackCountInput(text: string): number | null {
  if (typeof text !== 'string') return null;
  const cleaned = text.trim();
  if (!/^\d{1,3}$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return n >= 1 && n <= MAX_PACKS_PER_LINE ? n : null;
}

/** "$8.00" from integer cents. Display only. */
export function formatCentsLabel(cents: number): string {
  const whole = Math.trunc(Number.isFinite(cents) ? cents : 0);
  const sign = whole < 0 ? '-' : '';
  const abs = Math.abs(whole);
  return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/**
 * PREVIEW of one pack's price in cents while the vendor types: the same formula as the server (services/bulkLot/bulkLotPacks.ts
 * packPriceCents): price per 1,000 rounded to a whole cent, then (cards x cents per 1,000 + 500) / 1,000 rounded down, which is
 * half up. Null when the size or price is not usable, the pack rounds to under a cent, or it is over the ceiling.
 * The server computes the real number; this only avoids a round trip for the live preview.
 */
export function packPriceCentsPreview(packSize: number, pricePerThousandDollars: number): number | null {
  if (!Number.isSafeInteger(packSize) || packSize < PACK_SIZE_MIN || packSize > PACK_SIZE_MAX) return null;
  if (typeof pricePerThousandDollars !== 'number' || !Number.isFinite(pricePerThousandDollars) || pricePerThousandDollars <= 0) return null;
  const perThousandCents = Math.round(pricePerThousandDollars * 100);
  if (!Number.isSafeInteger(perThousandCents) || perThousandCents < 1 || perThousandCents > MAX_PRICE_PER_THOUSAND_DOLLARS * 100) return null;
  const cents = Math.floor((packSize * perThousandCents + 500) / 1000);
  if (cents < 1 || cents > PACK_MAX_PRICE_CENTS) return null;
  return cents;
}

/** Whole packs in the cards left, for the vendor preview. */
export function packsAvailablePreview(remainingCards: number, packSize: number): number {
  if (!Number.isFinite(remainingCards) || remainingCards < 1 || !Number.isSafeInteger(packSize) || packSize < 1) return 0;
  return Math.floor(Math.trunc(remainingCards) / packSize);
}

/** "1,000-card pack". */
export function packNameLabel(packSize: number): string {
  return `${formatCardCount(packSize)}-card pack`;
}

/** "1,000-card pack, $8.00". */
export function packOfferText(packSize: number, cents: number): string {
  return `${packNameLabel(packSize)}, ${formatCentsLabel(cents)}`;
}

/** "4 packs available", "1 pack available" or "No packs left". */
export function packsLeftText(packs: number): string {
  if (!(packs >= 1)) return BULK_COPY.regPackNoneLeft;
  return `${formatCardCount(packs)} ${packs === 1 ? BULK_COPY.regPackLine : BULK_COPY.regPacksLine} available`;
}

/** "2 packs of 1,000 cards". */
export function packLineText(packs: number, packSize: number): string {
  return `${formatCardCount(packs)} ${packs === 1 ? BULK_COPY.regPackLine : BULK_COPY.regPacksLine} of ${formatCardCount(packSize)} ${BULK_COPY.regCardsSuffix}`;
}

/** Cart label for a pack line: "Commons (2 packs of 1,000 cards)". */
export function cartLabelForPack(title: string, packs: number, packSize: number): string {
  return `${title} (${packLineText(packs, packSize)})`;
}

/** Total for N packs in cents: N times the server's price for one pack (the server re-prices and compares to the cent). */
export function packTotalCents(packs: number, packCents: number): number {
  if (!Number.isSafeInteger(packs) || !Number.isSafeInteger(packCents) || packs < 1 || packCents < 1) return 0;
  return packs * packCents;
}

/** One-time retry token for an online pack payment (8 to 100 characters). Lets the server tell a double click from a second order. */
export function newPackClientToken(): string {
  try {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  } catch {
    // fall through to the plain token below
  }
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

/** True when the lot is sold in packs and at least one is on sale. Reads only fields the server built. */
export function lotHasPackOffer(lot: Pick<BulkLot, 'packSize' | 'packCents' | 'packAvailable'>): boolean {
  return typeof lot.packSize === 'number' && typeof lot.packCents === 'number' && lot.packAvailable === true;
}

/** Strings the pack helpers can produce, for the copy lint test. */
export function packSampleCopy(): string[] {
  return [
    packNameLabel(1000),
    packOfferText(1000, 800),
    packsLeftText(0),
    packsLeftText(1),
    packsLeftText(4),
    packLineText(1, 1000),
    packLineText(3, 250),
    cartLabelForPack('Commons', 2, 1000),
    formatCentsLabel(800),
  ];
}

/** Every user-facing string in this module, for the copy lint test. */
export function allBulkCopy(): string[] {
  return [...Object.values(BULK_COPY), ...Object.values(BULK_ERROR_COPY), ...packSampleCopy()];
}
