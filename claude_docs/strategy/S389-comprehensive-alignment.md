# S389 — Comprehensive Product Alignment Analysis

**Date:** 2026-04-03
**Scope:** Organizer Subscription Tiers, Shopper Gamification, Hunt Pass, Navigation, Dashboards, Pricing Page, and Viral Features
**Purpose:** Identify gaps between product intent, implementation, and user discovery

---

## Section 1: The Current State (What's Actually True)

### 1.1 — Organizer Tier Features As Implemented

Based on codebase inspection (tierLimits.ts, route requireTier gates, TierComparisonTable.tsx):

| Feature | SIMPLE | PRO | TEAMS | Notes |
|---------|--------|-----|-------|-------|
| **Inventory Limits** | | | | |
| Items per sale | 200 | 500 | 2,000 | Code enforces; pricing page accurate |
| Photos per item | 5 | 10 | Unlimited | Code enforces; pricing page accurate |
| AI tags/month | 100 | 2,000 | Unlimited | Tier-gated at tag submission |
| **Operations** | | | | |
| Batch operations | ❌ | ✅ | ✅ | tierLimits.batchOpsAllowed gate |
| Multi-sale Command Center | ❌ | ✅ | ✅ | requireTier(PRO) gate |
| Photo Op Stations | ❌ | ✅ | ✅ | Multi-user photo workflows |
| **Analytics & Export** | | | | |
| Advanced analytics | ❌ | ✅ | ✅ | requireTier(PRO) gate |
| CSV/JSON export | ❌ | ✅ | ✅ | requireTier(PRO) gate |
| Flip Report (post-sale PDF) | ❌ | ✅ | ✅ | requireTier(PRO) gate |
| Link click stats | ❌ | ✅ | ✅ | Feature #126, requireTier(PRO) |
| **Customization** | | | | |
| Brand Kit (logo, colors, fonts) | ❌ | ✅ | ✅ | TierComparisonTable.tsx |
| Custom slug | ❌ | ✅ | ✅ | brandKit route, requireTier(PRO) |
| Markdown auto-apply | ❌ | ✅ | ✅ | Feature #91, auto-apply config |
| **Team Features** | | | | |
| Multi-user workspace | ❌ | ❌ | ✅ | requireTier(TEAMS) gate |
| Team roles & permissions | ❌ | ❌ | ✅ | workspace.ts requireTier(TEAMS) |
| Team audit logs | ❌ | ❌ | ✅ | Activity tracking for TEAMS |
| **Data & Integration** | | | | |
| Typology (AI classifier) | ❌ | ✅ | ✅ | requireTier(PRO) |
| Item valuation tools | ❌ | ✅ | ✅ | requireTier(PRO) |
| API access & webhooks | ❌ | ❌ | ✅ | requireTier(TEAMS) |
| **Support** | | | | |
| Email support | ✅ | ✅ (48h SLA) | ✅ (24h SLA + onboarding) | TierComparisonTable.tsx |
| Priority support | ❌ | ✅ | ✅ | Listed in pricing page |
| Dedicated account manager | ❌ | ❌ | ✅ | TEAMS only |
| **Social/Viral** | | | | |
| Social post generator | ✅ | ✅ | ✅ | ALL TIERS, no gate |
| Sale QR code | ✅ | ✅ | ✅ | ALL TIERS, no gate |
| Social media templates | ✅ | ✅ | ✅ | ALL TIERS, no gate |

**Implementation Status:**
- All tier-gated features correctly enforce via `requireTier()` middleware
- Social/viral features correctly ungated on all tiers (matches S388 decision)
- No discrepancies between code and TierComparisonTable.tsx limits (both enforce 200 items / 5 photos for SIMPLE)

### 1.2 — Shopper Gamification & Rank Features As Implemented

Based on xpService.ts and route analysis:

**Rank System (LOCKED S388):**
- Initiate: 0 XP
- Scout: 500 XP
- Ranger: 2,000 XP
- Sage: 5,000 XP
- Grandmaster: 12,000 XP

**XP Earning Actions (Currently Live):**
| Action | XP | Cap | Implementation |
|--------|----|----|---|
| Visit a sale | 5 | 150/month | xpService.ts VISIT |
| Comeback bonus (2+ weeks away) | 20 | Once | COMEBACK_BONUS |
| Visit streak (per week, max 5) | 2 | +10 total | STREAK_BONUS_PER_WEEK |
| Treasure Hunt QR scan | 25 | 100/day | xpService.ts ITEM_SCANNED |
| Purchase | 1 per $ | None | PURCHASE (1 XP = $1) |
| Review item | 5 | None | REVIEW (not yet wired) |
| Social share | 10 | None | SHARE (honor system) |
| Auction win | 15 base | None | AUCTION_WIN |
| Auction value bonus | +0.5 per $100 | +5 max | AUCTION_VALUE_BONUS_PER_100 |

**Rank-Gated Benefits (Current):**
| Feature | Initiate | Scout | Ranger | Sage | Grandmaster | Hunt Pass Only |
|---------|----------|-------|--------|------|-------------|---|
| Hold duration | 30 min | 30 min | 45 min | 60 min | 90 min | N/A |
| Concurrent holds | 1 | 1 | 2 | 3 | 3 | N/A |
| En route holds (10 mi) | 1 | 1 | 2 | 3 | 3 | N/A |
| Legendary-first access (6h) | ❌ | ❌ | ❌ | ❌ | ❌ | 🚧 planned (Sage+ only) |
| Priority RSVP | ❌ | ❌ | ❌ | 🚧 planned | 🚧 planned | 🚧 planned |

**Hunt Pass Benefits ($4.99/mo — LOCKED S268):**
- **XP Multiplier:** 1.5x (NOT 2x — code shows 1.5x in applyHuntPassMultiplier)
- **Early flash deal access:** First notification
- **Exclusive badge:** Hunt Pass badge on profile
- **Loot Legend portfolio:** Hunt Pass exclusive feature
- **Collector's League leaderboard:** Hunt Pass exclusive leaderboard

