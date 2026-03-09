# Bug Blitz Scoping Report — Session 105
**Date:** 2026-03-09
**Prepared by:** findasale-qa
**Status:** Ready for findasale-dev execution

---

## Executive Summary

This report scopes all known production bugs from the BACKLOG_2026-03-08.md Section A (Production Bugs). **Eight P0 bugs block beta launch.** Remaining P1 and P2 bugs are non-blocking but should be prioritized for first-week production support.

**Critical path:** P0 Map (A1.1/A1.2) → P0 Mobile Menu (A2.1) → P0 Photo Upload (A3.1/A3.2/A3.6/A3.7) → P0 Dashboard Audit (A4.1).

---

## P0 Bugs (Block Beta Launch)

| ID | Issue | Root Cause | Fix Complexity | Test Plan |
|----|-------|-----------|-----------------|-----------|
| **A1.1** | Map pins not rendering on homepage | Leaflet component not receiving or mapping `pins` prop correctly. `SaleMap.tsx` wrapper passes props to `SaleMapInner`, but data flow from `/sales` API endpoint may have field mismatch (lat/lng vs coordinates). Or: marker rendering loop in `SaleMapInner` has condition preventing render. | **M** (30–90 min) | 1. Load homepage, verify /sales API returns lat/lng. 2. Inspect SaleMapInner markers loop. 3. Verify Leaflet marker icons load (check CDN). 4. Test with 5–10 mock sales. Confirm pins appear, popups trigger on click. |
| **A1.2** | Map broken on mobile | Distinct from A1.1. Likely: MapContainer height collapsing on mobile viewport, or touch event handling failing on Leaflet. May be viewport meta tag or CSS height issue. Test on iOS (Safari) + Android (Chrome). | **M** (30–90 min) | 1. Test on iPhone 12 Safari / Android Chrome in responsive mode. 2. Verify MapContainer height is set (not 'auto'). 3. Test pan/zoom with touch gestures. 4. Check if pins appear on mobile (may be separate from A1.1). 5. Verify no z-index conflicts with bottom tab nav. |
| **A2.1** | Sandwich menu (mobile nav) blocked by "Add to Home Screen" banner | `InstallPrompt.tsx` renders at `z-50` (fixed bottom). `BottomTabNav.tsx` also at fixed bottom, also `z-50`. Banner overlaps lower menu items. CSS z-index conflict or positioning overlap (both `bottom-0` or `bottom-4`). | **S** (<30 min) | 1. Load homepage on mobile (responsive mode). 2. Trigger install banner (first visit, not dismissed). 3. Verify menu items are clickable beneath banner OR banner is positioned to not overlap. 4. Dismiss banner, verify menu fully accessible. 5. Test on both Android (InstallPrompt shows) and iOS (different banner). |
| **A3.1** | Photo upload fails: "Upload failed: Unexpected field" | Multer field name mismatch. Frontend sends field name `X`, backend expects `Y`. Check: `upload.single('photo')` expects `photo` field; frontend form must use `formData.append('photo', file)`. Or: `upload.array('photos')` expects `photos`; frontend sends `photo` singular. | **S** (<30 min) | 1. Open organizer edit-item page. 2. Select photo, attempt upload. 3. Monitor network tab: check FormData field names in request. 4. Verify backend route matches (`/api/upload/item-photo` vs `/api/upload/sale-photos`). 5. Confirm Cloudinary API credentials are set (not the error source). 6. Verify upload succeeds, image appears in preview. |
| **A3.2** | Photo upload fails on mobile too | Same as A3.1 — "Unexpected field" error is backend-level, affects all platforms. Confirmation that A3.1 is the real issue, not mobile-specific. | **S** (included in A3.1 fix) | Same as A3.1; verify on mobile device or responsive mode. |
| **A3.6** | Server error on manual item entry | Item creation endpoint (`POST /api/items`) failing. Check: `itemController.createItem()` endpoint may have validation error (missing required field), or Prisma `item.create()` failing due to schema mismatch. May be related to A3.1 if items without photos are being rejected, or sale ID not passed. | **M** (30–90 min) | 1. Go to organizer add-items page (manual entry, no photo). 2. Fill form: title, description, price, category. 3. Click save/submit. 4. Monitor network tab for error response. 5. Check backend logs for Prisma validation or DB constraint error. 6. Verify item is created (check DB or dashboard). 7. Test with and without photos. |
| **A3.7** | Rapid Capture camera says "camera unavailable" | `MediaDevices.getUserMedia()` failing. Likely: permissions not requested in PWA context, or camera not available in test environment. PWA may need `camera` permission in manifest or user permission dialog not triggering. Browser may also be denying camera in non-HTTPS context (but site is HTTPS). | **M** (30–90 min) | 1. Open add-items page, click Rapid Capture. 2. Check browser console for `NotAllowedError`, `NotFoundError`, or `NotSupportedError`. 3. Grant camera permission when prompted (test both grant and deny flows). 4. Verify camera feed appears or error message is clear. 5. Test on mobile device (iOS: check Safari camera permissions in Settings). 6. Confirm fallback UI if camera unavailable. |
| **A4.1** | Dashboard audit required | Multiple issues: buttons conflicting, QR codes blank, can add items without selecting a sale first, tab/feature confusion. Needs comprehensive UX audit and backend state validation. Likely: missing sale context on item creation, or QR code generation failing silently. | **L** (>90 min) | 1. Full walkthrough of dashboard: 2. Try each button/tab in sequence. 3. Test adding item without sale selected — should either error or prompt for sale. 4. Inspect QR code component: verify sale ID is passed, check Cloudinary QR generation. 5. Verify all tabs are reachable and functional. 6. Test edit/delete/clone operations. 7. Check organizer analytics data loads correctly. 8. Document all broken features and prioritize fixes. |

