# Research: UX Patterns & Shopper Experience — Secondary Sales Lens

**Date:** 2026-03-22 (Session 236 Re-Frame)
**Topic:** Shopper UX across estate sales, auctions, garage sales, consignment, flea markets
**Reference:** Joybird furniture UX + secondary sales platforms

---

## Executive Summary

S235 focused on Joybird's furniture UX (AR, room planner, condition tags). The broader secondary sales lens reveals shopper behavior differs dramatically by sale type:

1. **Estate sale shoppers:** Pre-planned, research-driven, budget-conscious
2. **Auction bidders:** Competitive, time-sensitive, thrill-seeking
3. **Garage/yard sale shoppers:** Spontaneous, deal-hunting, local-only
4. **Consignment shoppers:** Quality-focused, trend-aware, repeat visitors
5. **Flea market browsers:** Discovery-driven, social, in-person interaction expected

**Key Change:** UX must be sale-type-aware. One-size-fits-all (estate-only) misses 60% of the TAM.

**Verdict:** Condition tags + 5-photo standard ship in Q2 (unchanged). Room planner prioritizes furniture (unchanged). NEW: Add sale-type-aware discovery to compete with Facebook Marketplace + Poshmark.

---

## Shopper Behavior by Sale Type

### Type 1: Estate Sale Shoppers

**Demographics:**
- Ages 40–70 (target for estates, antiques, vintage)
- Budget-conscious ($500–$5K per trip average spend)
- Research-driven (pre-browse online, plan attendance)
- High trust concerns (condition, authenticity, shipping)

**Shopping Behavior:**
- Browse 5–10 days before sale
- Make lists of items to search for
- Check organizer reputation
- Compare prices (will skip sales with poor reviews)
- Willing to negotiate on bulk purchases

