# PROJECT STATE

This document is the active state anchor for FindA.Sale, a two-sided marketplace connecting organizers (selling items) with shoppers. The project spans backend (Node.js/Prisma/PostgreSQL on Railway), frontend (Next.js on Vercel), and mobile (React Native, future).

## Current Status

**Latest work (S527 — COMPLETE):** Extended QA session. UNTESTED backlog largely cleared. 2 new P2 bugs found. S526 dev fixes still LOCAL — not yet pushed/deployed.

**S527 QA results (UNTESTED backlog):**
- ✅ #188 /neighborhoods/ — pages exist and load correctly (S525 QA had wrong URL)
- ✅ /cities + /city/[slug] — loads, P3: "Grand rapids" capitalization in breadcrumb
- ✅ Organizer Public Profile (/organizers/[slug]) — loads with sales list
- ✅ Calendar (/calendar) — loads and renders
- ✅ Item Detail (/items/[id]) — photo, price, Buy It Now modal, Cancel, all CTAs work
- ✅ Message Templates (/organizer/message-templates) — full CRUD verified (Create/Edit/Delete); P3: Delete has no confirmation dialog
- ✅ Loyalty Passport (/shopper/explorer-passport) — loads, save persists on reload; P3: no success toast
- ✅ Virtual Line Queue (/organizer/line-queue) — sale picker + queue manager load correctly
- ✅ Admin Verification Queue (/admin/verification) — loads with pending requests, Approve/Reject buttons present
- ✅ Sale Progress Checklist (/organizer/plan/[saleId]) — 6-stage timeline, real task data loads
- ✅ Encyclopedia (/encyclopedia) — search/filter/sort UI present, proper empty state
- ✅ QR Scan Analytics (/organizer/qr-codes) — stats, sales table, Print Labels CTAs
- ✅ Hunt Pass (/shopper/hunt-pass) — $4.99/mo, features listed, Upgrade CTA present
- ⚠️ Categories (/categories) — &amp; HTML entities not decoded in category names, broken first image (P2)
- ❌ Coupons organizer page — /organizer/coupons returns 404, no page built (P2)
- ❌ Sale Analytics (/organizer/sales/[id]/analytics) — GET /api/insights/organizer/sale/:saleId returns 404, backend endpoint missing (P2)

**S526 dev batch results (LOCAL ONLY — not yet pushed):**
- ✅ #224 rapid-capture: redirect page created (`pages/organizer/rapid-capture.tsx` → /organizer/sales)
- ✅ W-5 Create Sale link: workspace/[slug].tsx line 705 fixed to /organizer/create-sale
- ✅ #235 DonationModal: API paths fixed (singular→plural `/organizers/`), feature now wired
- ✅ #266 Collector Passport rename: "Explorer Profile" → "Collector Passport" across 4 files
- ✅ #200 collectorTitle: added to collectorPassportService.ts select + profile/[userId].tsx display
- ✅ #270 Onboarding Card: ExplorerGuildOnboardingCard built + wired to shopper dashboard (INITIATE only)
- ✅ S518-D Downgrade to Free: button label updated on subscription.tsx
- ✅ #228 platform fee receipt: SettlementWizard.tsx labels fixed (Revenue→Items Subtotal, Commission→Platform Fee 10%)
- ✅ #251 priceBeforeMarkdown: already implemented — requires live item with markdownApplied=true to display

**Active priorities:**
- Push S526 changes (push block in Next Immediate Actions — Patrick needs to run .\push.ps1)
- After push: Chrome QA to verify S526 fixes are live
- Dispatch dev to fix new P2 bugs: Coupons page + Sale Analytics endpoint

## Schema & Infrastructure

**Key models:** Sale, Item, User, Organizer, WorkspaceRole, SaleAssignment, PrepTask, ShopMode, FeatureFlag, ReferralFraudSignal

**Active jobs:** shopAutoRenewJob (daily 1AM UTC), referralRewardAgeGateJob (daily), auctionJob, ebayEndedListingsSyncCron, challengeService

**Pending migrations:** None (all current Railway migrations applied)

