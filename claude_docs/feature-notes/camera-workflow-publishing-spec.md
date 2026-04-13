# Feature Spec: Camera Workflow v2 + Publishing Page
**Status:** Ready for architecture review
**Session:** 146
**Date:** 2026-03-11
**Author:** Session 146 design sprint (camera-mode-mockup.jsx is the interactive reference)

---

## Problem Statement

Organizers currently use separate camera tabs (Rapidfire / Regular) and must leave the camera to switch modes or adjust photos. Post-capture editing requires navigating to a separate review screen with limited tools. There is no photo quality assistance, no AI confidence visibility during capture, and no batch editing tools. The result is slow item creation, high post-capture correction burden, and photos that underperform on listing platforms.

---

## Goals

- Keep Rapidfire the default and dominant flow — organizers should never feel forced to stop shooting
- Allow multi-photo flexibility within Rapidfire without mode-switching
- Surface AI quality signals early so organizers fix problems before publishing
- Bring professional photo tools (background removal, crop, auto-enhance) into the publishing page
- Let organizers see exactly what buyers will see before going live

---

## Out of Scope (this release)

- Anti-shake timer (defer until user-requested)
- OCR for handwritten price tags (defer — adds cognitive complexity)
- Duplicate detection / merge (future enhancement)
- Batch similarity grouping (future)
- Voice mode switching (future)

---

## User Stories

**As an organizer shooting in Rapidfire mode**, I can tap a "+" button on any carousel thumbnail to add more photos to that item without leaving the camera or switching modes, so I never lose my shooting rhythm for items that need multiple angles.

**As an organizer**, I can see a 4:3 crop guide overlay on the viewfinder so I frame shots correctly from the start rather than cropping after.

**As an organizer**, I can see a purple ✨ badge on thumbnails where auto-enhance was applied so I know which items have been corrected.

**As an organizer**, I can see AI confidence color-coding on all items in the publishing page so I know at a glance which items need manual review.

**As an organizer**, I can expand any item in the publishing page to edit the photo (aspect ratio, background removal, brightness, contrast, auto-enhance toggle) and metadata (title, price) in one place.

**As an organizer**, I can select multiple items and bulk-set price, category, or background removal in one action.

**As an organizer**, I can tap "Buyer preview" to see a light-mode buyer-facing grid before publishing so I can catch problems early.

**As an organizer**, I receive a "Retake?" toast immediately after a bad (blurry/dark) capture so I can fix it without interrupting flow.

**As an organizer**, I see a pre-capture quality hint ("too dark") before I shoot so I can fix lighting first.

**As an organizer**, I receive a face-detection flag before sync if a captured photo contains a person's face, protecting privacy in private homes.

---

## Feature Details

### 1. Camera — Rapidfire Multi-Photo via "+" Button

**Trigger:** Tap the small "+" button on any carousel thumbnail.

**Behavior:**
- Tapped thumbnail glows amber, "+" flips to "×"
- A banner appears above the shutter: _"Next shot adds to this item · photo N"_
- Shutter button changes to a "+" icon and deepens in color to signal add-mode
- Next capture attaches to the open item and increments its photo count badge
- Item auto-closes after one additional shot (organizer must tap "+" again for another)
- Tap "×" on thumbnail or banner to cancel and return to new-item mode

**Photo count badge:** Items with >1 photo show a "×N" badge at the bottom of their thumbnail.

**No limit defined** on photos per item in Rapidfire — each "+" tap allows one more.

---

### 2. Camera — Aspect Ratio Framing Guide

- Default ratio: **4:3** (matches general listing platform standards; EstateSales.NET publishes no specific spec)
- Corner bracket overlay appears on the viewfinder in a faint white
- "4:3" label appears at top-center of frame, faint
- Ratio is a global sale setting (set once, not per-item)
- Actual output crop is applied at publish time, not capture time — the guide is compositional only

---

### 3. Camera — Auto-Enhance Badges

- After capture, images are automatically processed: brightness correction + color correction
- A purple ✨ badge appears on carousel thumbnails where enhancement was applied
- Carousel footer shows "N auto-enhanced ✨" count
- Enhancement can be reverted per-item in the publishing page
- Enhancement happens in background alongside AI tagging — no blocking

---

### 4. Camera — Photo Quality Warnings

**Pre-capture:** Analyze live frame for darkness/blur. If below threshold, show a subtle non-blocking hint (e.g., "Too dark — adjust lighting").

**Post-capture retake toast:** If a captured image is detected as blurry or near-black, surface a "Retake?" toast for 4 seconds with a one-tap retake button. Dismissing the toast keeps the bad photo in the carousel (recoverable via "+" later or deletable in publishing).

---

### 5. Camera — Face Detection Flag

