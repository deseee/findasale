/**
 * Card payment gate for restricted items (2026-11-06).
 *
 *   assertCardAllowedForItems(processor, lines, organizerId, context)
 *
 * The SINGLE shared decision every card path asks before it creates a charge, payment link or transfer. It:
 *   - RE-READS every item's class from the database (never from the client, a cached cart or the caller's own query),
 *     and reclassifies a stale row (inputs changed since it was classified, or an older classifier version) on the spot;
 *   - RE-READS the organizer's card suspension (Organizer.cardPaymentsSuspendedAt) from the database;
 *   - applies the per-processor rule table (cardProcessorRules.ts);
 *   - fails CLOSED on an item that is missing or belongs to another organizer (it can never be card-charged here);
 *   - decides allowed / blocked per line and the card / cash amounts, including Patrick's 99-cent rule: when the card
 *     part would be under MIN_CARD_SALE_CENTS, the WHOLE cart goes to cash;
 *   - writes one RestrictedItemAuditLog row (PAYMENT_BLOCK or PAYMENT_SPLIT) whenever anything is not card-allowed.
 *     Never logs card data: no token, nonce, source id or fingerprint is accepted by this function at all.
 *
 * `processor` is decided by the CALLER'S OWN CODE (the processor it is about to charge), never by request input.
 * Lines without an itemId (misc / consignor-tag lines that have no Item row yet) carry no class and are card-allowed
 * unless the organizer is suspended.
 */
import { prisma } from '../../lib/prisma';
import { MIN_CARD_SALE_CENTS } from '../../utils/feeCalculator';
import { blockedClassesFor, isClassBlockedFor } from './cardProcessorRules';
import { effectiveRestrictedClass, isRestrictedItemClassName, type RestrictedItemClassName } from './restrictedItemClassifier';
import { isStale, readItemClassificationRows, reclassifyRow, type RawSqlClient } from './restrictedClassStore';

export interface CardGateLine {
  /** null for a line with no Item row (misc line, consignor tag line). */
  itemId: string | null;
  /** Server-computed amount of this line, in cents. Never a client-supplied total. */
  amountCents: number;
}

export interface CardGateContext {
  /** Stable path name, e.g. 'square.online.single', 'square.pos.manual', 'finix.transfer'. */
  path: string;
  buyerUserId?: string | null;
  /** Cart / invoice / request / link id. Never a card token. */
  sessionRef?: string | null;
}

export type CardBlockReason =
  | 'RESTRICTED_CLASS'
  | 'ORGANIZER_CARD_SUSPENDED'
  | 'ITEM_NOT_FOUND'
  | 'ITEM_NOT_ORGANIZER'
  | 'CARD_PORTION_BELOW_MINIMUM';

export interface CardGateLineResult {
  itemId: string | null;
  amountCents: number;
  restrictedClass: RestrictedItemClassName;
  allowed: boolean;
  reason: CardBlockReason | null;
}

export interface CardGateDecision {
  processor: string;
  organizerId: string;
  organizerCardSuspended: boolean;
  /** true when every line may go on the card (nothing to split). */
  allCardAllowed: boolean;
  /** true when no line may go on the card. */
  allCash: boolean;
  allowed: CardGateLineResult[];
  blocked: CardGateLineResult[];
  cardAmountCents: number;
  cashAmountCents: number;
}

/** What the API returns to the frontend when a card path refuses (status 409, code CARD_PAYMENT_BLOCKED). */
export interface CardGateResponseBody {
  code: 'CARD_PAYMENT_BLOCKED';
  message: string;
  split: {
    processor: string;
    organizerCardSuspended: boolean;
    allowedItems: Array<{ itemId: string | null; amountCents: number }>;
    blockedItems: Array<{ itemId: string | null; amountCents: number; restrictedClass: RestrictedItemClassName; reason: CardBlockReason | null }>;
    cardAmountCents: number;
    cashAmountCents: number;
  };
}

export interface GateDeps {
  db: RawSqlClient;
  audit: (row: AuditRow) => Promise<unknown>;
  readSuspension: (organizerId: string) => Promise<{ exists: boolean; suspendedAt: Date | null }>;
}

