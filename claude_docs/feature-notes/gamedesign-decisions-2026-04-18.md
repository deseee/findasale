# XP Economy Rebalance — 2026-04-18

Status: LOCKED (Game Designer approval, Patrick authoritative sign-off)
Date locked: 2026-04-18
Reviewed by: Claude Game Designer
Authority: Amends D-XP-004 (2026-04-13) — all other D-XP-004 values unchanged
Supersedes: Skill SKILL.md XP table (outdated — references pre-D-XP-004 values)

---

## Diagnostic Summary

D-XP-004 introduced three balance failures and left one critical gap:

1. **Visit XP (2 XP) — visit path dead.** A shopper visiting 5x/week earns 10 XP/week. Scout via visits alone takes 50 weeks — longer than the purchase path. Geo-check already prevents farming; the XP penalty is solving a problem that doesn't exist.

2. **Haul post (30 XP, no cap) — Scout speedrun.** A haul poster uploading after every visit earns 30 XP per post + 2 XP per visit = 32 XP/event. At 2x/week: Scout in 2.7 months. This is the fastest path in the system by 2x and rewards behavior (quantity posting) rather than quality.

3. **Auction win (15 XP) — undervalued.** Auction wins require competitive bidding — materially more effort than a standard purchase. Flat-purchase XP is 10; auction should be higher, not marginally so.

4. **Challenge XP never locked.** Challenges are the designed escalation mechanism for Ranger+ progression. Without locked values, dev will implement inconsistently. Base-rate-only play gets casual users to Scout; challenges are what get engaged users to Ranger and beyond.

---

## D-XP-007: Visit XP Correction (Locked)

DECISION: Walk-in visit XP restored from **2 XP → 5 XP**.

PLAYER EXPERIENCE: Attending 2 sales in a week feels like real progress — 10 XP is visible on the progress bar. At 2 XP it was invisible, and visit-heavy shoppers felt unrewarded for the hardest behavior to fake.

RATIONALE: The reduction to 2 XP in D-XP-004 was fraud-motivated, but fraud is prevented by the geo-check gate — not by poverty XP. 5 XP per verified visit is the correct floor: meaningful enough to motivate, low enough that visit-spam is never competitive with purchases or haul posts. A 5x/week visitor earns 25 XP/week from visits; a 1x/week buyer earns 40 XP/month from purchases. The ratio is correct — buying outperforms visiting, visits supplement.

IMPACT: MEDIUM (retention — restores the visit path for bargain hunter archetype)

---

## D-XP-008: Haul Post Monthly Cap (Locked)

DECISION: Haul post XP capped at **4 posts per calendar month** (100 XP max from hauls/month). Posts beyond the cap are published normally — no XP awarded after cap is hit.

PLAYER EXPERIENCE: Dedicated haul sharers post their 4 best finds per month and earn full XP. Casual posters who share occasionally aren't affected. No one feels punished — the platform still accepts all posts; only the XP reward has a ceiling.

RATIONALE: Uncapped haul posts at 30 XP allow Scout in 2.7 months for a dedicated poster — faster than any other archetype. The cap enforces that haul posts are a supplement, not the primary path. 4/month (roughly weekly) is natural pacing for genuine haul content; posting 10+ hauls/month is almost certainly volume-first behavior. Haul post XP remains the highest single-action reward in the system after referrals — the cap protects that value.

IMPACT: MEDIUM (balance — closes the fastest path to Scout without touching haul post value perception)

---

## D-XP-009: Auction Win XP (Locked)

DECISION: Auction win XP **15 XP → 20 XP** (flat, no value multiplier).

PLAYER EXPERIENCE: Winning a competitive auction feels decisively better than a standard buy. The 10 XP gap between purchase (10 XP) and auction win (20 XP) is visible and intentional.

