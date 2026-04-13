# Batch Operations Toolkit Spec — Feature #8

**Status:** Ready for Implementation
**Estimate:** 1 sprint
**Priority:** Next (after #27 Listing Factory ships)
**Roadmap Reference:** Line 69 — "Bulk pricing, status updates, photo uploads"

---

## Gap Analysis

### What Exists
- **Backend `/api/items/bulk`** supports 8 operations: delete, status, category, price_adjust, isActive, price, backgroundRemoved, draftStatus
- **Frontend bulk UI** in add-items/[saleId].tsx has checkbox selection + toolbar with Delete, Hide/Show, Set Price buttons
- **Batch photo upload** infrastructure (`/api/upload/rapid-batch`, `/api/upload/batch-analyze`) for intake
- **CSV import** for bulk item creation with validation

### What's Missing (Defines the Toolkit)
1. **Batch photo operations** — no API or UI to add/remove/reorder photos across multiple items
2. **Batch toolbar UX** — toolbar doesn't expose all 8 available operations (missing category, backgroundRemoved, draftStatus)
3. **Confirmation flow** — no preview of affected items before applying batch operations
4. **Status-aware actions** — no validation that operation is legal per item status (e.g., prevent batch-delete of SOLD items)
5. **Undo/audit trail** — no way to reverse bulk edits or audit who changed what when
6. **Batch tag operations** — no way to bulk-apply or bulk-remove tags (introduced in #27 Listing Factory)

---

## Feature Scope — Batch Operations Toolkit

### Tier 1: Immediate (UI + Backend Polish) — 1 Sprint

**Goal:** Expose all existing bulk operations with safe guards and user-friendly flow.

#### Backend Changes
1. **Enhance `/api/items/bulk` validation:**
   - Add operation whitelist per item status (e.g., can only delete AVAILABLE or DRAFT items)
   - Add dry-run mode: `?dryRun=true` returns affected item count + list of IDs without mutating
   - Return detailed response: count, affected IDs, any errors per item
   - Add operation: `tags` — bulk add/remove tags from curated vocabulary

2. **New endpoint `/api/items/bulk/photos`:**
   - `POST` with `itemIds`, `operation` (add/remove/reorder), `photoUrls`
   - Add `photoUrl` to multiple items (up to 5 photos per item, max 50 items per request)
   - Remove photo by URL from multiple items
   - Validation: reject if photo already exists on item

3. **Batch operation audit log (schema-level):**
   - Log all bulk ops to a new table `ItemBulkAuditLog` (itemId, operation, oldValue, newValue, userId, createdAt)
   - Enables reversal + compliance tracking
   - Organizer can view audit trail for a sale (not in Tier 1 UI, but schema + endpoint ready)

#### Frontend Changes
1. **Expand toolbar in add-items/[saleId].tsx:**
   - Show all 8 operations as selectable actions (not just Delete/Hide/Show/Set Price)
   - Group logically: Visibility (isActive), Pricing (price, price_adjust), Metadata (category, backgroundRemoved), Workflow (status, draftStatus), Tags
   - Use dropdown/modal UI to avoid toolbar clutter

2. **Add confirmation modal:**
   - Show: operation name, affected item count, sample items (first 3)
   - Highlight risky operations (delete, status change to SOLD/RESERVED)
   - Dry-run button → show full list of affected items before commit

3. **Photo toolbar section:**
   - New "Manage Photos" button in toolbar
   - Modal: select operation (Add/Remove by URL)
   - Input: photo URL or Cloudinary upload
   - Apply to selected items

4. **Bulk operation feedback:**
   - Toast with item count + operation (e.g., "Updated category for 12 items")
   - On error, show which items failed + why
   - Link to audit trail (eventual feature)

### Tier 2: Deferred (Post-MVP UX Polish)

- Undo last bulk operation (requires audit log full traversal)
- Batch tag suggestions + bulk-apply by AI
- Scheduled bulk operations (e.g., "price drop every 24h" automation)
- Organizer audit dashboard showing all bulk edits on a sale
- Bulk photo drag-to-reorder across multiple items

---

## API Contract Changes

### POST /api/items/bulk (Updated)

```json
Request:
{
  "itemIds": ["id1", "id2"],
  "operation": "status|price|category|...",
  "value": <any>,
  "dryRun": false
}

Response (Success):
{
  "message": "...",
  "count": 2,
  "affectedIds": ["id1", "id2"],
  "operation": "price",
  "oldValues": { "id1": 10.50, "id2": 15.00 },
  "newValues": { "id1": 12.60, "id2": 18.00 }
}

Response (Dry-Run):
{
  "message": "Dry run — no changes applied",
  "count": 2,
  "affectedIds": ["id1", "id2"],
  "wouldChange": true,
  "operation": "price"
}

Response (Validation Error):
{
  "message": "Cannot delete 1 item(s) — not AVAILABLE or DRAFT",
  "count": 1,
  "errors": [
    { "itemId": "id2", "reason": "Status is SOLD" }
  ]
}
```

### POST /api/items/bulk/photos (New)

```json
Request:
{
  "itemIds": ["id1", "id2"],
  "operation": "add|remove|reorder",
  "photoUrls": ["https://..."],
  "dryRun": false
}

Response (Add):
{
  "message": "Added photo to 2 item(s)",
  "count": 2,
  "affectedIds": ["id1", "id2"],
  "operation": "add"
}

Response (Remove):
{
  "message": "Removed photo from 2 item(s)",
  "count": 2,
  "operation": "remove"
}
```

### GET /api/items/:saleId/audit-log (New, Tier 2)

Returns paginated audit log for bulk operations on a sale.

---

## Status-Safe Operations Matrix

| Operation | AVAILABLE | DRAFT | PENDING_REVIEW | PUBLISHED | SOLD | RESERVED |
|-----------|-----------|-------|----------------|-----------|------|----------|
| delete    | ✓         | ✓     | ✗              | ✗         | ✗    | ✗        |
| status    | ✓         | ✓     | ✓              | ✓         | ✗    | ✗        |
| category  | ✓         | ✓     | ✓              | ✓         | ✓    | ✓        |
| price     | ✓         | ✓     | ✓              | ✓         | ✗    | ✗        |
| isActive  | ✓         | ✓     | ✓              | ✓         | ✓    | ✓        |
| tags      | ✓         | ✓     | ✓              | ✓         | ✓    | ✓        |

---

## Implementation Order (Dev Instructions)

### Phase 1: Backend Hardening (1–2 days)
1. Add status-safe validation to `/api/items/bulk` — check each item's status before allowing delete/price operations
2. Add `dryRun` query param — query database but return without committing
3. Enhance response payload to include `affectedIds`, `oldValues`, `newValues` for auditability
4. Create `ItemBulkAuditLog` migration (but don't wire up logging yet — reserve for Tier 2)

### Phase 2: Batch Photos API (1 day)
1. Create `POST /api/items/bulk/photos` endpoint
2. Validate operation (add/remove)
3. Fetch items, verify ownership (reuse pattern from `/items/bulk`)
4. Apply photo changes: add new URL to photoUrls array, remove by URL match
5. Return detailed response

### Phase 3: Frontend Toolbar Expansion (2 days)
1. Extend bulk action bar in add-items/[saleId].tsx
   - Replace single-dropdown with expandable action menu
   - Show: Delete, Hide/Show, Set Price, Set Category, Set Status, Manage Photos
   - Group by category for clarity
2. Add confirmation modal with affected item count + dry-run option
3. Wire toolbar actions to `/api/items/bulk` with new payload format

### Phase 4: Photo Toolbar Modal (1 day)
1. Create new modal component for photo bulk operations
2. Form: select operation, input photo URL, apply to selected items
3. Wire to `/api/items/bulk/photos`

### Phase 5: Error Handling & Feedback (1 day)
1. Toast messages for success (item count, operation name)
2. Error modal showing which items failed + reason (status guard, validation, etc.)
3. Dry-run button → expand to show full list before apply

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Bulk delete mistakes | Only allow delete on AVAILABLE/DRAFT; require confirmation; no undo Tier 1 |
| Photo URL validation | Validate URL format + reachability in backend; reject duplicates per item |
| Performance (1000+ items) | Limit request to max 100 items per bulk call; batch internally if needed |
| Concurrent edits | Use existing `optimisticLockVersion` on items to reject stale edits |

---

## Success Criteria

- All 8 bulk operations callable from toolbar
- Confirmation flow shows affected item count + sample items before apply
- Status-safe validation prevents invalid operations (e.g., delete SOLD items)
- Batch photos API accepts and stores URLs correctly
- Error feedback distinguishes per-item failures from global failures
- Audit log schema in place (ready for Tier 2 dashboard)

---

## Future Work (Tier 2+)

- Bulk operation undo (requires full audit log replay)
- Organizer audit dashboard showing who did what when
- Bulk tag AI suggestions + apply
- Scheduled bulk operations (daily price drops, auto-archive)
- Batch reorder photos across multiple items
