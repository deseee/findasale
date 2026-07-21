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
 *
 * Matcher scoping (Fluid Active CPU root cause, fixed 2026-07-09):
 * Live Vercel Usage dashboard showed Fluid Active CPU at ~196% of the Hobby free
 * allocation (7h51m/4h) and Edge Requests + Function Invocations both approaching
 * their caps (87%/72%). Root cause: the matcher below previously ran this function
 * on EVERY page route sitewide (35K+ dynamic pages), even though its three concerns
 * each only apply to a narrow slice of traffic — the sitemap rewrite needs exactly
 * one path, crawler tracking only needs 4 path prefixes, and UTM/fsa_* capture only
 * matters when one of 8 specific query params is present. Restructured `config.matcher`
 * below into concern-scoped entries using Next.js's documented `has` matcher condition
 * (https://nextjs.org/docs/app/api-reference/file-conventions/proxy#matcher — stable
 * since v13.1) so Vercel's own routing layer skips invoking this function entirely for
 * traffic that needs none of the three services, instead of invoking it and returning
 * early from inside the function body. The in-function checks (isCrawlerPage/isCrawler
 * order, the hasFsa/hasUtm early return) are kept as cheap defense-in-depth, not removed.
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

  // ── Permanently deleted sale IDs (GSC 404 cleanup, 2026-07-21) ─────────────
  // These 14 Sale IDs were confirmed (psycopg2 against production DB) to be
  // genuinely and permanently deleted from the Sale table — no soft-delete
  // field exists on the model, so this is a known-finite historical list from
  // one purge event, not something that needs to be DB-driven. GSC reported
  // repeated "Not found (404)" validation failures for these URLs because
  // pages/sales/[id].tsx uses getStaticProps (ISR), which cannot return a
  // custom status code from the page component itself. Middleware already
  // runs on every /sales/:id request (crawler tracking, above/below) at zero
  // added network cost, so it handles the 410 instead. A 410 Gone (vs 404)
  // tells Google the removal is intentional and permanent, which is the
  // correct signal for content that will never come back.
  const DELETED_SALE_IDS = new Set([
    'cmqf14g6x00t9bo1nibst4yk7',
    'cmqf14aag001hbo1nkd6lqcs7',
    'cmqf14g6v00t7bo1npyinumlm',
    'cmqgf5gzi03r690oa8rt92e5q',
    'cmqf14g7500tfbo1nxqfso1ie',
    'cmqgf5kir046c90oail86mrb5',
    'cmqf14hmb010jbo1n4r4heyzz',
    'cmqf14hia00zjbo1nrw634enx',
    'cmqf14f0v00o9bo1n3ryqp5vt',
    'cmqj52zq601mui79azm2pyhd0',
    'cmqf14dka00glbo1new9x5egg',
    'cmqf14af4002bbo1nu7kw6v4a',
    'cmr7fwc6y006rzjpwt5k8lsdf',
    'cmr7g5csm00obzjpwgdn4jg3j',
  ]);

  if (pathname.startsWith('/sales/')) {
    const saleId = pathname.slice('/sales/'.length).split('/')[0];
    if (DELETED_SALE_IDS.has(saleId)) {
      return new NextResponse(null, { status: 410 });
    }
  }

  // ── Crawler tracking (Flag 4 fix) ──────────────────────────────────────────
  // Fire-and-forget: never await, never block the response.
  // Order matters for Fluid Active CPU cost: isCrawlerPage() is a cheap 4-item
  // string-prefix check; isCrawler() runs 7 regexes against the UA string. This
  // middleware runs on EVERY page request (35K+ dynamic pages). Checking the
  // cheap prefix filter first lets JS short-circuit skip the regex work entirely
  // for the majority of routes that aren't in CRAWLER_PAGE_PREFIXES.
  if (isCrawlerPage(pathname) && isCrawler(ua)) {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      '';
    const backendUrl = (
      process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api'
    ).replace(/\/api$/, ''); // strip trailing /api — we append /api/crawler-log ourselves
    fetch(`${backendUrl}/api/crawler-log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-scraper-key': process.env.INTERNAL_SCRAPER_KEY ?? '' },
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

// NOTE on the repeated regex string below: Next.js requires config.matcher to
// be fully inline/static — "matcher values need to be constants so they can be
// statically analyzed at build-time... variables will be ignored" (Next.js
// docs). A shared const or .map()/spread here would silently break the
// matcher (falls back to running on every route — the exact problem this
// restructuring fixes), so the same page-route regex is duplicated as a
// literal in each entry below instead of being factored out. Do not refactor.
export const config = {
  matcher: [
    // ── Sitemap rewrite: exactly one path, not every page ──────────────────
    { source: '/sitemap.xml' },
    // ── Crawler tracking: only the 4 tracked prefixes, not every page ──────
    // Regex-in-parens source per Next.js docs — equivalent to OR-ing
    // /sales/:path*, /city/:path*, /this-weekend/:path*, /organizers/:path*.
    { source: '/(sales|city|this-weekend|organizers)/(.*)' },
    // ── UTM/fsa_* capture: only when one of the 8 real attribution params is
    // present in the URL, not on every page navigation site-wide (mirrors the
    // exact set checked by hasFsa/hasUtm above — `ref` alone does NOT trigger
    // capture today, matching existing runtime behavior, so it's intentionally
    // not a 9th entry here). `has` array items are AND'd within one matcher
    // entry; separate matcher array entries are OR'd.
    {
      source:
        '/((?!_next/static|_next/image|_next/data|api/|favicon\\.ico|icons/|sw\\.js|workbox-|manifest\\.json|offline\\.html|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|eot|css|js)$).*)',
      has: [{ type: 'query', key: 'fsa_src' }],
    },
    {
      source:
        '/((?!_next/static|_next/image|_next/data|api/|favicon\\.ico|icons/|sw\\.js|workbox-|manifest\\.json|offline\\.html|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|eot|css|js)$).*)',
      has: [{ type: 'query', key: 'fsa_med' }],
    },
    {
      source:
        '/((?!_next/static|_next/image|_next/data|api/|favicon\\.ico|icons/|sw\\.js|workbox-|manifest\\.json|offline\\.html|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|eot|css|js)$).*)',
      has: [{ type: 'query', key: 'fsa_cmp' }],
    },
    {
      source:
        '/((?!_next/static|_next/image|_next/data|api/|favicon\\.ico|icons/|sw\\.js|workbox-|manifest\\.json|offline\\.html|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|eot|css|js)$).*)',
      has: [{ type: 'query', key: 'fsa_cnt' }],
    },
    {
      source:
        '/((?!_next/static|_next/image|_next/data|api/|favicon\\.ico|icons/|sw\\.js|workbox-|manifest\\.json|offline\\.html|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|eot|css|js)$).*)',
      has: [{ type: 'query', key: 'utm_source' }],
    },
    {
      source:
        '/((?!_next/static|_next/image|_next/data|api/|favicon\\.ico|icons/|sw\\.js|workbox-|manifest\\.json|offline\\.html|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|eot|css|js)$).*)',
      has: [{ type: 'query', key: 'utm_medium' }],
    },
    {
      source:
        '/((?!_next/static|_next/image|_next/data|api/|favicon\\.ico|icons/|sw\\.js|workbox-|manifest\\.json|offline\\.html|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|eot|css|js)$).*)',
      has: [{ type: 'query', key: 'utm_campaign' }],
    },
    {
      source:
        '/((?!_next/static|_next/image|_next/data|api/|favicon\\.ico|icons/|sw\\.js|workbox-|manifest\\.json|offline\\.html|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|eot|css|js)$).*)',
      has: [{ type: 'query', key: 'utm_content' }],
    },
  ],
};
