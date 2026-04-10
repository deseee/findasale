# ADR-014: Repurposing Sale Hubs as Flea Market / Vendor Market Events

**Status:** APPROVED (Product + Architect)  
**Date:** 2026-04-10  
**Type:** Architecture redesign  
**Issue:** #40 (Sale Hubs), #238 (Flea Market Events)

---

## Summary

Sale Hubs (Feature #40, PRO tier) is being repurposed from a **shopper-focused geo-container for multiple organizers' sales** into a **vendor booth management platform for single-organizer flea markets / vendor markets**. The outer shell (geo-location, public landing page, map rendering, event metadata) is retained and reused. The internal membership model is completely replaced.

---

## Current State (Hubs v1)

| Concept | Current | Purpose |
|---------|---------|---------|
| **Hub** | Container linking 1 organizer's sales | Group sales geographically for shopper discovery |
| **SaleHubMembership** | Junction linking Sales → Hub | Organizer pools their own sales into hub |
| **Public landing** | `/hubs/:slug` | Shopper discovers grouped sales + map |
| **Tier** | PRO (backend enforced via `requireTier('PRO')`) | |
| **Recurring** | ❌ Not supported | |

---

## Target State (Flea Market v1)

| Concept | Target | Purpose |
|---------|--------|---------|
| **Hub** | Event container: one flea market event | Single event, one venue, multiple vendor booths |
| **VendorBooth** | Booth record: boothNumber, vendorName, fees, status | Individual vendor participation + payout calc |
| **SaleHubMembership** | ❌ REMOVED (data migrated or archived) | Replaced by VendorBooth |
| **Public landing** | `/hubs/:slug` + vendor directory | Shoppers see event map + vendor list (booth #, name, contact) |
| **Organizer mgmt** | Booth admin table: add/edit/remove vendors, set booth fees & revenue share | Event host manages booth assignments |
| **Payout model** | Per-vendor: boothFee + revenueSharePercent of vendor's sales (at organizer discretion) | Financial splitting between organizer and vendor |
| **Tier** | **DECISION NEEDED** (default: PRO) | Patrick: keep at PRO or promote to TEAMS? |
| **Recurring** | ✅ Support planned | `recurrenceRule` (WEEKLY/MONTHLY/NONE), `nextEventDate` |

---

## Schema Changes

### New VendorBooth Model

```prisma
model VendorBooth {
  id                 String   @id @default(cuid())
  hubId              String   // Links to the flea market event
  hub                SaleHub  @relation("VendorBooths", fields: [hubId], references: [id], onDelete: Cascade)
  
  boothNumber        String   // "A-1", "B-2", etc. (unique per hub + instanceId if recurring)
  vendorName         String   // Display name for shopper discovery
  vendorEmail        String?  // Contact for organizer workflow
  vendorPhone        String?  // Optional contact
  
  // Financials
  boothFee           Decimal  @default(0) // Fixed fee (e.g., $25 booth rental)
  revenueSharePercent Float   @default(0) // 0–100 (e.g., 10 = 10% of vendor's sales)
  
  // Status tracking
  status             String   @default("PENDING") // PENDING|CONFIRMED|REJECTED|CANCELLED
  notes              String?  // Organizer-only notes
  
  // Booking + fulfillment
  confirmedAt        DateTime?
  rejectedAt         DateTime?
  deletedAt          DateTime?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @default(now())
  
  @@unique([hubId, boothNumber]) // Can't assign same booth twice per instance
  @@index([hubId])
  @@index([status])
}
```

### Updated SaleHub Model

```prisma
model SaleHub {
  // ... existing fields unchanged ...
  name               String
  slug               String   @unique
  description        String?
  organizerId        String
  lat                Float
  lng                Float
  radiusKm           Float    @default(5.0)
  isActive           Boolean  @default(true)
  saleDate           DateTime? // Primary event date
  eventName          String?  // Event name (e.g., "Downtown Spring Flea")
  
  // NEW: Recurring event support
  hubType            String   @default("FLEA_MARKET") // FLEA_MARKET|VENDOR_MARKET|SWAP_MEET|ANTIQUE_FAIR
  recurrenceRule     String?  // "WEEKLY"|"MONTHLY"|null (no repeat)
  nextEventDate      DateTime? // For recurring: next scheduled instance
  
  // Relations
  organizer          Organizer         @relation("OrganizerHubs", fields: [organizerId], references: [id])
  memberships        SaleHubMembership[] // DEPRECATED — kept for backward compat migration
  vendorBooths       VendorBooth[]     // NEW: vendor participation
  
  @@index([organizerId])
  @@index([lat, lng])
  @@index([isActive])
}
```

### Deprecation Path for SaleHubMembership

- **Keep in schema** (no cascade removal). Existing hub→sale links become read-only references.
- **Migrate data:** Extract hub→sale mappings; decide: archive as historical record or assign as single "house vendor" if organizer opts in.
- **New hubs:** Use only VendorBooth model. SaleHubMembership stays for legacy hubs.

---

## Financial Model

Two payout scenarios:

**Scenario A: Booth + Revenue Share**
```
Vendor's booth sales = $500
Platform fee (10%) = $50 (organizer pays)
Booth fee = $25 (vendor pays, goes to organizer)
Revenue share (10% agreed) = $50 (organizer keeps)
Vendor nets: $500 - $25 - $50 = $425
Organizer nets: $50 (platform) + $25 (booth) + $50 (share) = $125
```

**Scenario B: Booth Only (no revenue share)**
```
Vendor's booth sales = $500
Platform fee (10%) = $50
Booth fee = $25
Revenue share = 0%
Vendor nets: $500 - $25 - $50 = $425
Organizer nets: $75 (fees only)
```

Each booth record independently sets `boothFee` and `revenueSharePercent`. Settlement/payout calculation remains in SaleSettlement (existing model).

---

## Tier Decision (REQUIRED — DECISION GATE)

**Option A (default):** Keep as PRO-tier feature  
- PRO gets: create flea market events, add up to 10 vendor booths, basic booth fee + revenue share

**Option B:** Promote to TEAMS-tier feature  
- Rationale: Multi-vendor coordination maps better to team workflows (admin + multiple organizers managing one event)
- PRO still gets simpler feature: single organizer → single event (no team)

**Option C:** Offer both (PRO single-organizer, TEAMS multi-organizer)  
- More complex, but maximizes TAM

**LOCKED DECISION NEEDED:** Patrick specifies tier + booth limit per tier.

---

## hubType Enum (DECISION GATE)

Proposed values:
- `FLEA_MARKET` (default, generic vendor booths)
- `VENDOR_MARKET` (curated artisan vendors)
- `SWAP_MEET` (vehicle parts / collectibles swap event)
- `ANTIQUE_FAIR` (antique dealers + pricing specifics)

**DECISION NEEDED:** Include all four, or start with FLEA_MARKET only?

---

## Build Order

1. **Schema + Migration** (1 day)
   - Add VendorBooth, hubType, recurrenceRule, nextEventDate to SaleHub
   - Create 20260410_add_vendor_booths.sql
   - **Patrick action:** `DATABASE_URL override + prisma migrate deploy + prisma generate`

2. **Backend VendorBooth CRUD** (1–2 days)
   - `POST /api/organizer/hubs/:hubId/booths` — add vendor
   - `PUT /api/organizer/hubs/:hubId/booths/:boothId` — edit fee/status
   - `DELETE /api/organizer/hubs/:hubId/booths/:boothId` — remove vendor
   - `GET /api/organizer/hubs/:hubId/booths` — list all booths for manage page
   - `PATCH /api/organizer/hubs/:hubId/booths/:boothId/confirm` — mark confirmed (vendor accepted)

3. **Backend Payout Calculation** (1 day)
   - New endpoint: `GET /api/organizer/hubs/:hubId/settlement` 
   - Aggregate vendor sales, apply boothFee + revenueShare, return per-vendor breakdown
   - Ties into existing SaleSettlement + ClientPayout models

4. **Frontend Hub Create/Edit Form** (1–2 days)
   - Add `hubType` dropdown, `recurrenceRule` select, `nextEventDate` picker
   - Rename "Add Sales to Hub" → "Add Vendor Booths"
   - Update copy: "sale" → "vendor booth" / "vendor"

5. **Frontend Booth Management Table** (1–2 days)
   - New tab/section in `/organizer/hubs/:hubId/manage`
   - Columns: boothNumber, vendorName, vendorEmail, boothFee, revenueShare%, status
   - Inline add/edit/remove; confirmation for status changes
   - Summary: total booths, confirmed, pending, fees collected (estimate)

6. **Frontend Public Hub Landing** (1 day)
   - Repurpose `/hubs/:slug` to show vendor booth directory instead of sales list
   - Vendor card: boothNumber, vendorName, phone/email (if provided)
   - Map unchanged (still shows event location)

7. **Recurring Event Support** (optional, post-launch)
   - Cron job or manual duplication to spawn next event instance from recurrenceRule
   - Copy hub metadata + reset vendorBooths to PENDING status
   - Update `nextEventDate`

---

## Pages Affected

| Page | Change | Reuse Possible? |
|------|--------|-----------------|
| `/organizer/hubs` | List hubs (unchanged UI) | ✅ Yes |
| `/organizer/hubs/create` | Form adds hubType, recurrence fields | ✅ Extend form |
| `/organizer/hubs/:hubId/manage` | Swap sales membership UI → booth admin table | ⚠️ Rebuild tab content |
| `/hubs/:slug` | Swap sales list → vendor booth directory | ⚠️ Repurpose layout, new data shape |

---

## Data Migration

**No existing production hub records** (feature marked untested in S436). Safe to restructure schema without data loss concern. 

**If legacy hubs exist post-launch:** Provide one-time migration script:
```sql
-- Archive old memberships
INSERT INTO VendorBooth (hubId, boothNumber, vendorName, status, createdAt, updatedAt)
SELECT hubId, row_number() OVER (PARTITION BY hubId ORDER BY addedAt), 
       s.title, 'CONFIRMED', m.addedAt, now()
FROM SaleHubMembership m
JOIN Sale s ON m.saleId = s.id;

-- Keep SaleHubMembership for audit trail; mark legacy flag
ALTER TABLE SaleHub ADD COLUMN migrated Boolean DEFAULT false;
UPDATE SaleHub SET migrated = true WHERE id IN (SELECT DISTINCT hubId FROM SaleHubMembership);
```

---

## Backward Compatibility

- **SaleHubMembership:** Kept in schema, marked read-only in API documentation. GET endpoints can still return linked sales if hubType = 'LEGACY' (new enum value).
- **Existing organizer code:** `/api/organizer/hubs/:hubId/join` remains callable but returns 400 "Booth-based hubs no longer accept sales; use VendorBooth API instead."
- **Public landing page:** `/hubs/:slug` auto-detects model: if SaleHubMembership exists for hub, render as v1 (sales list); if VendorBooth exists, render as v2 (vendor directory).

---

## Rollback Plan

1. **Data:** SaleHubMembership table never dropped. If needed, restore hubs to v1 by querying archived memberships.
2. **Code:** Feature flag `VENDOR_BOOTHS_ENABLED` controls UI render path (v1 vs v2 landing page).
3. **API:** Old `/api/organizer/hubs/:hubId/join` stays callable (legacy mode).

---

## Decision Log Entries Required

1. **Tier & Booth Limits** — Patrick sets PRO/TEAMS + max booths per tier
2. **hubType Enum** — Confirm full list or MVP subset
3. **Payout Trigger** — When are per-vendor payouts calculated? (end of event, manual request, weekly batch?)

---

## Success Criteria

- Schema pushed to production
- All VendorBooth CRUD endpoints operational + tested with Architect
- Booth admin page renders and manages vendors end-to-end
- Public hub landing shows vendor directory correctly
- Payout calculation correctly splits boothFee + revenueShare per vendor
- Organizers can create recurring events (optional for MVP)

---

## Locked Decisions (S436 — 2026-04-10)

Per Patrick:

- **Tier:** TEAMS only
- **hubType enum:** All four — FLEA_MARKET | VENDOR_MARKET | SWAP_MEET | ANTIQUE_FAIR (competitive research shows each category self-identifies strongly)
- **Booth limits:** Unlimited for TEAMS. No per-event cap — event size is the natural constraint.
- **Payout triggers (organizer's choice):** Three options available per event — (a) End of event, (b) Manual organizer trigger, (c) Scheduled (net-30 or weekly). Industry standard is net-30; auto-settlement via QR scan data is the differentiator.
- **Competitive research:** `claude_docs/research/flea-market-software-competitive-analysis.md`
- **Key differentiator to prioritize:** Auto-settlement via QR scan data. No competitor has this. Build it into the booth management flow from day one.

