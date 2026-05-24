# QA Session Prompt — Groups B, C, D
# Generated: S784 (2026-05-24)
# Use this as the opening prompt for a dedicated QA session

---

You are starting a dedicated QA sprint for FindA.Sale. Read STATE.md first (mandatory), then execute the batches below. All test accounts use password `Seedy2025!`.

**Account map:**
- user1@example.com — ADMIN + TEAMS organizer (primary organizer account)
- user2@example.com — PRO organizer
- user3@example.com — SIMPLE organizer
- user12@example.com — shopper WITH Hunt Pass active
- user13@example.com — shopper (no Hunt Pass)

**CRITICAL rules:**
- Log in ONCE per batch. Complete all tests for that account before switching.
- Click Sign In ONCE and wait. Never retry login — rate limiter (15 attempts/15min) will lock you out.
- Use mcp__Claude_in_Chrome__upload_image for any photo upload tests — it works, do not skip.
- Every ✅ requires: "Navigated to [URL] as [user]. Clicked [element]. Saw [outcome]. Refreshed — [persisted/not]."
- At session end: log Patrick back in via Google (artifactmi@gmail.com).
- **ONE CHROME SESSION AT A TIME.** Do not start this session while another Cowork session is using Chrome — they share the same browser and will conflict (one session's login boots the other).

**QA ceiling check:** COUNT items in STATE.md Blocked/Unverified Queue BEFORE starting. If ≥8, this session IS the QA session — no new dev.

---

## BATCH 1 — XP/Guild system (user12 as shopper + DB verification)
Run these SEQUENTIALLY — they share the Chrome browser.

Connect to Railway DB for DB checks:
```python
import psycopg2
# Get current connection string from Railway dashboard → Postgres service → Connect tab
# Password rotates — never use a hardcoded string from docs
conn = psycopg2.connect("postgresql://postgres:[PASSWORD]@maglev.proxy.rlwy.net:13949/railway")
cur = conn.cursor()
```
**Note:** The DB password rotated on 2026-05-24. Get the current password from Railway dashboard → Postgres → Connect → copy the full DATABASE_URL. The VM disk is also often full — install to /tmp: `pip install psycopg2-binary --target /tmp/pylibs`, then `import sys; sys.path.insert(0, '/tmp/pylibs')` before importing psycopg2.

### #267 — RSVP Bonus XP (2 XP, cap 10/month)
- Log in as user13 (fresh shopper, likely no prior RSVPs this month)
- Navigate to any PUBLISHED sale → RSVP to it
- DB check: `SELECT * FROM "PointsTransaction" WHERE "userId" = (SELECT id FROM "User" WHERE email='user13@example.com') AND type='RSVP' ORDER BY "createdAt" DESC LIMIT 5;`
- Verify 2 XP awarded. Check notification fired.
- RSVP 5 more times (different sales) → verify cumulative cap is respected (max 10 XP/month from RSVPs)
- ✅ if: XP awarded, notification visible, cap enforced

### #255 — Rank-Up Notifications
- DB check user13's current XP: `SELECT "guildXp", "explorerRank" FROM "User" WHERE email='user13@example.com';`
- If rank is INITIATE (0-499), award enough XP to cross 500 via DB: `UPDATE "User" SET "guildXp"=500 WHERE email='user13@example.com';`
- Note: rank-up notifications fire from xpService.awardXp — they won't fire from a direct DB update. Instead: award XP via a triggerable action (RSVP, QR scan) that would push them over. OR check if a notification already exists from prior awardXp calls.
- Alternative: DB query `SELECT * FROM "Notification" WHERE "userId"=(SELECT id FROM "User" WHERE email='user13@example.com') AND type='RANK_UP' ORDER BY "createdAt" DESC LIMIT 3;`
- ✅ if: RANK_UP notification row exists in DB with correct new rank

### #257 — Scout Hold Duration Fix (45 min, not 30)
- DB check: `SELECT "explorerRank" FROM "User" WHERE email='user12@example.com';`
- Set user12 to SCOUT rank if needed: `UPDATE "User" SET "explorerRank"='SCOUT' WHERE email='user12@example.com';`
- Log in Chrome as user12. Navigate to any PUBLISHED sale with items. Place a hold on an item.
- Verify hold timer shows 45 minutes (not 30)
- ✅ if: hold timer = 45 min on screen

### #261 — Treasure Hunt XP Rank Multiplier
- DB check xpService getRankXpMultiplier logic (RANGER=1.5x → 38 XP from base 25)
- Set user12 to RANGER rank: `UPDATE "User" SET "explorerRank"='RANGER', "guildXp"=1000 WHERE email='user12@example.com';`
- Need to trigger a QR scan — navigate to any item's QR endpoint: `GET /api/items/[itemId]/scan` or use the in-app QR scanner if available
- DB check after: `SELECT amount, type FROM "PointsTransaction" WHERE "userId"=(SELECT id FROM "User" WHERE email='user12@example.com') AND type='QR_SCAN' ORDER BY "createdAt" DESC LIMIT 1;`
- ✅ if: amount ≈ 38 (not flat 25)

### #312 — XP Economy Security Hardening
- Log in as user12 (shopper). Navigate to /shopper/leaderboard or wherever the leaderboard renders.
- Inspect the page source / network tab — verify NO userId fields in the leaderboard API response
- Spend XP on a sink: navigate to /shopper/hunt-pass or wherever XP spend is available → generate a coupon (#289) → verify XP balance decrements
- ✅ if: no userIds exposed in leaderboard; XP spend is atomic (balance updates correctly)

### #289 — Shopper Coupon Generation (3 Tiers)
- As user12 with XP balance: navigate to where coupon generation is exposed (try /shopper/dashboard or /shopper/hunt-pass)
- POST to `/api/coupons/generate-from-xp` with `{"tier": "ONE_OFF_TEN"}` (100 XP tier) via Chrome or API call
- Verify 100 XP deducted, coupon row created
- Try generating same tier again in same month → should get 429 error
- DB check: `SELECT * FROM "Coupon" WHERE "userId"=(SELECT id FROM "User" WHERE email='user12@example.com') AND "generatedFromXp"=true ORDER BY "createdAt" DESC LIMIT 3;`
- ✅ if: coupon created, XP deducted, monthly cap enforced

### #227 — XP Profile API + Shopper Dashboard
- Log in as user12. Navigate to /shopper/dashboard
- Verify XP profile widget shows: guildXp, explorerRank, huntPassActive (should be true for user12), rankProgress with nextRank/xpToNextRank
- ✅ if: all 5 fields visible and populated with real data

### #290 — Hunt Pass Page Dual-Rail Cash Column
- As user12, navigate to /shopper/hunt-pass
- Verify: Rarity Boost shows "15 XP / or $0.15 via card", Haul Visibility shows "$0.25 via card", Event Sponsorship shows "$5.00 via card"
- ✅ if: all 3 cash columns present with correct amounts

---

## BATCH 2 — Camera/Photo pipeline (user1 as organizer)
Use mcp__Claude_in_Chrome__upload_image — it works, do not skip photo tests.

### #319 — Burst Clustering (Batch Upload Fix)
- Log in as user1. Navigate to /organizer/add-items/[any PUBLISHED saleId]
- Upload 5+ photos at once using mcp__Claude_in_Chrome__upload_image (use any test images available, or download some from Unsplash first)
- Verify: items are GROUPED into clusters (2-3 photos per item), not 1 item per photo
- ✅ if: 5 photos → fewer than 5 items created (clustering working)

### #336 — Organizer-Intent-Wins in Rapidfire Pipeline
- In rapidfire mode, open camera → photograph an item → IMMEDIATELY type a manual title like "My Special Title" in the title field BEFORE AI completes
- Wait for AI debounce (4.5 seconds) + AI run to complete
- Verify: your manually typed title is NOT overwritten by AI result
- Test same for price: type $99.99, wait for AI → verify $99.99 is retained
- ✅ if: manual values survive AI run. ❌ if AI overwrites them.

### #339 — Low-Confidence Refuse-to-Fill
- Upload a photo of something ambiguous (blank paper, odd angle, blurry) using upload_image
- Wait for AI analysis
- Verify: if Haiku confidence < 0.6 for brand/category, those fields are left BLANK (not filled with a guess)
- ✅ if: ambiguous item leaves brand + category blank. Title and description may still fill.

### #340 — Auto-Reopen Camera After Publish (Batch Loop)
- Use mobile viewport (resize Chrome to 375px width via javascript_tool if needed)
- In rapidfire mode: photograph item → complete review → publish
- Verify: camera reopens AUTOMATICALLY with `?openCamera=1&captureMode=rapidfire` (no manual navigation needed)
- Verify: sticky green "Done" button is visible in top-right
- Dark mode: toggle dark, repeat → verify no rendering issues
- ✅ if: camera auto-reopens + Done button present + dark mode clean

### #328 — Photo Role Awareness Phase 1
- Upload a multi-photo cluster (front shot + close-up/detail shot)
- After AI analysis, DB check: `SELECT id, "photoRole", "roleReasoning" FROM "Photo" WHERE "itemId" IN (SELECT id FROM "Item" WHERE "saleId"=(SELECT id FROM "Sale" WHERE "organizerId"=(SELECT id FROM "Organizer" WHERE "userId"=(SELECT id FROM "User" WHERE email='user1@example.com')) ORDER BY "createdAt" DESC LIMIT 1)) ORDER BY "createdAt" DESC LIMIT 10;`
- Verify: photoRole field populated (FRONT, DETAIL_DAMAGE, LABEL_BRAND, etc.)
- ✅ if: photoRole is non-null on uploaded photos

### #325 — Best-Photo-First Sorting
- After a multi-photo upload (from #319 or #328 above), check item photos
- DB check: `SELECT "orderIndex", "visionLabels" FROM "Photo" WHERE "itemId"=... ORDER BY "orderIndex" ASC LIMIT 5;`
- Verify: photo with highest Vision detection confidence has orderIndex=0
- ✅ if: orderIndex=0 photo has richest visionLabels

### #349 — In-App QR Scanner Phase 1
- As user12 (shopper, mobile viewport), navigate to any sale page
- Look for QR scanner icon next to notification bell in top header
- Tap → verify camera modal opens
- ✅ if: QR scanner icon present + modal opens. UNVERIFIED if no camera available in VM.

---

## BATCH 3 — eBay features (user1 as organizer, eBay connected)
Note: These require user1 to have eBay credentials connected. If eBay is not connected for user1 in Railway DB, mark as UNVERIFIED and note why.

Check first: `SELECT "ebayAccessToken" IS NOT NULL as has_token FROM "EbayConnection" WHERE "organizerId"=(SELECT id FROM "Organizer" WHERE "userId"=(SELECT id FROM "User" WHERE email='user1@example.com'));`

If no token: mark all eBay items as UNVERIFIED (requires Patrick's eBay account).

### #244 — eBay Quick List / Direct Push
- Navigate to /organizer/add-items/[saleId] → verify eBay CSV export button exists
- Navigate to an item's edit page → verify "Push to eBay" button present
- If eBay connected: push a test item → verify listing created in eBay Seller Hub
- ✅ if: UI buttons present + push succeeds. UNVERIFIED if no eBay token.

### #293 — eBay Listing Data Parity
- Edit an item → navigate to "Edit eBay" section → verify UPC, condition notes, subtitle fields are visible
- Verify best offer toggles exist
- ✅ if: all 17 fields visible in the "Edit eBay" expand section

### #295 — eBay Category Review Alerting
- Navigate to a sale detail page → check if any items have amber "⚠ eBay Category Needed" badge
- If not present: push an item that would trigger category exhaustion (needs eBay connection)
- ✅ if: amber badge visible when ebayNeedsReview=true. UNVERIFIED if can't trigger.

### #298 — eBay Advanced Setup
- Navigate to /organizer/settings/ebay
- Verify all 8 sections render
- Click "Use suggested defaults" → verify weight tiers auto-fill
- ✅ if: page loads with 8 sections, defaults button works, real eBay policies in dropdowns

### #320 — Async eBay Comp Fetch
- Edit an item with price=null → publish it
- Wait 2 minutes → check DB: `SELECT "aiSuggestedPrice" FROM "Item" WHERE id='[itemId]';`
- Verify aiSuggestedPrice is populated (not null)
- Set item.price = 50.00, publish → verify aiSuggestedPrice does NOT change (organizer price wins)
- ✅ if: async comp populated for null-price item; organizer price protected

### #321 — Encyclopedia Auto-Generation
- DB check: `SELECT slug, status, source FROM "EncyclopediaEntry" WHERE status='AUTO_GENERATED' ORDER BY "createdAt" DESC LIMIT 5;`
- Verify AUTO_GENERATED entries exist (at least 1)
- DB check benchmarks: `SELECT * FROM "PriceBenchmark" WHERE source='haiku_inferred' LIMIT 5;`
- ✅ if: AUTO_GENERATED entries and haiku_inferred benchmarks exist in DB

### #323 — PriceBenchmark Valuation Fallback
- Edit an item, look at suggested price section
- DB check: `SELECT "valuationMethod" FROM "Item" WHERE "valuationMethod"='STATISTICAL_WITH_BENCHMARK' LIMIT 5;`
- ✅ if: STATISTICAL_WITH_BENCHMARK rows exist in DB (blend is active for cold-start items)

### #332 — Shopify Cross-Listing
- Navigate to /organizer/settings → check for Shopify connection section
- If present: verify the connect flow renders
- ✅ if: Shopify settings section visible. UNVERIFIED if not found.

### #333 — ACH Consignor Payouts
- Navigate to /organizer/consignors → complete a settlement → check for "Pay via ACH" button
- ✅ if: button exists. UNVERIFIED if no settlement available to test.

### #334 — Automatic Markdown Cycles
- DB check: `SELECT COUNT(*) FROM "MarkdownRule";`
- Navigate to /organizer/settings or item list → look for markdown rules UI
- ✅ if: MarkdownRule table exists in schema and UI is accessible. UNVERIFIED if no items aged past threshold.

### #335 — Automated Consignor Email Notifications
- DB check: check if consignors have email field: `SELECT email FROM "Consignor" LIMIT 5;`
- Confirm email field exists and is populated for at least one consignor
- ✅ if: consignor.email populated + (ideally) notification row exists in DB after a sale item

---

## After all batches:

1. Update roadmap.md for every item tested — change "Pending Chrome QA" to one of:
   - `✅ Chrome-verified S[N]` — with evidence sentence
   - `⚠️ Bug logged S[N]` — if bug found, dispatch findasale-dev with bug details
   - `UNVERIFIED S[N] — [reason]` — if could not test (queue in STATE.md Blocked Queue)

2. Log Patrick back in: navigate to finda.sale → sign in via Google (artifactmi@gmail.com)

3. Update STATE.md Blocked/Unverified Queue with any UNVERIFIED items added

4. Provide Patrick a push block for roadmap.md + STATE.md + patrick-dashboard.md
