import Stripe from 'stripe';
import * as Sentry from '@sentry/node';
import { prisma } from '../lib/prisma';
import { createNotification } from './notificationService';

/**
 * Connect Account Guard — Bank-Account Fingerprint Collusion Detection
 * S1198 (2026-09-06): synthetic-identity Stripe Connect fraud-ring incident. Two different
 * "vendor/consignor" identities ("Sandra Valencia" / "Kenneth Steele", confirmed via direct
 * read-only Stripe API query) shared one bank account -- same routing number AND same Stripe
 * bank-account fingerprint -- across two different Connect accounts registered through
 * FindA.Sale's own onboarding, apparently to receive payouts from stolen-card purchases.
 * Neither account ever reached payouts_enabled (Stripe's own Connect risk review caught them
 * first), but FindA.Sale's own onboarding had zero check of its own that would have caught
 * two different "people" sharing one bank account. This module is that check.
 *
 * WHY THE account.updated WEBHOOK IS THE INTEGRATION POINT:
 * Organizer/Consignor/VendorBooth all onboard as Stripe STANDARD accounts (ADR-020,
 * stripeConnectService.ts createConnectAccount). A Standard account's bank details are
 * entered by the account holder on STRIPE'S OWN hosted onboarding UI -- FindA.Sale's backend
 * never calls `accounts.createExternalAccount` anywhere in this codebase (confirmed via
 * repo-wide grep this session). There is therefore no in-house "add bank account" call site
 * to hook a check into -- account.updated (already handled for all three owner tables in
 * stripeController.ts) is the ONLY point FindA.Sale learns that a connected account's
 * external_accounts changed, and Stripe includes `external_accounts.data[]` on the Account
 * object by default for a platform's own connected accounts (no `expand` needed).
 *
 * WHY PERSISTED LOCALLY, NOT RE-QUERIED FROM STRIPE'S LIST ACCOUNTS API EVERY TIME:
 * ConnectBankFingerprint.fingerprint is indexed, giving an O(log n) match against every other
 * connected account on the platform with zero added Stripe API calls, zero added rate-limit
 * exposure, and zero added webhook-processing latency (Stripe requires a <10s response to
 * account.updated or it retries). Paginating accounts.list() and every account's
 * external_accounts on every single delivery does not scale and duplicates data this table
 * already captures for free as a side effect of a webhook FindA.Sale already receives.
 *
 * WHY FLAG, NOT HARD-BLOCK:
 * Legitimate shared-bank cases already exist in this product -- ADR-090 §1 intentionally
 * reuses ONE Organizer.stripeConnectId across both an organizer's own-sale payouts and their
 * hub-owner revenue-share payouts, and family members co-organizing a sale on a joint bank
 * account is an ordinary real-world case. A hard block would turn every one of those into a
 * support incident. A match here sets ConnectBankFingerprint.flagged + the owner row's
 * payoutsFlaggedForReview, visible on the admin fraud dashboard (adminController.ts
 * listConnectBankFingerprintFlags) for a human to CONFIRM or DISMISS -- mirroring the existing
 * FraudSignal PENDING | DISMISSED | CONFIRMED review convention already used for buyer-side
 * collusion (checkoutGuard.ts).
 *
 * WHAT THIS DOES NOT CATCH (scope limitation, not a bug): if a fraud ring uses a genuinely
 * DIFFERENT real bank account per synthetic identity, there is no bank-level signal here to
 * catch them -- this module's job is specifically bank-account collision, one layer of
 * defense among several (see checkoutGuard.ts for the buyer-side device/card-fingerprint
 * equivalent). It is bypass-resistant against trivial re-entry tricks: Stripe computes
 * `fingerprint` server-side from the real account+routing number, so re-typing the same
 * bank account with different whitespace/formatting, or removing and re-adding the identical
 * account, always reproduces the identical fingerprint.
 */

export type ConnectOwnerType = 'ORGANIZER' | 'CONSIGNOR' | 'VENDOR_BOOTH';

interface ResolvedOwner {
  ownerType: ConnectOwnerType;
  ownerId: string;
}

/**
 * Resolve every FindA.Sale row that owns this Stripe Connect account id. Mirrors
 * stripeController.ts's account.updated handler's own three-way lookup exactly (same
 * findMany-not-findUnique reasoning: none of Organizer.stripeConnectId /
 * Consignor.stripeAccountId / VendorBooth.stripeAccountId are @@unique, and the SAME
 * physical Stripe account can legitimately match more than one row).
 */
