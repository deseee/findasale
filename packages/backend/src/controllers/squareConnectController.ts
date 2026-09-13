import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { encryptToken } from '../utils/tokenCrypto';
import {
  buildSquareAuthorizeUrl,
  decodeSquareOAuthState,
  exchangeSquareAuthorizationCode,
  getSquareAccountStatus,
  fetchAndCheckSquareBankFingerprints,
  isPayoutFlaggedForReview,
  type SquareOnboardingOwnerType,
} from '../services/squareConnectService';
// Booth-lifecycle notification (2026-09-09, Square changeover parity fix): the VENDOR_BOOTH
// branch below previously updated squareOnboarded with no false->true edge check and no
// organizer notification at all -- the Stripe equivalent (getVendorBoothStripeStatus /
// startVendorBoothStripeOnboarding) has always told the hub organizer when a vendor finishes
// onboarding. See the VENDOR_BOOTH branch below for the edge-check this mirrors from
// getVendorBoothStripeStatus's poll-based version, adapted for a single OAuth callback.
import { notifyOrganizerBoothSquareConnected } from '../services/vendorBoothLifecycleNotificationService';
import { resolveAndBackfillSquareLocationId } from '../services/squarePosPaymentAdapter';

/**
 * Square Connect-Equivalent Onboarding Controller
 * (2026-09-07, Square-replaces-Stripe migration, Wave 1 dispatch #2)
 *
 * Mirrors stripeConnectController.ts's SHAPE -- organizer/consignor/hub-owner onboarding
 * all in one controller (vendor-booth-operator's own onboard/status endpoints live in
 * vendorBoothController.ts instead, mirroring exactly where Stripe's booth-operator
 * onboarding already lives -- but the actual OAuth code exchange for ALL FOUR owner types,
 * including booth operators, is centralized in ONE shared handleSquareConnectCallback below.
 * This is a deliberate design difference from Stripe, not an oversight: Square's OAuth app
 * has exactly ONE fixed redirect URL registered in the Developer Dashboard (unlike Stripe's
 * accountLinks, which take an explicit return_url per call) -- so every onboarding flow
 * must land on the same callback shape, and `state` (see squareConnectService.ts) carries
 * which owner row to act on.
 *
 * TOKEN PERSISTENCE (RESOLVED 2026-09-07, Wave 0.5): handleSquareConnectCallback below now
 * persists the OAuth access/refresh token (encrypted via utils/tokenCrypto.ts) alongside the
 * identity fields (squareMerchantId/squareLocationId/squareOnboarded) for all three owner
 * types -- see squareConnectService.ts's own header comment for the historical context on why
 * this was previously deferred and the two options that were considered (this dispatch
 * implemented Option 1 from squarePaymentService.ts's resolveOrganizerSquareAccessToken: a
 * parallel encrypted-columns-per-owner-model approach, not a shared token table).
 */


// ---------------------------------------------------------------------------
// Organizer's own onboarding (their own sale-payout Square identity)
// ---------------------------------------------------------------------------

// GET /api/square-connect/organizer/status
export const getSquareOrganizerStatus = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const organizer = await prisma.organizer.findFirst({ where: { userId } });
    if (!organizer) return res.status(404).json({ message: 'Organizer not found.' });

    return res.json({
      squareMerchantId: organizer.squareMerchantId,
      squareOnboarded: organizer.squareOnboarded,
      squareLocationId: organizer.squareLocationId,
      payoutsFlaggedForReview: organizer.payoutsFlaggedForReview,
    });
  } catch (error) {
    console.error('getSquareOrganizerStatus error:', error);
    return res.status(500).json({ message: 'Failed to fetch Square status.' });
  }
};

