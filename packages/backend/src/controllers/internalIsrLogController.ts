import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

/**
 * ADR-2026-09-16-isr-regeneration-logging.
 *
 * Records one ISR getStaticProps invocation (a real "ISR write") into an
 * hourly-bucketed aggregate, tagged by route, outcome branch, and the
 * deployment that produced it. Built to answer "what is causing all the ISR
 * writes" with real queryable data spanning many deploys, not a one-off spot
 * check. Deliberately aggregated (one row per route+outcome+deploymentId+hour,
 * incremented) rather than one row per event -- a per-event log would double
 * this feature's own write volume against the exact metric it measures.
 *
 * Auth: same trust boundary as /api/revalidate on the frontend -- a `secret`
 * query param that must match process.env.REVALIDATE_SECRET. Not a new secret
 * to provision; this endpoint is only ever called by our own frontend's
 * server-side getStaticProps code.
 *
 * Fire-and-forget from the CALLER's perspective (frontend never blocks on this
 * mattering) but this handler itself responds fast -- it's a single upsert.
 */

const KNOWN_ROUTES = new Set(['sales/[id]', 'items/[id]']);
const KNOWN_OUTCOMES = new Set([
  'success_active',
  'success_ended',
  'backend_404',
  'malformed_body',
  'missing_api_url',
  'backend_non_2xx',
  'catch_network_error',
]);

function truncateToHour(date: Date): Date {
  const truncated = new Date(date);
  truncated.setUTCMinutes(0, 0, 0);
  return truncated;
}

export async function logIsrWrite(req: Request, res: Response): Promise<Response> {
  const expectedSecret = process.env.REVALIDATE_SECRET;
  const providedSecret = req.query.secret as string | undefined;

  if (!expectedSecret || !providedSecret || providedSecret !== expectedSecret) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const { route, outcome, deploymentId } = req.body ?? {};

  if (typeof route !== 'string' || !KNOWN_ROUTES.has(route)) {
    return res.status(400).json({ message: 'Invalid or unknown "route"' });
  }
  if (typeof outcome !== 'string' || !KNOWN_OUTCOMES.has(outcome)) {
    return res.status(400).json({ message: 'Invalid or unknown "outcome"' });
  }
  const safeDeploymentId =
    typeof deploymentId === 'string' && deploymentId.length > 0 ? deploymentId.slice(0, 40) : 'unknown';

  const hourBucket = truncateToHour(new Date()); // server-computed -- never trust a client timestamp

  try {
    // Raw upsert for an atomic increment -- prisma.upsert() is read-then-write,
    // which can lose increments under concurrent requests hitting the same
    // bucket (this endpoint will see concurrent traffic by design).
    await prisma.$executeRaw`
      INSERT INTO "IsrRegenerationLog" (id, route, outcome, "deploymentId", "hourBucket", count, "createdAt", "updatedAt")
      VALUES (gen_random_uuid()::text, ${route}, ${outcome}, ${safeDeploymentId}, ${hourBucket}, 1, now(), now())
      ON CONFLICT (route, outcome, "deploymentId", "hourBucket")
      DO UPDATE SET count = "IsrRegenerationLog".count + 1, "updatedAt" = now()
    `;
    return res.status(200).json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[internalController] logIsrWrite failed:', message);
    // Never let a logging failure look like a real error to the caller -- the
    // caller (getStaticProps) already treats this as fire-and-forget and will
    // swallow it regardless, but 200 keeps this endpoint's own error budget
    // clean for anyone watching it separately.
    return res.status(200).json({ ok: false, error: message });
  }
}
