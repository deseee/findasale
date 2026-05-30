# Patrick's Dashboard — Week of May 30, 2026

---

## What Happened This Session (S811 — Weekly Audit + Fixes + QA)

**Ran the weekly site audit, fixed everything it found, and verified the fixes on the live site.**

Good news first: **4 of last week's 6 issues were already fixed** (categories no longer show raw eBay paths, the privacy typo, the calendar flooding, the search label).

The new findings were all fixed and pushed the same session, and I checked them live in the browser:
- ✅ An estate auction that was mislabeled "Yard Sale" now correctly says "Auction."
- ✅ "Location not available" (shown next to a real address) is now a working "Get directions" link.
- ✅ The sale-page breadcrumb now shows the sale name.
- ✅ The duplicate "Tins" category is merged into one card; coin-grading labels like "Eisenhower (1971-78)" now roll up under "Coins & Currency."
- ✅ Photoless sale cards show a branded placeholder instead of a broken image.
- ✅ The blank icon on the Pricing page's QR feature is fixed.

**The map is the one still-open item.** The first fix didn't work — I confirmed in the browser that the map still showed no pins (all 197 were being drawn thousands of pixels off-screen). I found the real cause: the map's stylesheet was loading too late, so the map never positioned itself. The second fix (loading that stylesheet up front + forcing the map to re-center) is pushed and needs one more live check after it deploys.

**One thing worth your attention (not a bug):** 98% of the scraped "directory" sales have no photos at all — they come in that way from public records. The placeholder makes them look intentional, but a catalog that's almost entirely image-less is a real shopper-appeal question worth deciding on later.

Two small follow-ups also fixed and pending a live check: a couple of category icons were showing as empty squares (too-new emoji, swapped for reliable ones), and the breadcrumb sale-name was hard to read in dark mode.

---

## Previous: S810 — Cleanup + Widget Triage

**Verified last session's work landed, sped up public pages, and cleaned up hidden widgets.**

**Indexes confirmed live.** The 7 database speed-up indexes from S809 (including the fix for the 4-second review-loading query) are confirmed in the production database. The earlier worry that the migration didn't apply was a false alarm — the verification query was just looking for the wrong naming pattern.

**Public pages hardened.** Six public pages were loading entire database tables into memory to do small calculations — the worst loaded every single review just to show a star rating. All six now have sensible limits. No visible change for users; the pages just won't choke as the database grows. Pushed and live.

**The hidden-widget question is resolved.** You reviewed the list and decided: turn on 4, cut 3.
- **Now showing on the shopper dashboard:** a visit-streak tracker, notification preferences (with a dark-mode text bug fixed), "My Pickup Appointments," and a rank-benefits card. These were built but never wired in — shoppers can finally see them.
- **Cut:** a duplicate points badge, a duplicate location map (we already show a map on that page), and a duplicate "subscribe to this sale" box (the page already has "Notify me" + "Remind me" buttons).
- **Left alone:** the pickup-booking card stays on the checkout page where it belongs (you book a pickup *after* you buy, not before).

Heads-up for next session: those 4 newly-shown widgets need a quick Chrome check to confirm they look right (dark mode, mobile, empty states). Also corrected a stale note in our records that claimed the streak widget was already visible — it wasn't until today.

---

## Previous: S809 — Maintenance

**Sentry cleaned up. Slow queries fixed. Migration deployed.**

The daily health check surfaced 25 unresolved Sentry issues. Here's what was done with all of them:

**Closed for good (8 issues):** 5 database connection errors from the S807 credential rotation (no new occurrences — confirmed safe to close), 2 backend crash events from a bad deploy on May 27 that self-healed (backend has been clean since), and the Colorado/Washington scraper 404s (the state government websites changed their URLs — low urgency, ignored permanently).

**Fixed in code:** 7 new database indexes added covering the slowest queries (1–6 second queries on Organizer, Sale, Review, and DirectoryClaimEmail tables). The worst was a 4+ second query every time organizer reviews were loaded — fixed by adding a direct link from reviews to their organizer, eliminating a slow table join. Migration deployed to Railway successfully.

