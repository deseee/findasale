# #28 Neighborhood Heatmap — Architecture Spec

**Date:** 2026-03-15
**Estimate:** 0.5–1 sprint (16–32 engineering hours)
**Priority:** #4 in locked queue (post-Batch Operations #8)
**Risk Level:** 🟡 MEDIUM (new endpoint + visualization layer; no schema changes; no auth complexity)

---

## Summary

Sale density overlay on the shopper map (finda.sale/map) — color-coded zones by active sale count within defined neighborhoods. Helps shoppers identify high-concentration areas and plan efficient route-hopping. Incremental on existing Leaflet + OSRM route planning stack (session 114). No new database tables required; computed from existing `Sale` records.

**User Story:** Shopper opens /map, sees a heatmap where neighborhoods with many active sales are colored dark red (30+ sales), tapering to light yellow (1–5 sales). Clicking a zone zooms to that neighborhood; the legend explains the scale.

---

## Backend Changes

### New Endpoints

#### 1. `GET /api/sales/heatmap`
Fetches pre-computed or on-demand density data for the visible map bounds.

**Query Parameters:**
- `lat` (float, optional): Map center latitude
- `lng` (float, optional): Map center longitude
- `zoom` (integer, optional): Zoom level (1–18) for tile granularity
- `days` (integer, optional, default: 7): Rolling window; count active sales in past N days from today
- `forceRefresh` (boolean, optional, default: false): Bypass cache, recompute from DB (admin only)

**Response:**
```json
{
  "tiles": [
    {
      "lat": 42.96,
      "lng": -85.67,
      "radius": 0.5,
      "saleDensity": 24,
      "saleDensityCategory": "high",
      "color": "#d32f2f",
      "salesInRadius": ["sale-id-1", "sale-id-2", ...]
    },
    ...
  ],
  "legend": {
    "1-5": { "color": "#fff3e0", "label": "Very Low (1–5)" },
    "6-10": { "color": "#ffe0b2", "label": "Low (6–10)" },
    "11-20": { "color": "#ffb74d", "label": "Medium (11–20)" },
    "21-30": { "color": "#f57c16", "label": "High (21–30)" },
    "30+": { "color": "#d32f2f", "label": "Very High (30+)" }
  },
  "timestamp": "2026-03-15T14:30:00Z",
  "cacheAge": 180
}
```

**Cache Strategy:**
- Pre-computed grid tiles cached in-memory or Redis for 6 hours (per roadmap: "pre-computed grid tiles every 6h")
- Cache key: `heatmap:grid:date` (e.g., `heatmap:grid:2026-03-15`)
- On cache miss, compute from database (see "Pre-computation Strategy" below)
- TTL: 6 hours; cron job refreshes at 12:00 AM, 6:00 AM, 12:00 PM, 6:00 PM local time

#### 2. `POST /api/admin/heatmap/refresh` (Admin Only)
Manual cache invalidation trigger. Runs compute job synchronously or enqueues it.

**Request:**
```json
{
  "forceSync": true,
  "days": 7
}
```

**Response:**
```json
{
  "status": "refreshing",
  "jobId": "job-uuid",
  "estimatedSeconds": 12
}
```

### Schema Changes

**None.** Heatmap uses existing `Sale` model:
- Queries: `status = 'PUBLISHED'` + `startDate <= now AND endDate >= now` (active) + created within last N days
- Grouping: By geohash or lat/lng grid cells (computed, not stored)
- No new tables, columns, or indexes required

**Optional (deferred to Phase 2):** Index on `(status, startDate, endDate, lat, lng)` to accelerate heatmap queries once traffic warrants it.

### Pre-computation Strategy

**Trigger:** Cron job runs at 00:00, 06:00, 12:00, 18:00 UTC daily.

