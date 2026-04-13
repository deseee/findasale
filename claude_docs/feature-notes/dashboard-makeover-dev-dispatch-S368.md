# Dev Dispatch — Dashboard Makeover Phase 1 (S368)

**To:** findasale-dev
**Date:** 2026-04-01
**Spec files (read ALL before writing a single line of code):**
- `claude_docs/feature-notes/dashboard-makeover-architect-spec-S367.md` — schema, interfaces, API contracts
- `claude_docs/feature-notes/dashboard-makeover-ux-spec-S367.md` — widget specs, settlement flow, component map
- `claude_docs/feature-notes/dashboard-makeover-dev-brief-S367.md` — locked decisions, implementation sequence

---

## Mandatory Pre-Flight (do these before anything else)

1. Read `packages/database/prisma/schema.prisma` in full — confirm every field you reference exists.
2. Read `packages/frontend/pages/organizer/dashboard.tsx` in full — understand current state before touching it.
3. Read `packages/frontend/pages/organizer/edit-sale/[id].tsx` in full.
4. Read `packages/backend/src/routes/organizers.ts` in full.
5. Read `packages/backend/src/routes/app.ts` or wherever routers are registered — you'll need to register the new settlement router.
6. Check `packages/frontend/pages/organizer/settings.tsx` — confirm whether `defaultCommissionRate` field exists on the Organizer model in schema. If not, add it to schema with this migration.

---

## Locked Decisions (do not deviate)

- Commission rate: `defaultCommissionRate` on Organizer profile (auto-fills settlement), overridable per-sale in `SaleSettlement.commissionRate`
- Flea market vendor splits: DO NOT BUILD. Phase 2.
- Multi-consignor: DO NOT BUILD. Phase 2. One payout to one executor only.
- Efficiency Coaching: feature-gated, NOT tier-gated. Show coaching metrics based on what the organizer has actually used (photos uploaded → photo speed metric; sales completed → sell-through metric). Never hide based on subscription tier.
- Tax receipts: Phase 2. Do not build in this dispatch.
- Settlement is POST-SALE ONLY. The "Settle This Sale" entry point must only appear for `status === 'ENDED'` sales.

---

## Phase 1 Scope (build all of this)

### A. Schema Migration

Migration name: `20260401_settlement_hub_dashboard_widgets`

Add to `packages/database/prisma/schema.prisma`:

**New models** (full Prisma syntax in architect spec §1.1):
- `SaleSettlement`
- `SaleExpense`
- `ClientPayout`
- `SaleTransaction`

**Additions to existing models:**
```prisma
// On Sale model:
lifecycleStage  String    @default("LEAD")
commissionRate  Decimal?
settlementNotes String?

// On Item model:
isHighValue          Boolean   @default(false)
highValueThreshold   Decimal?
aiSuggestedPrice     Decimal?

// On Organizer model (check if exists first):
defaultCommissionRate Decimal?
```

Also add to `Sale` model a relation: `settlement SaleSettlement?`

After writing migration SQL, run:
```bash
cd packages/database && npx prisma validate
```
Zero errors required before proceeding.

---

### B. Shared TypeScript Types

Create `packages/shared/src/types/settlement.ts` with these interfaces (full shapes in architect spec §4):
- `SettlementWithDetails`
- `SaleExpenseInput`
- `ClientPayoutRequest`
- `SalePulseData`
- `OrganizerEfficiencyStats`
- `SmartBuyerEntry`
- `HighValueItemAlert`
- `WeatherForecast`
- `DashboardSaleTypeConfig`

Export all from `packages/shared/src/types/index.ts` (check current exports first — do not overwrite existing ones).

---

### C. Backend: New Settlement Controller + Routes

Create `packages/backend/src/controllers/settlementController.ts`:

```typescript
// Functions to implement:
getSettlement(req, res)        // GET /api/sales/:saleId/settlement
createSettlement(req, res)     // POST /api/sales/:saleId/settlement
updateSettlement(req, res)     // PATCH /api/sales/:saleId/settlement
addExpense(req, res)           // POST /api/sales/:saleId/settlement/expenses
removeExpense(req, res)        // DELETE /api/sales/:saleId/settlement/expenses/:expenseId
initiateClientPayout(req, res) // POST /api/sales/:saleId/settlement/payout
```

