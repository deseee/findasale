# ADR — Retail Gap Features #309 / #310 / #311 — 2026-04-21

## Decision

Implement three TEAMS-tier retail features in a single schema migration:
- **#309** Consignor Portal & Payouts
- **#310** Color-tagged Discount Rules
- **#311** Multi-Location Inventory View

All three are gated to `subscriptionTier = TEAMS`. All three touch the `Item` model and must ship in one consolidated migration to avoid FK conflicts.

---

## Schema Changes

### New Models

```prisma
// #309: Consignor Portal
model Consignor {
  id             String           @id @default(cuid())
  workspaceId    String
  workspace      OrganizerWorkspace @relation("WorkspaceConsignors", fields: [workspaceId], references: [id], onDelete: Cascade)
  name           String
  email          String?
  phone          String?
  commissionRate Decimal          @db.Decimal(5, 2) // e.g. 70.00 = 70%
  notes          String?          @db.Text
  portalToken    String           @unique @default(cuid()) // permanent token for portal URL
  items          Item[]           @relation("ConsignorItems")
  payouts        ConsignorPayout[]
  createdAt      DateTime         @default(now())
  updatedAt      DateTime         @updatedAt

  @@index([workspaceId])
  @@index([portalToken])
}

model ConsignorPayout {
  id               String     @id @default(cuid())
  consignorId      String
  consignor        Consignor  @relation(fields: [consignorId], references: [id], onDelete: Cascade)
  saleId           String?
  sale             Sale?      @relation("ConsignorPayouts", fields: [saleId], references: [id], onDelete: SetNull)
  totalSales       Decimal    @db.Decimal(10, 2)
  commissionAmount Decimal    @db.Decimal(10, 2) // = totalSales * commissionRate / 100
  netPayout        Decimal    @db.Decimal(10, 2) // = commissionAmount (extensible for deductions)
  method           String?    // "CASH" | "CHECK" | "VENMO" | "OTHER"
  paidAt           DateTime?
  notes            String?
  createdAt        DateTime   @default(now())

  @@index([consignorId])
  @@index([saleId])
}

// #310: Color-tagged Discount Rules
model DiscountRule {
  id              String             @id @default(cuid())
  workspaceId     String
  workspace       OrganizerWorkspace @relation("WorkspaceDiscountRules", fields: [workspaceId], references: [id], onDelete: Cascade)
  tagColor        String             // hex e.g. "#EF4444" or label e.g. "red"
  label           String             // human label e.g. "25% Off — Red Tag"
  discountPercent Decimal            @db.Decimal(5, 2) // e.g. 25.00
  activeFrom      DateTime?
  activeTo        DateTime?
  createdAt       DateTime           @default(now())
  updatedAt       DateTime           @updatedAt

  @@index([workspaceId])
  @@index([workspaceId, tagColor])
}

// #311: Multi-Location
model Location {
  id          String             @id @default(cuid())
  workspaceId String
  workspace   OrganizerWorkspace @relation("WorkspaceLocations", fields: [workspaceId], references: [id], onDelete: Cascade)
  name        String
  address     String?
  phone       String?
  managerId   String?
  manager     User?              @relation("LocationManager", fields: [managerId], references: [id], onDelete: SetNull)
  sales       Sale[]             @relation("LocationSales")
  items       Item[]             @relation("LocationItems")
  createdAt   DateTime           @default(now())
  updatedAt   DateTime           @updatedAt

  @@index([workspaceId])
}
```

### Modified Models

**OrganizerWorkspace** — add reverse relations:
```prisma
consignors    Consignor[]    @relation("WorkspaceConsignors")
discountRules DiscountRule[] @relation("WorkspaceDiscountRules")
locations     Location[]     @relation("WorkspaceLocations")
```

**Item** — three field changes:
```prisma
// CHANGE: consignorId FK moves from User → Consignor
// Old: consignor User? @relation("ConsignedItems", ...)
// New:
consignorId  String?    // now FKs Consignor, not User
consignor    Consignor? @relation("ConsignorItems", fields: [consignorId], references: [id], onDelete: SetNull)

// ADD:
tagColor     String?    // e.g. "#EF4444" — set by organizer in item editor
locationId   String?
location     Location?  @relation("LocationItems", fields: [locationId], references: [id], onDelete: SetNull)
```

