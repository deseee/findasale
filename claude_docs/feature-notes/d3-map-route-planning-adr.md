# ADR — D3: Map Route Planning — 2026-03-09

Backlog ref: D3 | Priority: Post-MVP | User story: Shopper can plan optimal routes visiting 3–5 sales on same day

---

## The Problem

Shoppers hunting for deals at multiple estate/yard sales on a single day face a friction point: they must mentally construct an efficient route or use Google Maps to plan between separate sale locations. Each trip-planning context switch adds cognitive load and delays purchase intent.

**Current state:**
- Shopper opens `/map` and sees all sales near them
- They identify 3–5 sales they want to visit
- They manually copy addresses into Google Maps or use phone GPS per stop
- No way to compare routes, reorder stops, or see estimated drive times
- Lost opportunity to provide value-add (see below)

**Desired state:**
- Shopper selects multiple sales on map
- System calculates and displays an optimized route
- Shopper sees drive times, distances, waypoint order
- Option to export/save the route to maps app
- Potential future value: integrate with "plan my day" features (e.g., time-gated auctions, reserved time slots)

---

## User Jobs To Be Done

1. **Plan an efficient day:** "I want to hit 5 sales in 3 hours without backtracking."
2. **Estimate time:** "Will I have enough time before the 1 PM auction starts?"
3. **Share routes:** "Can I share this route with my friend who's meeting me?"
4. **Discover new stops:** "What other sales are on my way?"
5. **Respect time constraints:** "Avoid sales too far from my start point."

---

## Options Considered

### Option A: Client-Side Routing (Leaflet Routing Machine + OSRM Public)

**Approach:** Use JavaScript library (e.g., Leaflet Routing Machine) in browser; call OSRM public API (free, no auth) to calculate routes.

**Pros:**
- Zero backend changes
- Zero new infrastructure cost
- No API keys to manage
- Works offline (after initial route fetch)
- Low latency for user-initiated plans
- LRM is battle-tested, widely used

**Cons:**
- OSRM public tier has no SLA, rate limits are soft (likely 5–10 req/sec)
- No user history/saved routes at DB layer
- Can't track "most popular routes" for analytics
- UX is "stateless" — user loses route on navigation
- At scale (β+ 500 organizers), public OSRM might throttle
- Mobile UX is brittle (routing library adds ~50KB JS)
- No backend instrumentation for debugging route calculation failures

**Cost:** $0 (OSRM public)
**Complexity:** Medium (Leaflet setup + LRM integration, ~40 lines of new frontend code)
**Suitable for:** MVP prototyping; <100 DAU; proof of concept

---

### Option B: Backend Routing API (Express + OSRM/Valhalla)

**Approach:** Add `/api/routes/plan` endpoint; backend calls OSRM or Valhalla public API; return optimized waypoints + metadata. Optionally store routes in DB for analytics and future saved routes feature.

