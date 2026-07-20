import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { getStripe } from '../utils/stripe';
import {
  createConnectAccount,
  createOnboardingLink,
  createStandardMigrationAccount,
  createStandardMigrationAccountManual,
  getAccountStatus,
  payConsignorViaACH,
  updateConsignorOnboardingStatus,
} from '../services/stripeConnectService';
import { Decimal } from '@prisma/client/runtime/library';

const stripe = () => getStripe();

// GET /api/stripe-connect/status/:consignorId
export const getConsignorPayoutStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { consignorId } = req.params;
    const userId = req.user?.id;

    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    // Verify organizer owns this consignor
    const consignor = await prisma.consignor.findFirst({
      where: {
        id: consignorId,
        workspace: {
          ownerId: userId,
        },
      },
    });

    if (!consignor) {
      return res.status(404).json({ message: 'Consignor not found or access denied.' });
    }

    if (!consignor.stripeAccountId) {
      return res.json({
        consignorId: consignor.id,
        stripeAccountId: null,
        stripeOnboarded: false,
        accountStatus: null,
      });
    }

    // Fetch account status from Stripe
    const status = await getAccountStatus(consignor.stripeAccountId);

    return res.json({
      consignorId: consignor.id,
      stripeAccountId: consignor.stripeAccountId,
      stripeOnboarded: consignor.stripeOnboarded,
      accountStatus: status,
    });
  } catch (error) {
    console.error('getConsignorPayoutStatus error:', error);
    return res.status(500).json({ message: 'Failed to fetch consignor status.' });
  }
};

// POST /api/stripe-connect/onboard/:consignorId
export const initiateConsignorOnboarding = async (req: AuthRequest, res: Response) => {
  try {
    const { consignorId } = req.params;
    const userId = req.user?.id;

    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    // Verify organizer owns this consignor
    const consignor = await prisma.consignor.findFirst({
      where: {
        id: consignorId,
        workspace: {
          ownerId: userId,
        },
      },
    });

    if (!consignor) {
      return res.status(404).json({ message: 'Consignor not found or access denied.' });
    }

    let accountId = consignor.stripeAccountId;

    // Create account if it doesn't exist
    if (!accountId) {
      // ADR-020 (2026-07-07, Patrick-approved): Consignor onboarding also moves to
      // Standard accounts, alongside VendorBooth — same createConnectAccount
      // function, same accountType parameter, extending the migration Patrick
      // explicitly signed off on for both callers.
      accountId = await createConnectAccount(consignor, 'standard');
      // 2026-07-08 fix (S1091): createConnectAccount no longer persists internally
      // (it's shared with vendorBoothController.ts, which owns a different model) --
      // this caller now persists the new accountId to the Consignor row itself.
      await prisma.consignor.update({
        where: { id: consignor.id },
        data: { stripeAccountId: accountId, stripeAccountType: 'standard' },
      });
    }

    // Build return/refresh URLs
    const frontendBaseUrl = process.env.FRONTEND_URL || 'https://finda.sale';
    const returnUrl = `${frontendBaseUrl}/organizer/stripe-connect?consignorId=${consignorId}&success=true`;
    const refreshUrl = `${frontendBaseUrl}/organizer/stripe-connect?consignorId=${consignorId}&refresh=true`;

    // Create onboarding link
    const onboardingUrl = await createOnboardingLink(accountId, returnUrl, refreshUrl);

    return res.json({
      consignorId,
      accountId,
      onboardingUrl,
    });
  } catch (error) {
    console.error('initiateConsignorOnboarding error:', error);
    return res.status(500).json({ message: 'Failed to initiate onboarding.' });
  }
};

