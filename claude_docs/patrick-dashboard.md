# Patrick's Dashboard — Week of May 19, 2026

---

## What Happened This Week

**S767 (latest — eBay bug fixes + QA):** Fixed all 3 eBay bugs Patrick confirmed broken. #424: `{{DESCRIPTION}}` literal was only replacing first occurrence — now replaces all. #425: toast now fires on all success paths + stale price flushed to DB before eBay push. #426: Best Offer UI (toggle, auto-accept/decline %, live preview) was hidden behind wrong gate — now visible. QA: Patrick verified #413 Physical Safety Disclosures and #415 Donation Kit directly. Also recovered 4 Edit-tool-truncated files (index.ts was missing 29 lines of startup crons — none committed, no prod impact).

**S766:** Tier 2C/3A QA. Fixed: #363 lot number input, #58 achievement hooks, #221 holds checkout 404. Verified 9 items. eBay #424/#425/#426 confirmed broken by Patrick.

**S765:** Sentry/CI health audit. 36 backend errors → 0. Fixed hooks violations, MutationCache, enrichment/geocoding fire-and-forget, FB Events address parsing.

**S763–S764:** 22 stale roadmap entries cleared, 18 items QA verified, 5 bugs fixed (Flip Report, login, Hold-to-Pay, GEO JSON-LD SSR, ENDED noindex).

---

## Pipeline Status

- **Outreach:** Running at warmup pace (~48/day). ✅
- **Queue:** 3,319 PENDING organizers. Pipeline healthy.
- **Source attribution:** 87.7% tagged. ✅
- **WARM enrichment:** Now running daily (was weekly). ✅

---

## Action Items for Patrick

### 1. Push S767 eBay fixes:
```powershell
git add packages/backend/src/controllers/ebayController.ts
git add packages/backend/src/controllers/itemController.ts
git add packages/frontend/pages/organizer/add-items/[saleId]/review.tsx
git add packages/frontend/pages/organizer/edit-item/[id].tsx
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "fix: eBay {{DESCRIPTION}} template all occurrences (#424); fix: push toast fallback + stale price flush (#425); fix: Best Offer UI gate removed (#426)"
.\push.ps1
```

### 2. Deploy email verification migration (when ready):
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="[Railway DATABASE_URL from dashboard]"
npx prisma migrate deploy
npx prisma generate
```

---

## Next Up

1. QA eBay Tier 2B batch (#428 review borders, #427 local pickup, #429 store template skip) — needs Patrick present + PRO + eBay connected
2. Dispatch Sentry fixes: NODEJS-1B (scraper ingest double-response), NODEJS-17 (organizers route ReferenceError), NODEJS-S (eBay account-deletion stream error), NODEJS-1Q (17s slow DB query — missing index)