**Environment requirements:** STRIPE_TEST_SECRET_KEY, NEXT_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY (needed for checklist test QA)

## Known Issues & Debt

- **Legendary chip dismissal (P2):** ✅ Fixed S524, Chrome-verified S525.
- **PostSaleMomentumCard (P2):** ✅ Fixed S524, Chrome-verified S525.
- **Efficiency Coach label (P3):** ✅ Fixed S518, Chrome-verified S525.
- **Sale Pulse vs Ripples views count (P2, unverified):** Needs active sale with real view data.
- **Photo station (P1):** ✅ RESOLVED S526 — endpoint already fully wired, was false alarm.
- **S518-D Downgrade to Free button:** ✅ FIXED S526 — label updated on subscription.tsx. Pending Chrome QA.
- **#235 Charity Close (P1):** ✅ FIXED S526 — DonationModal API paths corrected. Pending Chrome QA.
- **#224 Camera Flow (P1):** ✅ FIXED S526 — redirect page created at /organizer/rapid-capture → /organizer/sales. Pending Chrome QA.
- **#270 Onboarding Card (P2):** ✅ FIXED S526 — ExplorerGuildOnboardingCard built, wired to shopper dashboard for INITIATE. Pending Chrome QA.
- **#251 priceBeforeMarkdown (P2):** ✅ Already implemented — needs live item with markdownApplied=true to verify display.
- **#228 Settlement receipt (P2):** ✅ FIXED S526 — SettlementWizard labels corrected. Pending Chrome QA.
- **#266 Collector Passport rename (P2):** ✅ FIXED S526 — "Collector Passport" across 4 files. Pending Chrome QA.
- **#188 Neighborhood Pages (P2):** ✅ Chrome-verified S527 — /neighborhoods and /neighborhoods/[slug] load correctly.
- **#200 Shopper Public Profiles (P2):** ✅ FIXED S526 — collectorTitle added to profile display. Pending Chrome QA (S526 not pushed yet).
- **W-5 Create Sale link (P3):** ✅ FIXED S526 — workspace/[slug].tsx updated. Pending Chrome QA (S526 not pushed yet).
- **#277 Haul Posts nav (P3):** ✅ RESOLVED S525 — nav link confirmed in avatar dropdown → EXPLORE section.
- **Coupons organizer page (P2):** ❌ NEW S527 — /organizer/coupons returns 404. No page built. Needs dev.
- **Organizer Insights (P0):** ✅ Chrome-verified S527 — /organizer/insights loads with real data (revenue, conversion rate, items by category).
- **Sale Analytics drill-down (P2):** ❌ NEW S527 — /organizer/sales/[id]/analytics fails. GET /api/insights/organizer/sale/:saleId returns 404. Backend endpoint missing. (General insights page works fine.)
- **Categories &amp; entities (P2):** ⚠️ NEW S527 — HTML entities not decoded in category names, broken image on first category card.
- **TEAMS platform fee display (P2):** ⚠️ S526 — subscription page shows 8% for TEAMS, should be 10%.

## QA Backlog

**Immediate verify (fixes just deployed):**
- S518-A: PostSaleMomentumCard — /organizer/dashboard as Alice (ended sale) — items Sold + Sell-Through % show sale-specific counts
- S518-B: Legendary chip — /organizer/add-items/[saleId]/review — chip dismisses visually after click on $75+ item
- S518-C: Efficiency Coach label — /organizer/dashboard — shows real percentile (not "Top 100%")
- S518-E: Workspace team chat — /workspace/test — chat tabs appear (already verified S523 ✅)

