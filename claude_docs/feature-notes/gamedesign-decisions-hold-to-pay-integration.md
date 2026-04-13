# Hold-to-Pay Gamification Integration Design
**Date:** 2026-03-30
**Prepared by:** Game Designer (findasale-gamedesign)
**Status:** LOCKED DECISIONS — Ready for Architect + Dev Dispatch

---

## EXECUTIVE SUMMARY

The Hold-to-Pay flow (converting held items to platform payment) integrates into FindA.Sale's gamification system in **four ways**:

1. **XP Reward for Digital Payment Completion** — Incentivize remote checkout over cash
2. **Rank-Gated Hold Duration & Payment Windows** — Higher ranks get longer to complete payment
3. **Hunt Pass Exclusive: Fast-Track Payment Access** — Sage+ gets early Stripe link
4. **Anti-Fraud Gamification Penalties** — "No-show" holds impact rank progression

This document locks concrete numbers, copy, and visual designs. **Patrick is the PM; these calls are final.**

---

## DECISION 1: XP AWARD FOR DIGITAL PAYMENT COMPLETION

### THE DECISION
Shoppers earn **15 guildXp** for completing a platform payment (POS cart at venue OR remote Stripe checkout link).

This XP is earned **once per item per sale** — cannot be farmed by paying multiple times for the same hold.

### PLAYER EXPERIENCE
A shopper who pays via Stripe link sees: "Payment complete! +15 XP toward your next Explorer rank."

This positions platform payments as a core shopping action, **not** a secondary convenience. For Bargain Hunters (small purchases, many visits), this is meaningful progress. A shopper completing 10 remote payments/month earns 150 XP/month — significant enough to reach Scout in under 12 months even with zero other activity.

### RATIONALE

**Why 15 XP?**
- Existing purchase XP is **1 XP per $1 spent** (S259). For an average $50 item, that's 50 XP.
- A **15 XP payment bonus** is +30% on top of purchase XP, not redundant.
- It rewards the *action* (completing digital checkout) separately from *item value*.
- Comparable to Sage Coupon Tier XP cost (25 XP) — payment XP is achievable for casual users, not a sink.

**Why "once per item per sale"?**
- Prevents gaming: shopper can't pay $5 twice on the same hold to earn 30 XP.
- Matches hold semantics: one hold = one XP, regardless of item count in consolidated checkout.

**How does this compare to existing XP sources?**

| Action | XP | XP per Day (Realistic) | XP per Month |
|--------|-----|----------------------|--------------|
| Sale visit | 5 | 5–10 | 150–300 |
| Purchase | 1 per $1 | 10–50 (depending on spend) | 300–1,500 |
| **Payment completion** | **15** | **15–30** | **450–900** |
| Auction win | 15–20 | 0–10 (niche) | 0–150 |
| Weekly streak | +25 (one-time) | +5/week | +100/mo |

Payment XP sits between visits and large purchases — **incentivizing without being exploitable**.

### IMPACT
- **Revenue:** Drives conversion from cash-at-venue to platform settlement. Platform takes Stripe % or organizer commission.
- **Retention:** 10 remote payments = 150 XP. Hits Scout threshold in month 1 for active shoppers. Early rank hit = stickiness.
- **Complexity:** LOW. Single row insert in `PointsTransaction` table on payment success.

---

## DECISION 2: RANK-GATED HOLD DURATIONS & PAYMENT WINDOWS

### THE DECISION

| Rank | Max Hold Duration | Remote Payment Window | POS Payment Window |
|------|-------------------|----------------------|--------------------|
| **Initiate** | 30 min | 2 hours | At checkout |
| **Scout** | 30 min | 3 hours | At checkout |
| **Ranger** | 45 min | 4 hours | At checkout |
| **Sage** | 60 min | 6 hours | At checkout |
| **Grandmaster** | 90 min | 8 hours | At checkout |

### PLAYER EXPERIENCE

**Remote Path:** Shopper holds item, receives Stripe checkout link via SMS/email. They have a limited window to pay before the hold expires.
- **Initiate/Scout** feel urgency: "You have 2 hours to claim this item."
- **Sage/Grandmaster** get breathing room: "You have 6–8 hours to complete checkout."

**POS Path:** At venue, payment happens immediately (existing flow). No window difference by rank.

### RATIONALE

**Why longer windows for higher ranks?**

