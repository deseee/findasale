# Retail Mode — Competitive Analysis & Positioning
**Date:** 2026-04-21 | **Session:** S532 | **Status:** Active

## What FindA.Sale Already Has (Retail Mode — FULLY BUILT)

FindA.Sale Retail Mode is fully shipped as of S520. Key facts:
- `saleType=RETAIL` on Sale model — one of 8 supported sale types
- `retailAutoRenewDays` field (default 30) — controls perpetual auto-renewal cycle
- `retailAutoRenewJob` — daily cron (1AM UTC) that moves unsold items forward to new sale period automatically
- Item.saleId is nullable — items exist in perpetual inventory independent of a sale period
- `isInventoryContainer` boolean on Item — separates perpetual items from sale-specific
- Create/edit sale UI hides date fields when saleType=RETAIL, shows "Always Open" info banner
- Public storefront shows "🟢 Always Open" badge instead of date range
- Social share templates use dynamic saleTypeLabel for retail context
- **Tier gate: TEAMS only** (returns 403 with upgradeUrl for non-TEAMS)

## Market Context (2026)

**Ricochet POS:** $199/month flat. Unlimited users/consignors/devices. Strong on color-tag discounts, consignor portal (GO mobile app), and payout automation. No team coordination tools, no shopper discovery, no loyalty system.

**SimpleConsign:** $159–259/month (Basic→Pro). Strong consignor management, vendor portal, QuickBooks/Shopify on Pro. No team tools, no mobile app, no gamification.

**FindA.Sale TEAMS:** $79/month. Has everything above PLUS: workspace staff management (roles, skill tags, performance, coverage alerts), Command Center (weather alerts, inactivity monitoring), Morning Briefing (day-of task coordination), Explorer's Guild loyalty (XP, ranks, Hunt Pass), Treasure Hunt QR discovery, shopper-facing PWA, neighborhood/city discovery pages, AI photo intake workflow.

**Pricing verdict:** FindA.Sale TEAMS is dramatically underpriced at $79 vs Ricochet's $199 for a narrower product. Parity at $199 is defensible today; premium at $249 is achievable after closing the 3 gaps below.

## Competitive Positioning

**Core message:** "Ricochet manages your inventory. FindA.Sale manages your whole operation."

Ricochet and SimpleConsign are transaction engines (POS + consignor payouts). FindA.Sale is an operations platform — inventory + team coordination + customer loyalty + discovery. These are different products at the same price point.

**FindA.Sale unique advantages over all competitors:**
- AI photo intake → category/condition/price suggestion (no competitor does this)
- Staff Morning Briefing with day-of task assignment (no competitor does this)  
- Command Center with weather alerts, coverage gap monitoring (no competitor does this)
- Explorer's Guild gamification for repeat shopper loyalty (no competitor does this)
- QR-based Treasure Hunt foot traffic driver (no competitor does this)
- Shopper discovery pages by neighborhood/city (no competitor does this)

**Where Ricochet/SimpleConsign currently win:**
- Consignor portal (self-service for vendors to check sales + payouts)
- Automated payout calculation and scheduling
- Color-tag discount rules engine
- Multi-location inventory sync (for chains)

## The 3 Gaps to Close

### Gap 1: Consignor Portal & Automated Payouts (CRITICAL — blocks premium positioning)
Consignors bring items, store sells them, store pays the consignor their split. Neither Ricochet nor SimpleConsign require an organizer to manually calculate payouts. FindA.Sale needs: Consignor model, item-to-consignor linking at intake, payout calculation endpoint, consignor statement, organizer payout UI. Phase 2: consignor self-service login.

### Gap 2: Color-Tagged Discount Rules (HIGH — core thrift workflow)
Physical color tags on items map to weekly discount rotations ("Blue tags 50% off this week"). No other POS in this segment lacks this. FindA.Sale needs: tagColor field on Item, DiscountRule model (color → percent → date range), rule application at checkout, organizer rule management UI.

### Gap 3: Multi-Location Inventory View (MEDIUM — needed for regional operators)
Chains and multi-location consignment shops need cross-location inventory visibility and item transfers. FindA.Sale needs: Location model, locationId on Sale/Item, cross-location inventory query, item transfer endpoint, location selector UI, per-location analytics.

## Go-to-Market Framing

**Short-term (0–3 months):** Raise TEAMS to $199/month (parity with Ricochet). Position as "everything Ricochet does for inventory + team coordination + shopper loyalty. Same price."

**Medium-term (3–6 months):** Ship Gap 1 (consignor portal) and Gap 2 (tag discounts). Update messaging to "everything Ricochet does, plus team management." 

**Long-term (6–12 months):** Ship Gap 3 (multi-location). Move to $249/month premium. Full "operations OS" positioning.

**Ideal pitch:** "Ricochet and SimpleConsign are great for inventory. But they don't help your team know what to do each day, they don't bring customers back, and they don't drive foot traffic. FindA.Sale does all three — at the same price."

## Retail Mode Checklist Differences (vs Estate Sale)

Estate sale checklist: one-time event focused (photo upload, pricing, day-of coverage, pack-up).
Retail mode needs different preset task categories:
- Opening Procedures (daily)
- Donor/Consignor Intake
- Inventory Pricing & Floor Placement  
- Color-Tag Rotation (weekly)
- End-of-Day Reconciliation
- Closing Procedures
- Weekly Review & Restock
- Monthly Reporting & Payout Run

These should be added as a RETAIL category in taskTemplates.ts (quick-picker feature shipped S532).

## Sources
- Ricochet pricing: ricoconsign.com/pricing (verified 2026-04-21)
- SimpleConsign pricing: simpleconsign.com/pricing (verified 2026-04-21)
- Competitive feature gaps: G2/Capterra reviews cross-referenced against FindA.Sale codebase audit S532
- Retail workflow research: bindy.com, joinhomebase.com, koronapos.com (verified 2026-04-21)
