# XP Economy Locked Decisions — 2026-04-13

Status: LOCKED (Game Designer approval, Patrick authoritative sign-off)
Date locked: 2026-04-13
Reviewed by: Claude Game Designer
Authority: FindA.Sale DECISIONS.md (D-XP-001 through D-XP-006)

---

## D-XP-001: Coupon Tier Structure (Locked)

DECISION: Ship the three-tier structure as proposed.
- **Tier 1:** 100 XP → $0.75 off $10+ | 2x/month standard, 3x/month Hunt Pass
- **Tier 2:** 200 XP → $2.00 off $25+ | 2x/month standard, 3x/month Hunt Pass  
- **Tier 3:** 500 XP → $5.00 off $50+ | 1x/month (all users)

PLAYER EXPERIENCE: Shoppers feel the coupon progression rewards bigger buys — tighter restraint on low-value coupons, more breathing room at higher spend tiers.

RATIONALE: Progressive $-per-XP rates (1.5:1 at Tier 1, 1:1 at Tier 2–3) are intentional. Tier 1 at $0.0075/XP signals "this is a teaser coupon" and nudges users toward accumulating to Tier 2. Tier 2 and 3 both hit $0.01/XP, creating a natural equilibrium once players understand the system. This matches the AOV-inflation self-funding model.

IMPACT: MEDIUM
- Revenue: Favorable (coupons drive AOV spike; transaction fee recovery > coupon cost)
- Retention: Favorable (achievable milestones at 100 and 200 XP keep casual players engaged)
- Complexity: LOW (three tiers, simple redemption rules)

---

## D-XP-002: XP Expiry Policy (Locked)

DECISION: 
- **Expiry window:** XP expires 365 days from last activity (last purchase, haul post, or referral completion — not log-in alone).
- **Warning window:** In-app notification at 300-day mark and again at 350-day mark. No email — too many false alarms for this demographic.
- **Partial vs. full:** Full balance expires. No salvage. Forces annual engagement loop.
- **Rank exception:** Grandmaster+ (5,000 total earned) XP never expires. This is the legendary tier reward. Standard Grandmaster (single purchase) does expire.

PLAYER EXPERIENCE: Casual players get a one-year grace period with two reminders. Committed players who hit legendary status are protected from expiry forever — feels earned.

RATIONALE: 365 days matches typical secondhand sale seasonality (spring estate sales, fall cleanouts). Full expiry creates urgency; partial expiry teaches users to stop caring (better to reset than manage remnants). Grandmaster exception cements loyalty and solves the edge case of a power user who took a 2-month summer break. This is a 1-line backend gate (check rank enum before expiry query).

IMPACT: MEDIUM
- Revenue: Favorable (forces annual refresh cycle; expired balances = re-engagement lever)
- Retention: Favorable (reminders + Grandmaster exemption balance harsh with rewarding)
- Complexity: LOW (single field: `expiresAt` = lastActivityDate + 365d; one rank check)

---

## D-XP-003: Organizer-Funded Item Discounts (Locked)

DECISION:
- **XP cost per discount:** 200 XP = $2 off a single item. (Baseline; organizers can burn more for higher discounts if needed, capped at 500 XP per item.)
- **Max discount per item:** $5 (equivalent to 500 XP spend). Prevents listing a $50 lamp at $0.
- **Stacking rule:** Organizer-funded discounts and shopper XP coupons DO NOT stack. Shopper sees the best single discount and uses it. (Prevents exploits like $0.75 + $2 on the same item.)
- **Platform cost:** Zero. Organizer burns their own XP; shopper saves real money but pays platform fees on the discounted item price (good enough).

PLAYER EXPERIENCE: Organizers unlock a "hot deal" lever to move slow inventory without cash. Shoppers see "Organizer Special: $2 off" and feel respected. No free money leaking.

RATIONALE: 200 XP = $2 off matches Tier 2 coupon efficiency ($0.01/XP). Organizers are already in the loyalty system; letting them self-fund discounts on slow items keeps them engaged with less churn risk than "my listing didn't sell." Non-stacking rule prevents a shopper from using both discounts — the organizer's discount is stronger (usually), so the shopper picks it and the organizer's XP burn feels good. This is a per-item toggle on the listing page.