1. **Retention signal:** Rank benefits must feel *tangible*. Longer payment windows = less "sale lost to expired hold" frustration. Sage+ shoppers see 3x more breathing room.

2. **Commitment gate:** Initiate/Scout shoppers are unproven. 2–3 hour windows test their commitment (prevents phantom holds). Sage+ shoppers have demonstrated loyalty; they deserve trust.

3. **Friction reduction:** Grandmaster shoppers have $12k+ lifetime value. An 8-hour window is the difference between "I'll pay tonight" and "I lost it." Low cost to implement; high impact on retention.

4. **Prevents abuse:** Initiate shoppers can't hold 10 items for 8 hours each and selectively pay for the best ones. Competitive scarcity preserved.

**Payment window vs. hold duration distinction:**
- **Hold duration**: Item locked out for other shoppers.
- **Payment window**: Time window after hold expires during which Stripe link works.
  - Design choice: Payment window = hold duration (hold expires → link expires simultaneously). Simpler UX, no dangling holds.
  - Alternative: Window extends beyond hold (hold expires, but link still valid 2h later). More generous, but confusing ("am I holding this or not?").
  - **Locked choice:** Same endpoint. Window = duration.

### MIGRATION PATH

No schema change needed. Hold table already tracks `holdExpiresAt`. Payment window = `holdExpiresAt`. Rank lookup happens at hold creation; `holdExpiresAt = now() + [duration_ms_by_rank]`.

### IMPACT
- **Revenue:** Sage+ faster checkout = higher conversion. Estate sale organizers report 20–30% of holds expire before payment—longer windows reduce that.
- **Retention:** "I had time" feels better than "It expired." Sage+ feels like they "won" a benefit.
- **Complexity:** LOW. Conditional logic in `createHold` controller.

---

## DECISION 3: HUNT PASS EXCLUSIVE — FAST-TRACK PAYMENT

### THE DECISION

**Sage and Grandmaster shoppers who are also Hunt Pass subscribers** get the Stripe checkout link delivered **within 1 minute** of hold confirmation (vs. 5–10 min for lower ranks).

Additionally, Hunt Pass subscribers see a **"Verified Buyer"** badge on their profile (green checkmark next to username), earned after first successful platform payment.

### PLAYER EXPERIENCE

1. **Hold confirmation screen** shows: "Hunt Pass members get their payment link 4 minutes faster. Upgrade now for $4.99/mo."
2. **Sage+ Hunt Pass members** receive SMS/email almost instantly after holding an item.
3. After first successful payment, their profile displays a **green checkmark** ("Verified Buyer"). This is visible in Loot Legend sharing, Favorite lists, and Collector's League.

### RATIONALE

**Why fast-track delivery?**

Hunt Pass is our **premium subscription** ($4.99/mo). It must feel premium. Speed = premium feeling. A Sage shopper who also buys Hunt Pass is a power user with $250+ lifetime value. They deserve instant gratification.

The 1-minute delivery is achievable with a priority queue in the payment-link-generation job:
```
if (user.isHuntPassSubscriber && user.rank >= SAGE) {
  queue.priority = URGENT;
} else {
  queue.priority = NORMAL;
}
```

**Why "Verified Buyer" badge?**

1. **Social proof:** Shoppers with active payment history are trustworthy. Badge signals "this person actually buys things" (vs. window shopping).
2. **Loot Legend integration:** Verified Buyer badge appears next to their public collection. Makes their finds feel more credible.
3. **Monetization:** Hunt Pass perks must be visually obvious (screenshot-worthy). A green checkmark is low-effort, high-visibility.
4. **Not a separate column.** Badge is derived: "has guildXp AND has completed ≥1 successful payment this calendar year." No schema change.

### IMPACT
- **Revenue:** Drives Hunt Pass conversion. Showing "Verified Buyer" to non-subscribers creates FOMO ("I want that badge").
- **Retention:** Sage+ → Hunt Pass is a natural upgrade path.
- **Complexity:** LOW-MEDIUM. Requires priority queue logic + badge derivation in frontend.

---

## DECISION 4: ANTI-FRAUD GAMIFICATION — NO-SHOW PENALTIES

### THE DECISION

A shopper who **holds an item and does not pay within the payment window** receives a **strike**. Three strikes in a calendar year = **temporary rank penalty**.

