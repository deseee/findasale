/**
 * bulkLotFollowup (ADR-136 Addendum B, roadmap #659): the pure, testable half of the bulk lot follow-up screens
 * (recount and adjust, refunds of part of a sale, holds, and what an offline queued sale shows when it no longer sells).
 *
 *   - clientPriceCents / clientLineAmount: the same price the server computes, so an offline register can show a total
 *     and the server's replay agrees to the cent. floor((cards x cents per 1,000 + 500) / 1,000), once per line, and a
 *     line under one cent is not sellable. The parity test pins this to the backend's golden numbers.
 *   - refund preview: the money for "take N cards back" (cumulative half up, the last piece exact), for the confirm line.
 *     The server is the authority; this only previews.
 *   - offline conflict parsing and wording.
 *   - copy and error wording for the new screens.
 *
 * No React, no network, no browser globals.
 */
import { BULK_COPY, BULK_ERROR_COPY, formatCardCount } from './bulkLot';

// ---------------------------------------------------------------------------
// Price (parity with services/bulkLot/bulkLotPricing.ts)
// ---------------------------------------------------------------------------

export const MAX_SALE_CARDS = 1_000_000;

/** Cents per 1,000 cards from the dollar price per 1,000 (rounded to the cent). Null when not above zero. */
export function pricePerThousandCents(dollars: unknown): number | null {
  const n = typeof dollars === 'number' ? dollars : typeof dollars === 'string' && dollars.trim() !== '' ? Number(dollars) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  const cents = Math.round(n * 100);
  return cents >= 1 ? cents : null;
}

/** Cents for `cards` cards at `perThousandCents`. Half up, once. Null when cards is not a whole number >= 1, or the line is under one cent. */
export function clientPriceCents(cards: number, perThousandCents: number): number | null {
  if (!Number.isSafeInteger(cards) || cards < 1 || cards > MAX_SALE_CARDS) return null;
  if (!Number.isSafeInteger(perThousandCents) || perThousandCents < 1) return null;
  const cents = Math.floor((cards * perThousandCents + 500) / 1000);
  return cents >= 1 ? cents : null;
}

/** Dollars for the register line (what the queued sale sends as `amount`). Null when the line cannot be sold. */
export function clientLineAmount(cards: number, pricePerThousandDollars: unknown): number | null {
  const per = pricePerThousandCents(pricePerThousandDollars);
  if (per === null) return null;
  const cents = clientPriceCents(cards, per);
  return cents === null ? null : cents / 100;
}

// ---------------------------------------------------------------------------
// Refund preview (parity with services/bulkLot/bulkLotRefundService.ts)
// ---------------------------------------------------------------------------

export interface RefundRowFacts {
  soldCards: number;
  purchaseCents: number;
  returnedCards: number;
  refundedCents: number;
}

function mulDivHalfUp(a: number, b: number, c: number): number {
  if (!(c > 0) || !(a > 0) || !(b > 0)) return 0;
  return Number((BigInt(Math.trunc(a)) * BigInt(Math.trunc(b)) * BigInt(2) + BigInt(Math.trunc(c))) / (BigInt(Math.trunc(c)) * BigInt(2)));
}

export type RefundPreview = { ok: true; cards: number; cents: number; isFull: boolean; outstandingAfter: number } | { ok: false; code: 'BAD_CARDS' | 'TOO_MANY' | 'TOO_SMALL' | 'DONE'; outstanding: number };

/** What "take `cards` cards back" would pay, or why it cannot. */
export function previewCardRefund(facts: RefundRowFacts, cards: number): RefundPreview {
  const outstanding = Math.max(0, facts.soldCards - facts.returnedCards);
  if (!Number.isSafeInteger(cards) || cards < 1) return { ok: false, code: 'BAD_CARDS', outstanding };
  if (outstanding < 1) return { ok: false, code: 'DONE', outstanding };
  if (cards > outstanding) return { ok: false, code: 'TOO_MANY', outstanding };
  const target = facts.returnedCards + cards;
  const cumulative = target >= facts.soldCards ? facts.purchaseCents : mulDivHalfUp(facts.purchaseCents, target, facts.soldCards);
  const cents = cumulative - facts.refundedCents;
  const remaining = Math.max(0, facts.purchaseCents - facts.refundedCents);
  if (cents < 1 || cents > remaining) return { ok: false, code: 'TOO_SMALL', outstanding };
  return { ok: true, cards, cents, isFull: target >= facts.soldCards && cents === remaining, outstandingAfter: outstanding - cards };
}

