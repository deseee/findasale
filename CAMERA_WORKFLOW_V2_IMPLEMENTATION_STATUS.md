# Camera Workflow v2 — Implementation Status

**Session:** 147 (2026-03-11)
**Status:** Phases 1-2 COMPLETE. Phases 3-6 Ready for Implementation.
**Branch:** main
**Architecture Authority:** CAMERA_WORKFLOW_V2_ARCHITECTURE.md (locked, no re-decisions)

---

## Completed (Phases 1-2)

### Phase 1: Database Schema ✅

**Files Modified:**
- `packages/database/prisma/schema.prisma` — Added 4 fields to Item + Photo model
- `packages/database/prisma/migrations/20260311000003_add_camera_workflow_v2_fields/migration.sql` — SQL migration
- `packages/database/prisma/migrations/20260311000003_add_camera_workflow_v2_fields/migration_lock.toml` — Prisma metadata

**Changes:**
```prisma
// Item model additions:
- aiConfidence Float @default(0.5)
- backgroundRemoved Boolean @default(false)
- faceDetected Boolean @default(false)
- autoEnhanced Boolean @default(false)
- photos Photo[] // relation

// New Photo model (forward-looking):
model Photo {
  id String @id @default(cuid())
  itemId String
  item Item @relation(...)
  url String
  label String? // "front|back|detail"
  isPrimary Boolean @default(false)
  autoEnhanced Boolean @default(false)
  backgroundRemoved Boolean @default(false)
  createdAt DateTime @default(now())
  @@index([itemId])
}
```

**Deployment:** Patrick must run `prisma migrate deploy` on Neon (after testing locally).

---

### Phase 2: Backend Plumbing ✅

**Files Modified:**
1. `packages/backend/src/services/cloudAIService.ts`
   - Updated `AITagResult` interface to include optional `confidence: number`
   - Added confidence fallback (defaults to 0.5 if missing)

2. `packages/backend/src/jobs/processRapidDraft.ts`
   - Stores `aiConfidence: aiResult.confidence ?? 0.5` on item update
   - No breaking changes; graceful fallback if Vision API doesn't provide confidence

3. `packages/backend/src/controllers/itemController.ts`
   - Updated `getItemById` select to include: `aiConfidence`, `backgroundRemoved`, `faceDetected`, `autoEnhanced`, `draftStatus`
   - Updated `getItemsBySaleId` select to include new fields + draftStatus
   - Updated `getDraftItemsBySaleId` select to include new fields (used by publishing page)
   - Updated `updateItem` to accept and process `backgroundRemoved` and `draftStatus` from request body

4. `packages/backend/src/routes/items.ts`
   - Added `backgroundRemoved` bulk operation: toggles flag on selected items
   - Added `draftStatus` bulk operation: transitions items (DRAFT → PENDING_REVIEW → PUBLISHED)
   - Both operations verify organizer ownership before mutation

**API Contracts:**
- GET `/api/items/:saleId` — returns items with new fields
- PATCH `/api/items/:itemId` — accepts `{ backgroundRemoved: boolean, draftStatus: string, ... }`
- POST `/api/items/bulk` — new operations: `backgroundRemoved`, `draftStatus`
- analyzeItemImage() → AITagResult now includes optional `confidence` field

**No Migration Needed:** All changes are backward-compatible (optional fields, defaults supplied).

---

## Ready for Implementation (Phases 3-6)

### Phase 3: On-Device Processing

**Location:** `packages/frontend/pages/organizer/add-items/[saleId].tsx`

**Required Additions:**

1. **Canvas Auto-Enhance (brightness +15%, saturation +10%)**
   - Function: `autoEnhanceImage(blob: Blob): Promise<{ blob: Blob; enhanced: boolean }>`
   - Timing: After capture, before upload (non-blocking via Worker or setTimeout)
   - Result: Store enhanced blob; flag item with `autoEnhanced: true` when creating

2. **Canvas 4:3 Crop (center crop)**
   - Function: `cropTo4x3(blob: Blob): Promise<Blob>`
   - Timing: After enhance, before upload
   - Result: Upload cropped blob (hard crop, not reversible per-capture)

3. **Face Detection (TensorFlow.js COCO-SSD)**
   - Library: `@tensorflow/tfjs @tensorflow-models/coco-ssd`
   - Function: `detectFace(blob: Blob): Promise<boolean>`
   - Timing: After crop, before upload
   - UI: Modal if face detected: "This photo may contain a person. Upload anyway? / Retake"
   - Result: Flag item with `faceDetected: true` if person class >0.5 confidence