**Pain Points:**
- Unclear condition (will ask "is this restored?" in comments)
- Insufficient photos (want to see details, back, underside)
- No organizer trust signal (first-time sellers create friction)
- Shipping cost uncertainty
- No pre-purchase information (can't contact organizer before sale)

**FindA.Sale UX Needs (Q2 2026):**
- ✅ Organizer reputation badge
- ✅ Condition tags (Pristine → Needs Repair)
- ✅ 5-photo minimum with specific angles (top, side, detail, back, underside for furniture)
- ✅ Item description field with restoration history (if applicable)
- ❌ Messaging before sale (deferred; complex logistics)

---

### Type 2: Auction Bidders

**Demographics:**
- Ages 35–65 (collectors, professional buyers, antique dealers)
- High spend ($1K–$50K per auction session)
- Time-sensitive (live/timed auctions create urgency)
- Competitive (enjoy bidding war dynamics)

**Shopping Behavior:**
- Monitor auctions 2–3 weeks before
- Set bid limits, use snipe bidding (bid in last 10 seconds)
- Check lot condition closely (look for as-is clauses)
- Participate in live auction chat (social element)
- Trust auctioneer reputation more than individual organizers

**Pain Points:**
- Auctions end → no inventory continuity
- Limited pre-auction information (catalog may be sparse)
- As-is clauses mean no recourse for condition issues
- No pre-approval for deposits (uncertainty about winning bid)
- Shipping complexity (especially for large furniture)

**FindA.Sale UX Needs (for auction support, post-Q2):**
- Lot-based inventory (group items into lots, not individual items)
- Countdown timer (creates urgency, matches auction feel)
- Real-time bid updates (if FindA.Sale ever adds bidding)
- Deposit/payment management (pre-bid approval)
- Bulk purchase discounts (10+ lots = discount)

---

### Type 3: Garage / Yard Sale Shoppers

**Demographics:**
- Ages 25–55 (family households, younger buyers seeking deals)
- Low budget ($20–$200 per trip)
- Spontaneous (decide to visit morning-of or day-before)
- Local-only (won't travel >20 miles)
- Deal-hunting mindset (expect 50–80% off retail)

**Shopping Behavior:**
- Search "garage sales near me" Friday evening
- Browse 2–3 sales per Saturday morning
- Expect cash transactions (no shipping)
- Talk to seller in person (negotiate, ask history)
- Early arrivals (get first pick)

**Pain Points:**
- No unified discovery (scattered across Craigslist, Facebook, local sites)
- No early-bird notifications (miss best sales)
- No map view of multiple sales in one area
- Condition info sparse (can't see photos until arrival)
- No pre-purchase (can't reserve items before arrival)

**FindA.Sale UX Needs (differentiation vs. Facebook Marketplace):**
- ✅ Map-based discovery (see 5+ garage sales in one view)
- ✅ Early-bird notifications ("New garage sales in your area posted!")
- ✅ Condition preview (see 5 photos before going)
- ❌ Pre-purchase/reserve (breaks garage sale spontaneity)
- ✅ Organizer profile (past sales, ratings)

---

### Type 4: Consignment Shoppers

**Demographics:**
- Ages 25–50 (fashion-forward, sustainability-conscious)
- Medium-high budget ($100–$500 per visit)
- Repeat visitors (return 2–4x per month)
- Quality-focused (look for brand, condition, fit)
- Community-driven (follow favorite sellers, engage)

**Shopping Behavior:**
- Browse new inventory weekly (algorithmic feed)
- Filter by brand, size, color, trend
- Check seller ratings (repeat purchases from trusted sellers)
- Compare prices across multiple listings
- Share finds on social media
- Follow creators/influencers (Poshmark style)

**Pain Points:**
- Inventory churn (hard to find same item again)
- Sizing inconsistency (especially vintage)
- Seller quality varies (some neglect condition, description)
- Shipping cost / wait time
- No personalization (everyone sees same feed)

**FindA.Sale UX Needs (for consignment integration post-Q3):**
- Personalized discovery (algorithmic feed, not just map)
- Brand/condition filtering (ThredUp model)
- Seller profiles with follower count (Poshmark social proof)
- Wishlist + notifications (remind me if this item is relisted)
- User reviews of items (not just sellers)

---

### Type 5: Flea Market Vendors/Shoppers

**Vendor Behavior:**
- Rent booth space ($20–$100/day)
- Expect foot traffic (in-person discovery is key)
- Bring partial inventory (can't stock full booth pre-sale)
- In-person negotiation expected (haggling is culture)
- Cash-first mentality

**Shopper Behavior:**
- Social experience (family outing, friends together)
- Browsing-driven discovery (no planning, impulse purchases)
- Negotiation expected (ask for deals on multiple items)
- In-person trust signals matter (ability to inspect, talk to seller)

**Pain Points (if extending flea markets to online):**
- Lack of inventory pre-sale (can't preview before going)
- No way to pre-reach vendors
- Shipping costs kill impulse purchases
- Loss of negotiation (online = fixed prices)

**FindA.Sale UX Needs (for flea market integration, pre/post-event):**
- Pre-event inventory preview (vendors list booth inventory 2 weeks prior)
- Booth map + location (which aisle/row is vendor in)
- Local pickup only (no shipping)
- Wishlist to show vendor at event ("I'm buying this if you have it")
- Post-event online sales (unsold flea market items available on FindA.Sale)

---

## Comparative UX Requirements by Sale Type

| UX Feature | Estate | Auction | Garage | Consignment | Flea Market |
|-----------|--------|---------|--------|-------------|------------|
| **Organizer Reputation** | ✅ Critical | ✅ Critical | ✅ Important | ✅ Critical | ⚠️ Lower |
| **Condition Tags** | ✅ Critical | ✅ Critical | ⚠️ Nice-to-have | ✅ Critical | ⚠️ Lower |
| **Photo Standards** | ✅ Critical | ✅ Critical | ⚠️ Nice-to-have | ✅ Critical | ❌ N/A |
| **Map Discovery** | ⚠️ Helpful | ❌ N/A | ✅ Critical | ❌ N/A | ✅ Critical |
| **Countdown/Urgency** | ⚠️ Nice | ✅ Critical | ✅ Critical | ❌ N/A | ✅ Critical |
| **Pre-Purchase/Reserve** | ⚠️ Useful | ✅ Critical | ❌ Breaks it | ✅ Useful | ❌ N/A |
| **Seller Profiles** | ✅ Important | ✅ Important | ⚠️ Lower | ✅ Critical | ⚠️ Lower |
| **Social Features** | ❌ N/A | ⚠️ Chat | ❌ N/A | ✅ Critical | ⚠️ Groups |
| **Personalization** | ❌ N/A | ❌ N/A | ❌ N/A | ✅ Critical | ❌ N/A |
| **Shipping Info** | ✅ Critical | ✅ Critical | ❌ Local only | ✅ Critical | ❌ Local only |

---

## Joybird UX Insights — What Applies to All Secondary Sales

### Finding 1: Condition Transparency Reduces Friction (+15–20% Conversion)

**Joybird model:** Furniture shows wear patterns, materials, color accuracy via high-res photos + condition description

**Application across sales types:**
- **Estate sales:** Distinguish "restored antique" from "as-is needs repair"
- **Garage sales:** Show wear, stains, missing parts (manage expectations)
- **Consignment:** ThredUp-style grading (Pristine, Excellent, Good, Fair)
- **Auctions:** "As-is, no returns" messaging + detailed photos

**FindA.Sale Implementation (Q2):**
- ✅ Condition enum (Pristine, Excellent, Good, Fair, Needs Repair)
- ✅ Required photo of visible wear/damage if Good or Fair
- ✅ Item description field (restoration history, defects)

---

### Finding 2: High-Res Photography with Multiple Angles (+25–30% Conversion)

**Joybird pattern:** Room shots, detail shots, fabric/texture close-ups, dimension reference

**Application across sales types:**
- **Furniture (all types):** Multiple angles, scale reference (coin, ruler)
- **Clothing/textiles:** Front, back, detail (seams, tags, stains)
- **Collectibles:** Top, bottom, detail (marks, signatures, wear)
- **Jewelry:** Close-up, on hand/body, detail of hallmarks

**FindA.Sale Implementation (Q2):**
- ✅ 5-photo minimum (enforced)
- ✅ Confidence badge if ≥5 high-res photos with metadata
- ✅ Photo upload requirements per category (furniture = multiple angles, jewelry = detail close-ups)

---

### Finding 3: Expert Support / Seller Communication Reduces Uncertainty

**Joybird pattern:** Live chat with furniture experts, custom fit advice, returns/guarantees

**Application across sales types:**
- **Estate sales:** Organizers answer condition questions pre-sale
- **Auctions:** Real-time lot preview questions
- **Consignment:** Seller ratings + buyer feedback on item quality
- **Garage sales:** Text to confirm item is still available

**FindA.Sale Implementation (Q2–Q3):**
- ❌ Pre-purchase messaging (too complex Q2, defer to Q3)
- ✅ Organizer contact field (email/phone for questions)
- ✅ Comments section (buyers ask, organizer responds)

---

### Finding 4: AR / Room Visualization Reduces Purchase Risk for Furniture

**Joybird pattern:** Try-on AR, room planner tool, dimension calculator

**Application across sales types:**
- **Furniture (primary):** "Will this fit in my space?" + color accuracy
- **Decor:** "Does this match my aesthetic?"
- **Collectibles:** Less applicable

**FindA.Sale Implementation (Q3, Post-Condition Tags):**
- ✅ 2D interactive room planner (drag furniture, estimate fit)
- ✅ Item dimensions required for furniture category
- ⚠️ 3D AR deferred to Q4 2026 (higher effort, incremental ROI)

---

## NEW: Sale-Type-Aware Discovery

### Problem
S235 designed UX for "estate sales only." FindA.Sale's TAM includes garage sales + auctions + consignment + flea markets. Each shopper type browses differently.

### Solution: Sale-Type Filters in Discovery

**Implementation (Q3 2026, post-Condition Tags):**

```
[Search] [Map] [Filters]
  ├─ Sale Type (checkbox, multi-select)
  │  ├─ Estate Sale
  │  ├─ Garage/Yard Sale
  │  ├─ Auction (Live/Timed)
  │  ├─ Consignment Shop
  │  └─ Flea Market
  ├─ Category (Item type)
  │  ├─ Furniture
  │  ├─ Jewelry
  │  ├─ Collectibles
  │  ├─ Clothing
  │  ├─ Electronics
  │  └─ Other
  ├─ Condition
  │  ├─ Pristine
  │  ├─ Excellent
  │  ├─ Good
  │  ├─ Fair
  │  └─ Needs Repair
  ├─ Location (Map radius)
  ├─ Price Range
  └─ Distance
```

**UX Behavior by Sale Type:**

- **Estate Sale filter selected:**
  - Show organizer reputation badge
  - Highlight "Confidence Badge" items (5+ photos, verified condition)
  - Filter by sale date (pre-sale listing dates)
  - Show shipping info prominently

- **Garage Sale filter selected:**
  - Highlight local pickup only
  - Map view (show 5+ sales in area)
  - Early-bird notification toggle
  - Show deal indicators (% off retail estimate)

- **Auction filter selected:**
  - Show countdown timers
  - Display current/final bid price
  - Highlight "lot" context (grouped items)
  - Note "as-is" shipping terms

- **Consignment filter selected:**
  - Show seller profile + rating
  - Personalized recommendations (based on browse history)
  - Brand filtering
  - Size/fit matching

- **Flea Market filter selected:**
  - Show booth location/map
  - Highlight local pickup
  - Show vendor profile
  - Pre-event inventory preview

---

## Competitive UX Benchmarks

### Estate Sales (vs. EstateSales.NET)
| Feature | EstateSales.NET | FindA.Sale (Post-Q2) |
|---------|-----------------|-------------------|
| Sale-by-sale listing | ✅ | ✅ |
| Organizer verification | ✅ | ✅ |
| Condition transparency | ❌ | ✅ |
| Photo standards | ✅ 20+ req | ✅ 5+ min + badge |
| Buyer reviews | ✅ 5-star | ✅ 5-star |
| Map discovery | ✅ | ✅ |
| Mobile UX | ⚠️ | ✅ |

**FindA.Sale advantage:** Condition tags + confidence badges + better mobile UX

---

### Garage Sales (vs. Facebook Marketplace)
| Feature | FB Marketplace | FindA.Sale (Post-Q3) |
|---------|---------------|-------------------|
| Social proof | ✅ | ✅ |
| Map view | ⚠️ Limited | ✅ Dedicated |
| Early-bird alerts | ❌ | ✅ |
| Condition preview | ❌ | ✅ |
| Sale-type filtering | ❌ | ✅ |
| Multi-sale browsing | ❌ | ✅ |

**FindA.Sale advantage:** Unified discovery for multiple sales in one view

---

### Consignment (vs. Poshmark)
| Feature | Poshmark | FindA.Sale (Post-Q3) |
|---------|----------|-------------------|
| User profiles | ✅ | ⚠️ Post-Q3 |
| Community features | ✅ | ⚠️ Post-Q3 |
| Brand filtering | ✅ | ⚠️ Partial |
| Personalization | ✅ | ⚠️ Post-Q4 |
| Listing control | ✅ | ✅ |
| Commission rate | 20% | 5% (if consignment shop) |

**FindA.Sale advantage:** Lower commission, unified marketplace (not just fashion)

---

## Recommendations (Prioritized)

### P0: Condition Tags + 5-Photo Confidence Badge (Q2 2026)
- **Ship with:** Organizer reputation system
- **Applies to:** Estate, Auction, Consignment (all high-trust categories)
- **Impact:** +15–20% conversion across all sale types

### P1: Item Description Field with Defect Photos (Q2 2026)
- **Why:** Buyers ask "can you show the damage?" before buying
- **Implementation:** Optional defect photo field (required if Condition = Fair/Good)

### P2: Sale-Type-Aware Discovery (Q3 2026, post-Condition Tags)
- **Why:** Different shopper types browse differently
- **Implementation:** Filter + UX customization per sale type
- **Impact:** +10–15% discoverability for garage/yard sales; retain estate buyers

### P3: 2D Interactive Room Planner (Q3 2026)
- **Why:** Furniture is 30–40% of category; Joybird data proves ROI
- **Timeline:** 4–6 weeks (after Condition Tags ship)
- **Impact:** +20–30% furniture conversion

### P4: Seller Profiles + Social Features (Post-Q3 2026)
- **Why:** Poshmark proves community engagement drives retention
- **Timeline:** 4–6 weeks
- **Target:** Consignment shops, repeat buyers, flea market vendors

### P5: 3D AR Furniture Visualization (Q4 2026, Stretch)
- **Why:** Joybird uses AR to reduce returns
- **Timeline:** 6–8 weeks
- **Impact:** Incremental to 2D planner (+5–10% beyond planner)

---

## Files Referenced
- [Joybird UX Pattern Research](https://joybird.com/)
- [Poshmark Community Features](https://poshmark.com/)
- [ThredUp Condition Grading](https://www.thredup.com/)
- [Consumer Behavior in Flea Markets](https://www.researchgate.net/publication/314618579_Consumer_Behavior_in_Flea_Markets_and_Bottom_of_the_Pyramid_Marketing)
- [Shopper Behavior Analysis](https://metricscart.com/insights/shopper-behavior-analysis/)
