# Camera Workflow v2 — Architecture Decisions

**Status:** Ready for implementation
**Date:** 2026-03-11 (Session 146)
**Audience:** findasale-dev, findasale-qa
**Spec Reference:** `claude_docs/feature-notes/camera-workflow-publishing-spec.md`

---

## 7 Architecture Questions — Resolved

### 1. Background Removal: Server-Side Cloudinary API

**Decision:** Use Cloudinary's built-in background removal transformation via `b_remove` parameter at display/publish time. Do NOT pre-process on device or server.

**Rationale:**
- Cloudinary already stores all images and generates on-demand transformations.
- Cost: $0.05–0.10 per image (Cloudinary free tier or addon). Remove.bg API: $0.50/image minimum.
- On-device WASM (rembg/onnx): adds ~2-3MB bundle bloat, high memory footprint during mobile camera session.
- Server-side Sharp processing: adds infrastructure cost and latency (slow on low-spec instances).
- Lazy transformation (display-time) means no additional storage, no preprocessing latency.

**Implementation note for Dev:**
- Add `backgroundRemoved: boolean` field to Item model (default false).
- When rendering an item with `backgroundRemoved === true`, append `?b_remove` to the Cloudinary URL.
- Example: `image.cloudinary.com/photo.jpg?b_remove` applies background removal on-the-fly.
- Publishing page: "Background removal toggle" updates this flag; Cloudinary transform applies instantly on re-render.

---

### 2. Auto-Enhance Pipeline: Client-Side Canvas Before Upload

**Decision:** On-device brightness + saturation correction via Canvas API before uploading. Process in background while organizer continues shooting; do not block camera.

**Rationale:**
- Mobile wifi in organizers' homes is spotty (spec context). Sending raw → server-processing → sending back creates 2x network latency.
- Canvas API runs in ~200–300ms on modern phones (non-blocking with requestAnimationFrame/Worker).
- Eliminates need to store two image variants (enhanced + original); only the enhanced blob is uploaded.
- Auto-enhance is applied immediately on capture, enabling the purple ✨ badge in carousel without server roundtrip.
- Non-blocking: use Worker or setTimeout to avoid freezing the camera shutter button.

**Implementation note for Dev:**
- After capture, spawn a Worker or setTimeout to run Canvas enhancement on the captured blob.
- Enhancement formula: brightness +15%, saturation +10% (baseline; configurable later).
- Resolve enhanced canvas blob, upload that blob instead of raw.
- Store `autoEnhanced: boolean` flag on Item (default true for v2 captures).
- Fallback: if Canvas enhancement fails, upload original unmodified (graceful degradation).
- Verify enhancement doesn't block frame rendering—test on low-spec Android device.

---

### 3. Face Detection: On-Device TensorFlow.js

**Decision:** Use `@tensorflow-models/coco-ssd` (object detection) or `face-api.js` to detect people on-device before upload. Never send raw image bytes to cloud face-detection API.

**Rationale:**
- Privacy is non-negotiable (spec: "protecting privacy in private homes").
- Cloud APIs (Google Vision, AWS Rekognition) log images or require explicit consent; organizers work in sensitive private spaces.
- TensorFlow.js runs 100% on-device; no data leaves the device.
- COCO-SSD detects "person" class with high accuracy (0.5+ confidence threshold).
- Model download (~26MB) happens once on install; negligible cache footprint for estate sale PWA.
- Organizer can review and approve before upload; face-detection flag prevents accidental exposure.

**Implementation note for Dev:**
- Before upload, run COCO-SSD on the canvas or img element (after enhancement).
- If detection confidence > 0.5 and class is "person", show modal: "This photo may contain a person. Upload anyway? Retake?"
- Only proceed to upload if organizer explicitly confirms.
- Store `faceDetected: boolean` on Item for audit/filtering later (optional dashboard feature).
- **Critical:** No faces are ever sent off-device. All processing is local.
- Fallback: if TensorFlow.js fails to load, skip face detection and allow upload (user can still choose to retake).

