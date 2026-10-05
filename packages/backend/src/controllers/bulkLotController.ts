/**
 * Bulk lot controller (ADR-136, roadmap #659). Mounted at /api/bulk-lots.
 *
 *   GET   /status                    public: is the feature on, plus the lot vocabulary and limits
 *   GET   /sale/:saleId/public       public: the price list for a sale (lots with prices and a ladder)
 *   GET   /item/:itemId/public       public: one lot
 *   GET   /sale/:saleId              organizer or team member: every lot in the sale (the register reads this)
 *   POST  /sale/:saleId/items        organizer: create a new lot item in the sale
 *   GET   /item/:itemId              organizer or team member: one lot, or data:null when it is not a lot
 *   POST  /item/:itemId/enable       organizer: turn an existing card item into a lot
 *   PATCH /item/:itemId              organizer: change the price per 1,000 or the lot type (totalCards and addCards are refused with
 *                                    409 BULK_USE_ADJUST: the card count changes only through POST /item/:itemId/adjust, which records history)
 *   POST  /item/:itemId/quote        organizer or team member: server price for N cards
 *
 * Envelope: { success: true, data } or { success: false, error, code }. Every route except /status answers 404
 * BULK_DISABLED while CARD_BULK_LOTS_ENABLED is off, so the feature is invisible until it is switched on.
 * The organizer id always comes from the logged-in account, never from the request.
 *
 * Handlers are built by createBulkLotHandlers(deps) so tests can inject fakes; the exported handlers are bound to the
 * shared Prisma client and process.env.
 */
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { PUBLIC_ITEM_FILTER } from '../helpers/itemQueries';
import { resolveOrganizerOrTeamMember } from '../utils/posAuth';
import { EnvLike, isBulkLotsEnabled } from '../services/bulkLot/bulkLotConfig';
import { BULK_LOT_VOCABULARY } from '../services/bulkLot/bulkLotVocabulary';
import { LOT_INVARIANT_MESSAGES } from '../services/bulkLot/bulkLotInvariants'; // ADR-136 Addendum B (#659): the card count changes only through /adjust
import { LADDER_STEPS, MAX_LOT_CARDS, MAX_PRICE_PER_THOUSAND_CENTS, MIN_LOT_CARDS } from '../services/bulkLot/bulkLotPricing';
import {
  BULK_LOT_MESSAGES,
  BulkLotDb,
  bulkLotError,
  createBulkLotItem,
  enableBulkLot,
  getOrganizerLot,
  getPublicLot,
  isBulkLotError,
  listOrganizerLots,
  listPublicLots,
  quoteBulkLine,
  updateBulkLot,
} from '../services/bulkLot/bulkLotService';

export interface BulkLotControllerDeps {
  db: BulkLotDb & {
    sale: { findUnique(args: any): Promise<any> };
    organizer: { findUnique(args: any): Promise<any> };
  };
  env: EnvLike;
  publicFilter: Record<string, unknown>;
  /** Organizer or team member at the register. Returns null after answering the request itself. */
  resolveActor: (req: AuthRequest, res: Response) => Promise<{ id: string } | null>;
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
  if (typeof extra.remaining === 'number') out.remaining = extra.remaining;
  if (typeof extra.expectedCents === 'number') out.expectedCents = extra.expectedCents;
  if (Array.isArray(extra.issues)) out.issues = extra.issues;
  return Object.keys(out).length > 0 ? out : undefined;
}

function sendError(res: Response, err: unknown, where: string): Response {
  if (isBulkLotError(err)) return fail(res, err.status, err.message, err.code, safeExtra(err.extra));
  console.error(`[bulkLots] ${where} error:`, err);
  return fail(res, 500, SERVER_ERROR_TEXT, 'SERVER_ERROR');
}

function idParam(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= 64 ? value : null;
}