**Sale** — add locationId:
```prisma
locationId String?
location   Location? @relation("LocationSales", fields: [locationId], references: [id], onDelete: SetNull)
consignorPayouts ConsignorPayout[] @relation("ConsignorPayouts")
```

**User** — remove old pre-wire relation:
```prisma
// REMOVE: consignedItems Item[] @relation("ConsignedItems")
```

---

## Migration Plan

**File:** `packages/database/prisma/migrations/20260421000000_retail_gap_309_310_311/migration.sql`

**Ordered SQL:**
```sql
-- 1. Create Consignor (before Item FK change)
CREATE TABLE "Consignor" ( ... );

-- 2. Create ConsignorPayout
CREATE TABLE "ConsignorPayout" ( ... );

-- 3. Create DiscountRule
CREATE TABLE "DiscountRule" ( ... );

-- 4. Create Location
CREATE TABLE "Location" ( ... );

-- 5. Item: drop old User FK on consignorId, nullify stale data, add new Consignor FK
ALTER TABLE "Item" DROP CONSTRAINT IF EXISTS "Item_consignorId_fkey";
UPDATE "Item" SET "consignorId" = NULL WHERE "consignorId" IS NOT NULL;
ALTER TABLE "Item" ADD CONSTRAINT "Item_consignorId_fkey"
  FOREIGN KEY ("consignorId") REFERENCES "Consignor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 6. Item: add tagColor and locationId
ALTER TABLE "Item" ADD COLUMN "tagColor" TEXT;
ALTER TABLE "Item" ADD COLUMN "locationId" TEXT;
ALTER TABLE "Item" ADD CONSTRAINT "Item_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Item_locationId_idx" ON "Item"("locationId");

-- 7. Sale: add locationId and relation
ALTER TABLE "Sale" ADD COLUMN "locationId" TEXT;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Sale_locationId_idx" ON "Sale"("locationId");

-- 8. Indexes
CREATE INDEX "Consignor_workspaceId_idx" ON "Consignor"("workspaceId");
CREATE UNIQUE INDEX "Consignor_portalToken_key" ON "Consignor"("portalToken");
CREATE INDEX "ConsignorPayout_consignorId_idx" ON "ConsignorPayout"("consignorId");
CREATE INDEX "DiscountRule_workspaceId_tagColor_idx" ON "DiscountRule"("workspaceId", "tagColor");
CREATE INDEX "Location_workspaceId_idx" ON "Location"("workspaceId");
```

**Patrick must run after push:**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

## Rollback: 20260421000000_retail_gap_309_310_311

Down migration:
```sql
ALTER TABLE "Item" DROP CONSTRAINT IF EXISTS "Item_locationId_fkey";
ALTER TABLE "Item" DROP COLUMN IF EXISTS "locationId";
ALTER TABLE "Item" DROP COLUMN IF EXISTS "tagColor";
ALTER TABLE "Item" DROP CONSTRAINT IF EXISTS "Item_consignorId_fkey";
-- Restore old User FK (data already nullified — no recovery needed)
ALTER TABLE "Item" ADD CONSTRAINT "Item_consignorId_fkey"
  FOREIGN KEY ("consignorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Sale" DROP CONSTRAINT IF EXISTS "Sale_locationId_fkey";
ALTER TABLE "Sale" DROP COLUMN IF EXISTS "locationId";
DROP TABLE IF EXISTS "ConsignorPayout";
DROP TABLE IF EXISTS "Consignor";
DROP TABLE IF EXISTS "DiscountRule";
DROP TABLE IF EXISTS "Location";
```

Playbook: "If Railway deploy fails after migration, run the down migration above against Railway DB using the same DATABASE_URL override. Then redeploy the previous commit."

---

## API Contracts

### #309 Consignor

All routes require `authenticate` + TEAMS tier check. Portal route is public.

