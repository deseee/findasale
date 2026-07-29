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
 * Option B — ISR-write overage fix (2026-07-22, seo-geo-monitor / findasale-dev):
 * ADR: claude_docs/feature-notes/adr-vercel-isr-overage-2026-07-19.md. Cities NOT in
 * the curated top-N list below (CURATED_CITY_SLUGS / CURATED_COMPANY_SLUGS) are
 * rewritten -- invisibly to the client, the URL bar and any crawler-visible
 * response are unaffected -- to a getServerSideProps + Cache-Control sibling
 * page under pages/internal-ssr/** instead of the curated ISR page. Curated
 * cities fall through unchanged to the existing ISR pages. This only covers
 * the 4 route families still receiving live traffic at their own URL today
 * (/city/:slug, /city/:slug/:category, /this-weekend/:city, /companies/:city-slug)
 * -- /estate-sales/:citySlug, /yard-sales/:citySlug, /auctions/:citySlug, and
 * /flea-markets/:citySlug already 301-redirect to /city/:slug/:category
 * (next.config.js, S1147, 2026-07-21) before any request ever reaches their
 * own ISR page, so they do not need this treatment.
 * The curated lists here are copies of the existing hardcoded fallback arrays
 * already committed in each ISR page (FALLBACK_CITY_SLUGS / TOP_CITY_SLUGS /
 * TOP_COMPANY_CITIES) -- this environment has no network path to the backend
 * DB/API to pull a fresher top-N by real sale-count, so rather than invent a
 * new cutoff, Option B reuses the same real, previously-vetted lists those
 * pages already trust. Refresh periodically by re-checking GET /sales/city-slugs
 * and /companies/city-slugs (both already ORDER BY count DESC) with real
 * backend access -- do not hand-guess new entries.
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
import { normalizeCitySlug, isCitySlugSafe } from './lib/seo/citySlug';

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

// ── Option B curated top-N (ISR-write overage fix) ─────────────────────────
// Copies of the existing hardcoded fallback arrays already in each ISR page
// (see file header above for provenance/refresh instructions). Kept as
// literal arrays here (not imported from the page files) since middleware
// runs on the Edge runtime and importing a Pages Router page module into
// middleware is unsupported/unreliable.
const CURATED_CITY_SLUGS = new Set([
  'grand-rapids-mi', 'chicago-il', 'detroit-mi', 'phoenix-az', 'dallas-tx',
  'los-angeles-ca', 'new-york-ny', 'houston-tx', 'san-antonio-tx', 'philadelphia-pa',
]);

const CURATED_COMPANY_SLUGS = new Set([
  'atlanta-ga', 'san-antonio-tx', 'chicago-il', 'dallas-tx', 'houston-tx',
  'fort-worth-tx', 'saint-louis-mo', 'nashville-tn', 'denver-co', 'wichita-ks',
  'seattle-wa', 'austin-tx', 'san-diego-ca', 'minneapolis-mn', 'baton-rouge-la',
  'miami-fl', 'rochester-ny', 'new-york-ny', 'knoxville-tn', 'kansas-city-mo',
]);

// Must match VALID_CATEGORIES / CATEGORY_META keys in
// pages/city/[slug]/[category].tsx. Excludes legacy values like 'consignment'
// on purpose -- those must keep falling through to next.config.js's own
// 301 redirect (S1: /consignment -> /resale) instead of being routed here.
const VALID_CITY_CATEGORIES = new Set(['estate-sales', 'yard-sales', 'auctions', 'flea-markets', 'resale']);

/**
 * Option B: decide whether this request is for a long-tail (non-curated)
 * city/company page that should be served via the SSR sibling instead of
 * the curated ISR page. Returns the internal rewrite destination, or null
 * if this request should fall through unchanged (curated city, or not one
 * of the 4 route families this fix applies to).
 */
function resolveOptionBRewrite(pathname: string, requestUrl: string): URL | null {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length < 2) return null;

  if (segments[0] === 'city' && segments.length === 2) {
    if (CURATED_CITY_SLUGS.has(segments[1])) return null;
    return new URL(`/internal-ssr/city/${segments[1]}`, requestUrl);
  }

  if (segments[0] === 'city' && segments.length === 3) {
    if (!VALID_CITY_CATEGORIES.has(segments[2])) return null; // e.g. legacy 'consignment' — let next.config.js redirect it
    if (CURATED_CITY_SLUGS.has(segments[1])) return null;
    return new URL(`/internal-ssr/city-category/${segments[1]}/${segments[2]}`, requestUrl);
  }

  if (segments[0] === 'this-weekend' && segments.length === 2) {
    if (CURATED_CITY_SLUGS.has(segments[1])) return null;
    return new URL(`/internal-ssr/this-weekend/${segments[1]}`, requestUrl);
  }

  if (segments[0] === 'companies' && segments.length === 2) {
    if (CURATED_COMPANY_SLUGS.has(segments[1])) return null;
    return new URL(`/internal-ssr/companies/${segments[1]}`, requestUrl);
  }

  return null;
}

