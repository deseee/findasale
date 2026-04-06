# Explorer's Guild — Game Design Decisions (Session 406, Rev 2)
## Comprehensive XP Economy, Sinks, and Feature Matrix

**Date:** 2026-04-06 (revised post financial audit)
**Prepared by:** Game Designer (findasale-gamedesign skill)
**Status:** LOCKED — Ready for architect handoff
**Scope:** Full XP economy. Resolves 10 design questions. Applies 5 financial audit corrections from Patrick review.

**Revision notes (Rev 2):**
1. Trail XP corrected: defined as same-day route (3–5 sales), bonus lowered to 20 XP
2. Dual XP eliminated: one currency for all users; organizer sinks require organizer account type
3. Seasonal Battle Pass removed as separate SKU: folded into Hunt Pass / 100 XP sink
4. Organizer signup XP cap removed: fraud protection via first-purchase gate instead
5. Purchase XP ($1 = 1 XP) confirmed valid via time-to-rank audit

---

# SECTION 1: DESIGN DECISIONS

---

### Treasure Trail Definition and XP

**DECISION:** A Treasure Trail is a curated multi-stop local experience — not a sale route. Trails are anchored by a FindA.Sale event but include any combination of: resale shops, antique dealers, local POIs (cafes, sightseeing spots, photo locations), and other FindA.Sale sales if present in the area. Trails don't require multiple FindA.Sale sales to be valid — a single sale surrounded by local discovery stops is a complete trail.

**Stop types and XP:**

| Stop type | Check-in XP | Photo XP | Notes |
|---|---|---|---|
| FindA.Sale event | 5 (standard visit XP) | Existing photo mechanics | Full purchase XP stacks |
| Resale shop / antique dealer | 3 | +2 if photo posted to feed | Geolocation or QR verify |
| Local POI (café, landmark, park) | 2 | +2 if photo posted to feed | Geolocation only; no purchase required |
| Platform-listed business (partner) | 4 | +2 if photo posted to feed | Prioritized in trail builder |

**Completion bonus (scaled by trail length):**

| Trail length | Completion bonus |
|---|---|
| 3 stops (minimum) | +40 XP |
| 4 stops | +50 XP |
| 5 stops | +60 XP |
| 6 stops | +70 XP |
| 7 stops (max) | +80 XP |

**Partial completion:** No partial bonus. Per-stop XP is always earned immediately on check-in. Completion bonus requires finishing all stops. Trail window: 7 days from first check-in (can spread across multiple outings). Max 1 completion bonus per trail per user.

**Full example:** "Eastown Saturday" trail (5 stops) — estate sale (5 XP + $65 purchase = 70 XP) + antique mall (3 XP + photo = 5 XP) + coffee shop with photo (2+2 = 4 XP) + landmark photo (2+2 = 4 XP) + platform partner (4+2 = 6 XP) + completion bonus (60 XP) = **149 XP for a morning out.**

**Balance vs core loop:** Same user attending just the sale without a trail earns ~73 XP (visit + purchase + review + haul). Trail roughly doubles that with meaningful extra effort (4 additional stops + photography). Core sale attendance still does most of the earning work — trails are additive, not a replacement grind.

**Who creates trails:** Organizers create trails anchored to their own sale. They add nearby stops (platform search + manual entry for local spots). Trail creation is open (no paywall, no rank gate). Platform curates featured trails for cities.

**Trail curation model:** Open creation → 1–2 day editorial review → organizer can request "featured" flag → platform surfaces by recency + saves/completions. No algorithm until 50+ organizers and 500+ trails. Hunt Pass subscribers get trail suggestions, early access to featured trails, and their own trails prioritized in discovery.

**Organizer reward per trail completion:** +15 XP per unique shopper completion. No monthly cap — the 1-completion-per-user-per-trail rule is the natural ceiling. A trail with 20 completions = 300 XP for the organizer.

**Community trail creation:** Open to all users. Phase 2 feature. No Hunt Pass gate for creation — editorial review handles quality. Hunt Pass advantage is in discovery, not creation.

**Photo mechanic:** Photos taken at non-sale stops are shared to the user's Loot Legend and optionally to the public social feed. This is the primary social proof surface for non-sale discovery content.

**PLAYER EXPERIENCE:** Shopper opens app Saturday morning. Sees "Eastside Treasure Run — 4 stops, ~2 hours, 150 XP possible." Hits the estate sale, grabs coffee at the tagged café and snaps a photo, checks in at a vintage shop, and gets 40 XP + "Trail Complete" badge.

