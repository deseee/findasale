// Retry timing for extension-driven marketplace removals once an item+platform is past the fast-fail
// skip cap (MAX_REMOVAL_SKIP_ATTEMPTS in extensionController.ts). Shared by the SOLD, POLICY_INELIGIBLE /
// UNPUBLISHED and ITEM_DELETED paths of getPendingRemovals so all three stay identical.
//
// S-EXT-VINTED-HARD-STOP-REPROBE (2026-10-25). The 2026-09-24 hard stop (REMOVAL_HARD_STOP_AFTER_ATTEMPTS
// skips with no remoteListingId -> never retried again) was a permanent dead-letter, and it trapped
// listings that a NEWER extension can resolve on its own. Live: item cmuqvzky806pdsm41hd5izclz ("Hortilux
// 1000 Watt Dual Arc Grow Lamp, Super HPS & Metal Halide", VINTED). On 2026-10-11 an extension older than
// 1.0.24 did a complete wardrobe read, found no listing with that title, and reported it as the generic
// 'no_confident_listing_match' ten times; the hard stop then fired and the item was never served again.
// 1.0.24 reports that same outcome as 'listing_not_found', which the backend auto-resolves after three
// consecutive reports -- but the item was never re-offered, so it sat as "still posted on Vinted" forever
// (a complete read of the wardrobe on 2026-10-25, 338 entries, has no such listing).
//
// Now: past the hard stop the item is re-probed once per HARD_STOP_REPROBE_MS instead of never, so a
// later extension release (or a listing that has since gone) gets a real chance. Once a probe answers
// 'listing_not_found', the normal hourly cooldown applies so the three-report confirmation streak can
// finish the same day. Deleting is unaffected: the extension still only deletes on an exact match.
export const HARD_STOP_REPROBE_MS = 24 * 60 * 60 * 1000;

export interface PostCapRetryInput {
  skipCount: number;
  hardStopAfter: number;
  hasRemoteListingId: boolean;
  lastSkipReason: string | null | undefined;
  lastSkipAt: Date | null | undefined;
  now: number;
  cooldownMs: number;
}

// Call only after the deterministic-reason stop and the fast-fail cap checks have been applied.
export function postCapRetryEligible(input: PostCapRetryInput): boolean {
  const { skipCount, hardStopAfter, hasRemoteListingId, lastSkipReason, lastSkipAt, now, cooldownMs } = input;
  if (!lastSkipAt) return true; // no timestamp on record -- fail open rather than stuck forever
  const pastHardStop = skipCount >= hardStopAfter && !hasRemoteListingId;
  const waitMs = pastHardStop && lastSkipReason !== 'listing_not_found' ? HARD_STOP_REPROBE_MS : cooldownMs;
  return now - lastSkipAt.getTime() >= waitMs;
}
