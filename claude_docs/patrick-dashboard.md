# Patrick's Dashboard — Week of May 20, 2026

---

## What Happened This Week

**S768 (latest — CI fixes + Voice Location + eBay Custom Label):** Fixed 3 Sentry/CI issues (requestTimeout exemption for internal routes, double-response in scraper/enrichment controllers, 6 slow-query indexes). Built voice location extraction — when you say "living room" or "Bin B6" while recording a description, the room/bin field auto-fills silently, no extra button. Added eBay Custom Label append toggles: new card in eBay settings lets you turn on date, cost, and/or location appended to the Custom Label (FAS-... 2026-05-20 $10.50 Row 2 Bin D). Also recovered schema.prisma after Edit-tool truncation wiped ~27 lines. Railway cache-busted.

**S767:** Fixed all 3 eBay bugs (#424 {{DESCRIPTION}} literal, #425 intermittent toast + stale price, #426 Best Offer UI). Patrick verified #413 Safety Disclosures + #415 Donation Kit.

**S766:** Tier 2C/3A QA sweep. Fixed #363 lot number, #58 achievement hooks, #221 holds checkout.

**S765:** Sentry/CI health audit. Hooks violations, MutationCache, enrichment/geocoding fire-and-forget, FB Events address parsing all fixed.

---

## Pipeline Status

- **Outreach:** Running at warmup pace (~48/day). ✅
- **Queue:** 3,319 PENDING organizers. Pipeline healthy.
- **Source attribution:** 87.7% tagged. ✅
- **WARM enrichment:** Now running daily (was weekly). ✅

---

## Action Items for Patrick

### 1. Push S768 changes:
```powershell
git add packages/backend/src/middleware/requestTimeout.ts
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
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "feat: voice location extraction (room/bin/shelf) via existing mic; feat: eBay Custom Label append toggles (date/cost/location); fix: requestTimeout /api/internal/ exemption; fix: double-response internalScraper/EnrichAI; fix: 6 slow-query indexes; fix: schema truncation recovery"
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
