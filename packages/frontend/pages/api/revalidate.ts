import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * ADR (2026-07-11): Event-driven ISR revalidation entry point.
 *
 * Standard Next.js on-demand revalidation, secret-gated. Called by the backend
 * after real mutation events (scraper ingestion, prune batches, organizer sale
 * publish/update/cancel/delete) so unclaimed listing pages update immediately
 * instead of waiting on the blanket time-based `revalidate` fallback.
 *
 * Scope (strict — see ADR 2): only /sales/[id] and /city/[slug] are revalidated
 * through this route today. Do not widen without a follow-up ADR.
 *
 * Auth: `secret` query param (or `x-revalidate-secret` header) must match
 * process.env.REVALIDATE_SECRET.
 *
 * Body: { paths: string[] } — e.g. ["/sales/abc123", "/city/grand-rapids-mi"].
 * Vercel does not guarantee unlimited on-demand revalidations per deploy, so
 * each path is revalidated independently and failures are collected rather
 * than aborting the whole batch.
 */

interface RevalidateResult {
  path: string;
  revalidated: boolean;
  error?: string;
}

interface RevalidateResponseBody {
  ok: boolean;
  results: RevalidateResult[];
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RevalidateResponseBody | { message: string }>
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const expectedSecret = process.env.REVALIDATE_SECRET;
  const providedSecret =
    (req.query.secret as string | undefined) ??
    (req.headers['x-revalidate-secret'] as string | undefined);

  if (!expectedSecret || !providedSecret || providedSecret !== expectedSecret) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const paths = req.body?.paths;
  if (!Array.isArray(paths) || paths.length === 0) {
    return res.status(400).json({ message: 'Request body must include a non-empty "paths" array' });
  }

  const results: RevalidateResult[] = [];

  for (const rawPath of paths) {
    if (typeof rawPath !== 'string' || !rawPath.startsWith('/')) {
      results.push({ path: String(rawPath), revalidated: false, error: 'Invalid path — must be a string starting with "/"' });
      continue;
    }

    try {
      await res.revalidate(rawPath);
      results.push({ path: rawPath, revalidated: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[api/revalidate] Failed to revalidate ${rawPath}:`, message);
      results.push({ path: rawPath, revalidated: false, error: message });
    }
  }

  const anyFailed = results.some((r) => !r.revalidated);
  return res.status(anyFailed ? 207 : 200).json({ ok: !anyFailed, results });
}