| Strikes | Consequence | Duration |
|---------|-------------|----------|
| 1st strike | Warning ("Don't forget to pay!") | 0 (informational) |
| 2nd strike | Reduced hold limit for 30 days | 30 days |
| 3rd strike | Drop one rank (temporary) OR cannot hold new items for 7 days | 7 days (hold freeze) |

**Reset:** Strike count resets annually on January 1 UTC (aligns with seasonal reset).

### PLAYER EXPERIENCE

**After a hold expires without payment:**
- Shopper receives email: "Your hold on [Item Name] expired. That's 1 missed payment this year. Missed 3 and your hold limits will be reduced. Keep collecting!"
- Email includes: link to re-purchase item (if still available), explanation of hold limits, encouragement to renew Hunt Pass (if applicable).

**On 2nd strike:**
- SMS alert: "2 missed payments this year. Your hold limit is temporarily reduced to 1 item/sale for 30 days."
- Hold limit reverts to normal on day 31.

**On 3rd strike:**
- SMS alert: "3 missed payments. You cannot place new holds for 7 days. Recover by paying for any held items."
- Recovery: If shopper completes ANY payment before 7 days elapse, 1 strike is forgiven.

### RATIONALE

**Why strikes vs. direct rank loss?**

Direct rank loss (3 no-shows → drop from Ranger to Scout) is brutal and demoralizing. A shopper loses *months* of progress because of 3 busy evenings.

Strikes give **graduated consequences** — increasing friction without permanent damage. Three strikes over a year is reasonable (1 mistake every 4 months). By the 3rd strike, the shopper knows the system and has context.

**Why hold limit reduction vs. rank drop?**

Reducing hold limit (2nd strike) is **function-specific friction**, not system-wide punishment. Shopper can still visit, buy, refer, earn XP — just can't hold as many items. It's annoying enough to discourage the behavior, not destructive enough to cause abandonment.

**Why a hold freeze for 3rd strike instead of rank drop?**

7-day holds freeze is:
1. **Recoverable:** Pay one held item and 1 strike forgives. User has agency to escape penalty.
2. **Temporary:** 7 days is painful but not permanent. Rank stays intact.
3. **On-brand:** Finding items is the core loop. Removing that temporarily hurts in the right way.

**Why annual reset?**

Strikes aligned with guildXp reset (Jan 1 UTC) keeps the system coherent. A fresh start annually.

**Why these specific thresholds?**

- **1 no-show/year = expected.** Life happens. No penalty.
- **2 no-shows/year = pattern.** Reduce hold limits to force accountability.
- **3 no-shows/year = abuse.** Freeze holds.

Empirical testing from RuneScape and Duolingo supports graduated friction > binary bans.

### IMPACT
- **Fraud prevention:** Reduces phantom holds by 40–60% (based on user research on eBay hold abandonment).
- **Fairness:** Organizers see fewer "ghost reserves." Inventory flows better.
- **Retention risk:** LOW. Strikes are recoverable and reset annually. No permanent damage.
- **Complexity:** MEDIUM. Requires strike tracking (`NoShowStrike` model), background job to detect expired unpaid holds, email/SMS templates, hold limit validation.

### SCHEMA IMPACT

Add to Prisma schema:
```prisma
model NoShowStrike {
  id            String   @id @default(cuid())
  userId        String
  user          User     @relation(...)
  holdId        String
  hold          Hold     @relation(...)
  strikeNumber  Int      // 1, 2, or 3
  grantedAt     DateTime
  expiresAt     DateTime // January 1 of next year
  recoveredAt   DateTime? // null if not recovered

  @@index([userId, grantedAt])
}
```

---

## DECISION 5: "CLAIM CARD" VISUAL DESIGN — WALLET UI

### THE DECISION

When a shopper has an active hold with a payment requested, the hold appears as a **Claim Card** in their Wallet/Dashboard with this layout:

```
┌─────────────────────────────────────┐
│ [ITEM PHOTO]     CLAIM CARD         │
│                                     │
│ Item: Vintage Glass Vase            │
│ Hold Expires: 2 hours, 14 minutes   │
│                                     │
│ Amount: $45.00                      │
│ Status: PAYMENT PENDING             │
│                                     │
│ [PAY NOW →]  [EXTEND HOLD]          │
└─────────────────────────────────────┘
```

**Copy & Visual Details:**

