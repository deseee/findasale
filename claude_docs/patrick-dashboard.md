# Patrick's Dashboard — Week of May 24, 2026

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

**S778 (latest — Vercel Build Fix + eBay UX):**
- Vercel was failing 4+ deploys: `NODE_ENV=production` causes pnpm to skip devDependencies. Fixed by moving all build-time deps to regular dependencies + adding `@types/minimatch`. Awaiting your push + Vercel confirmation.
- eBay blue pill: status badge on the add-items page turns blue when an item is live on eBay (instead of a second pill).
- "Re-push to eBay" button added to edit-item page — use this to apply your description template to items already listed on eBay.
- #424 confirmed: your eBay description template only lives in eBay's own system. You added it to FindA.Sale eBay Settings. Use "Re-push" on existing items to apply it.

**S777 (Chrome QA):**
- #430 Register form silent error ✅ verified.
- #338 Sold-Price Comps ✅ verified (shows price range + condition + 3 comparable eBay sales).
- #424/#425/#426 eBay features — UNVERIFIED (no seed account has eBay OAuth connected).

**S776 (isHiddenFromDirectory fix + data recovery):**
- All 60,236 scraped organizers were hidden from city pages. Fixed + restored.
- Scraper bug patched so new scrapes won't be hidden.

**S775 (eBay Tier 2B QA + Custom Label fix):**
- #427, #428, #429 ✅. Custom Label toggles reset bug fixed (GET /organizers/me now returns those fields).

---

## Pipeline Status

- **Outreach:** Running at warmup pace (~48/day). ✅
- **Queue:** 3,319 PENDING organizers. Pipeline healthy.
- **Source attribution:** 87.7% tagged. ✅
- **WARM enrichment:** Now running daily (was weekly). ✅

---

## Action Items for Patrick

### 1. Push S778 Vercel fix + wrap docs (FIRST — unblocks Vercel):
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
pnpm install
git add packages/frontend/package.json pnpm-lock.yaml
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "fix: add @types/minimatch to deps; S778 wrap docs"
.\push.ps1
```
Then watch Vercel — should deploy clean. eBay blue pill + re-push button will go live.

### 2. Push S776 scraper fix:
```powershell
git add packages/backend/src/services/scraper/index.ts
git commit -m "fix: remove isHiddenFromDirectory=true from new scraped org creation"
.\push.ps1
```

### 3. Push S775 Custom Label fix:
```powershell
git add packages/backend/src/routes/organizers.ts
git commit -m "fix: include skuAppendDate/Cost/Location in GET /organizers/me response"
.\push.ps1
```

### 4. Push S773 Facebook export tracking + run migration:
```powershell
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
Then run migration:
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:Qlzi9PdY34gG6H7zIVOBbJScz1V1sI2sicifzXhDM8@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

### 5. Delete temp scripts (hardcoded credentials — do not commit):
Delete `packages/database/check-hidden.js` and `packages/database/fix-hidden-backfill.js`.

### 6. Fix global CLAUDE.md password (manual):
Open: `C:\Users\desee\AppData\Roaming\Claude\local-agent-mode-sessions\42d3662d-10d1-4e34-9d2d-01726cdad063\5685eb83-5389-4313-9ba3-a01c604a25c3\local_567c17d6-4663-4c25-b4fb-33a4a7fe0fd2\.claude\CLAUDE.md`
Change both occurrences of `JaZz` → `JScz` in the DATABASE_URL lines.

---

## Next Up

1. Verify Vercel deploys clean after S778 push (action #1 above)
2. Use "Re-push to eBay" on items already listed to apply description template
3. Chrome QA: #424/#425/#426 (needs PRO account with eBay OAuth connected)
4. Slow query dispatch: 4 Sentry warnings (2K, 2J, 1P, 1G) — findasale-dev to add missing indexes