**Full QA queue (run autonomously next session):**
See `claude_docs/operations/qa-backlog.md` for complete list. Priority order:
1. Hot S518 fixes above
2. Feature QA Queue organizer features (#235, #241, #242, #249, #228, #264, #224)
3. Shopper features (#251, #252, #267, #268, #270, #272, #276, #277)
4. Navigation/core (#266, #200, #64, #49)
5. Workspace items (W-2, W-3, W-5)

**Blocked/Deferred:**
- HypeMeter widget (needs team shopper test data)
- RankUpModal dark mode (can't trigger rank artificially)
- Bump Post feed sort (needs active sale bump)
- Sale Pulse views count (needs active sale)

## Blocked/Unverified Queue

| Feature | Reason | What's Needed | Session Added |
|---------|--------|---------------|---------------|
| #224 rapid-capture redirect | S526 not pushed yet | Push S526, then Chrome verify /organizer/rapid-capture → /organizer/sales | S526 |
| W-5 Create Sale link | S526 not pushed yet | Push S526, then Chrome verify workspace Create Sale → /organizer/create-sale | S526 |
| #235 DonationModal | S526 not pushed yet | Push S526, then Chrome verify charity close step in settlement wizard | S526 |
| #228 receipt labels | S526 not pushed yet | Push S526, then Chrome verify "Items Subtotal" + "Platform Fee (10%)" in receipt | S526 |
| #266 Collector Passport rename | S526 not pushed yet | Push S526, then Chrome verify nav shows "Collector Passport" | S526 |
| #200 collectorTitle | S526 not pushed yet | Push S526, then Chrome verify collectorTitle shows on /shoppers/[id] profile | S526 |
| #270 INITIATE onboarding card | S526 not pushed yet | Push S526, then Chrome verify card renders on shopper dashboard as INITIATE user | S526 |
| S518-D Downgrade to Free | S526 not pushed yet | Push S526, then Chrome verify button label on /organizer/subscription | S526 |
| #251 priceBeforeMarkdown | Needs live data | Need item with markdownApplied=true to verify crossed-out display | S526 |
| Sale Detail shopper view | Not yet QA'd | Chrome verify /sales/[id] items, prices, full buy flow | — |
| Categories &amp; entity bug | Bug found S527 | Dev fix needed: HTML entity decode + broken image on /categories | S527 |
| TEAMS platform fee 8% | Bug found S526 | Dev fix needed: subscription page shows 8%, should be 10% | S526 |

## File Organization

**Backend controllers:** `packages/backend/src/controllers/` — saleController, itemController, authController, stripeController, ebayController, checklistController, labelComposerController, shopAutoRenewJob

**Frontend pages:** `packages/frontend/pages/organizer/` (seller flows), `pages/shopper/` (buyer flows), `pages/admin/` (platform tools)

**Shared types:** `packages/backend/src/types/`, `packages/frontend/types/`

**Database:** `packages/database/prisma/schema.prisma`, migrations in `migrations/` folder

## Next Immediate Actions (S528)

**Step 1 — Push S526 (Patrick runs this from PowerShell):**
```powershell
git add packages/frontend/pages/organizer/rapid-capture.tsx
git add packages/frontend/pages/workspace/[slug].tsx
git add packages/frontend/components/DonationModal.tsx
git add packages/frontend/components/AvatarDropdown.tsx
git add packages/frontend/components/Layout.tsx
git add packages/frontend/pages/shopper/explorer-passport.tsx
git add packages/frontend/pages/shopper/profile/[userId].tsx
git add packages/backend/src/services/collectorPassportService.ts
git add packages/frontend/components/ExplorerGuildOnboardingCard.tsx
git add packages/frontend/pages/shopper/dashboard.tsx
git add packages/frontend/pages/organizer/subscription.tsx
git add packages/frontend/components/SettlementWizard.tsx
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git add claude_docs/strategy/roadmap.md
git commit -m "S526+S527: Fix #224 #235 #228 #266 #200 #270 W-5 S518-D — bug batch + Collector Passport rename + doc updates"
.\push.ps1
```

**Step 2 — After push deploys: Chrome QA the 8 S526 fixes**
- #224 /organizer/rapid-capture → should redirect to /organizer/sales
- W-5 workspace Create Sale → should go to /organizer/create-sale
- #235 DonationModal → settlement wizard charity close step
- #228 receipt labels → "Items Subtotal" + "Platform Fee (10%)"
- #266 Collector Passport → nav shows new label
- #200 collectorTitle → shows on /shoppers/[id] profile
- #270 INITIATE onboarding card → renders on shopper dashboard
- S518-D Downgrade to Free → button label on /organizer/subscription

**Step 3 — Dispatch dev for new P2 bugs found in S527:**
- Coupons organizer page (build /organizer/coupons)
- Sale Analytics endpoint (build GET /api/insights/organizer/sale/:saleId)
- Categories HTML entity decode + broken image
- TEAMS platform fee shows 8% (should be 10%)
## Recent Sessions

**S527 (2026-04-20, COMPLETE):** Extended QA session. Continued from S526 (context resumed after compression). Cleared most of UNTESTED backlog. Verified: #188 /neighborhoods ✅, /cities ✅, /city/[slug] ✅, Organizer Profile ✅, Calendar ✅, Item Detail ✅, Message Templates (CRUD) ✅, Loyalty Passport ✅, Virtual Line Queue ✅, Admin Verification Queue ✅, Sale Progress Checklist ✅, Encyclopedia ✅, QR Scan Analytics ✅, Hunt Pass ✅. New bugs: Coupons organizer page ❌ P2 (404), Sale Analytics ❌ P2 (backend 404), Categories ⚠️ P2 (HTML entities), TEAMS fee shows 8% ⚠️ P2. S526 dev fixes still local — not pushed.

**S526 (2026-04-20, COMPLETE):** Bug fix batch. 7 parallel dev agents. Fixes: #224 redirect page, W-5 link fix, #235 DonationModal API paths (singular→plural), #266 rename 4 files, #200 collectorTitle on profile, #270 ExplorerGuildOnboardingCard (new component), S518-D downgrade label, #228 receipt labels. Non-issues: photo station already wired, #251 already implemented, #188 pages exist at /neighborhoods/ (QA had wrong URL). Roadmap S525 results written. Frontend TS: 0 errors. Backend TS errors: pre-existing stale Prisma client, not S526. Chrome MCP crashed before QA — all S526 fixes in UNVERIFIED queue for S527.

**S525 (2026-04-20, COMPLETE):** Autonomous QA session. Full Chrome backlog run. 18 features verified. S518-A/B/C ✅. Organizer: #242✅ #249✅ #264✅ #228⚠️ #235❌ #224❌. Shopper: #276✅ #277✅ #252✅ #270❌ #251❌. Nav/Core: #64✅ #49✅ #200⚠️ #266❌ #188❌. Workspace: W-2✅ W-3✅ W-5⚠️. 10 bugs found and logged in qa-backlog.md. No code dispatched — bugs queued for next session.

**S524 (2026-04-20):** Pricing page P0. Extended restoration battle — pricing.tsx went through 5+ incorrect states before landing on `fdb9c9e6` baseline restore. Final state: clean TEAMS card with "Retail Mode" line added, PRO card with card reader note added. Stripe Terminal hardware guide corrected (M2/Tap to Pay = incompatible with PWA). subscription.tsx support copy fixed per D-S392. S518-A (PostSaleMomentumCard unsafe cast) and S518-B (Legendary chip stale saleId mutation) both fixed.

**S523 (2026-04-19):** Share card 401 fully resolved (5-fix deep-dive: auth library, auth pattern, Edge Runtime, Satori CSS, Buffer). Share card ✅ Chrome-verified. eBay EndedSync XML crash fixed. S518-D and S518-E verified.

**S522 (prior):** Share card initial investigation. Auth pattern mismatch identified. Multiple attempted fixes.

**S518 (prior):** PostSaleMomentumCard sale-specific stats, Legendary chip, priceBeforeMarkdown secondary endpoints, Efficiency Coach label, pricing downgrade stub.

**S516 (prior):** Bump Post feed sort, Referral Fraud Gate D-XP-004 (all 5 phases, observational), pricing.tsx downgrade stub fixed.

## Historical Reference

Completed phases documented in `claude_docs/COMPLETED_PHASES.md`. Advisory board decisions in `claude_docs/feature-notes/`. Roadmap maintained at `claude_docs/strategy/roadmap.md` (currently v112). Operations checklist: `claude_docs/operations/qa-backlog.md`, `claude_docs/operations/cost-protection-playbook.md`.