**Algorithm:**
1. Fetch all PUBLISHED sales with `startDate <= now AND endDate >= now`
2. Generate geohash grid at precision 4–5 (1–2 km cells) for default map bounds (Grand Rapids metro, but API supports dynamic bounds)
3. For each cell:
   - Count active sales within cell
   - Assign color based on density tier (1–5 = light yellow, 30+ = dark red)
   - Store center lat/lng + radius (0.5 km typical)
4. Cache result in-memory (or Redis if multi-process) under key `heatmap:grid:YYYY-MM-DD`
5. Serve from cache on `GET /api/sales/heatmap`

**Estimated compute time:** ~50–200ms for 100–500 active sales (Grand Rapids beta scale). Single-threaded; acceptable overhead.

**Why 6h interval?** Balances freshness (sales change hourly) with compute cost. At beta scale (0–100 sales/week), refresh lag is invisible to users.

**Fallback:** If cron fails, cache expires at 6h TTL; next request triggers compute synchronously (30–200ms latency penalty).

---

## Frontend Changes

### Map Layer Approach

**Technology:** Leaflet + D3.js overlay (or Leaflet.heat if simpler; D3 preferred per existing stack, session 114).

**Why not Leaflet.heat?**
- Leaflet.heat is optimized for point clouds (lat/lng heatmaps), not grid tiles
- Our use case is grid cells + color coding by discrete density buckets (5 tiers), not smooth gradients
- D3 gives fine control over cell styling, click handlers, and legend binding

**Rendering Flow:**
1. Fetch `/api/sales/heatmap?lat=userLat&lng=userLng&zoom=mapZoom` on map mount + zoom/pan
2. D3 binds tile data to SVG circles (or rectangles) overlaid on Leaflet canvas
3. Color each circle by `saleDensityCategory` (legend map, above)
4. On click, zoom map to cell bounds; filter pins to that neighborhood
5. Optional: Show sale count badge in cell center

**Layer Stack:**
```
Leaflet Base (OpenStreetMap tiles)
  ↓
Sale Pins (markers, existing)
  ↓
D3 SVG Overlay (heatmap circles + labels)
  ↓
Popup/Tooltip (click handler)
```

### Component Changes

**New or Modified Files:**

1. **`packages/frontend/components/HeatmapOverlay.tsx`** (NEW)
   - React component wrapping D3 heatmap logic
   - Props: `tiles` (from API), `mapBounds` (from Leaflet), `onCellClick`
   - Renders SVG circles; binds click + hover handlers
   - Re-renders on new tile data or map pan/zoom

2. **`packages/frontend/components/HeatmapLegend.tsx`** (NEW)
   - Simple legend display: 5 color swatches + labels
   - Positioned absolute in map corner (top-right or bottom-left, TBD per UX)
   - Shows cache age: "Data refreshed 45 min ago"

3. **`packages/frontend/components/SaleMapInner.tsx`** (MODIFIED)
   - Add state: `heatmapTiles`, `heatmapVisible` (toggle)
   - Add query hook: `useQuery(['heatmap', bounds], () => fetchHeatmap(bounds))`
   - Add toggle button in header: "Show Heatmap"
   - Render `<HeatmapOverlay>` conditionally below markers layer

4. **`packages/frontend/pages/map.tsx`** (MODIFIED)
   - Pass `showHeatmap` state down to `<SaleMap>`
   - Add toggle UI in header strip (next to date filters)

**API Integration:**
- New hook: `useHeatmapTiles(mapBounds, enabled)` in `packages/frontend/hooks/` (or inline in SaleMapInner)
- Fetch debounced on pan/zoom (500ms debounce to avoid spam)

### Installation Requirements

**No new npm packages strictly required.** D3 is NOT in frontend package.json, so we must decide:
- **Option A (preferred):** Add `d3` as lightweight dependency. Existing `recharts` dependency already includes heavy D3 transitive deps (10+ MB gzip). Adding explicit `d3@7` adds minimal overhead. Cost: ~200 KB gzip for full d3 library.
- **Option B (lighter):** Use Leaflet native + canvas-based circles (no D3). Simpler, no new deps, but less flexible styling. Acceptable if UX is basic color zones only.
- **Recommendation:** Option A. D3 gives us fine-grained control over interactivity (click zoom, hover popup). Worth the 200 KB for feature polish.

