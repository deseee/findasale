# Dashboard Makeover + Settlement Hub — Dev Brief (One-Shot Spec)

**Session:** S367 | **Date:** 2026-04-01
**Status:** READY FOR DEV DISPATCH (pending Patrick decisions below)
**Full Specs:**
- Architecture: `claude_docs/feature-notes/dashboard-makeover-architect-spec-S367.md`
- UX: `claude_docs/feature-notes/dashboard-makeover-ux-spec-S367.md`

---

## Locked Decisions (S367 — Patrick confirmed 2026-04-01)

1. **Commission rate** — Organizer sets a default rate in their profile settings (auto-fills). Can be overridden per-sale inside the settlement wizard. `SaleSettlement.commissionRate` is always editable inline.
2. **Tax receipts (Charity Close)** — Both download PDF AND optional auto-email. Email field is NOT required — organizer can skip it and just download. Phase 2 feature; Phase 1 = download only.
3. **Flea market vendor splits** — Phase 2. Separate roadmap item requiring additional scoping as a distinct model within the PWA. Do NOT include in this dispatch.
4. **Efficiency Coaching** — Not tier-gated. Feature-gated: show coaching metrics relevant to the features the organizer is actively using. No subscription gate.
5. **Multi-consignor payouts** — One Stripe payout to one executor per settlement. Multi-consignor splitting is a separate roadmap item requiring more scoping. Do NOT include in this dispatch.

---

## Build Scope

### Phase 1 (this dispatch)
- Settlement Hub — estate, consignment, auction (full 5-step wizard)
- Settlement Hub — yard sale (simplified 3-field reconciliation card)
- Sale Pulse widget
- Smart Buyer Intelligence widget
- High-Value Item Tracker
- Organizer Efficiency Coaching widget
- Post-Sale Momentum prompt
- Weather Strip
- Adaptive dashboard layout (sale-type-aware config)

### Phase 2 (next dispatch after Phase 1 QA)
- AI Comp Tool (photo → eBay comps → price suggestion)
- Charity Close flow + tax receipt PDF
- Flea market vendor management settlement
- Advanced lifecycle stage management

---

## Schema Migration

Migration name: `20260401_settlement_hub_dashboard_widgets`

### New Models (Prisma — from architect spec)
See full Prisma models in `dashboard-makeover-architect-spec-S367.md` §1.1.

**SaleSettlement** — one per sale, optional (only created when organizer initiates settlement)
**SaleExpense** — line items (HAULING|ADVERTISING|STAFF|SUPPLIES|VENUE|OTHER)
**ClientPayout** — Stripe Connect transfer record
**SaleTransaction** — analytics read model for Sale Pulse
**SaleWaiver** — digital waiver record (Phase 2)
**SaleDonation + TaxReceipt** — charity close (Phase 2)

### Additions to Existing Models
```prisma
// Sale model additions
lifecycleStage  String    @default("LEAD")   // LEAD|CONTRACTED|PREP|LIVE|POST_SALE|CLOSED
commissionRate  Decimal?                      // organizer's % for estate/consignment/auction
settlementNotes String?

// Item model additions
estimatedValue       Decimal?
isHighValue          Boolean   @default(false)
highValueThreshold   Decimal?
aiSuggestedPrice     Decimal?
donatedAt            DateTime?
donationRecipient    String?
```

### Migration Must-Run Steps (Patrick, production)
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

### Rollback Plan
```
Down: Drop SaleSettlement, SaleExpense, ClientPayout, SaleTransaction, SaleWaiver, SaleDonation, TaxReceipt tables.
Drop added columns from Sale and Item tables.
Playbook: "If Railway fails after migration, run: prisma migrate resolve --rolled-back 20260401_settlement_hub_dashboard_widgets"
```

---

## API Endpoints to Build

All organizer-auth required. Add to `packages/backend/src/routes/organizers.ts` or new `routes/settlement.ts`.

**Settlement Hub**
- `GET  /api/sales/:saleId/settlement` — fetch settlement + expenses + payout
- `POST /api/sales/:saleId/settlement` — create settlement record (auto-calc revenue from SaleTransactions)
- `PATCH /api/sales/:saleId/settlement` — update notes, commissionRate, lifecycleStage
- `POST /api/sales/:saleId/settlement/expenses` — add expense line item
- `DELETE /api/sales/:saleId/settlement/expenses/:expenseId` — remove expense
- `POST /api/sales/:saleId/settlement/payout` — initiate Stripe Connect transfer to client
- `GET  /api/sales/:saleId/settlement/receipt` — generate/return PDF download URL

