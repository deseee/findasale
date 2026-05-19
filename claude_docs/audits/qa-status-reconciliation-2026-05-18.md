# QA Status Reconciliation — 2026-05-18

**Purpose:** Cross-reference every "Pending Chrome QA" roadmap item against all available QA records to determine true status.
**Sources consulted:** STATE.md (Blocked Queue + Recent Sessions), roadmap.md, human-QA-walkthrough-findings.md, ux-spotchecks (2026-05-02, 2026-05-06, 2026-05-13), weekly-audit-2026-05-02, weekly-audit-2026-05-07, weekly-audit-2026-05-16, archive/session-logs/session-log-archive.md, COMPLETED_PHASES.md, decisions-log.md.
**Compiled:** S763 (2026-05-18)

---

## Legend
- **VERIFIED** — concrete Chrome interaction evidence found in records (cited)
- **DEPRECATED** — removed, folded into another feature, or decided against
- **CHANGED** — substantially reworked; original QA criteria no longer applies
- **GENUINELY PENDING** — no verification evidence found; needs real QA

---

## GROUP 1 — VERIFIED (roadmap says "Pending Chrome QA" but evidence exists)

These can be updated to VERIFIED in the roadmap.

| # | Feature Name | Shipped | Status | Evidence / Notes |
|---|---|---|---|---|
| #326 | eBay Comparable Sale Tiles | S557 | **VERIFIED** | STATE.md Blocked Queue: "✅ VERIFIED S737 — 3-tile grid rendered on edit-item page (Victorian Pocket Watch): $295, $450, $675 Pre-owned Good listings with photos. CLOSED." |
| #322 | Encyclopedia Inline Tip / Live eBay Category Picker | S556/S463 | **VERIFIED** | STATE.md: "✅ VERIFIED S737 — Typed 'pocket watch' → dropdown populated with real eBay taxonomy. CLOSED." Roadmap row #322 confirms this is the Inline Tip; #294 is the picker — both verified via same test. |
| #294 | Live eBay Category Picker | S463 | **VERIFIED** | Same S737 evidence as #322 — taxonomy dropdown confirmed live with real API results. |
| #362 | Sale Attendance Count | S601 | **VERIFIED** | STATE.md: "✅ VERIFIED S750 — '75 attended' renders on Bestmate Company Ltd storefront. Persists after reload. CLOSED." |
| #353 | Organizer Year Founded | S600 | **VERIFIED** | STATE.md: "✅ VERIFIED S746 — Set to 2019 via React fiber. PATCH /api/organizers/me sent yearFounded:2019. Reloaded — field shows 2019. CLOSED." |
| #355 | Organizer Type Multi-Select | S601 | **VERIFIED** | STATE.md: "✅ VERIFIED S746 — Estate Sales checkbox set + saved. PATCH sent organizerTypes:['estate_sale']. Reloaded — checkbox shows checked. CLOSED." |
| #124 | Rarity Boost XP Sink | S347 | **VERIFIED** | STATE.md: "✅ VERIFIED S750 — user12 (Leo Thomas) guildXp set to 55 via direct SQL. Button on /coupons enabled. Modal opens correctly. CLOSED." |
| #275 | Hunt Pass Cosmetic Add-ons | S753 | **VERIFIED** | STATE.md: "✅ VERIFIED S762 — user12 amber ring (ring-2 ring-amber-400) on nav avatar. 🏆 badge on leaderboard. CLOSED." |
| #265 | Share & Earn Dashboard Card | S753 | **VERIFIED** | STATE.md: "✅ VERIFIED S762 — Card renders on /shopper/dashboard: heading, referral copy, 'View Referral Page →', dismiss (×). 7-day timestamp dismissal confirmed. CLOSED." |
| #305 | Share & Promote Overhaul | S520 | **VERIFIED** | STATE.md: "✅ VERIFIED S761 — Patrick's Artifact MI account (LIVE sale). Modal opens, 5 platform tabs, Generate Post returns 599-char real content. CLOSED." |
| #306 | Store Hours Display / Structured Weekly Hours | S520/S601 | **VERIFIED** | STATE.md: "✅ VERIFIED S762 — Changed Monday hours. PUT 200 + PATCH 200 + GET 200 fired. Toast appeared, persisted on reload. CLOSED." |
| #307 | Retail Mode (Auto-Renewing Storefront) | S520 | **VERIFIED** | STATE.md: "✅ VERIFIED S761 — Patrick confirmed 'mostly works' with Artifact MI account. saleType=RETAIL chosen at sale creation. CLOSED." |
| #369 | Quebec Bill 96 Feature Flag | S696/S710 | **VERIFIED** | roadmap.md row #369 Status column: "Chrome-verified S718". roadmap.md header v142: "S718 COMPLETE: Chrome QA verified #369 Quebec block ✅." |
| #407 | Flip Tracker ROI Dashboard | S696/S710 | **VERIFIED** | roadmap.md row #407 Status column: "Chrome-verified S718". roadmap.md header v142: "S718 COMPLETE: Chrome QA verified #407 Flip Tracker ROI ✅." |
| #436 | GEO City×Category Landing Pages (ISR) | S759 | **VERIFIED** | roadmap.md row #436 Status: "VERIFIED S762 — /city/grand-rapids-mi + /city/grand-rapids-mi/estate-sales both load with real sale data." STATE.md confirms. |
| #437 | GEO Claim This Listing Banner | S759 | **VERIFIED** | STATE.md: "✅ VERIFIED S762 — ClaimListingBanner renders on unclaimed sale sidebar. Both OAuth buttons work. CLOSED." |
| #438 | GEO AI Score Tool | S759 | **VERIFIED** | STATE.md: "✅ VERIFIED S762 — Navigated to /ai-score, entered real sale URL, got score 23/100 with full signal breakdown. CLOSED." |
| #443 | GEO 1-Click OAuth Claim | S760 | **VERIFIED** | STATE.md: "✅ #443 OAuth claim — both 'Claim with Google' and 'Claim with Facebook' buttons present and trigger OAuth flows. CLOSED." |
| #446 | GEO Crawler Alert Dashboard Metric | S759 | **VERIFIED** | roadmap.md row #446 Status: "SHIPPED S759 — ✅ VERIFIED S762. 'Search Engine Visibility' card visible on organizer dashboard with real data." |
| #452 | GEO "This Weekend" Auto-Generating Pages | S760 | **VERIFIED** | roadmap.md row #452 Status: "VERIFIED S762 — /this-weekend/grand-rapids-mi loads with sale data." STATE.md confirms. |
| #454 | GEO Organizer Demand Dashboard | S760 | **VERIFIED** | roadmap.md row #454 Status: "SHIPPED S760 — ✅ VERIFIED S762. DemandSignalsCard renders on organizer dashboard with real demand data." STATE.md confirms. |
| #456 | GEO Clearance Page + Admin Surfaces | S760 | **VERIFIED** | roadmap.md row #456: "VERIFIED S762 — /clearance renders items with city filter. /admin/demand-signals + /admin/waitlist admin views confirmed." |

