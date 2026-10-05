/**
 * Bulk lot follow-up handlers (ADR-136 Addendum B, roadmap #659). Mounted by routes/bulkLots.ts under /api/bulk-lots.
 *
 *   POST /item/:itemId/adjust               organizer: recount, damage, correction, added stock (writes a history row)
 *   GET  /item/:itemId/adjustments          organizer or team member: the lot's adjustment history, newest first
 *   GET  /item/:itemId/sales                organizer or team member: sale rows of this lot with cards still out, for refunds
 *   POST /item/:itemId/refund-preview       organizer or team member: exact money for taking N cards of one sale back
 *   GET  /item/:itemId/holds                organizer or team member: holds on the lot (status=ACTIVE by default, or ALL)
 *   POST /item/:itemId/holds                organizer: hold N cards for a customer
 *   POST /holds/:holdId/release             organizer: release a hold, the cards go back to the lot
 *   POST /holds/:holdId/convert             organizer: turn a hold into a sale (cash now, or a Square payment link)
 *   POST /item/:itemId/hold                 signed-in shopper: hold N cards of a public lot for 2 hours
 *   GET  /my-holds                          signed-in shopper: their active holds
 *   POST /my-holds/:holdId/release          signed-in shopper: let go of their own hold
 *
 * Same envelope and gate as controllers/bulkLotController.ts: { success, data } or { success: false, error, code }, and
 * every route answers 404 BULK_DISABLED while CARD_BULK_LOTS_ENABLED is off. The organizer id always comes from the
 * logged-in account. Handlers are built by createBulkLotFollowupHandlers(deps) so tests inject fakes; the Prisma and
 * Square wiring is in controllers/bulkLotFollowupController.ts.
 */
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { EnvLike, isBulkLotsEnabled } from '../services/bulkLot/bulkLotConfig';
import { BULK_LOT_MESSAGES, BulkLotDb, SellUnitsInTx, bulkLotError, getPublicLot, isBulkLotError } from '../services/bulkLot/bulkLotService';
import { AdjustDb, adjustBulkLot, isBulkAdjustError, listAdjustments } from '../services/bulkLot/bulkLotAdjustService';
import {
  HoldDb,
  HoldDeps,
  SquareLinkResult,
  convertBulkHold,
  isBulkHoldError,
  listLotHolds,
  listShopperHolds,
  placeBulkHold,
  releaseBulkHold,
} from '../services/bulkLot/bulkLotHoldService';
import { isBulkRefundError, planExplicitCardRefund } from '../services/bulkLot/bulkLotRefundService';
import { formatCents } from '../services/bulkLot/bulkLotPricing';

export interface FollowupDeps {
  db: BulkLotDb &
    AdjustDb &
    HoldDb & {
      sale: { findUnique(args: any): Promise<any> };
      organizer: { findUnique(args: any): Promise<any> };
      purchase: { findMany(args: any): Promise<any[]>; findUnique(args: any): Promise<any> };
    };
  env: EnvLike;
  publicFilter: Record<string, unknown>;
  resolveActor: (req: AuthRequest, res: Response) => Promise<{ id: string } | null>;
  sell: SellUnitsInTx;
  markPaid: NonNullable<HoldDeps['markPaid']>;
  createSquareLink: (organizerId: string, p: { holdInvoiceId: string; amountCents: number; description: string; appFeeCents: number }) => Promise<SquareLinkResult>;
  deleteSquareLink: (organizerId: string, p: { paymentLinkId: string }) => Promise<{ ok: boolean }>;
  feeFor: (subscriptionTier: string | null | undefined, amountCents: number) => number;
  /** Called after the cards of a lot change by hand or by a hold (eBay bundle reconcile). Must never throw. */
  afterStockChange?: (itemId: string, why: string) => void;
  now?: () => Date;
}

const SERVER_ERROR_TEXT = 'Something went wrong. Try again in a moment.';

function ok(res: Response, data: unknown, status = 200): Response {
  return res.status(status).json({ success: true, data });
}

function fail(res: Response, status: number, error: string, code: string, extra?: Record<string, unknown>): Response {
  return res.status(status).json({ success: false, error, code, ...(extra ?? {}) });
}

/** Only these extras are safe to hand back to a client. */
function safeExtra(extra: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!extra) return undefined;
  const out: Record<string, unknown> = {};
  for (const k of ['remaining', 'expectedCents', 'onHand', 'outstanding', 'remainingCents'] as const) {
    if (typeof extra[k] === 'number') out[k] = extra[k];
  }
  if (Array.isArray(extra.issues)) out.issues = extra.issues;
  return Object.keys(out).length > 0 ? out : undefined;
}