// GET /api/stripe-connect/return/:consignorId
export const handleConnectReturn = async (req: AuthRequest, res: Response) => {
  try {
    const { consignorId } = req.params;
    const userId = req.user?.id;

    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    // Verify organizer owns this consignor
    const consignor = await prisma.consignor.findFirst({
      where: {
        id: consignorId,
        workspace: {
          ownerId: userId,
        },
      },
    });

    if (!consignor || !consignor.stripeAccountId) {
      return res.status(404).json({ message: 'Consignor not found or not initialized.' });
    }

    // Update onboarding status
    const status = await updateConsignorOnboardingStatus(consignorId, consignor.stripeAccountId);

    return res.json({
      consignorId,
      stripeOnboarded: status.chargesEnabled,
      accountStatus: status,
    });
  } catch (error) {
    console.error('handleConnectReturn error:', error);
    return res.status(500).json({ message: 'Failed to verify onboarding status.' });
  }
};

// POST /api/stripe-connect/pay/:consignorId
export const payConsignor = async (req: AuthRequest, res: Response) => {
  try {
    const { consignorId } = req.params;
    const userId = req.user?.id;
    const { settlementId, amountCents, description } = req.body;

    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    if (!settlementId || !amountCents) {
      return res.status(400).json({ message: 'settlementId and amountCents required.' });
    }

    // Verify TEAMS tier
    const organizer = await prisma.organizer.findFirst({
      where: { userId },
      select: { id: true, subscriptionTier: true, stripeConnectAccountId: true },
    });

    if (!organizer) return res.status(404).json({ message: 'Organizer not found.' });
    if (organizer.subscriptionTier !== 'TEAMS') {
      return res.status(403).json({ message: 'ACH Payouts require TEAMS tier.' });
    }

    // Verify consignor exists and is onboarded
    const consignor = await prisma.consignor.findFirst({
      where: {
        id: consignorId,
        workspace: {
          ownerId: userId,
        },
      },
    });

    if (!consignor) return res.status(404).json({ message: 'Consignor not found.' });
    if (!consignor.stripeOnboarded || !consignor.stripeAccountId) {
      return res.status(400).json({ message: 'Consignor not onboarded for ACH payouts.' });
    }

    // Verify settlement exists and belongs to this organizer
    const settlement = await prisma.saleSettlement.findFirst({
      where: {
        id: settlementId,
        sale: {
          organizer: { userId },
        },
      },
      select: { id: true, netProceeds: true },
    });

    if (!settlement) return res.status(404).json({ message: 'Settlement not found or access denied.' });

    // Verify amount doesn't exceed settlement proceeds
    const netProceeds = Number(settlement.netProceeds);
    if (amountCents > netProceeds * 100) {
      return res.status(400).json({ message: 'Payout amount exceeds settlement proceeds.' });
    }

    // Execute Stripe transfer
    const transfer = await payConsignorViaACH(
      consignor.stripeAccountId,
      amountCents,
      description || `Consignor payout for settlement ${settlementId}`,
      organizer.stripeConnectAccountId || undefined
    );

    // Create ConsignorPayout record
    const payout = await prisma.consignorPayout.create({
      data: {
        consignorId,
        saleId: undefined,
        totalSales: new Decimal(0),
        commissionAmount: new Decimal(amountCents / 100),
        netPayout: new Decimal(amountCents / 100),
        method: 'ACH',
        stripeTransferId: transfer.transferId,
        paidAt: new Date(),
        notes: description || null,
      },
    });

    return res.json({
      payoutId: payout.id,
      consignorId,
      amountFormatted: transfer.amountFormatted,
      transferId: transfer.transferId,
      status: transfer.status,
      paidAt: payout.paidAt?.toISOString(),
    });
  } catch (error) {
    console.error('payConsignor error:', error);
    return res.status(500).json({ message: 'Failed to process ACH payout.' });
  }
};

