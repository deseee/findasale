# Patrick's Dashboard — April 8, 2026 (S418 continued)

---

## S418 Pass 4 + 5 (latest)

**Pass 4 — Exchange-rate calibration (1 XP = $0.01):**
Re-priced every shopper sink against the anchor rate.
- Custom Username Color: 50 → 100 XP
- Custom Frame Badge: 75 → 200 XP
- Haul Visibility Boost: 10 → 25 XP
- Event Sponsorship: 150 → 500 XP
- Shopper $1 off coupon: 100 XP (added — was missing)
- Hunt Pass $1 discount: 100 XP
- Seasonal Challenge Access: 250 XP

**Pass 6 — Coupons + refund policy locked:**
Three shopper coupon tiers: $1/$10 (100 XP, 1/mo), $1.50/$20 (150 XP, 3/mo, +$0.50 net per redemption), $5/$50 (500 XP, 1/mo). All require min purchase, monthly caps, Stripe-cleared transaction, no stacking with organizer coupons, 30-day expiry. Refund policy: Stripe admin-only + 2 auto-cases, XP no refunds, 5-min self-serve undo. Phantom "Public collection guide" earning row removed (it's a sink only). Full details in gamedesign-decisions Section 3 + ADR.

**Pass 5 — New sinks + dual-rail spec (Architect complete):**
You approved 7 new XP sinks: Sale Bump, Treasure Trail Sponsor, Wishlist Notification Boost, Lucky Roll/Mystery Box, Profile Showcase Slot, Guild/Crew Creation, Custom Map Pin. Dispatched Architect to spec a unified "Featured Boost" system — one BoostPurchase service, two payment rails (XP or Stripe). Boosts that get a cash rail: Sale Bump, Haul Visibility, Bounty Visibility, Event Sponsorship, Wishlist Notification, Seasonal Challenge Access, Guide Publication, Rarity Boost. Cosmetics stay XP-only.

---


---

## What Happened This Session (S418)

**Hunt Pass staleness audit (2 passes) + game design review + customer-facing doc sweep.** 7 files changed.

**Hunt Pass pass 1 fixes (7 total):**
- "Collector Passport" → "Loot Legend" (D-S268 rename had missed this file)
- Treasure Hunt scan XP: 25 → 12 (backend was rebalanced in S417, page wasn't updated)
- Hunt Pass TH column: 28 → 13 XP
- Quick Reference Matrix "Visit a sale" HP: 8 → 7.5 XP (was inconsistent with the full table)
- "Write an item review" 5/8 → 8/12 XP (wrong action name and values; spec says Seller review = 8/12)
- Benefit label "1.5x Streak XP" → "1.5x XP Multiplier" (streak is a separate mechanic)
- Added missing Treasure Hunt (QR Scans) section to the full XP breakdown table

**Hunt Pass pass 2 fixes (game design decisions, 6 more changes):**
- Auction win: "10–15 XP" range → flat "10 XP / 15 XP HP" (Patrick's call)
- Removed "Item photo quality" row (not in xpService.ts — phantom source)
- Removed "Community mentor session" row (not built — phantom source)
- Moved "Bounty fulfillment (seasonal)" from Community → Seasonal Challenges section
- Added missing shopper coupon sink: COUPON_CLAIM_SHOPPER 25 XP (was in xpService.ts, missing from page)
- Seasonal Challenge Access cost: 100 XP → 250 XP (gamedesign S418 decision)
- FAQ "What is Streak XP?" → "How does the weekly activity streak work?" with accurate answer

**xpService.ts:** SEASONAL_CHALLENGE_ACCESS constant updated 100→250.

**Other doc fixes:**
- `faq.tsx`: Brand Kit answer said "available on all plans" — it's PRO+ only. Fixed. Also removed a double comma typo.
- `TierComparisonTable.tsx`: "additonal" → "additional" typo
- `BUSINESS_PLAN.md`: "AI tags per month" → "Auto Tags per month" in feature table; support model section was describing phone/email SLAs that were superseded by D-S392 — rewritten to reflect the automated support stack.

**9 game design decisions locked** in `claude_docs/feature-notes/gamedesign-decisions-2026-04-08.md` (Section 2). Key: QR scan stays 12 XP, seasonal access raised to 250 XP, Streak Freeze (75 XP) locked for post-beta, shopper coupon added.

---

## Push Block (S418)

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/frontend/pages/shopper/hunt-pass.tsx
git add packages/backend/src/services/xpService.ts
git add packages/frontend/pages/faq.tsx
git add packages/frontend/components/TierComparisonTable.tsx
git add claude_docs/strategy/BUSINESS_PLAN.md
git add claude_docs/feature-notes/gamedesign-decisions-2026-04-08.md
git add .checkpoint-manifest.json
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "S418: hunt-pass staleness audit (3 passes) + game design decisions + doc sweep (7 files)

hunt-pass: Loot Legend rename, XP rebalance (12/30 TH, 10/15 auction flat),
matrix corrections, removed phantom sources (item photo quality, mentor session,
condition grade, community valuation), seasonal bounty moved to Seasonal section,
shopper discount redesigned (50 XP / \$1 off any purchase, no organizer dependency),
removed organizer coupon generation from XP sinks, seasonal challenge access
raised 100->250 XP, FAQ streak question fixed.
xpService: SEASONAL_CHALLENGE_ACCESS 100->250.
faq.tsx: Brand Kit tier fix (PRO+ only), double comma typo.
TierComparisonTable: 'additonal' typo.
BUSINESS_PLAN.md: Auto Tags rename, support model updated per D-S392.
gamedesign-decisions: 9 S418 decisions locked (Section 2)."
.\push.ps1
```

**Also push S415 + S416 if not done yet** (push blocks at bottom of this file).

---

## Investor Verdict (from S416 — still current)

🟡 **YELLOW — Don't invest today. Here's what changes that:**

- Product: extraordinary for a solo AI-assisted build. Genuine competitive advantage on workflow.
- Revenue model: solid. 10% fee-on-sale is well-positioned vs competitors (MaxSold 20–30%).
- **Fatal gap: zero paying customers, zero transactions.** The market hasn't answered "will organizers pay 10%?" yet.
- CAC: D grade. No organizer outreach has happened. Homepage shows empty sales — looks abandoned.
- Gamification: B+ as a long-term retention play, C as a current priority. Built loyalty system for users who don't exist yet.
- **What changes it to GREEN:** 5 recurring organizers + any transaction showing repeat use. Patrick listing his own eBay inventory is the right first move.

---

## Previous Session Summary (S416)

**Investor analysis of live PWA.** YELLOW verdict — strong product, zero commercial validation. Key findings summarized below under "Investor Verdict."

**Phase 3 integration tests shipped.** 4 new test files (1,722 lines): auth, payments, auction closing, reservations. Purely additive — no source changes. Zero TS errors.

**Map MVP shipped.** Treasure Trails amber badge on map pins with active public trails. "View Treasure Trail" green CTA added to pin popup. RouteBuilder gets "Start from my location" toggle with reverse geocode via Nominatim.

**2 live bugs Patrick found — fixed:**
- `/shopper/loot-log/[id]` was blank — root cause was controller returning `photoUrls[]` array but page expected `imageUrl` string. Fixed in `lootLogController.ts`.
- No way to file a dispute — `DisputeForm` existed but wasn't wired into `ReceiptCard`. "Report Issue" button restored.

**Investor items #3 and #4 shipped:**
- Pricing page now shows all-in cost: "10% platform + ~3.2% payment processing = ~13.2% total per sale" with competitor context.
- PRO upgrade nudge banner on organizer dashboard fires when SIMPLE tier organizer has 3+ completed sales — shows actual fee math and savings.

**TS build error fixed inline:** `CATEGORIES.includes()` type mismatch in review.tsx — cast to `readonly string[]`.

---

## Investor Verdict (Quick Summary)

🟡 **YELLOW — Don't invest today. Here's what changes that:**

- Product: extraordinary for a solo AI-assisted build. Genuine competitive advantage on workflow.
- Revenue model: solid. 10% fee-on-sale is well-positioned vs competitors (MaxSold 20–30%).
- **Fatal gap: zero paying customers, zero transactions.** The market hasn't answered "will organizers pay 10%?" yet.
- CAC: D grade. No organizer outreach has happened. Homepage shows empty sales — looks abandoned.
- Gamification: B+ as a long-term retention play, C as a current priority. Built loyalty system for users who don't exist yet.
- **What changes it to GREEN:** 5 recurring organizers + any transaction showing repeat use. Patrick listing his own eBay inventory is the right first move.

---

## Full Push Block (S415 + S416)

### Push S415 first (if not done):
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/backend/src/controllers/stripeController.ts
git add packages/backend/src/jobs/fraudDetectionJob.ts
git add packages/backend/src/jobs/organizerWeeklyDigestJob.ts
git add packages/backend/src/controllers/healthController.ts
git add packages/backend/src/controllers/viewerController.ts
git add packages/backend/.env.example
git add packages/backend/src/index.ts
git add packages/backend/src/jobs/auctionCloseCron.ts
git add packages/backend/src/routes/contact.ts
git add packages/backend/src/routes/auth.ts
git add packages/backend/src/routes/organizers.ts
git add packages/backend/src/routes/items.ts
git add packages/backend/src/routes/search.ts
git add packages/backend/src/controllers/userController.ts
git add packages/backend/src/routes/users.ts
git add packages/frontend/components/HaulPostCard.tsx
git add packages/frontend/components/HighValueTrackerWidget.tsx
git add packages/frontend/components/InstallPrompt.tsx
git add packages/frontend/components/SaleQRCode.tsx
git add "packages/frontend/pages/organizer/add-items/[saleId].tsx"
git add packages/frontend/pages/organizer/dashboard.tsx
git add "packages/frontend/pages/organizer/print-kit/[saleId].tsx"
git add packages/frontend/pages/profile.tsx
git add packages/frontend/pages/shopper/history.tsx
git add packages/frontend/pages/shopper/settings.tsx
git add packages/frontend/lib/itemConstants.ts
git add packages/frontend/components/camera/PreviewModal.tsx
git add packages/frontend/components/SmartInventoryUpload.tsx
git add "packages/frontend/pages/organizer/add-items/[saleId]/review.tsx"
git add claude_docs/research/tech-debt-audit-s413.md
git commit -m "S415: tech debt audit + phase 1+2 quick wins (30 files)"
.\push.ps1
```

### Then push S416:
```powershell
git add packages/backend/src/controllers/saleController.ts
git add packages/backend/src/controllers/lootLogController.ts
git add packages/backend/src/routes/organizers.ts
git add packages/backend/src/__tests__/auth.integration.ts
git add packages/backend/src/__tests__/payment.integration.ts
git add packages/backend/src/__tests__/auctionClosing.integration.ts
git add packages/backend/src/__tests__/reservation.integration.ts
git add packages/frontend/components/SaleMap.tsx
git add packages/frontend/pages/map.tsx
git add packages/frontend/components/SaleMapInner.tsx
git add packages/frontend/components/RouteBuilder.tsx
git add packages/frontend/components/ReceiptCard.tsx
git add packages/frontend/pages/organizer/pricing.tsx
git add packages/frontend/pages/organizer/dashboard.tsx
git add "packages/frontend/pages/organizer/add-items/[saleId]/review.tsx"
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "S416: map MVP, Phase 3 tests, bug fixes, pricing transparency, PRO nudge

Map: Treasure Trails badge on sale pins + Start from My Location in RouteBuilder.
Phase 3: 4 integration test files (auth, payments, auctions, reservations).
Bug fixes: loot-log detail imageUrl mapping, dispute filing restored to ReceiptCard.
Investor #3: all-in pricing transparency (10%+3.2%=13.2%) on pricing page.
Investor #4: PRO upgrade nudge banner on dashboard (3+ completed sales trigger).
TS fix: CATEGORIES type cast in review.tsx."
.\push.ps1
```

---

## Action Items for Patrick

- [ ] **Push S415 block** (if not done — 30 files)
- [ ] **Push S416 block** (this session — 16 files)
- [ ] **Create organizer account on finda.sale** — list real items from your eBay inventory to seed the homepage
- [ ] **Set `MAILERLITE_SHOPPERS_GROUP_ID=182012431062533831` on Railway** (still pending)
- [ ] **eBay keyset activation** — developer.ebay.com → Alerts & Notifications → endpoint + token

---

## What Needs QA Next Session

| Feature | How to Test |
|---|---|
| Loot-log detail page | /shopper/history as user11 → click purchase card → confirm page loads |
| Dispute filing | Open ReceiptCard → confirm "Report Issue" button → modal + submit |
| Map trail badge | /map → look for amber badge on any pin with active trail |
| PRO nudge | SIMPLE organizer with 3+ completed sales → dashboard |
| Account deletion | /shopper/settings → delete account flow (shipped S415, never QA'd) |

---

## What's Coming (S417)

1. Chrome QA of S416 fixes (above table)
2. Patrick lists first real sale as organizer — validates core flow, seeds homepage
3. Bug sweep of core organizer loop (create sale → add items → publish → payment) before inviting external organizers

---

## What's Blocked Until Real Camera / Test Data

- ValuationWidget — TEAMS user with draft item in review page
- Treasure Trails check-in — organizer must create a trail first
- Review card redesign — need camera-captured item in DRAFT state
- Camera thumbnail refresh — real device required
- POS QR scan — real device required

*Updated S416 — 2026-04-08*