**RATIONALE:** Trails need to work even when only one sale exists in an area. The local discovery angle (cafes, photo spots, antique shops) gives shoppers a reason to make a full outing, increases platform visibility in the community, and generates organic social content from photo shares at local spots. The 40 XP bonus reflects real-world movement + photography effort across multiple location types.

**IMPACT:** HIGH on engagement and social content, MEDIUM on acquisition (trails visible to non-members), LOW complexity at launch (organizer-built, geolocation verify).

---

### Single XP Currency (Dual System Eliminated)

**DECISION:** One XP currency for all users. There is no "org-XP" and "shopper-XP." All actions award the same XP that feeds the same rank thresholds (500/2000/5000/12000). Organizer-specific sinks are gated by account type, not currency type.

**PLAYER EXPERIENCE:** Organizer opens their profile, sees one XP number. They earn XP by hosting sales, getting reviews, recruiting shoppers — same pool they'd spend on coupon generation or listing extensions.

**RATIONALE:** Two currencies require two wallets, two display surfaces, two mental models, and double the implementation. The only reason to separate would be a parallel organizer rank track — which we don't have and don't need. Account type (ORGANIZER vs SHOPPER) is the gate for organizer-specific sinks.

**IMPACT:** HIGH simplification benefit, ZERO revenue impact, LOW complexity to implement.

---

### Seasonal Battle Pass Eliminated as Separate SKU

**DECISION:** No standalone "Seasonal Battle Pass" product. Seasonal challenges and seasonal cosmetics are Hunt Pass features (included in $4.99/mo). Non-Hunt Pass users can unlock seasonal challenge access with **100 XP** (one-time per season). There is no $9.99 seasonal SKU.

**PLAYER EXPERIENCE:** Hunt Pass subscriber auto-enrolls in seasonal challenges. Free user sees "Unlock this season's challenges — spend 100 XP or upgrade to Hunt Pass."

**RATIONALE:** A separate $9.99 seasonal SKU cannibalizes Hunt Pass. At $9.99/season × 4 seasons = $39.96/year vs Hunt Pass $59.88/year — power users would buy seasonal passes and skip the subscription. Folding seasonal content into Hunt Pass makes the subscription more valuable without creating a competing product. The 100 XP earn-path gives free users a conversion moment without a hard paywall.

**IMPACT:** HIGH — protects Hunt Pass recurring revenue. Eliminates SKU confusion.

---

### Organizer Signup XP Cap Removed

**DECISION:** No monthly cap on XP earned from organizer-recruited shopper signups. An organizer can recruit unlimited shoppers at a live sale and earn XP for each. Fraud protection: shopper XP to organizer posts only after the new shopper completes their **first purchase** (not just account creation).

**PLAYER EXPERIENCE:** Organizer runs signup station at their estate sale. Every new shopper who signs up and buys something that day earns the organizer +10 XP. 15 signups = 150 XP.

**RATIONALE:** We want organizers to recruit shoppers. Capping the reward at 50 XP/month (~5 signups) actively discourages the exact behavior we want to incentivize. The first-purchase requirement is the real fraud gate — fake accounts can't fake a purchase transaction.

**IMPACT:** MEDIUM upside (organizer acquisition flywheel), negligible fraud risk with purchase gate.

---

### Purchase XP Confirmed: $1 = 1 XP

**DECISION:** Purchase XP remains at 1 XP per $1 spent. No cap. Stacks with hold-completed bonus.

**Time-to-rank audit (validated):**

| User type | Est. monthly spend | Purchase XP | Total w/ activity | Months to Scout | Months to Grandmaster |
|---|---|---|---|---|---|
| Light (1 sale/wk, $25/visit) | $100 | 100 | ~280 XP/mo | ~1.8 months | ~43 months |
| Active (2–3/wk, $75/visit) | $600 | 600 | ~800 XP/mo | <1 month | ~15 months |
| Power (daily, $1k+/mo) | $1,000+ | 1,000+ | 1,200+ XP/mo | <1 month | ~10 months |

Scout in under 2 months for light users = appropriate "I'm actually using this" milestone. Grandmaster at 10–43 months gives the top tier real prestige. Validated. No change.

---

### Hold XP: Completed Only

**DECISION:** No XP for hold placed. +7 XP for hold completed (pickup/purchase), stacks with purchase XP.

**RATIONALE:** Hold placed is one tap. Hold completed is real commitment. Prevents gaming (place 5 holds, cancel 4, collect easy XP).

---

### Virtual Queue XP

**DECISION:**

| Event | XP | Condition |
|---|---|---|
| Show up on time | +10 XP | Within 5 min of sale.startTime (geolocation + app active) |
| Show up early bonus | +5 XP | 15+ min before open; stacks with on-time |
| 3-streak bonus | +20 XP | On-time for 3+ consecutive sales in same month; once/month |

