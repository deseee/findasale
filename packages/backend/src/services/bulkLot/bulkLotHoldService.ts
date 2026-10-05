/**
 * bulkLotHoldService (ADR-136 Addendum B, roadmap #659): hold N cards of a bulk lot for a customer.
 *
 * ItemReservation cannot do this: it is unique per item and holds a whole item. A hold on a lot is a BulkLotHold row that
 * OWNS the cards: they are taken from the lot when the hold is placed (the same guarded stockSold increment a register sale
 * uses, so two holds can never claim the same card) and handed back when the hold is released, expires, or the payment
 * attached to it never lands. The price is snapshotted when the hold is placed (price per 1,000 in cents and the rounded
 * line total), so a later price change cannot move what the customer agreed to.
 *
 *   place    organizer for a customer (hours 1 to 168, default 24) or a signed-in shopper (2 hours, one hold per lot)
 *   release  CAS ACTIVE to RELEASED and cards back, in one transaction. A hold with an unpaid Square link cancels the link
 *            first (refused when Square will not cancel it, so a payable link never outlives its cards).
 *   convert  turn a hold into a sale. CASH records a HoldInvoice and settles it at once through markHoldInvoicePaid
 *            ('pos-cash'); SQUARE creates the payment link and leaves the invoice PENDING until the webhook pays it. In both
 *            cases the payment recorder settles the lot line against THIS hold (services/holdInvoicePaymentRecorder.ts).
 *   sweep    expired ACTIVE holds go back to the lot. A hold whose invoice is still PENDING is left to invoiceExpiryJob (it
 *            decides whether a payment is in flight); once that invoice is EXPIRED or CANCELLED the next sweep releases the
 *            hold. A hold whose invoice is PAID is never released (the recorder converts it; an anomaly is logged).
 *
 * If a payment lands for a hold that was already released, the recorder re-reserves the cards if they are still there and
 * otherwise refunds the card share (the existing oversold settlement), so money is never left without cards or a refund.
 *
 * No Prisma client in this module: database access and the Square and recorder calls are passed in (HoldDb, HoldDeps).
 */
import { z } from 'zod';
import { BulkLotDb, SellUnitsInTx, bulkLotError, planBulkLine, releaseBulkLotUnits } from './bulkLotService';
import { MAX_LOT_CARDS, formatCents, formatCardCount } from './bulkLotPricing';
import { randomUUID } from 'crypto';

export const ORGANIZER_HOLD_DEFAULT_HOURS = 24;
export const ORGANIZER_HOLD_MAX_HOURS = 168;
export const SHOPPER_HOLD_MINUTES = 120;
export const MAX_ACTIVE_HOLDS_PER_LOT = 25;
export const MAX_ACTIVE_SHOPPER_HOLDS = 5;
export const HOLD_STATUSES = ['ACTIVE', 'CONVERTED', 'RELEASED', 'EXPIRED'] as const;

export type BulkHoldErrorCode =
  | 'BULK_HOLD_NOT_FOUND'
  | 'BULK_HOLD_NOT_ACTIVE'
  | 'BULK_HOLD_LIMIT'
  | 'BULK_HOLD_HAS_INVOICE'
  | 'BULK_HOLD_LINK_FAILED'
  | 'BULK_HOLD_PAYMENT_FAILED'
  | 'BULK_HOLD_SQUARE_UNAVAILABLE';

export const BULK_HOLD_MESSAGES: Record<BulkHoldErrorCode, string> = {
  BULK_HOLD_NOT_FOUND: 'That hold was not found.',
  BULK_HOLD_NOT_ACTIVE: 'That hold is no longer active.',
  BULK_HOLD_LIMIT: 'There are too many holds on this lot right now. Try again after one is released.',
  BULK_HOLD_HAS_INVOICE: 'A payment request is already open for this hold. Finish it or cancel it first.',
  BULK_HOLD_LINK_FAILED: 'The payment link could not be cancelled. The cards stay held. Try again in a moment.',
  BULK_HOLD_PAYMENT_FAILED: 'The payment could not be recorded. The cards stay held. Try again in a moment.',
  BULK_HOLD_SQUARE_UNAVAILABLE: 'Square payments are not set up for this shop. Take the payment in cash instead.',
};