async function resolveOwners(stripeAccountId: string): Promise<ResolvedOwner[]> {
  const [organizers, consignors, booths] = await Promise.all([
    prisma.organizer.findMany({ where: { stripeConnectId: stripeAccountId }, select: { id: true } }),
    prisma.consignor.findMany({ where: { stripeAccountId }, select: { id: true } }),
    prisma.vendorBooth.findMany({ where: { stripeAccountId }, select: { id: true } }),
  ]);

  const owners: ResolvedOwner[] = [];
  for (const o of organizers) owners.push({ ownerType: 'ORGANIZER', ownerId: o.id });
  for (const c of consignors) owners.push({ ownerType: 'CONSIGNOR', ownerId: c.id });
  for (const b of booths) owners.push({ ownerType: 'VENDOR_BOOTH', ownerId: b.id });
  return owners;
}

/**
 * Real-time admin alert companion to the Sentry.captureMessage warning fired on a new
 * bank-fingerprint match below -- Sentry is for on-call/engineering visibility, this is
 * for the actual admin fraud-review workflow (matches the existing
 * notifyAdminsBatchNeedsAttention precedent in services/video/footageClassifyService.ts).
 * Fire-and-forget, never throws -- a notification failure must never turn a legitimate
 * account.updated delivery into a failure the webhook then retries.
 */
async function notifyAdminsOfBankFingerprintFlag(
  ownerType: ConnectOwnerType,
  ownerId: string,
  stripeAccountId: string,
  reason: string
): Promise<void> {
  try {
    const admins = await prisma.user.findMany({
      where: { OR: [{ roles: { has: 'ADMIN' } }, { role: 'ADMIN' }] },
      select: { id: true },
    });
    if (admins.length === 0) {
      console.warn('[connectAccountGuard] No ADMIN users found -- bank fingerprint flag has no one to notify');
      return;
    }
    const title = 'Payout flagged: shared bank account detected';
    const body = `${ownerType} ${ownerId} (Stripe acct ${stripeAccountId}) was flagged for review: ${reason}`;
    const link = '/admin/connect-bank-fingerprints';
    await Promise.all(
      admins.map((a) =>
        createNotification(
          a.id,
          'connect_bank_fingerprint_flag',
          title,
          body,
          link,
          'OPERATIONAL',
          true,
          'FindA.Sale: payout flagged for review'
        )
      )
    );
  } catch (err) {
    console.warn('[connectAccountGuard] Failed to notify admins of bank fingerprint flag:', err);
  }
}

async function setOwnerFlag(owner: ResolvedOwner, reason: string): Promise<void> {
  try {
    if (owner.ownerType === 'ORGANIZER') {
      await prisma.organizer.update({
        where: { id: owner.ownerId },
        data: { payoutsFlaggedForReview: true, payoutsFlaggedReason: reason },
      });
    } else if (owner.ownerType === 'CONSIGNOR') {
      await prisma.consignor.update({
        where: { id: owner.ownerId },
        data: { payoutsFlaggedForReview: true, payoutsFlaggedReason: reason },
      });
    } else {
      await prisma.vendorBooth.update({
        where: { id: owner.ownerId },
        data: { payoutsFlaggedForReview: true, payoutsFlaggedReason: reason },
      });
    }
  } catch (err) {
    console.error(
      `[connectAccountGuard] Failed to set payoutsFlaggedForReview on ${owner.ownerType} ${owner.ownerId} (non-fatal):`,
      err
    );
  }
}

/**
 * Main entry point — called from stripeController.ts's `account.updated` webhook handler
 * with the raw Stripe Account object. Never throws: a failure here must never turn a
 * legitimate account.updated delivery into a 500 that Stripe then retries forever, exactly
 * the same non-fatal posture every other side effect in that handler already follows.
 */
