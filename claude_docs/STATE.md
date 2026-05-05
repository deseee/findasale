# PROJECT STATE

FindA.Sale is a two-sided marketplace PWA for secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment) connecting them with shoppers. Backend: Node.js/Prisma/PostgreSQL on Railway. Frontend: Next.js on Vercel. Mobile: React Native (future).

## Current Status

**Latest: S648 — Outreach Data Quality Gate + suppressOffTargetOrganizers (COMPLETE)**

Three tracks: (1) Fixed `initOutreachEmailsCron` Railway startup crash — file was truncated in a prior session, missing closing braces + the entire export function. (2) Fixed `smtpPermutationVerifier.ts` TS syntax error — `BLOCKED_EMAIL_SUFFIXES` Set was inserted mid-way through `PLATFORM_DOMAINS` Set. (3) Built full data quality gate for outreach pipeline: BUSINESS_NAME_BLOCKLIST + ACCEPTABLE_GOOGLE_TYPES in googlePlaces.ts (23 queries, up from 11), ingest gate in scraper/index.ts (rejects non-VALID_CATEGORIES at write time), category + suppressOutreach filters added to claimEmailService.ts and outreachEmailsCron.ts, new `suppressOffTargetOrganizers.ts` two-pass cleanup script (Pass 1: category-based, Pass 2: name-based — catches existing junk where Google Places hardcoded a valid category). Dry-run result: 486 name-matched records. False positives caught before execution: `'spa'` matched "Spann"/"Sparrow" estate sale companies; `'realty'` matched auction+realty combo firms (our target market). Both fixed — `'spa'` replaced with specific terms, auction exemption added to realty matching.

**Files changed:** `googlePlaces.ts`, `scraper/index.ts`, `claimEmailService.ts`, `outreachEmailsCron.ts`, `smtpPermutationVerifier.ts`, `suppressOffTargetOrganizers.ts`

**Patrick actions:** Run suppression dry-run after fix (below), then CONFIRM=true if count + examples look clean. Set Railway env vars for outreach pipeline. See "## Next Session — S649" below.

---

**Previous: S647 — Settlement Hub Fix + Cold Outreach Pipeline + SEO P0/P1 + 75 Guide Drafts (COMPLETE)**

Five tracks shipped:

1. **Settlement Hub (#228)**: `platformFeeAmount` + `netProceeds` computed at creation in `settlementController.ts` (was null → $0 throughout wizard). Orange CTAs in `SettlementWizard.tsx`. Fixed download receipt handler using React `isDownloading` state.
2. **Cold Outreach Pipeline (#374)**: `EmailSuppression` table + DirectoryClaimEmail touch-tracking columns (migration `20260505000000_add_outreach_pipeline`). New files: `suppressionService.ts` (bounce/complaint/opt-out handlers), `outreachEmailsCron.ts` (every 4 hours, 4-touch sequence, daily quota ramp 20→200/day, Workspace SMTP on smtp.gmail.com:587), `outreach.ts` routes (pixel tracking, click tracking, unsubscribe JWT, Resend bounce webhook). Backend wired at startup. Gated by `OUTREACH_ENABLED=true`.
3. **Bug fixes (S565)**: Site-wide click failures (#418) fixed — `CommandCenterCard.tsx` was calling `new Date()` at render time causing SSR hydration mismatch; wrapped date logic in `useMemo`. `/shopper/profile` + `/shopper/collection` SSR 404s fixed (converted `useEffect` redirects to `getServerSideProps`). Sale type ordering reordered across 5 UI locations — Yard Sale first (#382).
4. **SEO P0/P1**: Category pages → `getStaticProps` + ISR (revalidate 300s, Googlebot-visible item grid). Sale pages → Event JSON-LD with AggregateOffer (startDate, endDate, location, item count). City pages → BreadcrumbList JSON-LD. Sitemap `lastmod` now uses `sale.updatedAt`. Homepage canonical `<link>` added.
5. **Help Library #377**: All 75 guide drafts written + saved to `claude_docs/strategy/guides-drafts/<slug>.md` (47 FRESH, 18 THIN, 10 WRAPPER). 13 sections, ~51,500 words. Complete — #377 ready to mark shipped.

**Files changed:** 20 code/schema files + 75 guide drafts.

**Patrick actions:** Push blocks 1–3 + `prisma migrate deploy` + 5 Railway env vars. See "## Next Session — S648" below.

---

**Previous: S646 — CategoryTopFinds + City Own-Data + Bug Fixes + Backend Crash Restored (COMPLETE)**

Innovation research confirmed: eBay Browse API has no geo filter — all 20 metros return identical items. Elegant split implemented: **eBay → category pages**, **own organizer inventory → city pages**.

Four tracks shipped:
1. **CategoryTopFinds** (new): `CategoryTopFinds` Prisma model + migration `20260504120000`, `categorySyncCron.ts` (nightly 05:00 UTC, gated by `CATEGORY_SYNC_ENABLED=true`, 9 FindA.Sale categories → eBay Browse API by categoryId), `/api/categories/:slug/top-finds` route, TrendingSection component wired into `categories/[category].tsx`.
2. **metroSyncCron own-data swap**: queries own `Item` table first (isActive, PUBLISHED, state-matched, last 30 days). If ≥8 own items → skips eBay entirely. If <8 → fills remainder from eBay. Own items keyed as `local-{itemId}` in ebayListingId.
3. **Bug fixes**: `/items/[id]` SSR 500 (extended Prisma select in `getItemById`), Hunt Pass badge (removed "Inactive" text), tier-lapse computed from live DB not JWT.
4. **CityTopFinds crash + backend crash**: null-guarded `toFixed()` on undefined `soldPrice` in `city/[slug].tsx` + `CityTopFinds.tsx`. Restored truncated `organizers.ts` tail (agent truncation → `SyntaxError: Unexpected end of input` on Railway).

**Files changed (12):** `schema.prisma`, `migrations/20260504120000_add_category_top_finds/migration.sql` (NEW), `categorySyncCron.ts` (NEW), `routes/categories.ts` (NEW), `index.ts` (wired cron + route), `metroSyncCron.ts`, `itemController.ts`, `organizers.ts`, `coupons.tsx`, `city/[slug].tsx`, `CityTopFinds.tsx`, `categories/[category].tsx`

**Patrick actions completed:** All 4 push blocks confirmed pushed.

Gmail also activated for `outreach.finda.sale` this session: MX record (`outreach → SMTP.GOOGLE.COM priority 1`) added in Vercel DNS, SPF updated from Smartlead to Google (`v=spf1 include:_spf.google.com ~all`), Google Workspace wizard confirmed "Gmail is activated!", `find@outreach.finda.sale` alias created.

**Files changed (1):** `packages/backend/src/jobs/metroSyncCron.ts` (query fix + debug logging + cron schedule)

**Patrick actions:** Push S645 block below.

---

**Previous: S644 — SmallScreen Partnership Research + ESN Enrichment Workflow Fix (COMPLETE)**

SmallScreen Marketing (Winnipeg, CA — talent agency, secondhand/resale niche) reached out via Commonwealth Picker connection. Surfaced Canada expansion plans (roadmap #366–371) and drafted a reply email to Miles Lisan + Jonathan van Ieperen covering: creator roster questions, deal structure, Canadian vs. US audience split, content type (tutorial vs. haul), organizer-creator distinction, target market geography (ON/BC/AB = Phase 1), honest platform status (beta, CAD billing in development), and Canadian tax flags (GST/HST digital services threshold, cross-border affiliate payout withholding, Stripe Tax). Also fixed two bugs in `enrich-sale-details.yml`: (1) `batches` input was wired to nothing — matrix was hardcoded `[0,1,2]`; replaced with a `setup` job that generates the array dynamically via Python and passes it via `fromJSON`. (2) 30-minute timeout too short for 200-sale batches — extended to 60 minutes.

**Files changed (1):** `.github/workflows/enrich-sale-details.yml` (dynamic matrix + 60min timeout)

**Patrick actions:** Push S644 block below.

---

**Previous: S643 — Help Library Plan + Roadmap Entries (COMPLETE — planning only, no code)**

Built `claude_docs/strategy/guide-and-video-library-plan.md` — 75-guide written + video library covering organizer workflows (rapidfire mode, review queue + pricing, flyers, POS, settlement, eBay, consignment, holds, brand kit, promote page), shopper workflows (discovery, holds, condition grades, Hunt Pass, Guild, community), and trust mechanics (organizer reputation, refer-a-friend, introduce-organizer S635, affiliate, ripples, disputes). Three parallel research agents mapped 50+ organizer surfaces, 42 shopper surfaces, 11 trust/community features. Existing-coverage audit categorizes drafts as **FRESH (47), THIN (18), WRAPPER (10)** — surfaces existing content (`/guide` 14 sections, `/faq` 53 questions, `/condition-guide`, `/shopper/guild-primer`) instead of duplicating. Total writing load ~51,500 words across 75 drafts. Two-step work plan (no phases): (1) draft everything first → (2) site prep + slot in approved drafts. Tone rules locked: plain language, no "AI", inclusive sale types, no founder voice, sender stays "The FindA.Sale Team". Roadmap rows added: **#377** Help Library — Draft All 75 Guides + Video Scripts (write-only, no site work, drafts in `claude_docs/strategy/guides-drafts/<slug>.md`), **#378** Help Library — Site Surface (`/guides` route + FAQ inbound links + slot in, blocked on #377). Roadmap version bumped to v131.

**Files changed (3):** `claude_docs/strategy/guide-and-video-library-plan.md` (NEW, 419 lines), `claude_docs/strategy/roadmap.md` (added rows #377+#378, v131 entry), wrap docs `claude_docs/STATE.md` + `claude_docs/patrick-dashboard.md`.

**Patrick actions:** (1) Push S643 block below (4 files: plan + roadmap + STATE + dashboard). (2) Read the plan and decide whether to dispatch S644 drafting cluster 1 (Photo Workflow, 6 drafts including rapidfire mode + lighting/framing companion). See "## Next Session" below.

---

### S641 — Cold Outreach Deep-Audit + Two-Sided Pipeline Sync (COMPLETE — research only, no code)

Four parallel research dispatches (~57k words, ~80 primary sources) replacing S640's shallow single-search-per-tool premise. Verdict: **BUILD don't BUY** for cold email — all four leading vendors (Smartlead, Instantly, Saleshandy, Snov.io) are campaign-orchestrators that contradict our Postgres-as-source-of-truth design. Workspace + Postgres cron path: 8 dev days, $6/mo, zero portability risk. Tool path: 7 dev days, $30–94/mo, dual-write reconciliation debt by month 3. **S640 nearly signed us up for Smartlead — that would have been wrong** (Smartlead Pro allows only one global webhook, fatal for our per-touch state machine; 49 documented outages in 12 months). If we ever do buy, **Saleshandy is the right tool**, not Smartlead or Instantly. **Critical correction**: shopper-side SEO is NOT deferrable — it's the demand-side marketplace flywheel and runs parallel to the cold-email build, not behind it. Existing scaffolding (`/city/[slug]`, `/categories/`, `/neighborhoods/`, etc.) needs an audit pass for indexing/structured-data/link-graph/SSR completeness. Innovation pilots queued: LinkedIn via Expandi (~$99/mo, defer 2 weeks past email warm-up) + NESA/NAA/NASMM partnership outreach (~$0). RVM permanently killed (FCC 2022). Roadmap entries #374–#376 added. Strategy doc: `claude_docs/strategy/cold-outreach-deep-audit-S641.md`. Evidence: `claude_docs/research/cold-outreach-2026-05/`.

**Patrick actions (carried into S642 push):** (1) Confirm "build, don't buy" so S643 dispatches can launch. (2) Send 19 queued Gmail partnership outreach drafts (NESA, NAA ×2, NASMM, ISA, Nick Loper, Codie Sanchez). (3) Provision second Workspace seat for `outreach@finda.sale` ($6/mo) — needed before S643 Dev build.

---

### S640 — Email Audit + Brand Drift Batch (COMPLETE)

(1) Resend audit complete: `claimEmailService.ts` was firing 200%/day usage but all sends targeted `@system.finda.sale` placeholder addresses — no real organizer received email. Set `CLAIM_EMAIL_ENABLED=false` to stop. (2) `outreach.finda.sale` subdomain DNS records added to Vercel: SPF (`v=spf1 include:_spf.smartlead.ai ~all`) ✅ and DMARC (`v=DMARC1; p=none; rua=mailto:dmarc@outreach.finda.sale`) ✅. DKIM pending Smartlead signup. (3) HERE_API_KEY GitHub Secret confirmed added by Patrick. (4) P2 brand drift batch shipped: 4 files fixed (Layout.tsx, messages/index.tsx, _document.tsx, city/[slug].tsx). **NOTE S641:** the Smartlead SPF entry needs to be removed — S641 audit confirmed we are NOT signing up for Smartlead. Workspace SPF includes get added during S643 Dev build.

---

### S639 — Google Places Billing + Cost Optimizations (COMPLETE)

(1) Discovered $47.22 Google Places API charge on $100 Google Cloud bill. Root cause: enrichment.ts fetching `rating`/`user_ratings_total` fields unnecessarily, no caching, no skip logic. (2) enrichment.ts cost fix pushed by Patrick at 12:32 UTC May 4: removed rating fields from Place Details request, added skip logic when organizer already has both phone AND website, added module-level 30-day TTL cache (`placeIdCache` Map). (3) Google Cloud quota hard cap set: Places API "Requests per day" reduced from Unlimited → 15,000 (~$15/day worst case). Path used: IAM & Admin → Quotas (Maps Platform quotas page had rendering issues). (4) Confirmed Google's $200/month free credit is GONE — replaced by subscription tiers (Starter $100/mo, Essentials $275/mo). Pay as you go is correct plan for current usage. No action needed. (5) All S633–S638 pushes confirmed live on GitHub via commit log. STATE.md was stale — Patrick had been pushing regularly.

**Files changed (1):** enrichment.ts (cost optimization — already on GitHub, commit 12:32 UTC May 4)

**Patrick actions:** None. All work is live.

---

### S638 — Scraper Fleet Reactive Fixes (COMPLETE — confirmed pushed)

Six reactive scraper fleet fixes shipped. (1) herePlaces.ts `baseMmetro`/`baseMretto` typo → `baseMetro`. (2) HERE Places returning same 123 results for all NYC boroughs — added HERE Geocoding API fallback (`geocodeWithHERE()`, 8s timeout, module-level cache). (3) HERE Places running 5–6× per metro — fixed by deduplicating queue items by `(metro, subArea)` before scraping (50 items → 10 unique locations). (4) foursquarePlaces.ts null byte corruption, duplicate block, TS2322 null/undefined — all fixed. (5) Foursquare HTTP 429 on detail API — removed all detail API calls. (6) Railway P2002 on email unique constraint + googlePlaceId — fixed. ARG_MAX `curl -d "$RESULTS"` → file-based curl.

**Files changed (6):** herePlaces.ts, run-here-places.ts, foursquarePlaces.ts, scraper/index.ts, enrichment.ts, enrich-sale-details.yml

**Patrick actions:** None — all pushed, confirmed on GitHub (commit 10:07 UTC May 4).

---

### S637 — Email Acquisition Pipeline: Concurrency + SMTP Verifier
**COMPLETE — Data pipeline: email hit rate 1.4% → 31%**

enrichContactEmails.ts upgraded with pull-queue concurrency (SCRAPE_CONCURRENCY=10, PLACES_CONCURRENCY=5, processWithConcurrency helper). New smtpPermutationVerifier.ts: MX lookup → RCPT TO prefix probing (15 prefixes) → catch-all detection → DB write. No mail sent. PLATFORM_DOMAINS set blocks Facebook/Instagram/HiBid/ctbids/linqapp/instacard etc. BLOCKED_MX_HOSTS set (GoDaddy/Proofpoint/Mimecast/M365 + smaller hosts) writes best-guess info@ immediately instead of timing out. No-match fallback and SMTP-unreachable fallback also write info@ rather than losing the organizer. New smtp-permutation-verify.yml workflow (daily 2am UTC). Live run results: 128 verified, 27 catch-all, 160 no MX, 53 SMTP unreachable, 48 no match — ~31% email hit rate vs ~1.4% HTML-scraper-only. Workflow cohesion audit: all 9 scraper scripts confirmed to exist, all 4 internal routes wired (ingest, enrich-backfill, batch, bulk), ts-node installed, pnpm filter names match — fleet is cohesive.

---

## Recent Sessions (S636–S639)

### S637 — Email Acquisition Pipeline: Concurrency + SMTP Verifier
**COMPLETE — Data pipeline: email hit rate 1.4% → 31%**

(1) enrichContactEmails.ts: added `processWithConcurrency<T>` pull-queue helper, SCRAPE_CONCURRENCY=10, PLACES_CONCURRENCY=5. All 3 pass loops converted from sequential to concurrent. (2) smtpPermutationVerifier.ts (NEW): MX lookup via dns.promises, RCPT TO handshake via raw TCP sockets, 15 common prefixes in priority order, catch-all detection via gibberish probe, PLATFORM_DOMAINS blocklist (Facebook/social platforms, HiBid, ctbids, linqapp, instacard, squarespace, wixsite etc.), BLOCKED_MX_HOSTS blocklist (GoDaddy, Proofpoint, Mimecast, M365, hostedemail, ipage, homesteadmail, magicbrain), best-guess info@ fallback on blocked/unreachable/no-match. SMTP_VERIFY=false env var for best-guess-only mode. (3) smtp-permutation-verify.yml (NEW): daily 2am UTC + workflow_dispatch. (4) Workflow cohesion audit: all 9 scraper scripts exist, internal.ts complete (all 4 routes), controller exports all 4 functions, ts-node v10.9.1 installed, pnpm filter names match — fleet cohesive.

**Files changed (3):** enrichContactEmails.ts (concurrency), smtpPermutationVerifier.ts (NEW), smtp-permutation-verify.yml (NEW) — confirmed on GitHub.

**Patrick actions:** No push needed — files confirmed on GitHub. Wrap doc push only (STATE.md + patrick-dashboard.md).

---

### S636 — Email Creative Session
**COMPLETE — No code, no migrations**

Pure copywriting session. Finalized 4 outreach email templates for cold organizer acquisition pipeline. Key decisions: T1 subject locked to "Where do buyers find [Business Name]?" (curiosity gap, earns the open, honest), no exclamation marks throughout, plain language voice consistent across all four touches. T2: direct re-send, no drama. T3: Smart Pricing hook with Hummel/art nouveau lamp specificity. T4: clean break-up. File saved to `claude_docs/strategy/outreach-email-templates-v4.md` (v7). Templates are ready for Dev dispatch to wire into Postgres cron. 0 files changed in codebase.


### S635 — Organizer Referral XP Mechanic
**COMPLETE — Integration: schema, services, UI, achievements**

Implemented full organizer referral economy. New `ShopperOrganizerIntroduction` model tracks which shopper introduced which organizer (unique compound key). xpService.ts gained 7 constants (SHOPPER_INTRODUCED, ORGANIZER_REFERRAL_PRO_UPGRADE, ORGANIZER_REFERRAL_QUALITY_TIER, DISCOVERY_MANUAL, SCOUT_LEADERBOARD tiers, monthly ORGANIZER_CLAIMED cap). referralService.ts added 3 award functions checking monthly caps and applying Hunt Pass multiplier. organizers.ts claim approval endpoint now fires XP awards. achievementService.ts gained 4 cosmetic badges. organizers/[id].tsx now displays founding shoppers. Memory: subagent write verification gate documented.

**Files changed (7):** xpService, referralService, organizers.ts, schema.prisma, migration 20260628, achievementService, organizers/[id].tsx

**Patrick actions:** (1) Push S635 block. (2) Run `prisma migrate deploy` for 20260628 migration.

---

### S634 — RETAIL Scraper Pipeline + Founding Shoppers + Behavioral Overhaul
**COMPLETE — Data pipeline: Foursquare enrichment + UI + docs**

(1) RETAIL scraper chain: added `fetchFoursquareDetails()` in foursquarePlaces.ts to pull hours, website, phone for RETAIL listings, stored in `scrapedMetadata`. sales/[id].tsx now shows "Permanent Storefront · Always Open" + hours block for RETAIL. New backfillFoursquareDetails.ts script enriches existing RETAIL listings (requires Railway DATABASE_URL override + FOURSQUARE_API_KEY). (2) Organizer profile "Discovered by" amber section displays founding shopper avatars. (3) Behavioral system improvements: CLAUDE.md §0 added (mandatory session start: read STATE.md → roadmap → present top 3 items), conversation-defaults updated (friction gate, push verification, evidence-based gates), findasale-dev skill updated (mandatory acceptance criteria block). (4) Vercel build fix: added `scrapedMetadata?: Record<string, unknown> | null` to Sale interface.

**Files changed (7):** foursquarePlaces.ts, osmOverpass.ts, scraper/index.ts, sales/[id].tsx (×2), backfillFoursquareDetails.ts (NEW), organizers/[id].tsx, CLAUDE.md

**Patrick actions:** (1) Push S634 block. (2) After deploy, run backfill script with Railway DATABASE_URL + FOURSQUARE_API_KEY.

---

### S633 — GitHub Actions Workflow Fleet Overhaul + googlePlaceId @Unique P1 Fix
**COMPLETE — Operational: concurrency, timeouts, dedup schema constraint**

Full audit and repair of 11 GitHub Actions workflows. (1) **8 workflows rewritten:** All now have `concurrency` blocks (cancel-in-progress: false, keyed by workflow name). scrape-estatesalesnet.yml timeout extended 10→25 min (confirmed ~19 min in prod). scrape-newspaper-rss.yml cron staggered 02:00→02:30 UTC (avoids clash with Google Places on 1st at 02:00). scrape-foursquare.yml broken METRO_BATCH env var removed. All deprecated *_ORGANIZER_ID secrets removed. (2) **P1 schema fix:** `googlePlaceId String? @unique` on Organizer (was String? without constraint). Migration 20260503100000 created: dedup DELETE (keeps lowest id), DROP old non-unique index, CREATE UNIQUE INDEX IF NOT EXISTS. (3) test-esn-api-access.yml flagged for `git rm` (stale/redundant). TypeScript: zero errors. Bug fix agent dispatched for /items/[id] 500, OG meta missing, Hunt Pass status, tier-lapse banner — fixes still pending.

**Files changed (10):** All 8 GH Actions workflow files, schema.prisma (googlePlaceId @unique), migration 20260503100000 (NEW)

**Patrick actions:** (1) Push S633 block. (2) `git rm .github/workflows/test-esn-api-access.yml` in same commit. (3) Run `prisma migrate deploy` + `prisma generate` on Railway for @unique constraint.

---

---

## Blocked/Unverified Queue

| Feature | Reason | What's Needed | Session Added |
|---------|--------|---------------|---------------|
| CategoryTopFinds TrendingSection | Cron runs at 05:00 UTC — no data until first run | QA after first nightly run; verify TrendingSection renders on a `/categories/[category]` page with real eBay data | S647 |
| Outreach pipeline open/click tracking | Can't verify pixel + click routes without real sends | Verify after `OUTREACH_ENABLED=true` + first cron run: check Railway logs for send attempt, confirm tracking pixel route returns 200 | S647 |

---

## Next Session — S649

**First action:** Load `dev-environment` skill. Then use psycopg2 in the VM to do a full audit and cleanup of junk organizer data before the outreach pipeline fires.

**Data quality audit (primary goal):**

The outreach pipeline is built and gated behind `OUTREACH_ENABLED=true`. Before flipping that switch, junk organizer records must be purged. The `suppressOffTargetOrganizers.ts` script has a two-pass approach but runs from Patrick's machine. The better path for the audit is psycopg2 directly from the VM — more interactive, Claude executes the cleanup without Patrick touching PowerShell.

Use psycopg2 to:
1. Connect to Railway DB (public proxy URL in CLAUDE.md credentials)
2. Query all `isUnmanagedListing=true, isClaimed=false, suppressOutreach=false` organizers
3. Match `businessName` against the BUSINESS_NAME_BLOCKLIST in `packages/backend/src/services/scraper/sources/googlePlaces.ts`
4. Show Patrick counts broken down by matched keyword + 20 examples per category
5. Exempt auction+realty combos (names containing both "realty"/"realtor" AND "auction")
6. Execute `UPDATE suppressOutreach=true` after Patrick confirms

**Known false positives to watch for (caught in S648 dry-run):**
- `'spa'` as substring matches "Spann", "Sparrow", "Spanish" — already fixed in script (replaced with 'day spa', 'massage spa', etc.) but watch for similar short-keyword false positives in the psycopg2 pass
- `'realty'` + `'auction'` combos are legitimate auction houses — already exempted in script, replicate the exemption logic in the psycopg2 pass
- `'construction'` is broad — "W a Construction Company Ltd" is clearly not our target, but watch for edge cases like "Construction Equipment Auction"
- `'auto sale'` may catch car dealers that also auction — flag for Patrick review, don't auto-suppress

**After suppression cleanup:**
- Set Railway env vars to activate the pipeline:
  - `OUTREACH_ENABLED` = `true`
  - `OUTREACH_WORKSPACE_EMAIL` = `outreach@finda.sale`
  - `OUTREACH_WORKSPACE_APP_PASSWORD` = [Google Workspace App Password for outreach@finda.sale]
  - `OUTREACH_SECRET` = [generate with `openssl rand -hex 32`]
- Then verify pipeline fires by watching Railway logs for the next 4-hour cron tick

**S647 Patrick actions still pending (if not done):**
- Push Block 1, 2, 3 from S647 (see archived section below)
- `prisma migrate deploy` for `20260505000000_add_outreach_pipeline`
- Send 19 queued Gmail partnership outreach drafts
- Set profile photo on `outreach@finda.sale`
- Read guide drafts in `claude_docs/strategy/guides-drafts/`

### Locked context (don't re-derive)
- Architecture: eBay → category pages; own organizer inventory → city pages (S646)
- Verdict: BUILD Workspace + Postgres cron, do NOT sign up for Smartlead/Instantly/Saleshandy/Snov
- 4 email templates locked S636 (`outreach-email-templates-v4.md`)
- DNS: SPF (`_spf.google.com`) + DMARC live on `outreach.finda.sale`, DKIM via Workspace keypair (S646)
- Shopper-side SEO is parallel critical infra (memory: feedback_seo_two_sided_distinction.md)
- `businessCategory` on Organizer is NOT an enum — it's a plain String hardcoded from `PLACES_QUERIES` config. Every Google Places result gets a valid category regardless of what Google actually returned. Category filtering alone cannot distinguish Hilton hotels from thrift stores — name matching is required.
- `toNumber()` returns `null` for null Decimal (not 0) — anti-pattern to watch in settlement/financial calculations

### Patrick pending actions (S647 wrap — carry forward)

**Push Block 1 — Settlement Hub + Sale Type Ordering (7 files)**
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

**Push Block 2 — S565 bugs + SEO + cold outreach pipeline (13 files)**
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

**Push Block 3 — 75 guide drafts + wrap docs**
```powershell
git add claude_docs/strategy/guides-drafts/
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "docs: 75 help library guide drafts (#377 complete) | wrap S647+S648"
.\push.ps1
```

**After Push Block 2 — Railway migration:**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

---

## Next Session — S645 (CHOICE OF TRACK) [COMPLETED]

**Primary goal options for S645 — Patrick chooses one:**

**Track A — Help Library Drafting Cluster 1 (Photo Workflow, 6 drafts).** Dispatch `findasale-marketing` skill with `claude_docs/strategy/guide-and-video-library-plan.md` as context. Output: 6 markdown drafts in `claude_docs/strategy/guides-drafts/` covering rapidfire mode, lighting/framing, retake guidance, multi-angle photos, photo stations, helper sessions. ~7,000 words. Patrick reads + voice-checks before cluster 2 starts. Roadmap row #377.

**Track B — Cold Outreach + Shopper SEO Parallel Specs (S642 plan, deferred).** The original S642 plan (4 parallel agent dispatches: cold outreach spec, shopper SEO audit, partnership outreach polish, LinkedIn pilot setup) is still queued. See archived dispatch prompts below for the full prompts.

**Track C — Bug fixes + Chrome QA carryover.** Pre-existing P1s in Blocked/Unverified Queue: /items/[id] 500, sale social previews blank, Hunt Pass status inconsistency, tier-lapse banner styling. None block beta demos but block real organizer trial signups.

**Track D — SmallScreen Partnership follow-up.** Once Miles/Jonathan reply with roster details, build the affiliate program spec. Roadmap has affiliate on the list but no dedicated row yet — may warrant an #379 entry.

### Tracks B (S642 plan, archived) dispatch prompts

**Agent 1 — Cold Outreach Spec (architect, embed `findasale-architect` skill context)**
Prompt: "Convert `claude_docs/strategy/OUTREACH_EMAIL_ARCHITECTURE.md` into a tightened S643-ready dev spec given S641 audit findings. Drop the Phase-2-Instantly migration assumption. Document IMAP reply parsing path explicitly (S641 architecture audit confirmed Workspace path requires +2–3 days for IMAP vs. tool path's webhook). Verify Workspace 500/day claim against current 2026 Google docs (S641 found this is a reputation milestone, not a technical cap). Update DKIM section — drop Smartlead, use Workspace-generated keypair. Specify the ~8 dev-day breakdown with exact files to create/modify. Output: spec.md ready for findasale-dev S643 dispatch."

**Agent 2 — Shopper SEO Audit (architect, embed `findasale-architect` + `marketing:seo-audit` skill context)**
Prompt: "Audit existing shopper-side discovery SEO infrastructure. Verified-existing pages: `/city/[slug]`, `/cities`, `/categories`, `/categories/[category