// POST /api/square-connect/organizer/onboard
export const initiateSquareOrganizerOnboarding = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const organizer = await prisma.organizer.findFirst({ where: { userId } });
    if (!organizer) return res.status(404).json({ message: 'Organizer not found.' });

    if (organizer.squareOnboarded && organizer.squareMerchantId) {
      // Self-heal (2026-09-13, "organizer not finished connecting Square" bug fix):
      // squareOnboarded+squareMerchantId being true here does NOT guarantee
      // squareLocationId is set -- see squarePosPaymentAdapter.ts's preflightAccountStatus
      // doc comment for why that field can be permanently null despite a genuinely
      // completed OAuth handshake. Best-effort attempt to backfill it here too, so this
      // organizer-facing "are you connected" status endpoint self-heals the same gap
      // POS payments do, rather than only ever fixing it the first time a payment is
      // attempted. Never blocks or changes the alreadyOnboarded verdict on failure --
      // squareOnboarded+squareMerchantId are the real, permanent OAuth-complete facts;
      // this is purely a best-effort assist for the DOWNSTREAM squareLocationId gap.
      if (!organizer.squareLocationId) {
        try {
          await resolveAndBackfillSquareLocationId({
            id: organizer.id,
            squareMerchantId: organizer.squareMerchantId,
            squareOnboarded: organizer.squareOnboarded,
          });
        } catch (backfillErr) {
          console.error('initiateSquareOrganizerOnboarding squareLocationId backfill failed:', backfillErr);
        }
      }
      // Last-known-cached state only -- see resolveExistingSquareIdentityForUser's own
      // comment in squareConnectService.ts for why this cannot live-verify against Square.
      return res.json({ alreadyOnboarded: true, squareMerchantId: organizer.squareMerchantId });
    }

    const { url } = buildSquareAuthorizeUrl('ORGANIZER', organizer.id, userId);
    return res.json({ onboardingUrl: url, alreadyOnboarded: false });
  } catch (error) {
    console.error('initiateSquareOrganizerOnboarding error:', error);
    return res.status(500).json({ message: 'Failed to start Square onboarding.' });
  }
};

// ---------------------------------------------------------------------------
// Consignor onboarding
// ---------------------------------------------------------------------------

// GET /api/square-connect/consignor/:consignorId/status
export const getConsignorSquarePayoutStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { consignorId } = req.params;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const consignor = await prisma.consignor.findFirst({
      where: { id: consignorId, workspace: { owner: { userId } } },
    });
    if (!consignor) return res.status(404).json({ message: 'Consignor not found or access denied.' });

    return res.json({
      consignorId: consignor.id,
      squareAccountId: consignor.squareAccountId,
      squareOnboarded: consignor.squareOnboarded,
      payoutsFlaggedForReview: consignor.payoutsFlaggedForReview,
    });
  } catch (error) {
    console.error('getConsignorSquarePayoutStatus error:', error);
    return res.status(500).json({ message: 'Failed to fetch consignor Square status.' });
  }
};

// POST /api/square-connect/consignor/:consignorId/onboard
export const initiateConsignorSquareOnboarding = async (req: AuthRequest, res: Response) => {
  try {
    const { consignorId } = req.params;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const consignor = await prisma.consignor.findFirst({
      where: { id: consignorId, workspace: { owner: { userId } } },
    });
    if (!consignor) return res.status(404).json({ message: 'Consignor not found or access denied.' });

    if (consignor.squareOnboarded && consignor.squareAccountId) {
      return res.json({ alreadyOnboarded: true, squareAccountId: consignor.squareAccountId });
    }

    const { url } = buildSquareAuthorizeUrl('CONSIGNOR', consignor.id, userId);
    return res.json({ onboardingUrl: url, alreadyOnboarded: false });
  } catch (error) {
    console.error('initiateConsignorSquareOnboarding error:', error);
    return res.status(500).json({ message: 'Failed to start consignor Square onboarding.' });
  }
};

// ---------------------------------------------------------------------------
// Hub-owner onboarding -- ADR-090 SS1 equivalent: reuses the ORGANIZER's own Square
// identity (squareMerchantId), same as Stripe's hub-owner flow reuses stripeConnectId.
// There is no second Connect-equivalent identity for hub-owner revenue-share payouts --
// this is a deliberate design choice mirroring the existing Stripe precedent exactly, not
// a simplification. These two endpoints only add the "does this user own a SaleHub" gate
// before delegating to the SAME organizer-level onboarding as above.
// ---------------------------------------------------------------------------

// GET /api/square-connect/hub-owner/status
export const getHubOwnerSquareStatus = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const organizer = await prisma.organizer.findFirst({ where: { userId } });
    if (!organizer) return res.status(404).json({ message: 'Organizer not found.' });

    const ownsHub = await prisma.saleHub.findFirst({ where: { organizerId: organizer.id }, select: { id: true } });
    if (!ownsHub) return res.status(404).json({ message: 'You do not own a hub yet.' });

    return res.json({
      onboarded: organizer.squareOnboarded,
      needsAccount: !organizer.squareMerchantId,
      squareMerchantId: organizer.squareMerchantId,
    });
  } catch (error) {
    console.error('getHubOwnerSquareStatus error:', error);
    return res.status(500).json({ message: 'Failed to fetch hub owner Square status.' });
  }
};