If Option A chosen: Update `packages/frontend/package.json`:
```json
{
  "dependencies": {
    "d3": "^7.8.5"
  }
}
```

---

## Implementation Order (Phases)

### Phase 1: Backend (Completed before frontend work)
1. Write heatmap compute algorithm in `packages/backend/src/services/heatmapService.ts`
   - Geohash or grid cell logic
   - Density binning
   - Color mapping
2. Create `GET /api/sales/heatmap` endpoint in `packages/backend/src/routes/sales.ts`
   - Query parsing (lat, lng, zoom, days)
   - Cache logic (check Redis/memory, fallback to compute)
   - Response serialization
3. Optional: Create `POST /api/admin/heatmap/refresh` for manual refresh
4. Set up cron job in `packages/backend/src/jobs/` or `services/`
   - Daily 6h interval refresh
   - Log cache hits/misses for monitoring
5. QA: Call endpoint locally; validate tile shape, color logic, cache behavior

### Phase 2: Frontend Data Layer
1. Add `d3` to package.json (if Option A chosen)
2. Create `packages/frontend/hooks/useHeatmapTiles.ts`
   - React Query hook wrapping `GET /api/sales/heatmap`
   - Debounce pan/zoom requests
   - Handle errors gracefully (show toast, fallback to empty tiles)
3. Integration test: Fetch heatmap data in browser, verify shape + colors

### Phase 3: Frontend Rendering
1. Create `HeatmapOverlay.tsx` with D3 SVG rendering
   - Bind tile data to circles
   - Scale radius to map zoom level (smaller radius at high zoom)
   - Apply color + opacity
   - Add click handler (zoom to cell, filter pins, highlight)
2. Create `HeatmapLegend.tsx` with legend swatches
3. Modify `SaleMapInner.tsx` to include overlay + toggle
4. Add header UI in `map.tsx` for "Show Heatmap" toggle
5. E2E test: Open /map, toggle heatmap, verify circles appear + colors match legend

### Phase 4: Polish + Monitoring
1. Tune D3 animation (fade-in on load, smooth update on zoom)
2. Add loading skeleton while fetching tiles
3. Add "Data stale" warning if cache age > 12h
4. Monitor: Log cache hit rate, compute time, error rates to Sentry
5. Performance: Confirm heatmap render < 200ms for 100 tiles

---

## Risk / Open Questions

### Technical Risks

1. **Geohash precision:** At zoom 11–13 (typical shopper view), 1–2 km cells may feel too coarse. If cells are > 100 sales each, zones feel undifferentiated. Mitigation: Test with real data post-launch; adjust grid precision dynamically per zoom level (finer at high zoom).

2. **Cache invalidation timing:** 6h refresh may be stale for rapidly-changing sales (opening/closing hourly). Mitigation: Accept as MVP; add real-time pub/sub (Redis/Socket.io) in Phase 2 if data freshness becomes blocker.

3. **D3 performance at scale:** If 1000+ sales in view, rendering 100+ circles may stutter on mobile. Mitigation: Implement viewport culling (only render tiles in visible bounds); use canvas instead of SVG if frame rate drops below 30 FPS.

4. **API response size:** Tiles response includes `salesInRadius` (array of sale IDs per tile). For 100 tiles × 20 sales/tile = 2000 IDs ≈ 50 KB JSON. Acceptable but monitor. Mitigation: Omit `salesInRadius` array from API; fetch on-demand if user clicks a cell.

### Open Questions

1. **Cell shape:** Circles (current proposal) vs. hexagons (more standard for heatmaps) vs. grid squares (simplest)? Circles are gentle + easy to tune radius; hexagons are more professional but require library (h3); squares are rigid. **Proposal: Circles for MVP; defer hexagon polish.**

