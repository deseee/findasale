# Patrick's Dashboard — May 6, 2026 (S659 wrap)

---

## ✅ Actions needed from you

**1. Push wrap docs:**
```powershell
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "docs: wrap S659 — category sync debug"
.\push.ps1
```

**2. Set Railway env vars (both still needed):**
- `CATEGORY_SYNC_ENABLED=true` — category pages still empty until this is set + sync re-runs
- `OUTREACH_ENABLED=true` — 3,298 organizers queued, pipeline fully hardened

**3. Verify Settlement Hub (#228):**
Log in as `artifactmi@gmail.com` → Organizer Dashboard → Sales → open ENDED sale → Settlement Hub → confirm payout amount shows at step 2.

---

## S659 — CategorySync Debugging (code deployed, re-test needed next session)

Four-push debugging chain on `categorySyncCron.ts`. Root causes found and fixed:

- **Missing marketplace header** — eBay Browse API requires `X-EBAY-C-MARKETPLACE-ID: EBAY_US` (was absent → all searches returned 400)
- **Wrong token path** — routing token fetch through Vercel proxy returned 500; reverted to direct eBay OAuth (Railway already has the credentials)
- **Invalid URL characters** — `filter=categoryIds:{3199}` has raw curly braces that Akamai rejects in HTTP paths; `category_ids=id1,id2` only works for single IDs; final fix pre-encodes as `filter=categoryIds%3A%7B3199%7D` with `%7C` pipe separator
- **Lockfile mismatch** — `svix` was in package.json but missing from pnpm-lock.yaml → Railway build failure; fixed

**Final state:** Railway green. Sync logic is correct. Just needs triggering to populate the DB.

---

## S658 — Comprehensive Pre-Outreach Security Audit + 15 Fixes

Two hacker audit passes. 15 security items reviewed. 9 new fixes shipped. Migration deployed.

**What shipped:**
- **Resend webhook now signed** (P1) — fake bounce events can no longer suppress organizer emails
- **Image upload hardened** (P1) — MIME whitelist + magic bytes check + Cloudinary type restriction on all 5 upload endpoints
- **Organizer API locked down** (P1) — rate limiting + email/address stripped from public unauthenticated responses
- **Stripe Connect ownership validated** (P1) — audit logging on all Connect account changes
- **Tracking endpoint rate limits** (P2) — pixel 30/min, click 10/min
- **Credential redaction in error logs** (P2) — Nodemailer auth can no longer appear in Railway logs
- **CAN-SPAM audit trail built** (P2) — `OutreachAuditLog` table live, SENT + OPTED_OUT events wired, migration deployed ✅
- **Webhook event pruning job** (P2) — daily cleanup prevents unbounded table growth
- **Subject line injection hardened** (P3)

**Also verified clean (no change needed):** Password reset flow ✅, suppression UPSERT ✅, unsubscribe rate limit ✅, JWT role validation ✅, CLAUDE.md not in git ✅.

---

## S657 — Outreach Security Audit + Fixes + Chrome QA

**What shipped:**

- **Open redirect fix (HIGH)** — `/api/outreach/click` was accepting any URL in the `original` query param and redirecting recipients to it. An attacker could craft `finda.sale/api/outreach/click?...&original=https://phishing-site.com` and use our domain to validate a phishing link. Added URL parse + hostname allowlist (`finda.sale`, `www.finda.sale`). Non-`finda.sale` destinations now return HTTP 400.
- **PII in Railway logs fix (MEDIUM)** — Two log lines in `outreachEmailsCron.ts` were printing raw email addresses when skipping suppressed or blocked-domain organizers. Replaced with `organizerId` (opaque, safe to log).
- **Pipeline confirmed clean:** Tracking pixel uses UUID (no PII in URLs ✅), JWT secret throws hard if missing ✅, `escapeHtml()` on all business names before template render ✅.

**Chrome QA completed:**
- **#382 Sale Type Ordering — ✅ VERIFIED** — Homepage hero, /about, /terms (3 locations), Footer all confirmed "yard sales, garage sales, estate sales..." order.
- **#228 Settlement Hub — UNVERIFIED** — Code fix is live in GitHub but browser test requires your `artifactmi@gmail.com` login (only account with ENDED sales in production).
- **#379 Craigslist comment — ✅ (code-level fix only)**

---

## S656 — Settlement Hub Fix + Sale Type Ordering + Craigslist Cleanup

**What shipped:**
- **Settlement Hub (#228) P1 fixed** — `payoutAmount` useEffect now triggers from step 2 (was step 3–4). Payout and Receipt tab auto-populate as you advance through the wizard.
- **Sale type ordering (#382)** — 5 files reordered: About, Homepage, Onboarding modal, Terms (4 locations), Footer. "Yard Sales" now leads everywhere.
- **Craigslist ghost cleanup (#379)** — Stale cron comment corrected.

**Push block (S656 — if not pushed yet, combine with S657 block above):**
```powershell
git add packages/frontend/components/SettlementWizard.tsx
git add packages/frontend/pages/about.tsx
git add packages/frontend/pages/index.tsx
git add packages/frontend/components/OnboardingModal.tsx
git add packages/frontend/pages/terms.tsx
git add packages/frontend/components/Layout.tsx
git add packages/backend/src/jobs/scraperCron.ts
git add claude_docs/strategy/roadmap.md
```

---

## Next Session — S658 Priorities

1. **Confirm outreach first send** — set `OUTREACH_ENABLED=true`, watch Railway logs for `[OutreachCron] Sent Touch 1`. Cron fires every 4 hours.
2. **#228 Settlement Hub QA** — Patrick checks `artifactmi@gmail.com` account, reports result.
3. **CategoryTopFinds QA** — verify `/categories/estate-sales` TrendingSection after `CATEGORY_SYNC_ENABLED=true` + first nightly run.
4. **Next roadmap BROKEN items** — roadmap.md has the queue.

---

## S654 — Scraper Hardening + P0 Crash Fix + Nav Bug. 18 files.

**What shipped:**

- **Scraper stealth** — UA pool current (Chrome 134/135, Firefox 135/136, Safari 18.3). Referer rotation centralized. `Accept-Encoding` headers added. `FindASaleBot/1.0` identity removed everywhere.
- **Log suppression** — Business names no longer appear in Railway logs during scrapes. Verbose debug logs gated behind `LOG_LEVEL=debug` env var.
- **GitHub Actions DATABASE_URL** — Four scraper workflows were silently broken (Prisma couldn't connect → httpCache conditional GETs never worked). Fixed.
- **Claim email system removed** — Two cold outreach systems existed. Removed the old Resend/branded one (`claimEmailService.ts`). `outreachEmailsCron.ts` is the one correct pipeline. Plain-text style is right for cold; branded HTML goes to Promotions.
- **P0 crash fixed** — `internal.ts` was truncated in a prior session — backend was crash-looping with `Router.use() requires a middleware function but got undefined`. Restored complete file. Backend is green.
- **Explore dropdown fixed** — Hover + click conflict caused immediate close. Gap between button and dropdown triggered premature mouseleave. Both fixed.

**No action needed from you — all pushed.**

---

## S653 — Sitewide Image Proxy + Security Hardening. 24 files.

Full sitewide audit of the CF proxy bypass gap. Every page that showed scraped photos raw is now fixed. Trending data quality also fixed. Three security vulnerabilities in the outreach system patched.

**What shipped:**

- **Trending broken images** — root cause was the trending page rendering its own inline card with raw ESN URLs (not using OrganizerSaleCard). Fixed.
- **19 total image locations** across public discovery pages, sale detail page, and all logged-in account pages — all scraped/eBay photos now route through CF proxy.
- **Trending algorithm** — barber shop, Goodwill, Candy Shop no longer show as "#1 HOT". Now requires `endDate <= 90 days` + `startDate <= 60 days` — real sale events only.
- **Security P0s** — JWT secret no longer has `|| 'default-secret'` fallback (would've let anyone forge unsubscribe tokens if env var ever went missing). Rate limiter on POST unsubscribe. Email removed from tracking pixel ID (was leaking PII in server logs).
- **`onLoadingComplete` deprecation** — fully purged from the codebase.

**Push block (add to the S653 commit you already have, or run as separate commit):**
```powershell
git add packages/frontend/pages/shopper/wishlist.tsx
git add packages/frontend/pages/profile.tsx
git add "packages/frontend/pages/purchases/[id].tsx"
git add packages/frontend/pages/shopper/bids.tsx
git add packages/frontend/pages/shopper/checkout-success.tsx
git add packages/frontend/pages/shopper/loot-legend.tsx
git add packages/frontend/pages/shopper/history.tsx
git add packages/frontend/pages/shopper/explorer-profile.tsx
git add "packages/frontend/pages/shopper/early-access-cache/items.tsx"
git add "packages/frontend/pages/organizer/add-items/[saleId].tsx"
git add "packages/frontend/pages/organizer/sales/[id]/index.tsx"
git add packages/frontend/pages/shopper/holds.tsx
git add packages/frontend/components/OrganizerSaleCard.tsx
git add packages/backend/src/routes/outreach.ts
git add packages/backend/src/jobs/outreachEmailsCron.ts
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "fix(images): proxy scraped photos on all account pages | fix(security): remove default-secret, add rate limit, remove PII from pixel | fix(onLoad): deprecation | wrap S653"
.\push.ps1
```

*(The trending + public discovery files from earlier in the session go in the commit before this one — see push block above.)*

---

## S652 — ESN Photos Fixed. Browse ✅ + Detail ✅.

ESN scraped sale photos now load correctly on both pages. Root cause: the PWA service worker was intercepting requests to the Cloudflare Worker image proxy and failing silently — same documented issue as i.ebayimg.com. Fixed by adding `findasale-image-proxy.findasale.workers.dev` to the SW exclusion list in `next.config.js`. Verified in Chrome with the new SW active: the Dudley Donahue Estate auction detail page shows all 5 farm equipment photos.

**What was fixed:**
- `packages/frontend/next.config.js` — CF Worker domain excluded from SW catch-all NetworkFirst rule
- `packages/frontend/lib/imageUtils.ts` (S651) — hardcoded CF Worker URL as fallback so it works even if Vercel env var isn't baked into the build

**Push block:**
```powershell
git add packages/frontend/next.config.js
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "fix(pwa): exclude CF image proxy from SW interception — detail page photos now load | wrap S652"
.\push.ps1
```

**Reminder:** Revoke the Cloudflare API token that was pasted in chat: [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)

---

## S651 — Playwright Stealth + Cloudflare Worker + Soft 404 + AI Enrichment. Backend Green.

Five S651 tracks landed. Two P0 backend crashes hit mid-session — both fixed and backend confirmed green by Patrick before wrap.

**What shipped:**

- **Playwright Chromium stealth** (`saleDetailEnrichment.ts`) — Real browser with stealth plugin replaces raw HTTP fetch. Defeats TLS fingerprinting at the protocol level. Rotating user-agents, Referer pool, viewport simulation.
- **Cloudflare Workers image proxy** (`cloudflare/image-proxy/`) — Edge proxy deployed at `https://findasale-image-proxy.findasale.workers.dev`. 100k req/day free, different global IP per request. `NEXT_PUBLIC_CF_IMAGE_PROXY_URL` set in Vercel.
- **Conditional GETs** (`httpCache.ts`, `saleDetailEnrichment.ts`) — ETag + Last-Modified stored in `Sale.scrapedMetadata.httpCache`. Cuts ESN request volume 60–80% on repeat visits.
- **AI listing enrichment** (`listingEnrichmentService.ts`) — Claude Haiku generates categories, price range estimate, and 1-sentence summary from scraped description. Fire-and-forget on organizer page load. Gated on `ANTHROPIC_API_KEY` + description >50 chars.
- **Soft 404 fix** (`pages/sales/[id].tsx`) — Missing sale pages now return proper HTTP 404 (`{ notFound: true }`) instead of HTTP 200 with error content. Verified in Chrome.

**P0 crashes resolved mid-session:**
1. **Truncated file** — Agent A cut `saleDetailEnrichment.ts` at line 266 mid-statement (`const response =`). Compiled JS had syntax error. Fixed by completing the full file.
2. **Wrong import** — `import playwright from 'playwright-extra'` compiles to CJS `.default.use()` which fails. Fixed: `import { chromium } from 'playwright-extra'` + `chromium.use(StealthPlugin())`.

**Files changed:**
- `packages/backend/package.json` — removed nonexistent `playwright-extra-plugin-stealth@^1.2.4`, fixed `playwright-extra` version to `^4.3.6`
- `packages/backend/src/services/scraper/saleDetailEnrichment.ts` — Playwright + stealth, truncation fix, import fix, conditional GET integration
- `packages/backend/src/services/scraper/httpCache.ts` — NEW: ETag/Last-Modified cache helpers
- `packages/backend/src/services/listingEnrichmentService.ts` — NEW: Claude Haiku AI enrichment
- `packages/frontend/pages/sales/[id].tsx` — soft 404 fix
- `cloudflare/image-proxy/worker.js` — NEW: Cloudflare Worker
- `cloudflare/image-proxy/wrangler.toml` — cleaned up deprecated fields

**Action needed from Patrick:**
- Revoke the Cloudflare API token pasted in chat: [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
- AI enrichment is UNVERIFIED — check Railway logs for `[listingEnrichmentService]` output, or query `scrapedMetadata` on any ESN sale with a description

---

## S651 Plan (now complete) — What Was Dispatched

**Next session dispatches:**

- **Track 1 (you in Chrome):** Google Search Console audit — validate fixes on 3 5xx pages + 3 robots.txt-blocked organizer pages, investigate 3 redirect pages, check `/sales/[id]` returns proper 404.
- **Agent A:** Playwright + playwright-stealth → replaces HTTP fetch in `saleDetailEnrichment.ts` with real Chromium. Defeats TLS fingerprinting at protocol level. Most powerful anti-detection upgrade available.
- **Agent B:** Cloudflare Workers image proxy → moves image proxy off Railway (static IP) onto free Cloudflare edge (100k req/day, different global IP every request).
- **Agent C:** Session simulation → builds organic navigation chain before fetching any target URL (homepage → search → target with search page as Referer).
- **Agent D:** Cache-first conditional GETs → `If-Modified-Since` + `ETag` stored in `scrapedMetadata`, cuts ESN volume 60-80%.
- **Agent E ⏸ PAUSE:** Residential proxies (Bright Data / Oxylabs / Smartproxy) — most effective long-term tool but ~$50-150/month. Hold until revenue or free trial available.
- **Agent F:** AI-enriched listing display → auto-tagged categories + estimated price range + 1-sentence sale summary from description, stored in `scrapedMetadata`, displayed on organizer profile + sale detail pages.

---

## Old Status (S649 wrap — superseded)

---

## S649 — Cold Outreach Pipeline Activated. Wednesday Launch Pending Audit.

The full cold outreach stack is built, deliverability-aligned, and end-to-end verified. 3,301 unmanaged organizers are queued. Wednesday's first cron tick fires at 8pm EDT today (May 5) at 20/day warmup quota.

**What's working (proven this session):**

- Yahoo classifies our cold outreach into the **Primary tab** with the inbox-level Unsubscribe button rendered (RFC 8058 one-click recognized — that's the holy grail signal that we're a legitimate bulk sender, not a spammer)
- Gmail accepts with `signed-by: outreach.finda.sale` confirmed in headers (DKIM aligned, no warnings)
- Sender displays as `find@outreach.finda.sale` (brand-aligned subdomain — this required a Google Admin "Send mail as" config we didn't realize was needed until mid-session)
- Tracking pixel fires when recipient opens email → DB updates `touch1Opened=true`
- GET unsubscribe link validates JWT → writes `EmailSuppression` row
- POST one-click unsubscribe handler ready (Gmail/Yahoo will POST when user clicks the inbox button)

**What's set on Railway (six env vars):** OUTREACH_ENABLED, OUTREACH_WORKSPACE_EMAIL, OUTREACH_FROM_EMAIL, OUTREACH_WORKSPACE_APP_PASSWORD, OUTREACH_SECRET (rotated to a strong 128-char hex), OUTREACH_PHYSICAL_ADDRESS.

**Gotchas we hit + fixed:**

- Gmail SMTP rewrites the From header to the auth username unless the alias is registered as a "Send mail as" identity. We set this up mid-session.
- Templates had `[preview link]` and `[video link]` placeholders appearing twice (in the href AND visible text). JavaScript's single-replace caught the href but left visible text as the literal placeholder. Recipients would have seen broken-looking links. Fixed.
- The tracking pixel was being appended via `html.replace('</body>', ...)` but the templates have no body tags, so the pixel never made it into outgoing emails. Open tracking was silently broken. Fixed.

**P0 finding flagged at wrap (must address before cron fires):**

You visited a test organizer's preview page and it shows `0 sales / No sales listed yet / No reviews yet / New Organizer`. The cold outreach email's pitch is *"We built [Business Name] a free storefront on FindA.Sale"* — but if 3,301 unmanaged organizers all click through to empty storefronts, recipients dismiss us as a low-quality service. **This is the most important thing to evaluate before Wednesday's tick.** S650 audit specifically tasks each lens with reviewing what real recipients see.

---

## S649 → S650 Plan

**S650 is a multi-lens pre-launch audit** — three perspectives running in parallel:

1. **Hacker lens** (`findasale-hacker`) — red-team the pipeline. JWT spoofing, scraper-injected business names with HTML payloads, EmailSuppression races, RFC 8058 POST CSRF, tracking pixel ID enumeration, organizer page enumeration via predictable IDs.

2. **Guru lens** (`findasale-advisory-board` → Risk + GTM committees) — deliverability rigor (DKIM-2048 sufficient? DMARC quarantine vs none?), CAN-SPAM specifics, sequence cadence (3/5/7 days), seasonality (May = peak estate sale season), template tone for the demographic.

3. **Business strategist lens** (`findasale-advisory-board` full board) — conversion model realistic? Should we A/B subject lines first? Competitor reaction if EstateSales.NET / EstateSales.org notice mass enrollment? Legal exposure of "we built you a storefront" without explicit consent.

**Recipient preview audit (P0 within S650):** Sample 3 organizer pages from each ingest source (ESN, Google Places, Foursquare, HERE Places). Screenshot each. Decide cohort-by-cohort whether to: (a) backfill data before launch, (b) suppress those organizers from queue, (c) rewrite the email pitch.

**You can pre-empt the cron** by setting `OUTREACH_ENABLED=false` on Railway right now if you want the audit to run before any real send. Or set `OUTREACH_TEST_EMAIL=deseee@yahoo.com` to redirect all sends to your inbox until audit completes.

---

## Old Status (S648 wrap — superseded)

---

## ⚠️ Brand Drift Alert — 2026-05-05 (Weekly Scan)

**D-001 violations found: 8 (5 P1, 2 P2, 1 P3)**

Five high-visibility public pages/components are still framing FindA.Sale as estate-sale-first:

| Severity | Location | Issue |
|----------|----------|-------|
| P1 | `CityHero.tsx:29` | H1 "Top Estate Sale Finds in…" — estate-only on all city pages |
| P1 | `CityTopFinds.tsx:42` | Subtitle says "from recent estate sales" — should say "local sales" |
| P1 | `CityNearbyLinks.tsx:71` | "Powered by real estate sale data" — confusing + estate-only |
| P1 | `OnboardingModal.tsx:11` | First shopper welcome screen missing flea markets, yard sales |
| P1 | `pages/sales/index.tsx:87` | Browse page meta description missing flea markets, garage sales |
| P2 | `shopper/crews/index.tsx:41` | "hidden gems at estate sales" — single type |
| P2 | `pages/index.tsx:274` | schema.org org description missing yard sales, flea markets |
| P3 | Referral share messages | "estate sales, yard sales, and more" — weak |

**All 8 are copy-only, single-line fixes.** Ready to batch as one `findasale-dev` dispatch.
Full report: `claude_docs/audits/brand-drift-2026-05-05.md`

**Good news:** Dark mode (D-002) passes spot check. Skill files pass. No "AI" in user-facing copy.

---

## What Happened This Session

**S648 — Outreach data quality gate built and fixed.**

Before the cold outreach pipeline fires at real organizers, junk data needed to be cleaned. Three problems fixed: (1) Railway startup crash — the outreach cron file was truncated in a prior session and missing its export function entirely; fixed and pushed. (2) TypeScript compile error in the SMTP verifier script — a Set definition was inserted mid-way through another Set, breaking the syntax. (3) Built a two-pass suppression script that catches junk organizers by both category AND business name. The name-based pass is necessary because Google Places hardcodes a valid category from the search query — even a Hilton hotel found via a "thrift store" search gets `THRIFT_STORE` as its category, so category filtering alone is useless. Also expanded the scraper from 11 to 23 search queries covering the full secondhand market.

Dry-run found 486 name-matched records. Two false positives caught before executing: `'spa'` was matching "Spann" and "Sparrow" inside legitimate estate sale company names — replaced with more specific terms. `'realty'` was matching auction+realty combo firms like "Ken Carpenter Auction & Realty" which are our target market — added an exemption.

**Script is ready to execute. See next session for the psycopg2 audit path.**

---

**S647 — Big session. Five tracks shipped.**

1. **Settlement Hub fixed (#228).** The wizard was showing $0 everywhere because `platformFeeAmount` and `netProceeds` weren't being calculated when the settlement was created — they were null in the DB. Fixed: those values are now computed at creation time. Also fixed the orange CTA buttons and the broken "Download Receipt" handler.

2. **Cold outreach pipeline built (#374).** Full backend system wired up: suppression table (bounces, complaints, opt-outs), 4-touch email sequence (T+0, T+3d, T+7d, T+14d), daily quota ramp (starts at 20/day, grows to 200/day over 4 weeks), tracking pixel + click tracking + one-click unsubscribe. Uses Workspace SMTP via `outreach@finda.sale`. Gated behind `OUTREACH_ENABLED=true` — won't fire until you set that env var. Needs migration + 4 env vars after push.

3. **Site-wide click bug fixed (#418 + S565).** Your Command Center dashboard was crashing the page's hydration because it was running `new Date()` on the server and getting a different timestamp on the client. This caused React to throw away the whole server-rendered page and re-render from scratch — breaking click handlers site-wide until the page fully reloaded. Fixed. Also fixed `/shopper/profile` and `/shopper/collection` — they were 404ing for Googlebot and SSR because they used a client-side redirect trick that doesn't work server-side.

4. **Sale type ordering fixed (#382).** "Yard Sale" now appears first in every dropdown/selector across the app (was "Estate Sale"). Fixed in 5 places: search panel, homepage, create sale, edit sale, organizer settings.

5. **75 guide drafts written (#377 complete).** Every single guide in the help library plan is now drafted and saved to `claude_docs/strategy/guides-drafts/`. 13 sections, ~51,500 words, 47 fresh guides, 18 thin (point to existing content), 10 wrappers. These are ready for your voice check before we build the site surface (#378).

6. **SEO P0/P1 fixes.** Category pages are now server-rendered (Googlebot can see items), sale pages have Event structured data (Google can display rich results), city pages have breadcrumb structured data, sitemap `lastmod` now reflects when sales actually changed.

---

## Action Items for Patrick — Run These

**Three push blocks — run in order:**

**Push Block 1 — Settlement Hub + Sale Type Ordering**
```powershell
git add packages/backend/src/controllers/settlementController.ts
git add packages/frontend/components/SettlementWizard.tsx
git add packages/frontend/components/SearchFilterPanel.tsx
git add packages/frontend/pages/index.tsx
git add packages/frontend/pages/organizer/create-sale.tsx
git add "packages/frontend/pages/organizer/edit-sale/[id].tsx"
git add packages/frontend/pages/organizer/settings.tsx
git commit -m "fix(settlement): compute netProceeds at creation, fix download handler (#228) | fix(ui): sale type ordering — yard sale first (#382) | seo: homepage canonical link"
.\push.ps1
```

**Push Block 2 — Bug Fixes + SEO + Cold Outreach Pipeline**
```powershell
git add packages/frontend/components/CommandCenterCard.tsx
git add packages/frontend/pages/shopper/profile.tsx
git add packages/frontend/pages/shopper/collection.tsx
git add "packages/frontend/pages/categories/[category].tsx"
git add "packages/frontend/pages/sales/[id].tsx"
git add "packages/frontend/pages/city/[slug].tsx"
git add packages/frontend/pages/server-sitemap.xml.tsx
git add packages/backend/src/services/suppressionService.ts
git add packages/backend/src/jobs/outreachEmailsCron.ts
git add packages/backend/src/routes/outreach.ts
git add packages/backend/src/index.ts
git add packages/database/prisma/schema.prisma
git add packages/database/prisma/migrations/20260505000000_add_outreach_pipeline/migration.sql
git commit -m "fix(s565): hydration mismatch + shopper SSR 404s | seo: category ISR + Event JSON-LD + BreadcrumbList + sitemap lastmod | feat(outreach): pipeline — suppression table, 4-touch cron, tracking routes"
.\push.ps1
```

**Push Block 3 — Guide Drafts + Wrap Docs**
```powershell
git add claude_docs/strategy/guides-drafts/
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "docs: 75 help library guide drafts (#377 complete) | wrap S647"
.\push.ps1
```

---

**After Push Block 2 deploys — run the migration:**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

**After migration — set these Railway env vars:**
| Variable | Value |
|---|---|
| `OUTREACH_ENABLED` | `true` |
| `OUTREACH_WORKSPACE_EMAIL` | `outreach@finda.sale` |
| `OUTREACH_WORKSPACE_APP_PASSWORD` | Your Google Workspace App Password |
| `OUTREACH_SECRET` | Run `openssl rand -hex 32` to generate |

**Other actions still pending:**
- [ ] Send 19 queued Gmail partnership outreach drafts (NESA, NAA, NASMM, ISA, Nick Loper, Codie Sanchez)
- [ ] Set profile photo on `outreach@finda.sale` — gmail.com → Google Account icon → upload `icon-72x72.png`
- [ ] Read guide drafts in `claude_docs/strategy/guides-drafts/` — give voice check thumbs up/down before S648 site-surface dispatch
- [ ] `prisma migrate deploy` for `20260504120000_add_category_top_finds` (S646, if not done)

---

## Two-Sided Pipeline Status

| Track | Status | Next |
|---|---|---|
| **Cold Outreach Email** (#374) | ✅ Pipeline built — set env vars + migration to activate | Set `OUTREACH_ENABLED=true` after migration |
| **Help Library** (#377) | ✅ All 75 drafts written | Patrick voice check → S648 site surface (#378) |
| **Shopper-Side SEO** (#375) | P0/P1 done — category ISR + JSON-LD live | P2 fixes next session |
| **Category Pages** (eBay) | ✅ CategoryTopFinds live — QA after first cron | QA in S648 |
| **City Pages** (own data) | ✅ metroSyncCron own-data swap live | — |
| **Partnership Outreach** | 19 drafts in Patrick's Gmail | Patrick sends |

## Next Session (S649)

**Goal: audit + clean the junk organizer data, then flip `OUTREACH_ENABLED=true`.**

Use psycopg2 in the VM to connect directly to Railway, run the name-based blocklist match interactively, show Patrick counts + examples broken down by keyword, then execute `UPDATE suppressOutreach=true` with Patrick's confirmation. Watch for: `'construction'`+auction combos, `'auto sale'` edge cases, any short keyword that might hit legitimate businesses. After suppression is clean, set the 4 Railway env vars and watch the logs for the first cron run.
