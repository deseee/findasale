/**
 * listingHealthScore.ts — Listing Health Score Utility
 *
 * Computes a health score (0–100) for draft items based on completeness.
 * Used to gate publishing and guide organizers toward better listings.
 *
 * Score is computed, not persisted. No schema changes required.
 */

export interface HealthBreakdown {
  photo: number; // 0–40
  title: number; // 0–20
  description: number; // 0–20
  tags: number; // 0–15
  price: number; // 0–5
  conditionGrade?: number; // 0–5
}

export interface HealthResult {
  score: number; // 0–100
  grade: 'blocked' | 'nudge' | 'clear';
  breakdown: HealthBreakdown;
}

/**
 * Minimal shape needed to compute health score.
 * Matches Item draft fields without importing from shared (avoid circular deps).
 */
interface ItemDraft {
  photoUrls?: string[];
  title?: string | null;
  description?: string | null;
  tags?: string[];
  price?: number | null;
  conditionGrade?: string | null;
}

/**
 * Compute health score for a draft item.
 *
 * Scoring algorithm:
 * - 0 photos → 0 pts; 1 photo → 25 pts; 2–3 photos → 35 pts; 4+ photos → 40 pts
 * - No title → 0 pts; < 15 chars → 10 pts; ≥ 15 chars → 20 pts
 * - No description → 0 pts; < 50 chars → 10 pts; ≥ 50 chars → 20 pts
 * - 0 tags → 0 pts; 1–2 tags → 7 pts; 3+ tags → 15 pts
 * - No price → 0 pts; price set → 5 pts
 * - No conditionGrade → 0 pts; grade set → 5 pts (#64)
 *
 * Gate logic:
 * - score < 40 → 'blocked' (cannot publish)
 * - 40 ≤ score < 70 → 'nudge' (amber, suggested improvements)
 * - score ≥ 70 → 'clear' (ready to publish)
 */
export function computeHealthScore(item: ItemDraft): HealthResult {
  const breakdown: HealthBreakdown = {
    photo: 0,
    title: 0,
    description: 0,
    tags: 0,
    price: 0,
    conditionGrade: 0,
  };

  // Photo score (0–40)
  const photoCount = item.photoUrls?.length ?? 0;
  if (photoCount === 0) {
    breakdown.photo = 0;
  } else if (photoCount === 1) {
    breakdown.photo = 25;
  } else if (photoCount >= 2 && photoCount <= 3) {
    breakdown.photo = 35;
  } else {
    breakdown.photo = 40;
  }

  // Title score (0–20)
  if (!item.title) {
    breakdown.title = 0;
  } else if (item.title.length < 15) {
    breakdown.title = 10;
  } else {
    breakdown.title = 20;
  }

  // Description score (0–20)
  if (!item.description) {
    breakdown.description = 0;
  } else if (item.description.length < 50) {
    breakdown.description = 10;
  } else {
    breakdown.description = 20;
  }

  // Tags score (0–15)
  const tagCount = item.tags?.length ?? 0;
  if (tagCount === 0) {
    breakdown.tags = 0;
  } else if (tagCount >= 1 && tagCount <= 2) {
    breakdown.tags = 7;
  } else {
    breakdown.tags = 15;
  }

  // Price score (0–5)
  breakdown.price = item.price ? 5 : 0;

  // Condition Grade score (0–5) — #64
  breakdown.conditionGrade = item.conditionGrade ? 5 : 0;

  // Total score
  const score = breakdown.photo + breakdown.title + breakdown.description + breakdown.tags + breakdown.price + breakdown.conditionGrade;

  // Determine grade
  let grade: 'blocked' | 'nudge' | 'clear';
  if (score < 40) {
    grade = 'blocked';
  } else if (score < 70) {
    grade = 'nudge';
  } else {
    grade = 'clear';
  }

  return {
    score,
    grade,
    breakdown,
  };
}