// POST /api/organizers/me/stripe/start-standard-migration
// ADR-023: Organizer-triggered migration from Express to Standard via Stripe's
// Networked Onboarding reuse offer. Ownership-checked (organizer can only
// migrate their OWN account -- never trust a client-passed id). Live-checks
// the CURRENT account type before acting (ADR-021 pattern: never trust the
// cached stripeAccountType for an action that creates/mutates a real Stripe
// account -- that's exactly the gap that caused the Artifact duplicate-account
// incident). Never creates a second pending account for the same organizer --
// if one is already in flight, this reuses it and just issues a fresh link.
export const startStandardMigration = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    // ADR-024: 'manual' is the non-reuse-eligible fallback -- see
    // createStandardMigrationAccountManual for why this exists (Stripe-side
    // bug in the reuse path's Google-account-linking step, root-caused
    // 2026-07-08). Never trust an unexpected value -- default to the
    // existing 'reuse' behavior.
    const mode: 'reuse' | 'manual' = req.body?.mode === 'manual' ? 'manual' : 'reuse';

    const organizer = await prisma.organizer.findFirst({
      where: { userId },
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer not found.' });
    }

    if (!organizer.stripeConnectId) {
      return res.status(400).json({ message: 'No Stripe account connected yet.' });
    }

    const frontendBaseUrl = process.env.FRONTEND_URL || 'https://finda.sale';
    const returnUrl = `${frontendBaseUrl}/organizer/dashboard?stripeMigration=complete`;
    const refreshUrl = `${frontendBaseUrl}/organizer/dashboard?stripeMigration=refresh`;

    // ADR-024: manual mode abandons any stuck reuse-path pending account first
    // -- harmless, it was never linked to stripeConnectId and never touched
    // money -- so the claim step below proceeds as if starting fresh.
    if (mode === 'manual' && organizer.pendingStripeMigrationAccountId) {
      await prisma.organizer.update({
        where: { id: organizer.id },
        data: { pendingStripeMigrationAccountId: null },
      });
      organizer.pendingStripeMigrationAccountId = null;
    }

    // ADR-024 addendum (Patrick pushback, 2026-07-08 -- correctly so: manual
    // entry should never be the FIRST fallback when the whole point was zero
    // re-entry): forceNew lets the organizer request a genuinely fresh
    // one-click reuse attempt on a BRAND NEW account object instead of
    // retrying the same possibly-tainted pending one. The prior "Continue"
    // behavior always re-links the SAME stuck account (by design, to avoid
    // orphaning accounts) -- so it could never test whether the Stripe-side
    // error was specific to that one account object or a hard block on the
    // whole reuse mechanism. This costs nothing to try (abandoned Stripe
    // accounts are harmless, same precedent as the manual-mode abandon
    // above) and preserves the full zero-re-entry promise if it works.
    if (mode === 'reuse' && req.body?.forceNew && organizer.pendingStripeMigrationAccountId) {
      await prisma.organizer.update({
        where: { id: organizer.id },
        data: { pendingStripeMigrationAccountId: null },
      });
      organizer.pendingStripeMigrationAccountId = null;
    }

    // Already-in-flight migration (reuse mode only -- manual mode always
    // starts fresh via the abandon step above): never spin up a second new
    // account for the same organizer. Just re-check the pending account and
    // hand back a fresh link (AccountLinks expire).
    if (mode === 'reuse' && organizer.pendingStripeMigrationAccountId) {
      const pendingStatus = await getAccountStatus(organizer.pendingStripeMigrationAccountId);
      if (pendingStatus.chargesEnabled && pendingStatus.payoutsEnabled) {
        // Webhook should cut this over shortly; nothing more for the client to do.
        return res.status(200).json({ alreadyMigrated: true });
      }
      const url = await createOnboardingLink(
        organizer.pendingStripeMigrationAccountId,
        returnUrl,
        refreshUrl
      );
      return res.status(200).json({ onboardingUrl: url, migrationPending: true });
    }

    // Live-check the CURRENT account -- never act on the cached stripeAccountType.
    const currentStatus = await getAccountStatus(organizer.stripeConnectId);
    if (currentStatus.accountType === 'standard') {
      // Already Standard (cache was just stale) -- sync it and stop.
      await prisma.organizer.update({
        where: { id: organizer.id },
        data: { stripeAccountType: 'standard' },
      });
      return res.status(200).json({ alreadyMigrated: true });
    }

    // Race-condition fix (findasale-hacker P2 finding, 2026-07-08): two
    // concurrent calls could both read pendingStripeMigrationAccountId as null
    // above and both proceed to create a Stripe account, orphaning one. Claim
    // the slot atomically first -- a single UPDATE ... WHERE pendingStripe...
    // IS NULL either affects exactly one row (we won the race) or zero rows
    // (someone else won it in between our read and this write). This uses the
    // database's own atomicity as the compare-and-swap; no transaction or
    // isolation-level change needed.
    const claim = await prisma.organizer.updateMany({
      where: { id: organizer.id, pendingStripeMigrationAccountId: null },
      data: { pendingStripeMigrationAccountId: 'CLAIMING', stripeMigrationPromptedAt: new Date() },
    });

    if (claim.count === 0) {
      // Lost the race -- a concurrent request already claimed (or completed)
      // this migration. Re-fetch and hand back whatever it produced instead of
      // creating a second account.
      const refreshed = await prisma.organizer.findUnique({ where: { id: organizer.id } });
      if (refreshed?.pendingStripeMigrationAccountId && refreshed.pendingStripeMigrationAccountId !== 'CLAIMING') {
        const url = await createOnboardingLink(refreshed.pendingStripeMigrationAccountId, returnUrl, refreshUrl);
        return res.status(200).json({ onboardingUrl: url, migrationPending: true });
      }
      // Still mid-claim (very tight window) -- ask the client to retry shortly
      // rather than proceed and risk a duplicate account.
      return res.status(409).json({ message: 'Migration already starting -- please try again in a moment.' });
    }

    // From here on, release the 'CLAIMING' claim back to null on any failure --
    // otherwise a Stripe API error mid-flow would leave the organizer stuck on
    // the sentinel forever with no way to retry (a new failure mode the claim
    // itself would introduce if left unguarded).
    try {
      const newAccountId = mode === 'manual'
        ? await createStandardMigrationAccountManual(organizer.stripeConnectId, organizer.id)
        : await createStandardMigrationAccount(organizer.stripeConnectId, organizer.id);

      await prisma.organizer.update({
        where: { id: organizer.id },
        data: {
          pendingStripeMigrationAccountId: newAccountId,
          stripeAccountType: 'express',
        },
      });

      const url = await createOnboardingLink(newAccountId, returnUrl, refreshUrl);
      return res.status(200).json({ onboardingUrl: url, migrationPending: true });
    } catch (innerError) {
      await prisma.organizer.updateMany({
        where: { id: organizer.id, pendingStripeMigrationAccountId: 'CLAIMING' },
        data: { pendingStripeMigrationAccountId: null },
      });
      throw innerError;
    }
  } catch (error) {
    console.error('startStandardMigration error:', error);
    return res.status(500).json({ message: 'Failed to start Stripe account migration.' });
  }
};