Also silenced a noisy Sentry alert about photo uploads — the backend was already handling it correctly with a 400 error; Sentry was just logging it as an issue unnecessarily.

**Still open / needs attention:**
- **Geocoding: Facebook Events always fails** — expected. Facebook Events don't provide real addresses so they can't be geocoded. Not a bug.
- **GitGuardian monitoring: not working yet** — the API key you created is configured in Railway, but the daily health check runs in a different environment and can't see it. Next session will wire this up. You need to create a GitGuardian personal access token with the `incidents:read` permission scope (not the `scan` scope you set up last time).
- **Your private CLAUDE.md password is stale** — the Railway database password stored in your global Claude settings is outdated. You need to update that manually.

---

## Previous: S808 — 4 Features Shipped

**S808 complete — 4 features shipped + strategy + bug sweep.**

**✅ #463 Google Shopping feed — LIVE.** Your shippable items now flow to Google automatically. Backend feed + nightly refresh built. You created the Merchant Center account and registered the feed (US + Canada); ~52 products are ingested and in Google's standard 3-day initial review. No per-item work for organizers — pickup-only items are excluded automatically.

**✅ Mark Sold settlement router — built (needs Chrome QA).** Marking an item sold now offers three paths: just record it (cash/external), drop it into the in-app POS cart, or generate a Stripe checkout link. It picks a smart default based on sale type. Items only flip to "Sold" on a real payment.

**✅ Multi-Consignor Estate Settlement (Phase 1) — built in Stripe test mode.** Per-consignor split + an approval step before any payout. Real money is OFF behind a safety switch until your attorney + CPA sign off on who's the "merchant of record" and how 1099s work. Legal recommends Model B (you, the organizer, are the merchant of record).

**✅ POS bug fixed.** Releasing a hold from the POS was 404-ing. Fixed and deployed.

**Cleanup:** Restored the Yzerman duck price ($15,000 → $21.50) — that was a leftover QA test edit on your live account. It was the only one.

---

## Pending decision for you

**✅ RESOLVED S810 — hidden-widget triage done.** You decided: rendered 4, cut 3, left 1 on its correct page. 11 leftover dead imports of still-live components remain as optional lint cleanup (low priority, your call when convenient).

---

**Previous: S805 — Chrome QA Marathon (multi-compaction). 18 features Chrome-verified total.**

**Code Fixes Shipped:**

**✅ #79 Earnings Counter Animation — FIXED:** Animation moved into `PostSaleMomentumCard.tsx` where it belongs, wired to per-sale revenue. Dead code in `dashboard.tsx` removed.

**✅ #57 Rarity Badges — FIXED + CHROME VERIFIED:** `rarity: true` added to `getSale()` items select in `saleController.ts`. RARE badges confirmed on MXL 770 + Zoom B3 cards (Artifact Downtown Paw Paw sale) after deploy.

**✅ #196 Buying Pool — FIXED + CHROME VERIFIED:** Outer `item.buyingPool &&` guard removed. BuyingPoolCard confirmed on Steve Yzerman Duck ($15,000, AVAILABLE): "Split this purchase" section with 4 split options + "Start a Pool" CTA.

---

**Chrome QA — 18 features verified this session:**