4. **Update `handleRapidCameraComplete`**
   - For each captured photo blob:
     1. Run autoEnhanceImage() in background (don't block)
     2. Run cropTo4x3()
     3. Run detectFace() → show modal if positive
     4. Upload processed blob (not original)
     5. On upload success, store flags in optimistic state
     6. When DB item is created, merge flags from state

**No changes to RapidCapture component** — processing happens in add-items page container.

---

### Phase 4: Publishing Page

**Location:** Create or extend `packages/frontend/pages/organizer/add-items/[saleId]/review.tsx`

**Features:**

1. **AI Confidence Color Tinting**
   - Fetch items where `draftStatus IN ['DRAFT', 'PENDING_REVIEW']`
   - Render each item card with left border color:
     - Green (≥80%): `aiConfidence >= 0.8`
     - Amber (55-79%): `0.55 <= aiConfidence < 0.8`
     - Red (<55%): `aiConfidence < 0.55`
   - Show confidence label + icon on each row

2. **Per-Item Expanded Editor Panel**
   - Trigger: Click item to expand
   - Fields:
     - Title (text input)
     - Price (number input)
     - Category (text/select)
     - Aspect ratio pills: 4:3 / 1:1 / 16:9 (stores selection in local state, applies as Cloudinary param)
     - Background removal toggle (PATCH item.backgroundRemoved)
     - Auto-enhance toggle (read-only flag, can be disabled)
     - Brightness slider (0-100, default 50, local state)
     - Contrast slider (0-100, default 50, local state)
   - Warning banner if aiConfidence < 0.8

3. **Batch Toolbar**
   - Checkboxes on each item
   - "Select all / Deselect all" toggle
   - Bulk price: bottom sheet → number input → POST /api/items/bulk { operation: 'price', value }
   - Bulk category: bottom sheet → category chips
   - Bulk BG removal: instant apply → POST /api/items/bulk { operation: 'backgroundRemoved', value: true }

4. **Buyer Preview Mode**
   - Button: "👁 Buyer preview"
   - Light-mode 2-column grid, white background
   - Show items with draftStatus PENDING_REVIEW or PUBLISHED only
   - Display: photo, title, price, category
   - "Back to editing" button returns to editor

5. **Publish All Button**
   - Updates all matching items to `draftStatus: PUBLISHED`
   - Shows success toast

**Helper Function (Cloudinary URL builder):**
```typescript
function buildCloudinaryUrl(
  url: string,
  opts: { aspectRatio?: '4:3' | '1:1' | '16:9'; backgroundRemoved?: boolean; brightness?: number; contrast?: number }
): string {
  // Inserts transforms after /upload/ in Cloudinary URL
  // Example: ?ar=4:3,c=fill&e_brightness:+10&b_remove
}
```

---

### Phase 5: Multi-Photo Carousel UX

**Location:** `packages/frontend/components/camera/RapidCarousel.tsx`

**Features:**

1. **"+" Button on Thumbnails**
   - Tap to enter add-photo mode for that item
   - Thumbnail glows amber, shutter button shows "+"
   - Banner above shutter: "Next shot adds to this item · photo N"
   - After one additional capture: reset to normal mode
   - "×" on thumbnail or banner cancels add-mode

2. **Photo Count Badge**
   - Show "×N" on thumbnail when `photoUrls.length > 1`

3. **4:3 Framing Guide Overlay**
   - Semi-transparent white corner brackets on viewfinder
   - "4:3" label at top-center, very faint
   - Purely visual (no functional impact on crop)

4. **Auto-Enhance Badge**
   - Purple ✨ on thumbnails where `autoEnhanced === true`
   - Footer: "N auto-enhanced ✨"

**State Management:**
- Add `addingToItemId: string | null` state
- On "+" tap: set to item id
- On capture: if addingToItemId is set, PATCH item.photoUrls (append) instead of create
- After one capture: reset addingToItemId

---

### Phase 6: TypeScript Sanity Check

Before handoff, run:
```bash
cd /sessions/gifted-elegant-darwin/mnt/FindaSale
pnpm --filter frontend tsc --noEmit
pnpm --filter backend tsc --noEmit
```

Fix any type errors before deployment.

---

## Files Changed (Phases 1-2)

```
packages/database/prisma/schema.prisma
packages/database/prisma/migrations/20260311000003_add_camera_workflow_v2_fields/migration.sql
packages/database/prisma/migrations/20260311000003_add_camera_workflow_v2_fields/migration_lock.toml
packages/backend/src/services/cloudAIService.ts
packages/backend/src/jobs/processRapidDraft.ts
packages/backend/src/controllers/itemController.ts
packages/backend/src/routes/items.ts
```

---

## Next Steps (for Patrick / Session 148+)

1. **Test migration locally:**
   - Add `DIRECT_URL` to packages/backend/.env (Neon connection string)
   - Run `prisma migrate dev` locally to verify SQL
   - Run `prisma generate` to update Prisma client

2. **Deploy migration to Neon:**
   - Once tested locally and code is merged to main
   - Run (from Railway shell or local with Neon credentials): `prisma migrate deploy`

3. **Implement Phases 3-6:**
   - Follow implementation specs above
   - Reference CAMERA_WORKFLOW_V2_ARCHITECTURE.md for locked decisions
   - Use interactive mockup (camera-mode-mockup.jsx) as UI reference

4. **QA Testing:**
   - Capture → enhance → face detect → upload flow
   - Publishing page all features (confidence tinting, per-item editor, batch ops, buyer preview)
   - Bulk operations on items
   - draftStatus transitions (DRAFT → PENDING_REVIEW → PUBLISHED)

---

## Architecture Decisions (Locked)

See CAMERA_WORKFLOW_V2_ARCHITECTURE.md for all 7 resolved questions:
1. Background removal: Cloudinary `b_remove` at display time
2. Auto-enhance: Canvas API on-device before upload
3. Face detection: TensorFlow.js COCO-SSD (on-device, no cloud)
4. AI confidence: stored in `Item.aiConfidence` from Vision API
5. Photo schema: Photo model created (forward-looking, no v2 UI yet)
6. Aspect ratio crop: Canvas 4:3 before upload + Cloudinary transform
7. draftStatus: Existing enum correct, no changes

---

**Status:** Schema + backend ready for Neon deploy. Frontend implementation ready to begin.
