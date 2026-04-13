# Architect Handoff — Dashboard Makeover + Settlement Hub — S367

**Date:** 2026-04-01
**Architect Session:** S367
**Status:** Complete — Ready for findasale-dev dispatch

---

## Decision Made

**Complete architecture defined for Tier 1 & 2 feature set:**
- Settlement Hub: commission calculator, expense tracker, client payout (stripe connect)
- AI Comp Tool: photo → eBay comparables → price suggestion
- Smart Buyer Intelligence: shopper XP/rank data → organizer insights
- High-Value Item Tracker: threshold-based flagging for special handling
- Dashboard Makeover: sale-type-adaptive widget layout (estate/yard/auction/flea-market/consignment)
- Efficiency Coaching: organizer benchmarking vs. peers
- Sale Pulse: real-time engagement score (views, saves, questions)
- Charity Close: unsold items → donation → tax receipt generation
- Weather Integration: forecast for sale dates
- Post-Sale Momentum: "start your next sale" prompt

**Core Design Constraint:** All schemas are sale-type-aware with optional-with-validation fields rather than polymorphic models. Yard sales and flea markets have minimal settlement; estate/consignment/auction have full settlement.

---

## Contract Defined

### Schema Changes
**7 new Prisma models:**
1. `SaleSettlement` — top-level settlement record with lifecycle stage, revenue, expenses, payout tracking
2. `SaleExpense` — line items (hauling, advertising, staff, supplies, venue, other)
3. `ClientPayout` — final payout record to homeowner/executor/consignor (Stripe Connect tracking)
4. `SaleTransaction` — buyer transaction records for analytics and Sale Pulse heatmap
5. `SaleWaiver` — digital waiver signatures (liability, returns policy, other)
6. `SaleDonation` — charity donation records with item count and pickup logistics
7. `TaxReceipt` — generated tax receipt PDFs for donations

**Additions to existing models:**
- `Sale`: add lifecycleStage, commissionRate, highValueThreshold, settlementNotes, deletedAt
- `Item`: add isHighValue, estimatedValue, aiSuggestedPrice, aiCompConfidence, aiCompSource, donatedAt, donationRecipient, donationStatus
- `Organizer`: add avgPhotoToPublishMinutes, avgSellThroughRate, totalSalesCompleted, defaultHighValueThreshold

**Enums (PostgreSQL):**
- `LifecycleStage` (LEAD | CONTRACTED | PREP | LIVE | POST_SALE | CLOSED)
- `ExpenseCategory` (HAULING | ADVERTISING | STAFF | SUPPLIES | VENUE | OTHER)
- `PayoutStatus` (PENDING | PROCESSING | PAID | FAILED)
- `DonationStatus` (PENDING | COMPLETED | RECEIPT_GENERATED)

### API Endpoints (16 total, all organizer-only)

**Settlement Hub (6 endpoints):**
- `GET /api/sales/:saleId/settlement` — fetch complete settlement with expenses + payout
- `POST /api/sales/:saleId/settlement` — initialize settlement
- `PATCH /api/sales/:saleId/settlement` — update notes/lifecycle
- `POST /api/sales/:saleId/settlement/expenses` — add expense line item
- `DELETE /api/sales/:saleId/settlement/expenses/:expenseId` — remove expense
- `POST /api/sales/:saleId/settlement/payout` — initiate Stripe Connect payout

**Dashboard Widgets (3 endpoints):**
- `GET /api/organizers/sale-pulse/:saleId` — engagement score (views, saves, questions, score)
- `GET /api/organizers/efficiency-stats` — benchmarking (photo-to-publish, sell-through vs peers)
- `GET /api/organizers/smart-buyers/:saleId` — shopper XP/rank data for upcoming buyers

**Items (2 endpoints):**
- `POST /api/items/:itemId/request-comp` — trigger AI comp tool
- `GET /api/items/:itemId/comp-result` — poll comp result
- `PATCH /api/items/:itemId/high-value` — flag as high-value

**Charity Close (2 endpoints):**
- `POST /api/sales/:saleId/charity-close` — initiate donation flow
- `POST /api/sales/:saleId/charity-close/generate-receipt` — create tax receipt PDF

