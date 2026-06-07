# Patrick's Dashboard — S904 Wrap

---

## 🔴 PUSH THIS NOW — Bug A (Passkey) + #197 (Bounty) Fix

Both fixes are code-complete, TypeScript-clean, and ready to ship in one commit:

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/frontend/next.config.js
git add packages/frontend/hooks/usePasskey.ts
git add packages/backend/src/controllers/bountyController.ts
git commit -m "fix: passkey beforeFiles route + double /api/ prefix; fix: #197 BountyMatchModal 403 — compare organizer.userId"
.\push.ps1
```

After ~3 min Railway + Vercel deploys:
- Chrome-verify passkey login (try logging in with a passkey) → BQ 11→10
- Chrome-verify BountyMatchModal as Alice on an item → BQ 10→9

---

## ⚠️ ALSO NEEDED — Restore Corrupted Local Files

Before any local dev, run these in PowerShell. 13 files were silently truncated by the Cowork Edit tool (380+ lines missing vs GitHub).

```powershell
# Step 1: Remove git lock file (if present)
Remove-Item "C:\Users\desee\ClaudeProjects\FindaSale\.git\index.lock"

# Step 2: Restore all 13 truncated files
cd C:\Users\desee\ClaudeProjects\FindaSale
git checkout HEAD -- packages/backend/src/controllers/internalGeocodingController.ts packages/backend/src/index.ts packages/backend/src/jobs/autoSeedOutreachCron.ts packages/backend/src/scripts/run-search-facebook-events.ts packages/backend/src/services/scraper/sources/auctionZipScraper.ts packages/backend/src/services/scraper/sources/naaAuctioneerDirectory.ts packages/backend/src/services/shopifyService.ts packages/database/prisma/schema.prisma packages/frontend/components/SaleCard.tsx packages/frontend/data/guides/entries/connect-shopify.ts packages/frontend/pages/_app.tsx packages/frontend/pages/_document.tsx "packages/frontend/pages/sales/[id].tsx"
```

**Why this matters:** Pushing without restoring will delete 380+ lines of production code from GitHub (including all of `_app.tsx`'s providers and the complete schema.prisma).

---

## ✅ Push — S904 Wrap Docs

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "docs: S904 wrap — full QA sweep, Bug A passkey CODED, BQ=11"
.\push.ps1
```

---

## S904 — What I Found

### Full Product QA Sweep — All Major Surfaces Tested

Walked the entire product as Alice (organizer) and Leo/Bob (shoppers). Everything listed below works correctly:

**Shopper discovery:** Feed, Calendar, Wishlist, Clearance, Categories (with drill-down to Comics — 30 real items), Encyclopedia, Guides, Trending, Map (55 pins + popups), Search (tabs + filters + Plan Route)

**Organizer management:** Dashboard, Social Posts (AI generates Facebook/Instagram/Nextdoor/etc. copy), Print Kit (sign templates + QR labels), Ripples analytics, Add Items (Camera/Batch/Manual/CSV tabs), Settings profile, Messages (thread list + full conversation view)

### Bug A — Passkey Auth (P1) — CODED ✅

Two root causes found and fixed:

1. **`next.config.js`** was missing the passkey route in `beforeFiles` — so NextAuth's catch-all intercepted `/api/auth/passkey/*` requests before they could reach Railway. Added the route.

2. **`hooks/usePasskey.ts`** had a double `/api/` prefix bug — the authenticate complete step called `/api/auth/passkey/authenticate/complete` on an axios instance that already has `baseURL: '/api'`, resulting in `/api/api/auth/passkey/authenticate/complete`. Fixed to `/auth/passkey/authenticate/complete`.

### #197 BountyMatchModal — Still Needs Your Push (coded S903)

Already in the pushblock above.

### 3 New P3 Bugs Found

1. **Messages reply form barely visible in dark mode** — the form blends with the page background. Exists and works, just hard to see.
2. **Hero search Enter key doesn't navigate** — typing a search term and pressing Enter does nothing; must click the button. `/search?q=...` URL works fine.
3. **Social Posts modal Escape key doesn't close** — must click the X button. Minor.

---

## ⚠️ BQ = 11 — QA-ONLY Until Items Cleared

After pushing the fixes above and Chrome-verifying both (passkey + BountyMatchModal), BQ drops to 9. Still in QA mode until below 8.

To get to DEV mode: 2 more BQ items need to be fixed + Chrome-verified.

---

## 🔴 Patrick Decisions Required

### 1. Push Bug A + #197 Fix → See top of this document

### 2. FB Marketplace — DROP or pursue?
Confirmed dead end: Cloudflare Worker proxy returns 0 listings across all metros. FB soft-blocks datacenter IPs. **Recommendation: DROP.** Graph API OAuth (#365) is the long-term path.

### 3. #335 Outreach Resume
When ready:
1. Reactivate outreach@finda.sale at **admin.google.com → Directory → Users → outreach@finda.sale → Reactivate**
2. Set `OUTREACH_ENABLED=true` on Railway backend
3. Re-enable `pipeline-outreach-emails.yml` on GitHub
4. Re-trigger Jane Thrift payout email after reactivation

### 4. #332 Shopify
S890 fixes are on GitHub (correct REST flow, API version 2025-10). Need a real Shopify custom-app store to QA end-to-end.

### 5. #230 Smart Buyer Widget
Publish a sale on user1 (Alice Johnson) → Claude can verify SmartBuyerWidget shows shopper data.

---

## Project Status — Quick View

| Area | Status |
|------|--------|
| Blocked Queue | **11 rows** — QA-ONLY (push Bug A + #197 to get to 9) |
| Bug A — Passkey auth | 🔴 Fix CODED — awaiting your push |
| #197 Bounties | 🔴 Fix CODED — awaiting your push |
| Bug C — Messages dark mode | 🟡 New P3 — reply form low contrast |
| Hero search Enter | 🟡 New P3 — no form action |
| D-002 dark mode | ✅ RESOLVED S898 |
| Hydration errors | ✅ RESOLVED S899 |
| Logout bug | ✅ RESOLVED S897 |
| FB Events geocoding | ✅ RESOLVED S901 — 93% geocoded |
| Outreach | 🔴 Suspended — Patrick must reactivate (#335) |
| Local files | ⚠️ 13 truncated — restore before dev work (see above) |