---

### 4. AI Confidence Scores: Add `aiConfidence` Float Field to Item

**Decision:** Add `aiConfidence: Float` (0.0–1.0) to Item schema. Store confidence returned by Vision API in processRapidDraft. Update schema with new migration.

**Rationale:**
- Currently simulated; spec requires actual confidence for color-coded tinting:
  - **Green** (≥80%): AI is confident.
  - **Amber** (55–79%): Worth a quick review.
  - **Red** (<55%): Low confidence—title/category likely wrong.
- Vision API already returns confidence per classification. Capture it in the response and store it.
- Frontend reads it from Item response payload; publishing page uses it to render left-border color.

**Implementation note for Dev:**
- **Schema:** Add column `aiConfidence FLOAT DEFAULT 0.5` to Item.
- **Migration:** Run `npx prisma migrate dev --name "add-camera-workflow-v2-fields"`
- **Backend:** Update `analyzeItemImage()` service to return `confidence: number` in response.
- **processRapidDraft.ts** (line 79–91): Extract `aiResult.confidence` and save:
  ```typescript
  data: {
    title: aiResult.title || item.title,
    description: aiResult.description || item.description,
    category: aiResult.category || item.category,
    condition: aiResult.condition || item.condition,
    price: aiResult.suggestedPrice ?? item.price,
    tags: aiResult.tags || [],
    isAiTagged: true,
    aiConfidence: aiResult.confidence || 0.5, // NEW
    draftStatus: 'PENDING_REVIEW'
  }
  ```
- **API response:** Ensure GET `/api/items/:saleId` includes `aiConfidence` in Item payload.
- **Frontend:** Publishing page reads `item.aiConfidence` and renders tint:
  - `aiConfidence >= 0.8` → green left border
  - `0.55 <= aiConfidence < 0.8` → amber
  - `aiConfidence < 0.55` → red

---

### 5. Photo Angle Labeling Schema: Add `label` Field, Separate Photos Table (Forward-Looking)

**Decision:** Add to Item schema: `photos: Photo[]` relation to a new `Photo` model. Each Photo has `{ url, label: "front" | "back" | "detail" | null }`. Do NOT implement label UI/logic this release; just create schema structure so future PRs slot in easily.

**Rationale:**
- Spec says "anticipate future per-photo editing."
- Multi-photo support exists (photo count badge, "+" button in Rapidfire).
- Currently photos stored as flat array `photoUrls: String[]`. Separating into a Photos table enables per-photo metadata (label, enhancement state, crop settings) without future schema thrashing.
- Backward-compatible: keep `photoUrls` array for v2; migrate to Photo table in v3.

**Implementation note for Dev:**
- **Schema:** Create new `Photo` model:
  ```prisma
  model Photo {
    id String @id @default(cuid())
    itemId String
    item Item @relation(fields: [itemId], references: [id], onDelete: Cascade)
    url String
    label String? // "front" | "back" | "detail" — null for unlabeled (v3 future)
    isPrimary Boolean @default(false)
    autoEnhanced Boolean @default(false)
    backgroundRemoved Boolean @default(false)
    createdAt DateTime @default(now())
    @@index([itemId])
  }
  ```
- **Item model:** Add `photos Photo[]` relation.
- **v2 Implementation:** Rapidfire upload appends to `photoUrls` array as before. No change to capture/upload logic.
- **v3 Preparation:** Photo table is ready for per-photo editing (label, per-photo crop, etc.). Docs update only.

---

### 6. Aspect Ratio Crop: Client-Side Canvas Crop Before Upload, Plus Display-Time Transform

**Decision:** Apply 4:3 crop on the client in Canvas BEFORE upload (hard crop, not reversible per-capture). Store the cropped blob. Additionally, use Cloudinary's `ar:4:3,c:fill` transform at display time as a secondary safety net.