---

## GROUP 2 — CHANGED (feature reworked; original QA criteria stale)

| # | Feature Name | Shipped | Status | Evidence / Notes |
|---|---|---|---|---|
| #354 | Structured Weekly Hours Model | S601 | **CHANGED / VERIFIED** | #306 (Store Hours Display) was the S520 predecessor. #354 is the S601 full model (OrganizerHours table, 7-day grid, timezone). The S762 verification of #306 covers the same settings→save→storefront flow but did not specifically test the 7-day grid UI. Treat as pending the grid-specific test; core save/display cycle verified. |
| #378 | Help Library `/guides` Route | S742 | **CHANGED** | roadmap.md row #378 Status: "SHIPPED S742 — /guides index + slug pages live, TypeScript entries, ISR 24h. Pending Chrome QA." STATE.md S760 summary: "#377 Help Library and #378 /guides confirmed COMPLETE S742." Marked complete in summary but no explicit Chrome interaction evidence (no URL navigated + screenshot). Treat as GENUINELY PENDING for Chrome navigation test. |
| #27b | Cloudinary Watermark / TEAMS-Gated Removal | S599 | **CHANGED** | Roadmap notes "API + UI + persistence Chrome-verified S599." Only the PDF footer visual, iCal .ics description text, and OG image visual remain unverified. Core feature IS verified; specific sub-surfaces are not. |

