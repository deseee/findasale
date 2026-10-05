/**
 * Bulk lot eBay bundle controller (ADR-136 Addendum C, roadmap #659). Mounted at /api/bulk-lots/ebay.
 *
 *   GET  /status             is the feature on, plus the limits and presets
 *   GET  /item/:itemId       organizer: the lot's bundle settings, stock, price and listing state
 *   PUT  /item/:itemId       organizer: save the bundle settings (size, premium or discount, title, condition, language,
 *                            box weight and size, on or off) and bring eBay in line
 *   POST /item/:itemId/list  organizer: List on eBay now (first listing, or after a stopped or failed one)
 *   POST /item/:itemId/sync  organizer: Sync now (the same check the background sweep runs)
 *
 * Envelope: { success: true, data } or { success: false, error, code }. Every route except /status answers 404
 * BUNDLE_DISABLED while CARD_BULK_EBAY_ENABLED (and CARD_BULK_LOTS_ENABLED) is off, so the feature stays invisible. The
 * organizer id always comes from the logged-in account, never from the request. There is no tier gate on the settings;
 * the listing itself goes through the normal eBay push pipeline, which applies the PRO or TEAMS gate and the monthly
 * push quota and answers with its own plain message.
 *
 * Handlers are built by createBulkLotEbayHandlers(deps) so tests can inject fakes; the exported handlers are bound to
 * the shared Prisma client, the real eBay operations and process.env.
 */
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { isBulkEbayEnabled } from '../services/bulkLot/bulkLotEbayConfig';
import type { EnvLike } from '../services/bulkLot/bulkLotConfig';
import { BULK_EBAY_MESSAGES, BUNDLE_SIZE_MAX, BUNDLE_SIZE_MIN, BUNDLE_SIZE_PRESETS, MIN_BUNDLE_WEIGHT_OZ, isBulkEbayError } from '../services/bulkLot/bulkLotEbayBundle';
import { getBundleView, listBundleOnEbay, saveBundleSettings, syncBundleNow, type BundleDb, type BundleEbayOps } from '../services/bulkLot/bulkLotEbayService';
import { bundleDb, realBundleOps } from '../services/bulkLot/bulkLotEbayWiring';

export interface BulkLotEbayControllerDeps {
  db: BundleDb & { organizer: { findUnique(args: any): Promise<any> } };
  ops: BundleEbayOps;
  env: EnvLike;
}

const SERVER_ERROR_TEXT = 'Something went wrong. Try again in a moment.';

function ok(res: Response, data: unknown, status = 200): Response {
  return res.status(status).json({ success: true, data });
}

function fail(res: Response, status: number, error: string, code: string, extra?: Record<string, unknown>): Response {
  return res.status(status).json({ success: false, error, code, ...(extra ?? {}) });
}

function sendError(res: Response, err: unknown, where: string): Response {
  if (isBulkEbayError(err)) {
    const field = typeof err.details?.field === 'string' ? { field: err.details.field } : undefined;
    return fail(res, err.status, err.message, err.code, field);
  }
  console.error(`[bulkLotEbay] ${where} error:`, err);
  return fail(res, 500, SERVER_ERROR_TEXT, 'SERVER_ERROR');
}

function idParam(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= 64 ? value : null;
}

export function createBulkLotEbayHandlers(deps: BulkLotEbayControllerDeps) {
  const enabled = () => isBulkEbayEnabled(deps.env);

  function gate(res: Response): boolean {
    if (enabled()) return true;
    fail(res, 404, BULK_EBAY_MESSAGES.BUNDLE_DISABLED, 'BUNDLE_DISABLED');
    return false;
  }

  async function organizerIdFor(req: AuthRequest, res: Response): Promise<string | null> {
    const userId = req.user?.id;
    if (!userId) {
      fail(res, 401, 'Sign in to manage eBay bundles.', 'UNAUTHORIZED');
      return null;
    }
    const organizer = await deps.db.organizer.findUnique({ where: { userId }, select: { id: true } });
    if (!organizer) {
      fail(res, 403, 'Organizer access required.', 'FORBIDDEN');
      return null;
    }
    return organizer.id as string;
  }

  return {
    async status(_req: AuthRequest, res: Response) {
      return ok(res, {
        enabled: enabled(),
        limits: { minBundleSize: BUNDLE_SIZE_MIN, maxBundleSize: BUNDLE_SIZE_MAX, presets: BUNDLE_SIZE_PRESETS, minWeightOz: MIN_BUNDLE_WEIGHT_OZ },
      });
    },

    async getOne(req: AuthRequest, res: Response) {
      if (!gate(res)) return;
      try {
        const organizerId = await organizerIdFor(req, res);
        if (!organizerId) return;
        const itemId = idParam(req.params.itemId);
        if (!itemId) return fail(res, 404, BULK_EBAY_MESSAGES.BUNDLE_NOT_FOUND, 'BUNDLE_NOT_FOUND');
        return ok(res, await getBundleView(deps.db, { organizerId }, itemId));
      } catch (err) {
        return sendError(res, err, 'getOne');
      }
    },

    async save(req: AuthRequest, res: Response) {
      if (!gate(res)) return;
      try {
        const organizerId = await organizerIdFor(req, res);
        if (!organizerId) return;
        const itemId = idParam(req.params.itemId);
        if (!itemId) return fail(res, 404, BULK_EBAY_MESSAGES.BUNDLE_NOT_FOUND, 'BUNDLE_NOT_FOUND');
        const { view, sync } = await saveBundleSettings(deps.db, deps.ops, { organizerId }, itemId, req.body);
        return ok(res, { ...view, sync: { status: sync.status, action: sync.action, ok: sync.ok, message: sync.message } });
      } catch (err) {
        return sendError(res, err, 'save');
      }
    },

    async list(req: AuthRequest, res: Response) {
      if (!gate(res)) return;
      try {
        const organizerId = await organizerIdFor(req, res);
        if (!organizerId) return;
        const itemId = idParam(req.params.itemId);
        if (!itemId) return fail(res, 404, BULK_EBAY_MESSAGES.BUNDLE_NOT_FOUND, 'BUNDLE_NOT_FOUND');
        const { view, result } = await listBundleOnEbay(deps.db, deps.ops, { organizerId }, itemId);
        if (!result.ok) return fail(res, 422, result.message, 'BUNDLE_EBAY_FAILED', { view });
        return ok(res, view);
      } catch (err) {
        return sendError(res, err, 'list');
      }
    },

    async sync(req: AuthRequest, res: Response) {
      if (!gate(res)) return;
      try {
        const organizerId = await organizerIdFor(req, res);
        if (!organizerId) return;
        const itemId = idParam(req.params.itemId);
        if (!itemId) return fail(res, 404, BULK_EBAY_MESSAGES.BUNDLE_NOT_FOUND, 'BUNDLE_NOT_FOUND');
        const { view, sync } = await syncBundleNow(deps.db, deps.ops, { organizerId }, itemId);
        return ok(res, { ...view, sync: { status: sync.status, action: sync.action, ok: sync.ok, message: sync.message } });
      } catch (err) {
        return sendError(res, err, 'sync');
      }
    },
  };
}

export const bulkLotEbayHandlers = createBulkLotEbayHandlers({
  db: bundleDb as unknown as BulkLotEbayControllerDeps['db'], // the shared Prisma client (it also has organizer)
  ops: realBundleOps,
  env: process.env,
});