RATIONALE: Auction wins require competitive engagement — time spent monitoring, bidding, and winning against other users. The S260 spec explored a value-based multiplier (0.5 XP per $100 capped at +5 XP, max 20). That's eliminated: explaining "your $340 auction win earns 11.7 XP" is dead on arrival for this demographic. Flat 20 XP is clean, memorable, and correctly signals competitive wins matter. Monthly cap from D-XP-004 (100 XP from auction wins/month) stays.

IMPACT: LOW (balance, minor XP economy adjustment)

---

## D-XP-010: QR Scan XP Parity (Locked)

DECISION: QR scan XP **3 XP → 5 XP**.

PLAYER EXPERIENCE: Scanning a QR code at a sale feels equivalent to checking in — because it is. The 3 XP felt like an afterthought.

RATIONALE: QR scan and walk-in visit both require physical presence at a sale. They should earn the same XP. Previously, QR scan (3 XP) was below walk-in visit (2 XP pre-D-XP-007 → 5 XP post). Now both are 5 XP. This removes the "why bother scanning" friction.

IMPACT: LOW (minor UX correction)

---

## D-XP-011: Challenge XP Table (First Lock)

DECISION: Lock challenge XP at the following values. All future challenges must be categorized as Easy, Medium, or Hard at design time. No other values are valid.

| Difficulty | XP | Example |
|------------|----|---------|
| Easy | 50 XP | "Attend 3 sales this month," "Wishlist 5 items" |
| Medium | 150 XP | "Complete a Passport specialty category," "5 purchases in 30 days" |
| Hard | 300 XP | "50 purchases in calendar year," "Attend sales in 3 different regions" |
| Seasonal leaderboard Top 10 | 200 XP | Awarded once after season ends |
| Micro-event completion | 75 XP | Flat across all 8 Phase 1 micro-events |

PLAYER EXPERIENCE: Challenge effort and reward are legible. Players see "Easy: 50 XP" and calibrate quickly. No challenge feels like a lottery and no challenge feels trivial.

RATIONALE: Challenge XP was never formally locked — dev would have guessed values. The locked table creates a consistent design language: Easy ≈ 5 purchases equivalent, Medium ≈ 15 purchases, Hard ≈ 30 purchases. These are also the designed escalation path to Ranger+. A casual buyer (1 purchase + 1 visit/week) earns ~62 XP/month in base activities — Scout in 8 months, Ranger in 32 months. WITH quarterly challenge participation (1 Medium per quarter = +50 XP/month amortized), Ranger drops to ~18 months. Challenges aren't optional boosts — they are the mechanism for Ranger-level progression. This must be reflected in onboarding copy.

IMPACT: HIGH (product — locks previously undefined values; directly affects time-to-rank for Ranger and above)

---

## Revised Earning Table (Full Reference — Post Rebalance)

Supersedes the table in SKILL.md findasale-gamedesign (that table reflects pre-D-XP-004 values).