---

## GROUP 3 — GENUINELY PENDING (no verification evidence found)

Items where the roadmap says "Pending Chrome QA" and no record of actual browser interaction exists.

### 3a — Pre-GEO features (shipped S344–S601)

| # | Feature Name | Shipped | Notes |
|---|---|---|---|
| #41 | Flip Report | S344/S355 | roadmap.md: "Pending Chrome QA — S344: null safety fix. S355: ownership fix." Human QA walkthrough found "flip reports: Error Unable to load flip report." Still broken as of that walkthrough. BROKEN, not just unverified. |
| #184 | iCal / Calendar Export | S344/S355 | roadmap.md: "Pending Chrome QA." Human QA walkthrough: "add to calendar button clicks but calendar.ics is 404." Still broken as of that walkthrough. BROKEN, not just unverified. |
| #60 | Premium Tier Bundle | S388 | roadmap.md: "Pending Chrome QA." No evidence of Chrome navigation to /organizer/pricing with Stripe checkout flow verified. |
| #27a | Social Templates (5 platforms + photos) | S410 | roadmap.md: "Shipped S410 — Pending Chrome QA." Note: #305 (Share & Promote Overhaul, S520) supersedes this and WAS verified S761. The #27a QA criteria (3 tone variants, Instagram/Facebook/TikTok/Pinterest/Threads copy) is now subsumed by #305. Consider marking DEPRECATED/SUPERSEDED by #305. |
| #197 | Bounties (Item Requests) | S552 | roadmap.md: "Pending Chrome QA." Human QA walkthrough: "bounties: no data can't test." No evidence. |
| #221 | Mark Sold → Hold-to-Pay | S341 | roadmap.md: "Awaiting browser QA." Human QA walkthrough confirms hold/buy flow is broken. BROKEN, not just unverified. |
| #29 | Loyalty Passport | S346 | roadmap.md: "FIXED S346 — Pending Chrome QA." Human QA walkthrough found multiple issues with shopper/loyalty page. No verification found post-fix. |
| #199 | User Profile Page | S346 | roadmap.md: "FIXED S346 — Pending Chrome QA." Human QA walkthrough found issues (Hunt Pass not mentioned, bid status wrong, badges not loading). No post-fix Chrome verification. |
| #131 | Share Templates | S347 | roadmap.md: "FIXED S347 — Pending Chrome QA." Note: likely superseded by #305 (Share & Promote Overhaul verified S761). The specific social platform popup behaviors may still need platform-by-platform test. |
| #153 | Basic Organizer Profile | S347 | roadmap.md: "FIXED S347 — Pending Chrome QA." Human QA walkthrough: "Profile is super basic only business name?" No post-fix Chrome verification found. |
| #58 | Achievement Badges | S346 | roadmap.md: "FIXED S346 — Pending Chrome QA." Human QA walkthrough: "no shoppers have badges displaying." No post-fix Chrome verification found. |
| #123 | Explorer's Guild Phase 2 | S347 | roadmap.md: "FIXED S347 — Pending Chrome QA." Human QA walkthrough found issues with loyalty/guild/points explainers. No post-fix Chrome verification. |
| #284 | Feedback Survey System | S399/S404 | roadmap.md: "Shipped S399/S404 — Pending Chrome QA." No Chrome verification found in any source. |
| #285 | POS In-App Payment Request | S405 | roadmap.md: "Shipped S405 — Pending Chrome QA." No Chrome verification found. |
| #286 | Shopper QR Code (Dashboard + POS Scan) | S405 | roadmap.md: "Shipped S405 — Pending Chrome QA." No Chrome verification found. |
| #223 | Organizer Guidance Layer (Tooltips + Explainers) | S351 | roadmap.md: "Shipped S351 — Pending Chrome QA." No Chrome verification found. |
| #227 | XP Profile API + Shopper Dashboard Wiring | S352 | roadmap.md: "Shipped S352 — Pending Chrome QA." No Chrome verification found. |
| #244 | eBay Quick List / Direct Push (Phase 2+) | S375/S460 | roadmap.md: "Phase 1+2 Shipped — Pending Chrome QA full suite." STATE.md confirms "S461 Contigo push ✅ Patrick-verified" for the push end-to-end, but Phase 2 browser verification (PostSaleEbayPanel, post-sale flow) not in records. |
| #254 | Hunt Pass 1.5x XP Multiplier | S389 | No Chrome verification found. |
| #255 | Rank-Up Notifications | S389 | No Chrome verification found. |
| #256 | Referral Signup XP Wiring | S389 | No Chrome verification found. |
| #257 | Scout Hold Duration Fix | S389 | No Chrome verification found. |
| #260 | À La Carte Pricing Page Visibility | S390 | No Chrome verification found. |
| #261 | Treasure Hunt XP Rank Multiplier (Ranger+) | S390 | No Chrome verification found. |
| #263 | Organizer Nav Additions (Insights + Branding) | S390 | No Chrome verification found. |
| #268 | Treasure Hunt Trail Completion XP (100 XP) | S390b | No Chrome verification found. |
| #271 | TEAMS Solo Organizer Differentiator | S390b | No Chrome verification found. |
| #272 | Post-Purchase "Share Your Haul" CTA | S390b | No Chrome verification found. |
| #273 | Rank Achievement Share | S390b | No Chrome verification found. |
| #274 | Trail Completion Share | S390b | No Chrome verification found. |
| #278 | Treasure Hunt Pro (Hunt Pass Perk) | S391 | No Chrome verification found. |
| #281 | Streak Milestone XP Triggers | S391 | No Chrome verification found. |
| #288 | Featured Boost System (Dual-Rail XP/Stripe) | S419 | No Chrome verification found. |
| #289 | Shopper Coupon Generation (3 Tiers) | S419 | No Chrome verification found. |
| #290 | Hunt Pass Page — Dual-Rail Cash Column | S419 | No Chrome verification found. |
| #292 | Post-Sale eBay Push Panel | S460 | Partially: S461 Contigo push verified by Patrick; PostSaleEbayPanel UX itself not Chrome-verified. |
| #293 | eBay Listing Data Parity | S462 | No Chrome verification found. |
| #295 | eBay Category Review Alerting (ebayNeedsReview) | S464 | No Chrome verification found. |
| #312 | XP Economy Security Hardening | S536 | No Chrome verification found. |
| #313 | HAUL_POST_LIKES XP Milestone | S536 | No Chrome verification found. |
| #314 | ORG_SHOPPER_SIGNUP XP | S536 | No Chrome verification found. |
| #315 | REFERRAL_ORG_FIRST_SALE XP | S536 | No Chrome verification found. |
| #317 | Geofence QR Scans | S553 | roadmap.md Status has ✅ marker but "Pending Chrome QA" still listed. No explicit interaction evidence found in any source. |
| #319 | Burst Clustering (Batch Upload Fix) | S556 | roadmap.md Status has ✅ marker. No explicit Chrome verification found. |
| #320 | Async eBay Comp Fetch | S556 | No Chrome verification found. |
| #321 | Encyclopedia Auto-Generation (Haiku Stubs) | S556 | No Chrome verification found (admin-visible feature). |
| #323 | PriceBenchmark Valuation Fallback | S556 | No Chrome verification found. |
| #324 | Temporal EXIF Clustering Boost | S557 | No Chrome verification found. |
| #325 | Best-Photo-First Sorting | S557 | No Chrome verification found. |
| #336 | Audit: Organizer-Intent-Wins in Rapidfire | S756 | Confirmed built S756, no Chrome verification found. |
| #339 | Low-Confidence Refuse-to-Fill | S756 | Confirmed built S756, no Chrome verification found. |
| #340 | Auto-Reopen Camera After Publish | S572 | No Chrome verification found. |
| #348 | QR Auto-Claim on Treasure Hunt Clue | S572 | No Chrome verification found. |
| #349 | In-App QR Scanner Phase 1 | S572 | No Chrome verification found. |
| #350 | Nav Polish S573 (Icon Order + Cart + Appearance) | S573 | No Chrome verification found. |
| #351 | QR Quick-Access Modal (My QR) | S573 | No Chrome verification found. |
| #352 | Organizer Tagline Field | S600 | No Chrome verification found. |
| #356 | Organizer Broadcast to Followers | S601 | No Chrome verification found. |
| #359 | Sale Featured / Pinned Flag | S601 | No Chrome verification found. |
| #360 | Social Links Expansion | S600 | No Chrome verification found. |
| #363 | Auction Buyer's Premium + Lot Number Fields | S601 | No Chrome verification found. |