**Pros:**
- Clear separation of concerns (backend owns routing logic)
- Can rate-limit and meter OSRM calls per user
- Enables saved routes feature (`UserSavedRoute` table)
- Can track analytics: route popularity, avg distance, time saved
- Better mobile UX (backend returns optimized JSON, frontend just renders)
- Easy to add auth checks: only logged-in users can plan routes
- Easy to swap OSRM for Valhalla later without frontend changes
- Enables future: premium "smart routes" with time-gating (don't visit auction until 2pm)

**Cons:**
- Requires new Express route + controller
- Need error handling for routing API failures (OSRM down, no route found)
- Add ~15ms latency vs client-side (network round-trip to backend)
- Slight increase in backend complexity (dependency on external routing service)
- At scale: OSRM cost may increase (public tier limits us; paid tier ~$0.01–0.05 per request)

**Cost:** $0–50/month (OSRM public, or Valhalla free tier; paid tier ~500–2000/month if scaling to 10k daily route plans)
**Complexity:** Medium (new Express route, Axios call to OSRM, error handling, ~100 lines backend + 30 lines frontend)
**Suitable for:** Beta launch; future saved routes; analytics foundation

---

### Option C: Google Maps Directions Embed / Deep Link

**Approach:** Build a "Plan Route" button that constructs a Google Maps deep link with waypoints; user leaves FindA.Sale to complete routing in Google Maps.

**Approach variant:** Embed Google Maps Directions iframe on the sale cards.

**Pros:**
- Extremely simple: one URL construction + redirect
- Google Maps is familiar, reliable, authoritative
- No new infrastructure or API keys needed
- Users get Google's best routing + traffic data

**Cons:**
- User context lost: they leave FindA.Sale entirely
- No feedback loop: can't track if user completed the route
- Doesn't work if Google Maps access is blocked (some markets)
- No saved route history on FindA.Sale
- Requires Google Maps API key for embed variant
- **Not a feature — it's a deflection.** Doesn't solve the JTBD; just outsources it.
- Zero analytics; zero future upsell opportunity (smart routes, time-gating, etc.)

**Cost:** $0 deep link; $300+/month if embedding (Google Maps Platform API)
**Complexity:** Trivial (URL encoding)
**Suitable for:** Not recommended; treated as a fallback only.

---

## Decision: Option B (Backend Routing API)

**Rationale:**

FindA.Sale is pre-revenue beta, targeting ~50–200 organizers in Grand Rapids for initial launch. Option B is the right tradeoff:

1. **Minimal cost:** OSRM public API is free; no paid service tiers needed for β phase
2. **Foundation for growth:** Saved routes, analytics, and future time-gating all hinge on a backend API
3. **Better UX:** Backend handles route calculation; frontend stays light
4. **Auth story:** Only users logged into FindA.Sale can plan routes; external tools can't see user behavior
5. **Fail gracefully:** Backend can detect OSRM outages and offer fallback (e.g., "Try Google Maps" link or show straight-line distances)
6. **Scalable later:** If OSRM public is too limited in Y2, swap to Valhalla or Mapbox Directions (same API contract)

Option A is too stateless and brittle for a production feature; Option C abdicates responsibility.

---

## Implementation Outline

### Frontend Changes

**New file:** `packages/frontend/components/RouteBuilder.tsx`
- Multi-select pins on map (checkbox per marker or click-to-add)
- "Plan Route" button to trigger backend request
- Loading state + error handling
- Display: optimized waypoints, distance, duration, turn-by-turn summary
- "Export to Maps" button (Google Maps / Apple Maps deep link)
- "Save Route" button (logged-in users only, deferred to v1.1)

**Modify:** `packages/frontend/pages/map.tsx`
- Add route builder UI below map (or as a modal)
- Pass selected sale IDs to RouteBuilder
- Display route polyline on map (optional, v1.1)

**New lib:** `packages/frontend/lib/routeApi.ts`
- `POST /api/routes/plan` — send array of sale IDs, get back optimized waypoints + metadata

### Backend Changes

**New file:** `packages/backend/src/controllers/routeController.ts`
- POST `/api/routes/plan` handler
- Validate sale IDs exist + are PUBLISHED
- Extract lat/lng for each sale
- Call OSRM API: POST /route/v1/driving/lon1,lat1;lon2,lat2;...
- Parse response: extract distance, duration, route geometry
- Return waypoints in optimized order + metadata

**New file:** `packages/backend/src/routes/routes.ts`
- POST `/api/routes/plan` — public endpoint (no auth required for MVP)
- Optional: GET `/api/routes/:id` — retrieve saved route (v1.1)

**Modify:** `packages/backend/src/index.ts`
- Import and mount the new routes router

**Add env var:** `.env.local` and Railway config
- `OSRM_API_URL` (default: "https://router.project-osrm.org")

### Database Changes

**None required for MVP.** Route planning is stateless.

**Optional (v1.1):** Add `UserSavedRoute` table to enable saved routes:
```prisma
model UserSavedRoute {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  name      String   // "Saturday Morning Route"
  saleIds   String[] // Ordered array of sale IDs
  metadata  Json?    // distance, duration, created time
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

---

## API Contract

### POST /api/routes/plan

**Request:**
```json
{
  "saleIds": ["sale1", "sale2", "sale3"],
  "startCoord": { "lat": 42.96, "lng": -85.67 },
  "includeDistance": true
}
```

**Response (200):**
```json
{
  "waypoints": [
    {
      "saleId": "sale2",
      "lat": 42.98,
      "lng": -85.68,
      "order": 1,
      "arrivalTime": "2:15 PM",
      "distanceFromPrev": 2.3
    },
    ...
  ],
  "summary": {
    "totalDistance": 8.5,
    "totalDuration": 25,
    "unit": "mi/min"
  }
}
```

**Error (400):**
```json
{
  "error": "Unable to calculate route. Try fewer sales or different start location.",
  "code": "ROUTE_NOT_FOUND"
}
```

---

## Scope: MVP vs. Deferred

### MVP (D3 v1.0 — Ship with beta)
- Route planning UI on `/map`
- Multi-select sales (3–5 max)
- Call OSRM; display optimized order + distance/time
- Export link to Google Maps (deep link encoding)
- Error handling: OSRM outage → show fallback message
- No auth check (publicly accessible)
- No saved routes
- No polyline on map

### Deferred (v1.1+)
- Saved routes (`UserSavedRoute` table + UI)
- Signed-in-only route planning
- Route polyline visualization on map
- Time-based filtering: "Don't visit before 2 PM" (requires sale time-gating feature)
- "View popular routes" analytics dashboard (organizer-only)
- Export to Apple Maps / Waze
- Waypoint drag-to-reorder (manual optimization)
- Integration with "add to calendar" (Google Calendar .ics)

---

## Technical Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| **OSRM public API rate limits** | Start with 10 calls/min per user; log throttles. Monitor for β feedback. If needed, upgrade to self-hosted OSRM or Valhalla (~$500 setup). |
| **Route calculation failures** (no route exists) | Return 400 with user-friendly error. Suggest "Try fewer sales" or "Use Google Maps directly." |
| **Mobile UX: large JS payload** | Defer Leaflet Routing Machine; use simple JSON response + render via React. Keep <30KB added. |
| **OSRM coordinate order sensitivity** | Always validate input sales exist + have valid lat/lng before calling OSRM. Handle edge cases: duplicate sales, same location. |
| **User confusion: "optimized order" complexity** | Show clear labeling: "Stop 1, Stop 2, Stop 3." Include estimated times. Keep UI minimal. |
| **OSRM down → user-facing outage** | Graceful degradation: show "Route planning is temporarily unavailable" + fallback link to Google Maps with manual URL. |

---

## Success Metrics (Post-Launch)

- **Adoption:** % of map page visits that include a route plan attempt
- **Completion:** % of route plans that lead to "export to maps" click
- **Engagement:** Do users who use route planner visit more sales than baseline?
- **Satisfaction:** NPS on map feature; specific question: "Was the route planning helpful?"

---

## Dependencies & Sequencing

- **No blocking dependencies.** D3 is independent; can ship after D1/D2.
- **Optional feature integration** (post-MVP):
  - D1 (Quasi-POS): time-based sales could feed into "smart routes"
  - B5 (Email reply parsing): future "email your route to a friend"

---

## References

- **OSRM Public API:** https://router.project-osrm.org (no auth, soft rate limit)
- **Leaflet Routing Machine:** https://www.liedman.net/leaflet-routing-machine/ (optional, deferred)
- **Valhalla:** https://valhalla.readthedocs.io (self-hosted alternative)
- **Google Maps Deep Link:** https://developers.google.com/maps/documentation/urls/get-started

---

## Approval & Sign-Off

| Role | Name | Date | Notes |
|------|------|------|-------|
| Architect | Claude (findasale-architect) | 2026-03-09 | Recommended Option B for beta launch. Ready for Patrick review. |
| Product Owner | Patrick | — | Pending approval |
| Dev Lead | — | — | Pending assignment (Session 111+) |

---

## Change Log

- **2026-03-09:** Initial ADR. Option B selected. Deferred items listed.