/**
 * ADR-090 Phase 1: hub-owner Stripe Connect onboarding. Reuses Organizer.stripeConnectId
 * (no second Connect identity per organizer, ADR-090 §1) — the same legal
 * entity/bank account whether an Organizer is earning from their own listed items or
 * from hub-owner revenue-share cuts. Requires a Standard account (mirrors the
 * VendorBooth/Consignor ADR-020 migration): checkout-time revenue-share Transfers
 * (vendorBoothCartController.ts computeLegFeeSplit) only fire when
 * stripeAccountType === 'standard' && stripeOnboarded, so onboarding here creates
 * that exact shape, never an Express account.
 *
 * ADR-090 §2.7: any new hub-payout-related endpoint needs the same ownership check
 * pattern used elsewhere, verified explicitly — never assumed inherited from
 * middleware. Both endpoints below explicitly confirm the requester owns at least
 * one SaleHub before doing anything.
 */

// GET /api/organizers/me/hub-owner/stripe/status
export const getHubOwnerStripeStatus = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const organizer = await prisma.organizer.findFirst({ where: { userId } });
    if (!organizer) return res.status(404).json({ message: 'Organizer not found.' });

    const ownsHub = await prisma.saleHub.findFirst({ where: { organizerId: organizer.id }, select: { id: true } });
    if (!ownsHub) return res.status(404).json({ message: 'You do not own a hub yet.' });

    if (!organizer.stripeConnectId) {
      return res.json({ onboarded: false, needsAccount: true, needsStandardUpgrade: false, stripeAccountType: null });
    }

    const liveStatus = await getAccountStatus(organizer.stripeConnectId);
    const readyForHubOwnerPayouts =
      organizer.stripeAccountType === 'standard' && liveStatus.chargesEnabled && liveStatus.payoutsEnabled;

    return res.json({
      onboarded: readyForHubOwnerPayouts,
      needsAccount: false,
      needsStandardUpgrade: organizer.stripeAccountType !== 'standard',
      stripeAccountType: organizer.stripeAccountType,
      chargesEnabled: liveStatus.chargesEnabled,
      payoutsEnabled: liveStatus.payoutsEnabled,
    });
  } catch (error) {
    console.error('getHubOwnerStripeStatus error:', error);
    return res.status(500).json({ message: 'Failed to fetch hub owner Stripe status.' });
  }
};