export class BulkHoldError extends Error {
  readonly status: number;
  readonly code: BulkHoldErrorCode;
  readonly extra?: Record<string, unknown>;
  constructor(code: BulkHoldErrorCode, status: number, extra?: Record<string, unknown>) {
    super(BULK_HOLD_MESSAGES[code]);
    this.name = 'BulkHoldError';
    this.status = status;
    this.code = code;
    this.extra = extra;
    Object.setPrototypeOf(this, BulkHoldError.prototype);
  }
}

export function isBulkHoldError(err: unknown): err is BulkHoldError {
  return !!err && typeof err === 'object' && (err as { name?: unknown }).name === 'BulkHoldError' && typeof (err as { code?: unknown }).code === 'string';
}

const quantityField = z
  .number({ invalid_type_error: 'Enter the number of cards as a whole number.', required_error: 'Enter the number of cards to hold.' })
  .int('Enter the number of cards as a whole number.')
  .min(1, 'Hold at least 1 card.')
  .max(MAX_LOT_CARDS, 'A bulk lot holds at most 1,000,000 cards.');

export const OrganizerHoldSchema = z
  .object({
    quantity: quantityField,
    customerName: z.string().trim().min(1, 'Enter the customer name.').max(120, 'Keep the name under 120 characters.').optional(),
    hours: z.number().int('Enter whole hours.').min(1, 'Hold for at least 1 hour.').max(ORGANIZER_HOLD_MAX_HOURS, 'Hold for at most 7 days.').optional(),
  })
  .strict();

export const ShopperHoldSchema = z.object({ quantity: quantityField }).strict();

export const ConvertHoldSchema = z.object({ method: z.enum(['CASH', 'SQUARE'], { errorMap: () => ({ message: 'Pick cash or Square.' }) }) }).strict();

export interface HoldDb extends BulkLotDb {
  $transaction<T>(fn: (tx: any) => Promise<T>): Promise<T>;
  bulkLotHold: {
    create(args: any): Promise<any>;
    findUnique(args: any): Promise<any>;
    findMany(args: any): Promise<any[]>;
    updateMany(args: any): Promise<{ count: number }>;
    count(args: any): Promise<number>;
  };
  holdInvoice: {
    create(args: any): Promise<any>;
    findUnique(args: any): Promise<any>;
    updateMany(args: any): Promise<{ count: number }>;
  };
}

export type SquareLinkResult = { ok: true; url: string; paymentLinkId: string; orderId: string | null } | { ok: false; message: string };

export interface HoldDeps {
  /** Guarded stock increment inside a transaction (itemStockService.sellItemUnitsInTransaction). */
  sell: SellUnitsInTx;
  now?: () => Date;
  /** holdInvoicePaymentRecorder.markHoldInvoicePaid (needed for convert). */
  markPaid?: (invoiceId: string, ref: { processor: 'STRIPE' | 'SQUARE'; externalPaymentId: string | null }, opts: { source: 'pos-cash' }) => Promise<{ recorded: boolean; alreadyPaid: boolean; deadInvoice?: boolean }>;
  /** Square payment link create and cancel (needed for SQUARE convert and for releasing a hold with a link). */
  createSquareLink?: (p: { holdInvoiceId: string; amountCents: number; description: string; appFeeCents: number }) => Promise<SquareLinkResult>;
  deleteSquareLink?: (p: { paymentLinkId: string }) => Promise<{ ok: boolean }>;
  /** Platform fee in cents on a card or link amount. */
  feeCents?: (amountCents: number) => number;
  newInvoiceId?: () => string;
}

export type HoldActor =
  | { kind: 'ORGANIZER'; organizerId: string; actorUserId: string }
  | { kind: 'SHOPPER'; userId: string };

export interface HoldView {
  id: string;
  itemId: string;
  saleId: string;
  quantity: number;
  quantityLabel: string;
  pricePerThousandCents: number;
  lineCents: number;
  lineLabel: string;
  customerName: string | null;
  status: string;
  expiresAt: string;
  createdAt: string;
  holdInvoiceId: string | null;
  purchaseId: string | null;
  releasedReason: string | null;
  mine: boolean;
}

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v ?? ''));