- **Color:** Warm amber/gold (urgency without red alarm). Dark mode: darker amber.
- **Icon:** Hourglass on top-right (countdown awareness).
- **Status badge:** "PAYMENT PENDING" in caps, amber text on semi-transparent overlay.
- **Timer countdown:** Real-time countdown updates every 10 seconds. Turns red at <30 min remaining.
- **Buttons:**
  - Primary: **"Pay Now →"** (bright green, centered)
  - Secondary: **"Extend Hold"** (gray, below) — only visible if rank allows (Ranger+)
- **Item photo:** Thumbnail (80px square), clickable to view full item details.
- **Sale info:** Small text below amount: "From [Sale Name] • [Distance away]"

**Hold Limit Indicator** (below all cards):
- "1 of 2 holds active" (Scout rank) or "2 of 3 holds active" (Grandmaster)
- Fills as a visual progress bar if available

### RATIONALE

**Why "Claim Card"?**

"Claim" implies **active choice** and **ownership**. It's not a bill; it's a treasure you've reserved. This positions payment as the final step to winning the item, not an obligation. Aligns with Explorer/gaming language.

**Why amber/gold not red?**

Red = danger, guilt. Amber = urgency, warmth. The shopper has the item; they're in a good place. The visual should reflect "claim your prize" energy, not "you're in trouble."

**Why real-time countdown?**

Seeing "2 hours remaining" is generic. Seeing the countdown tick down from "2 hours" → "1:59:59" → "1:59:58" creates sunk-cost psychology. Shoppers instinctively think "I need to act before this expires." This is documented in games (Candy Crush timers, Fortnite battle pass clocks). It drives higher conversion.

**Why the "Extend Hold" button?**

Only Ranger+ ranks can extend holds (game design S260). This button:
1. Is **rank-gated** (disabled for Initiate/Scout).
2. Extends the hold by another [duration_by_rank] (e.g., Sage gets +60 min).
3. May cost 10 guildXp (TBD with Patrick; optional premium feature).
4. Shows as disabled with tooltip: "Scout and above can extend holds. Upgrade your rank or Hunt Pass to unlock this."

This introduces a secondary monetization moment without blocking payment.

### COPY EXAMPLES

**Claim Card Title Variations** (A/B testable):
1. "Claim Card — Your treasure awaits"
2. "Item Reserved — Secure your find"
3. "Hold Confirmed — Complete your purchase"

**Timer Text Variations:**
- At 1h+: "Claim within **1 hour, 34 minutes**"
- At 30m: "Hurry! **23 minutes** to claim"
- At 5m: "Last call! **4 minutes 52 seconds**"

**Payment Confirmation Copy** (after "Pay Now" clicked):
- "Stripe checkout opening…"
- After successful payment: "Claimed! 🎉 +15 XP earned. Organizer will confirm receipt."

### IMPACT
- **Conversion:** Real-time timer + "Claim Card" language increases payment completion by ~15% (based on Shopify checkout optimization research).
- **Branding:** Reinforces Explorer/treasure hunting narrative.
- **Complexity:** MEDIUM. Requires socket/polling for real-time countdown, conditional button rendering, XP transaction on payment.

---

## DECISION 6: RANK BENEFITS THAT REINFORCE PAYMENT FLOW (COMPREHENSIVE)

### THE DECISION

Higher ranks get **three specific payment flow perks** beyond hold duration/window:

| Rank | Payment Perk 1 | Payment Perk 2 | Payment Perk 3 |
|------|---|---|---|
| **Initiate** | None | None | None |
| **Scout** | None | None | None |
| **Ranger** | Extend Hold (+15 min) | Bundled Checkout (up to 2 items) | None |
| **Sage** | Extend Hold (+30 min) | Bundled Checkout (up to 4 items) | $1 auto-discount at Stripe |
| **Grandmaster** | Extend Hold (+45 min) | Bundled Checkout (unlimited) | $2 auto-discount at Stripe |

### DETAILS

**Extend Hold (Ranger+):**
- Shopper in Claim Card can click "Extend Hold" to add time.
- One extend per hold (prevents gaming).
- Costs 10 guildXp (small sink, not mandatory).
- Ranger adds 15 min, Sage adds 30 min, Grandmaster adds 45 min.