export interface AuditRow {
  kind: 'PAYMENT_BLOCK' | 'PAYMENT_SPLIT';
  organizerId: string;
  processor: string;
  source: string;
  itemIds: string[];
  classes: string[];
  buyerUserId: string | null;
  sessionRef: string | null;
  cardAmountCents: number;
  cashAmountCents: number;
  detail: Record<string, unknown>;
}

/**
 * Default dependencies. Pass `db` (a transaction client) when the caller holds a row lock on one of the items inside an
 * interactive transaction (auctionJob.ts): a stale-row reclassification then writes through the SAME connection instead
 * of waiting on the caller's own lock from a second connection.
 */
export const defaultGateDeps = (db?: RawSqlClient): GateDeps => ({
  db: db ?? (prisma as unknown as RawSqlClient),
  audit: (row) =>
    (prisma as any).restrictedItemAuditLog.create({
      data: {
        kind: row.kind,
        organizerId: row.organizerId,
        processor: row.processor,
        source: row.source,
        itemIds: row.itemIds,
        classes: row.classes,
        buyerUserId: row.buyerUserId,
        sessionRef: row.sessionRef,
        cardAmountCents: row.cardAmountCents,
        cashAmountCents: row.cashAmountCents,
        detail: row.detail,
      },
    }),
  readSuspension: async (organizerId) => {
    const rows = await (prisma as unknown as RawSqlClient).$queryRaw<Array<{ cardPaymentsSuspendedAt: Date | null }>>`
      SELECT "cardPaymentsSuspendedAt" FROM "Organizer" WHERE "id" = ${organizerId}
    `;
    return { exists: rows.length > 0, suspendedAt: rows[0]?.cardPaymentsSuspendedAt ?? null };
  },
});

/**
 * Pure split decision (no I/O). Exported for tests and for callers that already hold DB-fresh classes.
 * `classes` maps itemId -> { cls, reason } where reason is set for not-found / not-organizer rows.
 */
export function decideCardSplit(params: {
  processor: string;
  organizerId: string;
  organizerCardSuspended: boolean;
  lines: readonly CardGateLine[];
  classes: ReadonlyMap<string, { cls: RestrictedItemClassName; reason: CardBlockReason | null }>;
}): CardGateDecision {
  const results: CardGateLineResult[] = params.lines.map((line) => {
    const amountCents = Math.max(0, Math.round(Number(line.amountCents) || 0));
    if (!line.itemId) {
      return params.organizerCardSuspended
        ? { itemId: null, amountCents, restrictedClass: 'NONE', allowed: false, reason: 'ORGANIZER_CARD_SUSPENDED' }
        : { itemId: null, amountCents, restrictedClass: 'NONE', allowed: true, reason: null };
    }
    const info = params.classes.get(line.itemId) ?? { cls: 'NONE' as RestrictedItemClassName, reason: 'ITEM_NOT_FOUND' as CardBlockReason };
    if (info.reason) return { itemId: line.itemId, amountCents, restrictedClass: info.cls, allowed: false, reason: info.reason };
    if (params.organizerCardSuspended) {
      return { itemId: line.itemId, amountCents, restrictedClass: info.cls, allowed: false, reason: 'ORGANIZER_CARD_SUSPENDED' };
    }
    if (isClassBlockedFor(params.processor, info.cls)) {
      return { itemId: line.itemId, amountCents, restrictedClass: info.cls, allowed: false, reason: 'RESTRICTED_CLASS' };
    }
    return { itemId: line.itemId, amountCents, restrictedClass: info.cls, allowed: true, reason: null };
  });

  let allowed = results.filter((r) => r.allowed);
  let blocked = results.filter((r) => !r.allowed);
  let cardAmountCents = allowed.reduce((s, r) => s + r.amountCents, 0);

  // Patrick 2026-10-12: smallest card sale is 99 cents. When the card part of a split would be under it, the whole
  // cart is taken as cash. (A cart that is ENTIRELY card-allowed is left to the caller's own minimum check, unchanged.)
  if (blocked.length > 0 && cardAmountCents > 0 && cardAmountCents < MIN_CARD_SALE_CENTS) {
    blocked = [...blocked, ...allowed.map((r) => ({ ...r, allowed: false, reason: 'CARD_PORTION_BELOW_MINIMUM' as CardBlockReason }))];
    allowed = [];
    cardAmountCents = 0;
  }
  const cashAmountCents = blocked.reduce((s, r) => s + r.amountCents, 0);

  return {
    processor: params.processor,
    organizerId: params.organizerId,
    organizerCardSuspended: params.organizerCardSuspended,
    allCardAllowed: blocked.length === 0,
    allCash: allowed.length === 0,
    allowed,
    blocked,
    cardAmountCents,
    cashAmountCents,
  };
}