**Lifecycle (1 endpoint):**
- `PATCH /api/sales/:saleId/lifecycle` — update sale lifecycle stage

### TypeScript Interfaces (14 types in packages/shared/src/types/settlement.ts)
- `SaleSettlementRecord`, `SettlementWithDetails`
- `SaleExpenseRecord`, `SaleExpenseInput`
- `ClientPayoutRecord`, `ClientPayoutRequest`
- `SaleTransactionRecord`, `SaleTransactionSummary`
- `HighValueItemAlert`, `HighValueItemBatch`
- `SalePulseData` (engagement score + trends)
- `OrganizerEfficiencyStats` (benchmarking + coaching message)
- `ItemCompResult` (price suggestion + comparables)
- `SmartBuyerAlert`, `SaleSmartBuyers`
- `DashboardLayoutConfig` (sale-type-aware widget config)
- `WeatherForecast`
- `DonationCloseRequest`, `DonationRecord`, `TaxReceiptData`
- `PostSaleMomentumPrompt`

---

## Migration Plan

**File:** `20260401-settlement-hub-schema.sql`

**DDL Operations (11 steps):**
1. Create 5 PostgreSQL enum types (LifecycleStage, ExpenseCategory, PayoutStatus, DonationStatus, HighValueStatus)
2. Create SaleSettlement table + indexes (3 indexes on saleId, lifecycleStage, clientPayoutStatus)
3. Create SaleExpense table + indexes (2 indexes)
4. Create ClientPayout table + indexes (2 indexes)
5. Create SaleTransaction table + indexes (3 indexes)
6. Create SaleWaiver table + indexes (2 indexes)
7. Create SaleDonation table + indexes (2 indexes)
8. Create TaxReceipt table + indexes (2 indexes)
9. ALTER Sale: add lifecycleStage, commissionRate, highValueThreshold, settlementNotes, deletedAt + indexes
10. ALTER Item: add isHighValue, highValueThreshold, estimatedValue, aiSuggestedPrice, aiCompConfidence, aiCompSource, aiCompLastUpdated, donatedAt, donationRecipient, donationStatus + indexes
11. ALTER Organizer: add avgPhotoToPublishMinutes, avgSellThroughRate, totalSalesCompleted, defaultHighValueThreshold, settlementAutoCalcExpenses

**Rollback:** Documented in spec §2.3. All DDL ops in reverse order.

---

## Dev Instructions (Dependency Order)

### Phase 1: Schema & Generation (Day 1)
1. Run migration: `cd packages/database && $env:DATABASE_URL="railway_connstr" npx prisma migrate deploy`
2. Verify tables: `npx prisma db execute --stdin < verify-tables.sql`
3. Generate Prisma client: `npx prisma generate`

### Phase 2: Backend API (Days 2–3)
4. Create `packages/backend/src/routes/settlement.ts` (6 endpoints)
5. Create `packages/backend/src/controllers/settlementController.ts` (settlement business logic + Stripe Connect integration)
6. Create `packages/backend/src/routes/dashboard.ts` (3 analytics endpoints)
7. Create `packages/backend/src/controllers/dashboardController.ts` (analytics queries, denormalization)
8. Extend `packages/backend/src/routes/items.ts` (+ comp endpoints)
9. Extend `packages/backend/src/controllers/itemController.ts` (+ AI comp: Claude + eBay API calls)
10. Extend `packages/backend/src/routes/sales.ts` (+ charity-close endpoints)
11. Extend `packages/backend/src/controllers/saleController.ts` (+ donation logic)
12. Update auth middleware: gate `/api/organizers/*` and `/api/sales/*/settlement*` to ORGANIZER role only
13. **TS check:** `cd packages/backend && npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | grep -v node_modules` → zero errors

### Phase 3: Shared Types (Day 2 parallel)
14. Create `packages/shared/src/types/settlement.ts` (all 14 TypeScript interfaces)
15. Export from `packages/shared/src/index.ts`
16. **TS check:** `cd packages/shared && npx tsc --noEmit --skipLibCheck` → zero errors