export function toHoldView(row: any, actor?: HoldActor): HoldView {
  const mine = !!actor && (actor.kind === 'SHOPPER' ? row.shopperUserId === actor.userId : row.organizerId === actor.organizerId);
  return {
    id: String(row.id),
    itemId: String(row.itemId),
    saleId: String(row.saleId),
    quantity: Number(row.quantity),
    quantityLabel: `${formatCardCount(Number(row.quantity))} cards`,
    pricePerThousandCents: Number(row.pricePerThousandCents),
    lineCents: Number(row.lineCents),
    lineLabel: formatCents(Number(row.lineCents)),
    customerName: row.customerName ?? null,
    status: String(row.status),
    expiresAt: iso(row.expiresAt),
    createdAt: iso(row.createdAt),
    holdInvoiceId: row.holdInvoiceId ?? null,
    purchaseId: row.purchaseId ?? null,
    releasedReason: row.releasedReason ?? null,
    mine,
  };
}

function parseWith<T>(schema: z.ZodType<T>, raw: unknown): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw bulkLotError('BULK_VALIDATION', 400, { issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
  }
  return parsed.data;
}

const nowOf = (deps: HoldDeps): Date => (deps.now ? deps.now() : new Date());

// ---------------------------------------------------------------------------
// Place
// ---------------------------------------------------------------------------

export async function placeBulkHold(db: HoldDb, deps: HoldDeps, actor: HoldActor, itemId: string, rawInput: unknown): Promise<HoldView> {
  const input = actor.kind === 'ORGANIZER' ? parseWith(OrganizerHoldSchema, rawInput) : { ...parseWith(ShopperHoldSchema, rawInput), customerName: undefined, hours: undefined };

  const row = await db.item.findUnique({
    where: { id: itemId },
    select: {
      id: true, saleId: true, organizerId: true, price: true, status: true, stockTotal: true, stockSold: true,
      bulkLot: { select: { id: true } },
    },
  });
  if (!row || !row.saleId) throw bulkLotError('BULK_NOT_FOUND', 404);
  if (actor.kind === 'ORGANIZER' && row.organizerId !== actor.organizerId) throw bulkLotError('BULK_NOT_FOUND', 404);
  if (!row.bulkLot) throw bulkLotError('BULK_NOT_LOT', 409);

  // Price snapshot and the stock check (read side). The write below repeats the capacity check atomically.
  const plan = planBulkLine(row, input.quantity, null);

  const activeOnLot = await db.bulkLotHold.count({ where: { itemId, status: 'ACTIVE' } });
  if (activeOnLot >= MAX_ACTIVE_HOLDS_PER_LOT) throw new BulkHoldError('BULK_HOLD_LIMIT', 409);
  if (actor.kind === 'SHOPPER') {
    const mineOnLot = await db.bulkLotHold.count({ where: { itemId, status: 'ACTIVE', shopperUserId: actor.userId } });
    if (mineOnLot >= 1) throw new BulkHoldError('BULK_HOLD_LIMIT', 409);
    const mineTotal = await db.bulkLotHold.count({ where: { status: 'ACTIVE', shopperUserId: actor.userId } });
    if (mineTotal >= MAX_ACTIVE_SHOPPER_HOLDS) throw new BulkHoldError('BULK_HOLD_LIMIT', 409);
  }

  const now = nowOf(deps);
  const ms = actor.kind === 'ORGANIZER' ? (input.hours ?? ORGANIZER_HOLD_DEFAULT_HOURS) * 3_600_000 : SHOPPER_HOLD_MINUTES * 60_000;
  const expiresAt = new Date(now.getTime() + ms);

  let created: any;
  try {
    created = await db.$transaction(async (tx: any) => {
      await deps.sell(tx, itemId, plan.cards);
      return tx.bulkLotHold.create({
        data: {
          itemId,
          saleId: row.saleId,
          organizerId: row.organizerId,
          createdByUserId: actor.kind === 'ORGANIZER' ? actor.actorUserId : actor.userId,
          shopperUserId: actor.kind === 'SHOPPER' ? actor.userId : null,
          customerName: input.customerName ?? null,
          quantity: plan.cards,
          pricePerThousandCents: plan.pricePerThousandCents,
          lineCents: plan.cents,
          status: 'ACTIVE',
          expiresAt,
        },
      });
    });
  } catch (err) {
    // Duck-typed: the guarded increment found fewer cards than asked (another hold or a register sale got there first).
    if (err && (err as { name?: unknown }).name === 'InsufficientStockError') throw bulkLotError('INSUFFICIENT_STOCK', 409);
    throw err;
  }
  return toHoldView(created, actor);
}