/**
 * The gate. See file header. Throws only on a database error (callers already treat a thrown error as "no charge").
 */
export async function assertCardAllowedForItems(
  processor: string,
  lines: readonly CardGateLine[],
  organizerId: string,
  context: CardGateContext,
  deps: GateDeps = defaultGateDeps(),
): Promise<CardGateDecision> {
  const suspension = organizerId ? await deps.readSuspension(organizerId) : { exists: false, suspendedAt: null };
  // An unknown organizer can never be charged for: treat as suspended (fail closed).
  const organizerCardSuspended = !suspension.exists || !!suspension.suspendedAt;

  const itemIds = Array.from(new Set(lines.map((l) => l.itemId).filter((v): v is string => typeof v === 'string' && v.length > 0)));
  const classes = new Map<string, { cls: RestrictedItemClassName; reason: CardBlockReason | null }>();
  if (itemIds.length > 0) {
    const rows = await readItemClassificationRows(deps.db, itemIds);
    for (const row of rows) {
      // The sale's organizer is authoritative when the item is in a sale; Item.organizerId is the denormalized fallback
      // for inventory items with no sale.
      const owner = row.saleOrganizerId ?? row.organizerId;
      const ownedByOrganizer = !!owner && owner === organizerId;
      let stored: RestrictedItemClassName = isRestrictedItemClassName(row.restrictedClass) ? row.restrictedClass : 'NONE';
      if (isStale(row)) {
        // Inputs changed since the last classification (or the rules changed): decide on a fresh classification of the
        // row as it is in the database right now, and persist it.
        stored = (await reclassifyRow(deps.db, row, 'GATE')).storedClass;
      }
      const override = isRestrictedItemClassName(row.restrictedClassOverride) ? row.restrictedClassOverride : null;
      classes.set(row.id, { cls: effectiveRestrictedClass(stored, override), reason: ownedByOrganizer ? null : 'ITEM_NOT_ORGANIZER' });
    }
  }

  const decision = decideCardSplit({ processor, organizerId, organizerCardSuspended, lines, classes });

  if (!decision.allCardAllowed) {
    try {
      await deps.audit({
        kind: decision.allCash ? 'PAYMENT_BLOCK' : 'PAYMENT_SPLIT',
        organizerId,
        processor,
        source: context.path,
        itemIds: decision.blocked.map((b) => b.itemId ?? '(line)'),
        classes: decision.blocked.map((b) => b.restrictedClass),
        buyerUserId: context.buyerUserId ?? null,
        sessionRef: context.sessionRef ?? null,
        cardAmountCents: decision.cardAmountCents,
        cashAmountCents: decision.cashAmountCents,
        detail: {
          blockedReasons: decision.blocked.map((b) => b.reason),
          allowedItemIds: decision.allowed.map((a) => a.itemId),
          organizerCardSuspended,
          processorBlockedClasses: blockedClassesFor(processor),
        },
      });
    } catch (auditErr) {
      // The decision stands even if the audit insert fails; never let a logging failure open the card path.
      console.error('[cardPaymentGate] audit insert failed:', (auditErr as { name?: string })?.name ?? 'Error');
    }
  }
  return decision;
}

const BLOCK_MESSAGE_SUSPENDED = 'Card payments are paused for this seller. Please pay the seller in cash.';
const BLOCK_MESSAGE_SPLIT = 'Some items in this purchase cannot be paid by card. Please pay for those items in cash.';
const BLOCK_MESSAGE_ALL = 'These items cannot be paid by card. Please pay the seller in cash.';

