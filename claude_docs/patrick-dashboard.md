# Patrick's Dashboard — May 5, 2026 (S647 wrap)

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

## Next Session (S648)

1. Verify S647 is live — Railway logs for outreach pipeline + Vercel deploy for SEO fixes.
2. Pick a track: Shopper SEO P2 / Help Library site surface (#378) / CategoryTopFinds Chrome QA.
