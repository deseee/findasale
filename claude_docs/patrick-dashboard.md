# Patrick's Dashboard — Week of May 24, 2026 (Updated S780)

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

**S780 (latest — Deliverability Fix + GitGuardian + CORS + Indexes):**
- Fixed email MIME: plain-text fallback now included in outreach emails (was html-only, hurting deliverability)
- Fixed CORS P0: `api.finda.sale` wasn't in the CORS allowlist after S779 added it as Railway custom domain — 34 errors in 23hrs
- GitGuardian alert: live Railway DB password was committed in STATE.md (S776). Removed from files. **You need to rotate the Railway DB password** — it's in git history
- 7 database indexes added for 5 Sentry slow queries (1–1.7 second queries down to fast indexed lookups)
- DNS audit: root SPF needs `_spf.google.com` include, root DKIM missing — see action items below
- All 4 pending pushes from S779 confirmed deployed and live on Vercel

**S779 (Outreach Email Deliverability Fix):**
- Found root cause of 0% open rate: every email body had `backend-production-153c9.up.railway.app` URLs — spam filters blocked them automatically.
- Fixed: `api.finda.sale` added as custom domain on Railway; DNS records added to Vercel; you set `RAILWAY_BACKEND_URL=https://api.finda.sale` in Railway Variables.

**S778 (Vercel Build Fix + eBay UX):**
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

### 1. URGENT — Rotate Railway DB password:
Railway dashboard → findasale-db service → Variables → change `POSTGRES_PASSWORD`. Then update `DATABASE_URL` on the backend service too. After rotation, update your global CLAUDE.md with the new password.

### 2. Push S780 changes:
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/backend/src/jobs/outreachEmailsCron.ts
git add packages/backend/src/index.ts
git add packages/database/prisma/schema.prisma
git add packages/database/prisma/migrations/20260524120000_add_performance_indexes/migration.sql
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "fix: MIME text/plain + CORS api.finda.sale + 7 perf indexes; S780 wrap"
.\push.ps1
```
Then run migration (after Railway deploys):
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="[Railway DATABASE_URL — get from Railway dashboard Variables tab]"
npx prisma migrate deploy
npx prisma generate
```

### 3. Delete temp scripts (hardcoded credentials — do NOT commit):
```powershell
Remove-Item -LiteralPath "C:\Users\desee\ClaudeProjects\FindaSale\packages\database\check-hidden.js"
Remove-Item -LiteralPath "C:\Users\desee\ClaudeProjects\FindaSale\packages\database\fix-hidden-backfill.js"
```

### 4. DNS fixes for email deliverability:
- Update root SPF record to: `v=spf1 a mx include:_spf.google.com include:_spf.mlsend.com ~all`
- Add root DKIM: generate from Google Admin Console for `google._domainkey.finda.sale`
- Later: upgrade DMARC from `p=none` to `p=quarantine`

### 5. Fix global CLAUDE.md password (manual):
Change both occurrences of `JaZz` → `JScz` in the DATABASE_URL lines.

---

## Next Up

1. Rotate Railway DB password (action #1 above — P0 security)
2. Push S780 + run migration (action #2)
3. Delete temp scripts (action #3)
4. DNS fixes for email deliverability (action #4)
5. user3 TEAMS modal bug + review queue UX improvement
6. Chrome QA: #424/#425/#426 (needs PRO account with eBay OAuth connected)
