import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { calculateConsignorPayout, roundToCents } from './commissionCalcService';
import { csvCell as safeCsvCell } from '../utils/csvSafe';

/**
 * Consignor settlement LEDGER (organizer-settles model, 2026-09-29).
 *
 * PRODUCT DECISION (Patrick, 2026-09-29): consignor payouts are "Square or settled by the
 * organizer" and Stripe is closed. FindA.Sale NEVER initiates, holds or routes consignor money.
 * This module is a ledger + statements + payment-records feature: it works out what each
 * consignor is owed, snapshots it line by line, and records that the organizer paid it
 * (cash, check, Square, bank transfer, other) outside FindA.Sale. Nothing in here calls any
 * payment rail. Ledger correctness and idempotency come before everything else.
 *
 * INDUSTRY-STANDARD DEFAULTS (v1, recorded here so they are not re-litigated):
 *  - Payout basis is Item.price (the tag price). collectedAmount (paid purchases net of
 *    refunds) and basisSource are stored on every line and a variance flag is raised when
 *    they differ; the payout itself is NOT changed by the variance in v1.
 *  - Items whose latest purchase is refunded, being refunded or disputed are excluded from a
 *    snapshot (reported as `excluded`, not silently dropped) and reappear if they become
 *    payable again.
 *  - No partial payments and no adjustments in v1: a payout is paid in full (paidAmount =
 *    netPayout) or not at all.
 *  - A run may have no sale (consignment inventory, Item.saleId null) and may span sales.
 *  - Owner-only actions in v1 (the TEAMS gate stays server-side, in the controller).
 *  - Statement emails are opt-in per action.
 *  - Square is a named payment method, nothing more.
 *
 * DOUBLE-PAY GUARD: an item is "unsettled" when it is SOLD, has a consignorId, and has no
 * ConsignorPayoutItem with a non-null activeItemKey. activeItemKey is @unique and equals the
 * itemId while the line is live; voiding a payout or cancelling a run sets it to NULL. So
 * even two concurrent create-run calls cannot both claim an item: the loser gets P2002,
 * which surfaces as a 409 carrying the existing batch id.
 *
 * Legacy rows written before this ledger have no ConsignorPayoutItem lines. Their status
 * values are mapped on read (normalizePayoutStatus / normalizeBatchStatus) and never rewritten
 * here; see packages/database/prisma/manual/consignor_payout_status_backfill.sql.
 */

// Loose on purpose: callers pass the extended Prisma client, a mock, or an interactive-
// transaction client. Typing this precisely re-triggers the Prisma v5 "excessive stack depth"
// pitfall documented in consignorController.ts (ConsignorTxClient).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LedgerDb = any;

// ── Vocabulary ─────────────────────────────────────────────────────────────────────────────