Monthly cap: 100 XP from queue bonuses total.

**RATIONALE:** Presence-based reward reduces no-shows, signals reliable attendees to organizers, low fraud risk (GPS + foreground app required).

---

### Bounty System

**DECISION:**

**Type 1 — Organizer-posted bounties:**
- Cost to post: 50 XP (organizer account required) or $1.99 ala carte
- Reward to fulfiller: 25 XP (one-time per bounty)
- Duration: 7 days. Cap: 2 bounties/week per organizer.
- Verification: organizer approves photo/description.

**Type 2 — FindA.Sale seasonal bounties:**
- Cost to enter: free or 5 XP to boost visibility
- Rewards (top 10): 50–200 XP (1st=200, 2nd=150, 3–5=100, 6–10=50)
- Verification: community voting + curation
- Duration: monthly

**Ala carte:** Post bounty = $1.99 (organizer). Boost bounty = $0.99 (shopper).

---

### Rank Floor (XP Spending Model)

**DECISION:** Players cannot spend XP below their rank's minimum threshold.

Formula: `spendableXP = currentXP - rankFloor[currentRank]`

Example: Ranger (floor=2000) at 2500 XP has 500 spendable. Cannot drop to Initiate via spending. Grandmaster (floor=12000) has infinite spendable buffer.

Exception: Grandmaster cannot tier-down (locked S260).

---

# SECTION 2: COMPLETE XP EARNING TABLE

