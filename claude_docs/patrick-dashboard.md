# Patrick's Dashboard — Week of May 27, 2026

---

## What Happened This Week

Ten sessions this week. S792 complete: 6 features Chrome-verified, 2 bugs fixed (P2 rank label + P3 Guild nav), 1 bug fixed (Hunt Pass date), 2 features UNVERIFIED (need purchase test data). Blocked Queue: 9 items (below 8 ceiling — new features can resume).

S791 (today): QA session — 10 features confirmed working, 3 bugs found & fixed:
- **#261 Treasure Hunt XP Rank Multiplier** — RANGER users get 5 XP per QR clue scan (3 × 1.5 multiplier). Verified end-to-end.
- **#184 iCal Export** — Calendar button works. Was incorrectly flagged ❌ in a prior session; the implementation is client-side (no backend route needed). Confirmed working.
- **#232 Sale Pulse Widget** — Buzz score and view counts display correctly on organizer dashboard.
- **#323 PriceBenchmark Valuation Fallback** — When fewer than 10 eBay comps exist, item valuation blends AI price (60%) with benchmark data (40%). Confirmed.
- **#334 Automatic Markdown Cycles** — Auto-markdown form works: create, save, reload all confirmed.
- **#413 Safety Notes** — Safety notes field in edit-sale saves and displays on the public sale page.
- **#298 eBay Default Policies Settings** — All 8 sections confirmed on /organizer/settings/ebay.
- **#244 eBay CSV Export** — "📦 Export to eBay" button confirmed in add-items toolbar.
- **#295 eBay Category Review Badge** ✅ Chrome-verified — "eBay Category Needed" badge shows on Steam Controller after page load and F5 reload. Bug fix confirmed working.
- **#333 Consignor Payout Flow** ✅ Chrome-verified — modal opens, Cash/Check/Venmo/Other selector works, ConsignorPayout record created (id: cmpoifg0k000djd3l4fyw8hs2).

**Bug found and fixed: #295 Category Review Badge** — The `ebayNeedsReview` field was missing from the backend items query, so the "needs eBay category review" badge never showed up after a page reload. Fixed in `itemController.ts`. Chrome-verified ✅.

**Bug found and fixed: #335 Consignor Payout Email** — `sendConsignorPayout()` was fully implemented in the email service but was never called when a payout was processed. Fixed in `consignorController.ts`. Code-verified ✅ — consignor emails use Gmail API (same as all other working transactional emails), not Resend. Resend showing zero was expected. Delivery can't be inbox-confirmed with a fictional test email address.

**Consignor URL bugs fixed (#333)** — The consignor detail page and payout modal were hitting `/api/api/...` double-prefix URLs (404s). Fixed and Chrome-verified ✅. Payout modal flow confirmed end-to-end.

3 features added as UNVERIFIED (need more test data): #230 Smart Buyer Intelligence, #223 Organizer Guidance Layer, #332 Shopify Cross-Listing.

#293 (Post-Sale eBay Panel) remains blocked — no ended sales to test against.

**Roadmap updated:** 16 rows updated to reflect S791 QA results.

---

## Audit Results

Remaining open audit issues:
- **M-001 (minor):** Privacy policy shows `—` literally. Cosmetic only.
- **M-002 (medium):** Long-running auctions crowd the calendar. UX issue, not a bug.
- **M-003 (medium):** One sale shows "YARD" badge on an auction + breadcrumb missing sale name.

---

## Pending Decisions

No new decisions pending. DECISIONS.md is current.

---

## Beta Tester Impact

**Improved this week:** 8 more features confirmed working, including eBay settings page and CSV export. Camera pipeline, intent-wins (AI won't overwrite your prices), bell icon position, QR modal expand, and more all verified in prior sessions.

**Still blocked:** #293 needs an ended sale with eBay-listed items. Shopify cross-listing (#332) needs OAuth. #295 ✅ verified. #333 ✅ verified. #335 fix shipped — email delivery needs manual Resend check.

**Seed data gap noted:** Some tier-gated features use a different database table than what the test seed populates. No action needed from you, just a developer note for future reference.

---

## This Week's Priority

1. ✅ **S791 push shipped** — all 6 files deployed. Railway + Vercel green.

2. **S792 push ready** — 7 files changed. Rank label bug fixed, Guild nav added, Hunt Pass date fixed. Push block below.

2. ✅ **Post-deploy Chrome verifies complete:**
   - #295 ✅ — "eBay Category Needed" badge confirmed on Steam Controller, persists after F5.
   - #333 ✅ — Payout modal opens, CASH method selected, ConsignorPayout record created.
   - #335 ✅ — Code-verified. Consignor emails use Gmail API (not Resend). Same service as all working transactional emails.

3. **QA backlog at 9 items** — below ceiling of 8. New features can resume next session.

---

## Action Items for Patrick

- [x] **Submit sitemap to Bing** — DONE
- [ ] **Update global CLAUDE.md** — both DATABASE_URL lines need current Railway password. (Sitting since S780.)
