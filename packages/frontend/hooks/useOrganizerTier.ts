import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../components/AuthContext';
import api from '../lib/api';

export type SubscriptionTier = 'SIMPLE' | 'PRO' | 'TEAMS';

const TIER_RANK: Record<SubscriptionTier, number> = {
  SIMPLE: 0,
  PRO: 1,
  TEAMS: 2,
};

function hasAccess(organizerTier: SubscriptionTier, requiredTier: SubscriptionTier): boolean {
  return TIER_RANK[organizerTier] >= TIER_RANK[requiredTier];
}

// 2026-09-29 (Patrick D2): real paid-time state, read from GET /billing/subscription only when it
// matters (the lapse flag is set, or the last payment failed). Shared across every component that
// uses this hook: one request per user per minute, not one per component. Any failure resolves to
// null and the hook then behaves exactly as it did before (lapse flag wins, gates stay closed).
type EntitlementInfo = { entitlementEndsAt: string | null; inDunning: boolean };
const ENTITLEMENT_TTL_MS = 60 * 1000;
let entitlementCache: { userId: string; at: number; value: EntitlementInfo } | null = null;
let entitlementInFlight: { userId: string; promise: Promise<EntitlementInfo | null> } | null = null;

function loadEntitlement(userId: string): Promise<EntitlementInfo | null> {
  if (entitlementCache && entitlementCache.userId === userId && Date.now() - entitlementCache.at < ENTITLEMENT_TTL_MS) {
    return Promise.resolve(entitlementCache.value);
  }
  if (entitlementInFlight && entitlementInFlight.userId === userId) {
    return entitlementInFlight.promise;
  }
  const promise: Promise<EntitlementInfo | null> = api
    .get('/billing/subscription')
    .then((res) => {
      const value: EntitlementInfo = {
        entitlementEndsAt: res.data?.entitlementEndsAt ?? null,
        inDunning: !!res.data?.inDunning,
      };
      entitlementCache = { userId, at: Date.now(), value };
      return value;
    })
    .catch(() => null)
    .finally(() => {
      if (entitlementInFlight && entitlementInFlight.promise === promise) entitlementInFlight = null;
    });
  entitlementInFlight = { userId, promise };
  return promise;
}

/**
 * Hook to check organizer subscription tier access.
 * Tier logic is inlined — shared package is not a frontend dependency.
 * Frontend-only hook — use in components to conditionally render features.
 *
 * IMPORTANT: canAccess is memoized with useCallback so its reference is stable
 * across renders (only changes when tier changes). Components using it in a
 * useEffect dependency array rely on this stability — without memoization the
 * effect fires on every render, causing infinite-loop API hammering (S562 bug).
 *
 * Feature #75: HARD GATE — if subscription is lapsed, organizer is treated as SIMPLE tier
 * regardless of subscribed tier. canAccess() enforces this.
 *
 * 2026-09-29 (Patrick D2, PRO/TEAMS features stay available until the subscription actually runs
 * out): the lapse flag (UserRoleSubscription.tierLapsedAt) is only a mirror and can be set while
 * paid time remains (payment failed but still inside the retry window, a trial ending hours before
 * the next charge run). The hard gate now applies only when the server says there is no paid time
 * left: GET /billing/subscription's `entitlementEndsAt` (computed from the Organizer row, the same
 * row the backend tier gate reads) being in the future overrides the lapse flag. `isLapsed` below
 * therefore means "truly lapsed", and `inDunning` means "payment failed, plan still active".
 */