// ---------------------------------------------------------------------------
// Release (shared by organizer, shopper, sweep)
// ---------------------------------------------------------------------------

export type ReleaseReason = 'ORGANIZER_RELEASED' | 'SHOPPER_RELEASED' | 'EXPIRED' | 'INVOICE_DEAD';

/** CAS ACTIVE to the end state and put the cards back, in one transaction. True when THIS call released it. */
export async function releaseHoldCards(db: Pick<HoldDb, '$transaction'>, holdId: string, itemId: string, quantity: number, to: 'RELEASED' | 'EXPIRED', reason: ReleaseReason): Promise<boolean> {
  return db.$transaction(async (tx: any) => {
    const flip = await tx.bulkLotHold.updateMany({ where: { id: holdId, status: 'ACTIVE' }, data: { status: to, releasedReason: reason } });
    if (flip.count !== 1) return false;
    await releaseBulkLotUnits(tx, itemId, quantity);
    return true;
  });
}

async function loadHold(db: HoldDb, holdId: string): Promise<any> {
  return db.bulkLotHold.findUnique({ where: { id: holdId } });
}

function ownsHold(actor: HoldActor, hold: any): boolean {
  return actor.kind === 'ORGANIZER' ? hold.organizerId === actor.organizerId : hold.shopperUserId === actor.userId;
}

export async function releaseBulkHold(db: HoldDb, deps: HoldDeps, actor: HoldActor, holdId: string): Promise<{ hold: HoldView; released: boolean }> {
  const hold = await loadHold(db, holdId);
  // Someone else's hold looks exactly like a missing one.
  if (!hold || !ownsHold(actor, hold)) throw new BulkHoldError('BULK_HOLD_NOT_FOUND', 404);
  if (hold.status !== 'ACTIVE') {
    // Releasing twice is not an error: report the state it is in.
    if (hold.status === 'RELEASED' || hold.status === 'EXPIRED') return { hold: toHoldView(hold, actor), released: false };
    throw new BulkHoldError('BULK_HOLD_NOT_ACTIVE', 409);
  }

  // A shopper cannot cancel a hold the shop has already sent a payment request for; the shop does that.
  if (actor.kind === 'SHOPPER' && hold.holdInvoiceId) throw new BulkHoldError('BULK_HOLD_HAS_INVOICE', 409);

  if (hold.holdInvoiceId) {
    const invoice = await db.holdInvoice.findUnique({ where: { id: hold.holdInvoiceId }, select: { id: true, status: true, squarePaymentLinkId: true } });
    if (invoice && invoice.status === 'PAID') throw new BulkHoldError('BULK_HOLD_NOT_ACTIVE', 409);
    if (invoice && invoice.status === 'PENDING') {
      if (invoice.squarePaymentLinkId) {
        let cancelled = false;
        try {
          cancelled = !!deps.deleteSquareLink && (await deps.deleteSquareLink({ paymentLinkId: invoice.squarePaymentLinkId })).ok;
        } catch (err) {
          console.error('[bulkLotHold] cancelling the Square link failed:', err instanceof Error ? err.message : err);
        }
        if (!cancelled) throw new BulkHoldError('BULK_HOLD_LINK_FAILED', 502);
      }
      await db.holdInvoice.updateMany({ where: { id: invoice.id, status: 'PENDING' }, data: { status: 'CANCELLED', releasedAt: nowOf(deps), reservationId: null } });
    }
  }

  const released = await releaseHoldCards(db, hold.id, hold.itemId, hold.quantity, 'RELEASED', actor.kind === 'ORGANIZER' ? 'ORGANIZER_RELEASED' : 'SHOPPER_RELEASED');
  const fresh = (await loadHold(db, holdId)) ?? hold;
  return { hold: toHoldView(fresh, actor), released };
}

// ---------------------------------------------------------------------------
// Convert to a sale
// ---------------------------------------------------------------------------

export interface ConvertCtx {
  organizerId: string;
  /** Organizer.userId (HoldInvoice.organizerUserId). */
  organizerUserId: string;
  squareReady: boolean;
}

export interface ConvertResult {
  hold: HoldView;
  invoiceId: string;
  status: 'PAID' | 'PENDING';
  /** Square payment link to give the customer (SQUARE only). */
  paymentUrl: string | null;
}