export function createBulkLotHandlers(deps: BulkLotControllerDeps) {
  const enabled = () => isBulkLotsEnabled(deps.env);

  function gate(res: Response): boolean {
    if (enabled()) return true;
    fail(res, 404, BULK_LOT_MESSAGES.BULK_DISABLED, 'BULK_DISABLED');
    return false;
  }

  /**
   * ADR-136 Addendum B: the markdown cycle reprices items with a 0.99 floor, which would wreck a per-1,000 price. A lot is
   * excluded from markdown from the moment it exists. Best effort: a failure here is logged, never shown (the generic item
   * edit forces the same flag, and the migration backfills existing lots).
   */
  async function keepOutOfMarkdown(itemId: string): Promise<void> {
    try {
      await deps.db.item.updateMany({ where: { id: itemId, excludeFromMarkdown: false }, data: { excludeFromMarkdown: true } });
    } catch (err) {
      console.warn('[bulkLots] could not set excludeFromMarkdown (ignored):', err instanceof Error ? err.message : err);
    }
  }

  /** The caller's own organizer id, for organizer-only writes. Answers the request itself on failure. */
  async function organizerIdFor(req: AuthRequest, res: Response): Promise<string | null> {
    const userId = req.user?.id;
    if (!userId) {
      fail(res, 401, 'Sign in to manage bulk lots.', 'UNAUTHORIZED');
      return null;
    }
    const organizer = await deps.db.organizer.findUnique({ where: { userId }, select: { id: true } });
    if (!organizer) {
      fail(res, 403, 'Organizer access required.', 'FORBIDDEN');
      return null;
    }
    return organizer.id as string;
  }

  async function publicSale(saleId: string): Promise<{ id: string; title: string | null } | null> {
    const sale = await deps.db.sale.findUnique({ where: { id: saleId }, select: { id: true, title: true, status: true } });
    if (!sale) return null;
    // Same rule as the public items list: PUBLISHED and ENDED sales are public, everything else is not.
    if (sale.status !== 'PUBLISHED' && sale.status !== 'ENDED') return null;
    return { id: sale.id, title: sale.title ?? null };
  }

  return {
    async status(_req: AuthRequest, res: Response) {
      return ok(res, {
        enabled: enabled(),
        vocabulary: BULK_LOT_VOCABULARY,
        limits: {
          minLotCards: MIN_LOT_CARDS,
          maxLotCards: MAX_LOT_CARDS,
          maxPricePerThousandCents: MAX_PRICE_PER_THOUSAND_CENTS,
          ladderSteps: LADDER_STEPS,
        },
      });
    },

    async publicSaleLots(req: AuthRequest, res: Response) {
      if (!gate(res)) return;
      try {
        const saleId = idParam(req.params.saleId);
        const sale = saleId ? await publicSale(saleId) : null;
        if (!sale) return fail(res, 404, 'Sale not found.', 'SALE_NOT_FOUND');
        const lots = await listPublicLots(deps.db, sale.id, deps.publicFilter);
        return ok(res, { saleId: sale.id, saleTitle: sale.title, lots });
      } catch (err) {
        return sendError(res, err, 'publicSaleLots');
      }
    },

    async publicLot(req: AuthRequest, res: Response) {
      if (!gate(res)) return;
      try {
        const itemId = idParam(req.params.itemId);
        if (!itemId) return fail(res, 404, BULK_LOT_MESSAGES.BULK_NOT_FOUND, 'BULK_NOT_FOUND');
        const lot = await getPublicLot(deps.db, itemId, deps.publicFilter);
        const sale = lot && lot.saleId ? await publicSale(lot.saleId) : null;
        if (!lot || !sale) return fail(res, 404, BULK_LOT_MESSAGES.BULK_NOT_FOUND, 'BULK_NOT_FOUND');
        return ok(res, lot);
      } catch (err) {
        return sendError(res, err, 'publicLot');
      }
    },

    async listForSale(req: AuthRequest, res: Response) {
      if (!gate(res)) return;
      try {
        const actor = await deps.resolveActor(req, res);
        if (!actor) return;
        const saleId = idParam(req.params.saleId);
        const sale = saleId ? await deps.db.sale.findUnique({ where: { id: saleId }, select: { id: true, organizerId: true } }) : null;
        if (!sale) return fail(res, 404, 'Sale not found.', 'SALE_NOT_FOUND');
        if (sale.organizerId !== actor.id) return fail(res, 403, 'That sale does not belong to your account.', 'NOT_YOUR_SALE');
        const lots = await listOrganizerLots(deps.db, { organizerId: actor.id, saleId: sale.id });
        return ok(res, { lots });
      } catch (err) {
        return sendError(res, err, 'listForSale');
      }
    },

    async createInSale(req: AuthRequest, res: Response) {
      if (!gate(res)) return;
      try {
        const organizerId = await organizerIdFor(req, res);
        if (!organizerId) return;
        const saleId = idParam(req.params.saleId);
        const sale = saleId ? await deps.db.sale.findUnique({ where: { id: saleId }, select: { id: true, organizerId: true } }) : null;
        if (!sale) return fail(res, 404, 'Sale not found.', 'SALE_NOT_FOUND');
        if (sale.organizerId !== organizerId) return fail(res, 403, 'That sale does not belong to your account.', 'NOT_YOUR_SALE');
        const lot = await createBulkLotItem(deps.db, { organizerId, saleId: sale.id }, req.body);
        await keepOutOfMarkdown(lot.itemId);
        return ok(res, lot, 201);
      } catch (err) {
        return sendError(res, err, 'createInSale');
      }
    },

    async getOne(req: AuthRequest, res: Response) {
      if (!gate(res)) return;
      try {
        const actor = await deps.resolveActor(req, res);
        if (!actor) return;
        const itemId = idParam(req.params.itemId);
        if (!itemId) return fail(res, 404, BULK_LOT_MESSAGES.BULK_NOT_FOUND, 'BULK_NOT_FOUND');
        // Not a lot, or not yours: both answer data:null, so the panel can show "turn into a bulk lot" without a probe.
        return ok(res, await getOrganizerLot(deps.db, { organizerId: actor.id }, itemId));
      } catch (err) {
        return sendError(res, err, 'getOne');
      }
    },

    async enable(req: AuthRequest, res: Response) {
      if (!gate(res)) return;
      try {
        const organizerId = await organizerIdFor(req, res);
        if (!organizerId) return;
        const itemId = idParam(req.params.itemId);
        if (!itemId) return fail(res, 404, BULK_LOT_MESSAGES.BULK_NOT_FOUND, 'BULK_NOT_FOUND');
        const enabledLot = await enableBulkLot(deps.db, { organizerId }, itemId, req.body);
        await keepOutOfMarkdown(itemId);
        return ok(res, enabledLot);
      } catch (err) {
        return sendError(res, err, 'enable');
      }
    },

    async update(req: AuthRequest, res: Response) {
      if (!gate(res)) return;
      try {
        const organizerId = await organizerIdFor(req, res);
        if (!organizerId) return;
        const itemId = idParam(req.params.itemId);
        if (!itemId) return fail(res, 404, BULK_LOT_MESSAGES.BULK_NOT_FOUND, 'BULK_NOT_FOUND');
        // The card count is not edited here: it changes through /adjust (recount, damage, correction, added stock) so every change has a history row.
        const rawBody = req.body as Record<string, unknown> | undefined;
        if (rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody) && (rawBody.totalCards !== undefined || rawBody.addCards !== undefined)) {
          return fail(res, 409, LOT_INVARIANT_MESSAGES.BULK_USE_ADJUST, 'BULK_USE_ADJUST');
        }
        return ok(res, await updateBulkLot(deps.db, { organizerId }, itemId, req.body));
      } catch (err) {
        return sendError(res, err, 'update');
      }
    },

    async quote(req: AuthRequest, res: Response) {
      if (!gate(res)) return;
      try {
        const actor = await deps.resolveActor(req, res);
        if (!actor) return;
        const itemId = idParam(req.params.itemId);
        if (!itemId) return fail(res, 404, BULK_LOT_MESSAGES.BULK_NOT_FOUND, 'BULK_NOT_FOUND');
        const body = req.body as { quantity?: unknown } | undefined;
        if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((k) => k !== 'quantity')) {
          throw bulkLotError('BULK_VALIDATION', 400);
        }
        return ok(res, await quoteBulkLine(deps.db, { organizerId: actor.id }, itemId, body.quantity));
      } catch (err) {
        return sendError(res, err, 'quote');
      }
    },
  };
}

export const bulkLotHandlers = createBulkLotHandlers({
  db: prisma as unknown as BulkLotControllerDeps['db'],
  env: process.env,
  publicFilter: PUBLIC_ITEM_FILTER as Record<string, unknown>,
  resolveActor: (req, res) => resolveOrganizerOrTeamMember(req, res, { requireStripe: false }),
});