IMPACT: MEDIUM
- Revenue: Neutral to positive (lower sell price, but same transaction fee %; could increase inventory velocity and repeat organizer engagement)
- Retention: Favorable (reduces organizer listing abandonment; gives them agency over pricing)
- Complexity: MEDIUM (new field on Item model, organizer UI toggle, redemption logic in checkout flow)

---

## D-XP-004: Revised Earning Table (Locked)

DECISION: Lock the following earning values, replacing current 10 XP flat purchase + 50 XP referral spec:

| Activity | New Value | Rationale |
|----------|-----------|-----------|
| **Purchase** | 10 XP | Hold current. No change. |
| **Referral (friend purchases)** | 500 XP | Massive increase; see fraud gate below. |
| **Walk-in visit (check-in)** | 2 XP | Reduce from 5 to reflect zero effort; gate behind geo-check. |
| **Hold completed** | ELIMINATE | Fold into purchase XP (already captured). Removes double-dipping. |
| **Haul post** | 30 XP | Increase from 10 to reward UGC quality; mirrors referral incentive philosophy. |
| **Community appraisal submitted** | 5 XP | Reduce from 8; appraisal volume is high, quality is variable. |
| **Appraisal selected by seller** | 20 XP | Halve from 40 to break cartel math (users were farming easy votes). |
| **Seller review** | 5 XP | Reduce from 8 to remove extortion leverage ("rate me or lose XP"). |
| **QR code scan** | 3 XP | Reduce from 12 to reflect zero-effort activation; geo-check required. |

**Fraud gate for referrals:** Referral XP only credits 24+ hours after the friend's first purchase clears payment processing (not pending). Friend's account must have valid email + phone verified. If referrer already referred the same person (duplicate check), credit only once. This prevents drive-by fraud.

PLAYER EXPERIENCE: Earning feels consistent: high-effort activities (haul post = 30, appraisal picked = 20) beat low-effort (walk-in = 2, scan = 3). Referral at 500 is a "lottery ticket" — one successful friend pays for a month of casual play.

