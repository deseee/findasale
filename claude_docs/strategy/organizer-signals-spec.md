# Organizer Signals Spec
## Expansion Readiness + Churn Risk Scoring

**Status:** Research complete — ready for dev implementation  
**Last updated:** 2026-04-15 (corrected from pricing page)  
**Feeds into:** Admin dashboard widgets (Tier Expansion Readiness, Churn Risk Score)

---

## Tier Structure (source of truth: /organizer/pricing.tsx)

| Tier | Price | Platform Fee | Key Limits |
|------|-------|-------------|------------|
| SIMPLE | Free | 10% | 200 items/sale, 5 photos/item, 100 auto tags/mo, 1 active sale |
| PRO | $29/mo | 8% | 3 concurrent sales, 500 items/sale, 10 photos/item, 2,000 tags/mo |
| TEAMS | $79/mo | 8% | Unlimited*, 5 team members (+$20/mo each), Webhooks, Hubs |
| ENTERPRISE | $500/mo (annual) | Custom | Unlimited, white-label, API access |
| À la carte | $9.99/sale | 10% | PRO capacity for 1 sale — 500 items, 10 photos, 500 tags, Flip Report, Virtual Queue |

**À la carte conversion trigger:** 3 purchases ($29.97) = "just subscribe to PRO" nudge.

---

## Part A: Tier Expansion Readiness Signals

### Industry Foundation
Product-led growth research (Shopify, Etsy, Square) identifies three core upgrade triggers:
1. **Usage constraints** — 85–90% of quota consumed
2. **Feature depth adoption** — exploring adjacent features 30–60 days before upsell
3. **Revenue thresholds** — GMV crossing tier-specific breakpoints

PQL-based nudges convert at 2–3× higher than generic prompts. Nudges timed within 7 days of a limit hit convert best. High season for estate sale organizers: March–May and August–October.

---

### SIMPLE → PRO ($29/mo) — The primary conversion

Four proactive signals. All fire BEFORE the organizer hits a wall, with a business case attached. None require the organizer to have already been blocked.

**Signal 1 — Fee savings breakeven (highest priority)**

Formula: If `(last30dRevenue × 0.10) - (last30dRevenue × 0.08) ≥ $25` → PRO is already near-breakeven on fees alone.
If `≥ $29` → PRO is already cheaper than SIMPLE.

Score contribution:
- Fee delta $15–$28: +40 pts
- Fee delta $29+: +60 pts (PRO already saves money)

Nudge: "Your last 30 days of sales totaled $[X]. PRO's 8% fee would have cost $[Y] less — almost covering the $29/mo subscription on its own."

Data source: `Purchase.amount` filtered to organizer's items, last 30 days.

---

**Signal 2 — Capacity trajectory**

Look at item counts across last 3 sales. If the trend is growing AND the projected next sale would exceed 180 items, flag it.

Score contribution:
- Avg items/sale > 140 AND growing: +30 pts
- Projected to exceed 180 on next sale: +50 pts

Nudge: "Your last 3 sales averaged [X] items and are growing. You'll likely hit the 200-item ceiling on your next sale — PRO gives you 500."

Data source: `Item` counts grouped by `saleId`, ordered by sale `createdAt`.

---

**Signal 3 — Feature gap (high-GMV organizer, never used Smart Pricing)**

Organizer has run 3+ completed sales with total GMV > $1,000 but has zero Smart Pricing interactions (no `aiSuggestedPrice` field touched, no price-suggest API calls).

Score contribution: +35 pts

Nudge: "You've run $[X] in sales without Smart Pricing. Based on your category mix, a portion of your items are likely underpriced — PRO includes market value estimates on every item."

Data source: `Sale` with `status=ENDED`, `Purchase` sums, `Item.aiSuggestedPrice` null check.

---

**Signal 4 — Sale velocity acceleration**

Compare sales created in the last 30 days vs. the 30 days before that. If the organizer doubled their frequency (1→2, 2→4), they're scaling and PRO's 3-concurrent-sale capacity will matter soon.

Score contribution: +25 pts

Nudge: "You've doubled your sale frequency this month. PRO supports 3 concurrent sales and 500 items each — built for organizers who are scaling up."

Data source: `Sale.createdAt` count in two 30-day windows.

---

**Signal 5 — À la carte repeat (existing but validated)**

After 2nd à la carte purchase: +20 pts.
After 3rd: nudge becomes explicit math. "You've spent $29.97 on sale upgrades. PRO is $29/mo with unlimited upgrades and 8% fees."

---

**Score threshold:** ≥ 65 triggers nudge. Recency multiplier: activity in last 30 days = 2×.

**False positive guards:**
- Require 2+ completed sales minimum before any signal fires
- Suppress if organizer has been inactive 45+ days post-last-sale

---

### PRO → TEAMS ($79/mo)

Triggers at **score ≥ 75**. Scoring window: rolling 60 days.

| Signal | Weight | Threshold |
|--------|--------|-----------|
| 2nd user invited AND logs in within 14 days | +40 pts | Event |
| Trying to create 4th concurrent sale (blocked at 3) | +30 pts | Event |
| Items hitting 500/sale limit | +25 pts | Per-sale check |
| Concurrent item edits from 2+ devices/IPs | +20 pts | Rolling 30 days |
| 3 concurrent sales active simultaneously | +15 pts | Current state |