| Activity | XP | Notes |
|----------|----|-------|
| Purchase (any) | 10 XP | D-XP-004, unchanged |
| Auction win | **20 XP** | D-XP-009 (was 15) |
| Walk-in visit / check-in | **5 XP** | D-XP-007 (was 2) |
| QR code scan | **5 XP** | D-XP-010 (was 3) |
| Haul post | 25 XP | D-XP-008 (was 30, cap 4/month) |
| Referral (friend's first purchase clears) | 500 XP | D-XP-004, unchanged |
| Appraisal submitted | 5 XP | D-XP-004, unchanged |
| Appraisal selected by seller | 20 XP | D-XP-004, unchanged |
| Seller review | 5 XP | D-XP-004, unchanged |
| Challenge — Easy | **50 XP** | D-XP-011 (first lock) |
| Challenge — Medium | **150 XP** | D-XP-011 (first lock) |
| Challenge — Hard | **300 XP** | D-XP-011 (first lock) |
| Micro-event completion | **75 XP** | D-XP-011 (first lock) |
| Seasonal leaderboard Top 10 | **200 XP** | D-XP-011 (first lock) |

**Monthly XP caps (where applicable):**
- Haul posts: 4/month max (100 XP max from hauls)
- Auction wins: 100 XP/month max (D-XP-004, unchanged)
- Appraisal submissions: 50 XP/month max (D-XP-004, unchanged)

---

## Progression Check (Post-Rebalance)

Base rates only (no challenges, no referrals):

| Archetype | Monthly XP | Scout | Ranger | Sage |
|-----------|-----------|-------|--------|------|
| Casual buyer (1 buy/wk, 1 visit/wk) | 62 XP | 8.1mo ✓ | 32mo ← challenge-dependent | — |
| Standard shopper (2 buys/wk, 2 visits/wk) | 123 XP | 4.1mo ✓ | 16.2mo ✓ | 40.6mo ✓ |
| Bargain hunter (5 visits/wk, 2 buys/mo) | 128 XP | 3.9mo ✓ | 15.6mo ✓ | 39mo ✓ |
| Haul poster (1 buy/wk, 2 visits/wk, 4 hauls/mo) | 183 XP | 2.7mo ✓ | 10.9mo ✓ | 27.3mo ✓ |

With 1 Medium challenge per quarter (+50 XP/mo amortized):
- Casual buyer: Ranger in 17.9 months ✓
- This is intentional design. Base rates = Scout path. Challenges = Ranger+ path.

---

## Implementation Checklist

- [ ] Update `xpConfig` or equivalent constants: visit 2→5, auction 15→20, qr 3→5, haul 30→25
- [ ] Add `monthlyHaulPostCount` tracking per user; cap XP grant after 4 posts/month
- [ ] Add challenge difficulty enum: `EASY | MEDIUM | HARD | MICRO_EVENT`
- [ ] Wire XP grants to difficulty enum at challenge completion (no hardcoded per-challenge values)
- [ ] Update SKILL.md gamedesign XP table (outdated — reflects pre-D-XP-004 values)

---

---

## D-XP-012: Custom Map Pin Repricing (Locked)

DECISION: Custom Map Pin (organizer cosmetic): **75 XP → 500 XP**.

RATIONALE: The 75 XP price predated D-XP-005's cosmetic repricing pass and was never updated. At 75 XP it's an impulse buy — inconsistent with the "cosmetics are high-effort sinks" philosophy (username color = 1,000 XP; showcase slot = 250–500 XP). Map pin is an organizer-facing listing cosmetic; 500 XP matches the lower end of the showcase slot tier and feels appropriately earned.

IMPACT: LOW

---

## D-XP-013: Haul Visibility Boost Repricing (Locked)

DECISION: Haul Visibility Boost: **25 XP → 10 XP**. Description corrected to "Bump your haul post to the top of the local feed for 2 hours." Cash rail updated to $0.10.

RATIONALE: D-XP-006 explicitly locked "Bump a Post" at 10 XP. The page had 25 XP, which either predated D-XP-006 or was set independently. The correct value is the locked decision. Description was also vague ("Feature as Trending") — updated to match the actual mechanic (feed bump, 2h window).

IMPACT: LOW

---

## D-XP-014: Walk-in Visit Cap Removed (Locked)

DECISION: No daily cap on walk-in visit XP. A shopper who visits 5 sales in a day earns 5 × 5 XP = 25 XP. The only constraint is **once per unique sale per day** (re-checking into the same sale earns no additional XP). Geo-check is the fraud gate, not a visit ceiling.

RATIONALE: A daily cap punishes exactly the behavior we want — people who show up to multiple sales. Anyone visiting 5 estate sales in a day is the platform's best user. The geo-check on each unique sale location prevents farming; no additional XP ceiling needed.

IMPACT: LOW (positive for retention — heavy visitors feel correctly rewarded)

---

**Decision Authority:** Claude Game Designer, FindA.Sale
**Amends:** D-XP-004, D-XP-005, D-XP-006 (2026-04-13)
**All other decisions from 2026-04-13 unchanged and remain locked**
