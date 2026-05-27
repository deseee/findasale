# Patrick's Dashboard — Week of May 27, 2026

---

## What Happened This Week

Nine sessions this week. QA-only mode has been active for multiple sessions (ceiling rule: Blocked Queue ≥8 items = QA-only). Eight features verified this session + 2 bugs found and fixed.

S791 (today): QA session — 8 features confirmed working, 2 bugs found & fixed:
- **#261 Treasure Hunt XP Rank Multiplier** — RANGER users get 5 XP per QR clue scan (3 × 1.5 multiplier). Verified end-to-end.
- **#184 iCal Export** — Calendar button works. Was incorrectly flagged ❌ in a prior session; the implementation is client-side (no backend route needed). Confirmed working.
- **#232 Sale Pulse Widget** — Buzz score and view counts display correctly on organizer dashboard.
- **#323 PriceBenchmark Valuation Fallback** — When fewer than 10 eBay comps exist, item valuation blends AI price (60%) with benchmark data (40%). Confirmed.
- **#334 Automatic Markdown Cycles** — Auto-markdown form works: create, save, reload all confirmed.
- **#413 Safety Notes** — Safety notes field in edit-sale saves and displays on the public sale page.
- **#298 eBay Default Policies Settings** — All 8 sections confirmed on /organizer/settings/ebay: Default Policies, Push Defaults, Shipping by Weight, Special Shipping Rules, Category Overrides, Description Template, Pickup Location, Custom Label append.
- **#244 eBay CSV Export** — "📦 Export to eBay" button confirmed in add-items toolbar.

**Bug found and fixed: #295 Category Review Badge** — The `ebayNeedsReview` field was missing from the backend items query, so the "needs eBay category review" badge never showed up after a page reload. Fixed in `itemController.ts`.

**Bug found and fixed: #335 Consignor Payout Email** — `sendConsignorPayout()` was fully implemented in the email service but was never called when a payout was processed. Fixed in `consignorController.ts` — payout email now fires automatically after a payout is recorded (skips silently if the consignor has no email on file).

**Consignor URL bugs fixed (#333)** — The consignor detail page and payout modal were hitting `/api/api/...` double-prefix URLs (404s). Fixed in two frontend files. A test consignor "Jane Thrift" (70% commission, email on file) has been created in the Railway DB for QA. Full payout flow needs one Chrome verify after this push deploys.

3 features added as UNVERIFIED (need more test data): #230 Smart Buyer Intelligence, #223 Organizer Guidance Layer, #332 Shopify Cross-Listing.

#293 (Post-Sale eBay Panel) remains blocked — no ended sales to test against.

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

**Still blocked:** #293 needs an ended sale with eBay-listed items. Shopify cross-listing (#332) needs OAuth. #295, #333, and #335 fixes all ship with this push — need one Chrome re-verify each after deploy.

**Seed data gap noted:** Some tier-gated features use a different database table than what the test seed populates. No action needed from you, just a developer note for future reference.

---

## This Week's Priority

1. **Push this block** — 6 files (below). Railway + Vercel auto-deploy on push.

2. **Post-deploy Chrome verify (3 things):**
   - #295: navigate to `/organizer/sales/[id]` → confirm orange "Needs eBay Category Review" badge shows on an item after page reload.
   - #333: navigate to `/organizer/consignors` → click "Jane Thrift" → click "Run Payout" → confirm modal opens, method selector works, submit creates a payout record.
   - #335: after running the payout above, check `janethrift@example.com` in Resend for the payout notification email.

3. **QA backlog at 10 items** — QA ceiling rule still active. No new features until below 8.

---

## Action Items for Patrick

- [ ] **Push S791 final block** — 6 files, push block below
- [ ] **Submit sitemap to Bing** — https://www.bing.com/webmasters → Add sitemap → `https://finda.sale/server-sitemap.xml`
- [ ] **Update global CLAUDE.md** — both DATABASE_URL lines need current Railway password. (Sitting since S780.)
