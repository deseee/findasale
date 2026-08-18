/**
 * reverbMarketplaceController.ts — HTTP layer for the Reverb connector
 * (services/marketplace/reverbConnector.ts). Mirrors ebayController.ts's OAuth
 * connect/callback pattern (signed-state CSRF protection) and extensionController.ts's
 * assertItemOwned ownership-check pattern.
 *
 * Security posture (CLAUDE.md §9 Security-QA Gate — this is an "applicable feature": it
 * touches a real OAuth connection + writes to a third-party marketplace on an organizer's
 * behalf). Every route below either (a) is `authenticate` + `requireOrganizer` gated and
 * resolves the organizer strictly from the JWT subject (never a client-supplied id), or (b)
 * is the OAuth callback, which is necessarily public (Reverb's browser redirect carries no
 * FindA.Sale session) but is HMAC-signed + timing-safe-verified exactly like eBay's callback.
 * `resolveOwnedOrganizerAndItem` below re-derives ownership from `userId` on every item
 * route, and `createReverbListing`/`endOrDeleteReverbListing` in the connector re-check
 * `item.organizerId` again as defense in depth. The full adversarial pass (anonymous access,
 * wrong-role/cross-tenant, resource-state gating, actor≠target) happens at QA time per the
 * Security-QA Gate — this dev pass only lays the ownership-check groundwork QA will verify.
 *
 * UNTESTED end to end — see reverbConnector.ts's file header. No live Reverb OAuth
 * credentials exist yet.
 */

import crypto from 'crypto';
import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import {
  buildReverbAuthorizeUrl,
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
 * GET /api/reverb/connect
 * Build the Reverb OAuth2 authorize URL for the calling organizer. Signed-state pattern
 * copied verbatim from ebayController.connectEbayAccount (same forgery rationale — the
 * callback is a public route with no session cookie, so an unsigned state would let an
 * attacker bind an arbitrary Reverb account to any victim organizerId).
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

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('[Reverb] JWT_SECRET missing — cannot sign OAuth state');
      res.status(500).json({ message: 'Server misconfigured (missing JWT_SECRET)' });
      return;
    }
    const nonce = crypto.randomBytes(16).toString('hex');
    const statePayload = { organizerId: organizer.id, nonce, iat: Date.now() };
    const payloadStr = JSON.stringify(statePayload);
    const stateSig = crypto.createHmac('sha256', jwtSecret).update(payloadStr).digest('base64url');
    const stateToken = `${Buffer.from(payloadStr).toString('base64url')}.${stateSig}`;

    const redirectUrl = buildReverbAuthorizeUrl(stateToken);
    res.json({ redirectUrl });
  } catch (error) {
    console.error('[Reverb] Connect error:', error);
    res.status(500).json({ message: 'Failed to initiate Reverb OAuth' });
  }
};

/**
 * GET /api/reverb/callback — PUBLIC endpoint, Reverb redirects here without a FindA.Sale
 * JWT. Organizer id is encoded + HMAC-signed in `state` (set in connectReverbEndpoint
 * above). Signature verification copied verbatim from ebayController.ebayOAuthCallback.
 */
export const reverbOAuthCallback = async (req: Request, res: Response) => {
  try {
    const { code, state } = req.query as { code?: string; state?: string };
    if (!code) {
      res.status(400).json({ message: 'Authorization code missing' });
      return;
    }
    if (!state) {
      res.status(400).json({ message: 'State parameter missing' });
      return;
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('[Reverb] JWT_SECRET missing — cannot verify OAuth state');
      res.status(500).json({ message: 'Server misconfigured (missing JWT_SECRET)' });
      return;
    }
    const dotIdx = state.lastIndexOf('.');
    if (dotIdx <= 0 || dotIdx === state.length - 1) {
      res.status(400).json({ message: 'Invalid state parameter' });
      return;
    }
    const encodedPayload = state.slice(0, dotIdx);
    const providedSig = state.slice(dotIdx + 1);

    let statePayload: { organizerId: string; nonce: string; iat: number };
    let payloadStr: string;
    try {
      payloadStr = Buffer.from(encodedPayload, 'base64url').toString('utf-8');
      statePayload = JSON.parse(payloadStr);
    } catch (e) {
      console.error('[Reverb] Failed to decode state parameter:', e);
      res.status(400).json({ message: 'Invalid state parameter' });
      return;
    }

    const expectedSig = crypto.createHmac('sha256', jwtSecret).update(payloadStr).digest('base64url');
    const providedSigBuf = Buffer.from(providedSig);
    const expectedSigBuf = Buffer.from(expectedSig);
    if (providedSigBuf.length !== expectedSigBuf.length || !crypto.timingSafeEqual(providedSigBuf, expectedSigBuf)) {
      console.warn('[Reverb] OAuth state signature mismatch — possible forgery attempt');
      res.status(400).json({ message: 'Invalid state signature' });
      return;
    }

    const stateAge = Date.now() - statePayload.iat;
    if (stateAge > 10 * 60 * 1000) {
      res.status(400).json({ message: 'State parameter expired' });
      return;
    }

    const organizer = await prisma.organizer.findUnique({ where: { id: statePayload.organizerId } });
    if (!organizer) {
      res.status(404).json({ message: 'Organizer not found' });
      return;
    }

    await connectReverbAccount(organizer.id, code);

    const frontendUrl = process.env.FRONTEND_URL ?? 'https://finda.sale';
    res.redirect(`${frontendUrl}/organizer/settings?reverb_connected=true`);
  } catch (error) {
    console.error('[Reverb] OAuth callback error:', error);
    const frontendUrl = process.env.FRONTEND_URL ?? 'https://finda.sale';
    res.redirect(`${frontendUrl}/organizer/settings?reverb_connected=false`);
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