export async function convertBulkHold(db: HoldDb, deps: HoldDeps, ctx: ConvertCtx, holdId: string, rawInput: unknown): Promise<ConvertResult> {
  const input = parseWith(ConvertHoldSchema, rawInput);
  const actor: HoldActor = { kind: 'ORGANIZER', organizerId: ctx.organizerId, actorUserId: ctx.organizerUserId };
  const hold = await loadHold(db, holdId);
  if (!hold || hold.organizerId !== ctx.organizerId) throw new BulkHoldError('BULK_HOLD_NOT_FOUND', 404);
  if (hold.status !== 'ACTIVE') throw new BulkHoldError('BULK_HOLD_NOT_ACTIVE', 409);
  if (hold.holdInvoiceId) throw new BulkHoldError('BULK_HOLD_HAS_INVOICE', 409);
  if (!deps.markPaid) throw new Error('convertBulkHold: markPaid dependency missing');

  const now = nowOf(deps);
  // The invoice never expires before its hold would, and never in the next 5 minutes (a hold about to lapse still gets a usable invoice).
  const expiresAt = new Date(Math.max(new Date(hold.expiresAt).getTime(), now.getTime() + 5 * 60_000));
  const invoiceId = deps.newInvoiceId ? deps.newInvoiceId() : randomUUID();
  const base = {
    shopperUserId: hold.shopperUserId ?? null,
    guestName: hold.shopperUserId ? null : hold.customerName ?? null,
    organizerUserId: ctx.organizerUserId,
    saleId: hold.saleId,
    itemIds: [hold.itemId],
    totalAmount: hold.lineCents,
    status: 'PENDING',
    expiresAt,
    stripeSessionId: null,
    stripePaymentIntentId: null,
    chargeType: null,
    stripeAccountId: null,
  };

  if (input.method === 'CASH') {
    const invoice = await db.$transaction(async (tx: any) => {
      const claim = await tx.bulkLotHold.updateMany({ where: { id: hold.id, status: 'ACTIVE', holdInvoiceId: null }, data: { holdInvoiceId: invoiceId } });
      if (claim.count !== 1) throw new BulkHoldError('BULK_HOLD_NOT_ACTIVE', 409);
      return tx.holdInvoice.create({
        data: { id: invoiceId, ...base, platformFeeAmount: 0, cashAmountCents: hold.lineCents, cardAmountCents: null, processor: 'STRIPE' },
      });
    });
    const paid = await deps.markPaid(invoice.id, { processor: 'STRIPE', externalPaymentId: null }, { source: 'pos-cash' });
    if (paid.deadInvoice || (!paid.recorded && !paid.alreadyPaid)) {
      // Nothing was recorded: take the invoice back so the hold can be paid again, cards stay held.
      await db.holdInvoice.updateMany({ where: { id: invoice.id, status: 'PENDING' }, data: { status: 'CANCELLED', releasedAt: nowOf(deps), reservationId: null } });
      await db.bulkLotHold.updateMany({ where: { id: hold.id, status: 'ACTIVE', holdInvoiceId: invoice.id }, data: { holdInvoiceId: null } });
      throw new BulkHoldError('BULK_HOLD_PAYMENT_FAILED', 500);
    }
    const fresh = (await loadHold(db, holdId)) ?? hold;
    return { hold: toHoldView(fresh, actor), invoiceId: invoice.id, status: 'PAID', paymentUrl: null };
  }

  // SQUARE
  if (!ctx.squareReady || !deps.createSquareLink) throw new BulkHoldError('BULK_HOLD_SQUARE_UNAVAILABLE', 409);
  const newId = invoiceId;
  const appFee = deps.feeCents ? deps.feeCents(hold.lineCents) : 0;
  const link = await deps.createSquareLink({ holdInvoiceId: newId, amountCents: hold.lineCents, description: `Bulk lot, ${formatCardCount(hold.quantity)} cards`, appFeeCents: appFee });
  if (!link.ok) throw new BulkHoldError('BULK_HOLD_PAYMENT_FAILED', 402, { message: link.message });
  try {
    await db.$transaction(async (tx: any) => {
      const claim = await tx.bulkLotHold.updateMany({ where: { id: hold.id, status: 'ACTIVE', holdInvoiceId: null }, data: { holdInvoiceId: newId } });
      if (claim.count !== 1) throw new BulkHoldError('BULK_HOLD_NOT_ACTIVE', 409);
      await tx.holdInvoice.create({
        data: { id: newId, ...base, platformFeeAmount: appFee, cashAmountCents: null, cardAmountCents: hold.lineCents, processor: 'SQUARE', squarePaymentLinkId: link.paymentLinkId, squareOrderId: link.orderId },
      });
    });
  } catch (err) {
    // A live link nobody can reconcile must not survive a failed save.
    try {
      if (deps.deleteSquareLink) await deps.deleteSquareLink({ paymentLinkId: link.paymentLinkId });
    } catch (delErr) {
      console.error(`[bulkLotHold] ORPHANED-SQUARE-LINK ${link.paymentLinkId} could not be cancelled after the invoice row failed to save:`, delErr instanceof Error ? delErr.message : delErr);
    }
    throw err;
  }
  const fresh = (await loadHold(db, holdId)) ?? hold;
  return { hold: toHoldView(fresh, actor), invoiceId: newId, status: 'PENDING', paymentUrl: link.url };
}

