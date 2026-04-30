/**
 * Watermark Policy Utility
 *
 * Determines whether an organizer can remove watermarks from exports and shareable content.
 * Default-deny semantics: failure modes always result in watermarked output.
 */

/**
 * NOTE: We intentionally do NOT import from '@findasale/shared'.
 * The workspace alias does not resolve in the Railway Docker build (S574 documented).
 * TEAMS check is inlined below — trivial comparison, no need for the shared helper.
 */

export interface WatermarkPolicyOrganizer {
  subscriptionTier: string | null | undefined;
  removeWatermarkEnabled?: boolean | null;
}

/**
 * Check if an organizer can remove watermarks.
 *
 * Returns true ONLY when:
 * 1. Organizer exists
 * 2. removeWatermarkEnabled is explicitly true
 * 3. Organizer is on TEAMS subscription tier
 *
 * All other cases (free/SIMPLE/PRO, lapsed, missing organizer, toggle off) return false.
 * Watermarks are applied when this function returns false.
 */
export function canRemoveWatermark(organizer: WatermarkPolicyOrganizer | null | undefined): boolean {
  if (!organizer) return false;
  if (!organizer.removeWatermarkEnabled) return false;
  return organizer.subscriptionTier === 'TEAMS';
}
