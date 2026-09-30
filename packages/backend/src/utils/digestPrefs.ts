/**
 * Weekly digest preferences (2026-09-29).
 *
 * A user can be both a shopper and an organizer, and each role gets its own weekly email:
 *   - shopper weekly digest ("sales near you")      -> notificationPrefs.emailWeeklyDigest
 *   - organizer weekly performance digest           -> notificationPrefs.emailWeeklyOrganizerDigest
 *
 * They used to share emailWeeklyDigest, so opting out of one silently opted the user out of the other.
 * The organizer digest now has its own key. For accounts that have never touched the new key we
 * fall back to the old one, so nobody silently loses or regains emails at deploy time:
 *   - emailWeeklyOrganizerDigest is a boolean  -> it decides.
 *   - otherwise                                -> emailWeeklyDigest === false means opted out (old behavior).
 */
export const ORGANIZER_DIGEST_PREF_KEY = 'emailWeeklyOrganizerDigest';

const asPrefs = (prefs: unknown): Record<string, unknown> =>
  prefs && typeof prefs === 'object' && !Array.isArray(prefs) ? (prefs as Record<string, unknown>) : {};

export function isOrganizerDigestEnabled(prefs: unknown): boolean {
  const p = asPrefs(prefs);
  const own = p[ORGANIZER_DIGEST_PREF_KEY];
  if (typeof own === 'boolean') return own;
  return p['emailWeeklyDigest'] !== false;
}

export function isShopperDigestEnabled(prefs: unknown): boolean {
  return asPrefs(prefs)['emailWeeklyDigest'] !== false;
}