**Rationale:**
- Spec says "crop applied at publish time" (via framing guide overlay in camera).
- 4:3 is framing guidance during capture (overlay); actual crop happens at publish when organizer taps "Publish all".
- Client-side crop is faster (local processing), reduces storage (no redundant pre-crop data), avoids server processing load.
- Cloudinary transform ensures consistent 4:3 rendering even if client crop skipped (fallback).
- Allows organizer to override ratio in publishing page (1:1, 16:9 pills); those become Cloudinary params at final export.

**Implementation note for Dev:**
- **Camera:** After Canvas enhancement completes (or if skipped), immediately apply Canvas crop to 4:3 ratio.
- **Crop logic:** Center the crop (or use smart centering via getImageData + edge detection if time permits).
- **Upload:** Upload the cropped blob (not the original).
- **Publishing page:** Apply Cloudinary `?ar=4:3,c=fill` to each image URL for visual consistency in the grid.
- **Aspect ratio pills:** Allow organizer to override (1:1, 4:3, 16:9). Selected ratio becomes the Cloudinary param:
  - 1:1: `?ar=1:1,c=fill`
  - 4:3: `?ar=4:3,c=fill`
  - 16:9: `?ar=16:9,c=fill`
- **Final export:** When publishing, apply the user-selected aspect ratio to the image URL (or pre-crop on server if Cloudinary API doesn't support final encoding).

---

### 7. `draftStatus` Field: Confirm Existing Schema, No Changes Required

**Decision:** Existing `draftStatus: DRAFT | PENDING_REVIEW | PUBLISHED` enum in Item model is correct and sufficient. No schema changes needed.

**Rationale:**
- Schema already supports the workflow:
  - Items created in DRAFT (Rapidfire capture).
  - Processed in background → PENDING_REVIEW (processRapidDraft completes AI tagging).
  - Moved to PUBLISHED on organizer tapping "Publish all" (batch update).
- Publishing page shows only PENDING_REVIEW + DRAFT items (pre-publish).
- Spec uses same states.

**Implementation note for Dev:**
- **Verify queries filter correctly:**
  - Rapidfire camera: create items with `draftStatus: DRAFT`.
  - After AI processing: `draftStatus: PENDING_REVIEW` (line 89 in processRapidDraft already does this).
  - Publishing page: fetch items where `draftStatus IN ['PENDING_REVIEW', 'DRAFT']`.
  - Bulk "Publish all": update matching items to `draftStatus: PUBLISHED`.
- **No migration needed.** Existing indexes on `draftStatus` are sufficient.

---

## Schema Changes Required

### 1. Add 4 New Fields to Item

```sql
ALTER TABLE Item ADD COLUMN aiConfidence FLOAT DEFAULT 0.5;
ALTER TABLE Item ADD COLUMN backgroundRemoved BOOLEAN DEFAULT false;
ALTER TABLE Item ADD COLUMN faceDetected BOOLEAN DEFAULT false;
ALTER TABLE Item ADD COLUMN autoEnhanced BOOLEAN DEFAULT false;
```

### 2. Create New Photo Table (Forward-Looking)

```prisma
model Photo {
  id String @id @default(cuid())
  itemId String
  item Item @relation(fields: [itemId], references: [id], onDelete: Cascade)
  url String
  label String? // "front" | "back" | "detail" — null for unlabeled (v3 future)
  isPrimary Boolean @default(false)
  autoEnhanced Boolean @default(false)
  backgroundRemoved Boolean @default(false)
  createdAt DateTime @default(now())
  @@index([itemId])
}
```

Add relation to Item model:
```prisma
model Item {
  // ... existing fields ...
  photos Photo[]
}
```

### 3. Run Prisma Migration

```bash
cd packages/database
npx prisma migrate dev --name "add-camera-workflow-v2-fields"
```

---

## API Contract Changes Required

### 1. GET /api/items/:saleId

**Add fields to Item response payload:**
- `aiConfidence: number` (0.0–1.0)
- `backgroundRemoved: boolean`
- `faceDetected: boolean`
- `autoEnhanced: boolean`

Example response:
```json
{
  "id": "item-123",
  "title": "Victorian Chair",
  "photoUrls": ["https://..."],
  "aiConfidence": 0.87,
  "backgroundRemoved": false,
  "faceDetected": false,
  "autoEnhanced": true,
  "draftStatus": "PENDING_REVIEW",
  ...
}
```

### 2. POST /api/upload/rapidfire

**No change to request.** Response already includes item creation. Ensure response includes the new fields (populated with defaults).

### 3. PATCH /api/items/:itemId

**Support updates:**
- `backgroundRemoved: boolean`
- `draftStatus: "DRAFT" | "PENDING_REVIEW" | "PUBLISHED"`
- (Other fields already settable)

### 4. POST /api/items/bulk-update

**Existing endpoint; ensure it handles:**
- Bulk price, category, backgroundRemoved, draftStatus updates.
- When rendering Cloudinary URLs in response, respect the `backgroundRemoved` flag (append `?b_remove`).

### 5. analyzeItemImage() Response Shape

**Update service to return confidence:**

```typescript
interface AIAnalysisResult {
  title: string;
  description: string;
  category: string;
  condition: string;
  suggestedPrice: number;
  tags: string[];
  confidence: number; // NEW: 0.0–1.0 from Vision API
}
```

---

## Dev Implementation Order

### Phase 1 — Schema & Migrations (Day 1)

- Add 4 new fields to Item: `aiConfidence`, `backgroundRemoved`, `faceDetected`, `autoEnhanced`.
- Create Photo model (no UI, just schema prep for v3).
- Run Prisma migration.
- Update Prisma client.

**Deliverable:** Schema live, no data changes yet.

### Phase 2 — Backend Plumbing (Day 1–2)

- Update `analyzeItemImage()` to return `confidence: number`.
- Update `processRapidDraft.ts` to store `aiConfidence` from Vision API.
- Update Item response payloads (GET, POST, PATCH) to include new fields.
- Update bulk-update endpoint to handle `backgroundRemoved` + `draftStatus`.
- Verify `draftStatus` filtering in queries.

**Deliverable:** All endpoints return new fields; backend can process them.

### Phase 3 — On-Device Processing (Day 2–3)

- Implement TensorFlow.js COCO-SSD face detection (model loading + inference).
- Add face-detection modal before upload ("This photo may contain a person. Upload anyway? Retake?").
- Implement Canvas auto-enhance (brightness +15%, saturation +10%) in background Worker.
- Implement 4:3 Canvas crop before upload (centered).
- Store `faceDetected`, `autoEnhanced` flags on Item creation.

**Deliverable:** Camera capture enhanced + face-detected + cropped before upload.

### Phase 4 — Publishing Page (Day 3–5)

- Fetch items with correct `draftStatus` filtering (DRAFT + PENDING_REVIEW).
- Render AI confidence color-coded left borders (green/amber/red).
- Implement per-item editor:
  - Brightness/contrast sliders (0–100 range, default 50).
  - Aspect-ratio pills (4:3, 1:1, 16:9).
  - Background-removal toggle (visual feedback: dashed purple border on thumbnail).
  - Metadata fields (title, price, category).
  - Auto-enhance toggle (turn enhancement on/off per item).
- Bulk operations: price, category, background-removal (no confirmation needed).
- Buyer preview mode (separate light-mode grid view, white background, "Preview only" chip).
- Batch "Publish all" button (update items to `draftStatus: PUBLISHED`).

**Deliverable:** Full publishing page with all editing tools.

### Phase 5 — Multi-Photo UX (Day 5–6)

- Wire "+" button on carousel thumbnails to add-photo mode.
- Update photo count badge rendering (show "×N" on thumbnails with >1 photo).
- Store photos in order (currently flat array; optional: migrate to Photo table if time permits, else plan for v3).
- Test multi-photo editing in publishing page (tools apply to primary photo only).

**Deliverable:** Rapidfire multi-photo capture + carousel rendering.

### Phase 6 — Testing & Polish (Day 6–7)

- Integration test: capture → enhance → face-detect → publish flow.
- Mobile wifi simulation (slow network, interruption recovery).
- Verify Cloudinary transforms apply correctly (4:3, background removal).
- Verify confidence score calculation (Vision API returns real 0.0–1.0 values).
- Test aspect-ratio pills (1:1, 4:3, 16:9).
- Test buyer preview rendering.
- Verify draftStatus transitions (DRAFT → PENDING_REVIEW → PUBLISHED).

**Deliverable:** Feature complete, tested, ready for QA.

---

## Handoff to findasale-dev

### Summary

7 architecture questions resolved. All decisions are **implementation-ready** and **non-reversible** (approved by findasale-architect).

### Schema Changes

- 4 new Item fields: `aiConfidence`, `backgroundRemoved`, `faceDetected`, `autoEnhanced`
- New Photo table (forward-looking, no v2 UI)
- Prisma migration: `"add-camera-workflow-v2-fields"`

### Key API Changes

- GET /api/items/:saleId: Add new fields to response
- PATCH /api/items/:itemId: Support new fields
- POST /api/items/bulk-update: Support new fields
- analyzeItemImage(): Return `confidence: number`

### Tech Stack

- **Face Detection:** TensorFlow.js COCO-SSD (26MB model, on-device only)
- **Auto-Enhance:** Canvas API (brightness, saturation) in Worker (non-blocking)
- **Aspect Ratio Crop:** Canvas crop before upload + Cloudinary ar:4:3 transform
- **Background Removal:** Cloudinary b_remove parameter (lazy, display-time)
- **AI Confidence:** Vision API confidence value, stored in DB

### Files to Read First

1. `packages/database/prisma/schema.prisma` — Item model, draftStatus enum
2. `packages/backend/src/controllers/uploadController.ts` — Upload endpoints, Cloudinary config
3. `packages/backend/src/jobs/processRapidDraft.ts` — AI tagging flow, background job
4. `packages/backend/src/services/cloudAIService.ts` — analyzeItemImage signature
5. `packages/frontend/pages/organizer/add-items/[saleId].tsx` — Rapidfire UI, state shape
6. `packages/frontend/components/camera/RapidCapture.tsx` — Camera component
7. `packages/frontend/components/camera/RapidCarousel.tsx` — Photo carousel, thumbnail rendering

### Build Sequence

1. Schema + migrations
2. Backend API plumbing (response payloads, analyzeItemImage, processRapidDraft)
3. On-device processing (TensorFlow.js, Canvas enhancement, crop)
4. Publishing page (confidence tinting, per-item editor, batch ops, buyer preview)
5. Multi-photo carousel UX ("+" button, photo count, photo table forward prep)
6. Integration testing + mobile wifi resilience

---

## Notes

- **Offline support:** Canvas enhancement and face detection work offline. Upload requires wifi (expected). No offline queue needed beyond existing retry logic.
- **Mobile performance:** Canvas ops are GPU-accelerated on modern phones. TensorFlow.js models are optimized for mobile. Total overhead: negligible.
- **Future extensibility:** Photo table structure supports per-photo labels, cropping, and enhancement state without re-migration in v3.
- **Fallback strategy:** If any on-device processing fails (Canvas, TensorFlow), upload unmodified and continue. Non-blocking ensures camera never hangs.
- **Privacy:** Face detection is 100% on-device. No data leaves the device. Organizer explicitly confirms before upload.

---

**Status:** Ready to assign to findasale-dev. No blockers. No further decisions needed.
