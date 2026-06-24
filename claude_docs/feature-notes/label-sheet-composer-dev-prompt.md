# Label Sheet Composer — Dev Dispatch Prompt

> **Dispatch to:** `findasale-dev` (primary), then `findasale-qa` (post-deploy)
> **Scope:** New page + 4 new backend endpoints + print CSS
> **Estimated tokens:** 20–30k (multi-file feature)
> **Prerequisites:** None — no schema migration required

---

## What You're Building

A single-page tool at `/organizer/label-composer/[saleId]` that lets organizers batch-generate QR pricetag sheets for Avery 5160 label stock (US Letter, 3 columns × 10 rows = 30 labels/page). Two input modes feed the same batch: preset price chips (from the sale's 30-price cheat sheet) and pull-from-catalog (search already-priced items). Output is a printable sheet with real QR codes.

**Reference wireframe:** See uploaded `Label Sheet Composer Wireframes.html`, Tab 01 only ("Preset chips + live sheet"). Tabs 02–04 are future — do not build them.

---

## Existing Codebase Context (READ THESE FIRST)

Before writing any code, read these files to understand existing patterns:

| File | Why |
|------|-----|
| `packages/backend/src/controllers/printKitController.ts` | **Already has** Avery 5160 rendering via PDFKit with the exact 30-price cheat sheet (line 755–756), QR generation via `qrcode` npm, and correct Avery 5160 dimensions. Reuse `renderPriceSheet()` pattern. |
| `packages/backend/src/controllers/labelController.ts` | Existing per-item label PDF generation. Uses same `qrcode` + PDFKit stack. |
| `packages/backend/src/routes/organizers.ts` | Where organizer-scoped routes are registered. New endpoints go here. |
| `packages/frontend/pages/organizer/print-kit/[saleId].tsx` | Existing print-kit page — follow the same auth pattern, sale-fetching, and layout conventions. |
| `packages/frontend/components/SaleQRCode.tsx` | Existing QR component — uses external `qrserver.com` API for frontend preview QRs. |
| `packages/database/prisma/schema.prisma` | `Sale` model (line ~181) and `Item` model (line ~239). No new models needed for v1. |

**Stack (locked — do not deviate):**
- Frontend: Next.js 14 Pages Router, Tailwind CSS, @tanstack/react-query, React Hook Form + Zod
- Backend: Express, Prisma, PDFKit, `qrcode` npm (already installed)
- Database: PostgreSQL via Railway (no schema changes for v1)

**Cheat sheet prices (hardcoded — same set already in printKitController.ts line 755):**
```ts
const PRICES = [0.25, 0.50, 0.75, 1.00, 1.50, 2.00, 2.50, 3.00, 3.50,
                4.00, 4.50, 5.00, 6, 7, 7.50, 8, 9, 10, 11, 12, 12.50,
                13, 14, 15, 16, 17, 18, 19, 20, 25];
```

---

## Layout (Desktop, ~1280px+)

Two-column layout, roughly 55% / 45%.

### LEFT — Tag Mixer

1. **Price presets** — Chip buttons for all 30 prices. Selected chip gets filled dark styling. Each chip has a small color swatch matching the preview color band.

2. **Quantity controls** — Large readout (`× 15`) with `+1`, `+5`, `+10`, `+25`, `clear` buttons.

3. **Primary actions** — `Add to batch →` (full-width primary button) and `Fill rest w/ selected` (fills remaining cells on current page with the selected price).

4. **Batch list** — Rows showing `[color swatch] $price × qty [− + ×]`. Drag-to-reorder via a lightweight library (use `@dnd-kit/core` + `@dnd-kit/sortable` — already common in React ecosystems, or implement simple drag with native HTML5 drag). Footer shows `N prices · M labels` and large `M / 30` counter.

5. **Pull from priced items** — Search input querying the organizer's catalog for the active sale. Results list with: checkbox, item code (SKU), item name, price swatch, qty stepper. Filter chips: `category`, `price range`, `needs tag`, `this sale`. "Unprinted only" toggle. Adding selected items appends to the same batch list.

### RIGHT — Live Sheet Preview

1. **Sheet grid** — Scaled Avery 5160 at real 8.5×11" aspect ratio, 3×10 grid, 30 cells. Cells fill top-left → bottom-right in batch insertion order.

2. **Cell content** — Each filled cell shows: tiny QR placeholder (top-left corner), price (centered, large), sale date range stamp (bottom-right, small, e.g. `4/17–19`).

3. **Color coding by price band** (preview only — printed labels are black & white):

| Band | Prices | Color (Tailwind-friendly) |
|------|--------|--------------------------|
| Warm off-white | $0.25–$0.75 | `bg-stone-200` |
| Soft blue | $1.00–$2.50 | `bg-sky-200` |
| Pink/lilac | $3.00–$4.50 | `bg-pink-200` |
| Mossy green | $5.00–$9.00 | `bg-emerald-200` |
| Amber/orange | $10.00–$15.00 | `bg-amber-300` |
| Deep terracotta | $20.00–$25.00 | `bg-orange-700 text-white` |

4. **Header strip** — Brand pill (`● finda.sale · {sale title}`) and `27 / 30 used · 3 blanks` counter.

5. **Leftovers block** — Dropdown: `Fill blanks with: [$1.00 ▼]` + Apply button. Default = currently selected chip price.

6. **Pagination** — If batch > 30, show numbered page buttons. Each page = one printable sheet. Each page gets its own leftover-fill dropdown.

### Bottom Action Bar

- `Print sheet` (primary) — opens print-ready HTML in new tab
- `Export PDF` — downloads PDF from backend
- `Save batch` — saves batch as named preset to localStorage
- Keyboard: `Ctrl+P` / `⌘P` print, `Ctrl+S` / `⌘S` save batch

---

## Data Model (Frontend State — No DB Schema Changes)

```ts
type PresetPrice = number; // from cheat sheet

interface BatchItem {
  id: string;            // nanoid or crypto.randomUUID()
  price: number;         // dollars
  qty: number;
  source:
    | { kind: 'preset' }
    | { kind: 'item'; itemId: string; itemCode: string; itemName: string };
}

interface SheetBatch {
  saleId: string;
  items: BatchItem[];
  leftoverFill?: PresetPrice | null;
  name?: string;         // if saved as preset
}
```

Order matters — rendering order = insertion order. Drag-reorder updates the `items` array. Batch state autosaves to localStorage keyed by `label-composer-${saleId}` and restores on page load.

---

## Backend Endpoints (New — add to `packages/backend/src/routes/organizers.ts`)

### 1. `GET /api/organizer/sales/:saleId/cheatsheet`

Returns the hardcoded 30-price cheat sheet. (For v1, prices are the same constant array already in `printKitController.ts`. Extract to a shared constant in a new file `packages/backend/src/constants/cheatsheet.ts` so both controllers import it.)

```ts
// Response
{ prices: number[] }
```

Auth: Organizer must own the sale (same pattern as `getPrintKit`).

### 2. `GET /api/organizer/sales/:saleId/items-for-labels`

Paginated, searchable index of priced items in the sale. Uses existing Prisma `Item` model — no new models.

```ts
// Query params
?q=ceramic&category=decor&minPrice=1&maxPrice=10&needsTag=true&cursor=xxx&limit=20

// Response
{
  items: Array<{
    id: string;
    code: string;      // item.sku || item.id.slice(-6).toUpperCase()
    name: string;       // item.title
    price: number;      // item.price (only items with non-null price)
    category: string | null;
    needsTag: boolean;  // true if item has no associated printed tag yet (v1: always true — tag tracking is future)
  }>;
  nextCursor: string | null;
}
```

Auth: Organizer must own the sale. Filter: `WHERE saleId = :saleId AND price IS NOT NULL AND status = 'AVAILABLE'`. Default sort: `createdAt DESC`.

### 3. `POST /api/organizer/sales/:saleId/label-batch`

Creates a batch and assigns tag IDs. Each logical label gets a **distinct** tag ID (nanoid, 10 chars). Returns the batch ID + all tag IDs for QR generation.

```ts
// Request body
{
  items: Array<{
    price: number;
    qty: number;
    source: { kind: 'preset' } | { kind: 'item'; itemId: string };
  }>;
  leftoverFill?: number | null;
}

// Response
{
  batchId: string;    // nanoid
  tags: Array<{
    tagId: string;    // nanoid(10) — becomes the QR short code
    price: number;
    itemId?: string;
    position: number; // 0-indexed cell position across all pages
  }>;
  totalLabels: number;
  totalPages: number; // Math.ceil(totalLabels / 30)
}
```

Auth: Organizer must own the sale. Server generates all tagIds. For v1, tags are ephemeral (not persisted to DB) — the batch endpoint returns them and the print endpoint uses the batch data. Persistence (DB model for tags) is a follow-up.

**Important:** `qty > 1` produces N **distinct** tagIds (each scannable independently). This is the default behavior per Patrick's spec.

### 4. `GET /api/organizer/batches/:batchId/print`

Returns server-rendered HTML with actual QR codes as inline SVGs, formatted for Avery 5160 print. This is the critical print endpoint.

**Avery 5160 dimensions (all values at 72 DPI):**

| Dimension | Inches | Points (72 DPI) |
|-----------|--------|-----------------|
| Page | 8.5" × 11" | 612 × 792 |
| Top margin | 0.5" | 36 |
| Left margin | 3/16" (0.1875") | 13.5 |
| Label width | 2.625" | 189 |
| Label height | 1.0" | 72 |
| Horizontal pitch (label + gutter) | 2.75" | 198 |
| Horizontal gutter | 0.125" | 9 |
| Vertical pitch | 1.0" | 72 (no row gutter) |