```
GET    /api/consignors                    → list consignors for organizer's workspace
POST   /api/consignors                    → create consignor { name, email?, phone?, commissionRate, notes? }
GET    /api/consignors/:id                → get consignor + items + payout history
PUT    /api/consignors/:id                → update consignor fields
DELETE /api/consignors/:id                → delete (only if no payouts)
POST   /api/consignors/:id/payout         → run payout { saleId?, method, notes? }
                                             → computes totalSales from Item.status=SOLD for this consignor+sale
                                             → creates ConsignorPayout record
                                             → returns payout summary
GET    /api/consignors/portal/:token      → PUBLIC (no auth) — consignor portal view
                                             → returns { consignor: { name }, items: [...], payouts: [...] }
```

### #310 Discount Rules

All routes require `authenticate` + TEAMS tier check.

```
GET    /api/discount-rules               → list active rules for organizer's workspace
POST   /api/discount-rules               → create { tagColor, label, discountPercent, activeFrom?, activeTo? }
PUT    /api/discount-rules/:id           → update rule
DELETE /api/discount-rules/:id           → delete rule
```

**Price resolution (in itemController, not a separate endpoint):**
When returning items in any listing (sale detail, inventory, search), the backend computes:
```typescript
// Pseudocode — implement in a shared helper getEffectivePrice(item, activeRules)
const activeRule = activeRules.find(r =>
  r.tagColor === item.tagColor &&
  (!r.activeFrom || r.activeFrom <= now) &&
  (!r.activeTo || r.activeTo >= now)
);
const effectivePrice = activeRule && item.price
  ? item.price * (1 - activeRule.discountPercent.toNumber() / 100)
  : item.price;
```

Pass `activeRules` into item-listing queries as a pre-fetched array (fetch once per request, not per item). Add `effectivePrice: number | null` and `tagColor: string | null` to item response shape.

### #311 Locations

All routes require `authenticate` + TEAMS tier check.

```
GET    /api/locations                    → list locations for workspace
POST   /api/locations                    → create { name, address?, phone?, managerId? }
PUT    /api/locations/:id                → update
DELETE /api/locations/:id                → delete (block if items/sales assigned)
POST   /api/locations/:id/transfer       → { itemIds: string[], toLocationId: string }
                                            → bulk update Item.locationId
GET    /api/locations/:id/inventory      → items at this location (filter of existing inventory endpoint)
```

---

## Architectural Decisions

**1. Workspace FK, not Organizer FK**
All three models use `workspaceId → OrganizerWorkspace`. Rationale: these are explicitly TEAMS features; workspace is the TEAMS construct. Organizers on PRO/SIMPLE cannot create these records (blocked at API tier check). No fallback to Organizer needed — if a TEAMS organizer hasn't set up a workspace, the workspace creation wizard handles that first.

**2. DiscountRule resolution at query time, not cached on Item**
Caching effectivePrice on Item would require cache invalidation whenever a DiscountRule changes (activeFrom/activeTo). Query-time resolution is cleaner: fetch the workspace's active rules once per request, compute effectivePrice in-memory per item. At typical sale sizes (50–200 items) this is negligible. Revisit if performance profiling reveals a problem.

**3. consignorPortalToken — permanent, no expiry (MVP)**
A cuid() is generated at Consignor creation and stored on the model. No expiry for MVP. The token is effectively a capability URL — hard to guess, sufficient for low-stakes consignment visibility. Organizers can regenerate by deleting and re-creating the consignor record if needed. Add explicit token rotation in a future sprint if consignors request it.

**4. Item.consignorId FK migration — data loss is intentional**
The existing pre-wire `consignorId` values point to User IDs, not Consignor IDs. There are no real consignors in production yet (confirmed by DB: field was a pre-wire). Nullifying all existing values before changing the FK is correct and safe. No data recovery needed.