All endpoints: organizer-auth required. Validate that the sale belongs to the requesting organizer before any operation.

`createSettlement`: auto-calculate `totalRevenue` by summing all `Purchase` records (status: PAID) for the sale. Set `platformFeeAmount` = totalRevenue × 0.10. Set `netProceeds` = totalRevenue - platformFeeAmount - totalExpenses (0 at creation).

`initiateClientPayout`: if organizer has `stripeAccountId`, create Stripe Connect transfer. If not, return `{ method: 'MANUAL', message: 'Set up Stripe Connect in your settings to send digital payouts.' }` — do NOT error. Always allow manual marking.

Create `packages/backend/src/routes/settlement.ts` — wire all 6 endpoints.

**Register in app.ts/index.ts:** `app.use('/api', settlementRouter)` — verify the prefix matches how other routes are registered.

---

### D. Backend: Dashboard Widget Endpoints

Add to `packages/backend/src/routes/organizers.ts`:

**GET `/api/organizers/sale-pulse/:saleId`**
Query: count of `SaleTransaction` records for this sale (pageViews, itemSaves, questions). Compute buzz score: `Math.min(100, Math.round((pageViews * 0.3 + itemSaves * 0.4 + questions * 0.3) / 5))`. Return: `{ saleId, pageViews, itemSaves, shopperQuestions, buzzScore, shopperCount }`. If `SaleTransaction` table is empty (it will be for existing sales), return zeros gracefully — do NOT error.

**GET `/api/organizers/efficiency-stats`**
Feature-gated logic (not tier-gated):
- Only include `photoPublishTimeMinutes` metric if organizer has at least 3 sales with items that have photos
- Only include `sellThroughRate` metric if organizer has at least 1 completed (ENDED) sale
- Compare against cohort: other organizers with same `saleType` and at least 3 sales. If cohort < 5 organizers, omit percentile (return `percentileRank: null`)
- Return: `{ metrics: [{ key, label, value, unit, percentileRank, tip }] }`
- Each metric has a `tip` string — write contextual copy, e.g. "Top organizers publish within 30 minutes of the last photo." Keep it coaching, not critical.

**GET `/api/organizers/smart-buyers/:saleId`**
Query `Watchlist` model for users watching this sale, join with `User` (guildXp, explorerRank, huntPassActive). Return top 10 sorted by guildXp desc. Format: `{ total, topBuyers: [{ userId, displayName, avatarUrl, tier, xp, rank, isFollowing }] }`. If `Watchlist` doesn't exist or has no records, return `{ total: 0, topBuyers: [] }` — do NOT error.

---

### E. Backend: Item Endpoints

Add to `packages/backend/src/routes/items.ts`:

**PATCH `/api/items/:itemId/high-value`**
Body: `{ isHighValue: boolean, threshold?: number }`
Auth: organizer who owns the sale this item belongs to.
Update `Item.isHighValue` and optionally `Item.highValueThreshold`. Return updated item.

**PATCH `/api/sales/:saleId/lifecycle`** (add to sales routes)
Body: `{ stage: string }` — validate against allowed values: LEAD, CONTRACTED, PREP, LIVE, POST_SALE, CLOSED.
Auth: organizer who owns the sale.
Update `Sale.lifecycleStage`. Return updated sale.

---

### F. Frontend: Dashboard Sale-Type Config

Create `packages/frontend/lib/dashboard-sale-type-config.ts`:

```typescript
export type SaleType = 'ESTATE' | 'YARD' | 'AUCTION' | 'FLEA_MARKET' | 'CONSIGNMENT' | 'OTHER'

export interface SaleTypeConfig {
  greeting: string           // "Managing your estate sale" / "Running your yard sale" etc.
  settlementType: 'FULL' | 'SIMPLE' | 'NONE'  // FULL=wizard, SIMPLE=3-field card, NONE=n/a
  settlementLabel: string    // "Client Payout" / "Your Earnings" / "Consignor Payout"
  clientLabel: string        // "Executor" / "N/A" / "Consignor"
  showSalePulse: boolean
  showSmartBuyers: boolean
  showHighValueTracker: boolean
  showEfficiencyCoaching: boolean
  showWeatherStrip: boolean
  showSettlementPostSale: boolean
}

export const SALE_TYPE_CONFIG: Record<SaleType, SaleTypeConfig> = {
  ESTATE: {
    greeting: 'Managing your estate sale',
    settlementType: 'FULL',
    settlementLabel: 'Client Payout',
    clientLabel: 'Executor',
    showSalePulse: true,
    showSmartBuyers: true,
    showHighValueTracker: true,
    showEfficiencyCoaching: true,
    showWeatherStrip: true,
    showSettlementPostSale: true,
  },
  YARD: {
    greeting: 'Running your yard sale',
    settlementType: 'SIMPLE',
    settlementLabel: 'Your Earnings',
    clientLabel: 'N/A',
    showSalePulse: true,
    showSmartBuyers: true,
    showHighValueTracker: false,
    showEfficiencyCoaching: true,
    showWeatherStrip: true,
    showSettlementPostSale: true,
  },
  AUCTION: {
    greeting: 'Managing your auction',
    settlementType: 'FULL',
    settlementLabel: 'Seller Payout',
    clientLabel: 'Seller',
    showSalePulse: true,
    showSmartBuyers: true,
    showHighValueTracker: true,
    showEfficiencyCoaching: true,
    showWeatherStrip: true,
    showSettlementPostSale: true,
  },
  FLEA_MARKET: {
    greeting: 'Managing your flea market',
    settlementType: 'SIMPLE',
    settlementLabel: 'Booth Revenue',
    clientLabel: 'Vendors',
    showSalePulse: true,
    showSmartBuyers: true,
    showHighValueTracker: false,
    showEfficiencyCoaching: true,
    showWeatherStrip: true,
    showSettlementPostSale: false,  // Phase 2 — flea market vendor settlement not built yet
  },
  CONSIGNMENT: {
    greeting: 'Managing your consignment sale',
    settlementType: 'FULL',
    settlementLabel: 'Consignor Payout',
    clientLabel: 'Consignor',
    showSalePulse: true,
    showSmartBuyers: true,
    showHighValueTracker: true,
    showEfficiencyCoaching: true,
    showWeatherStrip: true,
    showSettlementPostSale: true,
  },
  OTHER: {
    greeting: 'Managing your sale',
    settlementType: 'SIMPLE',
    settlementLabel: 'Your Earnings',
    clientLabel: 'N/A',
    showSalePulse: true,
    showSmartBuyers: true,
    showHighValueTracker: false,
    showEfficiencyCoaching: true,
    showWeatherStrip: true,
    showSettlementPostSale: true,
  },
}

export function getSaleTypeConfig(saleType?: string | null): SaleTypeConfig {
  return SALE_TYPE_CONFIG[(saleType as SaleType) ?? 'OTHER'] ?? SALE_TYPE_CONFIG.OTHER
}
```

---

### G. Frontend: New Widget Components

Build each widget in `packages/frontend/components/`. All must follow these rules:
- Dark mode: every element needs `dark:` variants. Check dashboard.tsx existing cards for the pattern.
- Loading state: show skeleton or spinner. Never show empty-looking card.
- Empty state: show friendly copy, not blank space. See UX spec §6 for copy.
- Mobile-first: design for 375px. Minimum tap target 44px for any button.
- Every widget must have at least one actionable link or button. No data-only dead ends.

