# UX Specification: Map Enhancements

**Status:** Ready for dev dispatch
**Date:** 2026-04-07 (S414)
**Scope:** Shopper discovery map — Treasure Trails integration + Route Planning UX

---

## Section 1: Treasure Trails on the Discovery Map

### Visual Indicator Strategy

**Primary approach: Trail Badge on Sale Pins**

- Add an icon badge (treasure-chest or trail icon) to sale map pins that have an active, public trail
- Badge placement: small overlay at the top-right corner of the existing marker pin
- Color: Gold/amber (amber-600) to match the app accent color
- Size: 16×16px
- Accessibility: `aria-label="This sale has an active Treasure Trail"` on hover
- Badge only appears for trails where `isActive = true` AND `isPublic = true`

### Pin Interaction Flow

**Tap/click a pin with a trail badge:**
1. Show existing sale popup (unchanged)
2. Add CTA button at bottom: **"View Treasure Trail"** (primary button, green)
3. Tapping → navigate to `/trail/[shareToken]` (public trail view, no sign-in required)

**Tap/click without trail:** behavior unchanged.

### Optional MVP2: Trail Filter Chip

Add filter chip in map header:
- Label: **"Trails"** / **"Has Trail"**
- When active: filter map to show only sales with active public trails
- Styling: same as existing date/sale-type filters (amber-600 when active)
- Deferrable to MVP2

### Data Contract: Backend API Changes

Extend `GET /api/sales?limit=200` response to include:
```json
{
  "id": "sale_123",
  "hasActiveTrail": true,
  "trailShareToken": "abc123token"
}
```

In `saleController.listSales()`, add to Prisma include:
```prisma
trails: {
  where: { isActive: true, isPublic: true },
  select: { id: true, shareToken: true }
}
```
Then map: `hasActiveTrail = sale.trails.length > 0`, `trailShareToken = sale.trails[0]?.shareToken || null`.

Extend `SalePin` interface:
```typescript
hasActiveTrail?: boolean;
trailShareToken?: string;
```

---

## Section 2: Route Planning Enhancement

### Current State
RouteBuilder.tsx exists with 2–5 sale selection and Google Maps handoff. Missing: start from user location, end point.

### Feature 2a: "Start from My Location"

1. Toggle/checkbox above route builder: **"Start from my location"** (default OFF)
2. When toggled ON: trigger `navigator.geolocation.getCurrentPosition()`
   - If granted: auto-populate, show badge **"📍 Starting from: [city, state]"**
   - If denied: show toast "Location access denied. Route will start from the first selected sale."
3. Pass `userLocation` as first point to `planRoute()` API call

### Feature 2b: End Point (Optional, MVP2)

- Text search input below sales list: **"End point (optional)"** with address autocomplete
- If provided, route terminates at this address instead of last selected sale
- Requires geocoding service (check if Mapbox/Google Places already integrated)

### Feature 2c: Route Display Enhancement

1. Polyline connecting selected sales in order on the map
2. Numbered pins (1, 2, 3...) for each stop in sequence
3. Route details: total distance, total duration, estimated arrival per stop
4. Action buttons: "Open in Google Maps" (existing) + "Copy Route"

### Data Contract: routeApi Enhancement

```typescript
async function planRoute(
  saleIds: string[],
  options?: {
    userLocation?: { lat: number; lng: number };
    endPoint?: { lat: number; lng: number };
  }
): Promise<RouteResult>
```

---

## Section 3: Implementation Complexity

| Feature | Complexity | Sessions | Dependencies | Ready? |
|---------|-----------|----------|-------------|--------|
| Treasure Trails Badge | Simple | 1 | Trails API exists | ✅ Yes |
| Start from My Location | Simple–Med | 1–1.5 | Geolocation (exists) | ✅ Yes |
| End Point (MVP2) | Medium | 1.5–2 | Geocoding service | ⚠️ Conditional |
| Route Polyline Display | Medium | 1.5–2 | OSRM coords return | ⚠️ Conditional |

### Recommended Rollout

**MVP (dispatch now):**
1. Treasure Trails badge on map pins
2. Start from my location toggle

**MVP2 (next session):**
3. End point address search
4. Route polyline visualization
