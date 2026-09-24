/**
 * Server-only fetch wrapper — attaches the x-ssr-secret trust header to every
 * outgoing server-side (getStaticProps/getStaticPaths/getServerSideProps) call to
 * our own backend, so it's recognized by isTrustedServerRequest()
 * (packages/backend/src/middleware/rateLimitShared.ts) and skipped by the
 * anonymous per-IP rate limiters instead of competing with real shopper traffic
 * from Vercel's shared serverless egress IPs (same trust boundary already used
 * by /api/revalidate and /api/internal/isr-log).
 *
 * This is the single implementation of the pattern that used to be copy-pasted
 * inline per call site as:
 *   headers: process.env.REVALIDATE_SECRET ? { 'x-ssr-secret': process.env.REVALIDATE_SECRET } : undefined
 *
 * Never throws on a missing secret — falls back to an unheadered fetch, matching
 * prior behavior (local dev without REVALIDATE_SECRET set still works, just
 * without the rate-limit exemption).
 *
 * Client-side only fetches (real end-user browser requests) should NOT use this —
 * they don't need the header and REVALIDATE_SECRET is a server-only env var
 * (never NEXT_PUBLIC_) that isn't available in the browser bundle anyway.
 */

export async function serverFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const secret = process.env.REVALIDATE_SECRET;

  if (!secret) {
    return fetch(url, init);
  }

  const headers = new Headers(init.headers);
  headers.set('x-ssr-secret', secret);

  return fetch(url, { ...init, headers });
}