### P0 Dependencies & Fix Order

**Recommended sequence:**

1. **A1.1 → A1.2** (Map): Fix data flow first, then mobile viewport. These block homepage shopping experience.
2. **A2.1** (Mobile Menu): Fix z-index / positioning while A1 is in progress.
3. **A3.1/A3.2** (Photo Upload): Critical for organizer onboarding. Fix field name mismatch immediately after menu.
4. **A3.6** (Manual Item Entry): Unblock item creation flow.
5. **A3.7** (Rapid Capture): Convenience feature, can defer if time-constrained, but test early to avoid surprises.
6. **A4.1** (Dashboard Audit): Comprehensive; may spawn sub-tasks. Run end-to-end after A3.1/A3.6 are fixed.

**Blocking chains:**
- Cannot fully test items without fixing A3.1 (photo upload).
- Cannot test dashboard without fixing A3.6 (item creation).
- Dashboard (A4.1) is blocked on items working (A3.1 + A3.6).

---

## P1 Bugs (High Impact, Non-Blocking)

| ID | Issue | Root Cause | Fix Complexity | Test Plan |
|----|-------|-----------|-----------------|-----------|
| **A1.3** | "My location" button does nothing | Geolocation API not triggered on button click, or permission denied silently. `map.tsx` has auto-request on mount (works), but manual button needs event handler. May be button not wired, or geolocation permission flow broken. | **M** (30–90 min) | 1. Load `/map` page. 2. Click "My location" button. 3. Monitor console for geolocation errors. 4. Grant permission when prompted. 5. Verify map flies to user location. 6. Test deny flow: ensure graceful error. 7. Test on iOS (Safari geolocation rules differ). |
| **A1.4** | Search only searches sale text, not item text | FTS (full-text search) shipped on items (Sprint 4b), but main search bar `/` only queries sales table. Need to integrate item FTS into homepage search or `/search` results page and merge with sales results. | **M** (30–90 min) | 1. Search for "chair" (common item). 2. Verify results include both sales AND items with chairs. 3. Check that relevance ranking is sensible (sales above items, or item count weighted). 4. Test on `/search` page (items tab) and homepage search. 5. Verify performance (FTS should be fast). |
| **A1.5** | Map page needs features (route planning, etc.) | P2 for features, but "my location" (A1.3) is P0 dependency. Scope: route planning is out of scope for beta. | **L** (deferred) | Post-beta: research route planning library (e.g., Mapbox Directions API, OpenRouteService). Not a blocker. |
| **A2.2** | "Add to Home Screen" banner shows old SaleScout logo | Rebrand artifact. Check: `manifest.json` icons path correct? Manifest `name`/`short_name` should be "FindA.Sale" (confirmed). Icons at `/icons/icon-*.png` — verify actual PNGs exist and contain correct logo. Likely missing image or cache. | **S** (<30 min) | 1. Load homepage, open DevTools. 2. Check manifest.json in Network tab. 3. Verify icons path resolves (go to `/icons/icon-192x192.png` in browser). 4. Clear browser cache, hard refresh. 5. Trigger install prompt again. 6. Verify icon is new logo, not SaleScout. |
| **A3.3** | Photo delete button shows "\uood" on hover | Unicode rendering bug. Likely: Unicode character in aria-label or tooltip not encoded properly. Check button's aria-label for escaped sequence like `\uood` (should be proper character). May be Tailwind class or CSS content. | **S** (<30 min) | 1. Go to edit-item page, add photo. 2. Hover over delete button. 3. Inspect element: check aria-label for malformed Unicode. 4. Fix: either use proper UTF-8 character or remove aria-label if not needed. 5. Re-test hover. |
| **A3.4** | "Save Changes" button fails: "failed to update item" | Item update endpoint (`PATCH /api/items/:id`) failing. May be related to A3.1 (field name mismatch) or independent schema issue. Check: request body validation, Prisma update logic. Could be permissions (user not owner) or missing fields. | **M** (30–90 min) | 1. Edit an item (change title/description/price, no photo). 2. Click save. 3. Monitor network tab for error response. 4. Check backend logs. 5. Verify item is NOT updated (confirm failure). 6. Test with and without photo changes. 7. Verify after A3.1 is fixed. |
| **A3.5** | Batch upload works but "AI analysis unavailable for this image" | Cloudinary upload succeeds, but AI analysis pipeline broken. Check: OLLAMA_URL reachable? Vision model (`qwen3-vl:4b`) available? Cloudinary config correct? `analyzePhotoWithAI()` endpoint failing. | **M** (30–90 min) | 1. Batch upload 5 photos. 2. Check: do uploads succeed (images visible)? 3. Check: does AI analysis trigger? 4. Monitor backend logs for Ollama connection errors. 5. Verify OLLAMA_URL env var set on backend. 6. Test with dummy image to confirm error. 7. May need Ollama server restart. |
| **A3.8** | "photos upload tabs" (upload tabs broken/misaligned) | UI rendering issue on add-items page photo upload interface. Likely: CSS flex/grid issue or responsive breakpoint mismatch. Tabs may not be switching properly or layout collapsing on mobile. | **M** (30–90 min) | 1. Go to organizer add-items page. 2. Check photo upload tab section (should have: Camera, Batch Upload, Rapid Capture, AI Analysis tabs). 3. Verify tabs are clickable and switch content. 4. Check alignment on mobile (responsive mode). 5. Inspect element for CSS issues. 6. Test all tabs functional. |
| **A5.1** | Two header sections and two footers on leaderboard | Layout wrapper rendered twice or Fragment not used. Check: `pages/leaderboard.tsx` for duplicate Layout/Header/Footer components. Likely copy-paste artifact. | **S** (<30 min) | 1. Load `/leaderboard`. 2. Inspect page source. 3. Count `<header>` and `<footer>` tags. 4. Verify only one of each. 5. Remove duplicate. 6. Test page renders correctly. |
| **A5.2** | Leaderboards don't link to organizer profiles | Leaderboard rendering names but not as clickable links to `/organizer/[id]` pages. Check: leaderboard component not using `Link` or href. | **S** (<30 min) | 1. Load `/leaderboard`. 2. Click on an organizer name. 3. Should navigate to organizer profile. 4. Add `Link` or `<a href>` wrapper to names. 5. Test links work. |
| **A5.3** | No badges showing on leaderboard | Badge system not rendering. Check: badges in DB for users? Badge component not imported or badges field missing from query. | **M** (30–90 min) | 1. Query DB for badge records. 2. Verify badges assigned to test users. 3. Check leaderboard query includes badges. 4. Inspect BadgeDisplay component rendering. 5. Verify badges appear next to organizer names. |
| **A6.1** | Footer still references "Grand Rapids" | Geography-specific copy, should be neutral. Find and replace "Grand Rapids" → generic language or remove geographic reference. Check: `components/Footer.tsx` or `_document.tsx`. | **S** (<30 min) | 1. Search codebase for "Grand Rapids" in footer. 2. Replace with generic copy (e.g., "Nationwide", or context-aware "Your area"). 3. Hard refresh page footer. 4. Verify change appears. |

