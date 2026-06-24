# Audio Notes Feature — UX Specification & Placement Audit

**Session:** S677  
**Feature:** Voice-to-Tag (Feature #42, #331)  
**Status:** Current placement is confusing; proposal follows.

---

## Executive Summary

**Current State:** Two separate voice features exist:
1. **VoiceTagButton** — Extracts item metadata (name, tags, category, price) from speech transcription using keyword extraction
2. **VoiceTagButtonThumbnail** — In RapidCapture (rapidfire mode only), captures a voice note as the item description

**Current Placement Issue:**  
The VoiceTagButton is surfaced on the edit-item page **next to the tags input field**, making it appear to be just another tag addition mechanism. Organizers don't understand that it actually extracts multiple fields (name, category, price) from a single voice transcript.

**The Real Problem:**  
The feature conflates two different jobs-to-be-done:
1. **Rapid item capture** (photograph + audio description) — needs voice button in camera flow
2. **Metadata extraction** (convert speech to structured data) — needs voice button in detail review, not tag entry

**Recommendation:**  
1. Keep VoiceTagButtonThumbnail in RapidCapture (it works well — organizer records description while capturing photos)
2. Remove the VoiceTagButton from edit-item tags area (confusing placement)
3. Add explicit **description input area** on edit-item that surfaces voice-to-description option
4. Make voice transcription the **primary description input method**, not a secondary button

---

## What the Feature Does (Factual)

### VoiceTagButton Component
- Records voice input via Web Speech API (browser-native, no server-side recording)
- Sends transcript to backend `/api/voice/extract` endpoint
- Backend performs keyword-based extraction (no AI model):
  - **Item name** — first noun phrase from transcript
  - **Category** — keyword match against furniture, jewelry, art, clothing, etc.
  - **Tags** — matches curated vocabulary (mid-century-modern, walnut, victorian, etc.)
  - **Estimated price** — heuristic based on category + premium/condition keywords
- Returns structured data; component callback with extraction result
- State indicators: blue (idle) → red pulsing (listening) → amber (processing)
- Browser support: Chrome, Edge, Safari (iOS 14.5+); graceful fallback for unsupported browsers

### VoiceTagButtonThumbnail Component
- Lightweight inline mic button for each item thumbnail in RapidCapture (rapidfire mode only)
- Records voice and immediately sends as item **description** (not metadata extraction)
- Uses PATCH `/api/items/:id` with `description: transcript` 
- Shows success indicator (✓) on thumbnail for 2 seconds
- State: blue (idle) → red pulsing (listening) → amber (processing)

---

## Current Placement (Factual)

### Edit-Item Page (`/organizer/edit-item/[id].tsx`)
**Location:** Tags input section, line 593  
**Context:** Form row with tags input field + VoiceTagButton next to it  
**Current behavior:**
```tsx
<div className="flex gap-2">
  <input 
    placeholder="Add tags..."
    onKeyDown={(e) => {
      if (e.key === 'Enter') {
        // Add single tag
        setFormData({ tags: [...formData.tags, inputValue] });
      }
    }}
  />
  <VoiceTagButton
    onExtraction={(result) => {
      // Append extracted tags only
      const newTags = result.tags.filter(tag => !formData.tags.includes(tag));
      setFormData({ tags: [...formData.tags, ...newTags] });
    }}
  />
</div>
```

**Problem:** The button is positioned as if it only extracts tags, but it actually extracts name, category, and price. Those fields are completely ignored. The callback only uses `result.tags`.

### RapidCapture Component (`/components/RapidCapture.tsx`)
**Location:** Bottom-left corner of each item thumbnail in carousel (rapidfire mode only)  
**Context:** Thumbnail carousel of captured items in rapid-fire photo mode  
**Current behavior:** mic button sends voice transcript directly as item description via PATCH  
**Status:** This placement works well. Organizers are in rapid-photo mode, grab a mic moment to describe each item, move on.

---

## Problem Statement

### Issue 1: Wasted Extraction Data
VoiceTagButton extracts:
- `name` — **not used** in edit-item
- `category` — **not used** in edit-item
- `tags` — partially used (only these are appended)
- `estimatedPrice` — **not used** in edit-item

Organizer speaks "Victorian mahogany dresser, excellent condition, 1920s" → Backend extracts name="Victorian mahogany dresser", category="Furniture", tags=["victorian", "walnut"], price=120 → Only tags are applied, name/category/price discarded.

### Issue 2: Button Placement is Semantically Wrong
The button sits **in the tags input area**, teaching organizers it's a "tag macro" tool, not a "describe the item" tool.

### Issue 3: No Description Input Integration
Edit-item page has:
- Title input ✓
- Price input ✓
- Category picker ✓
- Tags input + voice button (confusing)
- **Description input — currently just a plain textarea, no voice option**

The description field is where organizers naturally want to speak notes. The voice button should be there, not in tags.

### Issue 4: RapidCapture Success but Inconsistent
RapidCapture's voice-to-description works great in rapidfire mode. But there's no equivalent on edit-item for organizers who want to add or revise a description via voice.

---

## Job to Be Done

### Primary Job
**In 30–60 seconds, an organizer is trying to:**  
Move from photographing an item to reviewing/publishing it, and they want to capture a spoken description (3–10 seconds of voice) that becomes the item's detail text.

**Secondary Job**  
Populate metadata fields (name, category, estimated price) while describing the item, without having to type each field separately.

### Minimum Controls Needed
1. **Voice-to-description button** — starts/stops recording
2. **Live feedback** — "Listening..." state, transcript preview
3. **Confirmation** — "Save as description" with option to edit/re-record
4. **Fallback** — manual description typing if voice fails or organizer prefers typing

### What Currently Stops Them
1. No voice option on the description field (only manual typing)
2. If they use the tags voice button, they get metadata extraction but their description is ignored
3. No visual affordance that voice can become description, not just tags
4. Confusing choice: do I use the tags voice button, or type description, or both?

---

## Data Preflight

| Field | Source | Status | Notes |
|-------|--------|--------|-------|
| `transcript` | Web Speech API (browser) | ✓ Working | Accumulated from `onresult` events |
| `description` | PATCH `/api/items/:id` | ✓ Working | Items table has `description` field |
| `name` | Voice extraction backend | ✓ Extracted but unused | Backend can populate; edit-item doesn't accept it |
| `category` | Voice extraction backend | ✓ Extracted but unused | eBayCategory picker handles this; voice extraction is ignored |
| `tags` | Voice extraction backend | ✓ Extracted, partially used | Only tags are applied; name/category/price ignored |
| `estimatedPrice` | Voice extraction backend | ✓ Extracted but unused | Backend calculates; form never receives it |
| Item schema fields | Prisma schema.prisma | ✓ All present | `description`, `title`, `category`, `tags`, `price` all exist |
| Microphone permission | Browser API | ✓ Works | Standard permission flow, stored by browser per site |

---

## Recommended Placement & Architecture

### Primary Flow: Voice-to-Description (Edit-Item Page)

**Where:** Description input area (new dedicated section)

**Layout:**
```
┌─────────────────────────────────────────┐
│ Item Description                        │
├─────────────────────────────────────────┤
│ [Mic Button] Record Description         │
│                                         │
│ Listening... (preview: "Victorian...")  │
│                                         │
│ [Use This] [Retake] [Edit Manually]    │
│                                         │
│ ─────────────────────────────────────── │
│ OR type description:                    │
│ [Textarea: "Victorian mahogany..."]     │
│                                         │
│ Transcript: "1920s mahogany dresser..." │
└─────────────────────────────────────────┘
```

**UX Flow:**
1. Organizer taps [Mic Button] or [Record Description]
2. Browser requests microphone permission (once per session)
3. User speaks for up to 30 seconds: "Victorian mahogany dresser, six drawers, brass pulls, excellent condition, 1920s"
4. Real-time transcript preview appears below button
5. When organizer taps mic again or 30 seconds elapses, recording stops
6. Backend processes transcript via `/api/voice/extract` endpoint
7. Three options appear:
   - **[Use This]** — Accept extracted description, populate title/category/tags/price if they're empty
   - **[Retake]** — Delete transcript, restart recording
   - **[Edit Manually]** — Keep transcript, open textarea for manual refinement before saving
8. Selection saves the description and metadata updates

### Secondary Flow: RapidCapture (Keep Existing)

**Status:** VoiceTagButtonThumbnail is already well-placed.

**Keep as-is:**  
Rapidfire mode mic button on item thumbnails → voice transcription becomes description via PATCH → success indicator.

**Improvement:** Add optional tooltip on first use: "Tap mic to describe this item"

---

## Happy Path (Scenario 1: New Organizer, Using Voice Description)

1. Organizer photographs a Victorian dresser (RapidCapture, rapidfire mode)
2. After first photo, VoiceTagButtonThumbnail appears on thumbnail
3. Organizer taps mic, says: "Victorian mahogany dresser, six drawers, brass pulls, excellent condition, 1920s"
4. Browser shows live transcript: "Victorian mahogany dresser, six drawers..."
5. Organizer finishes speaking, taps mic again to stop
6. Backend extracts: name="Victorian mahogany dresser", category="Furniture", tags=["victorian", "walnut"], price=120
7. Success checkmark (✓) appears on thumbnail for 2 seconds
8. Photo and description are linked; item is ready for review
9. Organizer navigates to edit-item page to refine
10. Description area shows: "Victorian mahogany dresser, six drawers, brass pulls, excellent condition, 1920s"
11. If needed, organizer taps [Retake] or [Edit Manually] to adjust
12. Title is auto-filled with extracted name, category is set, tags auto-selected, price is suggested
13. Organizer reviews, adjusts price if needed, publishes

---

## Happy Path (Scenario 2: Edit-Item Refinement, Voice Description)

1. Organizer opens edit-item page for a saved draft item
2. Description area is empty (item has no description yet)
3. Organizer taps [Record Description]
4. Microphone starts listening
5. Organizer speaks: "Art deco wall mirror, chrome frame, 24 by 36 inches, excellent condition, signed artist"
6. Real-time transcript: "Art deco wall mirror, chrome frame..."
7. Organizer finishes, taps mic to stop
8. Options appear:
   - **[Use This]** — Extract all fields, populate empty title/category/tags/price fields
   - **[Retake]** — New recording
   - **[Edit Manually]** — Refine text before saving
9. Organizer chooses [Use This]
10. Description saves: "Art deco wall mirror, chrome frame, 24 by 36 inches, excellent condition, signed artist"
11. Title auto-populates: "Art deco wall mirror"
12. Category auto-sets: "Art & Decor"
13. Tags auto-select: ["art-deco", "chrome", "signed"]
14. Price auto-estimates: $85 (art-deco + signed multiplier)
15. Organizer verifies all fields, publishes

---

## Edge Cases

### No Microphone Permission
**Trigger:** User denies microphone access on first tap  
**Behavior:** Toast notification: "Microphone permission required. Enable in Settings → Site Permissions → Microphone"  
**Fallback:** Offer manual text input only

### Recording Too Short (<1 Second)
**Trigger:** User taps mic, immediately taps to stop  
**Behavior:** Toast: "Please speak for at least 1 second. Try again."  
**Action:** Transcript discarded, recording state resets to idle

### Recording Too Long (>30 Seconds)
**Trigger:** User holds mic open past timeout  
**Behavior:** Auto-stop recording after 30 seconds  
**Toast:** "Recording stopped at 30 seconds"  
**Show:** Options to use, retake, or edit

### Transcription Fails (Empty/Inaudible)
**Trigger:** Backend receives empty or unparseable transcript  
**Behavior:** Backend returns 400 error  
**Frontend toast:** "Couldn't understand. Please try again with clear speech."  
**Fallback:** Show [Retake] and [Type Manually] options

### Extraction Fails (No Extractable Data)
**Trigger:** Speech is transcribed but doesn't match any keywords (e.g., random words with no item context)  
**Behavior:** Backend extracts what it can; name extraction fails  
**Frontend toast:** "Couldn't extract item info. Please type a description manually."  
**Fallback:** Transcript saved; organizer must manually edit description field

### Browser Doesn't Support Web Speech API
**Trigger:** Firefox, older Safari, non-Chrome browsers  
**Behavior:** Mic button is hidden (or visibly disabled with tooltip)  
**Toast (on tap):** "Voice input requires Chrome, Edge, or Safari"  
**Fallback:** Manual text input only

### Organizer Changes Mind (Retake)
**Trigger:** User taps [Retake] instead of [Use This]  
**Behavior:** Transcript deleted, recording state resets to idle  
**Prompt:** "Recording cleared. Ready to record again."

### Organizer Wants to Edit (Manual Edit)
**Trigger:** User taps [Edit Manually]  
**Behavior:** Transcript remains, textarea opens below with transcript text  
**User can:** Revise wording, add details, delete parts  
**Save:** Organizer taps [Save] to apply edited version to description field

### Organizer Loses Network Mid-Recording
**Trigger:** Recording completes, but API call to extract fails (network error)  
**Behavior:** Frontend shows: "Couldn't reach server. Please check your connection and try again."  
**State:** Transcript is preserved in memory (not lost)  
**Action:** Organizer can [Retry] or [Type Manually] to save transcript as-is

### Rapid Successive Recordings
**Trigger:** Organizer records, taps [Retake], records again  
**Behavior:** Each recording replaces the previous one in state  
**Safeguard:** Only the last completed recording is submitted to backend

### Same Item, Multiple Voice Attempts
**Trigger:** Organizer records description, uses it, later decides to re-record  
**Behavior:** [Retake] clears the saved description and resets to idle  
**Safeguard:** Item description is not updated until [Use This] is tapped

---

## Copy (UX Text & Labels)

### Button Labels
- **Primary:** "Record Description" (or just mic icon with tooltip)
- **State: Listening:** "Stop Recording" (or "Recording..." with pulsing indicator)
- **State: Processing:** "Processing..." (spinner)

### Prompts & Hints
- **Before recording:** "Speak a description of the item. We'll extract title, category, and price from your words."
- **During recording:** "Listening... speak naturally"
- **Live preview:** (Show transcript text as organizer speaks)
- **After recording:** (Show three buttons: Use This | Retake | Edit Manually)

### Toast Messages
- **Success:** "Description saved. Title, category, and tags auto-populated."
- **Error: No input:** "No speech detected. Please try again."
- **Error: Extraction failed:** "Couldn't extract item info. Please type a description manually."
- **Error: Permission denied:** "Microphone permission required. Enable in Settings → Site Permissions → Microphone."
- **Error: No API:** "Couldn't reach server. Please check your connection."
- **Info: Browser unsupported:** "Voice input requires Chrome, Edge, or Safari."
- **Info: Recording stopped:** "Recording stopped at 30 seconds."

### Accessibility (aria-labels & titles)
- Mic button: "Start recording description" or "Stop recording description" (dynamic based on state)
- [Use This]: "Save transcription as description"
- [Retake]: "Delete transcription and record again"
- [Edit Manually]: "Refine transcription before saving"

### Mobile Considerations
- **Button size:** 48px × 48px minimum (thumb-friendly)
- **Text display:** Transcript preview must fit on narrow screens (max 80 chars per line, wrap)
- **Option buttons:** Vertical stack on mobile (<sm breakpoint), horizontal on desktop (md+)
- **Keyboard:** Auto-dismiss mobile keyboard after recording stops (so organizer can tap options)
- **Safe area:** Mic button respects safe area inset on notched devices (top-right or bottom-right placement)

---

## Implementation Notes for Dev

### Step 1: Create Voice-to-Description Hook (`useVoiceDescription.ts`)
New hook combining `useVoiceInput` + voice extraction logic:
```typescript
// packages/frontend/hooks/useVoiceDescription.ts
interface UseVoiceDescriptionReturn {
  isSupported: boolean;
  isListening: boolean;
  isProcessing: boolean;
  transcript: string;
  extractedData: VoiceExtractionResult | null;
  error: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  submitTranscript: () => Promise<void>;
  clearTranscript: () => void;
  clearError: () => void;
}
```

Responsibilities:
- Manage recording state (idle → listening → processing)
- Accumulate transcript from Web Speech API
- Call `/api/voice/extract` on stop
- Return extracted data (name, category, tags, price) to parent
- Error handling (no microphone, no speech, API failure)

### Step 2: Create VoiceDescriptionInput Component
New component for edit-item description area:
```typescript
// packages/frontend/components/VoiceDescriptionInput.tsx
interface VoiceDescriptionInputProps {
  value: string; // Current description text
  onChange: (text: string) => void; // Called when description changes
  onMetadataExtract?: (metadata: VoiceExtractionResult) => void; // Called when voice extraction succeeds
  disabled?: boolean;
}
```

Responsibilities:
- Render mic button + recording state UI
- Show live transcript preview
- Render [Use This], [Retake], [Edit Manually] options
- Call `onChange` when user confirms description
- Call `onMetadataExtract` callback with extracted name/category/tags/price

### Step 3: Integrate into Edit-Item Page
Edit `/organizer/edit-item/[id].tsx`:

**Remove:**
- VoiceTagButton import (line 33)
- VoiceTagButton JSX in tags section (lines 593–602)

**Add:**
- Import VoiceDescriptionInput
- New form section for description (before tags section):
```tsx
<section className="mb-6">
  <label className="block text-sm font-semibold mb-2">Description</label>
  <VoiceDescriptionInput
    value={formData.description}
    onChange={(text) => setFormData({ ...formData, description: text })}
    onMetadataExtract={(metadata) => {
      // Auto-populate empty fields from extraction
      const updates: any = {};
      if (!formData.title && metadata.name) updates.title = metadata.name;
      if (!formData.category && metadata.category) updates.category = metadata.category;
      if (!formData.price && metadata.estimatedPrice) updates.price = String(metadata.estimatedPrice);
      
      // Merge new tags with existing, avoiding duplicates
      if (metadata.tags && metadata.tags.length > 0) {
        const newTags = metadata.tags.filter(tag => !formData.tags.includes(tag));
        updates.tags = [...formData.tags, ...newTags];
      }
      
      setFormData({ ...formData, ...updates });
    }}
  />
</section>
```

### Step 4: Update Schema/API (If Needed)
**Check:** Does `/api/voice/extract` endpoint need auth?  
Current code has no auth. If items are user-scoped, add auth check:
```typescript
// voiceController.ts
export const voiceExtract = async (req: Request, res: Response) => {
  const { user } = req; // From auth middleware
  if (!user) return res.status(401).json({ message: 'Unauthorized' });
  // ... rest of extraction logic
};
```

### Step 5: Test Matrix
- [ ] Recording + extraction on desktop (Chrome, Edge, Safari)
- [ ] Recording + extraction on mobile (iOS Safari, Android Chrome)
- [ ] Microphone permission flow (first use, repeat use, denied)
- [ ] No speech detection (<1 second)
- [ ] Long speech (30+ seconds auto-stop)
- [ ] Extraction success (extracts name, category, tags, price)
- [ ] Extraction partial failure (no name detected)
- [ ] API failure during extraction (network error, server error)
- [ ] Browser without Web Speech API (graceful fallback)
- [ ] [Use This] populates form fields correctly
- [ ] [Retake] clears transcript and resets UI
- [ ] [Edit Manually] opens textarea with transcript
- [ ] Manual description edit before save
- [ ] RapidCapture VoiceTagButtonThumbnail still works (regression test)
- [ ] Edit-item page loads without VoiceTagButton crash (removed component)

### Step 6: Files to Change
- **Remove:** 
  - VoiceTagButton usage from `/organizer/edit-item/[id].tsx` (lines 33, 593–602)
  
- **Create:**
  - `packages/frontend/hooks/useVoiceDescription.ts` (new hook)
  - `packages/frontend/components/VoiceDescriptionInput.tsx` (new component)

- **Keep (No changes):**
  - `packages/frontend/hooks/useVoiceInput.ts` (used by both VoiceDescriptionInput and RapidCapture)
  - `packages/frontend/components/VoiceTagButton.tsx` (if ever needed elsewhere; not used currently)
  - `packages/frontend/components/RapidCapture.tsx` (VoiceTagButtonThumbnail is separate, not affected)
  - `packages/backend/src/controllers/voiceController.ts` (no backend changes needed)

---

## Open Questions for Patrick

1. **Metadata auto-population:** When voice extraction succeeds, should the app auto-populate empty fields (title, category, price) or show them as "suggestions" the organizer must confirm?
   - **Recommend:** Auto-populate if empty; organizer can override in form

2. **Price suggestion visibility:** Should estimated price be shown as a suggestion or silently used as form default?
   - **Recommend:** Show as "Auto-estimated: $120. Adjust if needed." in price field with edit affordance

3. **Manual fallback:** If transcription fails to extract a name, should the raw transcript be saved as-is or discarded?
   - **Recommend:** Save raw transcript; organizer can edit or type manually

4. **Recording limit:** 30 seconds feels right for a description. Confirm?
   - **Recommend:** Yes, 30 seconds aligns with organizer attention span

5. **RapidCapture voice:** Should we add voice-to-description support to **regular mode** (non-rapidfire) as well, or keep it rapidfire-only?
   - **Recommend:** Keep rapidfire-only for now; add to regular mode in Phase 2 if organizers request it

6. **Voice transcript storage:** Should we store audio recordings for quality analysis, or is transcript-only sufficient?
   - **Recommend:** Transcript-only for MVP (no storage overhead, privacy-friendly)

7. **Multi-language support:** Add language picker (English, Spanish, French) now or Phase 2?
   - **Recommend:** Phase 2; English-only for MVP

---

## Summary of Changes

| What | From | To | Impact |
|------|------|----|----|
| Voice button location (edit-item) | Tags input area | Description input area | Organizers understand voice captures description, not just tags |
| Voice flow (edit-item) | Extract name/category/price but ignore them, only use tags | Extract all fields and auto-populate empty form fields | No wasted extraction; organizers get full metadata benefit |
| Voice affordance (edit-item) | Hidden in tags section (low discoverability) | Prominent in description area with label | Higher discovery and usage |
| RapidCapture voice | Keep as-is (already works) | Add optional first-use tooltip | Slight UX polish; minimal change |
| Overall arc | Confusing (two buttons doing different things) | Clear (one voice button per job: description in edit-item, description in rapidfire) | Organizers have a single, intuitive voice entry point per context |

---

## Appendix: Feature #42 vs Feature #331 Clarity

**Feature #42 (VoiceTagButton):**
- Original voice-to-tag component
- Extracts name, category, tags, price via keyword matching
- Used on edit-item page (currently sub-optimal placement)
- Backend endpoint: `/api/voice/extract`

**Feature #331 (VoiceTagButtonThumbnail):**
- Lightweight voice-to-description for RapidCapture
- Sends raw transcript as item description (no extraction)
- Used in rapidfire mode (good placement)
- Backend endpoint: PATCH `/api/items/:id` with `description: transcript`

**Proposal:**
- Repurpose Feature #42 extraction logic for edit-item description flow (instead of just tags)
- Keep Feature #331 in RapidCapture (no changes)
- Remove VoiceTagButton from edit-item tags area
- Create new VoiceDescriptionInput component that leverages both extraction + description saving
