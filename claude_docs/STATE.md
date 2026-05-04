# PROJECT STATE

FindA.Sale is a two-sided marketplace PWA for secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment) connecting them with shoppers. Backend: Node.js/Prisma/PostgreSQL on Railway. Frontend: Next.js on Vercel. Mobile: React Native (future).

## Current Status

**Latest: S641 — Cold Outreach Deep-Audit + Two-Sided Pipeline Sync (COMPLETE — research only, no code)**

Four parallel research dispatches (~57k words, ~80 primary sources) replacing S640's shallow single-search-per-tool premise. Verdict: **BUILD don't BUY** for cold email — all four leading vendors (Smartlead, Instantly, Saleshandy, Snov.io) are campaign-orchestrators that contradict our Postgres-as-source-of-truth design. Workspace + Postgres cron path: 8 dev days, $6/mo, zero portability risk. Tool path: 7 dev days, $30–94/mo, dual-write reconciliation debt by month 3. **S640 nearly signed us up for Smartlead — that would have been wrong** (Smartlead Pro allows only one global webhook, fatal for our per-touch state machine; 49 documented outages in 12 months). If we ever do buy, **Saleshandy is the right tool**, not Smartlead or Instantly. **Critical correction**: shopper-side SEO is NOT deferrable — it's the demand-side marketplace flywheel and runs parallel to the cold-email build, not behind it. Existing scaffolding (`/city/[slug]`, `/categories/`, `/neighborhoods/`, etc.) needs an audit pass for indexing/structured-data/link-graph/SSR completeness. Innovation pilots queued: LinkedIn via Expandi (~$99/mo, defer 2 weeks past email warm-up) + NESA/NAA/NASMM partnership outreach (~$0). RVM permanently killed (FCC 2022). Roadmap entries #374–#376 added. Strategy doc: `claude_docs/strategy/cold-outreach-deep-audit-S641.md`. Evidence: `claude_docs/research/cold-outreach-2026-05/`.