// POST /api/square-connect/hub-owner/onboard
export const initiateHubOwnerSquareOnboarding = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const organizer = await prisma.organizer.findFirst({ where: { userId } });
    if (!organizer) return res.status(404).json({ message: 'Organizer not found.' });

    const ownsHub = await prisma.saleHub.findFirst({ where: { organizerId: organizer.id }, select: { id: true } });
    if (!ownsHub) return res.status(404).json({ message: 'You do not own a hub yet.' });

    if (organizer.squareOnboarded && organizer.squareMerchantId) {
      // Square has no documented equivalent to Stripe's accounts.createLoginLink (one-click
      // hosted-dashboard access) -- flagged as a real, small gap rather than fabricating an
      // API call that doesn't exist. The vendor/organizer can log into squareup.com directly.
      return res.json({ alreadyOnboarded: true, squareMerchantId: organizer.squareMerchantId });
    }

    // Same underlying Square identity as the organizer's own onboarding above -- state
    // carries ownerType 'ORGANIZER', not a separate hub-owner type, exactly mirroring
    // ADR-090 SS1's "no second Connect identity per organizer" decision.
    const { url } = buildSquareAuthorizeUrl('ORGANIZER', organizer.id, userId);
    return res.json({ onboardingUrl: url, alreadyOnboarded: false });
  } catch (error) {
    console.error('initiateHubOwnerSquareOnboarding error:', error);
    return res.status(500).json({ message: 'Failed to start hub owner Square onboarding.' });
  }
};

// ---------------------------------------------------------------------------
// Shared OAuth callback -- handles ALL FOUR owner types (organizer/hub-owner share the
// ORGANIZER branch; consignor and vendor-booth-operator have their own branches).
// ---------------------------------------------------------------------------

/**
 * POST /api/square-connect/callback
 * Body: { code: string, state: string }
 *
 * Auth model, explicit: unlike Stripe's accountLinks (a pure Stripe-hosted redirect with no
 * code exchange on FindA.Sale's side), Square's OAuth requires FindA.Sale's OWN backend to
 * exchange the code for a token -- a sensitive, side-effecting action. Square's redirect
 * lands the browser on a FIXED frontend URL (registered once in the Developer Dashboard);
 * that frontend page is expected to make an AUTHENTICATED call to this endpoint (normal
 * Authorization header, same as every other endpoint here) rather than this endpoint trying
 * to infer identity from `state` alone.
 *
 * CORRECTED 2026-09-07 (findasale-hacker fix-and-reverify pass -- CRITICAL finding, FIXED
 * this pass): the paragraph this replaced claimed `state` was "client-supplied and
 * unsigned" and that trusting only the ownerId-ownership check below was "an acceptable,
 * deliberate choice." That was WRONG and exploitable -- an unsigned, replayable `state`
 * let an attacker forge/replay a state naming a REAL victim's ownerId, complete Square's
 * OAuth consent with their OWN Square account, then trick the logged-in victim into
 * submitting that code+state (classic OAuth login-CSRF / state-fixation). `state` is now
 * HMAC-signed AND bound to the initiating user's id (see SquareOAuthState.userId's doc
 * comment and this function's `decoded.userId !== userId` check below) -- BOTH that check
 * AND the per-branch ownerId-ownership check below are required; neither alone is
 * sufficient.
 */