// POST /api/organizers/me/hub-owner/stripe/onboard
export const initiateHubOwnerStripeOnboarding = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const organizer = await prisma.organizer.findFirst({ where: { userId } });
    if (!organizer) return res.status(404).json({ message: 'Organizer not found.' });

    const ownsHub = await prisma.saleHub.findFirst({ where: { organizerId: organizer.id }, select: { id: true } });
    if (!ownsHub) return res.status(404).json({ message: 'You do not own a hub yet.' });

    const frontendBaseUrl = process.env.FRONTEND_URL || 'https://finda.sale';
    const returnUrl = `${frontendBaseUrl}/organizer/hubs?stripeOnboarding=complete`;
    const refreshUrl = `${frontendBaseUrl}/organizer/hubs?stripeOnboarding=refresh`;

    if (organizer.stripeConnectId && organizer.stripeAccountType === 'standard') {
      // Already a Standard account — resume onboarding if incomplete, else hand back
      // a dashboard login link (mirrors stripeController.ts createConnectAccount's
      // own login-link-first branch for the Organizer's own Sale-payout account).
      const liveStatus = await getAccountStatus(organizer.stripeConnectId);
      if (liveStatus.chargesEnabled && liveStatus.payoutsEnabled) {
        try {
          const loginLink = await stripe().accounts.createLoginLink(organizer.stripeConnectId);
          return res.json({ onboardingUrl: loginLink.url, alreadyOnboarded: true });
        } catch (loginErr) {
          console.warn('initiateHubOwnerStripeOnboarding: login link failed, falling back to a fresh onboarding link:', loginErr);
        }
      }
      const url = await createOnboardingLink(organizer.stripeConnectId, returnUrl, refreshUrl);
      return res.json({ onboardingUrl: url, alreadyOnboarded: false });
    }

    if (organizer.stripeConnectId && organizer.stripeAccountType !== 'standard') {
      // Needs the EXISTING express->standard migration flow — do not duplicate its
      // claim/race-condition logic here (see stripeConnectController.ts
      // startStandardMigration, already mounted at
      // POST /api/organizers/me/stripe/start-standard-migration).
      return res.status(409).json({
        message: 'Your existing Stripe account needs to be upgraded to a Standard account before you can receive hub owner payouts.',
        needsStandardMigration: true,
        migrationEndpoint: '/api/organizers/me/stripe/start-standard-migration',
      });
    }

    // No Stripe account at all yet — create a fresh Standard account, same
    // 'standard' branch createConnectAccount already uses for Consignor/VendorBooth
    // onboarding (ADR-020). Organizer has no workspaceId concept (unlike Consignor),
    // so this calls stripe().accounts.create directly rather than routing through
    // the shared createConnectAccount() helper.
    const account = await stripe().accounts.create({
      type: 'standard',
      email: req.user!.email,
      metadata: { organizerId: organizer.id, source: 'hub_owner_onboarding' },
    });

    await prisma.organizer.update({
      where: { id: organizer.id },
      data: { stripeConnectId: account.id, stripeAccountType: 'standard' },
    });

    const url = await createOnboardingLink(account.id, returnUrl, refreshUrl);
    return res.json({ onboardingUrl: url, alreadyOnboarded: false });
  } catch (error) {
    console.error('initiateHubOwnerStripeOnboarding error:', error);
    return res.status(500).json({ message: 'Failed to start hub owner Stripe onboarding.' });
  }
};