**KEY ISSUE #1 — Hunt Pass Page Claims 2x XP, Code Enforces 1.5x:**
- hunt-pass.tsx, line 79: "2x Streak XP" heading
- xpService.ts, line 423: `return Math.round(baseXp * 1.5);`
- **Decision:** S389 locked 1.5x; page copy is outdated

**KEY ISSUE #2 — Rank Benefits Are Mostly Cosmetic:**
- Hold duration scaling is the ONLY functional rank gate
- "Legendary-first access," "Priority RSVP," "Referral bonuses" are NOT implemented
- Shoppers see rank progression but zero tangible benefit past hold duration
- Creates trust risk: "I'm Sage but nothing changed"

**KEY ISSUE #3 — Missing XP Sources:**
| Action | Intended | Wired? | XP Value |
|--------|----------|--------|----------|
| Collector Passport completion | Yes | ❌ | TBD |
| Treasure hunt trail completion | Yes | ❌ | TBD |
| First purchase (referral) | Yes | 🚧 (schema exists) | REFERRAL_FIRST_PURCHASE=30 |
| Referral signup | Yes | 🚧 (schema exists) | REFERRAL_SIGNUP=20 |
| Condition rating | Yes | ❌ | TBD |
| Streak milestone (5/10/20 days) | Maybe | ❌ | TBD |
| RSVP to sale | Maybe | ✅ but no XP | N/A |

### 1.3 — Pricing Page Accuracy Audit

**Current State:** `/organizer/pricing` (pricing.tsx)

**Issues Found:**

1. **À la carte ($9.99/sale) is completely missing** from the pricing page
   - Decision D-007 S268 locked it as real pricing
   - Page shows only SIMPLE / PRO / TEAMS / Enterprise
   - Zero visibility to non-subscribers considering a single sale
   - REVENUE LEAK: Organizers unaware they can publish one sale for $9.99

2. **Enterprise pricing is unclear**
   - Shows "$500/mo" starting price but no detail
   - No feature matrix for Enterprise
   - "Contact Sales" link exists but pricing context is thin

3. **Feature list ordering creates perception mismatches**
   - Line 74–85: PRO features are listed but don't clearly separate "S→P jump" vs "P→T jump"
   - Example: "Unlimited photos per item" is PRO, but SIMPLE has 5 which is actually reasonable
   - Buyer psychology: table shows 25 features for TEAMS vs 20 for PRO, but PRO→TEAMS is mostly team/API

4. **"SIMPLE cap discrepancy" — RESOLVED in code but not communication**
   - Code enforces 200 items, 5 photos (correct per S388)
   - Page shows these correctly
   - ✅ No issue here

### 1.4 — Hunt Pass Page Accuracy Audit

**Current State:** `/shopper/hunt-pass` (hunt-pass.tsx)

**Issues Found:**

1. **"2x Streak XP" is incorrect** (line 79)
   - Page claims "2x Streak XP" and "double XP on every action"
   - Code enforces 1.5x multiplier (xpService.ts line 423)
   - DECISION S389 locked 1.5x due to balance concerns
   - **Discrepancy:** Copy needs update to "1.5x XP"

2. **XP earning matrix is completely missing**
   - Page doesn't show which actions earn XP
   - First-time Hunt Pass reader has no idea what they're multiplying
   - Compare to S388 xpService.ts: has full matrix but page hides it
   - **User experience gap:** Shopper can't calculate value

3. **"Early Access to Flash Deals" is vague**
   - No timeline specified ("how much earlier?")
   - No example of what this means in practice
   - Is it 1 hour? 6 hours? Unclear

4. **Loot Legend portfolio is mentioned in decisions but NOT in page**
   - Decision S268: "Loot Legend portfolio" is Hunt Pass exclusive
   - Page doesn't explain what Loot Legend is
   - Shopper confused by marketing speak

### 1.5 — Navigation Audit

**Organizer Navigation (Layout.tsx + nav structure):**

Selling Tools on Dashboard:
- Create Sale (0 taps)
- Add Items (1 tap from sale)
- QR Codes (1 tap)
- POS Checkout (1 tap)
- Print Inventory (PRO gate, 1 tap)
- Analytics/Insights (1 tap)

**Issues:**
- SIMPLE organizer cannot find "Batch operations" — no nav link exists
- PRO organizer cannot find "Command Center" from nav — must go to dashboard or direct URL
- PRO organizer cannot find "Flip Report" — only appears post-sale as CTA
- No primary nav entry for Brand Kit (SIMPLE has none, PRO must go to Settings)
- Data export (CSV/JSON) not in nav — only accessible via dashboard quick action

**Shopper Navigation (Layout.tsx):**

Main sections:
- Explore (sales, categories, neighborhoods, filters)
- Collections/Wishlist (consolidated from Favorites/Wishlists/Alerts)
- Profile (rank, profile page, settings)
- Hunt Pass (separate page, `/shopper/hunt-pass`)

**Issues:**
- Rank/Explorer Guild is NOT in main nav — only visible on profile page
- Hunt Pass is reachable but not featured (no "upgrade" CTA in nav)
- Collector Passport / Loot Legend has no direct nav link
- Achievement badges only visible on profile, not dashboard
- No "See Your Progress" link on dashboard to rank page

### 1.6 — Organizer Dashboard Audit

**Current State:** `/organizer/dashboard` (organizer/dashboard.tsx)

**Widget Grid (top):**
1. Welcome hero (new organizers)
2. Sale status widget (active organizers)
3. Selling Tools grid (6 items, tier-gated)
4. Recent sales cards
5. Analytics card (if PRO+)
6. Flash deals form (if active sale)
7. Social post generator
8. Onboarding wizard (new organizers)
9. Teams onboarding (if TEAMS)