**Dashboard Widgets**
- `GET  /api/organizers/sale-pulse/:saleId` — engagement score (views, saves, questions, score 0-100)
- `GET  /api/organizers/efficiency-stats` — organizer benchmarks vs. cohort
- `GET  /api/organizers/smart-buyers/:saleId` — upcoming shoppers with tier + XP

**Items**
- `POST /api/items/:itemId/request-comp` — trigger AI comp lookup
- `GET  /api/items/:itemId/comp-result` — poll for comp result
- `PATCH /api/items/:itemId/high-value` — `{ isHighValue: boolean, threshold?: number }`

**Lifecycle**
- `PATCH /api/sales/:saleId/lifecycle` — `{ stage: LifecycleStage }`

---

## TypeScript Interfaces

Add to `packages/shared/src/types/` (or a new `settlement.ts` file). Full definitions in architect spec §4.

Key interfaces needed:
- `SettlementWithDetails` — settlement + expenses[] + clientPayout + sale info
- `SaleExpenseInput` — `{ category, description, amount, vendorName?, receiptUrl? }`
- `ClientPayoutRequest` — `{ clientName, clientEmail, amount, method: 'STRIPE_CONNECT' | 'MANUAL' }`
- `SalePulseData` — `{ saleId, pageViews, itemSaves, shopperQuestions, buzzscore: number, shopperCount: number }`
- `OrganizerEfficiencyStats` — `{ avgPhotoToPublishMinutes, sellThroughRate, percentileRank, cohortSize, tips: string[] }`
- `SmartBuyerEntry` — `{ userId, displayName, avatarUrl, tier, xp, rank, isFollowing }`
- `HighValueItemAlert` — `{ itemId, title, photoUrl, price, threshold, status: 'FLAGGED'|'RESERVED'|'SOLD' }`
- `WeatherForecast` — `{ date, tempHigh, tempLow, condition: string, icon: string }`

---

## Frontend Components to Build

All in `packages/frontend/components/` unless noted. Use existing dark mode patterns.

### Dashboard Widgets (new files)
1. `SalePulseWidget.tsx` — engagement score card with buzz meter (progress bar 0-100), 3 sub-metrics, "Boost visibility" link
2. `SmartBuyerWidget.tsx` — "Who's Coming" card: shopper count by tier, top 3 avatar + rank chips, "See all" link
3. `HighValueTrackerWidget.tsx` — compact item list with photo thumbnails, inline status buttons (Reserve/Mark Sold/Unflag), threshold display
4. `EfficiencyCoachingWidget.tsx` — benchmark card: two stat rows (photo speed, sell-through %), percentile badge, "Tips to improve" expandable
5. `WeatherStrip.tsx` — thin horizontal strip: date + icon + high/low + condition text. Shows only if sale date ≤ 10 days away
6. `PostSaleMomentumCard.tsx` — appears in State 3 only: completed sale summary stats + "Start Next Sale" button (pre-fills create-sale form with prev sale data)

### Settlement Hub (new page + components)
7. `pages/organizer/settlement/[saleId].tsx` — 5-step wizard page (estate/consignment/auction) or simple card (yard sale)
8. `SettlementWizard.tsx` — step controller component (steps: SummaryReview → ExpenseEntry → CommissionCalc → ClientPayout → ReceiptClose)
9. `ExpenseLineItemList.tsx` — add/remove expense rows, category dropdown, running total
10. `CommissionCalculator.tsx` — editable commission %, shows organizer vs client split with visual breakdown
11. `ClientPayoutPanel.tsx` — payout form: client info, amount, method selector (Stripe/Manual), "Send Payout" button

### Dashboard Layout Update
12. `dashboard-sale-type-config.ts` — lookup object mapping `saleType` → `{ visibleWidgets[], primaryCTA, greeting, settlementType }`. NOT a component — a config file imported by dashboard.tsx

---

## Implementation Sequence

**Day 1 — Foundation**
1. Write migration file in `packages/database/prisma/migrations/`
2. Run `prisma migrate deploy` + `prisma generate` (Patrick runs locally against Railway DB)
3. Add TypeScript interfaces to `packages/shared/src/types/settlement.ts`
4. Verify `npx tsc --noEmit --skipLibCheck` passes in all packages

**Day 2-3 — Backend**
5. Create `packages/backend/src/controllers/settlementController.ts` — all settlement CRUD + payout
6. Create `packages/backend/src/routes/settlement.ts` — register settlement routes
7. Add widget endpoints to `packages/backend/src/routes/organizers.ts`:
   - `/sale-pulse/:saleId` — query SaleTransaction model; compute buzz score (views×0.3 + saves×0.4 + questions×0.3, normalized 0-100)
   - `/efficiency-stats` — query all organizer's sales; compute avg photo-to-publish, sell-through%; compare against organizer cohort (same saleType, similar volume)
   - `/smart-buyers/:saleId` — query Watchlist + UserXP for this sale's geography; return top shoppers sorted by XP desc
