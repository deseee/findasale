# Patrick's Dashboard — S576 Complete (QA Pass Done — Bug Dispatch Next)

## ✅ S576 QA Results

**One-line summary:** 17 items tested. All S575 features verified. 2 P1 bugs found, 1 P2 bug, 4 UNVERIFIED carried forward. S577 is bug dispatch.

### Verified ✅

| Feature | Notes |
|---|---|
| #334 Markdown Cycles | All 3 tiers correct: TEAMS sees page, PRO sees page, SIMPLE sees PRO gate |
| #336 Organizer-intent wins | Rapidfire: typing price before AI completes → organizer value saved, not overwritten |
| #339 Refuse-to-fill | Ambiguous photo (generic glass) → brand + eBay category left blank by AI |
| #341 Multi-angle chips | Chip row fires after first photo: Back/Stamp, Damage Detail, Label/Brand, Skip |
| Rarity Boost XP gate | low-xp-shopper (10 XP): Rarity Boost button disabled with "not enough XP" message |
| Settlement Receipt PDF | Download returns 200 OK with application/pdf header |
| S529 mobile nav rank | Mobile nav shows "Initiate" from useXpProfile hook (not hardcoded "Scout") |
| AvatarDropdown Explorer's Guild | CONNECT section has Explorer's Guild → /shopper/guild-primer ✅ (ss_1535lmtx4) |

---

## ❌ Bugs Found (dispatching S577)

### P1: Settlement Payout Not Auto-Populated
- **What's broken:** Settlement Wizard → Commission tab → Receipt step shows **$0.00** payout. The "Client / Executor Receives" line shows **$NaN**. This was claimed as fixed in S575 but is broken in production.
- **Fix needed:** Wire CommissionPanel's `onPayoutRecorded` callback into SettlementWizard's payoutAmount state properly.

### P1: Tier Lapse — No Warning, No Gate
- **What's broken:** `tier-lapse-test@example.com` has PRO tier with `subscriptionStatus: past_due` in the DB and JWT. But the frontend completely ignores the `subscriptionStatus` field — no warning banner appears, and all PRO features are fully accessible.
- **Fix needed:** Read `subscriptionStatus` in the frontend, show an amber warning banner when `past_due`. Whether to also *block* PRO features needs your call (see Patrick action below).

### P2: Voice-to-Tag Wrong Icon
- **What's broken:** The voice recording button shows a **generic ghost/avatar shape** instead of a mic icon — on both the rapidfire grid thumbnails AND the edit-item page. Users have no way to know it triggers voice recording.
- **Fix needed:** Swap icon to mic on both locations.

---

## ⚠️ UNVERIFIED — Carry to S577

| Feature | Why Unverified | What's Needed |
|---|---|---|
| #338 PricingCompSummary | No test items have eBay comp data populated | Run eBay fetch on an item, or seed ItemCompLookup rows |
| #235 DonationModal | Charity sale seeded but URL unknown | Query DB for saleType=CHARITY sale → navigate directly |
| Holds countdown | Seeded hold not navigable during QA | Re-seed or find hold URL in DB |
| S529 storefront widget | Copy Link + View Storefront not in DOM | Inspect organizer/dashboard.tsx — possibly regressed or removed |

---

## ⏳ Patrick Action Needed Before S577

**Tier Lapse gate decision:** When an organizer's account is `past_due`, should we:
- **(A) Warning banner only** — amber banner at top of dashboard saying "Your subscription is past due. Update payment to avoid losing access." PRO features still work. (Simpler — 1–2 dev hours)
- **(B) Hard gate** — Warning banner + block access to PRO-only features (shopify, stripe-connect, markdown cycles, etc.) until payment is resolved. (More complex — 4–6 dev hours)

Which do you want?

**Optional (low priority):**
- `KEEPA_API_KEY` from keepa.io → API Keys — adds Amazon price history to the pricing engine. Works fine without it.
- Run `pnpm run prisma:seed` from packages/database/ when ready to update test account passwords to Seedy2025!

---

## 📋 S577 Dispatch Plan

All independent — dispatch in parallel.

| # | Task | Agent | Priority |
|---|------|-------|---------|
| 1 | Settlement payout auto-populate fix | findasale-dev | P1 |
| 2 | Tier Lapse banner (+ gate if Patrick picks Option B) | findasale-dev | P1 |
| 3 | #332 Shopify TEAMS gate for PRO users | findasale-dev | P1 |
| 4 | #333 Stripe Connect TEAMS gate + consignors 500 fix | findasale-dev | P1 |
| 5 | Voice-to-tag mic icon fix (2 locations) | findasale-dev | P2 |
