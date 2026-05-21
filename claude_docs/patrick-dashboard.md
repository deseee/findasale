# Patrick's Dashboard — Week of May 21, 2026

---

## What Happened This Week

**S770 (latest — MailerLite cleanup):**
- MailerLite free plan was FULL (500/500) — all new user signups were getting 413 errors (a1clcook@gmail.com was blocked). Root cause: the weekly `syncLeadTierGroups` cron was syncing ALL 56K+ scraped directory organizers to MailerLite, not just registered users. 498 of 501 subscribers were junk scraped emails.
- Purged all 498 junk subscribers. 4 legitimate subscribers remain.
- Fixed root cause: added `userId: { not: null }` filter to the cron query so only real registered users sync going forward.
- Fixed hex escape Prisma error: scraped HTML with `\x` byte sequences now sanitized before DB write (sale cmoog3n0l009tq4utw56ejcrx was failing).

**S769 (roadmap audit):**
- Roadmap corrected: #380 (FB Marketplace scraper), #418 (18-state scrapers), #331 (Voice-to-Tag Phase 2), #378 (Help Library) all marked SHIPPED. #364 (Bing) DEPRECATED. #460 (Auto-Liquidation) SUPERSEDED.

**S768 (CI fixes + Voice Location + eBay Custom Label):** Fixed 3 Sentry/CI issues. Built voice location extraction — say "living room" or "Bin B6" while recording and room field auto-fills. Added eBay Custom Label append toggles in settings. Recovered schema.prisma after truncation.

**S767:** Fixed all 3 eBay bugs (#424/#425/#426). Patrick verified #413 Safety Disclosures + #415 Donation Kit.

**S766:** Tier 2C/3A QA sweep. Fixed #363 lot number, #58 achievement hooks, #221 holds checkout.

---

## Pipeline Status

- **Outreach:** Running at warmup pace (~48/day). ✅
- **Queue:** 3,319 PENDING organizers. Pipeline healthy.
- **Source attribution:** 87.7% tagged. ✅
- **WARM enrichment:** Now running daily (was weekly). ✅

---

## Action Items for Patrick

### 1. Push S768 + S770 combined:
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/backend/src/middleware/requestTimeout.ts
git add packages/frontend/pages/organizer/dashboard.tsx
git add packages/frontend/pages/organizer/edit-sale/[id].tsx
git add packages/backend/src/index.ts
git add packages/database/prisma/migrations/20260520140000_add_review_query_indexes/migration.sql
git add packages/backend/src/controllers/internalScraperController.ts
git add packages/backend/src/controllers/internalSaleDetailEnrichmentController.ts
git add packages/backend/src/routes/internal.ts
git add packages/database/prisma/schema.prisma
git add packages/backend/src/controllers/voiceController.ts
git add packages/frontend/components/VoiceDescriptionInput.tsx
git add packages/frontend/components/RapidCapture.tsx
git add "packages/frontend/pages/organizer/edit-item/[id].tsx"
git add "packages/frontend/pages/organizer/add-items/[saleId].tsx"
git add packages/backend/src/controllers/uploadController.ts
git add packages/backend/src/controllers/ebayController.ts
git add packages/backend/src/routes/organizers.ts
git add packages/frontend/pages/organizer/settings/ebay.tsx
git add packages/database/prisma/migrations/20260520120000_add_sku_append_toggles/migration.sql
git add packages/backend/Dockerfile.production
git add packages/backend/src/services/listingEnrichmentService.ts
git add packages/backend/src/jobs/outreachEmailsCron.ts
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git add claude_docs/strategy/roadmap.md
git commit -m "feat: voice location extraction + eBay Custom Label toggles; fix: MailerLite cron userId filter; fix: hex escape sanitizer; fix: requestTimeout /api/internal/; fix: double-response scraper/enrichment; fix: 6 slow-query indexes; fix: organizers.ts truncation; fix: eBay webhook stream; fix: Review indexes; fix: dashboard placeholder + clipboard; fix: edit-sale hooks + geocoding toast"
.\push.ps1
```

### 2. Run migration (after push deploys):
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

### 3. Deploy email verification migration (when ready — pending since S726):
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

---

## Next Up

1. QA after push: verify voice extraction (say "living room" in mic), verify eBay Custom Label preview in settings, re-verify #424/#425/#426
2. QA eBay Tier 2B batch (#428 review borders, #427 local pickup, #429 store template skip) — needs Patrick present + PRO + eBay connected
3. Sentry remaining: NODEJS-17 (organizers route ReferenceError), NODEJS-S (eBay account-deletion stream error), NODEJS-1Q (Review LEFT JOIN slow query)
4. Optional: check Railway logs for more 413 MailerLite errors (couldn't access from this session). a1clcook should auto-enroll on next login.
