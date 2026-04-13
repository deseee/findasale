# Organizer Dashboard: Competitive Findings — Quick Brief
**Date:** April 1, 2026
**For:** Patrick (FindA.Sale ideal dashboard spec decision)

---

## Bottom Line

Before Patrick builds the "ideal estate sale dashboard," he needs to know what competitors already offer. Research shows:

**Table Stakes (Must Have to Be Credible)**
1. Settlement reports — organizers download PDF showing: items sold, revenue, commission, net payout
2. Sell-through metrics — "48% of items sold, avg 3.2 days to sale, top category: Furniture"
3. Unsold item warnings — "5 items unsold >7 days, recommend markdown"
4. Tax-ready export — CSV for accountants

**Market Whitespace (Differentiation Opportunity)**
1. AI pricing recommendations — "Fair price $145–$165 (based on 8 recent comps); currently $125; revenue upside +$20–$40"
2. Live engagement dashboard — "5 people viewing this item right now, 3 active bids"

**FindA.Sale's Advantage (Already Has)**
- Mobile-first camera capture + instant AI tagging
- Unified organizer + shopper experience (organizers can shop their own sales)
- Multi-sale-type support (estate, yard, auction, consignment in one platform)

---

## The Gap

**FindA.Sale currently:**
- ✅ Shows item count, visitor count, hold count
- ✅ Has AI item tagging (Typology classifier)
- ❌ **No settlement hub** — Zero organizer payout tracking, no commissions calculated, no download statements
- ❌ **No sell-through analytics** — Can't answer "what % sold?" or "how long to sale?"
- ❌ **No AI pricing** — Can't recommend prices based on market comps
- ❌ **No live activity feed** — Can't show real-time buyer engagement

**Competitors (PROSALE, EstateFlow, SimpleConsign):**
- ✅ All have settlement hubs with detailed payout statements
- ✅ All have sell-through analytics and unsold item alerts
- ✅ Some (Syncrostore) have AI pricing recommendations
- ❌ None have unified organizer + shopper (FindA.Sale advantage)

---

## What Should Be in the "Ideal" Spec

### Phase 1 (Before Launch — 3–4 Weeks)
1. **Settlement Hub** on sale detail page (items sold, revenue, commission, net payout) + downloadable PDF
2. **Sell-Through Widget** on dashboard (% sold, avg days to sale, top categories)
3. **Unsold Item Alerts** (items stalled >5 days with markdown suggestions)
4. **Tax Export** (CSV: Gross | Commission | Net | Category)

### Phase 2 (2–3 Months After Launch — Differentiation)
1. **Live Engagement Dashboard** (real-time: people viewing, bids, floor price)
2. **AI Pricing Recommendations** (fair market price + revenue upside)
3. **Inventory Rotation Reports** (weekly email with markdown/bundle suggestions)

---

## Key Risk

**If FindA.Sale launches without settlement hub:** Organizers will stick with EstateSales.NET or switch to EstateFlow/SimpleConsign because those platforms let them reconcile revenue, download settlement statements, and file taxes. No organizer will adopt a marketplace that can't show them how much they made.

**Priority:** Build settlement hub first. Everything else is optimization.

---

## Opportunity

**AI pricing recommendations:** Zero estate sale platforms do this well. Only Syncrostore (flea market focused) has it. **If FindA.Sale builds this, it's a clear differentiator** that directly solves "how do I know what to price this at?"

Market research shows organizers obsess over pricing — they'd likely pay for accurate AI recommendations ($5–$10/month or 2% commission share). No competitor offers this for estate sales yet.

---

## Files Created

1. **Full research:** `/claude_docs/research/organizer-dashboard-competitive-analysis-S367.md` (detailed feature matrix, competitor strengths/gaps, strategic recommendations)
2. **This brief:** Quick reference for decision-making

---

## Next Steps

Patrick decides:
- Build settlement hub in Phase 1? (Recommended: YES — table stakes)
- Build AI pricing in Phase 2? (Recommended: YES — differentiation)
- Which other features prioritize? (Phase 2 options: live engagement, inventory rotation alerts, tax export)

Once decision is locked, dispatch to findasale-dev with specs.