export const PAYMENT_METHODS = ['CASH', 'CHECK', 'SQUARE', 'BANK_TRANSFER', 'OTHER'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
/** Legacy method values that may still be stored on old rows. Readable, never written. */
export const LEGACY_METHODS = ['VENMO', 'ACH'] as const;

export const METHOD_LABELS: Record<string, string> = {
  CASH: 'Cash',
  CHECK: 'Check',
  SQUARE: 'Square',
  BANK_TRANSFER: 'Bank transfer',
  OTHER: 'Other',
  VENMO: 'Venmo',
  ACH: 'Bank transfer (ACH)',
};

export const MAX_REFERENCE_LENGTH = 120;
export const MAX_NOTE_LENGTH = 1000;
export const MAX_REASON_LENGTH = 500;

/**
 * Statement footer copy. ATTORNEY TO REVIEW before this ships to real consignors: it states how
 * sales tax is treated, which is a legal position (see the investigation-3 legal flags:
 * sales tax R 205.70, consignment agreement payout clauses).
 */
export const STATEMENT_FOOTER =
  'Amounts are based on item sale prices before sales tax. Sales tax, where it applies, is handled by the organizer and is not part of your share.';

/** Batch statuses under which payouts may be marked paid / statements sent. */
const BATCH_OPEN_STATUSES = ['APPROVED', 'PARTIALLY_PAID', 'COMPLETED', 'PARTIAL', 'PROCESSING'];
/** Payout statuses that mean "owed, not yet paid" (MANUAL_CASH_CHECK is the legacy spelling). */
const PAYOUT_UNPAID_STATUSES = ['PENDING', 'ON_HOLD', 'MANUAL_CASH_CHECK'];
const PAYOUT_PAID_STATUSES = ['PAID', 'COMPLETED'];
const PAYOUT_DEAD_STATUSES = ['VOID', 'SIMULATED', 'FAILED'];

// ── Errors ─────────────────────────────────────────────────────────────────────────────────

export class LedgerError extends Error {
  status: number;
  code: string;
  extra: Record<string, unknown>;
  constructor(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
    super(message);
    this.name = 'LedgerError';
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

const notFound = (what: string) => new LedgerError(404, 'NOT_FOUND', `${what} not found`);

function isUniqueViolation(err: unknown): boolean {
  return Boolean(err) && (err as { code?: string }).code === 'P2002';
}

// ── Small helpers ──────────────────────────────────────────────────────────────────────────

const D = (v: unknown): Decimal => new Decimal((v as any) ?? 0);

/** Money as a fixed 2-decimal string for JSON (null stays null). */
export function money(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return D(v).toFixed(2);
}

/** Statement reference shown to consignors: last 8 characters of the payout id, uppercased. */
export function payoutReference(payoutId: string): string {
  return String(payoutId).slice(-8).toUpperCase();
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

const iso = (d: any) => (d ? new Date(d).toISOString() : null);

// ── Legacy value mapping (read side) ───────────────────────────────────────────────────────

export interface NormalizedStatus {
  status: string;
  legacy: boolean;
}

/**
 * Payout status as shown to the UI. Ledger values pass through. Legacy values map on read:
 * MANUAL_CASH_CHECK -> PENDING, COMPLETED -> PAID, SIMULATED -> VOID,
 * PROCESSING / FAILED / PARTIAL -> LEGACY (shown as a legacy row, never as money owed or paid).
 */
export function normalizePayoutStatus(raw: string | null | undefined): NormalizedStatus {
  switch (raw) {
    case 'PENDING':
    case 'ON_HOLD':
    case 'PAID':
    case 'VOID':
      return { status: raw, legacy: false };
    case 'MANUAL_CASH_CHECK':
      return { status: 'PENDING', legacy: true };
    case 'COMPLETED':
      return { status: 'PAID', legacy: true };
    case 'SIMULATED':
      return { status: 'VOID', legacy: true };
    default:
      return { status: 'LEGACY', legacy: true };
  }
}

/**
 * Batch status as shown to the UI. A legacy COMPLETED batch whose payouts were all SIMULATED
 * (Stripe test mode, no money moved) shows as TEST_RUN. Other COMPLETED batches show as PAID.
 * PARTIAL / PROCESSING / FAILED show as LEGACY.
 */
export function normalizeBatchStatus(raw: string | null | undefined, payoutRawStatuses: string[] = []): NormalizedStatus {
  switch (raw) {
    case 'DRAFT':
    case 'APPROVED':
    case 'PARTIALLY_PAID':
    case 'PAID':
    case 'CANCELLED':
      return { status: raw, legacy: false };
    case 'COMPLETED': {
      const allSimulated = payoutRawStatuses.length > 0 && payoutRawStatuses.every((s) => s === 'SIMULATED');
      return { status: allSimulated ? 'TEST_RUN' : 'PAID', legacy: true };
    }
    default:
      return { status: 'LEGACY', legacy: true };
  }
}

// ── Input validation ───────────────────────────────────────────────────────────────────────

/** Map a method sent by the older payout modal (CASH/CHECK/VENMO/OTHER) onto the ledger vocabulary. */
export function normalizeLegacyMethodInput(raw: unknown): { method: PaymentMethod; noteSuffix: string | null } {
  const value = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  if ((PAYMENT_METHODS as readonly string[]).includes(value)) return { method: value as PaymentMethod, noteSuffix: null };
  if (value === 'VENMO') return { method: 'OTHER', noteSuffix: 'Paid via Venmo' };
  if (value === 'ACH') return { method: 'BANK_TRANSFER', noteSuffix: null };
  throw new LedgerError(400, 'INVALID_METHOD', `method must be one of ${PAYMENT_METHODS.join(', ')}`);
}

export function requireReason(raw: unknown, field = 'reason'): string {
  const v = typeof raw === 'string' ? raw.trim() : '';
  if (!v) throw new LedgerError(400, 'REASON_REQUIRED', `${field} is required`);
  if (v.length > MAX_REASON_LENGTH) {
    throw new LedgerError(400, 'REASON_TOO_LONG', `${field} must be ${MAX_REASON_LENGTH} characters or fewer`);
  }
  return v;
}

export interface MarkPaidInput {
  method: PaymentMethod;
  paidAt: Date;
  reference: string | null;
  note: string | null;
  notifyConsignor: boolean;
}

/**
 * Validate the mark-paid body. Strict vocabulary (legacy VENMO/ACH are rejected here; the older
 * runPayout modal maps them first via normalizeLegacyMethodInput).
 *
 * The 9+ digit guard on `reference` is a deliberate extra beyond the 120-character limit: the
 * dialog tells organizers not to enter account numbers, and this stops a routing, account or
 * card number from being stored in a field that is later shown to the consignor and exported.
 * Check numbers and short confirmation codes are unaffected.
 */
export function validateMarkPaidInput(body: any, now: Date = new Date()): MarkPaidInput {
  const methodRaw = typeof body?.method === 'string' ? body.method.trim().toUpperCase() : '';
  if (!(PAYMENT_METHODS as readonly string[]).includes(methodRaw)) {
    throw new LedgerError(400, 'INVALID_METHOD', `method must be one of ${PAYMENT_METHODS.join(', ')}`);
  }

  let paidAt = now;
  if (body?.paidAt !== undefined && body?.paidAt !== null && body?.paidAt !== '') {
    if (typeof body.paidAt !== 'string') {
      throw new LedgerError(400, 'INVALID_PAID_AT', 'paidAt must be an ISO date string');
    }
    const parsed = new Date(body.paidAt);
    if (Number.isNaN(parsed.getTime())) {
      throw new LedgerError(400, 'INVALID_PAID_AT', 'paidAt is not a valid date');
    }
    if (parsed.getTime() > now.getTime() + 24 * 60 * 60 * 1000) {
      throw new LedgerError(400, 'PAID_AT_IN_FUTURE', 'paidAt cannot be more than 1 day in the future');
    }
    if (parsed.getTime() < Date.UTC(2000, 0, 1)) {
      throw new LedgerError(400, 'INVALID_PAID_AT', 'paidAt is too far in the past');
    }
    paidAt = parsed;
  }

  let reference: string | null = null;
  if (body?.reference !== undefined && body?.reference !== null) {
    if (typeof body.reference !== 'string') {
      throw new LedgerError(400, 'INVALID_REFERENCE', 'reference must be text');
    }
    const trimmed = body.reference.trim();
    if (trimmed.length > MAX_REFERENCE_LENGTH) {
      throw new LedgerError(400, 'REFERENCE_TOO_LONG', `reference must be ${MAX_REFERENCE_LENGTH} characters or fewer`);
    }
    if (/\d{9,}/.test(trimmed.replace(/[\s-]/g, ''))) {
      throw new LedgerError(
        400,
        'REFERENCE_LOOKS_SENSITIVE',
        'reference looks like an account or card number. Enter a check number or short confirmation code instead.'
      );
    }
    reference = trimmed || null;
  }

  let note: string | null = null;
  if (body?.note !== undefined && body?.note !== null) {
    if (typeof body.note !== 'string') throw new LedgerError(400, 'INVALID_NOTE', 'note must be text');
    const trimmed = body.note.trim();
    if (trimmed.length > MAX_NOTE_LENGTH) {
      throw new LedgerError(400, 'NOTE_TOO_LONG', `note must be ${MAX_NOTE_LENGTH} characters or fewer`);
    }
    note = trimmed || null;
  }

  return { method: methodRaw as PaymentMethod, paidAt, reference, note, notifyConsignor: body?.notifyConsignor === true };
}

// ── Unsettled ledger ───────────────────────────────────────────────────────────────────────

export interface LoadUnsettledOptions {
  workspaceId: string;
  /** undefined = any sale (and consignment inventory); null = inventory only; string = that sale. */
  saleId?: string | null;
  /** undefined or empty = every consignor in the workspace. */
  consignorIds?: string[];
  /** Only include items sold on or before this instant. */
  asOf?: Date | null;
  /** Include items that may already be covered by a pre-ledger payout (see LEGACY_PAYOUT_OVERLAP). */
  acknowledgeLegacyOverlap?: boolean;
  /** Payouts whose live lines should be re-evaluated as if unsettled (used by refresh). */
  releasePayoutIds?: string[];
  /** Item ids that keep their earlier legacy-overlap acknowledgement (used by refresh). */
  keepItemIds?: string[];
}

export interface LedgerLine {
  itemId: string;
  title: string;
  saleId: string | null;
  soldAt: Date | null;
  listPrice: Decimal;
  priceBeforeMarkdown: Decimal | null;
  collectedAmount: Decimal | null;
  purchaseId: string | null;
  basisSource: 'ITEM_PRICE' | 'PURCHASE';
  varianceFlag: boolean;
  ratePct: Decimal;
  consignorShare: Decimal;
  organizerShare: Decimal;
  tierLabel: string | null;
}

export interface LegacyPayoutRef {
  id: string;
  saleId: string | null;
  status: string;
  method: string | null;
  netPayout: string | null;
  paidAt: Date | null;
  createdAt: Date;
}

export interface UnsettledConsignor {
  consignor: {
    id: string;
    name: string;
    email: string | null;
    commissionRate: Decimal;
    useTieredCommission: boolean;
    preferredPayoutMethod: string | null;
    squareOnboarded: boolean;
  };
  lines: LedgerLine[];
  gross: Decimal;
  net: Decimal;
  tierBreakdown: any[] | null;
  hasVariance: boolean;
  legacyPayouts: LegacyPayoutRef[];
}

export interface ExcludedItem {
  itemId: string;
  title: string;
  consignorId: string;
  saleId: string | null;
  reason: string; // REFUNDED | REFUND_IN_PROGRESS | DISPUTED | DISPUTE_LOST | NO_PRICE | LEGACY_PAYOUT_OVERLAP
  detail: string;
}

export interface UnsettledResult {
  consignors: UnsettledConsignor[];
  excluded: ExcludedItem[];
}

const PURCHASE_RELEVANT = new Set(['PAID', 'REFUNDED', 'REFUNDING', 'DISPUTED', 'DISPUTE_LOST']);

const EXCLUSION_DETAIL: Record<string, string> = {
  REFUNDED: 'The buyer was refunded, so nothing is owed on this item.',
  REFUND_IN_PROGRESS: 'A refund is in progress. It will be included once the sale stands.',
  DISPUTED: 'The payment is disputed. It will be included if the dispute is resolved in your favor.',
  DISPUTE_LOST: 'The payment dispute was lost, so nothing is owed on this item.',
  NO_PRICE: 'The item has no sale price recorded.',
  LEGACY_PAYOUT_OVERLAP:
    'A payout recorded before the ledger existed may already cover this item. Include it only after checking that payout.',
};

function soldAtFor(item: any): Date | null {
  const paid = (item.purchases || []).filter((p: any) => p.status === 'PAID' && p.createdAt);
  if (paid.length) {
    return paid.map((p: any) => new Date(p.createdAt)).sort((a: Date, b: Date) => b.getTime() - a.getTime())[0];
  }
  return item.updatedAt ? new Date(item.updatedAt) : null;
}

/**
 * Everything currently owed to consignors in this workspace, computed from the ledger.
 * Read-only. See the module header for the "unsettled" definition.
 */
export async function loadUnsettled(db: LedgerDb, opts: LoadUnsettledOptions): Promise<UnsettledResult> {
  const requestedIds = (opts.consignorIds ?? []).filter(Boolean);
  const consignors: any[] = await db.consignor.findMany({
    where: { workspaceId: opts.workspaceId, ...(requestedIds.length ? { id: { in: requestedIds } } : {}) },
    select: {
      id: true,
      name: true,
      email: true,
      workspaceId: true,
      commissionRate: true,
      useTieredCommission: true,
      preferredPayoutMethod: true,
      squareOnboarded: true,
    },
  });
  if (consignors.length === 0) return { consignors: [], excluded: [] };
  const consignorIds = consignors.map((c) => c.id);

  const items: any[] = await db.item.findMany({
    where: {
      consignorId: { in: consignorIds },
      status: 'SOLD',
      ...(opts.saleId !== undefined ? { saleId: opts.saleId } : {}),
    },
    select: {
      id: true,
      title: true,
      price: true,
      saleId: true,
      priceBeforeMarkdown: true,
      updatedAt: true,
      consignorId: true,
      purchases: { select: { id: true, amount: true, status: true, refundedAmount: true, createdAt: true } },
    },
  });
  if (items.length === 0) return { consignors: [], excluded: [] };

  const itemIds = items.map((i) => i.id);
  const activeRows: any[] = await db.consignorPayoutItem.findMany({
    where: { activeItemKey: { in: itemIds } },
    select: { activeItemKey: true, payoutId: true },
  });
  const released = new Set(opts.releasePayoutIds ?? []);
  const alreadySettled = new Set(activeRows.filter((r) => !released.has(r.payoutId)).map((r) => r.activeItemKey));

  const legacyRows: any[] = await db.consignorPayout.findMany({
    where: {
      consignorId: { in: consignorIds },
      status: { notIn: PAYOUT_DEAD_STATUSES },
      items: { none: {} },
    },
    select: { id: true, consignorId: true, saleId: true, status: true, method: true, netPayout: true, paidAt: true, createdAt: true },
  });
  const legacyByConsignor = new Map<string, LegacyPayoutRef[]>();
  for (const r of legacyRows) {
    const list = legacyByConsignor.get(r.consignorId) ?? [];
    list.push({
      id: r.id,
      saleId: r.saleId ?? null,
      status: r.status,
      method: r.method ?? null,
      netPayout: money(r.netPayout),
      paidAt: r.paidAt ?? null,
      createdAt: new Date(r.createdAt),
    });
    legacyByConsignor.set(r.consignorId, list);
  }

  const keep = new Set(opts.keepItemIds ?? []);
  const excluded: ExcludedItem[] = [];
  const candidatesByConsignor = new Map<string, { item: any; soldAt: Date | null; price: Decimal; collected: Decimal | null; purchaseId: string | null }[]>();

  for (const item of items) {
    if (alreadySettled.has(item.id)) continue; // already in a live payout: not owed again

    const soldAt = soldAtFor(item);
    if (opts.asOf && soldAt && soldAt.getTime() > opts.asOf.getTime()) continue;

    const exclude = (reason: string) =>
      excluded.push({
        itemId: item.id,
        title: item.title,
        consignorId: item.consignorId,
        saleId: item.saleId ?? null,
        reason,
        detail: EXCLUSION_DETAIL[reason] ?? reason,
      });

    const rawPrice = item.price === null || item.price === undefined ? null : new Decimal(item.price);
    if (rawPrice === null || !rawPrice.isFinite() || rawPrice.lessThanOrEqualTo(0)) {
      exclude('NO_PRICE');
      continue;
    }
    const price = roundToCents(rawPrice);

    const relevant = (item.purchases || [])
      .filter((p: any) => PURCHASE_RELEVANT.has(p.status))
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const latest = relevant[0];
    if (latest && latest.status !== 'PAID') {
      exclude(latest.status === 'REFUNDING' ? 'REFUND_IN_PROGRESS' : latest.status);
      continue;
    }

    const paid = relevant.filter((p: any) => p.status === 'PAID');
    let collected: Decimal | null = null;
    let purchaseId: string | null = null;
    if (paid.length) {
      collected = roundToCents(
        paid.reduce((sum: Decimal, p: any) => sum.plus(D(p.amount)).minus(D(p.refundedAmount)), new Decimal(0))
      );
      purchaseId = paid[0].id;
    }

    if (!opts.acknowledgeLegacyOverlap && !keep.has(item.id)) {
      const legacy = legacyByConsignor.get(item.consignorId) ?? [];
      const overlaps = legacy.some(
        (p) => (p.saleId === null || p.saleId === (item.saleId ?? null)) && (soldAt ? soldAt.getTime() <= p.createdAt.getTime() : false)
      );
      if (overlaps) {
        exclude('LEGACY_PAYOUT_OVERLAP');
        continue;
      }
    }

    const list = candidatesByConsignor.get(item.consignorId) ?? [];
    list.push({ item, soldAt, price, collected, purchaseId });
    candidatesByConsignor.set(item.consignorId, list);
  }

  const result: UnsettledConsignor[] = [];
  for (const c of consignors) {
    const candidates = candidatesByConsignor.get(c.id);
    if (!candidates || candidates.length === 0) continue;

    // Deterministic order: sold date, then title, then id.
    candidates.sort((a, b) => {
      const at = a.soldAt ? a.soldAt.getTime() : Number.MAX_SAFE_INTEGER;
      const bt = b.soldAt ? b.soldAt.getTime() : Number.MAX_SAFE_INTEGER;
      if (at !== bt) return at - bt;
      const t = String(a.item.title).localeCompare(String(b.item.title));
      return t !== 0 ? t : String(a.item.id).localeCompare(String(b.item.id));
    });

    // ADR-096: the one shared commission function. Do not compute shares anywhere else.
    const calc = await calculateConsignorPayout(
      { id: c.id, workspaceId: c.workspaceId, commissionRate: c.commissionRate, useTieredCommission: c.useTieredCommission },
      candidates.map((x) => ({ id: x.item.id, price: x.price }))
    );
    const calcById = new Map(calc.lines.map((l) => [l.itemId, l]));

    const lines: LedgerLine[] = candidates.map((x) => {
      const calcLine = calcById.get(x.item.id);
      if (!calcLine) throw new Error(`calculateConsignorPayout returned no line for item ${x.item.id}`);
      const variance = x.collected !== null && x.collected.minus(x.price).abs().greaterThanOrEqualTo(0.01);
      return {
        itemId: x.item.id,
        title: String(x.item.title),
        saleId: x.item.saleId ?? null,
        soldAt: x.soldAt,
        listPrice: x.price,
        priceBeforeMarkdown:
          x.item.priceBeforeMarkdown !== null && x.item.priceBeforeMarkdown !== undefined
            ? roundToCents(x.item.priceBeforeMarkdown)
            : null,
        collectedAmount: x.collected,
        purchaseId: x.purchaseId,
        basisSource: 'ITEM_PRICE',
        varianceFlag: variance,
        ratePct: calcLine.ratePct,
        consignorShare: calcLine.share,
        organizerShare: x.price.minus(calcLine.share),
        tierLabel: calcLine.tierLabel,
      };
    });

    result.push({
      consignor: {
        id: c.id,
        name: c.name,
        email: c.email ?? null,
        commissionRate: D(c.commissionRate),
        useTieredCommission: Boolean(c.useTieredCommission),
        preferredPayoutMethod: c.preferredPayoutMethod ?? null,
        squareOnboarded: Boolean(c.squareOnboarded),
      },
      lines,
      gross: calc.gross,
      net: calc.net,
      tierBreakdown: calc.tierBreakdown,
      hasVariance: lines.some((l) => l.varianceFlag),
      legacyPayouts: legacyByConsignor.get(c.id) ?? [],
    });
  }

  result.sort((a, b) => a.consignor.name.localeCompare(b.consignor.name));
  return { consignors: result, excluded };
}

// ── Serializers ────────────────────────────────────────────────────────────────────────────

export function serializeLine(l: LedgerLine) {
  return {
    itemId: l.itemId,
    title: l.title,
    saleId: l.saleId,
    soldAt: l.soldAt ? l.soldAt.toISOString() : null,
    listPrice: money(l.listPrice),
    priceBeforeMarkdown: money(l.priceBeforeMarkdown),
    markedDown: l.priceBeforeMarkdown !== null && l.priceBeforeMarkdown.greaterThan(l.listPrice),
    collectedAmount: money(l.collectedAmount),
    basisSource: l.basisSource,
    varianceFlag: l.varianceFlag,
    ratePct: money(l.ratePct),
    consignorShare: money(l.consignorShare),
    organizerShare: money(l.organizerShare),
  };
}

export function serializeUnsettledConsignor(c: UnsettledConsignor) {
  return {
    consignorId: c.consignor.id,
    name: c.consignor.name,
    email: c.consignor.email,
    hasEmail: Boolean(c.consignor.email),
    commissionRate: money(c.consignor.commissionRate),
    useTieredCommission: c.consignor.useTieredCommission,
    preferredPayoutMethod: c.consignor.preferredPayoutMethod,
    squareOnboarded: c.consignor.squareOnboarded,
    itemCount: c.lines.length,
    gross: money(c.gross),
    net: money(c.net),
    hasVariance: c.hasVariance,
    tierBreakdown: c.tierBreakdown,
    legacyPayouts: c.legacyPayouts.map((p) => ({ ...p, createdAt: p.createdAt.toISOString(), paidAt: p.paidAt ? new Date(p.paidAt).toISOString() : null })),
    lines: c.lines.map(serializeLine),
  };
}

export function serializeExcluded(e: ExcludedItem) {
  return { ...e };
}

function serializeStoredItem(i: any) {
  return {
    id: i.id,
    itemId: i.itemId ?? null,
    saleId: i.saleId ?? null,
    title: i.titleSnapshot,
    soldAt: i.soldAt ? new Date(i.soldAt).toISOString() : null,
    listPrice: money(i.listPrice),
    priceBeforeMarkdown: money(i.priceBeforeMarkdown),
    markedDown: i.priceBeforeMarkdown != null && D(i.priceBeforeMarkdown).greaterThan(D(i.listPrice)),
    collectedAmount: money(i.collectedAmount),
    basisSource: i.basisSource,
    varianceFlag: Boolean(i.varianceFlag),
    ratePct: money(i.ratePct),
    consignorShare: money(i.consignorShare),
    organizerShare: money(i.organizerShare),
    live: i.activeItemKey != null,
  };
}

/** Serialize a ConsignorPayout row (optionally with consignor / items relations loaded). */
export function serializePayout(p: any) {
  const norm = normalizePayoutStatus(p.status);
  const items: any[] = Array.isArray(p.items) ? p.items : [];
  return {
    id: p.id,
    consignorId: p.consignorId,
    consignorName: p.consignor?.name ?? null,
    consignorEmail: p.consignor?.email ?? null,
    hasEmail: Boolean(p.consignor?.email),
    preferredPayoutMethod: p.consignor?.preferredPayoutMethod ?? null,
    consignor: p.consignor
      ? {
          name: p.consignor.name,
          email: p.consignor.email ?? null,
          stripeOnboarded: Boolean(p.consignor.stripeOnboarded),
          squareOnboarded: Boolean(p.consignor.squareOnboarded),
          preferredPayoutMethod: p.consignor.preferredPayoutMethod ?? null,
        }
      : undefined,
    settlementBatchId: p.settlementBatchId ?? null,
    saleId: p.saleId ?? null,
    reference: payoutReference(p.id),
    status: norm.status,
    rawStatus: p.status,
    legacy: norm.legacy || items.length === 0,
    totalSales: money(p.totalSales),
    commissionAmount: money(p.commissionAmount),
    netPayout: money(p.netPayout),
    method: p.method ?? null,
    paidAt: iso(p.paidAt),
    paidAmount: money(p.paidAmount),
    paidReference: p.paidReference ?? null,
    paidRecordedAt: iso(p.paidRecordedAt),
    holdReason: p.holdReason ?? null,
    voidedAt: iso(p.voidedAt),
    voidReason: p.voidReason ?? null,
    statementSentAt: iso(p.statementSentAt),
    statementSentTo: p.statementSentTo ?? null,
    notes: p.notes ?? null,
    tierBreakdown: p.tierBreakdown ?? null,
    createdAt: iso(p.createdAt),
    itemCount: items.length,
    hasVariance: items.some((i) => i.varianceFlag),
    items: items.map(serializeStoredItem),
  };
}

export function serializeBatch(b: any) {
  const payoutsRaw: any[] = Array.isArray(b.payouts) ? b.payouts : [];
  const norm = normalizeBatchStatus(b.status, payoutsRaw.map((p) => p.status));
  const payouts = payoutsRaw
    .map(serializePayout)
    .sort((a, c) => String(a.consignorName ?? '').localeCompare(String(c.consignorName ?? '')));
  const payoutsByConsignorId: Record<string, ReturnType<typeof serializePayout>> = {};
  for (const p of payouts) payoutsByConsignorId[p.consignorId] = p;
  const live = payouts.filter((p) => p.status !== 'VOID');
  return {
    id: b.id,
    saleId: b.saleId ?? null,
    saleTitle: b.sale?.title ?? null,
    workspaceId: b.workspaceId,
    runNumber: b.runNumber ?? 1,
    mode: b.payoutMode ?? 'ORGANIZER_SETTLES',
    status: norm.status,
    rawStatus: b.status,
    legacy: norm.legacy,
    totalGross: money(b.totalGross),
    totalConsignorPayouts: money(b.totalConsignorPayouts),
    createdAt: iso(b.createdAt),
    approvedAt: iso(b.approvedAt),
    snapshotAt: iso(b.snapshotAt),
    asOf: iso(b.asOf),
    cancelledAt: iso(b.cancelledAt),
    cancelledReason: b.cancelledReason ?? null,
    payoutCount: live.length,
    paidCount: live.filter((p) => p.status === 'PAID').length,
    payouts,
    payoutsByConsignorId,
  };
}

// ── Row builders / events ──────────────────────────────────────────────────────────────────

function lineToRow(line: LedgerLine, ctx: { payoutId: string; consignorId: string; workspaceId: string }) {
  return {
    payoutId: ctx.payoutId,
    consignorId: ctx.consignorId,
    workspaceId: ctx.workspaceId,
    saleId: line.saleId,
    itemId: line.itemId,
    titleSnapshot: line.title.slice(0, 300),
    listPrice: line.listPrice,
    priceBeforeMarkdown: line.priceBeforeMarkdown,
    collectedAmount: line.collectedAmount,
    purchaseId: line.purchaseId,
    basisSource: line.basisSource,
    varianceFlag: line.varianceFlag,
    soldAt: line.soldAt,
    ratePct: line.ratePct,
    consignorShare: line.consignorShare,
    organizerShare: line.organizerShare,
    activeItemKey: line.itemId, // the double-pay guard: @unique while live
  };
}

interface EventInput {
  payoutId: string;
  batchId?: string | null;
  consignorId: string;
  workspaceId: string;
  type:
    | 'BATCH_CREATED'
    | 'REFRESHED'
    | 'APPROVED'
    | 'STATEMENT_SENT'
    | 'MARKED_PAID'
    | 'UNMARKED_PAID'
    | 'HELD'
    | 'RELEASED'
    | 'VOIDED'
    | 'CANCELLED';
  actorUserId?: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  method?: string | null;
  amount?: unknown;
  reference?: string | null;
  note?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** Append-only audit write. Events are only ever inserted, never updated or deleted. */
export async function writeEvent(db: LedgerDb, e: EventInput): Promise<void> {
  await db.consignorPayoutEvent.create({
    data: {
      payoutId: e.payoutId,
      batchId: e.batchId ?? null,
      consignorId: e.consignorId,
      workspaceId: e.workspaceId,
      type: e.type,
      actorUserId: e.actorUserId ?? null,
      fromStatus: e.fromStatus ?? null,
      toStatus: e.toStatus ?? null,
      method: e.method ?? null,
      amount: e.amount === undefined || e.amount === null ? null : D(e.amount),
      reference: e.reference ?? null,
      note: e.note ?? null,
      ...(e.metadata ? { metadata: e.metadata } : {}),
    },
  });
}

/**
 * Take a row lock on the batch (and prove it is in an allowed state) by issuing a no-op
 * conditional update. Serializes concurrent cancel / refresh / approve / mark-paid on one batch.
 */
async function lockBatch(tx: LedgerDb, batchId: string, workspaceId: string, allowedStatuses: string[]): Promise<boolean> {
  const r = await tx.consignorSettlementBatch.updateMany({
    where: { id: batchId, workspaceId, status: { in: allowedStatuses } },
    data: { workspaceId },
  });
  return r.count > 0;
}

/** Recompute a batch's status from its payouts after a payout changes state. */
export async function recomputeBatchStatus(tx: LedgerDb, batchId: string | null | undefined): Promise<void> {
  if (!batchId) return;
  const b = await tx.consignorSettlementBatch.findUnique({ where: { id: batchId }, select: { id: true, status: true } });
  if (!b || !['APPROVED', 'PARTIALLY_PAID', 'PAID', 'COMPLETED', 'PARTIAL', 'PROCESSING'].includes(b.status)) return;
  const payouts: any[] = await tx.consignorPayout.findMany({ where: { settlementBatchId: batchId }, select: { status: true } });
  const active = payouts.filter((p) => !PAYOUT_DEAD_STATUSES.includes(p.status));
  const paid = active.filter((p) => PAYOUT_PAID_STATUSES.includes(p.status));
  let next: string;
  if (active.length === 0) next = ['APPROVED', 'PARTIALLY_PAID', 'PAID'].includes(b.status) ? 'CANCELLED' : b.status;
  else if (paid.length === active.length) next = 'PAID';
  else if (paid.length > 0) next = 'PARTIALLY_PAID';
  else next = 'APPROVED';
  if (next === b.status) return;
  await tx.consignorSettlementBatch.update({
    where: { id: batchId },
    data: next === 'CANCELLED' ? { status: next, cancelledAt: new Date(), cancelledReason: 'All payouts were voided' } : { status: next },
  });
}

// ── Batch reads ────────────────────────────────────────────────────────────────────────────

const PAYOUT_INCLUDE = {
  consignor: { select: { name: true, email: true, stripeOnboarded: true, squareOnboarded: true, preferredPayoutMethod: true } },
  items: { orderBy: [{ soldAt: 'asc' }, { titleSnapshot: 'asc' }] },
};

export async function loadBatchDetail(db: LedgerDb, workspaceId: string, batchId: string) {
  const batch = await db.consignorSettlementBatch.findFirst({
    where: { id: batchId, workspaceId },
    include: {
      sale: { select: { id: true, title: true } },
      payouts: { include: PAYOUT_INCLUDE, orderBy: { createdAt: 'asc' } },
    },
  });
  if (!batch) throw notFound('Settlement batch');
  return batch;
}

export async function getPriorRuns(db: LedgerDb, opts: { workspaceId: string; saleId?: string | null; consignorId?: string }) {
  if (opts.consignorId) {
    const payouts: any[] = await db.consignorPayout.findMany({
      where: { consignorId: opts.consignorId, consignor: { workspaceId: opts.workspaceId } },
      include: { settlementBatch: { select: { id: true, runNumber: true, status: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return payouts.map((p) => ({
      batchId: p.settlementBatchId ?? null,
      payoutId: p.id,
      runNumber: p.settlementBatch?.runNumber ?? null,
      status: normalizePayoutStatus(p.status).status,
      createdAt: iso(p.createdAt),
      approvedAt: null,
      totalConsignorPayouts: money(p.netPayout),
      payoutCount: 1,
      paidAt: iso(p.paidAt),
      method: p.method ?? null,
    }));
  }
  const batches: any[] = await db.consignorSettlementBatch.findMany({
    where: { workspaceId: opts.workspaceId, ...(opts.saleId !== undefined ? { saleId: opts.saleId } : {}) },
    include: { payouts: { select: { status: true } } },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  return batches.map((b) => ({
    batchId: b.id,
    payoutId: null,
    runNumber: b.runNumber ?? 1,
    status: normalizeBatchStatus(b.status, (b.payouts || []).map((p: any) => p.status)).status,
    createdAt: iso(b.createdAt),
    approvedAt: iso(b.approvedAt),
    totalConsignorPayouts: money(b.totalConsignorPayouts),
    payoutCount: (b.payouts || []).filter((p: any) => !PAYOUT_DEAD_STATUSES.includes(p.status)).length,
    paidAt: null,
    method: null,
  }));
}

// ── Create run ─────────────────────────────────────────────────────────────────────────────

export interface CreateRunParams {
  workspaceId: string;
  actorUserId: string | null;
  saleId?: string | null;
  consignorIds?: string[];
  asOf?: Date | null;
  acknowledgeLegacyOverlap?: boolean;
}

/** Find the batch that currently holds any of these items, for the 409 body after a P2002. */
async function findClashingBatch(db: LedgerDb, itemIds: string[]) {
  if (itemIds.length === 0) return { batchId: null, payoutId: null };
  const clash = await db.consignorPayoutItem.findFirst({
    where: { activeItemKey: { in: itemIds } },
    select: { payoutId: true, payout: { select: { settlementBatchId: true } } },
  });
  return { batchId: clash?.payout?.settlementBatchId ?? null, payoutId: clash?.payoutId ?? null };
}

function alreadySettledError(clash: { batchId: string | null; payoutId: string | null }) {
  return new LedgerError(409, 'ALREADY_SETTLED', 'Some of these items are already part of another settlement.', {
    batchId: clash.batchId,
    payoutId: clash.payoutId,
  });
}

/**
 * Create a DRAFT settlement run in ONE transaction: batch, one payout per consignor, one line
 * per item, one BATCH_CREATED event per payout. No money moves and nothing is emailed.
 * Returns the loaded batch plus the items that were excluded from the snapshot.
 */
export async function createSettlementRun(db: LedgerDb, p: CreateRunParams) {
  const unsettled = await loadUnsettled(db, {
    workspaceId: p.workspaceId,
    saleId: p.saleId === null ? undefined : p.saleId,
    consignorIds: p.consignorIds,
    asOf: p.asOf ?? null,
    acknowledgeLegacyOverlap: p.acknowledgeLegacyOverlap,
  });
  if (unsettled.consignors.length === 0) {
    throw new LedgerError(400, 'NOTHING_TO_SETTLE', 'There are no unsettled sold items to settle.', {
      excluded: unsettled.excluded.map(serializeExcluded),
    });
  }
  const candidateItemIds = unsettled.consignors.flatMap((c) => c.lines.map((l) => l.itemId));
  const totalGross = unsettled.consignors.reduce((s, c) => s.plus(c.gross), new Decimal(0));
  const totalNet = unsettled.consignors.reduce((s, c) => s.plus(c.net), new Decimal(0));

  let batchId: string;
  try {
    batchId = await db.$transaction(
      async (tx: LedgerDb) => {
        const runNumber =
          (await tx.consignorSettlementBatch.count({ where: { workspaceId: p.workspaceId, saleId: p.saleId ?? null } })) + 1;
        const now = new Date();
        const batch = await tx.consignorSettlementBatch.create({
          data: {
            saleId: p.saleId ?? null,
            workspaceId: p.workspaceId,
            status: 'DRAFT',
            payoutMode: 'ORGANIZER_SETTLES',
            runNumber,
            snapshotAt: now,
            asOf: p.asOf ?? null,
            scopeConsignorIds: p.consignorIds ?? [],
            totalGross,
            totalConsignorPayouts: totalNet,
          },
        });
        for (const c of unsettled.consignors) {
          const payout = await tx.consignorPayout.create({
            data: {
              consignorId: c.consignor.id,
              saleId: p.saleId ?? null,
              totalSales: c.gross,
              commissionAmount: c.net,
              netPayout: c.net,
              status: 'PENDING',
              processor: 'MANUAL',
              settlementBatchId: batch.id,
              ...(c.tierBreakdown ? { tierBreakdown: c.tierBreakdown } : {}),
            },
          });
          await tx.consignorPayoutItem.createMany({
            data: c.lines.map((l) => lineToRow(l, { payoutId: payout.id, consignorId: c.consignor.id, workspaceId: p.workspaceId })),
          });
          await writeEvent(tx, {
            payoutId: payout.id,
            batchId: batch.id,
            consignorId: c.consignor.id,
            workspaceId: p.workspaceId,
            type: 'BATCH_CREATED',
            actorUserId: p.actorUserId,
            toStatus: 'PENDING',
            amount: c.net,
            metadata: { runNumber, itemCount: c.lines.length },
          });
        }
        return batch.id as string;
      },
      { timeout: 20000, maxWait: 5000 }
    );
  } catch (err) {
    if (isUniqueViolation(err)) throw alreadySettledError(await findClashingBatch(db, candidateItemIds));
    throw err;
  }

  const batch = await loadBatchDetail(db, p.workspaceId, batchId);
  return { batch, excluded: unsettled.excluded };
}

// ── Refresh (DRAFT only) ───────────────────────────────────────────────────────────────────

export interface RefreshDiff {
  added: any[];
  removed: any[];
  changed: any[];
  excluded: any[];
  unchanged: number;
}

/**
 * Re-snapshot a DRAFT run against the current ledger and return what changed. Live lines are
 * re-evaluated (released for the check, kept if still payable); items sold since are added;
 * items refunded or no longer sold are removed. Blocked once the run is approved.
 */
export async function refreshDraftRun(db: LedgerDb, p: { workspaceId: string; batchId: string; actorUserId: string | null }) {
  const batch = await db.consignorSettlementBatch.findFirst({
    where: { id: p.batchId, workspaceId: p.workspaceId },
    include: { payouts: { include: { items: true } } },
  });
  if (!batch) throw notFound('Settlement batch');
  if (batch.status !== 'DRAFT') {
    throw new LedgerError(409, 'NOT_DRAFT', 'Only a draft run can be refreshed. Cancel this run and create a new one instead.');
  }

  const livePayouts: any[] = batch.payouts.filter((x: any) => x.status === 'PENDING' || x.status === 'ON_HOLD');
  const currentItems: any[] = livePayouts.flatMap((x) => x.items.filter((i: any) => i.activeItemKey != null));
  const scope: string[] = Array.isArray(batch.scopeConsignorIds) ? batch.scopeConsignorIds : [];

  const unsettled = await loadUnsettled(db, {
    workspaceId: p.workspaceId,
    saleId: batch.saleId ?? undefined,
    consignorIds: scope.length ? scope : undefined,
    asOf: batch.asOf ? new Date(batch.asOf) : null,
    releasePayoutIds: livePayouts.map((x) => x.id),
    keepItemIds: currentItems.map((i) => i.itemId).filter(Boolean),
  });

  const key = (consignorId: string, itemId: string) => `${consignorId}:${itemId}`;
  const currentByKey = new Map<string, any>(currentItems.map((i) => [key(i.consignorId, i.itemId), i]));
  const nextByKey = new Map<string, { consignor: UnsettledConsignor; line: LedgerLine }>();
  for (const c of unsettled.consignors) for (const l of c.lines) nextByKey.set(key(c.consignor.id, l.itemId), { consignor: c, line: l });

  const excludedById = new Map(unsettled.excluded.map((e) => [e.itemId, e]));
  const diff: RefreshDiff = { added: [], removed: [], changed: [], excluded: unsettled.excluded.map(serializeExcluded), unchanged: 0 };
  const removedRowIds: string[] = [];
  const changedRows: { id: string; line: LedgerLine }[] = [];
  const addedByConsignor = new Map<string, LedgerLine[]>();

  for (const [k, cur] of currentByKey) {
    const next = nextByKey.get(k);
    if (!next) {
      removedRowIds.push(cur.id);
      diff.removed.push({
        consignorId: cur.consignorId,
        itemId: cur.itemId,
        title: cur.titleSnapshot,
        listPrice: money(cur.listPrice),
        consignorShare: money(cur.consignorShare),
        reason: excludedById.get(cur.itemId)?.reason ?? 'NO_LONGER_SOLD',
      });
      continue;
    }
    const same =
      D(cur.listPrice).equals(next.line.listPrice) &&
      D(cur.consignorShare).equals(next.line.consignorShare) &&
      D(cur.ratePct).equals(next.line.ratePct);
    if (same) {
      diff.unchanged += 1;
    } else {
      changedRows.push({ id: cur.id, line: next.line });
      diff.changed.push({
        consignorId: cur.consignorId,
        itemId: cur.itemId,
        title: next.line.title,
        before: { listPrice: money(cur.listPrice), ratePct: money(cur.ratePct), consignorShare: money(cur.consignorShare) },
        after: { listPrice: money(next.line.listPrice), ratePct: money(next.line.ratePct), consignorShare: money(next.line.consignorShare) },
      });
    }
  }
  for (const [k, next] of nextByKey) {
    if (currentByKey.has(k)) continue;
    const list = addedByConsignor.get(next.consignor.consignor.id) ?? [];
    list.push(next.line);
    addedByConsignor.set(next.consignor.consignor.id, list);
    diff.added.push({
      consignorId: next.consignor.consignor.id,
      consignorName: next.consignor.consignor.name,
      itemId: next.line.itemId,
      title: next.line.title,
      listPrice: money(next.line.listPrice),
      consignorShare: money(next.line.consignorShare),
    });
  }

  try {
    await db.$transaction(
      async (tx: LedgerDb) => {
        // Lock the batch and prove it is still a draft (an approve racing this refresh wins or loses cleanly).
        if (!(await lockBatch(tx, batch.id, p.workspaceId, ['DRAFT']))) {
          throw new LedgerError(409, 'NOT_DRAFT', 'This run is no longer a draft, so it cannot be refreshed.');
        }
        const now = new Date();
        const livePayoutByConsignor = new Map<string, any>(livePayouts.map((x) => [x.consignorId, x]));

        if (removedRowIds.length) await tx.consignorPayoutItem.deleteMany({ where: { id: { in: removedRowIds } } });
        for (const ch of changedRows) {
          await tx.consignorPayoutItem.update({
            where: { id: ch.id },
            data: {
              titleSnapshot: ch.line.title.slice(0, 300),
              listPrice: ch.line.listPrice,
              priceBeforeMarkdown: ch.line.priceBeforeMarkdown,
              collectedAmount: ch.line.collectedAmount,
              purchaseId: ch.line.purchaseId,
              varianceFlag: ch.line.varianceFlag,
              soldAt: ch.line.soldAt,
              ratePct: ch.line.ratePct,
              consignorShare: ch.line.consignorShare,
              organizerShare: ch.line.organizerShare,
            },
          });
        }

        const seenConsignors = new Set<string>();
        for (const c of unsettled.consignors) {
          const cid = c.consignor.id;
          seenConsignors.add(cid);
          let payout = livePayoutByConsignor.get(cid);
          if (payout) {
            await tx.consignorPayout.update({
              where: { id: payout.id },
              data: {
                totalSales: c.gross,
                commissionAmount: c.net,
                netPayout: c.net,
                tierBreakdown: c.tierBreakdown ?? Prisma.DbNull,
              },
            });
          } else {
            payout = await tx.consignorPayout.create({
              data: {
                consignorId: cid,
                saleId: batch.saleId ?? null,
                status: 'PENDING',
                processor: 'MANUAL',
                settlementBatchId: batch.id,
                totalSales: c.gross,
                commissionAmount: c.net,
                netPayout: c.net,
                ...(c.tierBreakdown ? { tierBreakdown: c.tierBreakdown } : {}),
              },
            });
          }
          const added = addedByConsignor.get(cid) ?? [];
          if (added.length) {
            await tx.consignorPayoutItem.createMany({
              data: added.map((l) => lineToRow(l, { payoutId: payout.id, consignorId: cid, workspaceId: p.workspaceId })),
            });
          }
          const addedN = added.length;
          const removedN = diff.removed.filter((r) => r.consignorId === cid).length;
          const changedN = diff.changed.filter((r) => r.consignorId === cid).length;
          if (addedN || removedN || changedN) {
            await writeEvent(tx, {
              payoutId: payout.id,
              batchId: batch.id,
              consignorId: cid,
              workspaceId: p.workspaceId,
              type: 'REFRESHED',
              actorUserId: p.actorUserId,
              fromStatus: payout.status ?? 'PENDING',
              toStatus: payout.status ?? 'PENDING',
              amount: c.net,
              metadata: { added: addedN, removed: removedN, changed: changedN },
            });
          }
        }

        // Payouts whose consignor no longer has anything owed: void them (kept for the audit trail).
        for (const payout of livePayouts) {
          if (seenConsignors.has(payout.consignorId)) continue;
          await tx.consignorPayout.update({
            where: { id: payout.id },
            data: {
              status: 'VOID',
              voidedAt: now,
              voidReason: 'Refresh: no remaining items to settle',
              voidedByUserId: p.actorUserId,
              totalSales: 0,
              commissionAmount: 0,
              netPayout: 0,
            },
          });
          await writeEvent(tx, {
            payoutId: payout.id,
            batchId: batch.id,
            consignorId: payout.consignorId,
            workspaceId: p.workspaceId,
            type: 'VOIDED',
            actorUserId: p.actorUserId,
            fromStatus: payout.status,
            toStatus: 'VOID',
            note: 'Refresh: no remaining items to settle',
          });
        }

        const totalGross = unsettled.consignors.reduce((s, c) => s.plus(c.gross), new Decimal(0));
        const totalNet = unsettled.consignors.reduce((s, c) => s.plus(c.net), new Decimal(0));
        await tx.consignorSettlementBatch.update({
          where: { id: batch.id },
          data: { totalGross, totalConsignorPayouts: totalNet, snapshotAt: now },
        });
      },
      { timeout: 20000, maxWait: 5000 }
    );
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw alreadySettledError(await findClashingBatch(db, diff.added.map((a) => a.itemId)));
    }
    throw err;
  }

  const refreshed = await loadBatchDetail(db, p.workspaceId, p.batchId);
  return { batch: refreshed, diff };
}

// ── Approve / cancel ───────────────────────────────────────────────────────────────────────

/**
 * DRAFT -> APPROVED. Never calls any payment rail (and never payConsignorViaACH). Idempotent:
 * approving an already-approved run is a 200 no-op.
 */
export async function approveRun(db: LedgerDb, p: { workspaceId: string; batchId: string; actorUserId: string | null }) {
  const existing = await db.consignorSettlementBatch.findFirst({ where: { id: p.batchId, workspaceId: p.workspaceId }, select: { id: true, status: true } });
  if (!existing) throw notFound('Settlement batch');
  if (['APPROVED', 'PARTIALLY_PAID', 'PAID'].includes(existing.status)) return { noop: true };
  if (existing.status !== 'DRAFT') {
    throw new LedgerError(409, 'INVALID_STATE', `A run in status ${existing.status} cannot be approved.`);
  }

  const outcome = await db.$transaction(
    async (tx: LedgerDb) => {
      const now = new Date();
      const r = await tx.consignorSettlementBatch.updateMany({
        where: { id: p.batchId, workspaceId: p.workspaceId, status: 'DRAFT' },
        data: { status: 'APPROVED', approvedAt: now, approvedByUserId: p.actorUserId },
      });
      if (r.count === 0) {
        const again = await tx.consignorSettlementBatch.findFirst({ where: { id: p.batchId, workspaceId: p.workspaceId }, select: { status: true } });
        if (again && ['APPROVED', 'PARTIALLY_PAID', 'PAID'].includes(again.status)) return { noop: true };
        throw new LedgerError(409, 'INVALID_STATE', `A run in status ${again?.status ?? 'unknown'} cannot be approved.`);
      }
      const payouts: any[] = await tx.consignorPayout.findMany({
        where: { settlementBatchId: p.batchId, status: { in: ['PENDING', 'ON_HOLD'] } },
        select: { id: true, consignorId: true, status: true, netPayout: true },
      });
      if (payouts.length === 0) {
        throw new LedgerError(409, 'EMPTY_BATCH', 'This run has no payouts to approve.');
      }
      for (const payout of payouts) {
        await writeEvent(tx, {
          payoutId: payout.id,
          batchId: p.batchId,
          consignorId: payout.consignorId,
          workspaceId: p.workspaceId,
          type: 'APPROVED',
          actorUserId: p.actorUserId,
          fromStatus: payout.status,
          toStatus: payout.status,
          amount: payout.netPayout,
        });
      }
      return { noop: false };
    },
    { timeout: 20000, maxWait: 5000 }
  );
  return outcome as { noop: boolean };
}

/**
 * Cancel a run that has no paid payouts: batch -> CANCELLED, unpaid payouts -> VOID, and every
 * line's activeItemKey is cleared so the items become unsettled again. Idempotent.
 */
export async function cancelRun(db: LedgerDb, p: { workspaceId: string; batchId: string; actorUserId: string | null; reason: string }) {
  const existing = await db.consignorSettlementBatch.findFirst({ where: { id: p.batchId, workspaceId: p.workspaceId }, select: { id: true, status: true } });
  if (!existing) throw notFound('Settlement batch');
  if (existing.status === 'CANCELLED') return { noop: true };

  return db.$transaction(
    async (tx: LedgerDb) => {
      const now = new Date();
      const locked = await tx.consignorSettlementBatch.updateMany({
        where: { id: p.batchId, workspaceId: p.workspaceId, status: { in: ['DRAFT', 'APPROVED'] } },
        data: { status: 'CANCELLED', cancelledAt: now, cancelledReason: p.reason, cancelledByUserId: p.actorUserId },
      });
      if (locked.count === 0) {
        const again = await tx.consignorSettlementBatch.findFirst({ where: { id: p.batchId, workspaceId: p.workspaceId }, select: { status: true } });
        if (again?.status === 'CANCELLED') return { noop: true };
        throw new LedgerError(409, 'HAS_PAID_PAYOUTS', 'This run has payments recorded and cannot be cancelled. Undo the recorded payments first.');
      }
      const paidCount = await tx.consignorPayout.count({
        where: { settlementBatchId: p.batchId, status: { in: PAYOUT_PAID_STATUSES } },
      });
      if (paidCount > 0) {
        // Throwing rolls the whole transaction back, including the CANCELLED update above.
        throw new LedgerError(409, 'HAS_PAID_PAYOUTS', 'This run has payments recorded and cannot be cancelled. Undo the recorded payments first.', { paidCount });
      }
      const open: any[] = await tx.consignorPayout.findMany({
        where: { settlementBatchId: p.batchId, status: { in: PAYOUT_UNPAID_STATUSES } },
        select: { id: true, consignorId: true, status: true },
      });
      const openIds = open.map((o) => o.id);
      if (openIds.length) {
        await tx.consignorPayout.updateMany({
          where: { id: { in: openIds } },
          data: { status: 'VOID', voidedAt: now, voidReason: p.reason, voidedByUserId: p.actorUserId },
        });
        await tx.consignorPayoutItem.updateMany({ where: { payoutId: { in: openIds } }, data: { activeItemKey: null } });
        for (const o of open) {
          await writeEvent(tx, {
            payoutId: o.id,
            batchId: p.batchId,
            consignorId: o.consignorId,
            workspaceId: p.workspaceId,
            type: 'CANCELLED',
            actorUserId: p.actorUserId,
            fromStatus: o.status,
            toStatus: 'VOID',
            note: p.reason,
          });
        }
      }
      return { noop: false };
    },
    { timeout: 20000, maxWait: 5000 }
  ) as Promise<{ noop: boolean }>;
}

// ── Payout actions ─────────────────────────────────────────────────────────────────────────

export async function loadPayoutForWorkspace(db: LedgerDb, workspaceId: string, payoutId: string) {
  const payout = await db.consignorPayout.findFirst({
    where: { id: payoutId, consignor: { workspaceId } },
    include: {
      consignor: {
        select: { id: true, name: true, email: true, workspaceId: true, stripeOnboarded: true, squareOnboarded: true, preferredPayoutMethod: true },
      },
      settlementBatch: { select: { id: true, status: true } },
      items: { orderBy: [{ soldAt: 'asc' }, { titleSnapshot: 'asc' }] },
    },
  });
  if (!payout) throw notFound('Payout');
  return payout;
}

function sameMarkPaidBody(existing: any, input: MarkPaidInput): boolean {
  return (
    existing.method === input.method &&
    Boolean(existing.paidAt) &&
    new Date(existing.paidAt).getTime() === input.paidAt.getTime() &&
    (existing.paidReference ?? null) === (input.reference ?? null)
  );
}

/**
 * Record that the organizer paid this payout (in full). Conditional updateMany on
 * PENDING/ON_HOLD so two concurrent calls cannot both record it. A retry with the same body
 * returns { noop: true } (HTTP 200); a retry with a different body is a 409.
 */
export async function markPayoutPaid(
  db: LedgerDb,
  p: { workspaceId: string; payoutId: string; actorUserId: string | null; input: MarkPaidInput; amount?: unknown }
) {
  const payout = await loadPayoutForWorkspace(db, p.workspaceId, p.payoutId);
  const net = D(payout.netPayout);
  if (p.amount !== undefined && p.amount !== null && p.amount !== '') {
    const a = Number(p.amount);
    if (!Number.isFinite(a) || D(a).minus(net).abs().greaterThan(0.004)) {
      throw new LedgerError(400, 'AMOUNT_MISMATCH', `Partial payments are not supported. The amount must equal the payout total of $${net.toFixed(2)}.`);
    }
  }

  if (payout.status === 'PAID') {
    if (sameMarkPaidBody(payout, p.input)) return { noop: true, payout };
    throw new LedgerError(409, 'ALREADY_PAID', 'This payout is already recorded as paid with different details. Undo it first to change it.');
  }
  if (!PAYOUT_UNPAID_STATUSES.includes(payout.status)) {
    throw new LedgerError(409, 'INVALID_STATE', `A payout in status ${payout.status} cannot be marked paid.`);
  }
  if (payout.settlementBatch && payout.settlementBatch.status === 'DRAFT') {
    throw new LedgerError(409, 'BATCH_NOT_APPROVED', 'Approve the run before recording payments.');
  }

  const now = new Date();
  const outcome = await db.$transaction(
    async (tx: LedgerDb) => {
      if (payout.settlementBatchId) {
        // PAID is allowed here on purpose: when two identical requests race, the first one can flip the
        // batch to PAID before the second takes the lock. The second must then fall through to the
        // conditional payout update below and come back as an idempotent noop, not a spurious 409.
        const ok = await lockBatch(tx, payout.settlementBatchId, p.workspaceId, [...BATCH_OPEN_STATUSES, 'PAID']);
        if (!ok) throw new LedgerError(409, 'BATCH_NOT_OPEN', 'This run is not open for payments (it may have been cancelled).');
      }
      const r = await tx.consignorPayout.updateMany({
        where: { id: payout.id, status: { in: PAYOUT_UNPAID_STATUSES } },
        data: {
          status: 'PAID',
          method: p.input.method,
          paidAt: p.input.paidAt,
          paidAmount: net,
          paidReference: p.input.reference,
          paidRecordedByUserId: p.actorUserId,
          paidRecordedAt: now,
          holdReason: null,
          processor: 'MANUAL',
          ...(p.input.note ? { notes: payout.notes ? `${payout.notes} | ${p.input.note}` : p.input.note } : {}),
        },
      });
      if (r.count === 0) {
        const again = await tx.consignorPayout.findUnique({ where: { id: payout.id } });
        if (again && again.status === 'PAID' && sameMarkPaidBody(again, p.input)) return { noop: true };
        throw new LedgerError(409, 'CONFLICT', 'This payout was changed by someone else. Reload and try again.');
      }
      await writeEvent(tx, {
        payoutId: payout.id,
        batchId: payout.settlementBatchId,
        consignorId: payout.consignorId,
        workspaceId: p.workspaceId,
        type: 'MARKED_PAID',
        actorUserId: p.actorUserId,
        fromStatus: payout.status,
        toStatus: 'PAID',
        method: p.input.method,
        amount: net,
        reference: p.input.reference,
        note: p.input.note,
        metadata: { paidAt: p.input.paidAt.toISOString() },
      });
      await recomputeBatchStatus(tx, payout.settlementBatchId);
      return { noop: false };
    },
    { timeout: 20000, maxWait: 5000 }
  );
  const fresh = await loadPayoutForWorkspace(db, p.workspaceId, p.payoutId);
  return { noop: Boolean((outcome as any).noop), payout: fresh };
}

/** PAID -> PENDING with a required reason. The original payment details are kept in the audit event. */
export async function undoPayoutPaid(db: LedgerDb, p: { workspaceId: string; payoutId: string; actorUserId: string | null; reason: string }) {
  const payout = await loadPayoutForWorkspace(db, p.workspaceId, p.payoutId);
  if (payout.status === 'PENDING') return { noop: true, payout };
  if (payout.status !== 'PAID') {
    throw new LedgerError(409, 'INVALID_STATE', `A payout in status ${payout.status} cannot be un-marked.`);
  }
  await db.$transaction(
    async (tx: LedgerDb) => {
      if (payout.settlementBatchId) {
        const ok = await lockBatch(tx, payout.settlementBatchId, p.workspaceId, ['APPROVED', 'PARTIALLY_PAID', 'PAID']);
        if (!ok) throw new LedgerError(409, 'BATCH_NOT_OPEN', 'This run is not open (it may have been cancelled).');
      }
      const r = await tx.consignorPayout.updateMany({
        where: { id: payout.id, status: 'PAID' },
        data: {
          status: 'PENDING',
          method: null,
          paidAt: null,
          paidAmount: null,
          paidReference: null,
          paidRecordedAt: null,
          paidRecordedByUserId: null,
        },
      });
      if (r.count === 0) throw new LedgerError(409, 'CONFLICT', 'This payout was changed by someone else. Reload and try again.');
      await writeEvent(tx, {
        payoutId: payout.id,
        batchId: payout.settlementBatchId,
        consignorId: payout.consignorId,
        workspaceId: p.workspaceId,
        type: 'UNMARKED_PAID',
        actorUserId: p.actorUserId,
        fromStatus: 'PAID',
        toStatus: 'PENDING',
        method: payout.method,
        amount: payout.paidAmount ?? payout.netPayout,
        reference: payout.paidReference,
        note: p.reason,
        metadata: { previousPaidAt: payout.paidAt ? new Date(payout.paidAt).toISOString() : null },
      });
      await recomputeBatchStatus(tx, payout.settlementBatchId);
    },
    { timeout: 20000, maxWait: 5000 }
  );
  return { noop: false, payout: await loadPayoutForWorkspace(db, p.workspaceId, p.payoutId) };
}

/** PENDING -> ON_HOLD. Idempotent. */
export async function holdPayout(db: LedgerDb, p: { workspaceId: string; payoutId: string; actorUserId: string | null; reason: string }) {
  const payout = await loadPayoutForWorkspace(db, p.workspaceId, p.payoutId);
  if (payout.status === 'ON_HOLD') return { noop: true, payout };
  if (!['PENDING', 'MANUAL_CASH_CHECK'].includes(payout.status)) {
    throw new LedgerError(409, 'INVALID_STATE', `A payout in status ${payout.status} cannot be put on hold.`);
  }
  await db.$transaction(async (tx: LedgerDb) => {
    const r = await tx.consignorPayout.updateMany({
      where: { id: payout.id, status: { in: ['PENDING', 'MANUAL_CASH_CHECK'] } },
      data: { status: 'ON_HOLD', holdReason: p.reason },
    });
    if (r.count === 0) throw new LedgerError(409, 'CONFLICT', 'This payout was changed by someone else. Reload and try again.');
    await writeEvent(tx, {
      payoutId: payout.id,
      batchId: payout.settlementBatchId,
      consignorId: payout.consignorId,
      workspaceId: p.workspaceId,
      type: 'HELD',
      actorUserId: p.actorUserId,
      fromStatus: payout.status,
      toStatus: 'ON_HOLD',
      note: p.reason,
    });
  });
  return { noop: false, payout: await loadPayoutForWorkspace(db, p.workspaceId, p.payoutId) };
}

/** ON_HOLD -> PENDING. Idempotent. */
export async function releasePayout(db: LedgerDb, p: { workspaceId: string; payoutId: string; actorUserId: string | null }) {
  const payout = await loadPayoutForWorkspace(db, p.workspaceId, p.payoutId);
  if (payout.status === 'PENDING') return { noop: true, payout };
  if (payout.status !== 'ON_HOLD') {
    throw new LedgerError(409, 'INVALID_STATE', `A payout in status ${payout.status} cannot be released.`);
  }
  await db.$transaction(async (tx: LedgerDb) => {
    const r = await tx.consignorPayout.updateMany({
      where: { id: payout.id, status: 'ON_HOLD' },
      data: { status: 'PENDING', holdReason: null },
    });
    if (r.count === 0) throw new LedgerError(409, 'CONFLICT', 'This payout was changed by someone else. Reload and try again.');
    await writeEvent(tx, {
      payoutId: payout.id,
      batchId: payout.settlementBatchId,
      consignorId: payout.consignorId,
      workspaceId: p.workspaceId,
      type: 'RELEASED',
      actorUserId: p.actorUserId,
      fromStatus: 'ON_HOLD',
      toStatus: 'PENDING',
    });
  });
  return { noop: false, payout: await loadPayoutForWorkspace(db, p.workspaceId, p.payoutId) };
}

/**
 * Void one unpaid payout: its lines' activeItemKey is cleared so the items become unsettled
 * again. Needed for standalone payouts (no batch to cancel) and to drop one consignor from a run.
 */
export async function voidPayout(db: LedgerDb, p: { workspaceId: string; payoutId: string; actorUserId: string | null; reason: string }) {
  const payout = await loadPayoutForWorkspace(db, p.workspaceId, p.payoutId);
  if (payout.status === 'VOID') return { noop: true, payout };
  if (PAYOUT_PAID_STATUSES.includes(payout.status)) {
    throw new LedgerError(409, 'PAYOUT_PAID', 'This payout is recorded as paid. Undo the payment before voiding it.');
  }
  if (!PAYOUT_UNPAID_STATUSES.includes(payout.status)) {
    throw new LedgerError(409, 'INVALID_STATE', `A payout in status ${payout.status} cannot be voided.`);
  }
  await db.$transaction(async (tx: LedgerDb) => {
    const r = await tx.consignorPayout.updateMany({
      where: { id: payout.id, status: { in: PAYOUT_UNPAID_STATUSES } },
      data: { status: 'VOID', voidedAt: new Date(), voidReason: p.reason, voidedByUserId: p.actorUserId },
    });
    if (r.count === 0) throw new LedgerError(409, 'CONFLICT', 'This payout was changed by someone else. Reload and try again.');
    await tx.consignorPayoutItem.updateMany({ where: { payoutId: payout.id }, data: { activeItemKey: null } });
    await writeEvent(tx, {
      payoutId: payout.id,
      batchId: payout.settlementBatchId,
      consignorId: payout.consignorId,
      workspaceId: p.workspaceId,
      type: 'VOIDED',
      actorUserId: p.actorUserId,
      fromStatus: payout.status,
      toStatus: 'VOID',
      note: p.reason,
    });
    await recomputeBatchStatus(tx, payout.settlementBatchId);
  });
  return { noop: false, payout: await loadPayoutForWorkspace(db, p.workspaceId, p.payoutId) };
}

// ── Direct payout (POST /api/consignors/:id/payout) ────────────────────────────────────────

/**
 * The existing "Process payout" modal path, now routed through the ledger: create a payout with
 * its lines and record it as paid in ONE transaction. Only unsettled items are included, so it
 * cannot double-pay; a second call with nothing owed is a 409. A standalone payout belongs to
 * no batch.
 */
export async function recordDirectPayout(
  db: LedgerDb,
  p: {
    workspaceId: string;
    actorUserId: string | null;
    consignorId: string;
    saleId?: string | null;
    input: MarkPaidInput;
    acknowledgeLegacyOverlap?: boolean;
  }
) {
  const unsettled = await loadUnsettled(db, {
    workspaceId: p.workspaceId,
    saleId: p.saleId ?? undefined,
    consignorIds: [p.consignorId],
    acknowledgeLegacyOverlap: p.acknowledgeLegacyOverlap,
  });
  const c = unsettled.consignors[0];
  if (!c) {
    throw new LedgerError(409, 'NOTHING_OWED', 'There are no unsettled sold items for this consignor. Nothing to pay.', {
      excluded: unsettled.excluded.map(serializeExcluded),
    });
  }
  const now = new Date();
  let payoutId: string;
  try {
    payoutId = await db.$transaction(
      async (tx: LedgerDb) => {
        const payout = await tx.consignorPayout.create({
          data: {
            consignorId: c.consignor.id,
            saleId: p.saleId ?? null,
            totalSales: c.gross,
            commissionAmount: c.net,
            netPayout: c.net,
            method: p.input.method,
            notes: p.input.note,
            status: 'PAID',
            processor: 'MANUAL',
            paidAt: p.input.paidAt,
            paidAmount: c.net,
            paidReference: p.input.reference,
            paidRecordedByUserId: p.actorUserId,
            paidRecordedAt: now,
            ...(c.tierBreakdown ? { tierBreakdown: c.tierBreakdown } : {}),
          },
        });
        await tx.consignorPayoutItem.createMany({
          data: c.lines.map((l) => lineToRow(l, { payoutId: payout.id, consignorId: c.consignor.id, workspaceId: p.workspaceId })),
        });
        await writeEvent(tx, {
          payoutId: payout.id,
          consignorId: c.consignor.id,
          workspaceId: p.workspaceId,
          type: 'MARKED_PAID',
          actorUserId: p.actorUserId,
          toStatus: 'PAID',
          method: p.input.method,
          amount: c.net,
          reference: p.input.reference,
          note: 'Recorded directly, no settlement run',
          metadata: { paidAt: p.input.paidAt.toISOString(), itemCount: c.lines.length },
        });
        return payout.id as string;
      },
      { timeout: 20000, maxWait: 5000 }
    );
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw alreadySettledError(await findClashingBatch(db, c.lines.map((l) => l.itemId)));
    }
    throw err;
  }
  const payout = await db.consignorPayout.findUnique({ where: { id: payoutId }, include: { items: true } });
  return { payout, lines: c.lines, excluded: unsettled.excluded };
}

// ── Statements ─────────────────────────────────────────────────────────────────────────────

export interface Statement {
  reference: string;
  payoutId: string;
  organizerName: string;
  consignor: { id: string; name: string; email: string | null };
  periodLabel: string;
  saleId: string | null;
  saleTitle: string | null;
  status: string;
  statusLabel: string;
  payoutStatus: string;
  batchStatus: string | null;
  method: string | null;
  methodLabel: string | null;
  paidAt: string | null;
  paidReference: string | null;
  legacy: boolean;
  lines: {
    title: string;
    soldAt: string | null;
    listPrice: string | null;
    priceBeforeMarkdown: string | null;
    markedDown: boolean;
    ratePct: string | null;
    consignorShare: string | null;
  }[];
  totals: { itemCount: number; gross: string | null; consignorShare: string | null };
  footer: string;
  generatedAt: string;
}

export function periodLabelFor(payout: any, lines: any[]): string {
  if (payout.sale?.title) return payout.sale.title;
  const dates = lines.map((l) => (l.soldAt ? new Date(l.soldAt) : null)).filter(Boolean) as Date[];
  if (dates.length) {
    const min = new Date(Math.min(...dates.map((d) => d.getTime())));
    const max = new Date(Math.max(...dates.map((d) => d.getTime())));
    return formatDate(min) === formatDate(max) ? `Items sold ${formatDate(min)}` : `Items sold ${formatDate(min)} to ${formatDate(max)}`;
  }
  return 'Consigned items';
}

export function statusLabelFor(payout: any, batchStatus: string | null): string {
  const norm = normalizePayoutStatus(payout.status).status;
  if (norm === 'PAID') {
    const parts = [`Paid ${formatDate(payout.paidAt)}`.trim()];
    if (payout.method) parts.push(`by ${METHOD_LABELS[payout.method] ?? payout.method}`);
    if (payout.paidReference) parts.push(`(reference ${payout.paidReference})`);
    return parts.join(' ');
  }
  if (norm === 'ON_HOLD') return 'On hold';
  if (norm === 'VOID') return 'Voided';
  if (norm === 'PENDING') return batchStatus === 'DRAFT' ? 'Draft, not yet approved' : 'Approved, payment pending';
  return 'Earlier record';
}

/** Build the statement for one payout. Used by the JSON route, the PDF route, the email and the portal. */
export async function buildStatement(db: LedgerDb, p: { workspaceId: string; payoutId: string }): Promise<Statement> {
  const payout = await db.consignorPayout.findFirst({
    where: { id: p.payoutId, consignor: { workspaceId: p.workspaceId } },
    include: {
      consignor: { select: { id: true, name: true, email: true } },
      sale: { select: { id: true, title: true } },
      settlementBatch: { select: { id: true, status: true } },
      items: { orderBy: [{ soldAt: 'asc' }, { titleSnapshot: 'asc' }] },
    },
  });
  if (!payout) throw notFound('Payout');
  const workspace = await db.organizerWorkspace.findUnique({ where: { id: p.workspaceId }, select: { name: true } });
  const norm = normalizePayoutStatus(payout.status);
  const batchStatus: string | null = payout.settlementBatch?.status ?? null;
  const items: any[] = payout.items || [];
  const gross = items.length ? items.reduce((s, i) => s.plus(D(i.listPrice)), new Decimal(0)) : D(payout.totalSales);
  const share = items.length ? items.reduce((s, i) => s.plus(D(i.consignorShare)), new Decimal(0)) : D(payout.netPayout);
  return {
    reference: payoutReference(payout.id),
    payoutId: payout.id,
    organizerName: workspace?.name || 'Your organizer',
    consignor: { id: payout.consignor.id, name: payout.consignor.name, email: payout.consignor.email ?? null },
    periodLabel: periodLabelFor(payout, items),
    saleId: payout.saleId ?? null,
    saleTitle: payout.sale?.title ?? null,
    status: norm.status,
    statusLabel: statusLabelFor(payout, batchStatus),
    payoutStatus: payout.status,
    batchStatus,
    method: payout.method ?? null,
    methodLabel: payout.method ? METHOD_LABELS[payout.method] ?? payout.method : null,
    paidAt: iso(payout.paidAt),
    paidReference: payout.paidReference ?? null,
    legacy: norm.legacy || items.length === 0,
    lines: items.map((i) => ({
      title: i.titleSnapshot,
      soldAt: iso(i.soldAt),
      listPrice: money(i.listPrice),
      priceBeforeMarkdown: money(i.priceBeforeMarkdown),
      markedDown: i.priceBeforeMarkdown != null && D(i.priceBeforeMarkdown).greaterThan(D(i.listPrice)),
      ratePct: money(i.ratePct),
      consignorShare: money(i.consignorShare),
    })),
    totals: { itemCount: items.length, gross: money(gross), consignorShare: money(share) },
    footer: STATEMENT_FOOTER,
    generatedAt: new Date().toISOString(),
  };
}

/** Append-only audit trail for one payout, newest first. Organizer-facing only. */
export async function listPayoutEvents(db: LedgerDb, workspaceId: string, payoutId: string) {
  await loadPayoutForWorkspace(db, workspaceId, payoutId);
  const events: any[] = await db.consignorPayoutEvent.findMany({
    where: { payoutId, workspaceId },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return events.map((e) => ({
    id: e.id,
    type: e.type,
    actorUserId: e.actorUserId ?? null,
    fromStatus: e.fromStatus ?? null,
    toStatus: e.toStatus ?? null,
    method: e.method ?? null,
    amount: money(e.amount),
    reference: e.reference ?? null,
    note: e.note ?? null,
    metadata: e.metadata ?? null,
    createdAt: iso(e.createdAt),
  }));
}

// ── Summaries ──────────────────────────────────────────────────────────────────────────────

/** GET /sales-summary: what is still owed, grouped by sale (null saleId = consignment inventory). */
export async function getSalesSummary(db: LedgerDb, workspaceId: string) {
  const unsettled = await loadUnsettled(db, { workspaceId });
  const bySale = new Map<string | null, { count: number; amount: Decimal; held: number }>();
  const bucket = (saleId: string | null) => {
    let b = bySale.get(saleId);
    if (!b) {
      b = { count: 0, amount: new Decimal(0), held: 0 };
      bySale.set(saleId, b);
    }
    return b;
  };
  for (const c of unsettled.consignors) {
    for (const l of c.lines) {
      const b = bucket(l.saleId);
      b.count += 1;
      b.amount = b.amount.plus(l.consignorShare);
    }
  }
  for (const e of unsettled.excluded) bucket(e.saleId).held += 1;

  const saleIds = Array.from(bySale.keys()).filter((k): k is string => k !== null);
  const sales: any[] = saleIds.length ? await db.sale.findMany({ where: { id: { in: saleIds } }, select: { id: true, title: true } }) : [];
  const titles = new Map(sales.map((s) => [s.id, s.title]));
  return Array.from(bySale.entries())
    .map(([saleId, b]) => ({
      saleId,
      saleTitle: saleId === null ? 'Consignment inventory' : titles.get(saleId) ?? null,
      unsettledCount: b.count,
      unsettledAmount: b.amount.toFixed(2),
      heldCount: b.held,
    }))
    .sort((a, b) => Number(b.unsettledAmount) - Number(a.unsettledAmount));
}

/** Owed figures per consignor from the ledger, for the Consignors list. */
export async function getOwedByConsignor(db: LedgerDb, workspaceId: string) {
  const unsettled = await loadUnsettled(db, { workspaceId });
  const map = new Map<string, { owedAmount: string; owedItemCount: number; heldItemCount: number }>();
  for (const c of unsettled.consignors) {
    map.set(c.consignor.id, { owedAmount: c.net.toFixed(2), owedItemCount: c.lines.length, heldItemCount: 0 });
  }
  for (const e of unsettled.excluded) {
    const cur = map.get(e.consignorId) ?? { owedAmount: '0.00', owedItemCount: 0, heldItemCount: 0 };
    cur.heldItemCount += 1;
    map.set(e.consignorId, cur);
  }
  return map;
}

export async function getAnnualSummary(db: LedgerDb, workspaceId: string, year: number) {
  const payouts: any[] = await db.consignorPayout.findMany({
    where: {
      consignor: { workspaceId },
      status: { in: PAYOUT_PAID_STATUSES },
      paidAt: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) },
    },
    select: {
      id: true,
      consignorId: true,
      netPayout: true,
      paidAmount: true,
      method: true,
      paidAt: true,
      consignor: { select: { name: true, email: true } },
    },
  });
  const byConsignor = new Map<string, { consignorId: string; name: string; email: string | null; paidTotal: Decimal; payoutCount: number; byMethod: Record<string, Decimal> }>();
  for (const p of payouts) {
    const amount = D(p.paidAmount ?? p.netPayout);
    const row =
      byConsignor.get(p.consignorId) ??
      { consignorId: p.consignorId, name: p.consignor?.name ?? '', email: p.consignor?.email ?? null, paidTotal: new Decimal(0), payoutCount: 0, byMethod: {} };
    row.paidTotal = row.paidTotal.plus(amount);
    row.payoutCount += 1;
    const m = p.method ?? 'UNKNOWN';
    row.byMethod[m] = (row.byMethod[m] ?? new Decimal(0)).plus(amount);
    byConsignor.set(p.consignorId, row);
  }
  const consignors = Array.from(byConsignor.values())
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((r) => ({
      consignorId: r.consignorId,
      name: r.name,
      email: r.email,
      paidTotal: r.paidTotal.toFixed(2),
      payoutCount: r.payoutCount,
      byMethod: Object.fromEntries(Object.entries(r.byMethod).map(([k, v]) => [k, v.toFixed(2)])),
    }));
  const total = Array.from(byConsignor.values()).reduce((s, r) => s.plus(r.paidTotal), new Decimal(0));
  return {
    year,
    consignors,
    totals: { paidTotal: total.toFixed(2), payoutCount: payouts.length, consignorCount: consignors.length },
    disclaimer:
      'Totals reflect payments recorded in FindA.Sale, grouped by the date paid. Confirm any tax reporting obligations with your accountant.',
  };
}

// ── CSV ────────────────────────────────────────────────────────────────────────────────────

/**
 * One CSV cell. Delegates to utils/csvSafe (the single writer used by every export) so formula-injection
 * neutralizing (= + - @, tab, CR, and a formula hidden behind leading whitespace) and RFC 4180 quoting
 * stay identical everywhere.
 */
export function csvCell(value: unknown): string {
  return safeCsvCell(value);
}

/**
 * A money amount that must stay NUMERIC in the sheet. A negative amount such as a refund adjustment
 * ("-5.00") would otherwise get the formula-guard apostrophe and become text, breaking SUM(). The value
 * comes from money() (Decimal.toFixed(2)), never from user text, so it is written as-is.
 */
class NumericCsvCell {
  constructor(public readonly text: string) {}
}
function numCell(v: unknown): NumericCsvCell | string {
  const m = money(v);
  return m === null || !/^-?\d+(\.\d+)?$/.test(m) ? '' : new NumericCsvCell(m);
}
const renderCsvCell = (c: unknown): string => (c instanceof NumericCsvCell ? c.text : csvCell(c));

export const CSV_HEADERS = [
  'Run',
  'Sale',
  'Consignor',
  'Consignor email',
  'Statement reference',
  'Payout status',
  'Item',
  'Sold date',
  'Original price',
  'Sale price',
  'Amount collected',
  'Rate %',
  'Consignor share',
  'Organizer share',
  'Payment method',
  'Date paid',
  'Payment reference',
];

export function buildBatchCsv(batch: any): string {
  const rows: Array<Array<string | NumericCsvCell>> = [CSV_HEADERS];
  const saleTitle = batch.sale?.title ?? 'All sales';
  for (const payout of batch.payouts || []) {
    const norm = normalizePayoutStatus(payout.status).status;
    const common = [
      `Run ${batch.runNumber ?? 1}`,
      saleTitle,
      payout.consignor?.name ?? '',
      payout.consignor?.email ?? '',
      payoutReference(payout.id),
      norm,
    ];
    const paid = [
      payout.method ? METHOD_LABELS[payout.method] ?? payout.method : '',
      payout.paidAt ? new Date(payout.paidAt).toISOString().slice(0, 10) : '',
      payout.paidReference ?? '',
    ];
    const items: any[] = payout.items || [];
    if (items.length === 0) {
      rows.push([...common, '', '', '', numCell(payout.totalSales), '', '', numCell(payout.netPayout), '', ...paid]);
      continue;
    }
    for (const i of items) {
      rows.push([
        ...common,
        i.titleSnapshot,
        i.soldAt ? new Date(i.soldAt).toISOString().slice(0, 10) : '',
        numCell(i.priceBeforeMarkdown),
        numCell(i.listPrice),
        numCell(i.collectedAmount),
        numCell(i.ratePct),
        numCell(i.consignorShare),
        numCell(i.organizerShare),
        ...paid,
      ]);
    }
  }
  return rows.map((r) => r.map(renderCsvCell).join(',')).join('\r\n') + '\r\n';
}
