/**
 * Public display names (2026-09-29, data minimization: GDPR Art. 5(1)(c) / CCPA).
 *
 * Shopper names never appear in full on a public surface. Where a name is shown at all it is
 * "First name + last initial" ("Jane D."), and only for shoppers who opted in with the
 * notificationPrefs.showNameInGoingList preference (default OFF). Everyone else is "Someone".
 */

export const SHOW_NAME_PREF_KEY = 'showNameInGoingList';

/** "Jane Doe" -> "Jane D.", "Jane" -> "Jane", "" / null / an email address -> null. */
export function firstNameLastInitial(name: string | null | undefined): string | null {
  if (!name) return null;
  const cleaned = String(name).replace(/\s+/g, ' ').trim();
  if (!cleaned || cleaned.includes('@')) return null;
  const parts = cleaned.split(' ');
  const first = parts[0].slice(0, 30);
  if (!first) return null;
  if (parts.length === 1) return first;
  const lastInitial = Array.from(parts[parts.length - 1])[0]?.toUpperCase();
  return lastInitial && /\p{L}/u.test(lastInitial) ? `${first} ${lastInitial}.` : first;
}

/** True only when the shopper explicitly opted in. Missing/false/garbage all mean "keep me anonymous". */
export function hasOptedIntoPublicName(prefs: unknown): boolean {
  return !!prefs && typeof prefs === 'object' && (prefs as Record<string, unknown>)[SHOW_NAME_PREF_KEY] === true;
}

/**
 * The ONE label for a member shown on a public leaderboard, roster or feed (Hall of Fame, Collector's League, crews,
 * streak board): "Jane D." only when the member opted in (notificationPrefs.showNameInGoingList) AND the stored name
 * is a real name (an email address, which some accounts carry as their name, is never shown). Everyone else gets the
 * neutral `fallback` ("Explorer" by default). Never returns more than first name + last initial.
 */
export function publicMemberLabel(name: string | null | undefined, prefs: unknown, fallback = 'Explorer'): string {
  if (!hasOptedIntoPublicName(prefs)) return fallback;
  return firstNameLastInitial(name) ?? fallback;
}

/** The label to show publicly for a shopper: "Jane D." if opted in, otherwise "Someone". */
export function publicShopperLabel(name: string | null | undefined, prefs: unknown): string {
  if (!hasOptedIntoPublicName(prefs)) return 'Someone';
  return firstNameLastInitial(name) ?? 'Someone';
}