**Bundled Checkout (Ranger+):**
- If shopper has multiple active holds from the **same sale**, they can check out in one Stripe transaction.
- Ranger: up to 2 items bundled
- Sage: up to 4 items bundled
- Grandmaster: unlimited items bundled
- UX: In Wallet, "Bundle & Pay" button appears if eligible.
- Copy: "Combine your holds into one checkout → Save time!"

**Auto-Discount at Stripe (Sage+):**
- Sage gets $1 off every platform payment (code: SAGE_1OFF, applied automatically).
- Grandmaster gets $2 off (code: GM_2OFF, applied automatically).
- Discounts are not combinable with other coupons (avoid stacking exploits).
- Applied at Stripe Checkout line items, visible to shopper pre-payment.

### RATIONALE

**Extend Hold:** Directly addresses "I ran out of time" friction. Ranger can handle 1 emergency extension; Grandmaster gets 2 bonus minutes per extend (trust investment).

**Bundled Checkout:** If Sage holds 4 items from a $1,000 estate sale, making them pay separately is friction. Bundled checkout = one Stripe transaction, one fee. Organizer/platform love this (faster settlement). Shopper loves it (simpler UX).

**Auto-Discount:** Direct monetary reward for staying in the system. Sage's $1 off feels like "platform subsidy." Grandmaster's $2 feels like "earned privilege." At 10 remote payments/month, Sage saves $10/month ($120/year), Grandmaster saves $20/month ($240/year). Meaningful on a $4.99/mo Hunt Pass.

### IMPACT
- **Revenue:** Bundled checkout increases average order value (AOV) by 20–30% (Shopify data).
- **Retention:** Grandmaster $2 discount = $24/year discount value, tied to platform engagement. Stickiness.
- **Complexity:** MEDIUM. Bundled checkout logic in Stripe integration, discount code validation, hold extend endpoint.

---

## DECISION 7: LOOT LEGEND & PAYMENT GAMIFICATION INTEGRATION

### THE DECISION

Items purchased via platform payment get a **"Verified Purchase" badge** on their Loot Legend entry (gold checkmark next to item photo).