RATIONALE: 
- Purchase stays at 10 XP (already locked, works).
- Referral 500 XP is 2.5x the coupon Tier 3 cost (500 XP = $5 discount). This incentivizes word-of-mouth without subsidizing the friend's first item (the transaction fee recovery does that). Fraud gate is light: payment-cleared status + account verification.
- Haul post 30 XP is 3x walk-in, making UGC the primary earning vector (aligns with product vision: photo-centric marketplace).
- Hold completion is eliminated because it double-dips with purchase XP. A user who holds then buys was already going to buy; crediting both is unearned value.
- Appraisal changes (submit 5, picked 20) remove the "vote-farm cartel" (S388 discovery: users rating each other's appraisals to farm XP, no real value).
- Seller review 5 (down from 8) removes the leverage for extortion (users threatening bad reviews unless given XP bonuses).

IMPACT: HIGH
- Revenue: Favorable (referral at 500 XP drives acquisition; haul posts at 30 XP increase UGC velocity and AOV via better photos).
- Retention: Favorable (haul posts and referrals are sticky activities; low-effort walks reduced so users graduate faster).
- Complexity: MEDIUM (update XP grant schema, fraud gate on referral processing, remove hold-completion trigger).

---

## D-XP-005: Vanity Cosmetic Sink Repricing (Locked)

DECISION:
- **Custom Username Color:** 100 XP → **1,000 XP** (locked)
- **Custom Frame Badge:** 200 XP → **2,500 XP** (locked)
- **Profile Showcase Slot:** 50–150 XP range → **250–500 XP** (locked at tier: Bronze slot 250, Silver 350, Gold 500)

All cosmetics are permanent (one-time purchase, not renewable per month).

PLAYER EXPERIENCE: Cosmetics are now "legendary" sinks for players who have been grinding for months. A shopper who earns 10 XP per purchase and 30 XP per haul post sees a custom color as the reward for 100+ activities. Feels exclusive, not frivolous.

RATIONALE: This demographic (35–65, bargain hunters) does NOT value cosmetics at typical prices. By pricing them in the 1,000–2,500 XP range, we're not betting on cosmetic revenue; we're creating a **high-effort XP sink** that keeps hardcore players engaged without expecting cash spend. Shoppers who care deeply about cosmetics (rare) will treat them as a long-term goal. Everyone else ignores them, which is fine — they serve as the "prestige" tier, not the mass sink.

IMPACT: LOW
- Revenue: Neutral (cosmetics were not a revenue driver; this is a retention tool).
- Retention: Favorable (gives veteran players a 3–6 month goal).
- Complexity: LOW (UI update only; no backend changes beyond XP cost fields).

---

## D-XP-006: Zero-Cost Micro-Sinks for Dead XP (Locked)

DECISION: Ship three at launch; defer two.

**SHIP AT LAUNCH:**
1. **Scout Reveal:** 5 XP → Temporarily reveal recently-listed hidden gems in user's zip code (10 min access). Cost: $0 (data + frontend gate, no discount/coupon). Landing: Explore tab, "Hot Scoops" section.
2. **Haul Unboxing Animation:** 2 XP → Animated border on user's own haul post for 24h (cosmetic only). Cost: $0 (CSS animation). Landing: Post detail, "Boost This Haul" button.
3. **Bump a Post:** 10 XP → Push older haul post (user's own or viewed) to top of local feed for 2h. Cost: $0 (feed algorithm sort). Landing: Post detail and user profile, "Boost" button.

**DEFER (Post-Launch):**
- **Forecast Polls:** ❌ KILLED — Patrick decision 2026-04-13. Michigan MCL §432.201 gambling liability. Feature does not exist in codebase and will not be built.

PLAYER EXPERIENCE: Users with 15–80 XP feel clever spending a few points on a Scout Reveal, then keep browsing. The haul animations feel rewarding without being essential. Bumps help users feel their post matters.

RATIONALE:
- All three cost $0 to run (no discount value leaking).
- Collectively drain 5–50 XP per week from casual users (keeps them under the 100 XP coupon threshold but keeps them engaged).
- Scout Reveal and Bump drive discovery/engagement metrics without revenue leakage.
- Haul animation is pure ego-stroke (matches 35–65 demographic's desire for recognition).
- Forecast Polls: KILLED. Patrick decision 2026-04-13.

IMPACT: MEDIUM
- Revenue: Neutral (sinks XP, costs $0).
- Retention: Favorable (keeps 15–80 XP players feeling progress; reduces churn to "I'm stuck at 97 XP and can't buy anything").
- Complexity: LOW (three frontend toggles + one feed sort tweak).

---

## Summary: XP Economy Locked State

| Decision | Status | Key Risk |
|----------|--------|----------|
| D-XP-001: Coupon Tiers | ✅ LOCKED | None (proven AOV math) |
| D-XP-002: Expiry Policy | ✅ LOCKED | Annual churn spike at 365d; monitor engagement. |
| D-XP-003: Organizer Discounts | ✅ LOCKED | Org adoption; may need UX coaching. |
| D-XP-004: Earning Table | ✅ LOCKED | Referral fraud gate must be airtight. |
| D-XP-005: Cosmetic Pricing | ✅ LOCKED | Cosmetics may be ignored entirely (acceptable). |
| D-XP-006: Micro-Sinks | ✅ LOCKED (3 ship) | Forecast Polls killed — Patrick decision 2026-04-13. |

---

## Implementation Checklist

- [ ] Update schema.prisma: XP expiry date, organizer-discount cost per item, earning values for all activity types, cosmetic XP prices.
- [ ] Backend: Referral fraud gate (payment-cleared + account verify checks).
- [ ] Backend: XP expiry cron job (runs nightly, flags 300/350-day warnings).
- [ ] Backend: Organizer discount toggle on listing edit page.
- [ ] Frontend: Coupon redemption flow (show tiers, enforce 2x/3x/1x limits per month).
- [ ] Frontend: Scout Reveal pop-up (zip-code recent listings, 10-min timer).
- [ ] Frontend: Haul animation button + 24h timer.
- [ ] Frontend: Bump post button + 2h feed sort recency reset.
- [x] Forecast Polls: KILLED 2026-04-13 (no code exists, no action needed).

---

**Decision Authority:** Claude Game Designer, FindA.Sale  
**Ready for Patrick Handoff:** Yes — all 6 decisions locked. Forecast Polls killed 2026-04-13 (Patrick decision, Michigan gambling law).
