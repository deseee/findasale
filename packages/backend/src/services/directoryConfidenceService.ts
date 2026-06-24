/**
 * directoryConfidenceService — Feature #458
 *
 * Calculates a 0.0–1.0 confidence score for an organizer directory entry
 * based on source authority, data completeness, and data freshness.
 *
 * Step 1 — Source floor (highest applicable):
 *   0.75  isClaimed=true AND claimStatus='CLAIMED'
 *   0.70  isStateLicensed=true OR verificationStatus='VERIFIED'
 *   0.60  esnOrgId IS NOT NULL
 *   0.45  foursquareVenueId IS NOT NULL
 *   0.40  googlePlaceId IS NOT NULL OR yelpBusinessId IS NOT NULL
 *   0.30  sourceCount >= 2
 *   0.15  default
 *
 * Step 2 — Additive bonuses:
 *   +0.08  contactEmail
 *   +0.06  website
 *   +0.04  phone
 *   +0.04  address (non-empty)
 *   +0.02  directoryMostRecentSource
 *   +0.03  googleRating
 *   +0.01  businessCategory
 *
 * Step 3 — Staleness multiplier:
 *   ×0.50  directoryLastCheckedAt < now-365d
 *   ×0.75  directoryLastCheckedAt < now-180d
 *   ×0.70  directoryLastCheckedAt IS NULL
 *   ×1.0   otherwise
 *
 * Step 4: finalScore = Math.min(1.0, Math.round((floor + bonuses) * staleness * 100) / 100)
 */

import { prisma } from '../lib/prisma';

interface OrganizerConfidenceFields {
  isClaimed?: boolean | null;
  claimStatus?: string | null;
  isStateLicensed?: boolean | null;
  verificationStatus?: string | null;
  esnOrgId?: number | null;
  foursquareVenueId?: string | null;
  googlePlaceId?: string | null;
  yelpBusinessId?: string | null;
  sourceCount?: number | null;
  contactEmail?: string | null;
  website?: string | null;
  phone?: string | null;
  address?: string | null;
  directoryMostRecentSource?: string | null;
  googleRating?: number | null;
  businessCategory?: string | null;
  directoryLastCheckedAt?: Date | null;
}

export function calculateDirectoryConfidence(organizer: OrganizerConfidenceFields): number {
  // Step 1 — Source floor (pick highest applicable)
  let floor = 0.15;
  if (organizer.isClaimed === true && organizer.claimStatus === 'CLAIMED') {
    floor = 0.75;
  } else if (organizer.isStateLicensed === true || organizer.verificationStatus === 'VERIFIED') {
    floor = 0.70;
  } else if (organizer.esnOrgId != null) {
    floor = 0.60;
  } else if (organizer.foursquareVenueId != null) {
    floor = 0.45;
  } else if (organizer.googlePlaceId != null || organizer.yelpBusinessId != null) {
    floor = 0.40;
  } else if ((organizer.sourceCount ?? 0) >= 2) {
    floor = 0.30;
  }

  // Step 2 — Additive bonuses
  let bonuses = 0;
  if (organizer.contactEmail) bonuses += 0.08;
  if (organizer.website) bonuses += 0.06;
  if (organizer.phone) bonuses += 0.04;
  if (organizer.address && organizer.address.trim().length > 0) bonuses += 0.04;
  if (organizer.directoryMostRecentSource) bonuses += 0.02;
  if (organizer.googleRating != null) bonuses += 0.03;
  if (organizer.businessCategory) bonuses += 0.01;

  // Step 3 — Staleness multiplier
  let staleness = 1.0;
  if (organizer.directoryLastCheckedAt == null) {
    staleness = 0.70;
  } else {
    const now = Date.now();
    const checkedMs = organizer.directoryLastCheckedAt.getTime();
    const daysSinceCheck = (now - checkedMs) / (1000 * 60 * 60 * 24);
    if (daysSinceCheck >= 365) {
      staleness = 0.50;
    } else if (daysSinceCheck >= 180) {
      staleness = 0.75;
    }
  }

  // Step 4 — Final score
  return Math.min(1.0, Math.round((floor + bonuses) * staleness * 100) / 100);
}

/**
 * Recalculate and persist the confidence score for a single organizer.
 * Call this after any enrichment that updates the fields above.
 */
export async function updateDirectoryConfidenceScore(organizerId: string): Promise<void> {
  const organizer = await prisma.organizer.findUnique({
    where: { id: organizerId },
    select: {
      isClaimed: true,
      claimStatus: true,
      isStateLicensed: true,
      verificationStatus: true,
      esnOrgId: true,
      foursquareVenueId: true,
      googlePlaceId: true,
      yelpBusinessId: true,
      sourceCount: true,
      contactEmail: true,
      website: true,
      phone: true,
      address: true,
      directoryMostRecentSource: true,
      googleRating: true,
      businessCategory: true,
      directoryLastCheckedAt: true,
    },
  });

  if (!organizer) return;

  const score = calculateDirectoryConfidence(organizer);

  await prisma.organizer.update({
    where: { id: organizerId },
    data: {
      directoryConfidenceScore: score,
      confidenceLastCalculated: new Date(),
    },
  });
}
