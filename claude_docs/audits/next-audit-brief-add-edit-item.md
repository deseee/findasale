# Next Audit Brief: Add/Edit Item + Photo Flow
*Prepared for session 125*

---

## Goal

Audit the single-item edit flow and photo management:
- Edit existing item (title, price, category, condition, description)
- Add photos to item
- Reorder / delete photos
- Save changes
- Verify photo display in item detail + shopper preview

---

## Test Path

**Setup:**
- Start at organizer add-items page
- Select an existing item (from the items list) → Click "Edit"
- This opens `/organizer/edit-item/{itemId}`

**Steps:**
1. Load the edit page and verify all fields populate
2. Modify item fields (e.g., price, category)
3. Upload additional photos (if UI allows)
4. Reorder photos (if photo gallery has reorder UI)
5. Delete a photo (if delete buttons exist)
6. Save changes
7. Verify changes persisted (navigate away, re-edit, check DB)
8. View item in shopper preview / search (check photo display)

---

## Files to Inspect (before audit)

- `packages/frontend/pages/organizer/edit-item/[itemId].tsx` — Edit form page
- `packages/frontend/components/ItemPhotoUpload.tsx` (or similar) — Photo upload component
- `packages/frontend/components/PhotoGallery.tsx` (or similar) — Photo reorder/delete
- `packages/backend/src/routes/items.ts` — PUT /api/items/{id} endpoint
- `packages/backend/src/routes/photos.ts` (if exists) — Photo management endpoints

---

## Known Issues to Watch

1. **Cloudinary delivery:** May show broken images in photo gallery (same as batch upload audit). Watch for fallback behavior.
2. **Photo ordering:** If user can reorder, verify order persists across save/reload.
3. **Photo deletion:** Verify photo is removed from Cloudinary and DB, not just hidden.
4. **Edit form validation:** Check for missing error handling on invalid inputs.
5. **Concurrent edits:** If another user edits the same item, verify graceful conflict handling (if any).

---

## Audit Tools

Same setup as session 124:
- **Chrome MCP:** Browser automation, read_page, find, screenshot
- **Network logging:** XHR monkey-patch to capture API calls
- **Canvas injection:** For synthetic photo uploads (if needed)

---

## Expected Outcomes

- Document which features work (reorder, delete, photo upload)
- Identify any UX bugs (broken images, validation errors, stale data)
- Note missing features (e.g., photo reorder not implemented)
- Verify photo URLs and display across shopper side
- Test with real + AI-tagged photos

---

## Success Criteria

✅ Edit form loads and saves successfully
✅ Photo operations (add/delete/reorder) work as expected
✅ Changes persist across page reload
✅ Shopper preview shows correct photos
✅ No broken image icons (or graceful fallback)
✅ Network calls confirm updates in backend
