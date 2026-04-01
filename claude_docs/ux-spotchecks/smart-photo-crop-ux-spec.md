# Smart Photo Crop UX Spec
**FindA.Sale Camera Workflow — Auto-Crop Feature**

**Date:** 2026-03-31 | **Status:** Design Spec | **Owner:** UX | **Audience:** Dev, QA

---

## 1. Context & User Reality

**The User:** FindA.Sale organizers are 45–70 years old, non-photographers, often holding phones at angles due to arthritis or tremor. They're moving fast through messy estate sales, capturing 50+ items in rapid succession. Speed and reliability matter more than pixel-perfect framing.

**The Problem:** Raw camera sensor captures at 16:9 or varies by device. Estate sale items are visually diverse — tall lamps, wide paintings, squat furniture. There's no single aspect ratio that serves all items without either adding awkward letterbox bars or cropping important context.

**The Solution:** Two-layer crop system:
1. **Canvas crop** (automatic, silent) — consistent aspect ratio for consistent rendering
2. **AI subject detection** (optional) — optional tighter crop around detected item, with smart fallback if detection fails

---

## 2. UX Flow: Step-by-Step What Organizer Sees

### Shot Sequence (Rapidfire Mode)

```
1. Organizer frames item in viewfinder
   ↓
2. Taps shutter button
   ↓
3. **[SILENT PROCESSING]** Canvas auto-crop applies (imperceptible)
   ↓
4. **[AI detection fires]** Subject-detection model runs (1–2 sec, non-blocking)
   ↓
5. Thumbnail appears in left carousel (cropped image shows)
   ↓
6. If subject detection succeeded → thumbnail reflects tighter crop (see "Thumbnail visual cue" below)
   ↓
7. Toast appears below carousel:
   "Shot 1 captured ✓" (4-second auto-dismiss, optional "Review & Tag" link at shot 3+)
   ↓
8. Organizer continues to next item OR taps thumbnail to preview
```

**Key:** The organizer never sees a "cropping preview" modal. Cropping is invisible until they see the thumbnail or tap it.

---

## 3. Silent vs. Visible Crop — RECOMMENDATION: Silent + Thumbnail Feedback

**Decision: SILENT AUTO-CROP** with asynchronous AI detection.

**Rationale:**
- **Speed:** Fast-moving organizers can keep shooting. Each pause breaks momentum.
- **Cognitive load:** "Is this the right crop?" is a question slower organizers don't need to answer 50 times.
- **Accessibility:** Users with tremor/arthritis avoid extra screen taps; reduces decision fatigue.
- **Reality:** Raw sensor image still lives in memory — if organizer later wants full frame, "Retake" is the recovery path (deliberate choice, not regret recovery).

**Trade-off:** Organizers lose in-the-moment control. But they get:
- Undo via Retake (always available, no UI clutter)
- Preview on thumbnail (visual feedback organizer *did* actually crop)
- Edit-after-upload on review page (they see cropped image before publishing)

---

## 4. Override / Undo Path — RECOMMENDATION: Retake-First, Edit-Later

### If crop cuts off important content:

**Primary path:** Tap "Retake" button on thumbnail
- Relaunches camera
- Clear intent: "I want a different shot" not "Please show me crop controls"
- Avoids modal complexity mid-flow

**Secondary path** (deferred): Review page
- After uploading all photos, organizer sees cropped image on review page
- Tap thumbnail → preview modal with full-frame toggle
- "Use This Image" or "Pick Different Photo"
- This is a later-in-flow decision point (not live in camera)

**Why no in-camera crop adjustment?**
- Organizers under time pressure don't need crop handles
- Photos are destined for web (not print) — slight crop isn't tragic
- Retake is faster than finicky UI adjustment on a phone
- UI complexity compounds accessibility (tremor users struggling with sliders)

**Copy on Retake button (on thumbnail):**
```
"Retake" (secondary action, neutral color)
```

---

## 5. Feedback System — Thumbnail as Primary Signal

### What the organizer sees that tells them crop happened:

**Thumbnail view:**
```
┌─────────────────────────┐
│   Cropped image tile    │  ← Square (1:1) or chosen ratio
│   (shows in carousel)   │
│                         │
│   Item is centered,     │
│   background is         │
│   proportionally less   │
└─────────────────────────┘
    ↓ (organizer can see)
 [Retake] button below
```

**Visual difference (organizer perceives):**
- "That's the shot I took, but tighter/squared-off" (the visual compression tells them crop happened)
- If AI detection worked well, item is centered + background is proportionally less → they notice the improvement
- If AI detection failed, image looks "about the same" → no confusion, proceed

