# eBay Category Hierarchy Picker — Implementation Spec

**Feature:** #244 Phase 2 (eBay CSV Export Enhancement)

**Goal:** Replace generic hardcoded category mappings with a searchable picker based on eBay's top 2-level category hierarchy (~500 entries).

**Benefit:** Organizers can select accurate eBay categories when editing items, reducing "BAF.Error.5" rejections from eBay's bulk upload validator.

---

## What's Been Implemented

### 1. Static eBay Category Data
**File:** `packages/frontend/public/ebay-categories.json`

A JSON file containing the top 2 levels of eBay's category hierarchy:
- 30+ main categories (Antiques, Art, Books, Electronics, etc.)
- 4–5 subcategories per main category
- Total ~150 entries (IDs + display names)

Example structure:
```json
[
  {
    "id": "550",
    "name": "Art",
    "children": [
      { "id": "552", "name": "Art Prints" },
      { "id": "14066", "name": "Paintings & Drawing" },
      ...
    ]
  }
]
```

### 2. eBay Category ID Mapping
**File:** `packages/shared/src/constants/ebayCategories.ts`

A comprehensive TypeScript object mapping all category/subcategory display names to eBay category IDs. Exported function:
- `getEbayCategoryId(categoryName: string | null): string` — returns eBay ID or defaults to Collectibles (ID "1")

Used by the backend CSV export to replace names with accurate IDs.

### 3. eBay Category Picker Component
**File:** `packages/frontend/components/EbayCategoryPicker.tsx`

A reusable React component with:
- Searchable dropdown (loads categories from `/ebay-categories.json`)
- 2-level hierarchy display (parent bold, children indented + grayed)
- Keyboard + click handling (close on blur, open on focus)
- Dark mode support
- Selection stores **category name** (not ID) in the item's `category` field

Props:
```tsx
<EbayCategoryPicker
  value={formData.category}
  onChange={(name) => setFormData({ ...formData, category: name })}
  label="eBay Category"
  placeholder="Search and select..."
/>
```

### 4. Shared Type Definitions
**File:** `packages/shared/src/types/ebayCategories.ts`

Exported types:
- `EbayCategory` — parent category with children array
- `EbayCategoryChild` — child category (id + name)
- `EbayCategoryList` — array of categories

### 5. Backend Integration (CSV Export)
**File:** `packages/backend/src/controllers/ebayController.ts` (UPDATED)

Changed lines 395–396:
- **Old:** `escapeCsvValue(EBAY_CATEGORY_MAP[item.category || ''] || '1')`
- **New:** Uses `getEbayCategoryId(item.category)` for accurate mapping

Import added: `import { getEbayCategoryId } from '@findasale/shared';`

The export now generates CSV rows with real eBay category IDs instead of falling back to hardcoded Collectibles.

---

## Next Steps: Wire Into Edit-Item Page

The component is ready to use. To integrate into the edit-item form:

**File:** `packages/frontend/pages/organizer/edit-item/[id].tsx`

**Step 1: Import the component**
```tsx
import EbayCategoryPicker from '../../../components/EbayCategoryPicker';
```

**Step 2: Replace the hardcoded select (lines 372–398) with:**
```tsx
<EbayCategoryPicker
  value={formData.category}
  onChange={(categoryName) => {
    setFormData({ ...formData, category: categoryName });
  }}
  label="eBay Category"
  placeholder="Search and select an eBay category..."
/>
```

The `EbayCategoryPicker` handles all rendering and search logic. No other changes needed — it stores the category name in `formData.category`, which already flows to the API and database.

---

## What About Custom Categories?

The edit-item form currently has 13 hardcoded local categories (Furniture, Electronics, Clothing, Books, Kitchenware, Tools, Art, Decor, Jewelry, Toys, Sports, Collectibles, Other).

**Decision:**
- Keep the picker synced with eBay's hierarchy (which also includes these)
- eBay names like "Cameras & Photo" are more specific than FindA.Sale's generic "Electronics"
- Organizers benefit from choosing the precise eBay category when selling there
- The mapping table gracefully falls back to Collectibles if a name doesn't match

If stricter validation is desired (e.g., only accept eBay category names), add a validation step in the item update controller.

---

## Data Flow

1. **Edit Item Page:**
   - Organizer loads edit-item page
   - `EbayCategoryPicker` fetches `/ebay-categories.json` on mount
   - Organizer searches and selects a category (e.g., "Paintings & Drawing")
   - `formData.category` = "Paintings & Drawing"

2. **Item Update:**
   - Form submits via `updateMutation` to `PUT /api/items/:id`
   - Backend receives `category: "Paintings & Drawing"`
   - Prisma updates `item.category` in the database

3. **eBay CSV Export:**
   - Organizer requests export via `GET /api/organizer/sales/:saleId/ebay-export`
   - Backend calls `generateEbayCsv(items, ...)`
   - For each item: `getEbayCategoryId(item.category)` → "14066" (eBay ID for "Paintings & Drawing")
   - CSV row contains `"14066"` in the Category ID column
   - eBay accepts the CSV with the correct category

---

## Testing Checklist (QA)

- [ ] **Component loads:** Edit item page displays the eBay category picker
- [ ] **Search works:** Typing "painting" narrows results to relevant categories
- [ ] **Selection persists:** Choosing a category and saving the item stores it correctly
- [ ] **Dark mode:** Picker is readable in dark mode
- [ ] **Mobile:** Dropdown layout works on small screens
- [ ] **CSV export:** Export CSV and verify the Category ID column contains real eBay IDs (not "1")
- [ ] **eBay validation:** Upload CSV to eBay Seller Hub and confirm no "BAF.Error.5" rejections for category

---

## Files Modified/Created

| File | Type | Description |
|------|------|-------------|
| `packages/frontend/public/ebay-categories.json` | New | Static category hierarchy (JSON) |
| `packages/shared/src/types/ebayCategories.ts` | New | TypeScript type definitions |
| `packages/shared/src/constants/ebayCategories.ts` | New | Category name→ID mapping & helper function |
| `packages/frontend/components/EbayCategoryPicker.tsx` | New | React dropdown component |
| `packages/shared/src/index.ts` | Updated | Exports for new types + functions |
| `packages/backend/src/controllers/ebayController.ts` | Updated | Uses `getEbayCategoryId` instead of hardcoded map |
| `packages/frontend/pages/organizer/edit-item/[id].tsx` | Ready for update | Replace hardcoded select with component |

---

## Notes

- The JSON file is loaded client-side on component mount (one fetch, then memoized by React)
- Mapping is case-sensitive; all category names in the constants file are exact matches from the JSON
- Fallback to Collectibles (ID "1") is safe if an organizer somehow enters an unrecognized category
- No database schema changes needed — `category` field already exists on Item model