- Before a photo is synced/uploaded, run face detection
- If a face is detected, pause upload and show: _"This photo may contain a person. Upload anyway?"_ with Yes / Retake options
- This is a privacy safeguard for organizers working in private homes
- Does not block capture — only flags before cloud sync

---

### 6. Publishing Page — AI Confidence Tinting

- Each item card in the publish list has a colored left border or glow:
  - **Green** (≥80%): AI is confident, likely correct
  - **Amber** (55–79%): Worth a quick review
  - **Red** (<55%): Low confidence — title and/or category likely wrong
- Confidence dot + label ("Good" / "Review" / "Low") appears on each item row
- Expanded edit panel shows a warning banner for amber and red items:
  - Red: _"⚠ Low AI confidence (N%) — title and category may be wrong. Please review."_
  - Amber: _"◐ AI is N% confident — worth a quick check."_

---

### 7. Publishing Page — Per-Item Photo Editor

Accessed by tapping any item to expand it.

**Photo tools:**
- **Aspect ratio pills:** 4:3 / 1:1 / 16:9 — applies a crop at publish time
- **Background removal toggle:** Removes background from primary photo. Removed state shown with a dashed purple border on the thumbnail.
- **Auto-enhance toggle:** Turn the automatic enhancement on/off per item
- **Brightness slider:** 0–100, default 50, displayed as a range input
- **Contrast slider:** 0–100, default 50

**Metadata fields (in same expanded panel):**
- Title (free text)
- Price (numeric)
- Category (text — also settable via bulk panel)

**Multi-photo note:** Tools apply to the primary (first) photo. Future release: per-photo editing within an item.

---

### 8. Publishing Page — Batch Operations

**Select mode:** Checkbox on each item row. "Select all" / "Deselect all" in batch toolbar.

**Bulk actions (require ≥1 item selected):**
- **$ Bulk price:** Opens a bottom sheet with a price input. Sets the same price on all selected items.
- **🏷 Bulk category:** Opens a bottom sheet with category chips (Furniture, Décor, Art, Clothing, Jewelry, Collectibles, Electronics, Kitchen, Books, Other). Tap to apply.
- **✂ Remove BG:** Applies background removal to all selected items in one tap. No confirmation required.

---

### 9. Publishing Page — Buyer Preview

- Button in batch toolbar: "👁 Buyer preview"
- Switches to a light-mode buyer-facing grid (2-column, white background)
- Shows each ready item as a listing card: photo thumbnail, title, price, category, enhancement/BG-removal badges
- A "Preview only" chip in the header makes it clear this is not live
- "← Back to editing" returns to the editing list without losing any changes
- Buyer preview shows only items with `status === "complete"`

---

## Technical Notes for Architecture Review

The following areas need architecture decisions before implementation:

1. **Background removal API** — client-side (WASM, e.g. rembg) vs. server-side (cloud API). Cost, latency, and offline considerations.
2. **Image processing pipeline** — where does auto-enhance run? On-device before upload, or server-side post-upload? Must not block the camera.
3. **Face detection** — on-device (TensorFlow.js, face-api.js) strongly preferred for privacy. Confirm no faces are sent to a third party.
4. **AI confidence scores** — currently simulated. Need a real confidence field in the Item AI response payload. Backend contract change required.
5. **Photo angle labeling schema** — items now support multi-photo with count. Future: label each photo (front/back/detail). Schema should anticipate this even if not implemented now.
6. **Aspect ratio at publish time** — crop transform needs to be applied server-side or client-side before final upload. Define where this happens.
7. **`draftStatus` field** — items stay in `DRAFT` until organizer taps "Publish all". Confirm this matches existing `draftStatus: DRAFT | PENDING_REVIEW | PUBLISHED` schema.

---

## Success Metrics

- **Rapidfire session length:** Organizers should shoot longer per session without mode-switching (proxy: fewer tab changes per session)
- **Multi-photo adoption:** % of Rapidfire sessions that use the "+" button at least once
- **Publishing correction rate:** % of items that need manual title/price correction at publish (target: reduce by 30% via confidence tinting surfacing issues earlier)
- **Background removal usage:** % of items published with BG removed
- **Retake rate:** % of retake toasts acted on (validates the feature is useful, not noise)
- **Time to publish:** Total time from first capture to "Publish all" tap

---

## Interactive Reference

`camera-mode-mockup.jsx` in the repo root is a fully interactive React mockup of both the camera screen and the publishing page. Show this to any reviewer before implementation discussions.

---

## Next Steps

1. **findasale-architect** — Review §Technical Notes, produce implementation plan and schema decisions
2. **findasale-advisory-board / Ship-Ready subcommittee** — Validate scope and sequencing; identify any blockers
3. **findasale-dev** — Implement against approved plan
4. **findasale-qa** — Verify against user stories in this spec