---

## P2 Bugs (Medium Priority, Nice-to-Have)

| ID | Issue | Root Cause | Fix Complexity |
|----|-------|-----------|-----------------|
| **A1.5** (cont.) | Map page routing/interactivity enhancements | Out of scope for beta; FTS roadmap item. Research only. | **L** |

---

## Root Cause Summary by Component

### Frontend (packages/frontend/)

| Component | P0 Issues | P1 Issues | Action |
|-----------|-----------|-----------|--------|
| **Map Components** (`SaleMap.tsx`, `SaleMapInner.tsx`) | A1.1, A1.2 | A1.3, A1.4 | Verify Leaflet initialization, pins data flow, mobile viewport, button handlers |
| **Navigation** (`BottomTabNav.tsx`, `InstallPrompt.tsx`) | A2.1 | — | Z-index conflict, positioning overlap fix |
| **Photo Upload UI** (`ItemPhotoManager.tsx`) | A3.1, A3.2, A3.8 | A3.3, A3.5 | Check FormData field names, tab rendering, delete button Unicode |
| **Item Creation/Edit** (`edit-item/[id].tsx`) | A3.6 | A3.4 | Validate required fields, API error handling |
| **Dashboard** (`dashboard.tsx`) | A4.1 | — | Comprehensive UX audit: tabs, buttons, forms, QR generation |
| **Organizer Add-Items** (`add-items.tsx`) | A3.7 | — | Camera permission flow, error handling |
| **Leaderboard** (`pages/leaderboard.tsx`) | — | A5.1, A5.2, A5.3 | Remove duplicate layout, add links, badge rendering |
| **Footer** (site-wide) | — | A6.1 | Geographic reference removal |