8. Add item comp + high-value endpoints to `packages/backend/src/routes/items.ts`
9. Add lifecycle endpoint to `packages/backend/src/routes/sales.ts`

**Day 4-5 — Frontend Widgets**
10. Build `dashboard-sale-type-config.ts` — define widget lists per sale type
11. Build all 6 dashboard widget components (SalePulse, SmartBuyer, HighValueTracker, EfficiencyCoaching, WeatherStrip, PostSaleMomentum)
12. Update `packages/frontend/pages/organizer/dashboard.tsx`:
    - Import `dashboard-sale-type-config.ts`
    - Conditionally render new widgets based on `saleType` and current state
    - IMPORTANT: Do NOT remove any existing widgets — only add new ones. Check UX spec component map.
    - Add "Settlement" quick action to State 3 (post-sale) section

**Day 5-6 — Settlement Pages**
13. Build `pages/organizer/settlement/[saleId].tsx` + wizard components
14. Wire "Settle This Sale" button into dashboard State 3 card + edit-sale page for ENDED sales
15. Add settlement link to existing post-sale quick actions

**Day 6 (mandatory gate)**
```bash
cd packages/frontend && npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | grep -v node_modules
```
Zero errors required. Fix all before returning.

---

## UX Hard Rules for Dev (from Patrick)

1. **No dead space.** Every new widget must have a CTA or link. A widget showing data with nowhere to go is not acceptable.
2. **Mobile-first.** Build each widget for 375px width first. Then desktop. Minimum tap target: 44px.
3. **Do NOT remove existing dashboard components.** The component map in the UX spec accounts for everything that exists. Add new things; don't remove old ones.
4. **Every widget needs an empty state.** If no data: don't show a blank card. Show a message like "Your sale hasn't gone live yet — come back when shoppers start browsing."
5. **Dark mode parity.** Every component needs `dark:` class variants. Check existing cards in dashboard.tsx for the established pattern.
6. **Settlement is post-sale only.** The "Settle This Sale" entry point should ONLY appear for ENDED sales. Not for DRAFT or PUBLISHED.
7. **Sale-type-aware copy.** Estate sale = "Client Payout" / "Executor." Consignment = "Consignor." Auction = "Seller." Yard sale = "Your earnings." Don't use generic "client" for all types.

---

## Files to Create (new)
- `packages/database/prisma/migrations/20260401_settlement_hub_dashboard_widgets/migration.sql`
- `packages/shared/src/types/settlement.ts`
- `packages/backend/src/controllers/settlementController.ts`
- `packages/backend/src/routes/settlement.ts`
- `packages/frontend/components/SalePulseWidget.tsx`
- `packages/frontend/components/SmartBuyerWidget.tsx`
- `packages/frontend/components/HighValueTrackerWidget.tsx`
- `packages/frontend/components/EfficiencyCoachingWidget.tsx`
- `packages/frontend/components/WeatherStrip.tsx`
- `packages/frontend/components/PostSaleMomentumCard.tsx`
- `packages/frontend/components/SettlementWizard.tsx`
- `packages/frontend/components/ExpenseLineItemList.tsx`
- `packages/frontend/components/CommissionCalculator.tsx`
- `packages/frontend/components/ClientPayoutPanel.tsx`
- `packages/frontend/pages/organizer/settlement/[saleId].tsx`
- `packages/frontend/lib/dashboard-sale-type-config.ts`

## Files to Modify (existing)
- `packages/database/prisma/schema.prisma` — add new models + Sale/Item fields
- `packages/backend/src/routes/organizers.ts` — add widget endpoints
- `packages/backend/src/routes/items.ts` — add comp + high-value endpoints
- `packages/backend/src/routes/sales.ts` — add lifecycle endpoint
- `packages/frontend/pages/organizer/dashboard.tsx` — add new widgets + sale-type config
- `packages/frontend/pages/organizer/edit-sale/[id].tsx` — add "Settle This Sale" action for ENDED sales

---

## Reference Files for Dev
- Full Prisma models: `claude_docs/feature-notes/dashboard-makeover-architect-spec-S367.md` §1
- Full TypeScript interfaces: same file §4
- Full API contracts: same file §5
- UX widget specs: `claude_docs/feature-notes/dashboard-makeover-ux-spec-S367.md` §3
- Settlement Hub flow steps: same file §4
- Component map (what exists today): same file §1