### 3b — Wave 2 features (#402–#416, shipped S696)

| # | Feature Name | Shipped | Notes |
|---|---|---|---|
| #402 | Cover the Fee Toggle | S696 | No Chrome verification found. |
| #403 | Family Bundle Pricing | S696 | No Chrome verification found. |
| #405 | Founding Organizer Badge | S696 | roadmap.md v142: "S718: #405 Founding Badge settings renders ✅ — storefront gap identified (DECISION needed)." Settings renders but storefront display unresolved. Partially tested, not fully verified. |
| #406 | Split-the-Bill POS | S696 | No Chrome verification found. |
| #410 | Flip Tracker (same as #407?) | S696 | #407 is Flip Tracker ROI Dashboard — verified S718. #410 per roadmap is a separate item. Check roadmap rows 486–495 — #410 does not appear to have a separate row; may be a numbering artifact. |
| #411 | Dorm Dash (college move-out vertical) | S696 | No Chrome verification found. |
| #412 | Cash-to-Digital Bridge | S696 | No Chrome verification found. |
| #413 | Physical Safety & Liability Disclosures | S696 | No Chrome verification found. |
| #414 | Data Privacy & Grief Firewall | S696 | No Chrome verification found. Note: Patrick mentioned this was deprecated — but roadmap still shows SHIPPED S696. No formal deprecation record found. |
| #415 | Junk Drawer Donation Kit | S696 | No Chrome verification found. |
| #416 | Sale Map Internal Routing (room navigation) | S696 | No Chrome verification found. |