function sendError(res: Response, err: unknown, where: string): Response {
  if (isBulkLotError(err) || isBulkAdjustError(err) || isBulkHoldError(err) || isBulkRefundError(err)) {
    return fail(res, err.status, err.message, err.code, safeExtra((err as { extra?: Record<string, unknown> }).extra));
  }
  console.error(`[bulkLots] ${where} error:`, err);
  return fail(res, 500, SERVER_ERROR_TEXT, 'SERVER_ERROR');
}

function idParam(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= 64 ? value : null;
}

export function createBulkLotFollowupHandlers(deps: FollowupDeps) {
  const enabled = () => isBulkLotsEnabled(deps.env);

  function gate(res: Response): boolean {
    if (enabled()) return true;
    fail(res, 404, BULK_LOT_MESSAGES.BULK_DISABLED, 'BULK_DISABLED');
    return false;
  }

  function notify(itemId: string, why: string): void {
    try {
      deps.afterStockChange?.(itemId, why);
    } catch (err) {
      console.warn('[bulkLots] afterStockChange failed (ignored):', err instanceof Error ? err.message : err);
    }
  }

  async function organizerFor(req: AuthRequest, res: Response): Promise<{ id: string; userId: string; subscriptionTier: string | null; squareOnboarded: boolean; squareMerchantId: string | null } | null> {
    const userId = req.user?.id;
    if (!userId) {
      fail(res, 401, 'Sign in to manage bulk lots.', 'UNAUTHORIZED');
      return null;
    }
    const organizer = await deps.db.organizer.findUnique({ where: { userId }, select: { id: true, userId: true, subscriptionTier: true, squareOnboarded: true, squareMerchantId: true } });
    if (!organizer) {
      fail(res, 403, 'Organizer access required.', 'FORBIDDEN');
      return null;
    }
    return { id: organizer.id, userId: organizer.userId ?? userId, subscriptionTier: organizer.subscriptionTier ?? null, squareOnboarded: organizer.squareOnboarded === true, squareMerchantId: organizer.squareMerchantId ?? null };
  }

  function holdDeps(organizerId?: string, tier?: string | null): HoldDeps {
    return {
      sell: deps.sell,
      now: deps.now,
      markPaid: deps.markPaid,
      createSquareLink: organizerId ? (p) => deps.createSquareLink(organizerId, p) : undefined,
      deleteSquareLink: organizerId ? (p) => deps.deleteSquareLink(organizerId, p) : undefined,
      feeCents: (cents) => deps.feeFor(tier, cents),
    };
  }

  /** A shopper hold needs the same public view the price list shows: published sale, available lot. */
  async function publicLotFor(itemId: string): Promise<boolean> {
    const lot = await getPublicLot(deps.db, itemId, deps.publicFilter);
    if (!lot || !lot.saleId) return false;
    const sale = await deps.db.sale.findUnique({ where: { id: lot.saleId }, select: { id: true, status: true } });
    return !!sale && sale.status === 'PUBLISHED';
  }

  async function ownLotItem(organizerId: string, itemId: string): Promise<{ id: string; organizerId: string; saleId: string | null } | null> {
    const row = await deps.db.item.findUnique({ where: { id: itemId }, select: { id: true, organizerId: true, saleId: true, bulkLot: { select: { id: true } } } });
    if (!row || row.organizerId !== organizerId || !row.bulkLot) return null;
    return row;
  }

  return {
    async adjust(req: AuthRequest, res: Response) {
      if (!gate(res)) return;
      try {
        const organizer = await organizerFor(req, res);
        if (!organizer) return;
        const itemId = idParam(req.params.itemId);
        if (!itemId) return fail(res, 404, BULK_LOT_MESSAGES.BULK_NOT_FOUND, 'BULK_NOT_FOUND');
        const result = await adjustBulkLot(deps.db, { organizerId: organizer.id, actorUserId: organizer.userId }, itemId, req.body, { afterChange: (id, why) => notify(id, why) });
        return ok(res, result);
      } catch (err) {
        return sendError(res, err, 'adjust');
      }
    },

    async adjustments(req: AuthRequest, res: Response) {
      if (!gate(res)) return;
      try {
        const actor = await deps.resolveActor(req, res);
        if (!actor) return;
        const itemId = idParam(req.params.itemId);
        if (!itemId) return fail(res, 404, BULK_LOT_MESSAGES.BULK_NOT_FOUND, 'BULK_NOT_FOUND');
        return ok(res, { adjustments: await listAdjustments(deps.db, { organizerId: actor.id }, itemId) });
      } catch (err) {
        return sendError(res, err, 'adjustments');
      }
    },

    async sales(req: AuthRequest, res: Response) {
      if (!gate(res)) return;
      try {
        const actor = await deps.resolveActor(req, res);
        if (!actor) return;
        const itemId = idParam(req.params.itemId);
        if (!itemId) return fail(res, 404, BULK_LOT_MESSAGES.BULK_NOT_FOUND, 'BULK_NOT_FOUND');
        if (!(await ownLotItem(actor.id, itemId))) throw bulkLotError('BULK_NOT_FOUND', 404);
        const rows = await deps.db.purchase.findMany({
          where: { itemId, bulkQuantity: { gt: 0 }, status: { in: ['PAID', 'REFUNDING', 'REFUNDED', 'DISPUTED'] } },
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: { id: true, amount: true, status: true, source: true, bulkQuantity: true, bulkRefundedQuantity: true, refundedAmount: true, buyerEmail: true, guestName: true, createdAt: true },
        });
        const sales = rows.map((r) => {
          const sold = Number(r.bulkQuantity) || 0;
          const returned = Number(r.bulkRefundedQuantity) || 0;
          return {
            purchaseId: String(r.id),
            amountCents: Math.round(Number(r.amount) * 100),
            amountLabel: formatCents(Math.round(Number(r.amount) * 100)),
            refundedCents: Math.round((Number(r.refundedAmount) || 0) * 100),
            status: String(r.status),
            source: r.source ?? null,
            soldCards: sold,
            returnedCards: returned,
            outstandingCards: Math.max(0, sold - returned),
            customer: r.guestName ?? r.buyerEmail ?? null,
            createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt ?? ''),
          };
        });
        return ok(res, { sales });
      } catch (err) {
        return sendError(res, err, 'sales');
      }
    },

    async refundPreview(req: AuthRequest, res: Response) {
      if (!gate(res)) return;
      try {
        const actor = await deps.resolveActor(req, res);
        if (!actor) return;
        const itemId = idParam(req.params.itemId);
        if (!itemId) return fail(res, 404, BULK_LOT_MESSAGES.BULK_NOT_FOUND, 'BULK_NOT_FOUND');
        if (!(await ownLotItem(actor.id, itemId))) throw bulkLotError('BULK_NOT_FOUND', 404);
        const body = req.body as { purchaseId?: unknown; cards?: unknown } | undefined;
        const purchaseId = idParam(body?.purchaseId);
        if (!body || !purchaseId || Object.keys(body).some((k) => k !== 'purchaseId' && k !== 'cards')) throw bulkLotError('BULK_VALIDATION', 400);
        const p = await deps.db.purchase.findUnique({
          where: { id: purchaseId },
          select: { id: true, itemId: true, amount: true, bulkQuantity: true, bulkRefundedQuantity: true, refundedAmount: true },
        });
        if (!p || p.itemId !== itemId || !(Number(p.bulkQuantity) > 0)) throw bulkLotError('BULK_NOT_FOUND', 404);
        const plan = planExplicitCardRefund(
          {
            soldCards: Number(p.bulkQuantity),
            purchaseCents: Math.round(Number(p.amount) * 100),
            returnedCards: Number(p.bulkRefundedQuantity) || 0,
            refundedCents: Math.round((Number(p.refundedAmount) || 0) * 100),
          },
          body.cards
        );
        return ok(res, { cards: plan.cards, cents: plan.cents, amount: plan.cents / 100, amountLabel: formatCents(plan.cents), isFull: plan.isFull, returnedAfter: plan.targetCards });
      } catch (err) {
        return sendError(res, err, 'refundPreview');
      }
    },

    async listHolds(req: AuthRequest, res: Response) {
      if (!gate(res)) return;
      try {
        const actor = await deps.resolveActor(req, res);
        if (!actor) return;
        const itemId = idParam(req.params.itemId);
        if (!itemId) return fail(res, 404, BULK_LOT_MESSAGES.BULK_NOT_FOUND, 'BULK_NOT_FOUND');
        const all = req.query?.status === 'ALL';
        const holds = await listLotHolds(deps.db, { organizerId: actor.id }, itemId, all ? ['ACTIVE', 'CONVERTED', 'RELEASED', 'EXPIRED'] : ['ACTIVE']);
        return ok(res, { holds });
      } catch (err) {
        return sendError(res, err, 'listHolds');
      }
    },

    async placeOrganizerHold(req: AuthRequest, res: Response) {
      if (!gate(res)) return;
      try {
        const organizer = await organizerFor(req, res);
        if (!organizer) return;
        const itemId = idParam(req.params.itemId);
        if (!itemId) return fail(res, 404, BULK_LOT_MESSAGES.BULK_NOT_FOUND, 'BULK_NOT_FOUND');
        const hold = await placeBulkHold(deps.db, holdDeps(), { kind: 'ORGANIZER', organizerId: organizer.id, actorUserId: organizer.userId }, itemId, req.body);
        notify(itemId, 'hold placed');
        return ok(res, hold, 201);
      } catch (err) {
        return sendError(res, err, 'placeOrganizerHold');
      }
    },

    async releaseOrganizerHold(req: AuthRequest, res: Response) {
      if (!gate(res)) return;
      try {
        const organizer = await organizerFor(req, res);
        if (!organizer) return;
        const holdId = idParam(req.params.holdId);
        if (!holdId) return fail(res, 404, 'That hold was not found.', 'BULK_HOLD_NOT_FOUND');
        const result = await releaseBulkHold(deps.db, holdDeps(organizer.id), { kind: 'ORGANIZER', organizerId: organizer.id, actorUserId: organizer.userId }, holdId);
        if (result.released) notify(result.hold.itemId, 'hold released');
        return ok(res, result);
      } catch (err) {
        return sendError(res, err, 'releaseOrganizerHold');
      }
    },

    async convertHold(req: AuthRequest, res: Response) {
      if (!gate(res)) return;
      try {
        const organizer = await organizerFor(req, res);
        if (!organizer) return;
        const holdId = idParam(req.params.holdId);
        if (!holdId) return fail(res, 404, 'That hold was not found.', 'BULK_HOLD_NOT_FOUND');
        const squareReady = organizer.squareOnboarded && !!organizer.squareMerchantId;
        const result = await convertBulkHold(deps.db, holdDeps(organizer.id, organizer.subscriptionTier), { organizerId: organizer.id, organizerUserId: organizer.userId, squareReady }, holdId, req.body);
        notify(result.hold.itemId, 'hold converted');
        return ok(res, result);
      } catch (err) {
        return sendError(res, err, 'convertHold');
      }
    },

    async placeShopperHold(req: AuthRequest, res: Response) {
      if (!gate(res)) return;
      try {
        const userId = req.user?.id;
        if (!userId) return fail(res, 401, 'Sign in to hold cards.', 'UNAUTHORIZED');
        const itemId = idParam(req.params.itemId);
        if (!itemId || !(await publicLotFor(itemId))) return fail(res, 404, BULK_LOT_MESSAGES.BULK_NOT_FOUND, 'BULK_NOT_FOUND');
        const hold = await placeBulkHold(deps.db, holdDeps(), { kind: 'SHOPPER', userId }, itemId, req.body);
        notify(itemId, 'hold placed');
        return ok(res, hold, 201);
      } catch (err) {
        return sendError(res, err, 'placeShopperHold');
      }
    },

    async myHolds(req: AuthRequest, res: Response) {
      if (!gate(res)) return;
      try {
        const userId = req.user?.id;
        if (!userId) return fail(res, 401, 'Sign in to see your holds.', 'UNAUTHORIZED');
        return ok(res, { holds: await listShopperHolds(deps.db, { userId }) });
      } catch (err) {
        return sendError(res, err, 'myHolds');
      }
    },

    async releaseShopperHold(req: AuthRequest, res: Response) {
      if (!gate(res)) return;
      try {
        const userId = req.user?.id;
        if (!userId) return fail(res, 401, 'Sign in to manage your holds.', 'UNAUTHORIZED');
        const holdId = idParam(req.params.holdId);
        if (!holdId) return fail(res, 404, 'That hold was not found.', 'BULK_HOLD_NOT_FOUND');
        const result = await releaseBulkHold(deps.db, holdDeps(), { kind: 'SHOPPER', userId }, holdId);
        if (result.released) notify(result.hold.itemId, 'hold released');
        return ok(res, result);
      } catch (err) {
        return sendError(res, err, 'releaseShopperHold');
      }
    },
  };
}