/** The 409 body a card path returns when the gate did not allow the whole cart. No charge was made. */
export function cardGateResponseBody(decision: CardGateDecision): CardGateResponseBody {
  return {
    code: 'CARD_PAYMENT_BLOCKED',
    message: decision.organizerCardSuspended ? BLOCK_MESSAGE_SUSPENDED : decision.allCash ? BLOCK_MESSAGE_ALL : BLOCK_MESSAGE_SPLIT,
    split: {
      processor: decision.processor,
      organizerCardSuspended: decision.organizerCardSuspended,
      allowedItems: decision.allowed.map((a) => ({ itemId: a.itemId, amountCents: a.amountCents })),
      blockedItems: decision.blocked.map((b) => ({ itemId: b.itemId, amountCents: b.amountCents, restrictedClass: b.restrictedClass, reason: b.reason })),
      cardAmountCents: decision.cardAmountCents,
      cashAmountCents: decision.cashAmountCents,
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Call-site helper
// ---------------------------------------------------------------------------------------------------------------------

export type CardChargeGateResult =
  | { ok: true; decision: CardGateDecision }
  | { ok: false; status: 409; body: CardGateResponseBody; decision: CardGateDecision };

/**
 * What every card call site runs right before it creates a charge / payment link / transfer.
 *
 *   cardChargeCents: what the site is about to put on the card. A site that already supports a cash leg (POS split
 *   tender, hold invoices, payment links) passes total minus its cash leg, so a cashier who already moved the blocked
 *   items to the cash leg goes through. Everything else passes the full total.
 *
 * Allowed when every line is card-allowed, or when the card charge fits inside the allowed lines
 * (cardChargeCents <= decision.cardAmountCents, and not all-cash). Otherwise a 409 CARD_PAYMENT_BLOCKED body with the
 * per-item split, and NO charge is made.
 */
export async function gateCardCharge(params: {
  processor: string;
  organizerId: string;
  lines: readonly CardGateLine[];
  cardChargeCents: number;
  context: CardGateContext;
  deps?: GateDeps;
}): Promise<CardChargeGateResult> {
  const decision = await assertCardAllowedForItems(params.processor, params.lines, params.organizerId, params.context, params.deps);
  if (decision.allCardAllowed) return { ok: true, decision };
  const card = Math.max(0, Math.round(Number(params.cardChargeCents) || 0));
  if (!decision.allCash && card > 0 && card <= decision.cardAmountCents) return { ok: true, decision };
  return { ok: false, status: 409, body: cardGateResponseBody(decision), decision };
}

/**
 * Builds gate lines for item ids from their CURRENT database prices (cents), plus one item-less line for any remainder
 * of `totalCents` not covered by the items (misc lines, shipping, consignor tags). Used where the caller only knows ids
 * and a total (POS payment requests, hold invoices).
 */
export async function linesFromItemPrices(itemIds: readonly string[], totalCents: number): Promise<CardGateLine[]> {
  const ids = Array.from(new Set(itemIds.filter((id) => typeof id === 'string' && id)));
  const rows = ids.length
    ? await (prisma as unknown as RawSqlClient).$queryRaw<Array<{ id: string; price: number | null }>>`
        SELECT "id", "price" FROM "Item" WHERE "id" = ANY(${ids}::text[])
      `
    : [];
  const priceById = new Map(rows.map((r) => [r.id, Math.max(0, Math.round((Number(r.price) || 0) * 100))]));
  const lines: CardGateLine[] = ids.map((id) => ({ itemId: id, amountCents: priceById.get(id) ?? 0 }));
  const covered = lines.reduce((s, l) => s + l.amountCents, 0);
  const rest = Math.round(totalCents) - covered;
  if (rest > 0) lines.push({ itemId: null, amountCents: rest });
  return lines;
}

/** Thrown by shared internals (e.g. posController.createPaymentLinkInternal) so each route answers with the same body. */
export class CardPaymentBlockedError extends Error {
  readonly status = 409;
  constructor(readonly body: CardGateResponseBody) {
    super(body.message);
    this.name = 'CardPaymentBlockedError';
  }
}
