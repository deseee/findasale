/**
 * unmetDemandService — Feature #453
 *
 * Captures search queries that return zero or few results.
 * Normalizes the query and stores it for organizer onboarding guidance.
 *
 * Skip conditions:
 *   - empty string or single character
 *   - queries over 100 characters
 */

import { prisma } from '../lib/prisma';

function normalizeQuery(raw: string): string {
  return raw.toLowerCase().trim().replace(/\s+/g, ' ');
}

export async function captureUnmetDemand(
  rawQuery: string,
  city: string | null,
  state: string | null,
  resultCount: number
): Promise<void> {
  const query = normalizeQuery(rawQuery);
  if (!query || query.length < 2 || query.length > 100) return;

  await prisma.unmetDemandSignal.create({
    data: {
      query,
      city: city ?? undefined,
      state: state ?? undefined,
      resultCount,
    },
  });
}