**5. Consignor Portal is read-only for MVP**
Consignor visits `/consignor/portal/[token]` → sees their items and payout history. No login, no action buttons. Organizer runs payouts from their management page. Future: add dispute/approval flow when consignors request it (per Patrick's note).

---

## Dev Instructions (Ordered)

### Phase 1 — Schema (one dispatch, blocks everything else)

1. Update `packages/database/prisma/schema.prisma`:
   - Add `Consignor`, `ConsignorPayout`, `DiscountRule`, `Location` models
   - Modify `Item`: change `consignor` relation from User → Consignor, add `tagColor`, add `locationId`
   - Modify `Sale`: add `locationId`
   - Modify `OrganizerWorkspace`: add reverse relations
   - Remove `consignedItems` from `User` model
2. Create migration file per the SQL above
3. Run `npx tsc --noEmit --skipLibCheck` — zero errors required
4. Return changed files list

### Phase 2 — Backend (three parallel dispatches after Phase 1)

**Dispatch A — Consignor controller:**
- `packages/backend/src/controllers/consignorController.ts` (CRUD + payout + portal)
- `packages/backend/src/routes/consignors.ts` (register routes)
- Wire into `packages/backend/src/index.ts`
- TEAMS tier gate on all routes except portal
- Portal route: `GET /api/consignors/portal/:token` — no `authenticate` middleware, looks up by portalToken
- Payout logic: sum `Item.price` where `consignorId = consignor.id AND status = 'SOLD'` for the given saleId (or all sales if no saleId), apply `commissionRate`, create `ConsignorPayout` record

**Dispatch B — DiscountRule controller + item price resolution:**
- `packages/backend/src/controllers/discountRuleController.ts` (CRUD)
- `packages/backend/src/routes/discountRules.ts`
- Wire into index.ts
- Update `itemController.ts`: add `getEffectivePrice` helper, include `effectivePrice` and `tagColor` in item response shapes for `/api/items`, `/api/sales/:id` item lists, inventory endpoints
- Pre-fetch active DiscountRules once per request (by workspaceId), pass array into item mapping

**Dispatch C — Location controller:**
- `packages/backend/src/controllers/locationController.ts` (CRUD + transfer)
- `packages/backend/src/routes/locations.ts`
- Wire into index.ts
- Transfer endpoint: validate both locations belong to same workspace before updating
- Delete guard: return 409 if location has assigned items or sales
- Inventory filter: `GET /api/locations/:id/inventory` → reuse existing inventory query with `locationId` filter added

### Phase 3 — Frontend (three parallel dispatches after Phase 2)

**Dispatch D — Consignor pages:**
- `pages/organizer/consignors.tsx` — management page: list consignors, create/edit modal, payout button
- `components/ConsignorPayoutModal.tsx` — show items for consignor, confirm payout, select method
- `pages/consignor/portal/[token].tsx` — public portal: no auth, fetch `/api/consignors/portal/:token`, show items + payout history
- TEAMS gate on management page (TierGate component)

**Dispatch E — Color-tag discount pages:**
- `pages/organizer/color-rules.tsx` — list discount rules, create/edit/delete, color swatch preview
- Add `TagColorPicker` to existing item editor (edit-item page) — color swatch selector, sets `tagColor`
- Add `ColorKeyLegend` to `pages/sales/[id].tsx` — if sale has active discount rules, show color legend (fetch from `/api/discount-rules` for the sale's organizer workspace)
- Show `effectivePrice` alongside `price` on item cards when different (strikethrough original)

**Dispatch F — Location pages:**
- `pages/organizer/locations.tsx` — list locations, CRUD, transfer items modal
- Add `LocationSelector` dropdown to `pages/organizer/create-sale.tsx` — sets `locationId`
- Add `LocationSelector` to item editor — sets `locationId`
- Add location filter to inventory page (`pages/organizer/items/index.tsx`) — dropdown, passes `locationId` query param

---

## Patrick Decisions Needed

None blocking dev start. One future consideration flagged:
- **Portal token rotation**: For MVP, permanent token is fine. If any consignor reports a security concern (shared link, token leaked), the path is: add `POST /api/consignors/:id/rotate-portal-token` endpoint. Note in decisions-log when this comes up.

---

## Rationale

These three features together close the gap vs Ricochet and SimpleConsign for RETAIL-type organizers running consignment, thrift, or multi-location operations. Single migration minimizes deployment risk. Query-time price resolution avoids a cache layer that isn't justified at current scale.

---

## Context Checkpoint: No
