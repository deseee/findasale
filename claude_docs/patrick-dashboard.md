# Patrick's Dashboard — Week of May 20, 2026

---

## What Happened This Week

**S769 (latest — roadmap audit):**
- Roadmap corrected: #380 (FB Marketplace scraper), #418 (18-state scrapers), #331 (Voice-to-Tag Phase 2), #378 (Help Library) all marked SHIPPED. #364 (Bing) marked DEPRECATED. #460 (Auto-Liquidation) marked SUPERSEDED by existing discount rules. #338 (Sold-Price Comps) flagged as "possibly shipped — verify in Chrome."

**S768+ (UX spot-check + Sentry dispatch):**
- dashboard.tsx: Literal "X shoppers" fixed, clipboard error handling added, aria-labels cleaned up
- edit-sale/[id].tsx: React hooks violation fixed, geocoding failure now shows a toast, 9 redundant aria-labels removed
- NODEJS-17 resolved: organizers.ts was silently truncated — appended the missing 14 lines (claim-oauth close + export)
- NODEJS-S resolved: eBay webhook routes now use express.raw() like Stripe — "stream is not readable" gone
- NODEJS-1Q addressed: 3 new Review table indexes (userId, composite saleId+moderationStatus+createdAt, reviewerIp) + migration file

**S768 (CI fixes + Voice Location + eBay Custom Label):** Fixed 3 Sentry/CI issues (requestTimeout exemption for internal routes, double-response in scraper/enrichment controllers, 6 slow-query indexes). Built voice location extraction — when you say "living room" or "Bin B6" while recording a description, the room/bin field auto-fills silently, no extra button. Added eBay Custom Label append toggles: new card in eBay settings lets you turn on date, cost, and/or location appended to the Custom Label (FAS-... 2026-05-20 $10.50 Row 2 Bin D). Also recovered schema.prisma after Edit-tool truncation wiped ~27 lines. Railway cache-busted.

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
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git add claude_docs/strategy/roadmap.md
git commit -m "feat: voice location extraction + eBay Custom Label toggles; fix: requestTimeout /api/internal/; fix: double-response scraper/enrichment; fix: 6 slow-query indexes; fix: organizers.ts truncation (NODEJS-17); fix: eBay webhook stream (NODEJS-S); fix: Review indexes (NODEJS-1Q); fix: dashboard X-placeholder + clipboard; fix: edit-sale hooks + geocoding toast + aria-labels"
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
