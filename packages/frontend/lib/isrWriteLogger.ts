/**
 * ADR-2026-09-16-isr-regeneration-logging.
 *
 * Reports one ISR getStaticProps invocation to the backend's hourly-bucketed
 * aggregate log, so ISR-write investigations have real queryable data across
 * many deploys instead of a one-off before/after spot check. Fire-and-forget
 * in spirit -- callers never await meaningfully on this mattering -- but the
 * call itself IS awaited internally with a short timeout, because an
 * unawaited fetch() in a Vercel Node.js serverless function risks being
 * killed the instant getStaticProps returns (a well-known serverless
 * gotcha), the same reasoning already applied to this codebase's other
 * server-side fetches (see resolveApiBase()'s 3s AbortController pattern in
 * pages/sales/[id].tsx).
 *
 * Never throws. A logging failure must never affect the page it instruments.
 */

const ISR_WRITE_LOGGING_ENABLED = process.env.ISR_WRITE_LOGGING_ENABLED !== 'false'; // kill switch, default on
const LOG_TIMEOUT_MS = 800; // short -- must not add meaningful latency to page generation

export type IsrLogRoute = 'sales/[id]' | 'items/[id]';

export type IsrLogOutcome =
  | 'success_active'
  | 'success_ended'
  | 'backend_404'
  | 'malformed_body'
  | 'missing_api_url'
  | 'backend_non_2xx'
  | 'catch_network_error';

export async function logIsrWrite(route: IsrLogRoute, outcome: IsrLogOutcome): Promise<void> {
  if (!ISR_WRITE_LOGGING_ENABLED) return;

  const apiUrl = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || null;
  const secret = process.env.REVALIDATE_SECRET;
  if (!apiUrl || !secret) return; // fail silent -- logging must never break page generation

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LOG_TIMEOUT_MS);
    await fetch(`${apiUrl}/internal/isr-log?secret=${encodeURIComponent(secret)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        route,
        outcome,
        deploymentId: (process.env.VERCEL_GIT_COMMIT_SHA || 'unknown').slice(0, 8),
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
  } catch {
    // Never throw -- matches revalidationService.ts's fire-and-forget precedent.
  }
}
