# Patrick's Dashboard — Week of May 21, 2026

---

## Audit Alerts (Weekly Site Audit — 2026-05-23)

**HIGH — `/categories` page shows raw eBay taxonomy paths as category names.** Instead of clean labels like "Comics" or "Action Figures," shoppers see internal strings like "Collectibles:Comic Books & Memorabilia:Comics:Comics & Graphic Novels." Needs a display-name mapping before this page is shown to new users.

**MEDIUM (4 items):**
- `/privacy` — em dash renders as literal `—` text
- `/calendar` — long-running sales repeat on every day, dominating the view
- `/sales/[id]` — "YARD" badge on an auction sale + breadcrumb missing sale name
- `/map` — 200 sales listed but zero pins visible on the map

Full report: `claude_docs/audits/weekly-audit-2026-05-23.md`

---

## What Happened This Week

**S776 (latest — isHiddenFromDirectory investigation + data recovery):**
- Investigated whether the S774 backfill was needed. Finding: `isHiddenFromDirectory` only gates city page directory visibility — there is no other consumer.
- Scraper bug fixed: `scraper/index.ts` was creating all new scraped orgs with `isHiddenFromDirectory: true`, permanently hiding new scrapes from city pages. Removed that line.
- **Live data regression confirmed and fixed:** All 60,236 scraped organizers were hidden from city pages (zero results on every city page). Batched reverse fix ran — all restored. City pages functional again.
- Password note: Correct DB password is `JScz...`. Global CLAUDE.md has stale `JaZz...` — see Action Item #4.

**S775 (eBay Tier 2B QA + Custom Label Bug Fix):**
- Chrome QA: #427 Local Pickup Mode ✅, #428 Review Card Readiness Borders ✅, #429 Description saves on approve ✅, Voice location extraction ✅ (you tested directly).
- Bug found + fixed: eBay Custom Label append toggles were resetting on every reload. Root cause: GET `/organizers/me` never returned those 3 fields. Fix: 3-line add to organizers.ts. Awaiting your push.

**S774 (Scraper Audit + Admin User Mgmt + Migration Recovery):**
- Full scraper ecosystem audit. Removed 5 dead scrapers, fixed 4 misconfigured ones, created missing AuctionZip workflow.
- Added admin ability to suspend/delete users. Added `isHiddenFromDirectory` flag (intent was right, implementation landed wrong — fixed S776).
- Migration crashed production DB (bulk UPDATE on 57K rows overflowed the WAL). Rewrote to DDL-only, recovered cleanly.
- Postgres moved from EU West to US East — cross-Atlantic latency eliminated.

**S773 (Facebook Export Tracking + Sold Nudge):**
- Built per-item Facebook export tracking + organizer nudge when exported items sell on FindA.Sale.
- **Action needed:** Push block + migration in Action Items below.

---

## Pipeline Status

- **Outreach:** Running at warmup pace (~48/day). ✅
- **Queue:** 3,319 PENDING organizers. Pipeline healthy.
- **Source attribution:** 87.7% tagged. ✅
- **WARM enrichment:** Now running daily (was weekly). ✅

---

## Action Items for Patrick

### 0. Push S776 scraper fix (1 file):
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/backend/src/services/scraper/index.ts
git commit -m "fix: remove isHiddenFromDirectory=true from new scraped org creation (was hiding all new scrapes from city pages)"
.\push.ps1
```

### 1. Push S775 Custom Label fix + lockfile + wrap docs:
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
pnpm install
git add packages/backend/src/routes/organizers.ts
git add pnpm-lock.yaml
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git add claude_docs/strategy/roadmap.md
git commit -m "fix: include skuAppendDate/Cost/Location in GET /organizers/me response; regenerate lockfile for Vercel"
.\push.ps1
```
After Railway deploys: go to `/organizer/settings/ebay`, toggle "Append Date", save, reload — checkbox should stay checked.

### 2. Push S773 Facebook export tracking (11 files):
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/database/prisma/schema.prisma
git add packages/database/prisma/migrations/20260523120000_add_fb_exported_at/migration.sql
git add packages/backend/src/controllers/exportController.ts
git add packages/backend/src/services/facebookNudgeService.ts
git add packages/backend/src/controllers/posPaymentController.ts
git add packages/backend/src/controllers/reservationController.ts
git add packages/backend/src/controllers/stripeController.ts
git add packages/backend/src/controllers/terminalController.ts
git add packages/backend/src/controllers/ebayController.ts
git add packages/backend/src/jobs/ebaySoldSyncCron.ts
git add packages/backend/src/routes/items.ts
git commit -m "feat: track fbExportedAt per item on Facebook XLSX export; nudge organizer to mark sold on FB when item sells"
.\push.ps1
```
Then run the migration:
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:Qlzi9PdY34gG6H7zIVOBbJScz1V1sI2sicifzXhDM8@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

### 3. Delete temp scripts (hardcoded credentials — do not commit):
Delete `packages/database/check-hidden.js` and `packages/database/fix-hidden-backfill.js`.

### 4. Fix global CLAUDE.md password (manual — important):
Open: `C:\Users\desee\AppData\Roaming\Claude\local-agent-mode-sessions\42d3662d-10d1-4e34-9d2d-01726cdad063\5685eb83-5389-4313-9ba3-a01c604a25c3\local_567c17d6-4663-4c25-b4fb-33a4a7fe0fd2\.claude\CLAUDE.md`
Change both occurrences of `JaZz` → `JScz` in the DATABASE_URL lines. This is why migration commands kept failing this session.

---

## Next Up

1. Chrome QA backlog: #338 (Sold-Price Comps), #424, #425, #426 (eBay — needs PRO + eBay connected), #430 (register form silent error)
2. Slow query dispatch: 4 Sentry warnings (2K, 2J, 1P, 1G) — findasale-dev to add missing indexes
3. S771 Sentry fixes still need push if not done (scraper/index.ts + sentry.client.config.ts)