### 3c — eBay fix-batch features (#424–#430, shipped S727/S736)

| # | Feature Name | Shipped | Notes |
|---|---|---|---|
| #424 | eBay Description Template Fix | S727 | No Chrome verification found. |
| #425 | eBay Push from Publish All | S727 | No Chrome verification found. |
| #426 | eBay Best Offers UI | S727 | No Chrome verification found. |
| #427 | eBay Local Pickup Mode | S727 | No Chrome verification found. |
| #428 | Review Card Readiness Borders | S727 | No Chrome verification found. |
| #429 | Review Queue Skips Store Description Template | S736 | No Chrome verification found. |
| #430 | Register Form Silent Error Fix | S736 | weekly-audit-2026-05-16.md HIGH-1: "Browser-Confirmed this session. Submitting... produces no feedback." Fix was shipped S736 but the weekly audit (post-fix) still shows the bug. Either fix did not deploy or test was run before the fix. Re-verify required. |

### 3d — GEO features still pending (shipped S759/S760)

| # | Feature Name | Shipped | Notes |
|---|---|---|---|
| #432 | GEO JSON-LD AggregateOffer + PostalAddress | S759 | No Chrome verification found. |
| #433 | GEO ai-plugin.json (ChatGPT plugin manifest) | S759 | No Chrome verification found. |
| #434 | GEO Update llms.txt | S759 | No Chrome verification found. |
| #435 | GEO Bot/Crawler Visit Tracking | S759 | No Chrome verification found (CrawlerVisit schema — migration pending Patrick). |
| #439 | GEO Per-Item Product Schema (Claimed Pages) | S760 | No Chrome verification found. |
| #440 | GEO Machine-Readable Instructions Block | S759 | No Chrome verification found. |
| #441 | GEO PaymentMethod Schema | S759 | No Chrome verification found. |
| #442 | GEO Automated Monthly Trend Reports | S760 | No Chrome verification found (cron-based, needs triggered test). |
| #444 | GEO Peer-to-Peer Organizer Referral Bounty | S760 | No Chrome verification found. |
| #445 | GEO Buyer Referral Link in Post-Purchase | S760 | No Chrome verification found. |
| #447 | GEO Crawler Visit Notification | S759 | No Chrome verification found. |
| #448 | GEO High-Intent MCP Tool Wrappers | S760 | No Chrome verification found (MCP tools — needs MCP client test). |
| #449 | GEO Post-Sale Permanent Pricing Records | S759 | No Chrome verification found. |
| #450 | GEO EventSeries Schema for Recurring Sales | S760 | No Chrome verification found. |
| #451 | GEO Speakable Schema for Voice Search | S759 | No Chrome verification found. |
| #453 | GEO Unmet Demand Signal Capture | S760 | No Chrome verification found. Migration pending Patrick. |
| #455 | GEO Shopper "Notify Me" Waitlist | S760 | No Chrome verification found. Migration pending Patrick. |
| #457 | GEO Auto-Expire Stale Scraped Data | S759 | No Chrome verification found. |
| #459 | GEO Platform Syndication Formatter | S760 | Roadmap row shows "Queued S758" — may not actually be shipped yet. Verify. |
| #460 | GEO End-of-Sale Auto-Liquidation | S760 | Roadmap row shows "Queued S758" — may not actually be shipped yet. Verify. |