| Action | XP | Cap | Account type | Notes |
|--------|-----|-----|---|-------|
| **Purchase ($1 spent)** | 1 | None | Any | Primary loop |
| **Visit a sale** | 5 | 2/day, 150/mo | Any | Geolocation verified |
| **Hold completed** | +7 | None | Shopper | Stacks with purchase XP |
| **First purchase ever** | 50 | One-time | Shopper | Activation bonus |
| **Haul post published** | 10 | None | Any | Requires 2+ items + photo |
| **Haul post 10+ likes** | +5 | 50/mo | Any | Once per haul |
| **Haul engagement (others' posts)** | +0.5/like, +3/comment | 20/mo | Any | Community participation |
| **Item photo quality** | 3 | 30/mo | Any | Encourages better photos |
| **Condition grade submission** | 5 | 50/mo | Any | Quality metadata |
| **Seller review (text)** | 8 | 30/mo | Shopper | 25+ char minimum |
| **Seller review (text + photo)** | +3 bonus | Stacks | Shopper | High-effort review |
| **Referral (friend purchases)** | 25 | None; flag >20/mo | Any | One-time per referred user |
| **Referral (new organizer signup)** | 50 | None | Shopper | Organizer creates account |
| **Referral (new organizer 1st sale)** | +50 bonus | One-time | Shopper | Completion bonus; total 100 XP |
| **Auction win** | 15–20 | 100/mo | Shopper | +0.5 per $100 item value (+5 cap) |
| **Social share claim** | 10 | 200/mo; flag >5/day | Any | Honor system; must confirm shared |
| **Trail stop — FindA.Sale event** | 5 | None | Any | Standard visit XP; purchase XP stacks |
| **Trail stop — resale/antique shop** | 3 | +2 with photo to feed | Any | Geolocation or QR verify |
| **Trail stop — local POI (café, landmark)** | 2 | +2 with photo to feed | Any | Geolocation only; no purchase required |
| **Trail stop — platform-listed business** | 4 | +2 with photo to feed | Any | Partner/listed stop; prioritized in builder |
| **Trail completion bonus** | +40 to +80 (scaled) | — | Any | 3-stop=40, 4=50, 5=60, 6=70, 7=80 XP. All stops checked in. 7-day window. 1x per trail per user. |
| **Seasonal challenge (easy)** | 100 | 1x/season | Any | Attend 3 sales |
| **Seasonal challenge (medium)** | 200 | 1x/season | Any | Complete 3 specialties |
| **Seasonal challenge (hard)** | 300 | 1x/season | Any | 50 purchases in season |
| **Seasonal leaderboard top 10** | 500 | 1x/season | Any | After season ends |
| **Collector passport specialty** | 25 | 200/yr (8 max) | Shopper | Requires 3+ purchases per specialty |
| **Community mentor session** | 25 | 100/mo (4 max) | Any | Peer-reviewed Q&A |
| **Public collection guide** | 50 | One-time per guide | Any | High-effort content |
| **Community valuation** | 10 | 100/mo (10 max) | Any | Peer-reviewed; spam-filtered |
| **7-day streak bonus** | 100 | Once/month | Any | Any purchase, visit, or challenge counts |
| **Streak multiplier (active week)** | 1.2x all earned | Stacks | Any | Weekly bonus during active streak |
| **30-day active anniversary** | 250 | Once/month | Any | Resets each calendar month |
| **Virtual queue on-time** | 10 | 100/mo total | Any | Geolocation + app active at open |
| **Virtual queue early (+15m)** | +5 bonus | Stacks | Any | Demonstrates planning |
| **Virtual queue 3-streak** | +20 | Once/mo | Any | 3+ on-time arrivals same month |
| **Newsletter signup** | 10 | One-time | Any | Onboarding |
| **Completed profile** | 25 | One-time | Any | Photo + bio + preferences |
| **Bounty fulfillment (org-posted)** | 25 | Supply-limited | Any | One per bounty; organizer verifies |
| **Bounty fulfillment (seasonal)** | 50–200 | Per-bounty | Any | Monthly leaderboard; community-voted |
| **[ORGANIZER] First sale posted** | 100 | One-time | Organizer | Activation bonus |
| **[ORGANIZER] Sale published** | 10 | None | Organizer | Each published sale |
| **[ORGANIZER] Shopper on-site signup** | 10 | No cap (first-purchase gate) | Organizer | New shopper must complete first purchase |
| **[ORGANIZER] Haul from your sale** | 3 | None | Organizer | UGC engagement reward |
| **[ORGANIZER] 5-star review received** | 10 | 100/mo | Organizer | Quality feedback signal |

**Features that SHOULD NOT earn XP:**
- Page visits (farming risk)
- Account creation alone (covered by one-time bonuses above)
- Wishlist additions (no measurable outcome)
- Heart/Like a haul (too low-effort)
- Sale listing views (every page load = inflation)
- Organizer inventory edits (operational, not player action)

---

# SECTION 3: XP SINKS TABLE

| Sink | XP Cost | What You Get | Duration | Account gate | Notes |
|------|---------|---|----------|-----------|-------|
| **Rarity boost (1 sale)** | 15 | +2% Legendary odds | Until sale ends | Scout+ | Stackable |
| **Hunt Pass discount** | 50 | $1 off ($4.99→$3.99) | One-time | Scout+ | Bridge free→paid |
| **Custom username color** | 25 | Unlock custom color | Permanent | Ranger+ | One-time |
| **Custom frame badge** | 30 | Rare frame | Permanent | Sage+ | One choice |
| **Haul visibility boost** | 10 | Featured "Trending" | 7 days | Scout+ | Algorithmic boost |
| **Bounty visibility boost** | 5 | Featured "Hot Bounties" | 7 days | Organizer Scout+ | Higher fulfillment odds |
| **Seasonal challenge access** | 100 | Unlock season's challenges + cosmetics | 1 season | Scout+ (non-Hunt Pass only) | Hunt Pass subscribers get this free |
| **Guide publication** | 30 | Publish hunting guide | Permanent | Ranger+ | Free for Sage+; Grandmaster unlimited |
| **Coupon generation** | 50 | Create $1-off coupon (1-use) | 30 days | Organizer Trusted+ | Max 5/month |
| **Early access boost** | 75 | Featured presale visibility | 1 week | Organizer Elite+ | Generates hype |
| **Listings extension** | 100 | +10 item listings | 1 month | Organizer Trusted+ | Beyond plan limit |
| **Event sponsorship** | 150 | Flash sale / themed collection | 3 days | Organizer Elite+ | Exclusive bounties |

---

# SECTION 4: $ RATIO TABLE

| Mechanic | XP Cost | $ Value | Exchange rate | Notes |
|----------|---------|---------|----------|------------|
| **Hunt Pass discount** | 50 XP | $1 off | 50 XP = $1 (0.02 $/XP) | Baseline rate |
| **Rarity boost** | 15 XP | ~$2 expected value | 0.13 $/XP | Luxury tier |
| **Coupon gen (org)** | 50 XP | $1 coupon value | 0.02 $/XP | Cost = value created |
| **Listings extension** | 100 XP | ~$2.99 tier upgrade savings | 0.03 $/XP | Cost avoidance |
| **Early access boost** | 75 XP | ~$15–30 in expected sales | Market-driven | High variance |
| **Seasonal challenge access** | 100 XP | $4.99/mo Hunt Pass equivalent | 0.05 $/XP | Conversion funnel |
| **Hunt Pass free (Grandmaster)** | 0 XP | $4.99/month forever | Priceless | Permanent rank perk (S260) |

**Key rate insight:**
- Baseline: 50 XP = $1 (0.02 $/XP) — Hunt Pass discount
- Luxury: 15 XP ≈ $2 (0.13 $/XP) — rarity boosts command premium because supply is feel-scarce
- Funnel: 100 XP = seasonal access (0.05 $/XP) — mid-tier; intentionally priced to push Hunt Pass conversion

**Ala carte pricing (when buying instead of spending XP):**

| Item | $ price | Notes |
|------|---------|-------|
| Hunt Pass discount | $1.99 | Slightly cheaper than 50 XP implied rate to encourage cash |
| Bounty post (organizer) | $1.99 | Alt to 50 XP spend |
| Haul boost | $0.99 | Low-barrier convenience |
| Bounty boost (shopper) | $0.99 | Alt to 5 XP spend |
| Listings extension | $2.99 | Avoid tier upgrade |
| Early access boost | $3.99 | Presale visibility |

---

# SECTION 5: FINAL LOCKED SPECIFICATIONS

## Rank Thresholds (Board Locked — S388)
- Initiate: 0 XP
- Scout: 500 XP
- Ranger: 2,000 XP
- Sage: 5,000 XP
- Grandmaster: 12,000 XP

## Seasonal Reset (Board Locked — S260)
- Annual reset: January 1, 00:00 UTC
- Soft floor: Drop one tier max (Grandmaster → Sage)
- Scout & Initiate: No tier drop

## Streak Mechanics (Board Locked — S259)
- Weekly streaks (not daily)
- 1.2x XP multiplier on all earned during active streak week
- Resets if user skips full week

## Hunt Pass
- Price: $4.99/month (locked)
- Grandmaster: free forever, survives tier drops (S260)
- Includes: 1.5x XP multiplier, 6h early flash deal access, seasonal challenges + cosmetics, cosmetic frame

## Seasonal System (Rev 2 — Battle Pass eliminated)
- Seasonal challenges: 4 seasons/year
- Hunt Pass subscribers: auto-enrolled, no extra cost
- Non-subscribers: pay 100 XP OR upgrade to Hunt Pass
- No separate seasonal SKU. No $9.99 seasonal product.

## XP Currency (Rev 2 — Single currency)
- One XP pool for all users
- Organizer-specific earning actions award XP (not a separate currency)
- Organizer-specific sinks require organizer account type (not a separate currency)

## XP Spending Model
- Rank floor enforced: `spendableXP = currentXP - rankFloor[currentRank]`
- Grandmaster: infinite spendable buffer
- Cannot drop rank via spending

## Rarity Tiers (Board Locked — S260)
- COMMON / UNCOMMON / RARE / LEGENDARY
- ULTRA_RARE deprecated

## Treasure Trails (Rev 2 — full reframe)
- Trail = curated multi-stop local experience anchored by a FindA.Sale event
- Does NOT require multiple FindA.Sale sales — local spots fill the experience
- Stop types: FindA.Sale events (5 XP), resale/antique shops (3 XP), local POIs/cafes/landmarks (2 XP), platform-listed businesses (4 XP)
- Photo at any stop = +2 XP posted to Loot Legend / social feed (max 1 photo per stop)
- Completion bonus: 3-stop=40 XP, 4=50, 5=60, 6=70, 7=80 XP (max trail length: 7 stops)
- Partial completion: per-stop XP always earned; completion bonus requires all stops; 7-day window from first check-in
- 1 completion bonus per trail per user (no re-farming)
- Trail creation: open (no paywall, no rank gate); organizer-anchored at launch; community trails Phase 2
- Featured trails: organizer request + engagement (saves/completions); editorial review 1–2 day SLA
- Hunt Pass trail perks: trail suggestions, early access to featured trails, own trails prioritized in discovery (NOT creation-gated)
- Organizer earns +15 XP per unique shopper completion (no monthly cap; 1x/user/trail is natural ceiling)
- Google Places API: $200/mo hard cap approved
- Location data: Google Places API for POI search + manual lat/lng fallback
- Verification: FindA.Sale events use existing geofenced check-in; non-sale stops use GPS radius (~100m) + optional photo

## Organizer Signup XP
- Organizer earns 10 XP per new shopper recruited at live sale
- No monthly cap
- Fraud gate: shopper XP posts only after first purchase completed
- Shopper earns 50 XP for being recruited + completing first purchase

---

**Status:** LOCKED — Rev 2 corrections applied. Ready for architect handoff.
**Corrections applied:** Trail XP (50→20 + definition), Dual XP eliminated, Battle Pass SKU removed, Organizer signup cap removed, Purchase XP $1=1 XP validated.