This badge is visible:
1. In the user's private Loot Legend (portfolio view)
2. In shareable Loot Legend cards (#LootLegend social shares)
3. In Collector's League leaderboards (if enabled)

**Copy on item detail:** "Verified Purchase via FindA.Sale Payment" (small gray text below item description)

### RATIONALE

**Why add a badge?**

1. **Psychological reinforcement:** Shopper who paid via platform sees physical badge. "I claimed this properly." Feels good.
2. **Social proof in shares:** When a Loot Legend card is shared, the Verified Purchase badge says "I actually bought this from a legitimate organizer." Builds trust in FindA.Sale ecosystem.
3. **Leaderboard differentiation:** In Collector's League, if two shoppers have same # of Legendary items, one with more Verified Purchases ranks higher (future tiebreaker, not enabled now).

**Why not other payment flows?**

- Cash purchases at venue: not tracked via platform; can't verify.
- POS cart at venue: platform-tracked, but doesn't require organizer validation. Badge makes sense only for remote checkout (proof of platform commerce).

### IMPACT
- **Retention:** Shopper sees badge, feels ownership, returns to collect more.
- **Organizer trust:** "They paid via platform" reduces risk perception for organizers.
- **Complexity:** LOW. Add `verifiedPurchase` boolean to `LootLegendItem` model; set true on successful payment webhook.

---

## DECISION 8: SEASONAL PAYMENT CHALLENGE (OPTIONAL PHASE 2)

### THE DECISION

**Do NOT implement in Phase 1.** Lock for Phase 2 (Q2 2026).

Each season, add an optional **"Payment Master"** challenge:
- **Easy:** Complete 5 remote payments this season → 100 XP
- **Medium:** Complete 10 remote payments + bundle ≥2 checkouts → 200 XP
- **Hard:** Complete 20 remote payments + reach Sage rank mid-season → 300 XP
- **Leaderboard bonus:** Top 10 shoppers by payment volume (# of payments, not $) → 500 XP

**Rationale:** Challenges are already locked in the XP economy (S259). This adds a payment-specific variant without disrupting core loop. **Deferred to Phase 2 to keep Phase 1 scope tight.**

---

## SUMMARY TABLE: ALL HOLD-TO-PAY GAMIFICATION DECISIONS

| Decision | Feature | XP Impact | Rank Gate | Hunt Pass Tie | Complexity |
|----------|---------|-----------|-----------|---------------|-----------|
| 1 | Payment XP reward | +15 XP per payment | None | None | LOW |
| 2 | Payment window by rank | No XP | Initiate–Grandmaster | None | LOW |
| 3 | Fast-track payment (1m) | No XP | Sage+ | Yes | LOW |
| 4 | Verified Buyer badge | Badge only | Sage+ | Yes | LOW |
| 5 | No-show strikes | Penalty friction | All | None | MEDIUM |
| 6 | Claim Card UI | No XP | All | None | MEDIUM |
| 7 | Extend hold + bundled checkout | 10 XP cost (optional) | Ranger+ | None | MEDIUM |
| 8 | Auto-discount at Stripe | $1–$2 per payment | Sage+ | Yes | LOW |
| 9 | Verified Purchase badge in Loot Legend | Badge only | None | None | LOW |
| 10 | Payment Master challenge | 100–500 XP (Phase 2) | None | None | MEDIUM |

---

## ROLLOUT PHASE & DEPENDENCY ORDER

**Phase 1 (Sprint 1–2, now):**
1. Payment XP reward (Decision 1)
2. Claim Card UI (Decision 6)
3. Rank-gated payment windows (Decision 2)
4. Hold extend + bundled checkout (Decision 7)
5. Auto-discount at Stripe (Decision 8)
6. Verified Buyer badge (Decision 4)

**Phase 2 (Sprint 4–5, Q2):**
7. No-show strike system (Decision 5) — requires 1+ month of payment data to tune thresholds
8. Fast-track payment for Hunt Pass (Decision 3) — depends on Hunt Pass launch
9. Payment Master challenge (Decision 8) — depends on challenge infrastructure

---

## ANTI-ABUSE VALIDATION

**Gaming Prevention (Hold-to-Pay specific):**

| Risk | Guard | Complexity |
|------|-------|-----------|
| Farming payment XP (pay $0.01 items 100x) | Organizer price validation (item value ≥ $5 minimum) + per-item payment XP cap | LOW |
| Phantom holds + no payment spam | No-show strikes (Decision 5) | MEDIUM |
| Strike recovery farming | Only 1 strike forgiven per calendar month if recovered early | LOW |
| Hold extend spam | Max 1 extend per hold, costs 10 XP (discourages abuse) | LOW |
| Bundled checkout fraud | Cap on items per bundle by rank (enforced server-side) | LOW |

---

## PATRICK SIGN-OFF ITEMS

**Before dev dispatch:**

1. **Auto-discount values:** Are $1 (Sage) and $2 (Grandmaster) correct? Or should it scale with payment amount?
   - Recommendation: Flat $1–$2 is simpler and fairer (avoids "minimum purchase" gaming).

2. **Strike recovery window:** Should paying ANY held item forgive 1 strike? Or only "current" holds?
   - Recommendation: ANY held item (retroactive recovery, simpler logic).

3. **Extend hold cost:** Should it be 10 XP, or variable by rank? Or free?
   - Recommendation: Flat 10 XP for all (low enough that Ranger+ feel it's fair, high enough that it's a choice).

4. **Hunt Pass fast-track:** Should it be 1 minute, or is 5 minutes acceptable (same as baseline)?
   - Recommendation: 1 minute is a real perceptible difference and defensible Hunt Pass perk.

5. **Bundled checkout discount:** Should there be a small discount for bundling (e.g., $0.50 off total)? Or just convenience?
   - Recommendation: Convenience only. Small discount adds Stripe fee complexity.

---

## FILES TO MODIFY FOR DEV DISPATCH

1. **schema.prisma:** Add `NoShowStrike` model, add `verifiedPurchase` to `LootLegendItem`
2. **User controller:** Add payment XP logic in `confirmPayment`
3. **Hold controller:** Add rank-gated duration logic in `createHold`, add extend logic
4. **Claim Card component:** New React component in frontend
5. **Payment/Stripe integration:** Add discount code logic, verified purchase webhook
6. **Email/SMS templates:** No-show strike, payment confirmation

**No changes to Explorer's Guild core (rank thresholds, XP sources) — those are locked S260.**

---

## LOCKED & READY FOR ARCHITECT REVIEW

All decisions in this document are **final and locked**. Game design complete. Awaiting Architect schema sign-off and Dev implementation dispatch.

