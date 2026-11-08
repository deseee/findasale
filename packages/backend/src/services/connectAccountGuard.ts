import { prisma } from '../lib/prisma';

/**
 * Connect Account Guard -- payout hold lookup for flagged connected accounts.
 *
 * S1198 (2026-09-06) added bank-account fingerprint collusion detection: two "different" payees sharing
 * one bank account are flagged (Organizer / Consignor / VendorBooth.payoutsFlaggedForReview) for an admin
 * to confirm or dismiss on the fraud dashboard (adminController.ts listConnectBankFingerprintFlags).
 *
 * The Stripe side of that check (recordAndCheckBankFingerprints, fed by Stripe's account.updated webhook)
 * was removed with Stripe on 2026-11-04. The Square side writes the same flags (squareConnectService.ts),
 * and the historical ConnectBankFingerprint rows stay readable on the admin dashboard. What is left here is
 * the processor-agnostic read used by every money-movement call site.
 */

export type ConnectOwnerType = 'ORGANIZER' | 'CONSIGNOR' | 'VENDOR_BOOTH';

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