**Nudge timing:** On the blocked event (4th sale attempt, limit hit) or on 2nd user's first login.

**Nudge message focus:** Remove the specific blocker. "You're running 3 sales simultaneously — TEAMS removes that limit and gives your team their own accounts for $79/mo."

**False positive guards:**
- Don't score purely on concurrent sale count — many solo PRO organizers run staggered sales
- Invited user must log in AND take at least one action within 14 days; invite-only doesn't count

---

### PRO/TEAMS → ENTERPRISE ($500/mo)

No automated scoring — manual qualification. Flag organizers to Patrick when:
- They contact support asking about white-labeling, API access, or custom integrations
- TEAMS organizer running >10 concurrent sales regularly
- Inbound from auction house or franchise

---

## Part B: Churn Risk Scoring

### Industry Foundation
- **Leading indicators (fires 30–60 days before churn):** Feature narrowing, declining upload frequency, support friction loops, sell-through rate declining.
- **Lagging indicators:** No login, zero sales — already churned.
- **Seasonal sellers:** 180-day inactivity threshold before marking churned (vs. 45–90 days for typical SaaS).

---

### Signal Categories and Weights

**Activity signals — 30% of total score**

| Signal | Yellow Threshold | Red Threshold |
|--------|-----------------|---------------|
| Days since last login | > 45 days | > 90 days |
| Days since last item upload | > 60 days | > 120 days |
| Days since last sale published | > 90 days | > 180 days |

**Engagement signals — 40% of total score (leading indicators)**

| Signal | Yellow Threshold | Red Threshold |
|--------|-----------------|---------------|
| Sell-through rate (items sold ÷ listed) | < 15% | < 5% |
| AI tag acceptance rate (last 30 days) | < 40% | < 20% |
| Unresolved support tickets | 2+ open | 3+ open or 7+ days unresolved |
| eBay push failure rate | > 30% fails | > 60% fails |
| Feature breadth declining month-over-month | Using fewer features | Down to 1 feature |

**Business signals — 30% of total score**

| Signal | Yellow Threshold | Red Threshold |
|--------|-----------------|---------------|
| Revenue per sale average | < $50 | < $25 |
| Time between sales (non-seasonal) | > 120 days | > 180 days |
| Buyer return rate | < 5% returning shoppers | < 1% |

---

### Score Formula

```
Activity Score   = weighted average of activity signals (0–100)
Engagement Score = weighted average of engagement signals (0–100)
Business Score   = weighted average of business signals (0–100)

Final Score = (Activity × 0.30) + (Engagement × 0.40) + (Business × 0.30)
```

Higher score = higher churn risk.

---

### Score Bands and Actions

| Band | Score | Color | Admin sees | Automated action |
|------|-------|-------|-----------|-----------------|
| Healthy | 0–30 | 🟢 Green | No flag | None |
| Monitor | 31–60 | 🟡 Yellow | Appears in monitor list | None |
| At Risk | 61–79 | 🟠 Amber | Flagged with top 3 signals | Draft re-engagement email queued for Patrick review |
| Imminent | 80–100 | 🔴 Red | Top 10 list on dashboard home | Win-back offer prompt (discount or feature unlock) |

---

### Seasonal Override (Critical)

Before scoring any organizer:
1. Compute their historical sale frequency by month (`Sale.createdAt` → month histogram)
2. If current month has historically 0 sales AND organizer has 2+ prior active seasons → apply `SEASONAL_OVERRIDE`
3. `SEASONAL_OVERRIDE`: suppress activity + business signals; score on engagement signals only
4. Show `(Seasonal)` badge in admin dashboard
5. New organizers with < 2 prior sales skip override logic entirely

---

### False Positive Traps

1. **Just-completed large sale:** Sell-through drops as items sell. Wait 7 days after sale end before scoring.
2. **New organizer first 30 days:** High upload, low sell-through is normal. Suppress until `createdAt + 30 days`.
3. **Awaiting payout:** Check `Purchase.status = PENDING` on recent items before firing amber/red.
4. **Just published after a gap:** Score should drop within 24h of new activity.
5. **À la carte user between sales:** SIMPLE organizer who runs 1 sale/year and just finished — they're not churning, they're done until next year. Check sale frequency before flagging.

---

### Dashboard Widget Design

**Expansion Readiness widget:** Top 5 organizers by expansion score with one-line reason ("Hitting 185/200 item limit", "3rd ala carte purchase"). One-click generates pre-filled upgrade pitch email with their specific numbers.

**Churn Risk widget:** Top 10 at-risk organizers (amber + red) with score, band color, top signal, days since last login, suggested action. Red = personal outreach prompt. Amber = one-click re-engagement email draft.

---

## Implementation Notes

- Both scores run as **daily cron jobs** (nightly recalculation)
- Store `expansionScore`, `churnScore`, `churnScoreDelta`, `lastScoredAt` on Organizer or a new `OrganizerScores` table
- Score history (last 90 days) enables trend viz — rising churn score is more urgent than stable amber
- Schema addition required: Architect review before dev dispatch
- Seasonal override requires 2+ prior sales to establish a pattern

---

*Ready for Architect review → Dev dispatch.*
