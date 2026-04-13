# HANDOFF: Roadmap Item #125 — Inventory Syndication CSV Export

**Task:** Implement CSV export for items to eBay, Amazon, and Facebook Marketplace formats.
**Scope:** Backend export service + route + tier gating + frontend UI (dropdown + PRO gate)
**Tier:** PRO only
**Role:** ORGANIZER

---

## Acceptance Criteria

1. Backend route: `GET /api/organizer/export/csv?saleId=X&format=ebay|amazon|facebook`
2. Service: maps Item fields to platform-specific CSV columns (see column specs below)
3. Tier gate: PRO-only (check organizer subscription tier from existing pattern)
4. Frontend: Export dropdown on inventory.tsx or item-library.tsx + PRO upgrade prompt for SIMPLE tier
5. Handle missing fields gracefully (nullable columns, empty cells)
6. No new npm packages — use built-in Node.js CSV string building only
7. Rate limiting already implemented (#99) — assume it's in place
8. TypeScript check: 0 errors required

---

## Schema Context

**Item model fields (confirmed from schema.prisma lines 347–437):**
- `title`, `sku`, `description`, `price`, `condition` (mint/excellent/good/fair/poor)
- `category` (furniture/decor/vintage/textiles/collectibles/art/antiques/jewelry/books/tools/electronics/clothing/home/other)
- `shippingAvailable`, `shippingPrice`
- `status` (AVAILABLE/SOLD/RESERVED/AUCTION_ENDED)
- All items belong to a Sale (saleId FK)

**Sale model fields (confirmed from schema.prisma lines 279–345):**
- `organizerId` → check organizer subscription tier via existing pattern

---

## Platform-Specific CSV Column Specs

### eBay Format
Columns: Title, Description, Price, Condition, Category, UPC (if available), Item Specifics
- Title: `item.title` (required)
- Description: `item.description` (optional, empty string if null)
- Price: `item.price` (required if not null, else empty)
- Condition: `item.condition` (map: mint→Mint, excellent→Excellent, good→Good, fair→Fair, poor→Poor, else "Unknown")
- Category: `item.category` (optional)
- UPC: `item.sku` (optional, label as "sku" or "UPC" depending on availability)
- Item Specifics: JSON string or empty (placeholder)

### Amazon Format
Columns: product-id, product-id-type, item-condition, price, item-note, will-ship-internationally
- product-id: `item.sku` or `item.id` (required if sku exists)
- product-id-type: "SellerSKU" (fixed)
- item-condition: `item.condition` (map same as eBay, default "Used")
- price: `item.price` (required if not null)
- item-note: `item.description` (optional, truncate to ~500 chars)
- will-ship-internationally: `item.shippingAvailable` ? "Yes" : "No"

### Facebook Marketplace Format
Columns: title, price, category, condition, description, availability
- title: `item.title` (required)
- price: `item.price` (required if not null)
- category: `item.category` (optional, map to FB categories if needed)
- condition: `item.condition` (map same as eBay, default "Used")
- description: `item.description` (optional)
- availability: `item.status === "AVAILABLE" ? "In Stock" : "Out of Stock"`

---

## Implementation Path

### Backend

**New file:** `packages/backend/src/services/exportService.ts`
- Export function: `generateCsvExport(items: Item[], format: "ebay"|"amazon"|"facebook"): string`
- Each format has its own column builder function (formatEbayCsv, formatAmazonCsv, formatFacebookCsv)
- Use native Node.js string builders (no csv parser needed for export-only)
- Escape CSV values (quoted fields, commas, quotes, newlines)

**New file:** `packages/backend/src/controllers/exportController.ts`
- Export route handler: `GET /api/organizer/export/csv?saleId=X&format=ebay|amazon|facebook`
- Fetch sale by saleId + check organizer auth + check tier
- Fetch all items for sale (status = AVAILABLE only, or include all? — see note below)
- Call exportService.generateCsvExport()
- Return CSV as file download (Content-Type: text/csv, Content-Disposition: attachment)

**Update:** `packages/backend/src/routes/organizers.ts`
- Add new export route to organizer router (pattern same as other routes)

**Tier check pattern:** Look at existing PRO-gated routes in organizers.ts or stripe billing route for reference.

### Frontend

**Update file:** `packages/frontend/pages/organizer/inventory.tsx`
- Add "Export" dropdown button section (or button group)
- Options: "Export for eBay", "Export for Amazon", "Export for Facebook Marketplace"
- Each option triggers fetch to `/api/organizer/export/csv?saleId=X&format=ebay|amazon|facebook`
- Browser downloads CSV file automatically (filename: `{sale.title}_{format}_export.csv`)
- PRO tier check: if organizer.tier !== "PRO", show upgrade prompt + disable export

**OR alternatively update:** `packages/frontend/pages/organizer/item-library.tsx`
- Same export UI — whichever page is the primary item management page

---

## Important Notes

1. **Item filtering:** Determine whether to export:
   - Only AVAILABLE items, OR
   - All items (include SOLD/RESERVED/AUCTION_ENDED)
   - Recommend: **All items** (user might want to sync historical data)

2. **CSV escaping:** Use standard CSV escaping:
   - Wrap fields with commas/quotes/newlines in double quotes
   - Escape internal quotes by doubling them (standard CSV)

3. **Empty sale handling:** If sale has no items, return empty CSV with headers only

4. **File naming:** Use `${sale.title}_${format}_export_${new Date().toISOString().split('T')[0]}.csv`

5. **Tier gate pattern:** See existing PRO gates in backend/src/routes/organizers.ts or stripe controller for exact check syntax

6. **Rate limit:** Already implemented (#99) — no action needed

---

## Pre-Flight (Schema-First §8)

**Step 1 — Schema verify:**
✅ Item model confirmed: title, sku, description, price, condition, category, shippingAvailable, shippingPrice, status, saleId
✅ Sale model confirmed: organizerId (used to fetch organizer subscription tier)

**Step 2 — Hook shape verify:**
N/A — no hooks in backend, frontend uses fetch()

**Step 3 — Controller/service type verify:**
Verify organizer tier check syntax from existing PRO-gated routes before implementing

**Step 4 — TypeScript check (mandatory before return):**
```bash
cd packages/frontend && npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | grep -v node_modules
```
Zero errors required.

---

## Files to Read Before Starting

- `packages/backend/src/routes/organizers.ts` (look for PRO tier gate pattern)
- `packages/backend/src/controllers/` (any existing export/download controller for pattern reference)
- `packages/frontend/pages/organizer/inventory.tsx` OR `item-library.tsx` (UI placement context)
- `packages/database/prisma/schema.prisma` lines 279–437 (Sale + Item models — already confirmed above)

---

## Return Handoff Format

Files created/modified:
- `packages/backend/src/services/exportService.ts` — new file
- `packages/backend/src/controllers/exportController.ts` — new file
- `packages/backend/src/routes/organizers.ts` — modified (added export route)
- `packages/frontend/pages/organizer/[inventory.tsx OR item-library.tsx]` — modified (added export UI)

Diffs + TypeScript check result + any DECISION NEEDED blocks