export async function recordAndCheckBankFingerprints(account: Stripe.Account | Record<string, any>): Promise<void> {
  try {
    const stripeAccountId: string | undefined = (account as any)?.id;
    if (!stripeAccountId) return;

    const externalAccounts: any[] = (account as any)?.external_accounts?.data ?? [];
    const bankAccounts = externalAccounts.filter(
      (ea) => ea?.object === 'bank_account' && typeof ea?.fingerprint === 'string' && ea.fingerprint.length > 0
    );
    if (bankAccounts.length === 0) return; // nothing to record yet — common mid-onboarding, not an error

    const owners = await resolveOwners(stripeAccountId);
    if (owners.length === 0) {
      // Not a FindA.Sale-owned account (unrelated Connect webhook noise, or delivered before
      // our own onboarding call finished persisting the id) — no-op, same posture the rest of
      // the account.updated handler already takes for an unmatched account.id.
      return;
    }

    for (const bankAccount of bankAccounts) {
      const fingerprint: string = bankAccount.fingerprint;
      const last4: string | null = bankAccount.last4 ?? null;
      const bankName: string | null = bankAccount.bank_name ?? null;
      const routingLast4: string | null =
        typeof bankAccount.routing_number === 'string' ? bankAccount.routing_number.slice(-4) : null;

      for (const owner of owners) {
        // The actual collusion check: does this EXACT fingerprint already belong to a
        // DIFFERENT Stripe Connect account anywhere on the platform? Everything else in
        // this loop is bookkeeping around this one lookup.
        const existingMatches = await prisma.connectBankFingerprint.findMany({
          where: { fingerprint, stripeAccountId: { not: stripeAccountId } },
        });

        const isNewMatch = existingMatches.length > 0;
        const flagReason = isNewMatch
          ? `Bank account fingerprint matches ${existingMatches.length} other connected account(s): ${existingMatches
              .map((m) => `${m.ownerType} ${m.ownerId} (acct ${m.stripeAccountId})`)
              .join(', ')}`
          : null;

        await prisma.connectBankFingerprint.upsert({
          where: {
            stripeAccountId_fingerprint_ownerType_ownerId: {
              stripeAccountId,
              fingerprint,
              ownerType: owner.ownerType,
              ownerId: owner.ownerId,
            },
          },
          update: {
            last4: last4 ?? undefined,
            bankName: bankName ?? undefined,
            routingLast4: routingLast4 ?? undefined,
            // Never un-flag automatically on a later webhook delivery — only an explicit
            // admin review (adminController.ts reviewConnectBankFingerprintFlag) clears a
            // flag. This closes the trivial-bypass case: removing then re-adding the same
            // (or an identically-fingerprinted) bank account must not quietly clear a flag.
            ...(isNewMatch ? { flagged: true, flagReason } : {}),
          },
          create: {
            stripeAccountId,
            fingerprint,
            last4,
            bankName,
            routingLast4,
            ownerType: owner.ownerType,
            ownerId: owner.ownerId,
            flagged: isNewMatch,
            flagReason,
          },
        });

        if (isNewMatch) {
          // Flag BOTH sides — the newly-seen account AND every pre-existing account sharing
          // this fingerprint — so admin review surfaces the whole cluster at once, not just
          // whichever account happened to onboard second.
          await setOwnerFlag(owner, flagReason!);
          for (const match of existingMatches) {
            await setOwnerFlag(
              { ownerType: match.ownerType as ConnectOwnerType, ownerId: match.ownerId },
              `Bank account fingerprint matches ${owner.ownerType} ${owner.ownerId} (acct ${stripeAccountId}).`
            );
            if (!match.flagged) {
              await prisma.connectBankFingerprint.update({
                where: { id: match.id },
                data: {
                  flagged: true,
                  flagReason: `Bank account fingerprint matches ${owner.ownerType} ${owner.ownerId} (acct ${stripeAccountId}).`,
                },
              });
            }
          }

          const msg = `[connectAccountGuard] Bank-account fingerprint collision: ${owner.ownerType} ${owner.ownerId} (acct ${stripeAccountId}) shares a bank account with ${existingMatches.length} other connected account(s) on the platform. Flagged for admin review — payouts NOT auto-blocked.`;
          console.warn(msg);
          try {
            Sentry.captureMessage(msg, 'warning');
          } catch {
            // Sentry may not be initialized — silently continue, never let alerting break the webhook
          }
          await notifyAdminsOfBankFingerprintFlag(owner.ownerType, owner.ownerId, stripeAccountId, flagReason!);
        }
      }
    }
  } catch (error) {
    console.error('[connectAccountGuard] recordAndCheckBankFingerprints failed (non-fatal):', error);
  }
}

/**
 * Read-only helper for money-movement call sites that want to hold a payout/transfer to a
 * flagged account without duplicating the flag lookup. Fails OPEN (returns false / "not
 * flagged") on any lookup error — a transient DB hiccup here must never itself become a
 * payout outage; this module's entire posture is admin-review, not availability-risking
 * enforcement.
 */
export async function isPayoutFlaggedForReview(ownerType: ConnectOwnerType, ownerId: string): Promise<boolean> {
  try {
    if (ownerType === 'ORGANIZER') {
      const o = await prisma.organizer.findUnique({
        where: { id: ownerId },
        select: { payoutsFlaggedForReview: true },
      });
      return !!o?.payoutsFlaggedForReview;
    }
    if (ownerType === 'CONSIGNOR') {
      const c = await prisma.consignor.findUnique({
        where: { id: ownerId },
        select: { payoutsFlaggedForReview: true },
      });
      return !!c?.payoutsFlaggedForReview;
    }
    const b = await prisma.vendorBooth.findUnique({
      where: { id: ownerId },
      select: { payoutsFlaggedForReview: true },
    });
    return !!b?.payoutsFlaggedForReview;
  } catch (err) {
    console.error(
      `[connectAccountGuard] isPayoutFlaggedForReview lookup failed for ${ownerType} ${ownerId} (failing open — non-blocking by design):`,
      err
    );
    return false;
  }
}
