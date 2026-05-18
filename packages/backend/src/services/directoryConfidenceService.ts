/**
 * directoryConfidenceService — Feature #458
 *
 * Calculates a 0.0–1.0 confidence score for an organizer directory entry
 * based on data completeness and corroboration signals.
 *
 * Factors (max 1.0):
 *   +0.20  contactEmail is set
 *   +0.20  website is set
 *   +0.10  phone is set
 *   +0.20  isStateLicensed is true
 *   +0.10  sourceCount >= 2
 *   +0.10  address is set (non-empty)
 *   +0.10  directoryMostRecentSource is set
 */

import { prisma } from '../lib/prisma';

interface OrganizerConfidenceFields {
  contactEmail?: string | null;
  website?: string | null;
  phone?: string | null;
  isStateLicensed?: boolean | null;
  sourceCount?: number | null;
  address?: string | null;
  directoryMostRecentSource?: string | null;
}

export function calculateDirectoryConfidence(organizer: OrganizerConfidenceFields): number {
  let score = 0;

  if (organizer.contactEmail) score += 0.2;
  if (organizer.website) score += 0.2;
  if (organizer.phone) score += 0.1;
  if (organizer.isStateLicensed === true) score += 0.2;
  if ((organizer.sourceCount ?? 1) >= 2) score += 0.1;
  if (organizer.address && organizer.address.trim().length > 0) score += 0.1;
  if (organizer.directoryMostRecentSource) score += 0.1;

  // Round to 2 decimal places
  return Math.round(score * 100) / 100;
}

/**
 * Recalculate and persist the confidence score for a single organizer.
 * Call this after any enrichment that updates the fields above.
 */
export async function updateDirectoryConfidenceScore(organizerId: string): Promise<void> {
  const organizer = await prisma.organizer.findUnique({
    where: { id: organizerId },
    select: {
      contactEmail: true,
      website: true,
      phone: true,
      isStateLicensed: true,
      sourceCount: true,
      address: true,
      directoryMostRecentSource: true,
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