export function useOrganizerTier() {
  const { user, isLoading: authLoading } = useAuth();
  // While auth is still initializing, return null tier to prevent flash of wrong plan.
  // Feature #75: If subscription is lapsed, treat as SIMPLE (hard gate).
  //
  // S-TIER-RECONCILE: there is deliberately NO `|| 'SIMPLE'` fallback here any more.
  // AuthContext.resolveOrganizerTier() leaves organizerTier `undefined` when the tier
  // could not be read from either the /auth/me response or the JWT. Collapsing that
  // to 'SIMPLE' is what silently downgraded paying PRO/TEAMS organizers: every gated
  // feature vanished AND the UI started asking them to buy a plan they already own.
  // Unknown is now its own state — `tier === null` with `tierKnown === false`.
  // Gates stay CLOSED on unknown (fail-safe, matches the loading behaviour), but
  // upgrade/downgrade copy must key off `tierKnown`, not off `!canAccess(...)`.
  const rawTier = user?.organizerTier;
  const rawTierKnown = !authLoading && !!user && (rawTier !== undefined && rawTier !== null && rawTier !== '');
  const rawPaid = rawTierKnown && (rawTier === 'PRO' || rawTier === 'TEAMS');
  const rawLapsed = !authLoading && (user?.subscriptionLapsed ?? false);
  const orgStatus = user?.subscriptionStatus ?? null;
  const userId = user?.id;

  // Only a paid-tier organizer who is flagged lapsed, or whose last payment failed, needs the
  // extra read. Everyone else never triggers a request.
  const needsEntitlement = !authLoading && !!userId && rawPaid && (rawLapsed || orgStatus === 'past_due');
  // undefined = not fetched yet, null = fetch failed (fall back to the lapse flag), object = loaded.
  const [entitlement, setEntitlement] = useState<EntitlementInfo | null | undefined>(undefined);
  useEffect(() => {
    if (!needsEntitlement || !userId) {
      setEntitlement((prev) => (prev === undefined ? prev : undefined));
      return;
    }
    let cancelled = false;
    loadEntitlement(userId).then((value) => {
      if (!cancelled) setEntitlement(value);
    });
    return () => {
      cancelled = true;
    };
  }, [needsEntitlement, userId]);

  const entitlementEndsAt: Date | null =
    entitlement && entitlement.entitlementEndsAt ? new Date(entitlement.entitlementEndsAt) : null;
  // 2026-09-29 lapse policy (Patrick D1/D2, unified with the backend): PRO/TEAMS features remain until
  // the subscription ACTUALLY ends, and Organizer.subscriptionTier (rawTier) is the truth because the
  // end-of-period downgrade job rewrites it to SIMPLE. The lapse flag alone therefore never downgrades
  // anyone. The plan counts as truly ended only when the server gave an entitlementEndsAt that is
  // already in the past. When the entitlement lookup fails or returns null (legacy organizers with no
  // billingCurrentPeriodEnd / subscriptionStatus, or a network error) we fall back to subscriptionTier.
  const planTrulyEnded = !!entitlementEndsAt && entitlementEndsAt.getTime() <= Date.now();
  const stillEntitled = rawLapsed && !planTrulyEnded;
  // While the entitlement read is in flight for a lapsed paid organizer the answer is unknown:
  // keep gates closed but do not show "you are on SIMPLE" or upgrade copy.
  const entitlementPending = rawLapsed && needsEntitlement && entitlement === undefined;
  const tierKnown = rawTierKnown && !entitlementPending;

  const isLapsed = rawLapsed && !stillEntitled && !entitlementPending;
  const inDunning = rawPaid && !isLapsed && (entitlement ? entitlement.inDunning : orgStatus === 'past_due');

  const tier: SubscriptionTier | null = authLoading || entitlementPending
    ? null
    : (isLapsed
      ? 'SIMPLE'
      : (tierKnown ? (rawTier as SubscriptionTier) : null));

  /**
   * Check if organizer has access to a required tier feature.
   * Returns false while auth is loading (safe default — don't show gated features early).
   * Feature #75: Returns false for PRO/TEAMS features when subscription is lapsed.
   * @param requiredTier - The minimum tier required (PRO, TEAMS, etc.)
   * @returns true if organizer's tier >= requiredTier and subscription is not lapsed
   */
  const canAccess = useCallback(
    (requiredTier: SubscriptionTier): boolean => {
      if (!tier) return false;
      if (isLapsed && requiredTier !== 'SIMPLE') return false;
      return hasAccess(tier, requiredTier);
    },
    [tier, isLapsed]
  );

  return {
    /**
     * Current organizer's tier: SIMPLE, PRO, or TEAMS.
     * null while auth is still loading, AND null when the tier could not be
     * resolved from any source — check `tierKnown` to tell those apart from
     * a genuine SIMPLE tier.
     */
    tier,
    /** True while auth context is still resolving — gate any tier-dependent UI */
    tierLoading: authLoading,
    /**
     * S-TIER-RECONCILE: true only when a real tier value was received.
     * False while loading, when logged out, or when the tier was missing from
     * both /auth/me and the JWT. NEVER render "Upgrade to ..." copy, a plan
     * name, or a downgrade banner while this is false — a paying customer
     * must not be told to buy the plan they already pay for.
     */
    tierKnown,
    canAccess,
    /**
     * True if the subscription has TRULY lapsed (no paid time left) — Feature #75. A payment
     * failure inside the retry window is NOT lapsed: see `inDunning`.
     */
    isLapsed,
    /** 2026-09-29: last payment failed but the plan stays active until `entitlementEndsAt`. */
    inDunning,
    /** 2026-09-29: when paid access ends, once known (only fetched for lapsed or past_due organizers). */
    entitlementEndsAt,
    /**
     * Convenience checks for common tiers.
     * All return false while loading.
     */
    isSimple: tier === 'SIMPLE',
    isPro: tier === 'PRO' || tier === 'TEAMS',
    isTeams: tier === 'TEAMS',
  };
}
