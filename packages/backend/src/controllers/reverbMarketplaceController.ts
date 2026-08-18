/**
 * reverbMarketplaceController.ts — HTTP layer for the Reverb connector
 * (services/marketplace/reverbConnector.ts). Extends extensionController.ts's
 * assertItemOwned ownership-check pattern.
 *
 * CORRECTED 2026-08-18 (same session, later pass) — see reverbConnector.ts's file header.
 * Reverb has no self-serve multi-tenant OAuth path; every route below is `authenticate` +
 * `requireOrganizer` gated (there is no public OAuth-callback route anymore — the organizer
 * pastes their own Reverb Personal Access Token directly into POST /connect, over their own
 * authenticated FindA.Sale session, so the HMAC-signed-state CSRF pattern eBay's callback
 * needs doesn't apply here at all).
 *
 * Security posture (CLAUDE.md §9 Security-QA Gate — this is an "applicable feature": it
 * touches a real connected marketplace credential + writes to a third-party marketplace on
 * an organizer's behalf). `resolveOwnedOrganizerAndItem` below re-derives ownership from
 * `userId` on every item route, and `createReverbListing`/`endOrDeleteReverbListing` in the
 * connector re-check `item.organizerId` again as defense in depth. The full adversarial pass
 * (anonymous access, wrong-role/cross-tenant, resource-state gating, actor≠target) happens
 * at QA time per the Security-QA Gate — this dev pass only lays the ownership-check
 * groundwork QA will verify.
 *
 * UNTESTED end to end — see reverbConnector.ts's file header. No real Reverb listing has
 * been created/verified yet.
 */

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import {
  connectReverbAccount,
  disconnectReverbAccount,
  checkReverbConnection,
  createReverbListing,
  endOrDeleteReverbListing,
  ReverbApiError,
} from '../services/marketplace/reverbConnector';

/**
 * Verify an item belongs to the requesting organizer. Mirrors extensionController.ts's
 * assertItemOwned pattern, extended to also match Items that are denormalized directly to
 * the organizer (Item.organizerId, used for inventory items with no active sale) as well as
 * items reached via their current sale's organizerId.
 */
async function resolveOwnedOrganizerAndItem(userId: string, itemId: string) {
  const organizer = await prisma.organizer.findUnique({ where: { userId }, select: { id: true } });
  if (!organizer) return { organizer: null, item: null };
  const item = await prisma.item.findFirst({
    where: { id: itemId, OR: [{ organizerId: organizer.id }, { sale: { organizerId: organizer.id } }] },
  });
  return { organizer, item };
}

function respondReverbError(res: Response, error: any, fallbackMessage: string) {
  if (error instanceof ReverbApiError) {
    const httpStatus = error.status >= 400 && error.status < 500 ? error.status : 502;
    res.status(httpStatus).json({ message: error.message, errors: error.fieldErrors });
    return;
  }
  console.error('[Reverb]', fallbackMessage, error);
  res.status(500).json({ message: error?.message || fallbackMessage });
}

/**
 * POST /api/reverb/connect
 * Body: { personalAccessToken: string }
 * Connect the calling organizer's Reverb account using a Personal Access Token they
 * generated themselves on reverb.com (My Profile -> API & Integrations -> Generate New
 * Token). Authenticated + organizer-scoped — no public callback route exists for Reverb
 * (see file header "CORRECTED 2026-08-18").
 */
export const connectReverbEndpoint = async (req: AuthRequest, res: Response) => {
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

    const account = await connectReverbAccount(organizer.id, personalAccessToken);
    res.json({
      success: true,
      connected: account.status === 'ACTIVE',
      externalUserId: account.externalUserId,
    });
  } catch (error: any) {
    respondReverbError(res, error, 'Failed to connect Reverb account');
  }
};

/**
 * GET /api/reverb/connection
 * Return connection status for the calling organizer.
 */
export const getReverbConnectionStatus = async (req: AuthRequest, res: Response) => {
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
    const status = await checkReverbConnection(organizer.id);
    res.json(status);
  } catch (error) {
    console.error('[Reverb] Connection status error:', error);
    res.status(500).json({ message: 'Failed to check Reverb connection' });
  }
};

/**
 * DELETE /api/reverb/connection
 * Disconnect the calling organizer's Reverb account.
 */
export const disconnectReverb = async (req: AuthRequest, res: Response) => {
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
    await disconnectReverbAccount(organizer.id);
    res.json({ success: true });
  } catch (error) {
    console.error('[Reverb] Disconnect error:', error);
    res.status(500).json({ message: 'Failed to disconnect Reverb' });
  }
};

/**
 * POST /api/reverb/items/:id/listing
 * Push a FindA.Sale item to Reverb as a listing (draft by default — see
 * ReverbListingOptions.publish doc comment in reverbConnector.ts).
 * Body: { publish?: boolean, reverbCategoryUuid?: string }
 */
export const pushItemToReverb = async (req: AuthRequest, res: Response) => {
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
    const reverbCategoryUuid = typeof req.body?.reverbCategoryUuid === 'string' ? req.body.reverbCategoryUuid : undefined;

    const listing = await createReverbListing(organizer.id, item, { publish, reverbCategoryUuid });
    res.json({ success: true, listing });
  } catch (error: any) {
    respondReverbError(res, error, 'Failed to create Reverb listing');
  }
};

/**
 * DELETE /api/reverb/items/:id/listing
 * End or delete the item's Reverb listing (drafts are hard-deleted; published listings are
 * zeroed out — see endOrDeleteReverbListing's doc comment in reverbConnector.ts).
 * Body: { reverbListingId: string } — FindA.Sale does not yet persist the remote Reverb
 * listing id anywhere (no MarketplaceListingJob-style row exists yet for this official-API
 * tier — out of scope for this pass per the ADR addendum's "no code dispatched" scope note).
 * A follow-up pass should persist listing ids the same way MarketplaceListingJob does for
 * the content-script tier; until then the caller must supply the id.
 */
export const removeItemFromReverb = async (req: AuthRequest, res: Response) => {
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

    const reverbListingId = typeof req.body?.reverbListingId === 'string' ? req.body.reverbListingId : null;
    if (!reverbListingId) {
      res.status(400).json({ message: 'reverbListingId is required' });
      return;
    }

    const result = await endOrDeleteReverbListing(organizer.id, reverbListingId);
    res.json({ success: true, ...result });
  } catch (error: any) {
    respondReverbError(res, error, 'Failed to end/delete Reverb listing');
  }
};
