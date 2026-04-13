# Rapidfire Mode UX Specification

**Date:** March 10, 2026
**Scope:** Complete dual-mode camera workflow for `/organizer/add-items/[saleId]`
**Status:** Ready for design + dev intake
**Target Device:** Mobile (100% phone-first workflow)

---

## Executive Summary

This spec defines a **dual-mode camera capture system** that coexists seamlessly on the same page. Organizers can toggle between:

1. **Rapidfire Mode (new):** Camera-first, one photo per item, AI analysis in background, zero wait states
2. **Regular Mode (enhanced):** Deliberate workflow, up to 5 photos per item, AI assists but organizer controls flow

Both modes share the same camera UI, same AI pipeline, and can be toggled without leaving the viewfinder. The key innovation is **non-blocking background processing** in Rapidfire—organizer never stops capturing to wait for AI.

---

## 1. Mode Definition & Personas

### Rapidfire Mode: Speed-Optimized Capture

**When used:** Large estate sales, hundreds of items, time-critical inventory capture
**Organizer mental model:** "I'm walking through a house with my phone. I point, tap once, move to next item."
**Per-item flow:** 1 photo → tap → move to next item (AI runs silently in background)
**Trust signal:** Carousel at bottom confirms photo was captured and is being processed

**Constraints:**
- 1 photo per item (no multi-angle options in this mode)
- Camera stays open entire session
- AI analysis is mandatory but non-blocking
- Photos appear in carousel immediately after capture
- Post-session review required before publishing

### Regular Mode: Deliberate, Multi-Photo Capture

**When used:** High-value items, unusual pieces, items needing detailed photos
**Organizer mental model:** "I'm carefully documenting this piece. Let me get multiple angles and make sure my description is right."
**Per-item flow:** Capture 1–5 photos → review in form → approve/edit → save → next item
**Trust signal:** Form fields update live as organizer takes photos; organizer sees AI suggestions in real-time

**Constraints:**
- Up to 5 photos per item
- Camera closes after photo set is complete
- AI pre-fills form; organizer reviews and can override
- Each item fully vetted before moving to next
- Camera reopens when ready for next item

---

## 2. Unified Camera Interface

### Screen Layout (Portrait Mobile, 375–428px width)

```
┌────────────────────────────────────┐
│  ← Back  |  Rapid  Regular  | ? 🔦  │  ← Top bar: breadcrumb, mode toggle, help, torch
├────────────────────────────────────┤
│                                    │
│         📷 VIEWFINDER              │  ← Full-width, 70% of viewport
│       (camera preview)             │
│                                    │
│                                    │
│                                    │
├────────────────────────────────────┤
│ ⭕ CAPTURE BUTTON (large, centered)│  ← Primary action, full-width button, 60px tall
├────────────────────────────────────┤
│ [━] [▶] [════ Carousel Area ═════] │  ← Bottom tray:
│  ↑   ↑   Item 1  Item 2  Item 3    │     - Toggle carousel (collapse/expand)
│  ├─┴─┘   [✓]     [◐]     [...]    │     - Play/pause AI batch processing
│  │                                 │     - Horizontal scroll carousel
│  └─ Collapse carousel              │       showing recent captures
└────────────────────────────────────┘

When carousel is expanded:
┌────────────────────────────────────┐
│  ← Back  |  Rapid  Regular  | ? 🔦  │
├────────────────────────────────────┤
│         📷 VIEWFINDER (50%)         │
├────────────────────────────────────┤
│ ⭕ CAPTURE BUTTON                  │
├────────────────────────────────────┤
│ Carousel (expanded, 40%)            │
│ ┌─────┬─────┬─────┬─────┬─────┐    │
│ │ ✓ 1 │ ◐ 2 │ ◐ 3 │ ✓ 4 │ ⊕ 5 │    │
│ └─────┴─────┴─────┴─────┴─────┘    │
│ Count: 5 photos ·  AI: 2 done, 3… │
└────────────────────────────────────┘
```

---

### 2.1 Top Bar

**Left slot (breadcrumb + back):**
- Text: "Sale > Items > Capture"
- Tap area: 40px, navigates back to sale (confirm unsaved photos first)

**Center slot (mode toggle):**
- Two buttons: "Rapidfire" | "Regular"
- Active mode is highlighted in amber/warm-600, inactive is text-gray-500
- Tap toggles mode without leaving camera view
- When switching Rapidfire → Regular: any current carousel moves to a pending queue or drafts view (design decision below)
- No animation on toggle; instant switch

**Right slot (help + torch):**
- Torch icon (🔦): toggles flashlight
- Help icon (?): tap opens brief modal explaining the active mode
- Both icons are 32px, tap area is 44px minimum for thumb reach

---

### 2.2 Viewfinder Area

**Dimensions:**
- 100% viewport width
- Height: 50% viewport (in Rapidfire) or 70% viewport (if carousel collapsed)
- Aspect ratio: native camera feed, no cropping or letterboxing
- Landscape: rotate camera feed 90° clockwise (standard mobile behavior)

**Overlays (non-blocking):**
- Corner badges (top-left): `📷 Front | Back ⇄` toggle (switch between front/back cameras)
- Tap to switch cameras; cool 300ms transition
- Bottom-left: frame indicator (grid lines, optional, off by default)
- No capture count overlay in this view

