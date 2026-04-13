# QA Verdict — Sprint 2 (Export + Promote) — 2026-03-15

## Overall: FAIL

Sprint 2 contains a **critical blocker** that will cause image watermarking to fail across all export formats. The Cloudinary watermark transformation is missing required forward slashes in the URL construction, resulting in malformed Cloudinary URLs. All exported content (EstateSales.NET CSV, Facebook JSON, Craigslist text) will reference broken image URLs.

---

## Findings

| Severity | Location | Issue |
|----------|----------|-------|
| BLOCKER  | `packages/backend/src/utils/cloudinaryWatermark.ts:41-44` | Watermark transformation inserted without forward slashes; malformed Cloudinary URL format (`uploadl_text:...` instead of `upload/l_text:...`) |
| WARN     | `packages/backend/src/controllers/exportController.ts:318` | Date formatting via `new Date()` is timezone-sensitive; ISO string inputs may display wrong dates in certain timezones |
| NOTE     | `packages/backend/src/controllers/exportController.ts:345-346` | Using `as any` type cast for `user.email` access; acceptable pattern but not ideal TypeScript practice |
| NOTE     | `packages/frontend/pages/organizer/promote/[saleId].tsx:188` | Token retrieved from localStorage; adequate for MVP but httpOnly cookies preferred for production |

---

## File-by-File Review

### 1. `cloudinaryWatermark.ts`

**Status: FAILING**

The utility applies FindA.Sale watermarks to Cloudinary image URLs via URL-based transformations. While the logic for URL parsing and version segment detection is sound, the transformation insertion is malformed.

**Issue:** Line 41-44 constructs:
```typescript
originalUrl.slice(0, versionIndex) + watermarkTransformation + originalUrl.slice(versionIndex)
```

For input `https://res.cloudinary.com/abc/image/upload/v1/findasale/item.jpg`, this produces:
```
https://res.cloudinary.com/abc/image/uploadl_text:Montserrat_bold_18:FindA.Sale,g_south_east,x_20,y_20,o_60/v1/findasale/item.jpg
```

This is invalid. Cloudinary expects:
```
https://res.cloudinary.com/abc/image/upload/l_text:Montserrat_bold_18:FindA.Sale,g_south_east,x_20,y_20,o_60/v1/findasale/item.jpg
```

**Fix required:** Insert forward slash before watermark transformation:
```typescript
originalUrl.slice(0, versionIndex) + '/' + watermarkTransformation + originalUrl.slice(versionIndex)
```

---

### 2. `exportController.ts`

**Status: FAILING (due to blocker in watermarkUtility; code logic otherwise solid)**

The controller implements three export formats (EstateSales.NET CSV, Facebook JSON, Craigslist text) with proper security and data validation:

✓ All three endpoints enforce authentication via `AuthRequest` type
✓ Ownership verified against `sale.organizer.userId` in all three functions
✓ Published items enforced via `where: { draftStatus: 'PUBLISHED' }` filter
✓ CSV escaping correctly handles commas, quotes, newlines
✓ Response headers set appropriately (Content-Type, Content-Disposition)
✓ Error handling present with meaningful messages
✓ No secrets or credentials exposed

**Minor issues:**

- **Date formatting fragility (line 318):** Using `new Date(sale.startDate)` interprets ISO strings as UTC, causing timezone-dependent date shifts. Not critical if `startDate` is always in known format, but fragile. Recommend using a date library (date-fns, Day.js) for robust timezone handling in future.
- **Type safety (lines 345-346):** Using `as any` cast for nested user property. Acceptable but could be improved with better type definitions.

---

### 3. `export.ts` (Routes)

**Status: PASS**

Routes file is minimal and correct:

✓ All three exports imported from controller
✓ `authenticate` middleware applied to all routes
✓ Route patterns match controller endpoint names
✓ Route paths follow REST conventions (`:saleId` parameter)

---

### 4. `[saleId].tsx` (Promote Page)

**Status: PASS**

Frontend is well-structured with proper auth and UX handling:

✓ Authentication check enforces `role === 'ORGANIZER'` (line 98)
✓ Ownership verification compares `sale.organizer.userId` to `user?.id` (line 167)
✓ Loading states use Skeleton component (line 136)
✓ Error states show helpful messages with navigation (lines 150, 154)
✓ Mobile responsive via Tailwind breakpoints (grid cols 1→3 on md:)
✓ Download and clipboard-copy handlers both use Bearer token auth
✓ Published item count fetched and displayed with conditional plural (line 286)
✓ Semantic HTML structure (`<details>` for help section)
✓ No hardcoded credentials; API base URL via env var

**Minor notes:**
- Token from `localStorage` is standard SPA practice; httpOnly cookies recommended for future production hardening.
- No explicit `aria-label` attributes, but semantic structure aids accessibility.

---

### 5. `index.ts` (Backend Entry)

**Status: PASS**

Export router properly registered:

✓ Import statement: line 91 (`import exportRouter from './routes/export'`)
✓ Route mount: line 244 (`app.use('/api/export', exportRouter)`)
✓ Placement follows convention (after other route registrations)
✓ No duplicate routes or conflicts

---

## Conditions to Ship

- [x] Watermark transformation must be fixed: add forward slash before watermark param
- [ ] **BLOCKER: Fix cloudinaryWatermark.ts line 41-44 before shipping**
- [x] Date formatting in Craigslist export: acceptable as-is but log as tech debt
- [x] Type safety in Craigslist contact fetch: acceptable but note for refactor
- [x] All auth checks in place
- [x] All ownership verifications in place
- [x] All PUBLISHED item filters in place
- [x] All response headers correct

---

## Summary

Sprint 2 is **feature-complete and security-sound**, but the Cloudinary watermark URL construction bug is a **hard blocker**. This bug affects all three export formats since they all use `getWatermarkedUrl()`. Watermarked image URLs will be malformed (missing forward slash), causing images to fail loading in exported data.

**Required action before shipping:** Fix the forward slash in `cloudinaryWatermark.ts` line 41-44.

Once that single-line fix is applied, all QA checks will pass.

---

### Context Checkpoint
no
