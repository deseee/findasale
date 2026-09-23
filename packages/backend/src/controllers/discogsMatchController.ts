/**
 * discogsMatchController.ts -- ADR-132 HTTP layer: Discogs release matching, organizer
 * confirmation, record identity edits, per-item listing correction, and the rematch sweep.
 *
 * Security: every route is behind `authenticate` + `requireOrganizer` (admin sweep: `requireAdmin`).
 * The organizer is always derived from the JWT user (never from the request body), and every
 * item route re-checks ownership through resolveOwnedOrganizerAndItem before calling the
 * connector, which re-checks it again (loadOwnedItem). A foreign item id returns 404, the same
 * as a missing one (no IDOR / existence oracle). Pasted Discogs URLs are parsed strictly to a
 * numeric release id and are never fetched.
 */

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import {
  resolveDiscogsMatch,
  confirmDiscogsRelease,
  markItemNotInDiscogs,
  updateItemRecordIdentity,
  correctDiscogsListingRelease,
  runDiscogsRematchSweep,
  DiscogsApiError,
  DiscogsHttpError,
  DiscogsNotEligibleError,
} from '../services/marketplace/discogsListingConnector';

/** Same ownership pattern as discogsMarketplaceController.ts (independent copy by design). */
async function resolveOwnedOrganizerAndItem(userId: string, itemId: string) {
  const organizer = await prisma.organizer.findUnique({ where: { userId }, select: { id: true } });
  if (!organizer) return { organizer: null, item: null };
  const item = await prisma.item.findFirst({
    where: { id: itemId, OR: [{ organizerId: organizer.id }, { sale: { organizerId: organizer.id } }] },
    select: { id: true },
  });
  return { organizer, item };
}

function respond(res: Response, error: any, fallbackMessage: string) {
  if (error instanceof DiscogsHttpError) {
    res.status(error.httpStatus).json({ message: error.message, code: error.code });
    return;
  }
  if (error instanceof DiscogsNotEligibleError) {
    res.status(422).json({ message: error.message, code: 'not_eligible' });
    return;
  }
  if (error instanceof DiscogsApiError) {
    const httpStatus = error.status >= 400 && error.status < 500 ? error.status : 502;
    res.status(httpStatus).json({ message: error.message, code: 'discogs_api_error' });
    return;
  }
  console.error('[DiscogsMatch]', fallbackMessage, error);
  res.status(500).json({ message: fallbackMessage });
}

/** Resolves the caller's organizer + owned item, or writes the 401/404 and returns null. */
async function ownedItemOr404(req: AuthRequest, res: Response): Promise<{ organizerId: string; itemId: string } | null> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ message: 'Authentication required' });
    return null;
  }
  const itemId = typeof req.params.id === 'string' ? req.params.id : '';
  if (!itemId || itemId.length > 64) {
    res.status(404).json({ message: 'Item not found' });
    return null;
  }
  const { organizer, item } = await resolveOwnedOrganizerAndItem(userId, itemId);
  if (!organizer) {
    res.status(404).json({ message: 'Organizer profile not found' });
    return null;
  }
  if (!item) {
    res.status(404).json({ message: 'Item not found' });
    return null;
  }
  return { organizerId: organizer.id, itemId: item.id };
}

/** GET /api/discogs/items/:id/match */
export const getDiscogsMatch = async (req: AuthRequest, res: Response) => {
  try {
    const owned = await ownedItemOr404(req, res);
    if (!owned) return;
    const match = await resolveDiscogsMatch(owned.organizerId, owned.itemId);
    res.json({ match });
  } catch (error) {
    respond(res, error, 'Failed to load the Discogs match');
  }
};

/** POST /api/discogs/items/:id/match/rerun   Body: { reset?: boolean } */
export const rerunDiscogsMatch = async (req: AuthRequest, res: Response) => {
  try {
    const owned = await ownedItemOr404(req, res);
    if (!owned) return;
    const reset = req.body?.reset === true;
    const match = await resolveDiscogsMatch(owned.organizerId, owned.itemId, { force: true, reset });
    res.json({ match });
  } catch (error) {
    respond(res, error, 'Failed to re-run the Discogs match');
  }
};