**Mobile considerations:**
- Landscape mode: viewfinder scales to 100% width, capture button repositions below or rotates
- Camera permission prompt: standard mobile OS flow, caught in try/catch block
- One-handed use: capture button positioned in thumb reach (bottom-center)

---

### 2.3 Capture Button

**Visual:**
- Large circular button, 60px diameter
- Background: linear gradient amber-600 → amber-500
- Icon: white circle inside (represents camera shutter)
- Tap feedback: scale 0.95, shadow lift
- Disabled state: gray-400, no pointer events

**Behavior:**
- **Rapidfire mode:** Single tap → shutter sound → carousel updates in 200ms → enabled immediately for next tap
- **Regular mode:** Single tap → same capture logic → form overlay opens after 5th photo OR when organizer taps "Done capturing"
- Hold behavior: no burst mode (single tap only)
- Visual feedback: white flash overlay, 150ms duration

**States:**
- Default: amber-600, enabled
- Capturing: opacity 0.7, disabled for 200ms
- Camera unavailable: gray-400, disabled, tooltip "Camera not available"

---

## 3. Rapidfire Mode Flow

### 3.1 Entry & Initialization

**Trigger:** Organizer taps "Rapidfire" in mode toggle or lands on page with Rapidfire as default

**UI changes:**
- Mode toggle shows "Rapidfire" highlighted
- Carousel is collapsed by default (show toggle icon `[━]`)
- Help text (in ? modal): "One photo per item. We'll tag them in the background while you keep going."
- Carousel shows count: "Ready to capture"

**First-time hint (onboarding):**
- First time entering Rapidfire (check localStorage: `hasSeenRapidfireHint`):
  - Show 2-second toast below capture button: "👉 Tap to capture. Photos appear below."
  - Toast fades after 2s or on first tap (whichever is first)
  - Set localStorage flag `hasSeenRapidfireHint = true`

---

### 3.2 Capture Loop

**User action:** Tap capture button

**Sequence (all timings are cumulative):**