### Phase 4: Frontend Components (Days 4–5)
17. Create 8 new component files:
    - `packages/frontend/components/SettlementHub/SettlementSummary.tsx`
    - `packages/frontend/components/SettlementHub/ExpenseTracker.tsx`
    - `packages/frontend/components/SettlementHub/ClientPayoutFlow.tsx`
    - `packages/frontend/components/Dashboard/SalePulseWidget.tsx`
    - `packages/frontend/components/Dashboard/EfficiencyCoachingWidget.tsx`
    - `packages/frontend/components/Dashboard/SmartBuyerAlert.tsx`
    - `packages/frontend/components/Dashboard/HighValueItemTracker.tsx`
    - `packages/frontend/components/Modals/CharityCloseModal.tsx`
    - `packages/frontend/components/Modals/CompToolModal.tsx`

### Phase 5: Frontend Pages (Days 5–6)
18. Create `packages/frontend/pages/organizer/settlement/[saleId].tsx` (main settlement hub page)
19. Create `packages/frontend/lib/dashboard-config.ts` (widget config lookup)
20. Extend `packages/frontend/pages/organizer/dashboard.tsx` (conditional widget rendering per sale type)
21. Optionally extend `packages/frontend/pages/sales/[id].tsx` (if shopper-facing charity close needed; spec assumes organizer-only)

### Phase 6: QA (Day 6–7)
22. **TS check:** `cd packages/frontend && npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | grep -v node_modules` → zero errors
23. Manual Chrome QA (organizer-only; all authenticated as ORGANIZER):
    - **Estate sale:** Create settlement → add 3 expenses → request payout via Stripe → verify status pending
    - **Yard sale:** Verify settlement is minimal (no commission tracking)
    - **Auction sale:** Verify buyer premium fields present
    - **Consignment sale:** Verify consignor payout fields shown
    - **High-Value Tracker:** Flag 2 items above threshold → verify in dashboard
    - **AI Comp Tool:** Request comp on 2 items → verify results return within 45 seconds
    - **Charity Close:** Mark unsold items for donation → generate tax receipt → verify PDF downloads
    - **Sale Pulse:** Verify engagement score updates in real time (requires concurrent shopper activity)
    - **Efficiency Coaching:** Verify percentile calculation vs peers appears
    - **Smart Buyers:** Verify buyer rank/XP data visible for upcoming shoppers
24. Responsive testing: 375px (iPhone SE) → 768px (iPad) → 1920px (desktop)
25. Dark mode testing: toggle `prefers-color-scheme` in DevTools; verify all new components have `dark:` variants

---

## Flagged for Patrick

1. **Charity Close Tax Receipts:** Auto-mail PDF to organizer + charity, or download-only? → impacts email integration
2. **Flea Market Vendor Settlement:** Build vendor-split settlement (per-vendor payouts) in Phase 1, or defer to Phase 2? → changes SaleTransaction schema if Phase 1
3. **Commission Rate Input:** Editable per-sale before settlement, or locked per organizer tier? → affects UI complexity
4. **Shopper-Facing Donations:** Include "donate unsold items" CTA in checkout, or organizer-only admin flow? → impacts customer journey
5. **Efficiency Stats Refresh Frequency:** Every page load (fresh data), cached 1 hour (fast), or manual refresh button? → performance vs. data freshness tradeoff

---

## Context Checkpoint

**Yes** — Context used for:
- Schema design with sale-type optionality (not polymorphism)
- Enum definitions (LifecycleStage, ExpenseCategory, PayoutStatus)
- API contract design (organizer-only gates, async payout)
- Implementation sequence (dependency order, TS checks, QA protocol)
- Integration points with existing Stripe/Purchase/Item systems

**Spec includes:**
- 7 new Prisma models with complete field definitions and indexes
- 5 PostgreSQL enums
- 16 API endpoints with request/response shapes
- 14 TypeScript interfaces for all new/modified types
- Complete migration plan (DDL + rollback)
- 11-step implementation sequence with gates
- Sale-type widget configuration matrix
- 5 Patrick decision points

---

**Handoff complete. Spec file:** `/sessions/keen-loving-keller/mnt/FindaSale/claude_docs/feature-notes/dashboard-makeover-architect-spec-S367.md`

Ready for: `findasale-dev` (implementation), `findasale-qa` (end-to-end QA)