/** POST /api/discogs/items/:id/match/select   Body: { releaseId: number } | { url: string }, optional applyToListing */
export const selectDiscogsRelease = async (req: AuthRequest, res: Response) => {
  try {
    const owned = await ownedItemOr404(req, res);
    if (!owned) return;
    const body = req.body ?? {};
    const match = await confirmDiscogsRelease(owned.organizerId, owned.itemId, {
      releaseId: body.releaseId,
      url: body.url,
    });
    let correction: any = null;
    if (body.applyToListing === true && match.listing.listingId) {
      try {
        correction = await correctDiscogsListingRelease(owned.organizerId, owned.itemId);
      } catch (err: any) {
        correction = {
          action: 'failed',
          code: err instanceof DiscogsHttpError ? err.code : 'correction_failed',
          message: err?.message || 'Could not fix the Discogs listing',
        };
      }
    }
    const fresh = correction ? await resolveDiscogsMatch(owned.organizerId, owned.itemId) : match;
    res.json({ match: fresh, correction });
  } catch (error) {
    respond(res, error, 'Failed to confirm the Discogs release');
  }
};

/** POST /api/discogs/items/:id/match/not-in-discogs */
export const markNotInDiscogs = async (req: AuthRequest, res: Response) => {
  try {
    const owned = await ownedItemOr404(req, res);
    if (!owned) return;
    const match = await markItemNotInDiscogs(owned.organizerId, owned.itemId);
    res.json({ match, hasListing: !!match.listing.listingId });
  } catch (error) {
    respond(res, error, 'Failed to update the Discogs match');
  }
};

/** PUT /api/discogs/items/:id/record-identity   Body: { artist?, releaseTitle?, label?, catalogNumber?, year?, format? } */
export const putRecordIdentity = async (req: AuthRequest, res: Response) => {
  try {
    const owned = await ownedItemOr404(req, res);
    if (!owned) return;
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      res.status(400).json({ message: 'Body must be an object', code: 'invalid_record_identity' });
      return;
    }
    const match = await updateItemRecordIdentity(owned.organizerId, owned.itemId, body);
    res.json({ match });
  } catch (error) {
    respond(res, error, 'Failed to save the record details');
  }
};

/** POST /api/discogs/items/:id/listing/correct -- runs the correction for THIS item only. */
export const correctDiscogsListing = async (req: AuthRequest, res: Response) => {
  try {
    const owned = await ownedItemOr404(req, res);
    if (!owned) return;
    const correction = await correctDiscogsListingRelease(owned.organizerId, owned.itemId);
    const match = await resolveDiscogsMatch(owned.organizerId, owned.itemId);
    res.json({ correction, match });
  } catch (error) {
    respond(res, error, 'Failed to fix the Discogs listing');
  }
};

function sweepOptions(body: any) {
  return {
    dryRun: body?.dryRun !== false, // default: dry run
    limit: typeof body?.limit === 'number' ? body.limit : undefined,
    offset: typeof body?.offset === 'number' ? body.offset : undefined,
  };
}

/** POST /api/discogs/match/sweep -- the caller's own items only. Body: { dryRun?: boolean=true, limit?: 1-25, offset?: number } */
export const sweepOwnDiscogsMatches = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }
    const organizer = await prisma.organizer.findUnique({ where: { userId }, select: { id: true } });
    if (!organizer) {
      res.status(404).json({ message: 'Organizer profile not found' });
      return;
    }
    const report = await runDiscogsRematchSweep({ organizerId: organizer.id, ...sweepOptions(req.body) });
    res.json(report);
  } catch (error) {
    respond(res, error, 'Discogs rematch sweep failed');
  }
};

/** POST /api/discogs/admin/match/sweep -- ADMIN only. Body: { organizerId?: string, dryRun?: boolean=true, limit?, offset? } */
export const adminSweepDiscogsMatches = async (req: AuthRequest, res: Response) => {
  try {
    const rawOrganizerId = req.body?.organizerId;
    if (rawOrganizerId !== undefined && rawOrganizerId !== null && rawOrganizerId !== '' &&
        (typeof rawOrganizerId !== 'string' || rawOrganizerId.length > 64)) {
      res.status(400).json({ message: 'organizerId must be a string of at most 64 characters' });
      return;
    }
    const organizerId = typeof rawOrganizerId === 'string' && rawOrganizerId ? rawOrganizerId : null;
    const report = await runDiscogsRematchSweep({ organizerId, ...sweepOptions(req.body) });
    res.json(report);
  } catch (error) {
    respond(res, error, 'Discogs rematch sweep failed');
  }
};
