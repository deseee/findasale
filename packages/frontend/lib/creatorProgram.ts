/**
 * Creator Program display constants (2026-09-29).
 *
 * MUST match CREATOR_PROGRAM in packages/backend/src/config/affiliateConfig.ts.
 * The backend is the source of truth: the join and dashboard endpoints return the live values, and
 * pages prefer those. These constants only feed the public terms page (no auth, no API call) and
 * first paint. If TERMS_VERSION here differs from the backend, join fails with a clear
 * "terms were updated" message instead of silently accepting the wrong version.
 */
export const CREATOR_PROGRAM_DISPLAY = {
  TERMS_VERSION: '2026-09-29',
  COMMISSION_RATE_PERCENT: 10,
  HOLD_DAYS: 30,
  ATTRIBUTION_WINDOW_DAYS: 30,
} as const;

export const formatCents = (cents: number | null | undefined): string =>
  `$${((cents ?? 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