// ── Canonical city-slug redirect (2026-07-28) ──────────────────────────────
// Three backend slug generators had drifted: /sales/city-slugs stripped dots
// (-> "st-louis-mo", the canonical form feeding the sitemap and getStaticPaths)
// while the metro index (indexController.makeSlug) and the ISR revalidation
// trigger did not (-> "st.-louis-mo"). MetroTable linked the un-stripped form,
// so Google indexed URLs the by-city API rejects with a 400 — pages that render
// permanently empty. Confirmed live before the fix: GET
// /api/sales/by-city/st.-louis-mo -> 400, /st-louis-mo -> 200 with 50 sales.
// The generators are unified now, but "st.-louis-mo" (46 impressions/wk),
// "coeur-d'alene-id" (8) and "st.-paul-mn" (3) are already indexed and carrying
// real impressions, so they must consolidate onto the canonical URL rather than
// 404 or keep serving an empty page.
//
// This CANNOT be expressed as a static next.config.js redirect: that layer can
// match a path but cannot transform a captured param (there is no string-replace
// in a `destination`), and the dotted form is open-ended — any city with a dot,
// apostrophe or accent produces one. Middleware is the only place the rewrite of
// the value itself can happen.
//
// Composition with the existing next.config.js redirect: next.config redirects
// run BEFORE middleware, so a legacy dotted URL resolves in two permanent hops —
//   /estate-sales/st.-louis-mo
//     -> 308 (next.config, S1147) /city/st.-louis-mo/estate-sales
//     -> 308 (here)               /city/st-louis-mo/estate-sales  -> 200
// Both hops are permanent and the chain terminates; Google consolidates signal
// across chains this short. No loop is possible because normalizeCitySlug() is
// idempotent and we only redirect when the value actually changes — the target
// slug is already canonical, so the second pass returns early at isCitySlugSafe.
const CITY_SLUG_ROUTE_PREFIXES = new Set(['city', 'this-weekend', 'companies']);

function resolveCitySlugRedirect(request: NextRequest): URL | null {
  const segments = request.nextUrl.pathname.split('/').filter(Boolean);
  if (segments.length < 2) return null;
  if (!CITY_SLUG_ROUTE_PREFIXES.has(segments[0])) return null;

  let raw: string;
  try {
    raw = decodeURIComponent(segments[1]);
  } catch {
    return null; // malformed percent-encoding — leave it alone
  }

  // Cheap fast path: the overwhelming majority of requests are already canonical.
  if (isCitySlugSafe(raw)) return null;

  const canonical = normalizeCitySlug(raw);
  if (!canonical || canonical === raw) return null;

  segments[1] = canonical;
  const target = new URL(request.url);
  target.pathname = `/${segments.join('/')}`;
  return target; // query string preserved by copying the whole URL
}

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

  // ── Canonical city-slug redirect ───────────────────────────────────────────
  // Runs before crawler tracking and before the Option B rewrite so a legacy
  // slug is consolidated onto its canonical URL first, and the downstream
  // curated-vs-SSR routing decision is made against the canonical slug.
  const citySlugRedirect = resolveCitySlugRedirect(request);
  if (citySlugRedirect) {
    return NextResponse.redirect(citySlugRedirect, 308);
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

  // ── Option B: long-tail city/company SSR routing (ISR-write overage fix) ──
  // See file header + resolveOptionBRewrite() above. Computed here (not
  // returned immediately) so a rewritten request still gets the UTM/fsa_*
  // cookie capture below if it also carries an attribution query param.
  const optionBRewriteUrl = resolveOptionBRewrite(pathname, request.url);

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
    return optionBRewriteUrl ? NextResponse.rewrite(optionBRewriteUrl) : NextResponse.next();
  }

  const response = optionBRewriteUrl ? NextResponse.rewrite(optionBRewriteUrl) : NextResponse.next();

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
    // ── Crawler tracking (4 prefixes) + Option B city/company SSR routing ──
    // Regex-in-parens source per Next.js docs — equivalent to OR-ing
    // /sales/:path*, /city/:path*, /this-weekend/:path*, /organizers/:path*,
    // /companies/:path*. 'companies' was added 2026-07-22 solely so
    // resolveOptionBRewrite() runs on those requests too -- it does NOT add
    // crawler tracking for /companies/ (isCrawlerPage()'s own
    // CRAWLER_PAGE_PREFIXES list above is unchanged and still excludes it).
    { source: '/(sales|city|this-weekend|organizers|companies)/(.*)' },
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