1. **T+0ms:** Shutter sound plays (60–80ms audio clip, iOS volume-dependent)
2. **T+50ms:** White flash overlay appears (opacity 1.0)
3. **T+200ms:** Overlay fades (opacity 0.0), photo finalized
4. **T+220ms:** Photo is queued for upload
5. **T+280ms:** Photo appears in carousel (thumbnail, status = "uploading")
6. **T+300ms:** Upload to Cloudinary begins (async, doesn't block UI)
7. **T+3000ms (background):** Photo reaches Cloudinary, returns URL
8. **T+3100ms (background):** AI analysis begins (Claude Haiku with Google Vision, ~2–5s)
9. **T+8000ms (background):** AI analysis completes, carousel thumbnail updates to "done" state (✓)

**Carousel thumbnail progression:**
- `[📷]` (uploading): neutral gray, no status badge
- `[◐]` (analyzing): amber ring animation, "AI analyzing" tooltip on tap
- `[✓]` (done): green checkmark overlay, "AI tags ready, tap to review"

**Organizer experience:**
- Tap capture → instant visual feedback (flash + shutter sound)
- Move to next item before carousel updates
- As carousel updates, organizer gets passive feedback (photos appearing)
- No waiting required; can capture 10+ photos in 30 seconds

**Upload queue:**
- Browser maintains queue of photos to upload
- Max 3 concurrent uploads (prevents overwhelming Cloudinary)
- Queue persists if organizer closes browser (IndexedDB backup)

---

### 3.3 Carousel (Collapsed View)

**Location:** Below capture button, 10–15% viewport height
**Scroll direction:** Horizontal (left-right)
**Height:** Auto, approximately 80–100px including count label

**Thumbnail design:**
```
┌──────────┐  ┌──────────┐  ┌──────────┐
│ [✓ 1]    │  │ [◐ 2]    │  │ [📷 3]   │
│ "Chair"  │  │ "Lamp"   │  │          │
│ Furniture│  │ Lights   │  │ Uploading│
└──────────┘  └──────────┘  └──────────┘
```

**Each thumbnail contains:**
- Photo preview (60×60px or 70×70px, JPEG, 100–150KB)
- Item number (small badge, top-right)
- Status icon (top-left):
  - `✓` (green) = AI analysis complete, tags ready
  - `◐` (amber) = AI analyzing, 1–5s remaining
  - `📷` (gray) = uploading, waiting to analyze
- AI-generated title (1 line, 12px text, truncated with ellipsis)
- AI-generated category (1 line, 10px text, gray-600)
- Tap to expand → preview modal (design in section 3.4)

**Carousel interactions:**
- Tap thumbnail → preview modal (see 3.4)
- Long-hold (500ms) → delete confirmation (see 3.5)
- Swipe left → auto-scroll carousel
- Swipe right → auto-scroll carousel (or snap to edges)

**Count label (below carousel):**
```
"5 photos captured · 2 ready · 3 analyzing…"
```
- Updates in real-time as AI completes
- Text color: gray-700
- Font size: 12px

**Carousel toggle buttons:**
- Left button: `[━]` (collapse) or `[▲]` (expand depending on state)
- Right button: `[▶]` (pause AI batch) or `[⏸]` (resume)
  - Pausing: stops new jobs from starting, lets in-flight jobs finish
  - Resume: starts processing queued photos
  - Organizer might pause if they want to capture photos offline, then resume later

---

### 3.4 Carousel Tap → Thumbnail Preview Modal

**Trigger:** Organizer taps any thumbnail in carousel

**Modal design (full-screen overlay):**
```
┌────────────────────────────────┐
│  ✕ [Cancel]                    │ ← Close button, top-right
├────────────────────────────────┤
│                                │
│      [Photo Preview]           │ ← Large photo, 300×300px or larger
│      (landscape/portrait)      │ ← Show at true aspect ratio
│                                │
├────────────────────────────────┤
│ AI Tags (read-only in Rapidfire):
│  Title: "Dining Room Chair" ✏  │ ← Pencil icon opens edit (inline)
│  Category: Furniture            │
│  Condition: Good                │
│  Description: "Mahogany with... │ ← Truncated, tap "Read more" to expand
│  Price: [Not set]              │ ← Grayed out, set at review stage
│                                │
│  [Back]  [Done Reviewing]      │ ← Bottom buttons
└────────────────────────────────┘
```

**Behavior:**
- Modal is full-screen on mobile, centered/constrained on larger devices
- Photo can be zoomed by pinch (optional, nice-to-have)
- Tap any field to edit inline (except in pure preview mode)
- "Done Reviewing" closes modal and returns to carousel view
- Changes to AI tags are saved to the draft immediately (IndexedDB cache)

**Edit inline (if organizer taps pencil icon):**
- Field becomes input, pre-filled with current AI value
- Organizer can clear and type new value
- Blur (tap outside field) saves change
- If organizer clears field, AI suggestion is used at review time

---

### 3.5 Delete from Carousel (Rapidfire)

**Trigger:** Long-hold (500ms) on thumbnail, OR swipe-left on thumbnail and tap delete icon

**Confirmation modal:**
```
┌────────────────────────────────┐
│ Delete photo?                  │
│ "Chair"                        │
│                                │
│ AI tags and any edits will be  │
│ lost. You can retake it.       │
│                                │
│  [Cancel]  [Delete]            │
└────────────────────────────────┘
```

**On confirm:**
- Photo removed from carousel immediately (optimistic UI)
- Queued upload job canceled
- If AI analysis was in progress, job is canceled
- Carousel count updates in real-time
- No toast notification (visual feedback is thumbnail disappearing)

---

### 3.6 Edge Case: AI Fails on Individual Photo

**Scenario:** Upload succeeds, but Claude AI returns an error (rate limit, malformed image, etc.)

**Carousel state:** Thumbnail shows error badge `[⚠️]` instead of `[◐]` or `[✓]`

**Behavior:**
- Photo is still in carousel (not deleted)
- Organizer can tap thumbnail to see error detail: "AI couldn't analyze this photo. Try retaking it."
- Organizer can:
  - Delete photo (long-hold, confirm)
  - Retake photo (opens camera view again, updates this slot)
  - Move forward (leave error photo, continue capturing)
- Error is highlighted in post-session review (section 4 below)

**Retry logic:**
- Auto-retry failed jobs once after 30s
- If still fails, flag for manual review
- Organizer sees list of failed photos in review screen

---

### 3.7 Edge Case: Photo Blurry/Rejected by Organizer

**During capture session:**
- Organizer can retake a photo by tapping the carousel thumbnail and selecting "Retake"
- Current photo is replaced in carousel
- Previous version is deleted

**At review time (section 4):**
- AI may flag blurry photos or very uncertain tags
- Organizer can confirm or reject entire item (see section 4.6)

---

### 3.8 Edge Case: Carousel Full (N Photos Limit)

**Scenario:** Rapidfire mode has theoretical limit of 100+ photos per session (practical limit is browser memory + Cloudinary quota)

**If organizer captures 100+ photos:**
- Carousel becomes scrollable (already is, by design)
- Leftmost photos scroll out of view
- Count label updates: "102 photos · 98 ready · 4 analyzing"
- No warning; scrolling is natural UX

**Session cleanup:**
- At end of session, review screen only shows photos that passed AI analysis
- Blurry or rejected photos can be manually deleted from review list

---

## 4. Regular Mode Flow

### 4.1 Entry & Initialization

**Trigger:** Organizer taps "Regular" in mode toggle

**UI changes:**
- Mode toggle shows "Regular" highlighted
- Carousel is hidden (collapsed by default)
- Camera stays open
- Help text (in ? modal): "Take up to 5 photos of each item. We'll fill in details for you to review."

**First photo capture:**
- Identical to Rapidfire (capture → shutter → carousel updates)
- Carousel shows bottom tray with toggle to expand

---

### 4.2 Multi-Photo Capture (Regular Mode)

**User can capture 1–5 photos before closing camera and entering form edit view.**

**Capture sequence (1–5 photos):**
1. Tap capture button → photo added to carousel (same as Rapidfire)
2. Carousel shows count: "1 of 5 photos"
3. Organizer can:
   - Tap capture again (add photo 2–5)
   - Tap "Done capturing" button (unlocks form entry)
   - Tap carousel thumbnail to switch focus (no form interaction yet)

**"Done capturing" button:**
- Appears next to or below carousel
- Text: "Done capturing" or "Next: Review items"
- Tapping opens the form edit view (see 4.3)
- Camera closes
- Carousel becomes a read-only photo gallery in form view

---

### 4.3 Form Entry (Regular Mode)

**After organizer taps "Done capturing":**

**Layout:**
```
┌────────────────────────────────────┐
│  ← Back  |  Rapid  Regular  | ?    │
├────────────────────────────────────┤
│ Photo Gallery (read-only, 60px h)  │
│ [1] [2] [3]  [View all]            │ ← Tappable thumbnails, click for full-screen view
├────────────────────────────────────┤
│ Form (scrollable):                 │
│ Title: "Dining Room Chair" ✏        │ ← AI-filled, editable
│ Category: [Furniture]               │ ← AI-filled, dropdown
│ Condition: [Good] ▾                │
│ Price: $___                        │ ← Empty (organizer sets)
│ Description: "Beautiful mahog..." ✏ │
│                                    │
│  [✏ Edit more] [← Back] [Save]     │
└────────────────────────────────────┘
```

**Form fields:**
- Title: text input, AI-prefilled, required
- Category: dropdown, AI-prefilled, required
- Condition: dropdown (Excellent/Good/Fair/Poor), AI-prefilled, optional
- Price: number input, required, cleared (organizer enters)
- Description: textarea, AI-prefilled, optional, max 500 chars
- Shipping: checkbox + price field (optional)

**AI prefill logic:**
- AI analysis runs immediately after first photo is captured
- By the time organizer taps "Done capturing", AI tags are typically ready
- Fields show AI suggestions; organizer can edit any field
- If AI analysis is still in progress (rare), show spinner: "Analyzing photo…"

**Save flow (Regular Mode):**
- Organizer taps "Save"
- Form validation runs (title, category, price required)
- If valid:
  - Item is created in database (POST /items)
  - Item appears in the items list below
  - Camera closes, organizer returns to mode selection
  - Camera can be reopened by selecting "Camera" mode again
- If invalid:
  - Toast appears: "Please fill in [missing field]"
  - Form stays open

---

### 4.4 Review After Save (Regular Mode)

**After "Save" in form:**
- Item appears in the items list at bottom of page (same as Manual Entry tab)
- Organizer can tap item to edit again, or
- Organizer can tap camera icon to capture next item (camera reopens)

---

## 5. Post-Session Review Screen

### 5.1 When Review Screen Appears

**Trigger:** Organizer explicitly taps "Review & Publish" button (appears when carousel has ≥1 complete photo)

**Or:** Organizer navigates away from camera (back to sale page or dashboard) — all captured photos are auto-saved as drafts

**Route:** New page or modal at `/organizer/add-items/[saleId]/review`

### 5.2 Review Screen Layout

**Full-screen, scrollable list:**

```
┌────────────────────────────────────────┐
│  ← Back to Capture                     │
├────────────────────────────────────────┤
│ Review Items Before Publishing         │
│ 5 photos captured · All analyzed ✓     │
├────────────────────────────────────────┤
│ [Card 1: Chair]                        │
│ ┌──────────────────────────────────┐  │
│ │ [Photo] │ Title: Dining Chair    │  │
│ │         │ Cat: Furniture         │  │
│ │         │ Cond: Good             │  │
│ │         │ Price: $___            │  │
│ │         │ Desc: Mahogany, good...│  │
│ │         │ [Edit] [Remove]        │  │
│ └──────────────────────────────────┘  │
│                                        │
│ [Card 2: Lamp]                         │
│ ┌──────────────────────────────────┐  │
│ │ [Photo] │ Title: Table Lamp      │  │
│ │         │ Cat: Lighting          │  │
│ │         │ Cond: Fair ⚠          │  │
│ │         │ Price: [not set] ⚠    │  │
│ │         │ Desc: Brass base, ...  │  │
│ │         │ [Edit] [Remove]        │  │
│ └──────────────────────────────────┘  │
│                                        │
│ ⚠ 2 items incomplete (missing price)  │
│                                        │
│  [Publish Draft]  [Save as Draft]     │
└────────────────────────────────────────┘
```

**Each card contains:**
- Left side: Photo thumbnail (100×100px or responsive)
- Right side (scrollable vertically):
  - Title (editable inline on tap)
  - Category (editable)
  - Condition (editable)
  - Price (editable, with $ prefix)
  - Description (editable, show first 80 chars + "…read more")
- Buttons:
  - `[Edit]`: Opens full form for this item (modal or new page)
  - `[Remove]`: Delete item from batch
  - `[Retake Photo]` (if needed): Replace photo

**Warnings/flags:**
- Price missing: ⚠ icon next to price field
- Blurry photo or low AI confidence: ⚠ icon on photo
- Category missing: ⚠ icon next to category

**Count summary:**
- Top: "5 photos captured · X complete · Y need review"
- Bottom: "⚠ Y items incomplete (missing: [fields])"
- Only shows if there are incomplete items

---

### 5.3 Edit from Review

**Organizer taps "Edit" on a card:**

**Modal form (same form as section 4.3, Regular Mode):**
- Photo gallery (thumbnails of all photos for this item)
- Editable fields: title, category, condition, price, description, shipping
- Save button: "Save changes"
- Cancel button: "Discard changes"

**On save:**
- Modal closes
- Card updates with new values
- If organizer added a price, warning icon disappears

---

### 5.4 Publish vs. Save as Draft

**"Publish Draft" button:**
- Tapping shows confirmation: "Ready to list these 5 items?"
- On confirm:
  - All items marked as "LISTED" status in database
  - Photos uploaded to Cloudinary (if not already)
  - Confirmation toast: "✓ 5 items published"
  - Redirect to sale page
  - Items now appear in shopper browse view

**"Save as Draft" button:**
- Saves all items with status "DRAFT"
- Items not visible to shoppers yet
- Organizer can return later and continue editing or publishing
- Confirmation toast: "✓ 5 items saved as draft"
- Redirect to sale page

---

## 6. Mode Switching & State Management

### 6.1 Switching Rapidfire → Regular

**Organizer taps "Regular" while in Rapidfire:**

**UI change:** Mode toggle switches, carousel collapses (hide temporarily)

**Carousel state:**
- Photos remain in Rapidfire carousel (carousel is mode-specific, not shared)
- User can tap "Review" to review Rapidfire photos separately
- Regular mode carousel is empty (fresh start for this mode)

**Organizer can:**
- Capture photos in Regular mode (different carousel)
- Both photo sets coexist in browser state
- Tap "Review & Publish" to see both batches together, OR
- Review/publish Rapidfire first, then switch to Regular

---

### 6.2 Switching Regular → Rapidfire

**Organizer taps "Rapidfire" while in Regular:**

**UI change:** Mode toggle switches, carousel expands

**Form state:** If organizer had unsaved form data in Regular mode:
- Toast warning: "You have unsaved item. Save or discard?"
- Buttons: "Save" | "Discard" | "Cancel"
- If "Cancel": stay in Regular mode
- If "Discard": clear form, switch to Rapidfire
- If "Save": save item, switch to Rapidfire

**Rapidfire carousel:** Persists across mode switches, visible immediately

---

### 6.3 Browser State & Persistence

**IndexedDB structure:**
```
DB: "findasale-camera"
  Store: "rapidfire-batch-{saleId}"
    - photos: array of {id, blob, status, aiTags}
    - timestamp
  Store: "regular-batch-{saleId}"
    - photos: array of {id, blob, status, aiTags}
    - formData: {title, cat, price, ...}
    - timestamp
```

**On page reload:**
- Camera state is restored from IndexedDB
- Organizer sees carousel with all previously captured photos
- Upload queue is re-initialized
- Photos with status "uploading" or "analyzing" are requeued

**Session timeout:**
- If organizer leaves page for >30 minutes, IndexedDB cache is preserved
- Photos are not deleted until organizer explicitly removes them or publishes
- This enables capture sessions that span multiple hours

---

## 7. Edge Cases & Error Handling

### 7.1 Photo Upload Fails

**Scenario:** Upload to Cloudinary fails (network error, quota, etc.)

**Carousel state:**
- Thumbnail shows `[!]` error badge (red)
- Tooltip: "Upload failed. Retry?"
- Tap thumbnail → preview modal shows error detail

**Organizer options:**
- Tap "Retry": attempts upload again
- Tap "Delete": removes photo
- Continue: leave error photo, keep capturing (it's still in local cache)

**Auto-retry logic:**
- Automatic retry after 10s, then 30s, then 60s
- If 3 retries fail, flag for manual review
- Organizer notified in review screen

---

### 7.2 AI Analysis Timeout

**Scenario:** Claude Haiku takes >30s or returns error

**Carousel state:**
- Thumbnail stuck on `[◐]` (analyzing) or shows `[⚠]` (error)

**Timeout logic:**
- After 30s, attempt retry (Claude is resilient, but rare hangs happen)
- After 60s total, flag as "manual review needed"
- Thumbnail shows yellow warning `[⚠]`

**Organizer impact:**
- Can still capture more photos (doesn't block)
- Error photos appear in review screen with yellow flag
- Can retake or delete from review screen

---

### 7.3 User Closes Camera Mid-Session (Rapidfire)

**Scenario:** Organizer navigates away or closes browser tab

**Browser:OnBeforeUnload:**
- Toast warning: "You have 7 photos not yet reviewed. Leave anyway?"
- Buttons: "Save draft" | "Leave"
- If "Save draft": photos saved to IndexedDB, organizer can return later
- If "Leave": photos are lost (consider showing count to warn organizer)

**If organizer clicks "Save draft":**
- All carousel photos saved with status "DRAFT"
- Redirect to sale page
- Organizer can return to camera later and pick up where they left off

---

### 7.4 Carousel Full / Memory Limit

**Scenario:** Organizer captures 500+ photos (extreme, but possible)

**Browser memory:**
- Each photo blob: ~2–5MB in memory (reduced after upload)
- After upload to Cloudinary, local blob is freed → carousel keeps only JPEG thumbnails (~50KB each)
- Practical limit: ~1000 photos before browser memory is taxed

**Carousel behavior:**
- Continues to work normally (scrolling is smooth)
- Older photos scroll out of view but remain in IndexedDB
- Count label shows accurate total

**On review:**
- Review screen is paginated if 100+ items
- "Show more" button loads next 20 items
- Prevents long list render times

---

### 7.5 AI Generates Incorrect / Offensive Tags

**Scenario:** Claude returns inappropriate category or description

**Organizer action:**
- Tap thumbnail → preview modal → edit field
- Clear AI suggestion and type correct value
- This happens in-session or at review time

**No moderation step:** Trust organizer to review and correct before publishing. Add moderation review layer in future (out of scope for Rapidfire v1).

---

### 7.6 User Loses Network Mid-Session

**Scenario:** Organizer is capturing photos but internet drops

**Behavior:**
- Photos continue to be captured to local camera
- UI shows: "Offline" indicator in top bar
- Upload queue is paused
- Toast: "No connection. Photos saved locally. Reconnect to upload."

**Recovery:**
- When network returns:
  - Toast: "Connection restored. Uploading photos…"
  - Upload queue resumes
  - Carousel updates as uploads complete

---

## 8. Accessibility Checkpoint

### 8.1 Mobile Device Accessibility

**Touch targets:**
- All buttons: minimum 44×44px tap area
- Mode toggle: 44px tall, ~50px wide each button
- Capture button: 60px diameter (exceeds minimum)
- Carousel thumbnails: 70×70px (exceeds minimum)
- All icons have text labels or aria-label

**Color contrast:**
- Active mode button (amber-600 on white): WCAG AA ✓
- Status badges (green checkmark on gray thumbnail): WCAG AA ✓
- Warning icon (orange on white): WCAG AA ✓
- All text body: gray-700 on white: WCAG AA ✓

**Keyboard navigation:**
- Tab order: Back → Mode toggle → Help → Torch → Capture button → Carousel
- Enter key activates buttons (standard HTML)
- Escape closes modals (preview, edit, delete confirmation)
- No keyboard-only shortcuts needed (mobile context)

**Screen reader support:**
- Carousel thumbnails: `aria-label="Item 1, Chair, AI analysis complete, tap to preview"`
- Status badges: `aria-label="AI analyzing, about 3 seconds remaining"`
- Capture button: `aria-label="Take photo, activates camera"` (if camera available)
- Mode toggle: `aria-label="Switch to Regular mode, currently in Rapidfire"`

### 8.2 Organizer Accessibility

**Age/hand strength:** Estate sale organizers are often 50+. Considerations:
- Large touch targets (44px minimum, capture button 60px)
- No small text (minimum 12px body, 14px for important labels)
- High contrast colors (amber backgrounds, gray text)
- Haptic feedback: camera shutter vibration (100ms, iOS/Android standard)
- No hover-only interactions (all info available without hover)

**One-handed use:**
- Capture button centered and reachable with thumb
- Mode toggle on right side (accessible with right-hand thumb while holding phone)
- Back button on left (less critical, not used often during capture)
- Carousel scroll is horizontal, requires one-handed swipe (natural mobile gesture)

---

## 9. Mobile Considerations

### 9.1 Viewport & Orientation

**Portrait (primary):**
- Viewfinder: 100% width, 50–70% height (adjustable based on carousel state)
- Capture button: 60px, centered
- Carousel: 80–100px height, horizontal scroll
- All text: readable at 12–16px

**Landscape (secondary):**
- Viewfinder scales to 100% width
- Capture button rotates below viewfinder or on side
- Carousel may collapse to save space
- Camera feed maintains aspect ratio (no letterboxing)

**Responsive breakpoints:**
- 375px (iPhone SE): compact layout, small carousel
- 428px (iPhone 14): full layout with expanded carousel option
- 600px+ (iPad/tablet): layout adapts, 2-column possible (future)

### 9.2 Bandwidth

**Photo upload optimization:**
- Camera produces JPEG, ~3–5MB per photo
- Client-side resize before upload:
  - Max width 1600px (preserves detail for AI analysis)
  - JPEG quality 0.8 → ~1–2MB per photo
  - Saves ~50% bandwidth
- Cloudinary handles final optimization (thumbnails, responsive sizing)

**AI analysis:**
- Google Vision API: ~200KB per request
- Claude Haiku: ~500KB per request (includes image embedding)
- Total: ~700KB per photo analysis
- ~200–400KB typical response size

**Data usage estimate:**
- 10 photos: ~20MB upload + ~7MB AI analysis = ~27MB total
- Organizer on mobile data should be OK, but large sessions (100+ photos) may warrant WiFi

### 9.3 Battery & Performance

**Camera drain:**
- Continuous camera feed: ~50% of normal CPU usage
- Typical session: 30 min = ~15% battery drain (varies by device)
- No background processing in this design (Rapidfire AI runs on backend, not client)

**Frame rate:**
- Camera preview: 30 FPS (standard iOS/Android)
- Carousel scroll: 60 FPS (uses native scrolling)
- No custom animations that spike CPU

---

## 10. Dev Handoff Notes

### 10.1 New Components to Create

**`CameraView.tsx`** (main container)
- Props: `{saleId, mode}` ('rapidfire' | 'regular')
- Manages camera feed, capture button, mode toggle, carousel, form
- Uses `useCamera` hook for camera state
- Uses `useCarousel` hook for carousel state

**`ModeToggle.tsx`** (top bar mode switch)
- Props: `{mode, onModeChange, disabled?}`
- Returns: two buttons, active state highlighted

**`CaptureButton.tsx`** (large circle button)
- Props: `{onClick, disabled?, loading?}`
- Visual: gradient, white shutter icon, haptic feedback

**`Carousel.tsx`** (horizontal thumbnail list)
- Props: `{photos, onTap, onDelete, mode, expanded}`
- Photo item: thumbnail + status badge + metadata

**`CarouselThumbnail.tsx`** (individual photo card)
- Props: `{photo, status, index, onTap, onDelete}`
- Status badges: ✓ (done), ◐ (analyzing), 📷 (uploading), ⚠ (error)

**`PreviewModal.tsx`** (tap thumbnail to see large view)
- Props: `{photo, aiTags, onClose, onEdit}`
- Modal overlay with photo + editable AI fields

**`ReviewScreen.tsx`** (post-session review & publish)
- Props: `{items, saleId, onPublish, onSaveAsDraft}`
- Card per item: photo + editable fields + edit/remove buttons
- Bottom buttons: Publish, Save as Draft

**`FormEdit.tsx`** (regular mode form entry)
- Props: `{photos, aiTags, onSave, onCancel}`
- Title, Category, Condition, Price, Description fields
- Photo gallery at top

### 10.2 State Management

**Local state (Rapidfire mode):**
- `photos`: array of {id, blob, cloudinaryUrl, status, aiTags}
- `carousel`: {expanded, pausedAI, filteredPhotos}
- `uploadQueue`: array of jobs
- `aiQueue`: array of jobs

**Local state (Regular mode):**
- `photos`: array of {id, blob, ...}
- `formData`: {title, category, condition, price, description}
- `isEditingForm`: boolean

**Backend state:**
- Items in database: `POST /items/{saleId}` (creates with status DRAFT)
- Publish action: `PATCH /items/{saleId}/publish` (marks LISTED)

### 10.3 API Endpoints Required

**Upload photo to Cloudinary:**
- Already exists: `POST /upload` → returns {cloudinaryUrl, publicId}

**Analyze photo (AI tagging):**
- Existing: `POST /ai/analyze` → returns {title, category, condition, description, confidence}
- Must be async / webhook-based to support non-blocking Rapidfire mode
- Or: use queue service (Bull/BullMQ) with background worker

**Batch item creation:**
- Existing: `POST /items/{saleId}` (single) → should support batch
- Or: loop single creation endpoint (acceptable for now)

**Publish items:**
- Existing: `PATCH /items/{id}/status` (single)
- Consider batch endpoint if needed

### 10.4 Mobile Camera Implementation

**Use `next-camera` or `react-use-camera`:**
- Opens device camera in browser
- Returns video stream
- Capture button reads frame and converts to JPEG blob
- Works on iOS (Safari, iOS 14+) and Android

**Alternative: HTML5 Canvas + getUserMedia:**
- More control, but more code
- Recommended if next-camera doesn't support needed features

**Fallback (no camera):**
- Show file upload input: "Camera not available. Upload photo instead."
- Same flow, but organizer selects from device gallery

### 10.5 IndexedDB for Persistence

**Schema:**
```javascript
{
  store: "photos",
  keyPath: "id",
  indexes: ["saleId", "status", "mode", "timestamp"]
}
{
  store: "formData",
  keyPath: "id",
  indexes: ["saleId", "mode"]
}
```

**On app launch:**
- Check IndexedDB for any incomplete sessions
- If found, offer to resume: "Resume previous session? 7 photos ready."

**On successful publish:**
- Clear IndexedDB for that saleId

### 10.6 Cloudinary Integration

**Existing setup:**
- Unsigned upload (client-side, no auth token needed)
- Transformations: auto-rotation, format optimization

**New requirements for Rapidfire:**
- Auto-thumbnail generation (60×60px) for carousel
- Webhook on upload success → triggers AI analysis (backend)
- Webhook on AI completion → pushes update to frontend (WebSocket or polling)

### 10.7 WebSocket / Real-Time Updates (Optional)

**If using WebSocket for AI completion notifications:**
- Server: emit event when AI analysis completes for a photo
- Client: receives event, updates carousel thumbnail immediately
- Improves UX vs. polling (faster feedback, lower battery drain)

**Alternative: Polling**
- Client: every 5s, check `/items/{saleId}/status` for photos with AI analysis complete
- Simpler to implement, slightly higher latency (< 5s)

### 10.8 Testing Checklist

**Unit:**
- `CaptureButton`: tap → calls onClick, disables during capture, re-enables after 200ms
- `Carousel`: scroll left/right, tap thumbnail → preview, delete → confirm
- Form validation: title/category/price required, price must be number

**Integration:**
- Capture 1 photo → carousel updates → preview modal works → edit field → save → form shows field
- Capture 5 photos in Regular mode → form shows all 5 in gallery → can delete individual photos
- Switch Rapidfire → Regular → both carousels persist
- Publish → items appear in database with LISTED status

**E2E (mobile device):**
- Open camera on iPhone/Android
- Capture 10 photos in Rapidfire
- All thumbnails appear in carousel
- Tap carousel → preview modal works
- Edit title in preview → carousel updates
- Switch to Regular mode → carousel empty
- Capture 3 photos in Regular mode → form shows
- Fill form → Save → item created
- Back to Rapidfire → carousel still has 10 items
- Tap "Review" → review screen shows all items
- Publish → success toast, redirect to sale page

### 10.9 Performance Budget

**Capture-to-carousel (first visual feedback):** < 300ms
**Carousel scroll:** 60 FPS (smooth scroll)
**Preview modal open:** < 200ms
**Form submission:** < 2s (POST to server)
**AI analysis (background):** 3–10s (non-blocking, acceptable)

---

## 11. Rollout & Phasing

### 11.1 Phase 1: Rapidfire Mode (v1)

**Scope:**
- Camera UI with mode toggle
- Rapidfire capture flow
- Carousel with status badges
- Thumbnail preview modal
- IndexedDB persistence
- Basic error handling (upload fail, AI fail)

**Acceptance criteria:**
- Organizer can capture 10 photos in < 30 seconds with zero wait states
- All carousel photos load AI tags before organizer reaches review
- Publish creates items in database with LISTED status
- Photos visible to shoppers immediately after publish

**Timeline:** 2–3 weeks (dev + QA)

### 11.2 Phase 2: Regular Mode (v1.1)

**Scope:**
- Enhanced Regular mode with form entry
- Multi-photo carousel in form view
- Edit form, save item individually
- Switch between Rapidfire & Regular

**Acceptance criteria:**
- Organizer can capture 5 photos, edit form, save item
- Switching modes preserves carousel state
- Form submission creates item with all fields

**Timeline:** 1–2 weeks (dev + QA)

### 11.3 Phase 3: Review & Publish (v1.2)

**Scope:**
- Post-session review screen with all captured items
- Batch publish or save as draft
- Edit individual items from review
- Error flagging (incomplete items, AI failures)

**Acceptance criteria:**
- Review screen shows all items with AI tags and warnings
- Organizer can edit items from review screen
- Publish marks all items LISTED; Save as Draft keeps DRAFT status

**Timeline:** 1 week (dev + QA)

### 11.4 Phase 4: Mobile Optimization (v2)

**Scope:**
- Landscape mode support
- Offline photo capture (queued for upload when online)
- Battery optimization (camera frame rate throttling)
- Bandwidth optimization (client-side photo resize)

**Timeline:** Post-launch (based on usage data)

---

## 12. Success Metrics

**Speed metric:**
- Time from entry to first 5 items published: target 5 minutes (vs. 15 minutes with Manual Entry)

**Organizer satisfaction:**
- NPS question: "How easy was it to capture items in Rapidfire mode?" (target: 8+/10)
- Survey: "Did you trust the AI tags?" (target: 80% yes)

**Data quality:**
- AI tag accuracy (title, category): target 85%+
- Photos that require manual editing after AI: target < 20%

**Adoption:**
- % of organizers using Rapidfire vs. Regular: target 60% Rapidfire for first capture sessions
- Session duration: organizers should spend < 5 min per 10 items in Rapidfire

---

## 13. Specification Sign-Off

**Author:** UX Designer
**Review:** Product (Patrick), Dev (Backend + Frontend leads)
**Status:** Design complete, ready for dev intake
**Last Updated:** March 10, 2026

**Outstanding decisions (for Patrick/Product):**
1. Should Regular mode photos be shareable carousel between Rapidfire and Regular, or separate carousels? (Spec assumes separate)
2. Should price be set in carousel preview (Rapidfire) or deferred to form/review? (Spec assumes deferred to review)
3. Should organizer be able to retake a photo from carousel, or only delete and recapture? (Spec allows retake)
4. Offline photo capture: should it be Phase 1 or Phase 4? (Spec assumes Phase 4)

**Ready for:** Frontend engineer assignment + design review + backend API sync

---

## Appendix A: Wireframe Reference

*(Include SVG or Figma link here — ASCII above is reference only)*

---

## Appendix B: Copy / Microcopy

**Mode toggle hint (first time in Rapidfire):**
"👉 Tap to capture. Photos appear below. Switch to Regular mode for multi-photo items."

**Carousel count (Rapidfire):**
- 0 photos: "Ready to capture"
- 1 photo: "1 photo captured"
- 5 photos: "5 photos captured · 4 ready · 1 analyzing…"

**Help modal (Rapidfire):**
**Title:** "Rapidfire Mode"
**Body:** "Take one photo per item. We'll add tags in the background while you keep going. Photos appear below as they're analyzed. Switch to Regular mode if you need multiple photos for one item."

**Help modal (Regular):**
**Title:** "Regular Mode"
**Body:** "Take up to 5 photos of each item. When you're done, we'll fill in details for you to review and edit. More control, more time per item."

**Error state (upload failed):**
"Upload failed. [Retry] or [Delete]"

**Error state (AI failed):**
"AI couldn't analyze this photo. [Retry] or [Retake]"

**Publish confirmation:**
"Ready to list these 5 items? Shoppers will see them immediately after you publish."

**Save as draft confirmation:**
"Saved. You can edit or publish these items later from your sale dashboard."

---

## Appendix C: Accessibility Audit

**WCAG 2.1 Level AA compliance:**
- ✓ Color contrast all text 4.5:1+
- ✓ Touch targets all 44px+ (except decorative icons)
- ✓ Keyboard navigation supported (Tab, Enter, Escape)
- ✓ Screen reader labels on all interactive elements
- ✓ No time-dependent interactions (carousel doesn't auto-hide)
- ✓ No seizure-risk animations (none > 3/sec)

**Mobile accessibility:**
- ✓ One-handed use: capture button reachable from thumb
- ✓ Large text: all body 12px+, labels 14px+
- ✓ Clear iconography: symbols have text labels or aria-label
- ✓ Haptic feedback: camera shutter vibration (optional, can be disabled)

---

## Appendix D: Security & Privacy

**Photo handling:**
- Photos stored in browser IndexedDB until published
- Published photos uploaded to Cloudinary (encrypted in transit via HTTPS)
- Cloudinary URLs follow FindA.Sale security policy (no public access without sale link)
- Photos deleted from IndexedDB after successful upload

**AI analysis:**
- Photo URLs sent to Claude Haiku (via API, encrypted)
- No storing of photos on Claude servers (prompt, not file upload)
- AI results (title, category, etc.) stored in browser IndexedDB and database only

**Organizer PII:**
- Carousel doesn't capture organizer name, location, contact info
- Sale context is inferred from URL parameter (saleId)
- No tracking of individual photos or organizer behavior

---

END SPECIFICATION