### Backend (packages/backend/)

| Component | P0 Issues | P1 Issues | Action |
|-----------|-----------|-----------|--------|
| **Upload Routes** (`routes/upload.ts`) | A3.1, A3.2 | A3.5 | Verify field names (`photo` vs `photos`), Cloudinary config |
| **Upload Controller** (`uploadController.ts`) | A3.1, A3.2 | A3.5 | Check Multer field name expectations, Ollama vision model availability |
| **Item Controller** (`itemController.ts`) | A3.6 | A3.4 | Validate required fields, Prisma schema, error responses |
| **Sales Controller** | A1.1 | A1.4 | Verify `/sales` endpoint returns lat/lng, FTS query integration |

### Environment / Configuration

| Item | P0 | P1 | Action |
|------|----|----|--------|
| **Cloudinary** | A3.1 | A3.5 | Verify API key, secret, cloud name set in Railway |
| **Ollama** | — | A3.5, A3.7 | Verify OLLAMA_URL, vision model availability |
| **PWA Manifest** | — | A2.2 | Verify icons path, check actual PNG files exist |

---

## Test Environment & Prerequisites

Before findasale-dev begins:

1. **Local Frontend**: `cd packages/frontend && npm run dev` (Next.js dev server)
2. **Local Backend**: `cd packages/backend && npm run dev` (Express dev server, port 5000)
3. **Database**: Neon PostgreSQL configured, migrations up-to-date
4. **Cloudinary**: API credentials in `.env.local` (frontend) and Railway (backend)
5. **Ollama** (for A3.5, A3.7): Running locally or reachable via `OLLAMA_URL`
6. **Mobile Testing**: iPhone 12 (Safari) + Android device (Chrome), or responsive mode

---

## Estimation

| Priority | Count | Estimated Total |
|----------|-------|-----------------|
| **P0** | 8 bugs | ~10–12 hours (S/M mix, A4.1 is ~2–3 hrs) |
| **P1** | 12 bugs | ~8–10 hours (mostly S, few M) |
| **P2** | 0 bugs (A1.5 is research, deferred) | Deferred |

**Critical path (P0 only):** ~10–12 hours, ~2 full dev days with testing.

---

## Post-Fix Validation Checklist

- [ ] All P0 bugs verified fixed in staging/production
- [ ] Homepage map loads, pins render, mobile responsive
- [ ] Mobile menu accessible, not blocked by install banner
- [ ] Photo upload works (single + batch), field names confirmed
- [ ] Item creation works (manual + Rapid Capture + AI analysis)
- [ ] Dashboard fully functional, QR codes generate, sale context enforced
- [ ] P1 bugs (A1.3–A6.1) spot-checked for high-impact ones (A2.2, A5.1)
- [ ] Regression testing: existing features still work (auth, checkout, payments)
- [ ] No new console errors or warnings in production build

---

## Notes for findasale-dev

1. **A1.1 & A1.2**: Check data flow carefully. The map may be receiving empty pins due to API response mismatch.
2. **A2.1**: Simple z-index/positioning fix; test immediately to unblock mobile testers.
3. **A3.1 & A3.2**: Field name mismatch is the fastest fix. Check both frontend FormData and backend Multer config in one pass.
4. **A4.1**: This is comprehensive and may reveal sub-issues. Plan for 2–3 hours and be prepared to scope additional P1s.
5. **A3.7 & A3.5**: These may require Ollama/environment debugging. Coordinate with ops if env vars are missing.
6. **P1 bugs**: Many are quick wins (S complexity). Batch them after P0 for momentum.

---

**Files Read:**
- `claude_docs/BACKLOG_2026-03-08.md` (Section A: Production Bugs)
- `claude_docs/STATE.md` (P0 list confirmation)
- `packages/frontend/components/SaleMap.tsx`, `SaleMapInner.tsx`
- `packages/frontend/components/BottomTabNav.tsx`, `InstallPrompt.tsx`
- `packages/frontend/public/manifest.json`
- `packages/backend/src/routes/upload.ts`
- `packages/backend/src/controllers/uploadController.ts`, `itemController.ts`

**Report Generated:** 2026-03-09 by findasale-qa
**Status:** Ready for Session 105 Bug Blitz execution