- **✅ #308 Hide/Show Items** — Item disappears from public sale page on Hide, reappears on Show.
- **✅ #457 Scraped Sale noindex** — meta robots confirmed "noindex" on scraped sales.
- **✅ #251 priceBeforeMarkdown** — Crossed-out original price confirmed on item detail + sale page cards.
- **✅ #16 Verified Organizer Badge** — Blue circle badge confirmed on Artifact Downtown Paw Paw sale.
- **✅ #201 Favorites** — 23 FavoriteButton instances on sale page; live wishlist state from DB.
- **✅ #205 Contact Organizer** — "Message Organizer" slide-in panel confirmed.
- **✅ #136 QR Code Auto-Embedding** — "Embed QR code in exported photos" checkbox confirmed in edit-item (checked by default).
- **✅ #18 Post Performance Analytics** — Post Performance widget at /organizer/insights: Total Clicks counter, Top Source, 7-Day Trend chart, fresh cache timestamp.
- **✅ #127 POS Value Unlock Tiers** — 3-tier progressive unlock widget confirmed in POS. Tiers: Tier 1 (5tx + $50), Tier 2 (20tx + $300), Tier 3 (50tx + $1k PRO).
- **✅ #76 Loading Skeletons** — Gray placeholder skeleton cards confirmed on search page during load.
- **✅ #81 Empty States** — EmptyState confirmed on 4 pages: /shopper/wishlist Sellers tab, /shopper/bids, /shopper/holds, /search no-results.
- **✅ #142 Batch Upload (partial)** — File input wired, thumbnail renders. Cloudinary E2E UNVERIFIED (no real credentials in QA env).
- **✅ #77 Sale Published Celebration** — "You're live!" full-screen modal confirmed on publish: party popper, sale name, "Continue →" CTA.
- **✅ #143 Rapidfire Camera Mode (partial)** — Rapidfire/Regular tabs, ⚡ capture button, thumbnail queued. Cloudinary E2E UNVERIFIED (same constraint as #142).
- **✅ #215 AI Tag Suggestions** — 8 AI tags pre-filled as editable chips in edit-item (Steve Yzerman Duck): Collectible Duck, Steve Yzerman, NHL Memorabilia, Detroit Red Wings, Celebriducks, Sports Collectible, Rubber Duck, 1990s-2000s. "Auto-suggested" disclaimer shows on public item page.
- **✅ #216 AI Condition Grade** — "B" button highlighted in edit-item form for AI-analyzed item (conditionGrade='B'=Good). S/A/B/C/D pre-selection from AI working.

**Blocked Queue: 3** (well below ceiling of 8 — feature work CAN continue)

---

**S804 complete — Chrome QA Marathon:** 56 features processed. Zero UNTESTED remaining in roadmap.

---

## Audit Results

Remaining open audit issues:
- **M-001 (minor):** Privacy policy shows `—` literally. Cosmetic only.
- **M-002 (medium):** Long-running auctions crowd the calendar. UX issue, not a bug.
- **M-003 (medium):** One sale shows "YARD" badge on an auction + breadcrumb missing sale name.

---

## Pending Decisions

1. **Mark Sold default:** Recommended — pick the settlement mode automatically by sale type (overridable each time). Confirm and we'll Chrome QA all three modes.
2. **#239 legal gate:** Get attorney + CPA answers on merchant-of-record (Model B recommended) and 1099 handling before we turn on real consignor payouts.
3. ~~Dead-widget triage~~ — ✅ DONE S810.

---

## Beta Tester Impact

**Roadmap is clean** — zero UNTESTED features, zero CODE-VERIFIED features remaining. Every built feature now has Chrome QA evidence in roadmap.md.

**Blocked Queue at 3 items** — well below ceiling of 8. Feature work can continue.

---

## This Week's Priorities

1. **Pending live-data tests**: #409 Sneak Peek Email, #399 Local Legends, #408 Scan & Split (require specific data conditions or 2 concurrent users).
2. **#142/#143 Cloudinary E2E**: Client-side pipeline confirmed. Still needs real Cloudinary upload test in production.
3. **UNVERIFIED queue**: 12 external-trigger features marked ⚠️ UNVERIFIED S804. Monitor as platform grows.
4. **New feature work**: Blocked Queue is 3 — ready to advance roadmap.

---

## Action Items for Patrick

- [ ] **Push S810 wrap** — STATE.md + patrick-dashboard.md + roadmap.md + SaleSubscription cut. See push block below.
- [ ] **Update global CLAUDE.md** — Railway password field is stale. Update the `DATABASE_URL (public proxy)` line with the current password.
- [ ] **Create GitGuardian personal access token** — go to dashboard.gitguardian.com → API → Personal access tokens → create with `incidents:read` scope. Share the value next session so we can wire it into the daily health check.
- [ ] **Confirm Mark Sold default** (smart-by-sale-type) so we can Chrome QA the three modes.
- [ ] **Get attorney + CPA answers** for #239 before real consignor payouts go live.
- [ ] **Confirm Google approves** the ~52 products after the 3-day Merchant Center review.
- [x] **S809 migration (20260530000001)** — deployed this session.
- [x] **S808 wrap** — DONE