2. **Zoom-dependent granularity:** Should grid precision adapt to zoom level? At zoom 11 (city view), 2 km cells. At zoom 16 (street view), 100 m cells? **Proposal: Fixed 1.5 km cells for MVP; revisit if UX data shows cells are too coarse/fine.**

3. **Temporal window:** Current proposal is 7-day rolling window (active sales started ≤7 days ago). Should this be configurable? **Proposal: Fixed 7d for MVP (matches roadmap note "7-day rolling window baked in"); no UI toggle.**

4. **Mobile UX:** On mobile, tap a cell → what happens? Zoom to cell + filter pins? Navigate to neighborhood detail page? **Proposal: Zoom to cell bounds, filter pin list to that neighborhood, show cell's sale count in header.**

5. **Cold start:** What if no PUBLISHED sales exist (pre-beta)? Show empty map or placeholder? **Proposal: If 0 sales, skip heatmap layer entirely (hidden behind toggle, disabled).**

---

## Success Criteria (Pre-Launch QA)

- [ ] Backend endpoint returns valid GeoJSON/tile array in <200ms
- [ ] Heatmap renders on /map page with 5-tier color legend visible
- [ ] Clicking a tile zooms to cell bounds and filters sale pins
- [ ] Legend matches API color scheme exactly
- [ ] Cache refreshes every 6h without manual intervention
- [ ] No regressions on existing map features (pins, route builder, geolocation)
- [ ] Mobile responsive: legend + toggle accessible on small screens
- [ ] Error handling: Network failure shows toast, map remains functional
- [ ] Sentry monitoring: Cache hit rate, compute time, error rate logged

---

## Rollout Plan

1. **Staging (1 day):** Deploy backend + frontend to staging. QA smoke test. Patrick tests on local network.
2. **Production (1 day):** Deploy to Vercel (frontend) + Railway (backend). Monitor Sentry for 24h. Keep heatmap behind feature flag (defaultFalse for shopper users, enabled for Patrick testing).
3. **Beta Reveal (TBD):** Once beta organizers activate, flip flag to default-true. Gather shopper feedback on UX (cell size, colors, performance).

---

## Files to Create / Modify

### Backend
- `packages/backend/src/services/heatmapService.ts` (NEW)
- `packages/backend/src/routes/sales.ts` (MODIFIED: add endpoint)
- `packages/backend/src/jobs/heatmapCacheRefreshJob.ts` (NEW: cron job)

### Frontend
- `packages/frontend/components/HeatmapOverlay.tsx` (NEW)
- `packages/frontend/components/HeatmapLegend.tsx` (NEW)
- `packages/frontend/hooks/useHeatmapTiles.ts` (NEW)
- `packages/frontend/components/SaleMapInner.tsx` (MODIFIED: add overlay + toggle)
- `packages/frontend/pages/map.tsx` (MODIFIED: add toggle button)
- `packages/frontend/package.json` (MODIFIED: add `d3@7.8.5` if Option A chosen)

### Documentation
- `claude_docs/feature-notes/heatmap-spec-2026-03-15.md` (THIS FILE)

---

## Notes for Subagent Dispatch

When handing off to `findasale-dev`:

1. **Provide full spec above + existing stack references:**
   - Link existing Leaflet map: `packages/frontend/components/SaleMapInner.tsx`
   - Link existing route builder with OSRM: `packages/frontend/components/RouteBuilder.tsx` (if exists)
   - Link existing sales fetch: `packages/backend/src/controllers/saleController.ts` (listSales endpoint)

2. **Key constraints:**
   - No schema changes allowed
   - D3 dependency decision: get Patrick approval before adding to package.json
   - Backend compute must finish in <200ms to avoid map lag
   - Cache strategy: 6h TTL via cron job (not on-demand)

3. **Testing checklist:**
   - Test endpoint with 0, 10, 100, 500+ sales in DB
   - Test heatmap render with 10, 50, 100+ tiles
   - Test on mobile (iOS Safari, Android Chrome)
   - Test cache refresh timing (verify 6h expiry)