export const handleSquareConnectCallback = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const { code, state } = req.body || {};
    if (!code || !state) return res.status(400).json({ message: 'code and state are required.' });

    const decoded = decodeSquareOAuthState(state);
    if (!decoded) return res.status(400).json({ message: 'Invalid or malformed state.' });

    // SECURITY FIX (2026-09-07, findasale-hacker fix-and-reverify pass -- CRITICAL finding,
    // FIXED this pass): state must have been ISSUED to this exact authenticated user, not
    // merely reference an ownerId this user happens to own. Without this check, an attacker
    // could forge (state used to be unsigned) or replay a validly-signed state naming a REAL
    // victim's ownerId, complete Square's OAuth consent with their OWN Square account, then
    // trick the logged-in victim into submitting that code+state -- the victim's session
    // would pass the ownerId-ownership check below and silently bind the ATTACKER's Square
    // account onto the VICTIM's row. See SquareOAuthState.userId's doc comment
    // (squareConnectService.ts) for the full attack trace.
    if (decoded.userId !== userId) {
      return res.status(403).json({ message: 'This Square connection link was not issued to your account. Please start the connection again.' });
    }

    const ownerType: SquareOnboardingOwnerType = decoded.ownerType;
    const ownerId = decoded.ownerId;

    // --- Ownership check (the REAL security boundary, not `state`) ---
    if (ownerType === 'ORGANIZER') {
      const organizer = await prisma.organizer.findFirst({ where: { id: ownerId, userId } });
      if (!organizer) return res.status(403).json({ message: 'You do not own this organizer account.' });
    } else if (ownerType === 'CONSIGNOR') {
      const consignor = await prisma.consignor.findFirst({
        where: { id: ownerId, workspace: { owner: { userId } } },
      });
      if (!consignor) return res.status(403).json({ message: 'You do not have access to this consignor.' });
    }

    // VENDOR_BOOTH ownership check + pre-update snapshot, captured OUTSIDE the if/else above
    // so the false->true edge check below (mirroring getVendorBoothStripeStatus's poll-based
    // equivalent) has the value from BEFORE this callback's update to compare against.
    let boothBeforeUpdate: { squareOnboarded: boolean } | null = null;
    if (ownerType === 'VENDOR_BOOTH') {
      const booth = await prisma.vendorBooth.findFirst({ where: { id: ownerId } });
      if (!booth || booth.userId !== userId) {
        return res.status(403).json({ message: 'You do not operate this booth.' });
      }
      boothBeforeUpdate = { squareOnboarded: booth.squareOnboarded };
    }

    // --- Token exchange (Stage 3) ---
    const token = await exchangeSquareAuthorizationCode(code);

    // --- One-shot live status check (the token itself IS persisted a few lines below, as of
    // Wave 0.5 -- this call just needs it in hand first to resolve merchantId/locationId/active) ---
    const status = await getSquareAccountStatus(token.accessToken);

    // --- Persist identity fields AND the OAuth token (Wave 0.5, 2026-09-07) ---
    // Token is encrypted at rest via tokenCrypto.ts (enc:v1: envelope), same treatment as
    // MarketplaceAccount.accessToken. refreshToken may legitimately be absent on some Square
    // OAuth responses -- never encrypt/store a null/undefined value as if it were real.
    const squareAccessTokenEncrypted = encryptToken(token.accessToken);
    const squareRefreshTokenEncrypted = token.refreshToken ? encryptToken(token.refreshToken) : null;
    const squareTokenExpiresAt = token.expiresAt ? new Date(token.expiresAt) : null;

    if (ownerType === 'ORGANIZER') {
      await prisma.organizer.update({
        where: { id: ownerId },
        data: {
          squareMerchantId: status.merchantId,
          squareLocationId: status.locationId,
          squareOnboarded: status.active,
          squareAccessTokenEncrypted,
          squareRefreshTokenEncrypted,
          squareTokenExpiresAt,
        },
      });
    } else if (ownerType === 'CONSIGNOR') {
      await prisma.consignor.update({
        where: { id: ownerId },
        data: {
          squareAccountId: status.merchantId,
          squareOnboarded: status.active,
          squareAccessTokenEncrypted,
          squareRefreshTokenEncrypted,
          squareTokenExpiresAt,
        },
      });
    } else {
      await prisma.vendorBooth.update({
        where: { id: ownerId },
        data: {
          squareAccountId: status.merchantId,
          squareOnboarded: status.active,
          squareAccessTokenEncrypted,
          squareRefreshTokenEncrypted,
          squareTokenExpiresAt,
        },
      });

      // Organizer notification, false->true edge only (mirrors getVendorBoothStripeStatus's
      // poll-based equivalent, adapted for this single callback instead of a poll). Without
      // the edge check, a booth that reconnects Square after already being onboarded -- or
      // whose OAuth callback somehow fires twice -- would re-notify on every completion; the
      // squareNotifiedAt stamp in the service is a second, independent guard against a
      // literal duplicate send, but this edge check is what keeps a NOT-genuinely-new
      // completion from even attempting one.
      if (boothBeforeUpdate && !boothBeforeUpdate.squareOnboarded && status.active) {
        notifyOrganizerBoothSquareConnected(ownerId).catch(err =>
          console.warn('[booth-lifecycle] Square notification failed for booth', ownerId, err)
        );
      }
    }

    // --- Immediate, synchronous bank-fingerprint fraud check (S1198-equivalent, Square
    // side) -- uses the token before it is discarded. Never allowed to fail the callback
    // itself (fetchAndCheckSquareBankFingerprints is internally non-fatal); awaited (not
    // fire-and-forget) specifically here because this is the ONLY point in the whole flow
    // this dispatch owns where the access token is available at all -- there is no later
    // webhook/cron hook wired up yet to catch it if we let it run in the background and the
    // process cycles before it finishes. ---
    await fetchAndCheckSquareBankFingerprints(token.accessToken, status.merchantId);

    const flaggedForReview = await isPayoutFlaggedForReview(ownerType, ownerId);

    return res.json({
      ownerType,
      ownerId,
      squareMerchantId: status.merchantId,
      squareOnboarded: status.active,
      squareLocationId: status.locationId,
      payoutsFlaggedForReview: flaggedForReview,
      tokenPersisted: true, // Wave 0.5 (2026-09-07) -- see the persistence block above
    });
  } catch (error) {
    console.error('handleSquareConnectCallback error:', error);
    return res.status(500).json({ message: 'Failed to complete Square onboarding.' });
  }
};