**`SalePulseWidget.tsx`**
Props: `{ saleId: string }`
Fetches: `GET /api/organizers/sale-pulse/:saleId`
Layout: card header "Sale Buzz", buzz meter (progress bar 0–100, color: green >60, amber 30–60, gray <30), three sub-metrics in a row (👁 Views, ❤️ Saves, 💬 Questions).
Action button: "Boost Visibility" → links to `/organizer/promote` (or opens SharePromoteModal if that's already wired on dashboard — check).
Empty state: "Your sale hasn't gone live yet — check back once shoppers start browsing."

**`SmartBuyerWidget.tsx`**
Props: `{ saleId: string }`
Fetches: `GET /api/organizers/smart-buyers/:saleId`
Layout: card header "Who's Coming", shopper count badge, up to 3 avatar chips (avatar + rank name). Rank colors: Initiate=gray, Scout=green, Ranger=blue, Sage=purple, Grandmaster=amber.
Action button: "See all" → links to `/organizer/sale-attendees/${saleId}` — **this page does not exist yet, so link to it but add a TODO comment that the page needs building in Phase 2. For now, "See all" can open a modal listing all shoppers in the API response.**
Empty state: "No shoppers are watching this sale yet. Share it to get people interested."

**`HighValueTrackerWidget.tsx`**
Props: `{ saleId: string, items: Item[] }` — receive filtered high-value items from parent OR fetch `GET /api/organizers/sales/:saleId/items?highValue=true` if that query param is supported. Check existing item endpoints first.
Layout: card header "High-Value Items" + count badge. Compact list rows: item thumbnail (40px), name (truncate), price. Three inline action buttons per row: "Reserve", "Mark Sold", "Unflag".
"Reserve" → calls existing hold/reservation endpoint.
"Mark Sold" → calls existing mark-sold endpoint.
"Unflag" → calls `PATCH /api/items/:itemId/high-value` with `{ isHighValue: false }`.
Empty state: "No items flagged as high-value. Flag items from the Add Items page."
Add "Flag as High-Value" action to the existing item edit flow — check `packages/frontend/pages/organizer/add-items/[saleId]/review.tsx` and the item edit modal, add a toggle there.

**`EfficiencyCoachingWidget.tsx`**
Props: `{ organizerId: string }`
Fetches: `GET /api/organizers/efficiency-stats`
Layout: card header "Your Performance". Renders only the metrics returned by the API (remember: feature-gated on backend — don't assume both metrics always appear). Each metric row: label, value, percentile badge (if returned), tip text (expandable on tap). Color: green if percentile > 60, amber if 30–60, gray if < 30 or no percentile.
If API returns empty metrics array: show "Complete more sales to see your coaching insights here."

**`WeatherStrip.tsx`**
Props: `{ saleDate: string | null }`
Fetches: weather API for the sale's city/state. Use `NEXT_PUBLIC_WEATHER_API_KEY` env var. If key not set, do not render (return null gracefully).
Layout: thin horizontal strip (~40px tall). Date label on left, weather icon + high/low temp in center, condition text on right.
Only render if sale date is within 10 days. If past or > 10 days: return null.
**If weather API key is missing from env, skip this widget silently and add a TODO comment.** Do not let a missing API key break the dashboard.

**`PostSaleMomentumCard.tsx`**
Props: `{ completedSale: Sale }`
Shows only in dashboard State 3 (between sales, has ENDED sale).
Layout: full-width card. Header "Great work on [sale title]!". Three completed stats from the sale (items sold, total revenue if available, days live). Primary CTA button: "Start Your Next Sale" → navigates to `/organizer/create-sale?prefill=${completedSale.id}`.
**On the create-sale page** — check if it accepts a `prefill` query param. If not, the button can still link to `/organizer/create-sale` without prefill as a fallback. Add a TODO noting prefill is not wired.

---

### H. Frontend: Settlement Hub

**`pages/organizer/settlement/[saleId].tsx`** — new page

This is a multi-step wizard for estate/consignment/auction, and a simple card for yard/other.

Read the sale type on load: `GET /api/sales/:saleId` (or pull from the settlement API response). Use `getSaleTypeConfig(sale.saleType)` to determine `settlementType`.

If `settlementType === 'SIMPLE'`:
Render a single card with 3 fields: Gross Sales (read-only, from settlement), Expenses (single number input), Net Profit (computed). Save button: `POST /api/sales/:saleId/settlement` then `PATCH` to update. No wizard.

If `settlementType === 'FULL'`:
Render the `SettlementWizard` component with 5 steps. Progress indicator at top showing current step.

**`SettlementWizard.tsx`** — step controller
Steps array: `['Summary', 'Expenses', 'Commission', 'Payout', 'Receipt']`
Progress bar at top. Back/Next buttons. Step content swaps on state change.

Step 1 — Summary Review:
Fetch settlement (or create if none exists): `POST /api/sales/:saleId/settlement`.
Show: Total Gross Sales, Items Sold count, Unsold Items count.
CTA: "Start Settlement" → advances to Step 2.

Step 2 — Expenses (`ExpenseLineItemList.tsx`):
List of expense rows. Each row: category dropdown (HAULING/ADVERTISING/STAFF/SUPPLIES/VENUE/OTHER), description text input, amount number input, delete button.
"+ Add Expense" button appends a new empty row.
Running total displayed below list: "Total Expenses: $X.XX"
Saves each row on blur via `POST /api/sales/:saleId/settlement/expenses`.
Removes via `DELETE /api/sales/:saleId/settlement/expenses/:expenseId`.
Next button always enabled (0 expenses is valid).

Step 3 — Commission (`CommissionCalculator.tsx`):
Shows commission rate (pre-filled from `Organizer.defaultCommissionRate` or `SaleSettlement.commissionRate`). Editable inline number input with `%` suffix.
Below rate input, show breakdown table:
- Gross Sales: $X
- Platform Fee (10%): -$X
- Your Expenses: -$X
- Organizer Commission ([rate]%): $X
- **To Client ([clientLabel]):** $X (bold)
Updates live as rate is edited. Saves rate on blur via `PATCH /api/sales/:saleId/settlement`.
Use `getSaleTypeConfig(sale.saleType).clientLabel` for the label ("Executor" / "Consignor" / "Seller").

Step 4 — Client Payout (`ClientPayoutPanel.tsx`):
Fields: Client Name (text), Client Email (text, optional), Payout Amount (pre-filled, editable), Method toggle: "Send via Stripe" / "Mark as Paid Manually".
If "Send via Stripe" and organizer has stripeAccountId: show "Send Payout" button → `POST /api/sales/:saleId/settlement/payout`.
If "Send via Stripe" and NO stripeAccountId: show "Set up Stripe Connect first" with link to `/organizer/settings#stripe`.
If "Mark as Paid Manually": show date input + notes textarea. Save via `PATCH /api/sales/:saleId/settlement` with `{ clientPayoutStatus: 'PAID', clientPayoutMethod: 'MANUAL' }`.
Both paths advance to Step 5.

Step 5 — Receipt / Close:
Summary of all numbers (read-only, same breakdown as Step 3).
"Download Receipt" button → `GET /api/sales/:saleId/settlement/receipt`. For Phase 1 this can return a simple JSON response with the numbers — full PDF is Phase 2. If PDF not implemented, show "PDF receipt coming soon — here's your summary" with a printable breakdown.
"Mark Settlement Complete" button → `PATCH /api/sales/:saleId/settlement` with `{ lifecycleStage: 'CLOSED' }` + show success toast + navigate back to dashboard.

---

### I. Dashboard Integration (CRITICAL — read carefully)

**DO NOT REMOVE ANY EXISTING COMPONENTS.** Read the UX spec component map (§1) — every current element stays. You are only adding new widgets and sale-type awareness.

Open `packages/frontend/pages/organizer/dashboard.tsx`. Make these additions:

**1. Import the config:**
```typescript
import { getSaleTypeConfig } from '../../lib/dashboard-sale-type-config'
```

**2. Derive config from active sale:**
```typescript
const saleTypeConfig = getSaleTypeConfig(activeSale?.saleType ?? statsData?.activeSale?.saleType)
```
Note: check what field the sale type is actually called in the existing API response. It may be `type` not `saleType`. Confirm before writing.

**3. Expose `saleType` from the stats API** — check `packages/backend/src/routes/organizers.ts` stats endpoint. If `activeSale` in the response doesn't include `saleType` / `type`, add it to the Prisma select query.

**4. In State 2 (active sale section), add after the existing Sale Status Widget:**
- `<WeatherStrip saleDate={activeSale?.startDate} />` — thin strip, no card wrapper
- `<SalePulseWidget saleId={activeSale.id} />` — only if `saleTypeConfig.showSalePulse`
- `<SmartBuyerWidget saleId={activeSale.id} />` — only if `saleTypeConfig.showSmartBuyers`
- `<HighValueTrackerWidget saleId={activeSale.id} />` — only if `saleTypeConfig.showHighValueTracker`
- `<EfficiencyCoachingWidget organizerId={organizerId} />` — only if `saleTypeConfig.showEfficiencyCoaching`

**5. In State 3 (between sales / ENDED), replace or augment the existing past-sales section:**
- Add `<PostSaleMomentumCard completedSale={mostRecentEndedSale} />` at the top of State 3
- Add "Settle This Sale" button next to "Reopen" for each past sale row — only if `getSaleTypeConfig(sale.saleType).showSettlementPostSale` is true. Links to `/organizer/settlement/${sale.id}`.

**6. Sale-type-aware greeting** — in State 2, change the greeting/subheading to use `saleTypeConfig.greeting`. Keep existing structure, just swap the text.

---

### J. Edit-Sale Page Integration

Open `packages/frontend/pages/organizer/edit-sale/[id].tsx`.

For ENDED sales, add a "Settle This Sale" action button alongside the existing "Reopen" button. Only show if `getSaleTypeConfig(sale.saleType).showSettlementPostSale` is true.

Button: `<Link href={/organizer/settlement/${sale.id}} className="bg-green-600 hover:bg-green-700 text-white...">Settle This Sale</Link>`

---

### K. Navigation Wiring (CRITICAL — every new page needs a nav path)

The settlement page at `/organizer/settlement/[saleId]` is a **destination page only** (accessed from dashboard State 3 and edit-sale). It does NOT need a top-level nav link. But it MUST have:
- A back link in the page header: "← Back to Dashboard" linking to `/organizer/dashboard`
- Breadcrumb or title making clear where the user is: "Settlement — [Sale Title]"

The settlement page should also be linked from the organizer's sale list page (`/organizer/sales`) — add a "Settle" action to the ENDED sale rows there. Check if that page has a quick-actions pattern and follow it.

**Check Layout.tsx** — confirm there are no nav items that should link to settlement (there shouldn't be — it's always entered via a specific sale). If you see an opportunity to add it to the organizer "Your Sales" dropdown or section nav in the future, add a TODO comment.

---

### L. Knock-on Effects Checklist

Before returning, grep and verify each of these:

```bash
# 1. Stats API returns saleType — confirm this field is in the response
grep -r "activeSale" packages/backend/src/routes/organizers.ts

# 2. Settlement router is registered in app
grep -r "settlement" packages/backend/src/app.ts

# 3. No import from @findasale/shared that bypasses the package boundary
grep -r "from '@findasale/shared'" packages/frontend/src

# 4. SaleSettlement relation added to Sale model in schema
grep -A 5 "model Sale " packages/database/prisma/schema.prisma

# 5. Efficiency stats endpoint handles empty/new organizer gracefully (no crashes on 0 sales)
# Verify in code — wrap DB queries in try/catch, return empty metrics array on error

# 6. HighValueTrackerWidget "Flag" toggle wired into review.tsx item edit
grep -r "isHighValue" packages/frontend/pages/organizer/add-items
```

---

### M. TypeScript Gate (mandatory before returning)

```bash
cd packages/frontend && npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | grep -v node_modules
cd packages/backend && npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | grep -v node_modules
```

**Zero errors required.** Fix every error before returning output. Do not return partial output and ask if you should continue — fix and complete.

---

## Return Format

Return:
1. **Complete list of every file created or modified** (exact paths)
2. **Any decisions encountered that were NOT covered** by this brief (list them — do not make up answers)
3. **Any features that could not be fully implemented** due to missing data or API (mark as TODO with explanation)
4. **TypeScript check result** (paste the output of the two tsc commands above)
5. **Migration SQL** (paste the full migration.sql content so Patrick can verify before running)

Do NOT return code snippets of entire files. Return the file list and any specific sections that require Patrick review.