**Implementation approach — use the SAME PDFKit pattern from `printKitController.ts`:**

Reuse the exact rendering approach from `renderPriceSheet()` (line 754+):
- PDFKit with `{ size: 'LETTER', margin: 0 }` (singular `margin`, NOT `margins` — see S501 bug fix)
- Position labels absolutely using the dimension table above
- QR codes via `QRCode.toBuffer()` with `{ type: 'png', width: 200, margin: 1, color: { dark: '#000000', light: '#ffffff' } }`
- Each label contains: QR code (left side, 48×48pt), price (large, bold, right of QR), sale name (small, top), `finda.sale` wordmark (small, bottom-left), date range (small, bottom-right)

QR URL format: `https://finda.sale/t/{tagId}`

**Return as PDF** (Content-Type: `application/pdf`, Content-Disposition: `attachment`). The frontend opens it in a new tab for browser print dialog.

### 5. `GET /api/organizer/batches/:batchId/pdf`

Same as `/print` — returns the PDF directly. (In v1, `/print` and `/pdf` can be the same endpoint. Headless Chromium for HTML→PDF is a follow-up.)

**Controller file:** Create `packages/backend/src/controllers/labelComposerController.ts`. Do NOT modify `printKitController.ts` or `labelController.ts` — this is a separate feature with its own controller.