export function formatDollarsFromCents(cents: number): string {
  const whole = Math.trunc(Number.isFinite(cents) ? cents : 0);
  const sign = whole < 0 ? '-' : '';
  const abs = Math.abs(whole);
  const dollars = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}$${dollars}.${String(abs % 100).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Adjust
// ---------------------------------------------------------------------------

export const ADJUST_REASONS = ['RECOUNT', 'DAMAGE', 'CORRECTION', 'ADDED_STOCK'] as const;
export type AdjustReason = (typeof ADJUST_REASONS)[number];

export const ADJUST_REASON_LABELS: Record<AdjustReason, string> = {
  RECOUNT: 'Recount',
  DAMAGE: 'Damaged or lost',
  CORRECTION: 'Correction',
  ADDED_STOCK: 'Added stock',
};

/** For a recount or a correction the number typed is the count on hand now; for damage and added stock it is how many. */
export function adjustReasonSetsCount(reason: AdjustReason): boolean {
  return reason === 'RECOUNT' || reason === 'CORRECTION';
}

/** Cards on hand after an adjustment, or null when the entry is not valid for the current count. */
export function cardsOnHandAfter(reason: AdjustReason, onHand: number, entered: number): number | null {
  if (!Number.isSafeInteger(entered) || entered < 0) return null;
  if (adjustReasonSetsCount(reason)) return entered;
  if (entered < 1) return null;
  if (reason === 'DAMAGE') return entered <= onHand ? onHand - entered : null;
  return onHand + entered;
}

export interface AdjustmentRow {
  id: string;
  reason: AdjustReason | string;
  beforeCount: number;
  afterCount: number;
  totalBefore: number;
  totalAfter: number;
  note: string | null;
  createdAt: string;
}

/** "Recount: 1,500 to 1,420 (-80)". */
export function describeAdjustment(row: Pick<AdjustmentRow, 'reason' | 'beforeCount' | 'afterCount'>): string {
  const label = (ADJUST_REASON_LABELS as Record<string, string>)[row.reason] ?? String(row.reason);
  const diff = row.afterCount - row.beforeCount;
  const sign = diff > 0 ? '+' : diff < 0 ? '-' : '';
  return `${label}: ${formatCardCount(row.beforeCount)} to ${formatCardCount(row.afterCount)} (${sign}${formatCardCount(Math.abs(diff))})`;
}

/** Reads GET /api/bulk-lots/item/:id/adjustments. Anything unexpected is an empty list. */
export function readAdjustments(body: unknown): AdjustmentRow[] {
  const data = (body as { data?: { adjustments?: unknown } } | null | undefined)?.data;
  const list = data && Array.isArray(data.adjustments) ? data.adjustments : [];
  const out: AdjustmentRow[] = [];
  for (const r of list) {
    if (!r || typeof r !== 'object') continue;
    const x = r as Record<string, unknown>;
    if (typeof x.id !== 'string') continue;
    const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
    out.push({
      id: x.id,
      reason: typeof x.reason === 'string' ? x.reason : 'CORRECTION',
      beforeCount: n(x.beforeCount),
      afterCount: n(x.afterCount),
      totalBefore: n(x.totalBefore),
      totalAfter: n(x.totalAfter),
      note: typeof x.note === 'string' && x.note.trim() ? x.note : null,
      createdAt: typeof x.createdAt === 'string' ? x.createdAt : '',
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Offline conflicts
// ---------------------------------------------------------------------------

export interface BulkConflict {
  itemId: string;
  title: string;
  code: string;
  message: string;
  requestedCards: number | null;
  clientCents: number | null;
  expectedCents: number | null;
  remainingCards: number;
}

export const BULK_CONFLICT_CODE = 'BULK_CONFLICT';

/** True for a failed queue entry that should wait for the organizer instead of retrying forever. */
export function isBulkReconcileCode(code: unknown): boolean {
  if (typeof code !== 'string') return false;
  return code === BULK_CONFLICT_CODE || code.startsWith('BULK_LOT_') || code === 'BULK_USE_ADJUST';
}

/** Reads the `details.conflicts` the sync endpoint attaches to a failed bulk sale. Anything unexpected is an empty list. */
export function readConflicts(details: unknown): BulkConflict[] {
  const list = (details as { conflicts?: unknown } | null | undefined)?.conflicts;
  if (!Array.isArray(list)) return [];
  const out: BulkConflict[] = [];
  for (const c of list) {
    if (!c || typeof c !== 'object') continue;
    const x = c as Record<string, unknown>;
    if (typeof x.itemId !== 'string') continue;
    const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    out.push({
      itemId: x.itemId,
      title: typeof x.title === 'string' && x.title ? x.title : 'Bulk lot',
      code: typeof x.code === 'string' ? x.code : 'PRICE_CHANGED',
      message: typeof x.message === 'string' ? x.message : '',
      requestedCards: num(x.requestedCards),
      clientCents: num(x.clientCents),
      expectedCents: num(x.expectedCents),
      remainingCards: num(x.remainingCards) ?? 0,
    });
  }
  return out;
}

/** One plain-language line per conflict for the sync queue. */
export function describeConflict(c: BulkConflict): string {
  const cards = c.requestedCards !== null ? `${formatCardCount(c.requestedCards)} cards` : 'the cards';
  if (c.code === 'PRICE_CHANGED' && c.expectedCents !== null && c.clientCents !== null) {
    return `${c.title}: ${cards} were rung up at ${formatDollarsFromCents(c.clientCents)}, now ${formatDollarsFromCents(c.expectedCents)}. The price changed while this device was offline.`;
  }
  if (c.code === 'INSUFFICIENT_STOCK') {
    return `${c.title}: ${cards} were rung up but only ${formatCardCount(c.remainingCards)} are left.`;
  }
  if (c.code === 'NOT_AVAILABLE') return `${c.title}: sold out or no longer available.`;
  const fallback = c.message || (BULK_ERROR_COPY as Record<string, string>)[c.code] || BULK_COPY.errorGeneric;
  return `${c.title}: ${fallback}`;
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

export const FOLLOWUP_COPY = {
  // Adjust count
  adjustButton: 'Adjust count',
  adjustTitle: 'Adjust the card count',
  adjustReasonLabel: 'Reason',
  adjustCountLabelSet: 'Cards on hand now',
  adjustCountLabelDelta: 'Number of cards',
  adjustNoteLabel: 'Note (optional)',
  adjustNotePlaceholder: 'Why the count changed',
  adjustSave: 'Save adjustment',
  adjustSaving: 'Saving...',
  adjustCancel: 'Cancel',
  adjustSaved: 'Count updated.',
  adjustOnHandLine: 'On hand now',
  adjustHeldLine: 'On hold',
  adjustSoldLine: 'Sold',
  adjustAfterLine: 'On hand after',
  adjustHistoryTitle: 'Count history',
  adjustHistoryEmpty: 'No adjustments yet.',
  adjustEntryInvalid: 'Enter a whole number that works with the cards on hand.',
  adjustNoChange: 'That is the same count as now. Change the number or cancel.',
  adjustFormHint: 'Every change is saved with the date, the reason and who made it.',
  // Refunds
  refundTitle: 'Take cards back',
  refundSalesTitle: 'Recent sales of this lot',
  refundSalesEmpty: 'No sales of this lot yet.',
  refundButton: 'Take cards back',
  refundCardsLabel: 'Cards to take back',
  refundAll: 'All remaining cards',
  refundConfirm: 'Refund and return the cards',
  refundWorking: 'Refunding...',
  refundDone: 'Refund recorded and the cards are back in the lot.',
  refundCardsLeftOut: 'Still out',
  refundCardsBack: 'Taken back',
  refundMoneyLine: 'Refund',
  refundFullyRefunded: 'Fully refunded',
  refundCashNote: 'For a cash sale, hand the money back yourself. The refund is recorded here.',
  // Holds
  holdTitle: 'Hold cards',
  holdButton: 'Hold cards',
  holdCardsLabel: 'Cards to hold',
  holdNameLabel: 'Name for the hold',
  holdHoursLabel: 'Hold for',
  holdPlace: 'Place hold',
  holdPlacing: 'Placing...',
  holdPlaced: 'Hold placed. The cards are set aside.',
  holdListTitle: 'Holds on this lot',
  holdListEmpty: 'No active holds.',
  holdRelease: 'Release',
  holdReleased: 'Hold released. The cards are back in the lot.',
  holdSendInvoice: 'Send Square link',
  holdSendCash: 'Paid in cash',
  holdPaidCash: 'Sale recorded. The cards are sold.',
  holdLinkReady: 'Payment link ready. Copy it and send it to the customer. The cards stay held until it is paid.',
  holdCopyLink: 'Copy link',
  holdLinkCopied: 'Link copied.',
  holdQuantityInvalid: 'Enter a whole number of cards to hold.',
  holdHoursInvalid: 'Enter hours from 1 to 168.',
  holdWithInvoice: 'Payment link sent',
  holdTotal: 'Total',
  adjustPanelClosed: 'Adjust count',
  historyShow: 'Show history',
  historyHide: 'Hide history',
  salesRefreshing: 'Loading sales...',
  refundPreviewLine: 'Refund for these cards',
  refundCardsInvalid: 'Enter a whole number of cards, 1 or more.',
  holdExpires: 'Expires',
  holdSavedPrice: 'Price saved at hold',
  holdEmailLabel: 'Customer email (optional)',
  holdEmailHint: 'If you add one, the customer gets a confirmation and one reminder before the hold ends.',
  holdEmailInvalid: 'Enter a valid email address, or leave it blank.',
  holdEmailSentTo: 'Emails go to',
  // Team members at the register (Addendum D)
  staffHoldsTitle: 'Holds at the register',
  staffHoldsIntro: 'Set cards aside for a customer, turn a hold into a sale, or let a hold go. Count changes and refunds are done by the shop owner.',
  staffNoAccess: 'You need register access for this shop to work with holds. Ask the shop owner to turn it on for you.',
  staffNoLots: 'There are no bulk lots in this sale yet.',
  staffLoading: 'Loading the lots...',
  staffNotOn: 'Bulk lots are not turned on yet.',
  staffSignIn: 'Sign in to work with holds.',
  staffCardsLeft: 'Cards left',
  // Offline queue
  offlineBulkNeedsReview: 'A bulk lot line changed while this device was offline. Nothing was charged or taken from the lot. Review the lines below and ring the sale up again.',
  offlineBulkToast: 'changed while offline. Open the Offline Sync Queue to review the bulk lot lines.',
  offlineLotEditRefused: 'This change to a bulk lot was not applied.',
  // Channels
  channelsNote: 'Bulk lots are sold at your counter and on your storefront.',
} as const;

/** Wording for the codes the follow-up endpoints add. The server's own text is used first; this map is the fallback. */
export const FOLLOWUP_ERROR_COPY: Record<string, string> = {
  BULK_CONFLICT: FOLLOWUP_COPY.offlineBulkNeedsReview,
  BULK_USE_ADJUST: 'The number of cards in a bulk lot is changed with Adjust count, so every change is recorded. Use that instead of editing the total here.',
  BULK_LOT_LISTING_TYPE: 'A bulk lot is sold by the card at a price per 1,000, so it stays a fixed price item.',
  BULK_LOT_AUCTION: 'A bulk lot cannot be an auction or a reverse auction. It sells by the card at a price per 1,000.',
  BULK_LOT_STATUS: 'The status of a bulk lot follows its card count. Use Adjust count to change how many cards are on hand.',
  BULK_LOT_PRICE: 'Enter a price per 1,000 cards above $0.00.',
  BULK_LOT_CHANNEL: 'A bulk lot cannot be sold this way. It sells by the card at a price per 1,000.',
  BULK_LOT_BUSY: 'This bulk lot has cards on hold or in a shopper cart. Release them first.',
  BULK_ADJUST_BAD_COUNT: 'Enter a whole number of cards that works with the cards on hand.',
  BULK_ADJUST_NO_CHANGE: FOLLOWUP_COPY.adjustNoChange,
  BULK_ADJUST_CONFLICT: 'The card count changed while you were editing. Look at the new count and try again.',
  BULK_ADJUST_TOO_MANY: 'That is more cards than are on hand.',
  BULK_ADJUST_TOO_BIG: 'A bulk lot holds at most 1,000,000 cards.',
  BULK_REFUND_NOT_BULK: 'That sale is not a bulk lot sale.',
  BULK_REFUND_BAD_CARDS: 'Enter a whole number of cards to take back, 1 or more.',
  BULK_REFUND_TOO_MANY: 'That is more cards than are still out on this sale.',
  BULK_REFUND_TOO_SMALL: 'That many cards is worth less than one cent of this sale. Take back more cards.',
  BULK_REFUND_DONE: 'All of the cards on this sale have already been taken back.',
  BULK_REFUND_AMOUNT_MISMATCH: 'The refund amount did not match the cards. Try again.',
  BULK_HOLD_BAD_HOURS: 'Choose how long to hold the cards, from 1 hour to 7 days.',
  BULK_HOLD_LIMIT: 'There are too many holds on this lot right now. Try again after one is released.',
  BULK_HOLD_HAS_INVOICE: 'A payment request is already open for this hold. Finish it or cancel it first.',
  BULK_HOLD_LINK_FAILED: 'The payment link could not be cancelled. The cards stay held. Try again in a moment.',
  BULK_HOLD_PAYMENT_FAILED: 'The payment could not be recorded. The cards stay held. Try again in a moment.',
  BULK_HOLD_SQUARE_UNAVAILABLE: 'Square payments are not set up for this shop. Take the payment in cash instead.',
  BULK_USE_CARD_HOLD: 'A bulk lot hold is placed with the number of cards. Use Hold cards on the lot.',
  BULK_HOLD_NOT_ACTIVE: 'That hold is no longer active.',
  BULK_HOLD_NOT_FOUND: 'That hold was not found.',
  FORBIDDEN: FOLLOWUP_COPY.staffNoAccess,
  BULK_CART_NOT_OPEN: 'That cart is no longer open.',
};

export function describeFollowupCode(code: string | null | undefined, serverText?: string | null): string {
  if (serverText && serverText.trim()) return serverText;
  if (code && FOLLOWUP_ERROR_COPY[code]) return FOLLOWUP_ERROR_COPY[code];
  if (code && BULK_ERROR_COPY[code]) return BULK_ERROR_COPY[code];
  return BULK_COPY.errorGeneric;
}

// ---------------------------------------------------------------------------
// Hold contact email (parity with normalizeCustomerEmail in services/bulkLot/bulkLotHoldService.ts)
// ---------------------------------------------------------------------------

export type OptionalEmail = { ok: true; email: string | null } | { ok: false };

/**
 * Reads the optional customer email box. Blank is fine (no email). Otherwise one plain address, no spaces, at most 254
 * characters, saved in lower case. The server checks again; this only keeps an obvious typo from a round trip.
 */
export function parseOptionalEmail(text: string): OptionalEmail {
  const t = (text ?? '').trim();
  if (t === '') return { ok: true, email: null };
  if (t.length > 254 || /\s/.test(t) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return { ok: false };
  return { ok: true, email: t.toLowerCase() };
}

/** True when a failed request means "this account has no register access" (the server answers 403 FORBIDDEN). */
export function isNoRegisterAccess(err: unknown): boolean {
  const r = (err as { response?: { status?: unknown; data?: { code?: unknown } } } | null)?.response;
  return !!r && (r.status === 403 || r.data?.code === 'FORBIDDEN');
}

/** Every user-facing string in this module, for the copy lint test. */
export function allFollowupCopy(): string[] {
  return [...Object.values(FOLLOWUP_COPY), ...Object.values(FOLLOWUP_ERROR_COPY), ...Object.values(ADJUST_REASON_LABELS)];
}
