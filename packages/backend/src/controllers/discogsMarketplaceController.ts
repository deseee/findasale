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
 * Body: { publish?: boolean, allowOffers?: boolean }
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
    // 2026-09-03: Discogs's own "Allow offers" toggle -- a real, documented API param
    // (allow_offers), organizer opt-in per push, same pattern as `publish` just above.
    const allowOffers = req.body?.allowOffers === true;
    const listing = await createDiscogsListing(organizer.id, item, { publish, allowOffers });
    // 2026-08-27: persist the real Discogs listing id so the frontend can show "already
    // pushed" on a later page load instead of forgetting the moment the organizer refreshes.
    // listing_id is Discogs' own documented Marketplace API field name (POST
    // /marketplace/listings response) -- createDiscogsListing returns the raw parsed API
    // response untyped (Promise<any>), so this is read defensively rather than assumed.
    const discogsListingId = listing && listing.listing_id != null ? String(listing.listing_id) : null;
    if (discogsListingId) {
      await prisma.item.update({
        where: { id: item.id },
        data: { discogsListingId, discogsListedAt: new Date() },
      }).catch((e) => {
        // Non-fatal: the real Discogs listing already exists at this point: failing the
        // whole request over a persistence write would leave the organizer thinking the
        // push itself failed when it didn't.
        console.error('[Discogs] Failed to persist discogsListingId after a successful push:', e);
      });
    }
    res.json({ success: true, listing });
  } catch (error: any) {
    respondDiscogsError(res, error, 'Failed to create Discogs listing');
  }
};

/**
 * DELETE /api/discogs/items/:id/listing
 * Body: { discogsListingId: string } — the caller still supplies it explicitly (mirrors
 * Reverb's own controller) rather than trusting Item.discogsListingId server-side, since the
 * frontend already has it in hand from the item fetch and this keeps the endpoint usable even
 * if persistence ever falls out of sync. 2026-08-27: Item.discogsListingId/discogsListedAt now
 * ARE persisted (see pushItemToDiscogs above) and are cleared here on a successful delete.
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
    // 2026-08-27: clear the persisted fields on a successful delete so the frontend goes back
    // to showing the eligibility/push UI instead of a stale "already pushed" state.
    await prisma.item.update({
      where: { id: item.id },
      data: { discogsListingId: null, discogsListedAt: null },
    }).catch((e) => {
      console.error('[Discogs] Failed to clear discogsListingId after a successful delete:', e);
    });
    res.json({ success: true, ...result });
  } catch (error: any) {
    respondDiscogsError(res, error, 'Failed to delete Discogs listing');
  }
};
