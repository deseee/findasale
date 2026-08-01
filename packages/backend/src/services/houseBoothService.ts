/**
 * House Booth Service (2026-08-01, Fix 2 of 2 dispatched this session).
 *
 * A hub owner's own inventory could not sell through their own venue-mode register:
 * addBoothCartItems only accepts an item whose owner has a CONFIRMED VendorBooth at the
 * hub, and a hub owner never creates a VendorBooth row for themselves (they own the hub,
 * not a booth in it). This service auto-provisions a single, invisible, synthetic booth
 * per hub -- VendorBooth.isHubOwnerBooth -- the first time it's actually needed, so the
 * owner's items resolve to a real VendorBooth row exactly the way every other vendor's
 * items already do, with zero new checkout code paths.
 *
 * revenueSharePercent is hardcoded to 0, never derived from any input: the owner keeps
 * 100% of their own sale minus the normal platform fee, exactly like plain non-venue POS
 * today -- there is no "hub owner" to share revenue with here, they ARE the hub owner.
 *
 * Get-or-create, upsert-safe: mirrors staffService.grantRegisterAccess's exact race
 * idiom (staffService.ts ~556-598) -- create, and on a Prisma P2002 (unique-index race
 * from two concurrent first-uses), re-fetch by { hubId, isHubOwnerBooth: true } instead
 * of erroring. The partial unique index enforcing "at most one house booth per hub" is
 * hand-written in the migration SQL (Prisma's schema DSL can't express a partial index).
 *
 * On the "found existing" path, Stripe identity (stripeAccountId/stripeAccountType/
 * stripeOnboarded) is refreshed from the live Organizer row whenever it has drifted --
 * an organizer can re-onboard or migrate Stripe accounts (ADR-023), and a stale house
 * booth must never be left pointing at a dead connected account.
 */

import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../lib/prisma';

export async function getOrCreateHouseBooth(hubId: string): Promise<{
  id: string;
  userId: string;
  stripeAccountId: string | null;
} | null> {
  const hub = await prisma.saleHub.findUnique({
    where: { id: hubId },
    select: {
      organizer: {
        select: {
          userId: true,
          businessName: true,
          stripeConnectId: true,
          stripeAccountType: true,
          stripeOnboarded: true,
        },
      },
    },
  });
  if (!hub?.organizer) return null;
  const organizer = hub.organizer;

  const existing = await prisma.vendorBooth.findFirst({
    where: { hubId, isHubOwnerBooth: true },
    select: {
      id: true,
      userId: true,
      stripeAccountId: true,
      stripeAccountType: true,
      stripeOnboarded: true,
    },
  });

  if (existing) {
    const drifted =
      existing.stripeAccountId !== organizer.stripeConnectId ||
      existing.stripeAccountType !== organizer.stripeAccountType ||
      existing.stripeOnboarded !== organizer.stripeOnboarded;

    if (drifted) {
      const refreshed = await prisma.vendorBooth.update({
        where: { id: existing.id },
        data: {
          stripeAccountId: organizer.stripeConnectId,
          stripeAccountType: organizer.stripeAccountType,
          stripeOnboarded: organizer.stripeOnboarded,
        },
        select: { id: true, userId: true, stripeAccountId: true },
      });
      return { id: refreshed.id, userId: refreshed.userId as string, stripeAccountId: refreshed.stripeAccountId };
    }

    return { id: existing.id, userId: existing.userId as string, stripeAccountId: existing.stripeAccountId };
  }

  try {
    const created = await prisma.vendorBooth.create({
      data: {
        hubId,
        userId: organizer.userId,
        boothNumber: '__HOUSE__',
        vendorName: organizer.businessName,
        status: 'CONFIRMED',
        confirmedAt: new Date(),
        isHubOwnerBooth: true,
        revenueSharePercent: 0,
        boothFee: new Decimal(0),
        stripeAccountId: organizer.stripeConnectId,
        stripeAccountType: organizer.stripeAccountType,
        stripeOnboarded: organizer.stripeOnboarded,
      },
      select: { id: true, userId: true, stripeAccountId: true },
    });
    return { id: created.id, userId: created.userId as string, stripeAccountId: created.stripeAccountId };
  } catch (error: any) {
    // Two carts hitting the lazy-create path at once: the partial unique index on
    // (hubId) WHERE isHubOwnerBooth wins the race, and the row we wanted now exists.
    // Read it back instead of erroring, same idiom as staffService.grantRegisterAccess.
    if (error?.code === 'P2002') {
      const race = await prisma.vendorBooth.findFirst({
        where: { hubId, isHubOwnerBooth: true },
        select: { id: true, userId: true, stripeAccountId: true },
      });
      if (race) return { id: race.id, userId: race.userId as string, stripeAccountId: race.stripeAccountId };
    }
    throw error;
  }
}
