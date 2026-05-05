# Patrick's Dashboard — May 5, 2026 (S649 wrap)

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