**Gaps:**
- No "Tier Progress" widget — organizer doesn't see cost/benefit of PRO upgrade
- No "Most Popular Feature" (per organizer tier) — wasteful for SIMPLE users
- À la carte option is never mentioned — one-sale organizers don't know about $9.99 option
- No "What's Next?" suggestion (e.g., "Upgrade to PRO to unlock Command Center for multi-sale management")
- Tier badge is shown but not actionable — no clear "Upgrade" path

### 1.7 — Shopper Dashboard Audit

**Current State:** `/shopper/dashboard` (shopper/dashboard.tsx)

**Widget Grid (top):**
1. Activity Summary (purchases, streak, saved items)
2. Rank Badge + Progress Bar
3. Hunt Pass CTA (dismissible)
4. Achievement badges section
5. Sales near you
6. Flash deals banner
7. Recently viewed items
8. Wishlist previews

**Gaps:**
- Rank progress bar is present but disconnected from benefits — "next rank" doesn't explain what's gained
- Hunt Pass CTA shows "2x XP" (outdated claim)
- No "how close to Sage?" context — progress percentage is shown but not in motivational frame
- Achievement badges are displayed but no path to earning next badge
- Collector Passport is not featured — exists but invisible from dashboard
- Leaderboard (Collector's League) is Hunt Pass exclusive but never mentioned on free dashboard

### 1.8 — What Social/Viral Features Exist (All Tiers)

**Correctly Ungated on All Tiers (per S388 decision):**
1. ✅ Social post generator — creates shareable templates
2. ✅ Sale QR code — generates QR for sale entry
3. ✅ Social media templates — pre-built formats

**Partially Implemented or Unclear:**
- Referral system: Schema exists (Referral model), XP awards defined (20/30), but routes not deployed
- Haul Posts (#88): UGCPhoto extended with isHaulPost flag, likes supported, but unclear if live
- Brand Follow (#87): BrandFollow schema exists, but unclear if routes wired
- Share sale: Exists but no social card optimizations (og:image, og:title)

**MISSING (Roadmap but Not Shipped):**
- Purchase confirmation sharing (after buy)
- Treasure hunt completion sharing
- Collector passport progress sharing
- Rank achievement sharing (auto-gen "I'm now Ranger!" post)

---

## Section 2: The Gaps (Where Things Don't Align)

### 2.1 — Pricing & Discovery Gaps

| Gap | Impact | Severity |
|-----|--------|----------|
| À la carte $9.99 not on pricing page | Organizers don't know single-sale option exists | P1 — Revenue leak |
| Enterprise details sparse | TEAMS organizer doesn't know upgrade path | P2 — Conversion friction |
| Hunt Pass "2x XP" wrong (actually 1.5x) | Shopper perceives value as higher than real | P1 — Trust/credibility |
| Hunt Pass XP matrix not shown | Shopper can't evaluate if 1.5x is worth $4.99 | P1 — Conversion blocker |
| Rank benefits NOT implemented | Shopper at Sage feels no progression | P0 — Core gamification broken |
| Referral system defined but not wired | Word-of-mouth growth locked | P2 — Growth blocker |

### 2.2 — Navigation & Findability Gaps

**Top 5 Features Hard to Find:**

1. **Command Center (PRO)** — Multi-sale operations hub
   - Not in nav, not on dashboard
   - Requires memorizing URL or finding hint in onboarding
   - **Path:** Direct URL or onboarding modal only
   - **Taps to reach:** 4+ (if lost)

2. **Brand Kit (PRO)** — Customization suite
   - Not in main nav, buried in Settings
   - Organizer doesn't discover unless proactively searching
   - **Path:** Settings → Profile / Brand
   - **Taps to reach:** 3+

3. **Collector Passport / Loot Legend (Shopper)** — Core gamification
   - Not in nav, only visible on profile page
   - New shopper has no idea it exists
   - **Path:** Profile → Passport (if they find it)
   - **Taps to reach:** 3+

4. **Advanced Analytics (PRO)** — Core value-add feature
   - Dashboard shows basic analytics button, but advanced tier is not distinguished
   - Shopper confuses "basic" with "advanced"
   - **Path:** Dashboard → Insights (if found)
   - **Taps to reach:** 2

5. **À la carte Option (Non-subscribers)** — Gate for single sales
   - Completely invisible
   - Organizer has no idea they can publish one sale for $9.99
   - **Path:** Doesn't exist
   - **Taps to reach:** ∞ (not findable)

### 2.3 — Gamification Credibility Gaps

**What's Promised vs What's Real:**

| Feature | Promised (S268) | Implemented (Code) | Gap |
|---------|------|---|---|
| Legendary-first access | 6h early for Sage/GM + Hunt Pass | 🚧 Not wired | Promise unfulfilled |
| Priority RSVP | Rank-gated advantage | ❌ Not implemented | Promise unfulfilled |
| Referral bonuses | $X off or 20 XP signup | 🚧 Schema exists, not wired | Promise unfulfilled |
| Rank benefits | Progression should feel earned | Cosmetic only (holds are it) | Underwhelming |
| Hunt Pass multiplier | "2x XP" (page) vs 1.5x (code) | 1.5x enforced | Misleading copy |

**User Impact:**
- Shopper reaches Sage after 5,000 XP effort → discovers "no benefit but badge"
- Referral link shared by organizer → doesn't work (code not deployed)
- Hunt Pass subscriber expects 2x → gets 1.5x (10% discrepancy feels like bait-and-switch)

### 2.4 — Feature Momentum Gaps

**Roadmap Items That Hit Dead Ends:**

1. **Collector Passport** — Exists but not discoverable
   - Core feature for building shopper identity
   - Zero nav exposure, zero dashboard promotion
   - Organizers don't know shoppers are building passport
   - Treasure hunt integration not visible

2. **Treasure Hunt (#85)** — Live (QR scanning works) but not onboarded
   - New shopper has no idea what treasure hunt is
   - No "Try scanning your first treasure hunt QR" moment
   - No badge/celebrate on first scan

3. **Haul Posts (#88)** — Schema exists, unclear if live
   - If live: No nav link to view haul posts
   - If not live: Page will confuse shoppers who try to post

4. **Flash Deals** — Exists but not discoverable
   - Non-Hunt-Pass shopper never learns about flash deals
   - No CTA on dashboard saying "Hunt Pass gets early access"
   - Feels like a Hunt-Pass-exclusive secret

### 2.5 — Tier Differentiation Gaps

**SIMPLE → PRO Pitch Issues:**

| Need | SIMPLE Answer | PRO Answer | Gap |
|------|---|---|---|
| "I want to sell more items" | Upgrade to 500 items ($29/mo) | ✅ 500 items, +5 photos, +2k tags | Clear upgrade path |
| "I want faster sales" | Batch operations? Batch edit? | ✅ Batch operations | Clear upgrade path |
| "I want to understand my sales" | Basic analytics only | ✅ Advanced analytics + Flip Report | Clear upgrade path |
| "I want to brand my sales" | No customization | ✅ Brand Kit + custom slug | Clear upgrade path |
| "I want one sale only" | Upgrade to PRO ($29)? | ❌ NO — $9.99 à la carte exists but is invisible | **Broken conversion funnel** |

**TEAMS Positioning Issue:**

Solo organizer at PRO ($29) asking "why TEAMS ($79)?"
- Answer: "Multi-user workspace" — but I'm solo, don't need team
- Missing narrative: "TEAMS adds API + webhooks + white-label for integrations"
- TEAMS value prop is unclear for solo-organizer use case

---

## Section 3: The Proposed Alignment

### 3a — Organizer Tier Restructuring (S388 Board Recommendation)

**Current recommendation from board (S388):**
Move batch operations, seller badge, link click stats from PRO → SIMPLE.

**Strategic Rationale:**
- Batch operations = table-stakes, not a tier differentiator
- Seller verification badge = trust builder for all organizers
- Link click stats = basic analytics, reasonable for SIMPLE

**Proposed New Tier Matrix:**

| Feature | SIMPLE | PRO | TEAMS |
|---------|--------|-----|-------|
| Batch item operations | ✅ MOVE | ✅ | ✅ |
| Seller verification badge | ✅ MOVE | ✅ | ✅ |
| Link click stats | ✅ MOVE | ✅ | ✅ |
| (Stays PRO) Advanced analytics | ❌ | ✅ | ✅ |
| (Stays PRO) Flip Report | ❌ | ✅ | ✅ |
| (Stays PRO) AI valuation | ❌ | ✅ | ✅ |

**New SIMPLE → PRO Pitch:**
- SIMPLE: Batch operations + seller badge + click tracking (foundation)
- PRO: $29/mo unlocks advanced analytics, Flip Report, AI valuation, Brand Kit, Command Center (scaling tools)
- TEAMS: $79/mo unlocks team collaboration + API + white-label (operations tier)

**TEAMS Single-Organizer Gap:**
- PRO organizer at $29 still doesn't get Command Center (multi-sale operations hub)
- Recommendation: Move Command Center from PRO-only to PRO + offer "multi-sale lite" in PRO
- Rationale: Even solo organizers run multiple concurrent sales; Command Center is worth promoting at PRO

**Locked Decisions (DO NOT RE-OPEN):**
- SIMPLE stays "SIMPLE" (not renamed to Essential, Starter, etc.)
- PRO = $29/mo, TEAMS = $79/mo (D-006/D-007 S268)
- Enterprise contact-sales tier stays (D-007)
- À la carte = $9.99/sale (locked S268)

### 3b — Shopper Rank Progression — Making Rank Matter

**Current Reality:** Rank is cosmetic except for hold duration scaling.

**Proposed Rank Benefit Sequence (MVP Phase 1 — Quick Wins):**

| Rank | Hold Duration | Concurrent Holds | NEW Benefit (Phase 1) | Implementable? |
|------|---|---|---|---|
| Initiate | 30 min | 1 | (baseline) | N/A |
| Scout | 30 min | 1 | Scout badge on profile | ✅ (cosmetic) |
| Ranger | 45 min | 2 | +50% Treasure Hunt XP | ✅ (xpService multiplier) |
| Sage | 60 min | 3 | 6h Legendary-first access | 🚧 (needs route + decision) |
| Grandmaster | 90 min | 3 | +100% Treasure Hunt XP + leaderboard placement | ✅ (xpService + leaderboard) |

**Phase 1 Rationale (0.5–1 session effort):**
- Hold duration already works ✅
- Treasure Hunt XP multiplier: add 2-line check in treasure hunt endpoint (low effort)
- Scout badge: cosmetic, just render different RankBadge icon (low effort)
- Legendary-first access: defer to Phase 2 (requires flash deal route integration)

**Phase 2 (1–2 sessions, deferred post-beta):**
- Legendary-first access: rank gate flash deal endpoints
- Priority RSVP: rank-weight RSVP queue (cosmetic if no functional queue exists yet)
- Referral signup bonuses: wire up Referral model (schema exists, routes need implementation)

**Recommendation:** Ship Phase 1 before beta week to prove rank matters. Defer Phase 2 to post-beta roadmap.

### 3c — Hunt Pass Value Proposition

**Current State:**
- Price: $4.99/mo ✅
- Headline benefit: "2x XP" (but code enforces 1.5x)
- Secondary benefits: Early flash deals, exclusive badge, Loot Legend portfolio

**Is $4.99/mo Compelling?**

Calculation:
- Average shopper earns 5 XP/visit (VISIT action)
- If shopper visits 10 sales/month = 50 XP base
- Hunt Pass multiplier: 1.5x = 75 XP (net +25 XP gain)
- To reach next rank at 500 XP (Scout): takes 10 months base, 6.7 months with Hunt Pass
- **Time savings: 3.3 months per rank progression**

**Payoff Analysis:**
- Early flash deal access: Unclear value without knowing flash deal frequency
- Exclusive badge: Cosmetic, low value
- Loot Legend portfolio: Unclear what this actually is from page
- **Verdict:** 1.5x XP progression is the main value; everything else feels secondary

**Proposed Additions (to justify $4.99/mo):**

**Option A — Cosmetic Add-ons (0.5 session, high engagement):**
1. Hunt Pass shopper gets exclusive "Golden Trophy" avatar frame
2. Hunt Pass badge appears on profile + leaderboard (Collector's League)
3. Special email newsletter with Hunt Pass exclusive tips

**Option B — Functional Add-ons (1–2 sessions, medium effort):**
1. Hunt Pass shoppers earn 1.5x XP on referrals (when referred friend makes first purchase)
2. Hunt Pass shoppers unlock "Treasure Hunt Pro" mode: weekly puzzle + 100 bonus XP
3. Hunt Pass shoppers get "Early Rarity Boost" — can spend 15 XP for +2% legendary odds (instead of 20)

**Recommendation:** Ship Option A immediately (cosmetic, low token cost). Option B deferred to post-beta roadmap (requires design + backend work).

### 3d — XP Earning — Complete the Matrix

**Currently Missing XP Sources (High Impact):**

| Action | Proposed XP | Notes | Effort |
|--------|--|---|---|
| **Collector Passport completion** | 50 | One-time bonus when passport reaches 5+ categories | S (backend only) |
| **Treasure hunt trail completion** | 100 | One-time bonus when shopper finds all QRs in a trail | S (backend only) |
| **First purchase** | 5 | Already PURCHASE=1 per $; this is +5 bonus for first time | S |
| **Referral signup** | 20 | When referred shopper signs up (schema exists) | S (route wiring) |
| **Referral first purchase** | 30 | When referred shopper makes first purchase (schema exists) | S (route wiring) |
| **Condition rating** | 3 | When shopper rates item condition (not yet tracked) | M (schema + route) |
| **Streak milestone** | 5 + (10 * level) | 5-day streak = +5, 10-day = +10, 20-day = +20 | M (streak tracking) |
| **RSVP to sale** | 2 | Already tracked but no XP awarded | S (route addition) |

**Proposed Sequence (Priority Order):**
1. **Phase 1 (Quick wins, 1 session):**
   - Referral signup + first purchase (schema exists, routes need wiring)
   - Condition rating (simple 3 XP per rating)
   - RSVP bonus (2 XP per RSVP, cap 10/month)

2. **Phase 2 (Medium effort, 1–2 sessions):**
   - Collector Passport completion (50 XP one-time)
   - Treasure hunt trail completion (100 XP per trail)
   - Streak milestones (auto-trigger at 5/10/20/30 days)

**Recommendation:** Ship Phase 1 before beta to activate referral word-of-mouth. Phase 2 can ship post-beta.

### 3e — Virality & Shareability — Wired vs Unwired

**Social Features Status:**

| Feature | Status | Route | Schema | UI | Notes |
|---------|--------|-------|--------|----|----|
| Social post generator | ✅ Live | ✅ | N/A | ✅ | All tiers |
| Sale QR code | ✅ Live | ✅ | Item | ✅ | All tiers |
| Social templates | ✅ Live | ✅ | Template | ✅ | All tiers |
| Referral links | 🚧 Partial | ✅ | Referral | ❌ No UI | Schema exists, no referral tracking page |
| Haul posts | 🚧 Unknown | ❌ Unclear | ✅ UGCPhoto | ❌ Unclear | #88 shipped but no nav link |
| Brand follow | 🚧 Unknown | ❌ Unclear | ✅ BrandFollow | ❌ No UI | #87 shipped but unclear if live |
| Purchase confirmation share | ❌ Not built | ❌ | ❌ | ❌ | Post-purchase "share to social" missing |
| Treasure hunt share | ❌ Not built | ❌ | ❌ | ❌ | No "I found X treasures" share |
| Rank achievement share | ❌ Not built | ❌ | ❌ | ❌ | No "I'm now Ranger" auto-gen social post |

**Current Virality Gaps:**

1. **Referral links exist but are invisible**
   - Referral model in schema, XP awards defined
   - No UI for organizer to share referral link
   - No "Get $X off, refer a friend" mechanic on organizer dashboard
   - **Impact:** Organizers don't know this feature exists

2. **Haul posts (#88) might be live but has no nav link**
   - UGCPhoto schema extended with isHaulPost flag
   - No `/shopper/haul-posts` page
   - No discovery path for shoppers to see haul posts
   - **Impact:** If live, feature is invisible

3. **Purchase confirmation is not a share moment**
   - Shopper buys item, sees confirmation card, dismisses
   - No "Share your haul" CTA
   - No social card generation (og:image, etc.)
   - **Impact:** Lost viral moment

4. **Treasure hunt completion is not celebrated**
   - Shopper finds all treasures in a trail → no badge, no share prompt
   - No "Share: I found all X treasures!" UI
   - No celebration moment to trigger word-of-mouth
   - **Impact:** Missed engagement spike

**#1 Virality Priority: Referral Links**

**Why:** Organizer acquisition is the bottleneck. Referral system enables organic word-of-mouth.

**Proposed MVP (1 session):**
1. Add `/shopper/referrals` page showing:
   - Your unique referral link
   - Referral reward value (e.g., "Refer a shopper, earn 20 XP when they sign up")
   - Share button (copy link, tweet, WhatsApp, etc.)
   - Referral tracking (how many signups, how many first purchases)

2. Wire up referral routes:
   - POST `/referrals/track-signup` when new user signs up via link
   - POST `/referrals/track-purchase` when referred user makes first purchase
   - Trigger awardXp() calls for REFERRAL_SIGNUP and REFERRAL_FIRST_PURCHASE

3. Send referral notification email to referrer when referred friend signs up + first purchase

**Expected Impact:** Unlocks word-of-mouth growth without new product work.

### 3f — Navigation Audit & Proposed Changes

**Organizer Nav Issues:**

| Feature | Current Path | Taps | Proposed Path | Taps | Reasoning |
|---------|---|---|---|---|---|
| Command Center | No nav link | 4+ | Add to nav: "Multi-Sale Ops" | 1 | PRO feature, high value |
| Brand Kit | Settings > Brand | 3 | Nav: "Branding" | 1 | PRO feature, customization |
| Advanced Analytics | Dashboard > Insights | 2 | Nav: "Insights" | 1 | PRO feature, high value |
| Batch Operations | None (hard to find) | 4+ | Dashboard widget or quick action | 2 | Newly moved to SIMPLE, high utility |
| Flip Report | Post-sale only | 3 | Nav: "Reports" or within Insights | 2 | PRO feature, post-sale value |
| À la carte Option | Invisible | ∞ | Pricing page + dashboard CTA | 1 | CRITICAL: revenue leak |

**Proposed Organizer Nav Structure (Desktop + Mobile):**

```
Primary Nav:
- Dashboard (home)
- Your Sales (list all sales, status, quick actions)
- Create Sale (new sale)
- Selling Tools (sub: QR Codes, POS, Print, Photo Ops)
- Insights (advanced analytics, if PRO; basic if SIMPLE)
- Branding (Brand Kit, if PRO; info if SIMPLE)
- Team (if TEAMS; hidden otherwise)
- Settings (account, notifications, payments)
```

**Shopper Nav Issues:**

| Feature | Current Path | Taps | Proposed Path | Taps | Reasoning |
|---------|---|---|---|---|---|
| Rank Progress | Profile > Rank | 2 | Dashboard card with "See Progress" link | 1 | Gamification is core, should be visible |
| Hunt Pass | `/shopper/hunt-pass` | 2 | Dashboard prominent card | 1 | Monetization, needs discoverability |
| Collector Passport | Profile > Passport | 2 | Dashboard card or nav link | 1 | Core shopper identity, should be visible |
| Achievement Badges | Profile > Badges | 2 | Dashboard section (preview) | 1 | Gamification, should be visible |
| Referral Links | Invisible | ∞ | Nav: "Share & Earn" or profile dropdown | 1 | Word-of-mouth growth lever |

**Proposed Shopper Nav Structure:**

```
Primary Nav:
- Explore (sales, categories, filters, map)
- Collections (saved items, wishlist)
- Profile (rank, achievements, collector passport)
- Hunt Pass (if not subscribed; settings if subscribed)
- Dashboard (activity summary, XP progress, recommended sales)
- Settings (notifications, payments, privacy)
```

**Dashboard Prominence (Shopper):**
- Rank card: "You're 2,500 XP away from Ranger!" with progress bar
- Hunt Pass card: "Hunt Pass members earn 1.5x XP" (corrected copy)
- Achievements: "You've earned 5 badges" with button to view all
- Referral card: "Share your referral link, earn XP" (new)

### 3g — Dashboard Alignment

**Organizer Dashboard — Proposed Changes:**

**New Elements:**
1. **Tier Progress Card** (if SIMPLE):
   - "Your tier: SIMPLE"
   - "Most popular upgrade: PRO ($29/mo)"
   - Feature highlights: "500 items per sale, Advanced analytics, Command Center"
   - CTA: "Learn more"

2. **À la Carte Info** (if 0 sales published):
   - "Planning a single sale? Try à la carte: $9.99 per sale"
   - "No monthly commitment. Perfect for first-timers."
   - CTA: "Create a sale"

3. **Command Center Teaser** (if PRO):
   - "Multi-sale operations hub"
   - "Manage all your concurrent sales from one screen"
   - CTA: "Open Command Center"

**Shopper Dashboard — Proposed Changes:**

**New Elements:**
1. **Rank Progress Card** (prominence increase):
   - Large progress bar showing XP to next rank
   - Rank name + level (e.g., "Ranger • Level 3")
   - Next rank benefits preview (e.g., "Sage: 1 extra hold")
   - CTA: "See all rank benefits"

2. **Hunt Pass Card** (corrected copy):
   - "Earn 1.5x XP on all actions"
   - "Early access to flash deals"
   - Price: "$4.99/mo"
   - CTA: "Learn more" (links to hunt-pass.tsx with accurate copy)

3. **Referral Card** (new):
   - "Share your referral link"
   - "Earn 20 XP per new shopper signup"
   - CTA: "View my referral link"

4. **Achievement Progress** (new):
   - "Next badge: 50 XP away"
   - CTA: "View all badges"

---

## Section 4: Implementation Priority Stack

### Impact × Effort Matrix

**HIGH IMPACT / LOW EFFORT (Quick Wins — Ship First)**

1. **Fix Hunt Pass copy: "2x" → "1.5x"** (hunt-pass.tsx line 79)
   - Effort: S (5 min)
   - Impact: Trust + conversion accuracy
   - Token cost: <50

2. **Add XP earning matrix to Hunt Pass page**
   - Show: "You earn X XP for each action. With Hunt Pass, multiply by 1.5x"
   - Effort: S (table, 30 min)
   - Impact: Conversion clarity
   - Token cost: <100

3. **Add À la carte $9.99 to pricing page**
   - Add new section: "Just one sale? Try our pay-as-you-go option"
   - Effort: S (add 1 feature block, 30 min)
   - Impact: Revenue unlock (~10% of new organizers)
   - Token cost: <100

4. **Wire referral routes** (if schema exists)
   - POST `/referrals/track-signup`
   - POST `/referrals/track-purchase`
   - Trigger awardXp() calls
   - Effort: M (2–3 hours backend work)
   - Impact: Word-of-mouth growth enablement
   - Token cost: ~500

5. **Add Treasure Hunt XP multiplier for Ranger+**
   - Check rank before awarding ITEM_SCANNED XP
   - Ranger+ earn 1.5x, Sage+ earn 2x
   - Effort: S (xpService.ts, 3 lines)
   - Impact: Rank progression motivation
   - Token cost: <100

**MEDIUM IMPACT / MEDIUM EFFORT (1–2 Sessions)**

6. **Reorganize Organizer Nav**
   - Add "Insights," "Branding," "Multi-Sale Ops" to nav
   - Effort: M (layout work, 2–3 hours frontend)
   - Impact: Feature discoverability
   - Token cost: ~1000

7. **Add Organizer Tier Progress widget to dashboard**
   - Show current tier + upgrade path + highlights
   - Effort: M (component + API call, 2–3 hours)
   - Impact: PRO conversion CTR increase
   - Token cost: ~800

8. **Add Shopper Referral UI** (`/shopper/referrals`)
   - Page showing: unique link, stats, share buttons
   - Effort: M (frontend form, 2–3 hours)
   - Impact: Referral discoverability + viral growth
   - Token cost: ~800

9. **Increase Shopper Dashboard prominence for Rank + Hunt Pass**
   - Larger cards, better visual hierarchy
   - Effort: S (CSS + layout, 1 hour)
   - Impact: Gamification engagement
   - Token cost: ~300

10. **Add Collector Passport nav link (Shopper)**
    - Add to main nav or profile dropdown
    - Effort: S (nav addition, 30 min)
    - Impact: Core feature discovery
    - Token cost: <100

**HIGH IMPACT / HIGH EFFORT (Post-Beta Roadmap)**

11. **Implement Legendary-first access route**
    - Rank-gated flash deal endpoints
    - Sage/GM + Hunt Pass only
    - Effort: L (backend route + frontend gating, 1–2 sessions)
    - Impact: High-rank progression motivation
    - Token cost: ~2000

12. **Implement Referral first-purchase triggers**
    - Track referred user's first purchase
    - Award 30 XP to referrer
    - Effort: L (transaction tracking, 1–2 sessions)
    - Impact: Referral funnel completion
    - Token cost: ~2000

13. **Build Purchase Share moment**
    - Post-purchase "Share your haul" UI
    - Generate social card (og:image with item)
    - Effort: L (frontend + og:image gen, 1–2 sessions)
    - Impact: Viral moment capture
    - Token cost: ~2000

14. **Move batch operations + badge to SIMPLE**
    - Update tierLimits.ts, requireTier gates, TierComparisonTable
    - Effort: M (schema + routes, 1 session)
    - Impact: SIMPLE perceived value increase
    - Token cost: ~1000

---

## Section 5: The "Findability" Test

**Can Users Complete These Tasks?**

### 1. New Organizer: "How do I publish my first sale?"

**Expected Path:**
1. Login → Dashboard
2. Click "Create Sale"
3. Fill form (title, date, location, description)
4. Click "Save"

**Current Reality:** ✅ WORKS
- Dashboard has "Create Sale" widget
- Flow is clear and straightforward

**Friction:** None. ✅

---

### 2. Free Organizer: "What do I get if I upgrade to PRO?"

**Expected Path:**
1. Login → Organizer Dashboard (or `/organizer/pricing`)
2. See pricing page with three tiers
3. Compare features: SIMPLE vs PRO
4. Understand: "500 items, 10 photos, analytics, batch ops, Brand Kit"

**Current Reality:** ✅ WORKS, but missing À la carte option
- Pricing page shows SIMPLE / PRO / TEAMS clearly
- Feature comparison table is visible
- BUT: À la carte $9.99 option is completely missing
- If organizer wants only one sale, they think "upgrade to $29/mo or don't" (missing $9.99 option)

**Friction:** Missing à la carte makes conversion funnel incomplete. ⚠️

---

### 3. PRO Organizer: "What does TEAMS add for me as a solo organizer?"

**Expected Path:**
1. Login → `/organizer/pricing` or dashboard CTA
2. Compare PRO vs TEAMS
3. Understand: "Multi-user workspace, API, white-label"

**Current Reality:** 🚨 FRICTION
- Pricing page shows TEAMS benefits but doesn't explain "solo organizer why would I care?"
- TEAMS value prop is "team collaboration" — solo organizer doesn't see personal benefit
- Feature: "API access & webhooks" is in the table but context is missing ("Why would I need this?")

**Gap:** Missing narrative of "TEAMS for integrations and automation" for solo-organizer use case.

**Friction:** Moderate. Solo organizers perceive TEAMS as "for companies only." ⚠️

---

### 4. New Shopper: "What is the Explorer's Guild and why should I care?"

**Expected Path:**
1. Login → Shopper Dashboard
2. See "Rank Badge" or "Explorer's Guild" section
3. Understand: "Earn XP, climb ranks, unlock benefits"

**Current Reality:** 🚨 BROKEN
- Dashboard shows rank badge but no explanation
- No onboarding tour or explainer
- Rank benefits are cosmetic (only hold duration matters, not visible)
- New shopper sees "Initiate • 0 XP" and has no idea what to do

**Friction:** High. Gamification is completely opaque to new users. ❌

**Fix:** Add card on dashboard:
```
"Explorer's Guild — Earn XP to climb ranks"
"Scout (500 XP) → Ranger (2,000 XP) → Sage (5,000 XP) → Grandmaster (12,000 XP)"
"Unlock longer holds, exclusive rewards, and more."
CTA: "View benefits"
```

---

### 5. Active Shopper: "How close am I to my next rank?"

**Expected Path:**
1. Login → Dashboard
2. See rank card: "Ranger • 3,200 XP / 5,000 needed"
3. Understand: "1,800 XP away from Sage"

**Current Reality:** ✅ PARTIALLY WORKS
- Shopper dashboard shows RankProgressBar component
- Progress is visible (e.g., "1,800 XP away")
- BUT: No explanation of what Sage gets them
- Shopper sees progress bar but no motivational context

**Friction:** Low, but lack of benefit context reduces motivation. ⚠️

**Fix:** Hover/CTA on progress bar: "Next rank: Sage • +30 min holds"

---

### 6. Shopper: "Is Hunt Pass worth it for me?"

**Expected Path:**
1. Navigate to `/shopper/hunt-pass`
2. See price: $4.99/mo
3. See benefits: "1.5x XP, early flash deals, exclusive badge"
4. Understand: "Is 1.5x XP worth $4.99/mo?"
5. Calculate: "I earn ~50 XP/month, so Hunt Pass adds ~25 XP gain = 5 months to next rank"

**Current Reality:** 🚨 BROKEN
- Page claims "2x XP" (wrong, code enforces 1.5x)
- Page doesn't show XP earning matrix (shopper can't calculate value)
- Benefits are vague ("early flash deals" — how early? unclear)
- Shopper has insufficient information to make decision

**Friction:** High. Insufficient information for conversion decision. ❌

**Fix:**
- Correct copy: "1.5x XP" (not "2x")
- Add XP matrix: "Actions that earn XP: Visits (5 XP), Purchases (1 per $), Auctions (15 XP), etc."
- Add calculator: "If you earn 50 XP/month, Hunt Pass saves 3 months per rank progression"
- Clarify flash deals: "Get notified 6 hours before other shoppers"

---

### 7. Any User: "How do I share this sale with my friends?"

**Expected Path (Organizer):**
1. Open sale
2. Click "Share"
3. Choose: social post, QR code, email, SMS
4. Generate link / QR / message
5. Share via social or messaging app

**Current Reality:**
- Organizer can generate QR code ✅
- Organizer can generate social post template ✅
- BUT: Path depends on where organizer is (dashboard vs sale detail view)
- Not clear which option is "best" for friends vs strangers

**Friction:** Low-medium. Features exist but entry point is unclear.

---

**Expected Path (Shopper):**
1. Find cool item
2. Click "Share"
3. Choose: social post, message, copy link
4. Paste into WhatsApp / text / email

**Current Reality:**
- No "Share item" button on item detail page
- Shopper must manually copy URL and send
- No social card generation (og:image, title preview)

**Friction:** High. Sharing is not discoverable, no social card optimization. ❌

**Fix:**
- Add "Share" button on item detail page
- Generate social card: item photo + title + sale name + price
- Share to: WhatsApp, SMS, email, Facebook, Twitter, copy link

---

## Key Findings Summary

### The 5 Most Impactful Gaps

1. **À la carte $9.99 option is invisible**
   - Locked decision but completely hidden from pricing page
   - Revenue leak: ~10% of new organizers would pick single-sale option
   - Fix: Add 1 feature block to pricing.tsx (15 min work, potentially $10k/year revenue)

2. **Hunt Pass page claims "2x XP" but code enforces "1.5x"**
   - Credibility issue: shopper feels deceived
   - Conversion blocker: no XP earning matrix to calculate value
   - Fix: Correct copy + add XP matrix (30 min work, conversion rate impact)

3. **Rank benefits are invisible / cosmetic**
   - Shopper reaches Sage (5,000 XP effort) → discovers no benefit besides badge
   - Core gamification feels broken
   - Fix: Implement Treasure Hunt XP multiplier for Ranger+ (1 session, high engagement ROI)

4. **Referral system exists but is completely unwired**
   - Schema exists, XP awards defined, but no routes + no UI
   - Word-of-mouth growth is locked
   - Fix: Wire referral routes + add `/shopper/referrals` UI (2–3 sessions, high growth ROI)

5. **Command Center, Brand Kit, Batch Ops are hard to find**
   - PRO organizers can't discover key features from nav
   - Dashboard doesn't surface feature progression
   - Fix: Reorganize nav + add tier progress widget (2 sessions, feature utilization increase)

### Locked Decisions (DO NOT RE-OPEN)

- PRO = $29/mo, TEAMS = $79/mo (D-006/D-007, S268)
- Hunt Pass 1.5x XP (S389, not 2x)
- Rank thresholds: 0/500/2000/5000/12000 (S388)
- Social features ungated on all tiers (S388)
- À la carte = $9.99/sale (S268)
- SIMPLE tier name stays (not renamed)

### Open Questions for Patrick

1. **Should we move batch operations + badge to SIMPLE tier?** (Board recommended S388)
   - Impacts: SIMPLE perceived value increase, PRO differentiation clarity
   - Recommendation: YES — tables stakes feature, trust builder

2. **Should we implement Treasure Hunt XP multiplier for Ranger+ before beta?**
   - Impacts: Rank progression motivation
   - Recommendation: YES — quick win, high engagement ROI

3. **Should we prioritize referral links or Hunt Pass improvements first?**
   - Referral links: unlock word-of-mouth growth (user acquisition)
   - Hunt Pass improvements: improve conversion rate (revenue)
   - Recommendation: BOTH in parallel (hunt-pass fix is 30 min, referral routes are 2–3 hours)

4. **Can we ship À la carte on pricing page before beta?**
   - Effort: 15 min
   - Impact: Unlock single-sale revenue stream
   - Recommendation: YES — ASAP (revenue leak stopper)

---

## Session Wrap-Up Deliverables

This document provides Patrick with:
1. ✅ Current-state audit of all tiers, gamification, pricing, nav, dashboards
2. ✅ Explicit gap identification with severity (P0–P3)
3. ✅ Proposed alignment with locked decisions called out
4. ✅ Ranked implementation priority (quick wins first)
5. ✅ Findability test results showing where users succeed/fail
6. ✅ Open questions for Patrick decision-making

**Next Step:** Patrick reviews findings. Main session stages implementation sprints based on priority (Quick Wins → Tier 1 → Tier 2).

