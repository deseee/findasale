/**
 * #462/#463/#464 — UTM Parameter Preservation
 *
 * Root cause (confirmed S836): Chrome strips `utm_*` params in incognito mode before
 * the request reaches the server. Server-side middleware never sees them.
 *
 * Fix: Email/outreach links now use `fsa_*` param names (fsa_src, fsa_med, fsa_cmp,
 * fsa_cnt) which Chrome does not recognise as tracking params and does not strip.
 *
 * This middleware captures BOTH fsa_* (new) and utm_* (legacy / non-incognito) and
 * writes them to a short-lived cookie so UTMCapture in _app.tsx can read them after
 * any redirect that might still move the URL.
 *
 * Cookie: fsa_utm_pending — JSON, path=/, maxAge=300s, httpOnly=false, sameSite=lax.
 *
 * Flag 4 — AI Crawler Visit Tracking:
 * ISR pages (sales/[id], city/[slug], this-weekend/[city]) are served directly by
 * Vercel — bots crawling these pages never reach the Express backend, so
 * crawlerAnalyticsMiddleware sees zero entries. This middleware runs on EVERY
 * request (including bots) and fires a fire-and-forget POST to /api/crawler-log
 * for known crawlers on page paths. The backend route writes the CrawlerVisit record.
 *
 * Sitemap index (fix/sitemap-stale-lastmod):
 * `/sitemap.xml` is rewritten to the dynamic /api/sitemap-index route, which emits
 * the sitemap INDEX with a `lastmod` computed at request time. Middleware runs before
 * static file serving, so this overrides the stale committed public/sitemap.xml
 * (frozen at lastmod 2026-05-24 because Vercel skips the next-sitemap postbuild hook).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// ── Crawler detection ──────────────────────────────────────────────────────────
const CRAWLER_PATTERNS: RegExp[] = [
  /GPTBot/i,
  /OAI-SearchBot/i,
  /Claude-Web|ClaudeBot/i,
  /PerplexityBot/i,
  /Bytespider/i,
  /Googlebot/i,
  /bingbot/i,
];

const CRAWLER_PAGE_PREFIXES = ['/sales/', '/city/', '/this-weekend/', '/organizers/'];

function isCrawler(ua: string): boolean {
  return CRAWLER_PATTERNS.some((p) => p.test(ua));
}

function isCrawlerPage(pathname: string): boolean {
  return CRAWLER_PAGE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

// ── Main middleware ────────────────────────────────────────────────────────────
export function middleware(request: NextRequest) {
  const { searchParams, pathname } = request.nextUrl;
  const ua = request.headers.get('user-agent') ?? '';

  // ── Sitemap index rewrite (fix/sitemap-stale-lastmod) ──────────────────────
  // Must run before any early return below. Middleware executes before static
  // file serving, so rewriting here makes the dynamic /api/sitemap-index route
  // (fresh lastmod) authoritative for /sitemap.xml and overrides the stale
  // committed public/sitemap.xml. Exact-match only — does not affect
  // /server-sitemap.xml.
  if (pathname === '/sitemap.xml') {
    return NextResponse.rewrite(new URL('/api/sitemap-index', request.url));
  }

  // ── Crawler tracking (Flag 4 fix) ──────────────────────────────────────────
  // Fire-and-forget: never await, never block the response.
  if (isCrawler(ua) && isCrawlerPage(pathname)) {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      '';
    const backendUrl = (
      process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api'
    ).replace(/\/api$/, ''); // strip trailing /api — we append /api/crawler-log ourselves
    fetch(`${backendUrl}/api/crawler-log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userAgent: ua, path: pathname, ip }),
    }).catch(() => {
      // Intentionally silent — crawler analytics must never affect page delivery
    });
  }

  // ── UTM / fsa_* attribution capture ───────────────────────────────────────
  // fsa_* params: used in outreach emails (Chrome-safe names)
  const fsa_src = searchParams.get('fsa_src');
  const fsa_med = searchParams.get('fsa_med');
  const fsa_cmp = searchParams.get('fsa_cmp');
  const fsa_cnt = searchParams.get('fsa_cnt');

  // utm_* params: fallback for non-incognito clicks (social shares, direct links)
  const utm_source = searchParams.get('utm_source');
  const utm_medium = searchParams.get('utm_medium');
  const utm_campaign = searchParams.get('utm_campaign');
  const utm_content = searchParams.get('utm_content');

  const ref = searchParams.get('ref');

  // Act only when at least one attribution param is present
  const hasFsa = fsa_src || fsa_med || fsa_cmp || fsa_cnt;
  const hasUtm = utm_source || utm_medium || utm_campaign || utm_content;
  if (!hasFsa && !hasUtm) {
    return NextResponse.next();
  }

  const response = NextResponse.next();

  // Normalise to utm_* names in the cookie regardless of input format
  const utmData = JSON.stringify({
    ...(fsa_src || utm_source ? { utm_source: fsa_src ?? utm_source } : {}),
    ...(fsa_med || utm_medium ? { utm_medium: fsa_med ?? utm_medium } : {}),
    ...(fsa_cmp || utm_campaign ? { utm_campaign: fsa_cmp ?? utm_campaign } : {}),
    ...(fsa_cnt || utm_content ? { utm_content: fsa_cnt ?? utm_content } : {}),
    ...(ref ? { ref } : {}),
    captured_at: new Date().toISOString(),
  });

  response.cookies.set('fsa_utm_pending', utmData, {
    path: '/',
    maxAge: 300,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: false,
  });

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|_next/data|favicon\\.ico|icons/|sw\\.js|workbox-|manifest\\.json|offline\\.html|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|eot|css|js)$).*)',
  ],
};