### 3e — Help Library

| # | Feature Name | Shipped | Notes |
|---|---|---|---|
| #378 | Help Library `/guides` Route | S742 | STATE.md confirms "COMPLETE S742" in summary prose but no Chrome navigation evidence (no URL visited + outcome recorded). Technically unverified per honesty gate. |

---

## GROUP 4 — LIKELY SUPERSEDED / DEPRECATION CANDIDATES

These are still on the roadmap as "Pending Chrome QA" but the feature they represent has been reworked or absorbed.

| # | Feature Name | Notes |
|---|---|---|
| #27a | Social Templates (5 platforms + photos) | Absorbed by #305 Share & Promote Overhaul (verified S761). The original 3-tone variant / platform-specific copy test is now covered by the overhaul. Recommend marking SUPERSEDED by #305. |
| #131 | Share Templates | Same — absorbed by #305. The specific Facebook popup / Nextdoor / Threads intent tests may still be meaningful but #305 verified the broader flow. |
| #332 | Shopify Cross-Listing | roadmap.md: "Shipped — Pending Chrome QA (S589: confirmed built, roadmap stale)." The S589 note suggests someone confirmed it was built but the status is ambiguous. No Chrome evidence in any source. Description text still says "Shopify is the next cross-listing channel" which sounds like planning copy, not shipped code. Requires investigation: does the Shopify OAuth + push flow actually exist in the codebase? |
| #333 | ACH Consignor Payouts (Stripe Connect) | Same issue as #332 — "S589: confirmed built, roadmap stale" but no Chrome evidence and description reads like a spec. Requires investigation. |
| #334 | Automatic Markdown Cycles | Same issue — "S589: confirmed built, roadmap stale." No Chrome evidence. |
| #335 | Automated Consignor Email Notifications | Same issue — "S589: confirmed built, roadmap stale." No Chrome evidence. |