**Route registration:** Add to `packages/backend/src/routes/organizers.ts`:
```ts
import { getCheatsheet, getItemsForLabels, createLabelBatch, printLabelBatch } from '../controllers/labelComposerController';

router.get('/sales/:saleId/cheatsheet', authenticate, getCheatsheet);
router.get('/sales/:saleId/items-for-labels', authenticate, getItemsForLabels);
router.post('/sales/:saleId/label-batch', authenticate, createLabelBatch);
router.get('/batches/:batchId/print', authenticate, printLabelBatch);
```

---

## Frontend Page

**File:** `packages/frontend/pages/organizer/label-composer/[saleId].tsx`

### Auth & Data Fetching

Follow the same pattern as `print-kit/[saleId].tsx`:
- `useAuth()` hook for organizer check
- `useQuery` for sale data (`/api/sales/${saleId}`)
- `useQuery` for cheatsheet (`/api/organizer/sales/${saleId}/cheatsheet`)
- `useQuery` for item search (debounced, only when search input has value)
- `useMutation` for batch creation

### State Management

All batch state lives in a `useReducer` hook:

```ts
type Action =
  | { type: 'SELECT_PRICE'; price: number }
  | { type: 'SET_QTY'; qty: number }
  | { type: 'ADD_QTY'; delta: number }  // +1, +5, +10, +25
  | { type: 'ADD_TO_BATCH' }
  | { type: 'FILL_REST' }
  | { type: 'ADD_ITEMS'; items: Array<{ itemId: string; code: string; name: string; price: number; qty: number }> }
  | { type: 'REMOVE_ROW'; id: string }
  | { type: 'UPDATE_ROW_QTY'; id: string; qty: number }
  | { type: 'REORDER'; fromIndex: number; toIndex: number }
  | { type: 'SET_LEFTOVER_FILL'; price: number | null }
  | { type: 'APPLY_LEFTOVER_FILL' }
  | { type: 'LOAD_SAVED'; batch: SheetBatch }
  | { type: 'CLEAR' };
```

### localStorage Persistence

On every state change, serialize batch to `localStorage.setItem(`label-composer-${saleId}`, JSON.stringify(batch))`. On mount, check for saved state and restore via `LOAD_SAVED` action.

### Key Behaviors

- **Duplicate item adds:** When adding an item that already exists in the batch (same `itemId` or same price for presets), increment the existing row's qty instead of creating a new row.
- **Fill rest:** Calculates `30 - (totalLabels % 30)` remaining cells on the current page, adds that many of the selected price.
- **Batch > 30:** Show page numbers below the preview. Each page renders its own 30-cell grid. The preview shows whichever page is selected.
- **Color band mapping:** Use a `getPriceBandColor(price: number): string` utility that returns a Tailwind class based on the price range table above.
- **Empty cells:** Show diagonal hatch pattern (CSS `repeating-linear-gradient`).

