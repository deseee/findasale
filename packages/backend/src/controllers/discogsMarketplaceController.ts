/**
 * discogsMarketplaceController.ts — HTTP layer for the Discogs connector
 * (services/marketplace/discogsListingConnector.ts). Mirrors
 * reverbMarketplaceController.ts's structure and ownership-check pattern.
 *
 * Auth model: organizer pastes their own Discogs Personal Access Token,
 * generated at discogs.com/settings/developers, over their own authenticated
 * FindA.Sale session — no OAuth callback route exists (see
 * discogsListingConnector.ts's file header for why). See
 * claude_docs/architecture/ADR-discogs-listing-connector-2026-08-24.md.
 *
 * Security posture (CLAUDE.md §9 Security-QA Gate — this is an "applicable
 * feature"): `resolveOwnedOrganizerAndItem` re-derives ownership from `userId`
 * on every item route; `createDiscogsListing`/`deleteDiscogsListing` in the
 * connector re-check `item.organizerId` again as defense in depth. The full
 * adversarial pass happens at QA time per the Security-QA Gate.
 *
 * UNTESTED end to end — no real Discogs listing has been created/verified yet
 * (CODE-ONLY, CLAUDE.md §9).
 */

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import {
  connectDiscogsAccount,
  disconnectDiscogsAccount,
  checkDiscogsConnection,
  createDiscogsListing,
  deleteDiscogsListing,
  checkDiscogsEligibility,
  DiscogsApiError,
  DiscogsNotEligibleError,
} from '../services/marketplace/discogsListingConnector';

/** Mirrors reverbMarketplaceController.ts's resolveOwnedOrganizerAndItem exactly — kept
 * as an independent copy (not cross-imported) so each platform stays independently
 * maintainable, same posture the Reverb file already takes. */
async function resolveOwnedOrganizerAndItem(userId: string, itemId: string) {
  const organizer = await prisma.organizer.findUnique({ where: { userId }, select: { id: true } });
  if (!organizer) return { organizer: null, item: null };
  const item = await prisma.item.findFirst({
    where: { id: itemId, OR: [{ organizerId: organizer.id }, { sale: { organizerId: organizer.id } }] },
  });
  return { organizer, item };
}

function respondDiscogsError(res: Response, error: any, fallbackMessage: string) {
  if (error instanceof DiscogsNotEligibleError) {
    res.status(422).json({ message: error.message, eligible: false });
    return;
  }
  if (error instanceof DiscogsApiError) {
    const httpStatus = error.status >= 400 && error.status < 500 ? error.status : 502;
    res.status(httpStatus).json({ message: error.message });
    return;
  }
  console.error('[Discogs]', fallbackMessage, error);
  res.status(500).json({ message: error?.message || fallbackMessage });
}

/**
 * POST /api/discogs/connect
 * Body: { personalAccessToken: string }
 */
export const connectDiscogsEndpoint = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }
    const organizer = await prisma.organizer.findUnique({ where: { userId } });
    if (!organizer) {
      res.status(404).json({ message: 'Organizer profile not found' });
      return;
    }
    const personalAccessToken = typeof req.body?.personalAccessToken === 'string' ? req.body.personalAccessToken : '';
    if (!personalAccessToken.trim()) {
      res.status(400).json({ message: 'personalAccessToken is required' });
      return;
    }
    const account = await connectDiscogsAccount(organizer.id, personalAccessToken);
    res.json({
      success: true,
      connected: account.status === 'ACTIVE',
      externalUserId: account.externalUserId,
    });
  } catch (error: any) {
    respondDiscogsError(res, error, 'Failed to connect Discogs account');
  }
};

/**
 * GET /api/discogs/connection
 */
export const getDiscogsConnectionStatus = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }
    const organizer = await prisma.organizer.findUnique({ where: { userId } });
    if (!organizer) {
      res.status(404).json({ message: 'Organizer profile not found' });
      return;
    }
    const status = await checkDiscogsConnection(organizer.id);
    res.json(status);
  } catch (error) {
    console.error('[Discogs] Connection status error:', error);
    res.status(500).json({ message: 'Failed to check Discogs connection' });
  }
};

/**
 * DELETE /api/discogs/connection
 */
export const disconnectDiscogs = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }
    const organizer = await prisma.organizer.findUnique({ where: { userId } });
    if (!organizer) {
      res.status(404).json({ message: 'Organizer profile not found' });
      return;
    }
    await disconnectDiscogsAccount(organizer.id);
    res.json({ success: true });
  } catch (error) {
    console.error('[Discogs] Disconnect error:', error);
    res.status(500).json({ message: 'Failed to disconnect Discogs' });
  }
};

/**
 * GET /api/discogs/items/:id/eligibility
 * Pre-check: does this item have a matching Discogs catalog release? Lets the
 * frontend show eligibility before the organizer attempts to push (a real,
 * permanent product constraint — see discogsListingConnector.ts's file header).
 */
export const getDiscogsEligibility = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }
    const itemId = req.params.id;
    const { organizer, item } = await resolveOwnedOrganizerAndItem(userId, itemId);
    if (!organizer) {
      res.status(404).json({ message: 'Organizer profile not found' });
      return;
    }
    if (!item) {
      res.status(404).json({ message: 'Item not found' });
      return;
    }
    const result = await checkDiscogsEligibility(organizer.id, item);
    res.json(result);
  } catch (error: any) {
    respondDiscogsError(res, error, 'Failed to check Discogs eligibility');
  }
};

/**
 * POST /api/discogs/items/:id/listing
 * Body: { publish?: boolean }
 */
export const pushItemToDiscogs = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }
    const itemId = req.params.id;
    const { organizer, item } = await resolveOwnedOrganizerAndItem(userId, itemId);
    if (!organizer) {
      res.status(404).json({ message: 'Organizer profile not found' });
      return;
    }
    if (!item) {
      res.status(404).json({ message: 'Item not found' });
      return;
    }
    const publish = req.body?.publish === true;
    const listing = await createDiscogsListing(organizer.id, item, { publish });
    res.json({ success: true, listing });
  } catch (error: any) {
    respondDiscogsError(res, error, 'Failed to create Discogs listing');
  }
};

/**
 * DELETE /api/discogs/items/:id/listing
 * Body: { discogsListingId: string } — FindA.Sale does not yet persist the
 * remote Discogs listing id anywhere (same gap Reverb's own controller notes
 * for its platform — a follow-up pass should persist listing ids).
 */
export const removeItemFromDiscogs = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }
    const itemId = req.params.id;
    const { organizer, item } = await resolveOwnedOrganizerAndItem(userId, itemId);
    if (!organizer) {
      res.status(404).json({ message: 'Organizer profile not found' });
      return;
    }
    if (!item) {
      res.status(404).json({ message: 'Item not found' });
      return;
    }
    const discogsListingId = typeof req.body?.discogsListingId === 'string' ? req.body.discogsListingId : null;
    if (!discogsListingId) {
      res.status(400).json({ message: 'discogsListingId is required' });
      return;
    }
    const result = await deleteDiscogsListing(organizer.id, discogsListingId);
    res.json({ success: true, ...result });
  } catch (error: any) {
    respondDiscogsError(res, error, 'Failed to delete Discogs listing');
  }
};
