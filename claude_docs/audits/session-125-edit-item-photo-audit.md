# Audit Report: Edit Item + Photo Management Flow
*Session 125 — 2026-03-10*

---

## Summary

Audited the single-item edit flow and photo management on production (`finda.sale`) via Chrome MCP. Photo operations (upload, reorder, delete) all function correctly. The **Save Changes button is completely broken** due to a HTTP method mismatch. A second critical crash affects every shopper item detail page. All 5 bugs found were fixed in this session.

**Test item:** Coat Rack #2 (`cmmcz9r3q00bawh91ngkyr473`), Eastside Collector's Estate Sale 11 — organizer account Ivan.

---

## Bug Findings

### BUG-1 — P0 · Save Changes broken (HTTP method mismatch)

**Status: FIXED**

The edit-item page calls `api.patch('/items/:id')` but the backend only registers `router.put('/:id')`. There is no `PATCH /api/items/:id` route, so every save attempt returns `404 Cannot PATCH /api/items/...`. Save has never worked on this page in production.

**Fix:** `edit-item/[id].tsx` line 66 — changed `api.patch` → `api.put`.

---

### BUG-2 — P0 · Shopper item detail page crashes with TypeError

**Status: FIXED**

`pages/items/[id].tsx` accesses `item.sale.organizer.name` unconditionally. The public `GET /api/items/:id` endpoint returns `organizer: null` on the sale object. This causes `TypeError: Cannot read properties of undefined (reading 'name')`, triggering the React error boundary on every item detail page load. No shopper can view any item.

**Evidence:**
```
// API response:
{ "sale": { "organizer": null, ... }, "photoUrls": ["https://res.cloudinary.com/..."] }
// Console:
TypeError: Cannot read properties of undefined (reading 'name') at items/[id].tsx
```

**Fix:** Updated the `Item` interface to mark `organizer` as optional/nullable. Changed render line 366 from `item.sale.organizer.name` to `item.sale.organizer?.name ?? 'Organizer'`.

**Note:** The underlying cause — organizer not included in the public item API response — should be investigated. Either the backend `getItemById` controller should include `sale.organizer` in the Prisma select, or the frontend should be written to not require it. The null-guard fix prevents the crash but the "Organizer" fallback text is a UX degradation.

---

### BUG-3 — P1 · Category and Condition dropdowns show blank on edit page

**Status: FIXED**

The API returns category and condition in lowercase (e.g. `"tools"`, `"good"`) while the select option values are Title Case for category (`"Tools"`) and UPPERCASE for condition (`"GOOD"`). Because the `value` prop doesn't match any option, the dropdowns render blank even though `formData` holds the correct value. Visual bug only — if the user saves without touching the dropdowns, the existing lowercase value is sent correctly. But it looks broken and could lead users to accidentally clear the field.

**Fix:** Normalize in the `useEffect` that populates `formData` from the API response. Category: `charAt(0).toUpperCase() + slice(1).toLowerCase()`. Condition: `.toUpperCase()`.

---

### BUG-4 — P2 · Edit page shows blank form when item not found (no error state)

**Status: FIXED**

When the item query fails (404, network error, or item belonging to another organizer), `item` is `undefined` after loading completes. The page renders a fully interactive blank form with no indication of the problem. Submitting this blank form would send an empty title which the backend would reject with a 400, but the UX is confusing.

**Fix:** Added a not-found guard after the loading check: if `!authLoading && !isLoading && !item`, render a clear error message ("Item not found or you don't have permission to edit it.") with a back link.

---

### BUG-5 — P3 · Photo manager not reachable when item fails to load

Previously gated behind `{item && <ItemPhotoManager ... />}` — this was the correct guard, but combined with BUG-4's missing error state it meant no feedback was visible at all. Fixed as a side effect of BUG-4 (user now sees error message rather than empty form).

---

## Photo Operations — All Pass ✅

Tested via Chrome MCP with a synthetic canvas-generated photo upload:

| Operation | Endpoint | Result |
|-----------|----------|---------|
| Upload photo | `POST /upload/item-photo` → `POST /items/:id/photos` | ✅ Photo uploaded to Cloudinary, URL stored in DB |
| Reorder photos | `PATCH /items/:id/photos/reorder` | ✅ 200 OK, order persists on reload |
| Delete photo | `DELETE /items/:id/photos/:photoIndex` | ✅ Removed from DB, verified via fetch |
| Photo display on shopper page | `GET /api/items/:id` → `photoUrls[]` | ✅ Cloudinary URL present in API response (page was crashing due to BUG-2, not photo issue) |

Cloudinary 503 errors on thumbnail delivery for newly uploaded photos are expected — these resolve within minutes as CDN propagation completes (known issue, not a new finding).

---

## Files Changed

| File | Change |
|------|--------|
| `packages/frontend/pages/organizer/edit-item/[id].tsx` | P0: `api.patch` → `api.put`; P1: normalize category/condition case; P2: item-not-found error state |
| `packages/frontend/pages/items/[id].tsx` | Crash fix: `organizer` typed as optional/nullable; render uses `?.name ?? 'Organizer'` |

---

## Remaining Investigation (Not Fixed This Session)

- **Backend: why is `organizer` null in `getItemById` response?** The Prisma select for the public item endpoint likely omits `sale.organizer`. Should include `organizer: { select: { name: true } }` in the sale include. This is a backend fix that should be paired with confirming the public endpoint intentionally excludes organizer data vs. it being an accidental omission.
- **Edit page uses public `GET /api/items/:id`** — this endpoint filters out items on ENDED or DRAFT sales (`isActive` check), meaning organizers cannot edit items on ended sales. A separate organizer-authenticated item fetch endpoint (or bypassing the isActive filter for organizers) is needed for a complete fix.

---

*Audit conducted by: Claude (session 125)*
*Bugs fixed: 4 of 5 (BUG-5 resolved as side effect of BUG-4 fix)*