### Print Flow

1. User clicks "Print sheet" or "Export PDF"
2. Frontend calls `POST /api/organizer/sales/${saleId}/label-batch` with the current batch
3. Backend returns `{ batchId, tags[] }`
4. Frontend opens `GET /api/organizer/batches/${batchId}/print` in a new tab (or triggers download for PDF)
5. Browser print dialog opens on the rendered page

### Keyboard Shortcuts

```ts
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
      e.preventDefault();
      handlePrint();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      handleSaveBatch();
    }
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}, []);
```

---

## Visual System

Use the finda.sale app's existing Tailwind design system — dark backgrounds, light text, standard button/input components. Do NOT use the wireframe's hand-drawn "Patrick Hand" fonts.

Color bands are for the **preview grid only** — printed labels are black on white.

---

## Files to Create

| File | Purpose |
|------|---------|
| `packages/backend/src/controllers/labelComposerController.ts` | All 4 endpoints |
| `packages/backend/src/constants/cheatsheet.ts` | Shared 30-price array (imported by both `labelComposerController` and `printKitController`) |
| `packages/frontend/pages/organizer/label-composer/[saleId].tsx` | Main page component |

## Files to Modify

| File | Change |
|------|--------|
| `packages/backend/src/routes/organizers.ts` | Register 4 new routes |
| `packages/backend/src/controllers/printKitController.ts` | Replace inline `prices` array (line 755) with import from `constants/cheatsheet.ts` |

---

## Acceptance Checklist

- [ ] Organizer picks `$1.00`, hits `+10` then `+5`, adds → batch shows `$1.00 × 15`
- [ ] Preview fills 15 cells left-to-right, top-to-bottom in the $1 color band
- [ ] Searches "ceramic", checks 2 items, clicks "Add selected" → items appear in batch with item codes
- [ ] Drags a row to reorder → preview cell order updates live
- [ ] Sets leftover-fill to `$1.00`, clicks Apply → remaining blanks fill
- [ ] "Print sheet" generates a PDF where labels align to Avery 5160 within 1/32"
- [ ] QR codes scan cleanly from printed output (link format: `https://finda.sale/t/{tagId}`)
- [ ] Batch of 67 items paginates to 3 sheets; each prints correctly
- [ ] Page refresh mid-edit → batch restored from localStorage
- [ ] No TypeScript errors: `cd packages/frontend && npx tsc --noEmit --skipLibCheck` returns zero errors
- [ ] No TypeScript errors: `cd packages/backend && npx tsc --noEmit --skipLibCheck` returns zero errors

---

## Explicitly Out of Scope

- Mobile layout (Tab 02 — future)
- Paint-the-grid mode (Tab 03 — future)
- Histogram composer (Tab 04 — future)
- Schema migration / new DB models (v1 tags are ephemeral)
- Tag scanning/checkout decrement flow
- Bulk CSV import
- Custom label stock sizes
- Barcode (non-QR) formats

---

## Open Questions (Product — Answer Before Dispatch)

1. **Tag IDs** — should one item with qty > 1 produce N distinct QR codes (each scannable once) or N copies of the same QR? **Default assumption: distinct.** Each tag gets its own nanoid.
2. **Scanning a QR at checkout** — should it decrement qty on the linked item? If yes, tags need DB persistence. **Default assumption: no, deferred to v2.**
3. **Re-print for lost tags** — new tagIds, or reuse? **Default assumption: new tagIds (generate fresh batch).**

---

## Dev Agent Pre-Flight (Mandatory)

Before writing any code:

1. **Schema verify:** Read `packages/database/prisma/schema.prisma`. Confirm `Sale` and `Item` models exist with the fields referenced above.
2. **Existing controller verify:** Read `packages/backend/src/controllers/printKitController.ts` lines 754–810 to understand the existing Avery 5160 rendering pattern.
3. **Route verify:** Read `packages/backend/src/routes/organizers.ts` to find where to register new routes.
4. **Frontend pattern verify:** Read `packages/frontend/pages/organizer/print-kit/[saleId].tsx` for auth/layout patterns.

**Post-edit TypeScript check (mandatory before returning):**
```bash
cd packages/frontend && npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | grep -v node_modules
cd packages/backend && npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | grep -v node_modules
```

Zero errors required before returning output to main session.

**Return:** Explicit list of every file created or modified.
