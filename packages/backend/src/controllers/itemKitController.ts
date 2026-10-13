/**
 * Kit routes' handlers (kits / bundles, Phase 1, 2026-10-16). Mounted at /api/kits by routes/itemKits.ts.
 *
 *   GET    /candidates?saleId=&q=   organizer: items that can go in a kit
 *   GET    /?saleId=                organizer: the organizer's kits (optionally one sale's)
 *   GET    /by-component/:itemId    organizer: the kits that contain this item
 *   POST   /                        organizer: create a kit { title, description?, price, saleId?, components: [{ itemId, quantity }] }
 *   POST   /convert/:itemId         organizer: turn an existing ordinary item into a kit in place { components: [{ itemId, quantity }] }
 *   GET    /:kitId                  organizer: one kit with live component stock
 *   PUT    /:kitId                  organizer: edit name / description / price / components (components locked once the kit has sold)
 *   POST   /:kitId/recompute        organizer: re-derive the kit's stock from its components now
 *   DELETE /:kitId                  organizer: archive (soft delete) the kit
 *
 * The organizer id always comes from the logged-in account, never from the request. Envelope: { success, data } or { success: false, error, code }.
 */
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { archiveKit, convertItemToKit, createKit, getKit, isKitError, listKitCandidates, listKits, listKitsForComponent, refreshKit, updateKit } from '../services/itemKitService';

function fail(res: Response, status: number, error: string, code: string, extra?: Record<string, unknown>): Response {
  return res.status(status).json({ success: false, error, code, ...(extra ?? {}) });
}

function sendError(res: Response, err: unknown, where: string): Response {
  if (isKitError(err)) return fail(res, err.status, err.message, err.code, err.extra);
  console.error(`[itemKits] ${where} error:`, err);
  return fail(res, 500, 'Something went wrong. Please try again.', 'SERVER_ERROR');
}

function idParam(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= 64 ? value : null;
}

async function organizerIdFor(req: AuthRequest, res: Response): Promise<string | null> {
  const userId = req.user?.id;
  if (!userId) {
    fail(res, 401, 'Sign in to manage kits.', 'UNAUTHORIZED');
    return null;
  }
  const organizer = await prisma.organizer.findUnique({ where: { userId }, select: { id: true } });
  if (!organizer) {
    fail(res, 403, 'Organizer access required.', 'FORBIDDEN');
    return null;
  }
  return organizer.id;
}

export const itemKitHandlers = {
  async candidates(req: AuthRequest, res: Response) {
    try {
      const organizerId = await organizerIdFor(req, res);
      if (!organizerId) return res;
      const saleId = idParam(req.query.saleId);
      const q = typeof req.query.q === 'string' ? req.query.q : null;
      const items = await listKitCandidates(organizerId, { saleId, q });
      return res.json({ success: true, data: { items } });
    } catch (err) {
      return sendError(res, err, 'candidates');
    }
  },

  async byComponent(req: AuthRequest, res: Response) {
    try {
      const organizerId = await organizerIdFor(req, res);
      if (!organizerId) return res;
      const itemId = idParam(req.params.itemId);
      if (!itemId) return fail(res, 404, 'Item not found.', 'ITEM_NOT_FOUND');
      return res.json({ success: true, data: { kits: await listKitsForComponent(organizerId, itemId) } });
    } catch (err) {
      return sendError(res, err, 'byComponent');
    }
  },

  async list(req: AuthRequest, res: Response) {
    try {
      const organizerId = await organizerIdFor(req, res);
      if (!organizerId) return res;
      const kits = await listKits(organizerId, idParam(req.query.saleId));
      return res.json({ success: true, data: { kits } });
    } catch (err) {
      return sendError(res, err, 'list');
    }
  },

  async create(req: AuthRequest, res: Response) {
    try {
      const organizerId = await organizerIdFor(req, res);
      if (!organizerId) return res;
      const kit = await createKit(organizerId, req.body);
      return res.status(201).json({ success: true, data: { kit } });
    } catch (err) {
      return sendError(res, err, 'create');
    }
  },

  async convert(req: AuthRequest, res: Response) {
    try {
      const organizerId = await organizerIdFor(req, res);
      if (!organizerId) return res;
      const itemId = idParam(req.params.itemId);
      if (!itemId) return fail(res, 404, 'Item not found.', 'ITEM_NOT_FOUND');
      const kit = await convertItemToKit(organizerId, itemId, req.body?.components);
      return res.json({ success: true, data: { kit } });
    } catch (err) {
      return sendError(res, err, 'convert');
    }
  },

  async getOne(req: AuthRequest, res: Response) {
    try {
      const organizerId = await organizerIdFor(req, res);
      if (!organizerId) return res;
      const kitId = idParam(req.params.kitId);
      if (!kitId) return fail(res, 404, 'Kit not found.', 'KIT_NOT_FOUND');
      return res.json({ success: true, data: { kit: await getKit(organizerId, kitId) } });
    } catch (err) {
      return sendError(res, err, 'getOne');
    }
  },

  async update(req: AuthRequest, res: Response) {
    try {
      const organizerId = await organizerIdFor(req, res);
      if (!organizerId) return res;
      const kitId = idParam(req.params.kitId);
      if (!kitId) return fail(res, 404, 'Kit not found.', 'KIT_NOT_FOUND');
      return res.json({ success: true, data: { kit: await updateKit(organizerId, kitId, req.body) } });
    } catch (err) {
      return sendError(res, err, 'update');
    }
  },

  async recompute(req: AuthRequest, res: Response) {
    try {
      const organizerId = await organizerIdFor(req, res);
      if (!organizerId) return res;
      const kitId = idParam(req.params.kitId);
      if (!kitId) return fail(res, 404, 'Kit not found.', 'KIT_NOT_FOUND');
      return res.json({ success: true, data: { kit: await refreshKit(organizerId, kitId) } });
    } catch (err) {
      return sendError(res, err, 'recompute');
    }
  },

  async archive(req: AuthRequest, res: Response) {
    try {
      const organizerId = await organizerIdFor(req, res);
      if (!organizerId) return res;
      const kitId = idParam(req.params.kitId);
      if (!kitId) return fail(res, 404, 'Kit not found.', 'KIT_NOT_FOUND');
      await archiveKit(organizerId, kitId);
      return res.json({ success: true, data: { archived: true } });
    } catch (err) {
      return sendError(res, err, 'archive');
    }
  },
};
