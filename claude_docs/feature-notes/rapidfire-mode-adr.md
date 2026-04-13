# Architecture Decision Record: Rapidfire Mode

**Date:** 2026-03-11
**Status:** Approved
**Scope:** Frontend UI + Backend API + Database Schema

---

## 1. Feature Overview

**Rapidfire Mode** enables organizers to capture and tag multiple estate sale items rapidly without friction. Organizer takes sequential photos from the camera view, each photo immediately appears in a bottom carousel with real-time AI tagging progress, and after the session they review/approve the draft items before publishing.

**Goals:**
- Reduce manual data entry for item capture (primary friction point)
- Keep organizer in camera flow (no context switches)
- Non-blocking background processing (AI doesn't freeze UI)
- Graceful handling of network/API failures

---

## 2. Technical Decisions

### 2.1 Background Processing Pattern

**Decision:** Optimistic Prisma write with in-browser queue + background job scheduler.

**Rationale:**
- UI feedback must be instant (carousel shows thumbnail + spinner immediately)
- AI analysis is non-blocking (organizer can keep capturing)
- Network failures don't lose work (Item record exists in DB with minimal fields)
- Fits existing stack: node-cron jobs already in use; Prisma client is single source of truth
- Alternative (WebWorker) would duplicate state; Polling is simpler than Socket.io for this low-frequency update

**Flow:**
1. Organizer captures photo → immediately show spinner in carousel
2. Frontend: POST to `/api/upload/rapidfire` with image + saleId
3. Backend: Create Item record with `status: "DRAFT"` (new field) + minimal AI fields (title="Untitled", category=null, tags=[])
4. Return itemId to frontend → carousel updates with real itemId
5. Backend: Enqueue async job to upload Cloudinary + run Vision+Haiku, then PATCH Item to update AI fields + set `status: "PENDING_REVIEW"`
6. Frontend polls Item record at intervals (or on tab refocus) to update carousel UI (spinner → checkmark)

**Polling interval:** 2–3 seconds per item (conservative, server-friendly)

---

### 2.2 Draft Item State

**Decision:** Add `status` enum field to Item schema with three states: `DRAFT | PENDING_REVIEW | PUBLISHED`

**Current state:**
- Item.status is currently `String @default("AVAILABLE")` — used for inventory status (AVAILABLE, SOLD, RESERVED, AUCTION_ENDED)
- This conflicts with feature intent (draft vs published)

**New schema:**
```prisma
model Item {
  // Existing field renamed for clarity
  inventoryStatus    String    @default("AVAILABLE") // AVAILABLE, SOLD, RESERVED, AUCTION_ENDED

  // New field for draft/review workflow
  draftStatus        String    @default("PUBLISHED")  // DRAFT | PENDING_REVIEW | PUBLISHED

  // ... rest of fields
}
```

**Rationale for rename:** Avoids collision with new field intent. `draftStatus` signals "lifecycle stage" vs `inventoryStatus` signals "availability".

**Defaults:**
- `DRAFT`: Items created by Rapidfire before AI completes
- `PENDING_REVIEW`: AI analysis complete, awaiting organizer approval
- `PUBLISHED`: Organizer approved or item created via manual entry (legacy flow)

**Visibility:**
- Draft/Pending items are **hidden from public listing** (`isActive=false` during draft, or new `visibility` filter on GET /items queries)
- Only sale organizer sees draft items in their session

**Migration:** `20260311000001_add_item_draft_status.sql`

---

### 2.3 Carousel State Management

**Decision:** React state (ephemeral) with fallback DB restore on app reopen.

**Rationale:**
- In-session state lives in Frontend React Query cache (fast, no extra DB calls)
- If organizer closes app mid-session, Item records already exist in DB with DRAFT status
- On reopen, frontend queries `/items?saleId=X&draftStatus=DRAFT|PENDING_REVIEW` to restore carousel
- Avoids persistent carousel queue in DB (adds complexity)

**State shape:**
```typescript
interface CarouselItem {
  itemId: string;
  thumbnailUrl: string;
  loadingState: 'uploading' | 'analyzing' | 'complete';
  errorMsg?: string;
  aiData?: { title: string; category: string; price: number; tags: string[] };
}

// Stored in React state
const [carouselQueue, setCarouselQueue] = useState<CarouselItem[]>([]);
```

**Lifecycle:**
- New photo captured → add to carousel with `loadingState: 'uploading'`
- Cloudinary upload completes → `loadingState: 'analyzing'`
- AI job completes → `loadingState: 'complete'`, populate `aiData`
- Carousel item clicked → open draft review modal (organizer can edit + publish)

---

### 2.4 AI Tagging Endpoint

**Decision:** Extend existing `/api/upload/analyze-photo` with async background job enqueue; add new polling endpoint.

**Current flow:**
- `/api/upload/analyze-photo` (POST) — synchronous, blocking (takes 15–30s)
- Used by manual entry flow (organizer waits for AI)

**New Rapidfire flow:**
- `/api/upload/rapidfire` (POST) — non-blocking, enqueues async job
  - Request: `{ saleId, imageFile, mode: "rapidfire" }`
  - Response: `{ itemId, createdAt, draftStatus: "DRAFT" }`
  - Delegates heavy lifting (Vision + Haiku) to background job

- `/api/items/{itemId}/draft-status` (GET) — polling endpoint
  - Response: `{ itemId, draftStatus, title, category, tags, price, error? }`
  - Lightweight; organizer polls every 2–3 sec per item

**Async job:**
- Triggered by `/api/upload/rapidfire`
- Flow: Cloudinary upload → Google Vision → Claude Haiku → PATCH Item
- Persists errors in new `Item.aiErrorLog` (JSON field)
- If Haiku fails, PATCH Item with `draftStatus: "PENDING_REVIEW"` + `aiErrorLog` (manual override available)

---

### 2.5 Cloudinary Upload Flow

**Decision:** Use existing signed-URL pattern for direct browser upload; no rate-limit changes needed.

**Rationale:**
- Signed URL approach already in place (secure, avoids backend file copy)
- Rapid sequential uploads (one per ~5 sec per photo) are within Cloudinary tier limits
- Each upload is ~2–5 MB (canvas JPEG), well within per-request limits

**Cloudinary rate limit (confirmed):** Free tier = 500 requests/hour (~8.3/min). Client-side upload queue is **required** (not optional). Cap concurrent uploads at 6/min to stay safely under limit. If queue depth > 6, pause new captures and show toast: "Uploading previous photos…". Resume automatically when queue clears.

---

### 2.6 Real-Time Feedback

**Decision:** Simple polling (no Socket.io); reserve Socket.io for auction real-time needs.

**Rationale:**
- Polling every 2–3 seconds is acceptable for non-critical feature (carousel status badge)
- Socket.io overhead not justified for this use case (no persistent connection benefit; AI job is fire-and-forget)
- Keeps implementation simple; organizer is already in camera flow (not watching carousel full-time)
- Socket.io bandwidth better reserved for live auction features (faster update cadence)

**Fallback:** Tab regain focus → force refresh carousel status (user may have been away)

---

## 3. Schema Changes & Migration

### Migration: `20260311000001_add_item_draft_status.sql`

```sql
-- Add draftStatus field to Item
ALTER TABLE "Item" ADD COLUMN "draftStatus" VARCHAR(50) NOT NULL DEFAULT 'PUBLISHED';

-- Create index for rapid queries on draft items
CREATE INDEX "Item_draftStatus_idx" ON "Item"("draftStatus");
CREATE INDEX "Item_saleId_draftStatus_idx" ON "Item"("saleId", "draftStatus");

-- Add aiErrorLog field for storing AI failure details
ALTER TABLE "Item" ADD COLUMN "aiErrorLog" JSONB;

-- Backfill: existing items are PUBLISHED (no drafts exist yet)
-- Default is already set in column definition
```

### Updated Prisma Schema

```prisma
model Item {
  // ... existing fields ...

  // Inventory availability (AVAILABLE, SOLD, RESERVED, AUCTION_ENDED)
  inventoryStatus  String    @default("AVAILABLE") // DEPRECATED: rename from 'status' in phase 2
  status           String    @default("AVAILABLE") // BACKWARD COMPAT: keep old name for now

  // New: draft/review workflow (DRAFT | PENDING_REVIEW | PUBLISHED)
  draftStatus      String    @default("PUBLISHED")

  // AI error log (if Vision/Haiku fails, store error details for organizer retry)
  aiErrorLog       Json?     // { errorCode, message, timestamp, attempt }

  // ... rest of fields ...
}
```

---

## 4. API Contracts

### POST `/api/upload/rapidfire`

**Request:**
```json
{
  "saleId": "sale_abc123",
  "imageFile": "(multipart/form-data binary)"
}
```

**Response (202 Accepted):**
```json
{
  "itemId": "item_xyz789",
  "draftStatus": "DRAFT",
  "createdAt": "2026-03-11T12:00:00Z",
  "thumbnailUrl": "https://res.cloudinary.com/.../q_60,c_fill.webp"
}
```

**Error (400/500):**
```json
{
  "error": "Upload failed",
  "details": "File too large (> 10MB) | Network error | Invalid image"
}
```

---

### GET `/api/items/{itemId}/draft-status`

**Response (200):**
```json
{
  "itemId": "item_xyz789",
  "draftStatus": "PENDING_REVIEW",
  "title": "Victorian Mahogany Dresser",
  "description": "Solid mahogany with brass hardware. Circa 1890s. Minor surface wear.",
  "category": "Furniture",
  "condition": "FAIR",
  "tags": ["Victorian", "Mahogany", "Dresser", "Antique"],
  "suggestedPrice": 125.50,
  "isAiTagged": true
}
```

**During processing (200):**
```json
{
  "itemId": "item_xyz789",
  "draftStatus": "DRAFT",
  "title": null,
  "description": null,
  "category": null,
  "tags": [],
  "isAiTagged": false,
  "message": "AI analysis in progress..."
}
```

**AI error (200):**
```json
{
  "itemId": "item_xyz789",
  "draftStatus": "PENDING_REVIEW",
  "title": null,
  "category": null,
  "aiError": {
    "errorCode": "AI_TIMEOUT",
    "message": "Claude Haiku request timed out after 30s",
    "timestamp": "2026-03-11T12:05:00Z",
    "allowManualOverride": true
  }
}
```

---

### POST `/api/items/{itemId}/publish`

**Request:**
```json
{
  "title": "Victorian Mahogany Dresser",
  "description": "Solid mahogany with brass hardware...",
  "category": "Furniture",
  "condition": "FAIR",
  "price": 125.50,
  "tags": ["Victorian", "Mahogany"],
  "photoUrls": ["https://res.cloudinary.com/.../original.jpg"],
  "overrideAI": false
}
```

**Response (200):**
```json
{
  "itemId": "item_xyz789",
  "draftStatus": "PUBLISHED",
  "message": "Item published successfully"
}
```

---

## 5. Implementation Sequence

### Phase 1: Schema & Infrastructure (1–2 days)
1. Create migration `20260311000001_add_item_draft_status.sql` (add draftStatus, aiErrorLog fields, indexes)
2. Update Prisma schema
3. Create Item.draftStatus constants in shared types
4. Wire environment: ensure `GOOGLE_VISION_API_KEY` + `ANTHROPIC_API_KEY` present

### Phase 2: Backend Endpoints (2–3 days)
1. Implement `/api/upload/rapidfire` POST handler
   - Validate image file
   - Create Item record with `draftStatus: "DRAFT"` + minimal fields
   - Enqueue background job (via node-cron task)
   - Return itemId + thumbnailUrl

2. Implement `/api/items/{itemId}/draft-status` GET handler
   - Return Item record (draftStatus, AI fields, error log)
   - Lightweight; no business logic

3. Implement `/api/items/{itemId}/publish` POST handler
   - Accept organizer edits + AI suggestions
   - Update Item: draftStatus → "PUBLISHED", populate all fields
   - Validate required fields (title, category, price)

4. Create background job: `scheduleRapidDraftProcessing(itemId)`
   - Upload image to Cloudinary
   - Run Google Vision (best-effort; continue if fails)
   - Run Claude Haiku
   - PATCH Item with AI results + draftStatus
   - Log errors in aiErrorLog JSON

### Phase 3: Frontend Components (2–3 days)
1. Create `RapidCarousel` component (bottom carousel UI)
   - Display thumbnails + loading spinner/checkmark
   - On-click: open draft review modal

2. Extend existing `CameraTab` component
   - Add mode toggle: "Regular Capture" vs "Rapidfire"
   - Rapidfire: post photo → add to carousel → keep camera open
   - Regular: post photo → AI analysis → pre-fill form (existing flow)

3. Create `DraftReviewModal` component
   - Show AI-suggested fields (title, category, price, tags, description)
   - Organizer can edit any field
   - "Publish" button → POST /api/items/{itemId}/publish
   - "Retry AI" button (if aiErrorLog exists)

4. Implement carousel polling logic
   - Query `/api/items/{itemId}/draft-status` every 2–3 sec per item
   - Update carousel state → UI reflects progress
   - On app reopen, restore carousel from `/items?saleId=X&draftStatus=DRAFT|PENDING_REVIEW`

### Phase 4: Testing & Validation (1–2 days)
1. End-to-end: capture 5 photos → verify carousel populates + AI tags complete
2. Error handling: simulate network failure during Haiku call → verify aiErrorLog, manual override works
3. Session close/reopen: close app mid-session → reopen → verify carousel restores
4. Polling: monitor DB queries; verify 2–3 sec intervals are light on DB

### Phase 5: Deploy & Monitor (1 day)
1. Deploy migration to Neon production
2. Deploy backend + frontend to Railway
3. Monitor: API latency for `/api/upload/rapidfire`, background job queue depth
4. Gather organizer feedback (time-to-capture, AI accuracy, UX friction)

---

## 6. Rollback Plan

**If critical issue found post-deploy:**

1. **Data safety:** All Item records remain in DB (no data loss). Draft items stay in DB.
2. **Feature kill:** Disable Rapidfire feature flag in Frontend (query string: `?disableRapidfire=1` or env var)
3. **API revert:** Set `/api/upload/rapidfire` to return 503 + fallback to regular photo flow
4. **Schema revert:** If needed, create reverse migration `20260311_rollback_draft_status.sql` (drop draftStatus column, preserve data if backfill is needed)

**No blocking issues expected:**
- Schema migration is additive (safe forward/backward)
- API endpoints are new (no breaking changes to existing flows)
- Feature is opt-in UI toggle (organizers can use regular capture if Rapidfire fails)

---

## 7. Success Metrics

- **Capture speed:** Avg time per item in Rapidfire mode < 15 seconds (vs 45+ sec manual entry)
- **AI accuracy:** title + category confidence > 85% (vs human baseline)
- **Queue depth:** Max pending jobs < 50 at any time (healthy background processing)
- **Error rate:** < 5% of photos fail AI analysis (Haiku timeouts, parse errors)
- **Organizer satisfaction:** NPS question "Would you use Rapidfire again?" > 4/5

---

## 8. Flags for Patrick

1. **Migration deployment:** Requires Neon `DIRECT_URL` env var set locally before running `prisma migrate deploy`. Confirm Neon PgBouncer credentials are correct.

2. **Background job monitoring:** `node-cron` tasks run in-process. If backend restarts, in-flight jobs are lost (acceptable for MVP; later add persistent queue via Redis or Bull).

3. **AI key validation:** Feature requires both `GOOGLE_VISION_API_KEY` and `ANTHROPIC_API_KEY`. Graceful fallback: if either missing, Rapidfire endpoint returns 503 with message "AI service unavailable."

4. **Cloudinary rate limits:** Current tier supports ~100 uploads/day with eager transforms. Monitor Cloudinary dashboard if Rapidfire usage spikes > 50 photos/day per organizer.

5. **Socket.io future:** ADR reserves Socket.io for live auction features. If real-time carousel updates become requirement, migrate polling → Socket.io in Phase 6+.

6. **Polling interval:** Currently 2–3 sec. If DB query load is high, increase to 5 sec or add exponential backoff (faster checks early, slower later in job lifecycle).

---

## 9. References

- **Existing AI tagging:** `packages/backend/src/services/cloudAIService.ts`
- **Upload controller:** `packages/backend/src/controllers/uploadController.ts`
- **Camera UI (add-items page):** `packages/frontend/pages/organizer/add-items/[saleId].tsx`
- **Node-cron jobs:** `packages/backend/src/jobs/` (examine existing job patterns)
- **Session 122:** AI tagging architecture review: `claude_docs/feature-notes/ai-tagging-architecture.md`

---

**ADR Author:** FindA.Sale Systems Architect
**Reviewed by:** (pending)
**Approved by:** (pending)