**Files changed (5):** claude_docs/strategy/cold-outreach-deep-audit-S641.md (NEW), claude_docs/strategy/roadmap.md (v130 + #374–#376), claude_docs/research/cold-outreach-2026-05/* (4 NEW research docs), claude_docs/STATE.md, claude_docs/patrick-dashboard.md

**Patrick actions:** (1) Push S641 block below. (2) Confirm "build, don't buy" so S642 dispatches can launch in parallel. (3) Send 19 queued Gmail partnership outreach drafts (NESA, NAA ×2, NASMM, ISA, Nick Loper, Codie Sanchez) — runs in parallel to cold-email build, no infrastructure dependency. (4) Provision second Workspace seat for `outreach@finda.sale` ($6/mo) — needed before S643 Dev build, no rush.

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
| /items/[id] 500 (pre-existing) | Chrome QA not run | Browser test + stack trace from Vercel logs | S627 |
| Sale social previews blank | Likely missing INTERNAL_API_URL in Vercel | Env var verification | S628 |
| Hunt Pass "Inactive" vs "Active" inconsistency | Not Chrome-tested | Browser verification across views | S627 |
| Tier-lapse banner (red/dismissible vs amber/sticky) | Production state unverified | Chrome test of tier-lapse-test account | S627 |

---

## Next Session — S642 (PARALLEL DISPATCH PLANNED)

**Primary goal:** Spec out both pipelines simultaneously via parallel agent dispatches. Cold-email build verdict locked S641 (BUILD don't BUY). Shopper-side SEO confirmed parallel critical workstream (not deferred behind email). Two architects + one innovation agent in parallel.

### S642 dispatch plan (one message, four `Agent(subagent_type='general-purpose')` calls in parallel)

**Agent 1 — Cold Outreach Spec (architect, embed `findasale-architect` skill context)**
Prompt: "Convert `claude_docs/strategy/OUTREACH_EMAIL_ARCHITECTURE.md` into a tightened S643-ready dev spec given S641 audit findings. Drop the Phase-2-Instantly migration assumption. Document IMAP reply parsing path explicitly (S641 architecture audit confirmed Workspace path requires +2–3 days for IMAP vs. tool path's webhook). Verify Workspace 500/day claim against current 2026 Google docs (S641 found this is a reputation milestone, not a technical cap). Update DKIM section — drop Smartlead, use Workspace-generated keypair. Specify the ~8 dev-day breakdown with exact files to create/modify. Output: spec.md ready for findasale-dev S643 dispatch."

**Agent 2 — Shopper SEO Audit (architect, embed `findasale-architect` + `marketing:seo-audit` skill context)**
Prompt: "Audit existing shopper-side discovery SEO infrastructure. Verified-existing pages: `/city/[slug]`, `/cities`, `/categories`, `/categories/[category]`, `/neighborhoods`, `/neighborhoods/[slug]`, `/city-heat-index`, `/encyclopedia`, `/guide`, `/calendar`, `/map`, individual `/sales/[id]` and `/organizers/[id]` pages. Verify: (a) sitemap.xml coverage of all dynamic slugs, (b) per-slug unique title + meta + canonical, (c) Schema.org structured data presence (Event, Place, LocalBusiness), (d) URL pattern matches shopper-search intent ('estate sales near me', '[city] yard sales', '[zip] garage sales'), (e) SSR completeness (no JS-only Googlebot rendering), (f) internal link graph (city→neighborhood→sale→organizer→category PageRank flow), (g) Google Search Console index coverage, (h) orphaned pages with no internal links. Output: audit findings + prioritized P0/P1/P2 fix list ready for findasale-dev S643 dispatch."

**Agent 3 — Partnership Outreach Drafts (innovation/marketing, embed `findasale-marketing` skill context)**
Prompt: "Patrick has 19 partnership outreach drafts queued in Gmail (Nick Loper, Codie Sanchez, NAA ×2, NASMM, ISA, NESA, etc.). Read those drafts (or if not accessible, draft fresh based on `claude_docs/strategy/cold-outreach-deep-audit-S641.md` §5.2 partnership channel framing). Verify each: institutional voice (no founder voice), no 'AI' word, inclusive sale types, one CTA, value-led not ask-led. Recommend send sequence + cadence. Output: 19 polished drafts ready for Patrick to send manually from his existing Gmail."

**Agent 4 — LinkedIn Pilot Setup (innovation, embed `findasale-sales-ops` skill context)**
Prompt: "Spec the LinkedIn outreach pilot via Expandi (~$99/mo). Identify Sales Navigator query for finding estate-sale/auction/consignment owners. Draft the multi-channel sequence (LinkedIn touch 1 → email touch 1 → LinkedIn touch 2 → email touch 2). Calculate target list size for first 30-day pilot. Risk register (LinkedIn rate limits, account safety, message variation requirements). Output: pilot launch checklist Patrick can execute Week 4 of the cold-email rollout."

### Why parallel and not sequential
All four agents read independent context. Cold-outreach spec doesn't depend on SEO audit and vice versa. Partnership drafts and LinkedIn spec are independent of both. Sequential dispatch wastes ~3× the wall-clock for the same work. Per CLAUDE.md §7 batch dispatch: budget ~1.5–2k tokens per agent in main context post-return. Wrap S642 if context >170k.

### S643 dispatch plan (after S642 specs return, sequential — Dev work has file conflicts)
- `findasale-dev` for cold outreach build (8 days estimated, may split across S643/S644)
- `findasale-dev` for shopper SEO P0 fixes (parallel batch — different files than cold-email build, can run simultaneously per CLAUDE.md §7 BATCH DISPATCH PROTOCOL)

### Patrick pending actions for S642
- Push S641 block (5 file groups, see below)
- Confirm "build, don't buy" verdict — no objection = green light to S642 dispatch
- Send the 19 partnership outreach drafts (independent of S642 dispatch — runs in parallel)
- Provision `outreach@finda.sale` second Workspace seat ($6/mo) — needed before S643 Dev build, not blocking S642
- Generate Workspace App Password for `outreach@finda.sale` and store as env var (will be in S643 push block)

### Locked context (don't re-derive)
- Verdict: BUILD Workspace + Postgres cron, do NOT sign up for Smartlead/Instantly/Saleshandy/Snov
- Saleshandy is fallback if (a) volume crosses 5,000/day OR (b) inbox placement <70% after 30-day warm-up OR (c) reply auto-classifier proves <90% accurate
- 4 templates locked S636 (`outreach-email-templates-v4.md`)
- DNS: SPF + DMARC live, DKIM via Workspace (not Smartlead — remove Smartlead SPF entry during S643 housekeeping)
- Reply handling fully automated per D-S268
- Shopper-side SEO is parallel critical infra (memory: feedback_seo_two_sided_distinction.md)
- RVM permanently killed (FCC 2022 TCPA ruling)
- Postcard gated to Phase 2 (only if email reply rate <2.5% after 8 weeks)

### Other pending work (rolled forward)
- Pre-existing bugs: /items/[id] 500, sale social previews blank, Hunt Pass status inconsistency, tier-lapse banner styling — defer past S642/S643 outreach build unless they block beta demos

---

## Reference — Passwords & Test Accounts

**All test accounts use password:** `Seedy2025!`

| Account | Role | Tier | Notes |
|---------|------|------|-------|
| user1 (Alice) | Organizer | TEAMS | Full feature access |
| user2 (Bob) | Organizer | PRO | Standard organizer |
| user6 | Organizer | FREE | Charity sale owner |
| tier-lapse-test | Organizer | PRO | Past due (test lapsed state) |
| low-xp-shopper | Shopper | - | 10 XP (test low inventory) |

---

## Reference — Critical Credentials & URLs

**Credentials:** See private CLAUDE.md — never stored here.

**Live site:** https://finda.sale

**Admin scraper page:** https://finda.sale/admin/scraper

---

## Reference — Known Issues & Carryover

**P1 bugs (pre-existing):**
- All `/items/[id]` URLs return 500 SSR error (pre-S599, not introduced by recent work)

**P2 bugs (known, not blocking):**
- Sale page social previews missing og:image/title/description (SSR not rendering SaleOGMeta)
- Tier-lapse "Your Plan" card stays teal/cyan instead of amber when lapsed
- Hunt Pass shows "Inactive" in one view, "Active" in another (copy/state inconsistency)

**Carryover from S626:**
- Phase 1 outreach: Google Workspace seat ($6/mo) + custom Postgres cron (cold-outreach tooling)
- Reply handling: fully automated per decisions-log S268 (no SLA, no human routing)
- 19 Gmail outreach drafts queued (Nick Loper, Codie Sanchez, trade associations)

**Carryover from S640:**
- `outreach.finda.sale` subdomain: SPF ✅ DMARC ✅ DKIM ⏳ — need cold outreach tool (Instantly.ai or Smartlead) to generate DKIM keypair, then add CNAME to Vercel DNS

---

## Session Compression Log

**Compression Pass — 2026-05-03**
- Original file: 934 lines / 28.2k tokens
- Archived sessions: S617–S630 → `monthly-digest-2026-04-archive.md` (14 session summaries)
- Kept: 5 most recent sessions (S631–S635), Next Session block, Blocked/Unverified Queue, reference data
- Final file: ~185 lines / 6.5k tokens
- Reduction: 80% line count, 77% token count

**Kept sections:** Current Status, Recent Sessions (5×), Blocked/Unverified Queue, Next Session, Reference (Passwords, Credentials, Known Issues)

**Deleted sections:** LEGACY S603 plan content (lines 740–934), obsolete multi-page dispatch specs, superseded S603 viral mechanics exploration