### Toast notification (during shot):
```
"Shot 3 captured ✓
 Review & Tag" (appears below carousel, auto-dismiss 4s)
```

**Does NOT say:** "Image cropped" or "Canvas auto-fit applied" (jargon, organizer doesn't need to know implementation).

### On thumbnail hover/tap (optional preview):
```
┌──────────────────────────────────┐
│ Cropped image (what's submitted) │
│                                  │
│ [View Full Frame] (if gallery    │
│  shows before/after, optional)   │
│                                  │
│ [Use This] [Retake]              │
└──────────────────────────────────┘
```

**No explicit label needed.** The visual shift tells the story. Trust the organizer to infer.

---

## 6. Aspect Ratio Recommendation: 3:4 (Portrait) + Square (1:1) with User Override

### Primary choice: **3:4 (portrait)**

**Reasoning:**
- Estate sale items are predominantly **vertical:** lamps (1:2), chairs (1.5:1), paintings (often portrait), mirrors, dressers
- 3:4 captures tall items without awkward letterboxing
- Web/mobile screens are portrait-biased (phones, tablets)
- Buyer thumbnails in grid prefer portrait (more visual impact than landscape)
- Wider crops of horizontal items (paintings, long furniture) can be achieved by organizer stepping back (easy, natural behavior)

**Secondary fallback: 1:1 (square)**
- If AI detection fails → default to 1:1 (safe, universally understood)
- Some items (plates, bowls, small tabletop objects) are naturally square
- Square crops are still acceptable for tall items (just adds a bit of border)

### No user-facing ratio toggle:
- Adds decision point mid-flow (slows organizer)
- FindA.Sale's use case doesn't require user choice (all items end up on web, not print or custom display)
- 3:4 serves 85%+ of estate items; 1:1 fallback covers the rest

### Configuration (dev):
```
primaryAspectRatio: 3:4  (height:width, so canvas is taller)
fallbackRatio: 1:1 (if AI detection fails or returns invalid bounding box)
```

---

## 7. Edge Cases & Smart Fallback Logic

### Edge Case 1: AI detection returns bounding box covering <10% of image

**Scenario:** Camera caught organizer's hand, item is tiny background object.

**Handling:** Ignore AI detection. Use canvas crop only (3:4).
- Bounding box area < 15% of image → assume false positive
- Don't crop to a tiny region (creates weird zoom effect)
- Proceed with default canvas crop
- Thumbnail looks like full-frame 3:4 canvas crop (no weird zoom)

**Copy:** None (silent fallback, not an error)

### Edge Case 2: Item is at very edge of frame

**Scenario:** Organizer shoots lamp pole-to-pole, lamp is at frame boundary (right edge), AI bounding box clips the foot.

**Handling:** Clamp bounding box to frame boundaries; don't push it off-screen.
- AI returns bounding box: `{ x: 0, y: 200, w: 400, h: 600 }` (for 1920×1440 frame)
- Check: does box extend past edges? If so, constrain: `x = max(0, x)`, `y = max(0, y)`, `w = min(frame.w - x, w)`, etc.
- Apply constrained crop
- Result: item is tighter than full-canvas but not clipped

### Edge Case 3: Multiple items in one photo

**Scenario:** Organizer accidentally captures two items (e.g., lamps on either side).

**Handling:** Crop to largest/most prominent bounding box.
- If AI confidence is high on one item (>70%), use that box
- If tied/ambiguous, use canvas crop (3:4) as safe default
- Thumbnail shows the crop; if organizer sees "wrong item" was cropped, they tap Retake

**Copy:** None (silent, organizer makes the judgment call on thumbnail)

### Edge Case 4: Completely blank shot (organizer tapped shutter with cap on, or pure wall)

**Scenario:** AI returns null/no detection.

**Handling:** Use canvas crop (3:4).
- Thumbnail shows blank 3:4 region
- Toast appears: "Shot captured ✓" (no different copy)
- Organizer sees it's blank and taps Retake

**Copy:** None required (the visual feedback is enough)

---

## 8. Accessibility Considerations — Disabled User Flow

### Users with tremor/arthritis:

**Minimized taps:**
- Shutter button is large (standard mobile camera UI, 56px+)
- No crop-adjustment sliders or fine-tuning modals
- Retake button is large (same size as in regular camera)
- Thumbnail carousel allows horizontal scroll (big targets, no pinch-zoom required)

**Feedback clarity:**
- Toast text is large (16px+), appears center-bottom (not hidden in corners)
- Thumbnail size is 100px+ (easy to see crop result)
- Color contrast on buttons ≥ 4.5:1 (WCAG AA)

**Cognitive load reduction:**
- Silent crop = no decision ("Is this right?") mid-flow
- One button to recover (Retake) vs. fiddly crop controls
- Clear thumbnail = visual confirmation without explanation

**Audio support:**
- Toast announcement: "Shot 3 captured. Review and tag at the end." (screen reader reads)
- Buttons have clear labels (Retake, Use This, Retake, not icons-only)

### Users with vision impairment (low vision, color blindness):

**Not fully addressed by crop feature** (existing camera is visual-first). But crop spec does:
- High contrast buttons (not subtle gradient differentials)
- No information conveyed by color alone (e.g., "red = bad crop" is not used)
- Thumbnail alt text: "Item photo, cropped to portrait orientation" (descriptive, not just "image_001.jpg")
- Screen reader announces crop state on thumbnail focus

---

## 9. Copy Guidelines

### Toast messages (4-second auto-dismiss):

```
Shot 1 captured ✓
Shot 2 captured ✓
Shot 3 captured ✓ Review & Tag
Shot 4 captured ✓ Review & Tag
...
```

**Tone:** Encouraging, minimal. No technical language.

**Examples of what NOT to say:**
- ✗ "Image auto-cropped to 3:4 aspect ratio"
- ✗ "Canvas normalization in progress"
- ✗ "Bounding box detected; processing..."

### Thumbnail preview (on tap):

```
[Modal Header]
Item Photo

[Image display area — cropped version]

[Label, optional]
"This is what your listing will show"

[Buttons]
[Use This] [Retake]
```

**If user taps "View Full Frame" (optional expandable):**
```
[Full uncropped image in modal overlay or swipeable]
← Back to cropped
```

### Retake button (on thumbnail):

```
"Retake"  (neutral, secondary button style)
```

Not:
- ✗ "Delete & Retake" (implies damage)
- ✗ "Adjust Crop" (implies controls exist)
- ✗ "Redo" (ambiguous)

### Review page (after upload):

```
[Cropped image thumbnail grid]

On hover/tap:
"Tap to preview or choose a different photo"

On tap:
┌──────────────────────────┐
│ Cropped image            │
│ (what listing will show) │
│                          │
│ [Use This] [Pick New]    │
└──────────────────────────┘
```

---

## 10. Technical Specifications

### Canvas Crop (automatic):

```typescript
// Pseudo-code
function autoCropCanvas(originalBlob: Blob, aspectRatio: '3:4' | '1:1') {
  const canvas = document.createElement('canvas');
  const img = new Image();
  img.src = URL.createObjectURL(originalBlob);

  img.onload = () => {
    const srcWidth = img.width;
    const srcHeight = img.height;

    // Calculate target dimensions based on aspect ratio
    // 3:4 = height is 1.33× width
    let targetWidth, targetHeight;
    if (aspectRatio === '3:4') {
      targetWidth = Math.min(srcWidth, srcHeight / 1.33);
      targetHeight = targetWidth * 1.33;
    } else { // 1:1
      const minDim = Math.min(srcWidth, srcHeight);
      targetWidth = minDim;
      targetHeight = minDim;
    }

    // Center crop
    const srcX = (srcWidth - targetWidth) / 2;
    const srcY = (srcHeight - targetHeight) / 2;

    canvas.width = targetWidth;
    canvas.height = targetHeight;
    canvas.getContext('2d').drawImage(
      img, srcX, srcY, targetWidth, targetHeight,
      0, 0, targetWidth, targetHeight
    );

    return canvas.toBlob(blob => callback(blob));
  };
}
```

**Timeline:** <50ms (synchronous, no await)

### AI Subject Detection (asynchronous, optional):

```typescript
// Pseudo-code
async function detectSubject(blob: Blob) {
  const formData = new FormData();
  formData.append('image', blob);

  const response = await fetch('/api/images/detect-subject', {
    method: 'POST',
    body: formData,
  });

  const { boundingBox, confidence } = await response.json();

  // boundingBox: { x, y, width, height } in pixels
  // confidence: 0–1 score

  if (confidence < 0.5 || !boundingBox || area(boundingBox) < imageArea * 0.15) {
    // Ignore AI crop; keep canvas crop
    return null;
  }

  // Apply constrained tighter crop
  return applyTighterCrop(blob, boundingBox, aspectRatio);
}
```

**Timeline:** 1–2 seconds (non-blocking; photo is still submitted even if AI is slow)

### Fallback Logic:

- Canvas crop = synchronous, always completes
- AI crop = async, fires after canvas crop
- If AI completes in time (<2s), replace thumbnail with tighter crop
- If AI fails or times out, thumbnail stays as canvas-cropped version
- **No error message** (organizer doesn't care why detection failed)

---

## 11. Implementation Checklist for Dev

### Phase 1: Canvas Crop (Mandatory)

- [ ] Add `autoCropCanvas()` function to RapidCapture component
- [ ] Trigger after shutter button tap, before `onPhotoCapture()` callback
- [ ] Use 3:4 as primary, 1:1 as fallback for edge cases
- [ ] Test on 16:9, 4:3, 1:1 device aspect ratios
- [ ] Verify canvas-cropped blob is submitted (not original)
- [ ] Check performance: <50ms crop time on low-end devices

### Phase 2: AI Subject Detection (Nice-to-Have)

- [ ] Dispatch to `POST /api/images/detect-subject` after canvas crop completes
- [ ] Parse response: `{ boundingBox, confidence }`
- [ ] Apply edge-case guards (area <15%, box extends past frame, etc.)
- [ ] If valid, apply tighter crop; update thumbnail
- [ ] If invalid, silently keep canvas crop (no error UI)
- [ ] Test on 10 sample items: tall (lamp), wide (painting), small (plate), edge-placed
- [ ] Timeout: 2 seconds; if slower, silently timeout and use canvas crop

### Phase 3: QA & Accessibility

- [ ] Mobile + desktop viewport testing (portrait orientation primary)
- [ ] Dark mode: thumbnail contrast ≥ 4.5:1
- [ ] Thumbnail alt text: "Item photo, cropped to portrait orientation"
- [ ] Toast announcement for screen readers
- [ ] Retake button: no tremor-unfriendly sliders (only tap to retake)
- [ ] Test on iOS/Android physical devices (real camera sensor)

---

## 12. Design System Requirements

### Component: Thumbnail + Retake button

```
┌─────────────────┐
│  Cropped image  │  (3:4 ratio, 100px wide)
│   thumbnail     │  (border-radius: 4px)
│                 │
└─────────────────┘
   [Retake]        (small button, 32px height)
```

**Styles:**
- Thumbnail border: 1px, neutral gray (not amber, not bright)
- Retake button: secondary style (light background, dark text on light mode; dark background, light text on dark mode)
- Hover: thumbnail shadow lift (subtle depth cue)
- No hover effect on crop indicator (crop is passive feedback, not clickable)

### Component: Toast notification

```
┌──────────────────────────────────┐
│ ✓ Shot 3 captured                │
│ Review & Tag (link, shot 3+)     │
└──────────────────────────────────┘
```

**Styles:**
- Font: 14px, semibold
- Background: soft green (success tone) or neutral dark
- Duration: 4 seconds, auto-dismiss
- Position: below carousel, center-aligned
- Animation: slide up, fade out (subtle)

---

## 13. Open Questions for Patrick

Before implementation, clarify:

1. **AI detection budget:** Is there a token/cost limit for `detect-subject` API calls? Should fallback to canvas-only if budget exhausted?
2. **Retry logic:** If AI returns error 500, should we retry or silently use canvas crop?
3. **Organizer preference:** Should there be a hidden settings toggle to disable AI crop (canvas-only mode for power users)?
4. **Future: Multi-item detection:** Should we mention on the spec that future iteration could offer "Crop to Item 1" / "Crop to Item 2" if multiple subjects detected?
5. **Video test:** Has testing included device camera rotation (organizer holds phone landscape momentarily)? Should crop handle landscape + portrait within a single session?

---

## 14. Success Criteria (QA Gate)

✅ Feature is complete when:

1. **Canvas crop is invisible:** Organizer taps shutter; photo appears in carousel. No pause, no modal, no explanation needed.
2. **Thumbnail is visibly cropped:** When organizer looks at carousel, photo is noticeably framed (tighter than raw sensor).
3. **Retake always works:** Tap Retake, camera relaunches, organizer can shoot again. No confusion, no lost photos.
4. **AI crop is optional:** If AI detection succeeds, thumbnail is slightly tighter. If AI fails, thumbnail still looks good (canvas crop).
5. **Accessibility verified:** Organizer with tremor can shoot 10 items in rapid succession without frustration. No sliders, no fine-tuning.
6. **Copy is jargon-free:** Toast and buttons use simple language ("Shot captured", "Retake"). No "aspect ratio", "bounding box", "normalization".
7. **Dark mode passes contrast:** Text ≥ 4.5:1 WCAG AA; thumbnails visible in low light.
8. **Performance: <100ms end-to-end:** Canvas crop completes in <50ms; AI fires async without blocking upload flow.

---

**END SPEC**