// ---------------------------------------------------------------------------
// Sweep and lists
// ---------------------------------------------------------------------------

export interface SweepResult {
  examined: number;
  expired: number;
  /** Invoice still PENDING: left for invoiceExpiryJob. */
  waitingOnInvoice: number;
  /** Invoice PAID but the hold is still ACTIVE: logged, never released. */
  paidAnomalies: number;
}

export async function sweepExpiredBulkHolds(db: HoldDb, deps: Pick<HoldDeps, 'now'>, batch = 200, onReleased?: (itemId: string) => void): Promise<SweepResult> {
  const now = deps.now ? deps.now() : new Date();
  const due: any[] = await db.bulkLotHold.findMany({ where: { status: 'ACTIVE', expiresAt: { lte: now } }, orderBy: { expiresAt: 'asc' }, take: batch });
  const out: SweepResult = { examined: due.length, expired: 0, waitingOnInvoice: 0, paidAnomalies: 0 };
  for (const hold of due) {
    try {
      if (hold.holdInvoiceId) {
        const inv = await db.holdInvoice.findUnique({ where: { id: hold.holdInvoiceId }, select: { status: true } });
        if (inv && inv.status === 'PENDING') {
          out.waitingOnInvoice++;
          continue;
        }
        if (inv && inv.status === 'PAID') {
          out.paidAnomalies++;
          console.error(`[bulkLotHold] hold ${hold.id} is still ACTIVE but invoice ${hold.holdInvoiceId} is PAID. Not releasing the cards.`);
          continue;
        }
      }
      const reason: ReleaseReason = hold.holdInvoiceId ? 'INVOICE_DEAD' : 'EXPIRED';
      if (await releaseHoldCards(db, hold.id, hold.itemId, hold.quantity, 'EXPIRED', reason)) {
        out.expired++;
        try {
          onReleased?.(hold.itemId);
        } catch {
          // a follow-up notification must never stop the sweep
        }
      }
    } catch (err) {
      console.error(`[bulkLotHold] sweep could not release hold ${hold.id}:`, err instanceof Error ? err.message : err);
    }
  }
  return out;
}

export async function listLotHolds(db: HoldDb, ctx: { organizerId: string }, itemId: string, statuses: ReadonlyArray<string> = ['ACTIVE'], limit = 100): Promise<HoldView[]> {
  const item = await db.item.findUnique({ where: { id: itemId }, select: { id: true, organizerId: true } });
  if (!item || item.organizerId !== ctx.organizerId) throw bulkLotError('BULK_NOT_FOUND', 404);
  const rows = await db.bulkLotHold.findMany({
    where: { itemId, status: { in: statuses.filter((s) => (HOLD_STATUSES as readonly string[]).includes(s)) } },
    orderBy: { createdAt: 'desc' },
    take: Math.max(1, Math.min(200, Math.trunc(limit))),
  });
  return rows.map((r) => toHoldView(r, { kind: 'ORGANIZER', organizerId: ctx.organizerId, actorUserId: '' }));
}

export async function listShopperHolds(db: HoldDb, ctx: { userId: string }, limit = 50): Promise<HoldView[]> {
  const rows = await db.bulkLotHold.findMany({ where: { shopperUserId: ctx.userId, status: 'ACTIVE' }, orderBy: { createdAt: 'desc' }, take: Math.max(1, Math.min(100, Math.trunc(limit))) });
  return rows.map((r) => toHoldView(r, { kind: 'SHOPPER', userId: ctx.userId }));
}