---

## Summary Counts

| Category | Count |
|---|---|
| VERIFIED (roadmap stale — can update) | 22 |
| CHANGED / PARTIAL (needs targeted follow-up) | 3 |
| GENUINELY PENDING — Early/mid features (pre-GEO) | 52 |
| GENUINELY PENDING — Wave 2 (#402–#416) | 11 |
| GENUINELY PENDING — eBay fix-batch (#424–#430) | 7 |
| GENUINELY PENDING — GEO (#432–#460 subset) | 20 |
| LIKELY SUPERSEDED / DEPRECATION CANDIDATES | 6 |
| **Total items examined** | **~121** |

---

## Immediate Action Items

1. **Update roadmap rows for the 22 VERIFIED items** — change Status column from "Pending Chrome QA" to "VERIFIED S7xx" with the session cited above.

2. **Two BROKEN items that need fixes, not just QA:**
   - #41 Flip Report — human QA found "Error Unable to load flip report." Dispatch findasale-dev.
   - #184 iCal / Calendar Export — human QA found calendar.ics is 404. Dispatch findasale-dev.
   - #221 Mark Sold → Hold-to-Pay — hold/buy flow confirmed broken in human QA walkthrough.
   - #430 Register Form Silent Error — weekly-audit-2026-05-16 confirmed still broken post-fix (re-verify whether S736 fix actually deployed).

3. **Investigate #332–#335 (S589 "confirmed built" entries)** — these were noted as "roadmap stale" in S589 but have no Chrome evidence and their description text reads like planning copy. Grep for ShopifyController, MarkdownRule model, ACH payout endpoint to confirm whether code actually exists before treating as pending QA vs pending build.

4. **Patrick decision needed on #414 (Grief Firewall)** — Patrick reportedly mentioned deprecation but no formal record exists. The roadmap still shows SHIPPED S696. Either verify or formally deprecate.

5. **GEO pending items (#432–#460) are largely invisible-to-user infrastructure** (JSON-LD schema, crawler middleware, llms.txt) — most cannot be "Chrome QA'd" in the traditional sense. Each needs a specific verification method noted (e.g., Chrome DevTools → view-source for JSON-LD, curl for ai-plugin.json, Railway logs for crawler middleware). Clarify QA methodology for these before dispatching.

6. **Migration-dependent GEO items (#435 CrawlerVisit, #453/#455 demand/waitlist schema)** — cannot be verified until Patrick runs the pending migrations (20260519100000_geo_demand_waitlist_confidence + CrawlerVisit).


---

## S763 Execution Findings

**Compiled:** S763 (2026-05-18) — roadmap.md updates applied via Python script.

### Roadmap Updates Completed

17 rows directly updated by the Python replacement script. 5 GEO rows (#437, #438, #443, #446, #454) required a second correction pass due to their different 12-column format (the general-purpose regex placed the status in the wrong column on first pass; second pass restored correct column layout and placed VERIFIED in the notes column). Final count:

**Successfully updated to VERIFIED:**
- #326 → VERIFIED S737
- #322 → VERIFIED S737
- #294 → VERIFIED S737
- #362 → VERIFIED S750
- #353 → VERIFIED S746
- #355 → VERIFIED S746
- #124 → VERIFIED S750
- #305 → VERIFIED S761
- #306 → VERIFIED S762
- #307 → VERIFIED S761
- #437 → VERIFIED S762 (GEO row — notes column updated)
- #438 → VERIFIED S762 (GEO row — notes column updated)
- #443 → VERIFIED S762 (GEO row — notes column updated)
- #446 → VERIFIED S762 (GEO row — notes column updated)
- #454 → VERIFIED S762 (GEO row — notes column updated)

**Already correct (not modified):**
- #265 — already "VERIFIED S762 — /shopper/dashboard..." in status column
- #275 — already "VERIFIED S762 — user12 amber ring..." in status column
- #369 — already "Chrome-verified S718"
- #407 — already "Chrome-verified S718"
- #436 — already "VERIFIED S762 — /city/grand-rapids-mi..." in notes column
- #452 — already "VERIFIED S762 — /this-weekend/grand-rapids-mi..." in notes column
- #456 — already "VERIFIED S762 — /clearance renders..." in notes column

**Marked SUPERSEDED:**
- #27a → SUPERSEDED by #305 (Share & Promote Overhaul, verified S761)
- #131 → SUPERSEDED by #305 (Share & Promote Overhaul, verified S761)

**Header:** New "Last Updated" line added at top of roadmap header block.

---

### #332–#335 Grep Investigation Results

#### #332 — Shopify Cross-Listing
**CODE EXISTS.**
- `packages/backend/src/controllers/shopifyController.ts` — controller exists
- `packages/backend/src/services/shopifyService.ts` — service exists
- `packages/backend/src/routes/shopify.ts` — route exists
- `packages/frontend/pages/organizer/shopify.tsx` — frontend page exists
- `packages/database/prisma/schema.prisma` — `ShopifyListing` model exists (line 1448); `Organizer.shopifyAccessToken`, `shopifyShopDomain`, `shopifyEnabled`, `shopifyListings` fields all present

**Verdict: CODE EXISTS — this is a real shipped feature, not planning copy. Needs Chrome QA, not a build.**

#### #333 — ACH Consignor Payouts (Stripe Connect)
**CODE EXISTS.**
- `packages/backend/src/controllers/payoutController.ts` — controller exists
- `packages/frontend/pages/organizer/payouts.tsx` — frontend page exists
- `packages/database/prisma/schema.prisma` — `ConsignorPayout` model exists (line 4243); `Sale.consignorPayouts` relation present

**Verdict: CODE EXISTS — shipped feature. Needs Chrome QA.**

#### #334 — Automatic Markdown Cycles
**CODE EXISTS.**
- `packages/backend/src/controllers/markdownCycleController.ts` — controller exists
- `packages/backend/src/routes/markdownCycles.ts` — route exists
- `packages/frontend/pages/organizer/markdown-cycles.tsx` — frontend page exists
- `packages/database/prisma/schema.prisma` — `MarkdownCycle` model exists (line 4306); `Organizer.markdownCycles` and `Sale.markdownCycles` relations present

**Verdict: CODE EXISTS — shipped feature. Needs Chrome QA.**

#### #335 — Automated Consignor Email Notifications
**CODE EXISTS.**
- `packages/backend/src/services/consignorEmailService.ts` — service exists
- `packages/backend/src/controllers/consignorController.ts` — controller exists
- `packages/backend/src/routes/consignors.ts` — route exists
- `packages/frontend/pages/organizer/consignors/` directory and `consignors.tsx` page both exist

**Verdict: CODE EXISTS — shipped feature. Needs Chrome QA.**

---

### Recommendations for #332–#335

All four features are **genuinely shipped** — code, controllers, routes, frontend pages, and Prisma schema models all confirmed present. The "S589: confirmed built, roadmap stale" note in the roadmap was accurate. None of these require a build pass.

**Recommended action for all four:** Move to the GENUINELY PENDING QA queue (Group 3). Update roadmap status to confirm "SHIPPED" and queue for Chrome QA. These are organizer-tier features requiring a TEAMS account to test: Shopify requires a connected Shopify store (may need a dev/test shop), ConsignorPayouts requires Stripe Connect, MarkdownCycles and ConsignorEmail can likely be tested with existing organizer seed accounts.

**Priority order for QA dispatch:**
1. #334 Automatic Markdown Cycles — self-contained, no external OAuth required, testable with any PRO organizer account
2. #335 Automated Consignor Email Notifications — testable within consignor portal (already QA'd in S563 for #309)
3. #333 ACH Consignor Payouts — requires Stripe Connect setup; partially covered by #309 consignor portal QA but payout flow specifically unverified
4. #332 Shopify Cross-Listing — requires connected Shopify shop; highest setup friction, lowest urgency for core product
