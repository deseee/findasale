# Review & Publish Card Layout Redesign Spec

**Author:** FindA.Sale UX Team
**Date:** April 2026
**Status:** Ready for Dev Implementation

**Problem Statement:**
The current Review & Publish page card layout packs too much information into a cramped collapsed row. On mobile (375px width), organizers cannot easily distinguish:
- Which items are ready to publish
- What's blocking items from publishing
- What actions to take next

The layout violates mobile-first principles. Organizers are using this page at the sale venue on phones, so clarity and scannability are critical.

---

## Context: Organizer Workflow

1. **Scan quickly**: Organizer opens the page and sees a list of their items from the current sale
2. **Assess readiness**: In 2–3 seconds per card, they decide "ready to go live" or "needs work"
3. **Batch publish**: Select ready items and publish them all at once
4. **Fix incomplete**: Tap into items that need work (missing photos, bad AI, incomplete details)

The card must serve this 2–3 second assessment window, not force them to read a health score number.

---

## Data Available on Each Card

From the backend (`HealthResult` + Item model):
- `title` — Item name (string)
- `photoUrls[0]` — Primary thumbnail (string)
- `price` — Listing price (float or null)
- `category` — Item category (string or null)
- `healthScore` — Object:
  - `score` (0–100)
  - `grade` ('blocked' | 'nudge' | 'clear')
  - `breakdown` — Scoring details:
    - `photo` (0–40)
    - `title` (0–20)
    - `description` (0–20)
    - `tags` (0–15)
    - `price` (0–5)
    - `conditionGrade` (0–5)
- `aiConfidence` — AI tag confidence (0–1, shown as %)
- `isAiTagged` — Whether AI generated the fields (boolean)
- `draftStatus` — 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED'

---

## Health Score Interpretation

**Grade mapping:**
- `blocked` (score < 40): Cannot publish yet. Missing critical info.
- `nudge` (40 ≤ score < 70): Can publish, but improvements suggested.
- `clear` (≥ 70): Ready to publish.

**What each breakdown component tells us about what's missing:**

| Breakdown | Max Pts | Meaning when 0 | What's Missing |
|-----------|---------|-----------------|-----------------|
| photo | 40 | 0 photos | "Add photos" |
| title | 20 | Empty or <15 chars | "Better title needed" |
| description | 20 | Missing or <50 chars | "Add description" |
| tags | 15 | 0 tags | "Add tags" (optional nudge) |
| price | 5 | No price | "Set a price" |
| conditionGrade | 5 | Not graded | "Select condition" |

**Readable status at a glance:**
- Green (clear): "Ready to publish" ✓
- Orange (nudge): "Can publish, but review first"
- Red (blocked): "Needs work before publishing" ✗

---

## New Card Layout — Mobile-First (375px width)

```
┌─────────────────────────────────────────────────────┐
│ [✓] [📷] Victorian Chair                         [▼] │  ← Header (collapsed row)
│     (16:9)  $45 · Furniture                           │
│                                                        │
│     ◉ READY TO PUBLISH                                │  ← Primary status (GREEN)
│                                                        │
│     • 4 good photos ✓                                  │  ← What's good
│     • Clear title ✓                                   │
│     • Fair condition ✓                                │
│                                                        │
│     🗑 [Edit Item]                                    │  ← Actions
├─────────────────────────────────────────────────────┤
```

### When the item needs work (NUDGE):

```
┌─────────────────────────────────────────────────────┐
│ [✓] [📷] Mahogany Table (damaged)              [▼] │  ← Header
│     (16:9)  No price · Furniture                      │
│                                                        │
│     ◉ REVIEW BEFORE PUBLISHING                        │  ← Secondary status (ORANGE)
│                                                        │
│     • 3 photos ✓                                       │  ← What's good
│     • Good title ✓                                    │
│     ✗ No description yet                              │  ← What's missing
│     ✗ Add a price                                     │
│     ○ Optional: Add condition details                 │  ← Optional improvements
│                                                        │
│     🗑 [Edit Item]                                    │  ← Actions
├─────────────────────────────────────────────────────┤
```

### When the item is blocked (BLOCKED):

```
┌─────────────────────────────────────────────────────┐
│ [ ] [📷] Lamp (unknown)                         [▼] │  ← Header (checkbox unchecked)
│     (16:9)  $20 · Electronics                         │
│                                                        │
│     ◉ CANNOT PUBLISH YET                              │  ← Status (RED)
│                                                        │
│     ✗ Add at least one photo                          │  ← Blocking items (must fix)
│     ✗ Add a title                                     │
│     • 1 tag ✓                                         │
│     ○ Add more photos (2–3 more recommended)          │  ← Nice-to-have
│                                                        │
│     🗑 [Edit Item]                                    │  ← Actions
├─────────────────────────────────────────────────────┤
```

---

## Desktop Layout (≥768px width)

On desktop, the same card expands horizontally to use more screen real estate:

```
┌──────────────────────────────────────────────────────────────┐
│ [✓] [████] Victorian Chair · Furniture       $45             │  ← Single row
│       16:9    Ready to Publish (✓)            [Edit] [🗑]    │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ [✓] [████] Mahogany Table                     No price        │  ← Same content, horizontal
│       16:9    Review Before Publishing (⚠)    [Edit] [🗑]    │
│              Add description · Set a price                     │  ← Missing items on same row
└──────────────────────────────────────────────────────────────┘
```

On desktop, the expanded panel (when [▼] is clicked) fills below the collapsed row. Same content, just stacked below.

---

## Component Breakdown: Mobile (375px)

### 1. Collapsed Row Header

**Purpose:** Organizer glances at list and makes the 2–3 second "ready or needs work" decision.

```
[Checkbox] [Thumbnail] [Item Info] [Expand/Collapse]
```

#### Checkbox (left)
- Width: 20px (hit target: 40px × 40px)
- Checked = item selected for batch publishing
- Unchecked by default
- **RULE:** If `grade === 'blocked'`, checkbox **DISABLED** (grayed out, not clickable)
  - Rationale: Cannot publish blocked items; disable the select option
  - Visual feedback: Reduced opacity, cursor: not-allowed

#### Thumbnail (20px margin left)
- Size: 56px × 56px (44px on mobile, scaled up on sm+ breakpoint)
- Border-radius: 6px
- Fallback: Gray box with 📷 emoji if no photo
- **RULE:** Aspect ratio indicator badge in top-right corner
  - Show the actual aspect ratio: "4:3", "1:1", "16:9" as a tiny label
  - Background: semi-transparent dark
  - Font: 9px, bold

#### Item Info (20px margin left)
- **Title** (line 1)
  - Font: 600 (semibold), 14px, warm-900 (dark mode: warm-100)
  - Max width: ~160px (constraining to ~3 lines on 375px screen with margins)
  - Truncate if exceeds 3 lines (no ellipsis suffix needed; users can expand to see full)
  - Example: "Victorian Chair"

- **Metadata** (line 2)
  - Font: 12px, warm-600 (dark mode: warm-400)
  - Format: **`$PRICE · CATEGORY`**
  - If price is null: show "No price set" in red (soft-red-600)
  - If category is null: show "Uncategorized" in gray
  - Example: "$45 · Furniture" OR "No price · Electronics"

#### Expand/Collapse Arrow (right, 20px margin left)
- Symbol: "▼" when collapsed, "▲" when expanded
- Font: 12px, warm-400
- Click target: 40px × 40px centered on arrow
- Rationale: Full row is clickable to toggle expand; arrow indicates direction

### 2. Status Line (appears immediately below header, always visible)

**Purpose:** Communicate the ONE thing the organizer needs to know right now.

```
◉ [STATUS TEXT]
```

- **Dot color + status text:**
  - Green ◉ **"Ready to Publish"** if `grade === 'clear'`
  - Orange ◉ **"Review Before Publishing"** if `grade === 'nudge'`
  - Red ◉ **"Cannot Publish Yet"** if `grade === 'blocked'`

- Font: 13px, 600 (semibold), matching color
- Padding: 8px top/bottom, 12px left/right
- Background: Light tint of the color (green-50, amber-50, red-50)
- Border-radius: 6px
- Margin: 8px top from collapsed row

**Plain English:** No jargon. Never say "AI confidence 78%", "health score 65", or "nudge". Just say what to do.

### 3. Details Section (when expanded)

**Purpose:** Break down EXACTLY what's good, what needs fixing, and what's optional.

Content is organized in 3 subsections (when they exist):

#### ✓ What's Ready
- **Show if:** Any breakdown component is at max value
- Header: "What's ready ✓" (light green, 12px, 500 weight)
- Each line:
  - `• [Component name] ✓`
  - Examples:
    - `• 4 good photos ✓` (if photoUrls.length ≥ 4)
    - `• Clear title ✓` (if title.length ≥ 15)
    - `• Full description ✓` (if description.length ≥ 50)
    - `• 3+ tags ✓` (if tags.length ≥ 3)
    - `• Price set ✓` (if price)
    - `• Condition graded ✓` (if conditionGrade)

#### ✗ Must Fix Before Publishing (only if blocked)
- **Show if:** `grade === 'blocked'`
- Header: "Cannot publish until:" (red, 12px, 600 weight)
- Each missing blocking component:
  - `✗ [What's missing]`
  - Examples (map breakdown zeros to plain English):
    - `✗ Add at least one photo`
    - `✗ Add a title to your item`
    - `✗ Set a price`
    - `✗ Add a condition grade`
  - Red text (soft-red-600 / dark: soft-red-400)

#### ⚠ Improvements Before Publishing (only if nudge)
- **Show if:** `grade === 'nudge'`
- Header: "Recommended before publishing:" (orange, 12px, 600 weight)
- Each component that's not maxed out:
  - `✗ [Improvement suggestion]`
  - Examples:
    - `✗ No description yet` (description score = 0)
    - `✗ Add a price` (price score = 0)
    - `✗ Short title` (title score = 10, not 20)
    - `○ Add 1+ more photo` (photo score = 35, not 40; "○" = nice-to-have)
  - Orange text (amber-600 / dark: amber-400)

#### ○ Optional Enhancements (always show at bottom if anything exists)
- **Show if:** Any breakdown component exists and is not maxed
- Header: "Optional:" (gray, 12px, 500 weight)
- Each optional line:
  - `○ [Enhancement]`
  - Examples:
    - `○ Add 1+ more photo (shoppers love multiple angles)`
    - `○ Add tags (helps discovery)`
    - `○ Add condition details (builds trust)`
  - Gray text (warm-500 / dark: warm-400)

### 4. Action Buttons (bottom of expanded section)

```
[🗑 Delete]  [Edit Item]
```

- Delete button: Red, left side, text-only with icon (trash emoji or ❌)
- Edit button: Primary action, full width or right side
- Both: 44px minimum height (touch target)
- Font: 14px, 500 weight
- Spacing: 8px gap between buttons

---

## Color Palette & Semantic Meaning

### Status Colors (non-negotiable)
| Status | Primary | Background | Text | Meaning |
|--------|---------|------------|------|---------|
| **Clear** | Green-600 | Green-50 | Green-700 | Ready to publish |
| **Nudge** | Amber-600 | Amber-50 | Amber-700 | Review first |
| **Blocked** | Red-600 | Red-50 | Red-700 | Cannot publish |

### Component Text Colors
- **What's ready:** Green-600 / dark: Green-400
- **What's missing (blocked):** Red-600 / dark: Red-400
- **What's missing (nudge):** Amber-600 / dark: Amber-400
- **Optional:** Warm-500 / dark: Warm-400

### Dark Mode
- Card background: `gray-800` (not white)
- Text: `warm-100` (off-white, not pure white)
- Borders: `gray-700`
- Status background: darker tints (`green-900/20`, `amber-900/20`, `red-900/20`)

---

## Interaction & Behavior

### Selecting for Batch Publish
1. **Collapsed row is clickable** (not just the checkbox)
   - Click anywhere on the row → toggle `expanded` state
   - Click checkbox → toggle `selectedItems` set (no expand/collapse)
   - Checkbox only disabled if `grade === 'blocked'`

2. **Batch toolbar (top of page)** shows:
   - "N selected" count
   - "[Publish All]" button (enabled only if ≥ 1 selected AND all selected are not blocked)

3. **Visual feedback on selection:**
   - Selected row: slight background highlight (warm-100 / dark: gray-700)
   - Checkbox: filled with warm-600

### Expanding to Edit
1. Click row (or press [▼] arrow) → collapsed row becomes expanded section
2. Expanded section slides in below (no collapse animation needed, just show/hide)
3. User sees full details breakdown + edit fields
4. Click row again or press [▲] → collapse and return to list view
5. If item was edited, re-fetch health score from API (or recalculate client-side based on form fields)

---

## Accessible Text & Plain Language

### Status Labels (ALWAYS use these exact phrases)
- ✅ `"Ready to Publish"` (NOT "clear", NOT "health score ≥ 70")
- ⚠️ `"Review Before Publishing"` (NOT "nudge", NOT "needs attention")
- ❌ `"Cannot Publish Yet"` (NOT "blocked", NOT "missing critical fields")

### Breakdown Labels (map to user needs, not technical terms)
| Breakdown | When Good | When Missing |
|-----------|-----------|-------------|
| photo | `"4 good photos ✓"` | `"Add at least one photo"` |
| title | `"Clear title ✓"` | `"Add a title to your item"` OR `"Make title longer"` |
| description | `"Full description ✓"` | `"Add a description"` |
| tags | `"3+ tags ✓"` | `"Add tags"` (as optional) |
| price | `"Price set ✓"` | `"Set a price"` |
| conditionGrade | `"Condition graded ✓"` | `"Select item condition"` |

### AI Confidence (NOT shown on this page)
- Current code shows `"AI Confidence 78%"` on the right side
- **Spec change:** Move AI confidence to the expanded edit panel ONLY
- Reason: Non-tech organizers don't care about confidence %; they care about accuracy
- Expanded panel shows: `"AI suggested: [fields]. Review and adjust."` with manual edit controls
- The confidence % is internal; show humans-readable labels instead

---

## Dev Handoff Notes

### Implementation Order
1. **Phase 1:** Refactor collapsed row layout (checkbox + thumbnail + info + arrow)
   - Move status indicator below the header (not mixed into metadata)
   - Remove AI confidence from collapsed view
   - Fix title truncation (allow 2–3 lines, not 1)

2. **Phase 2:** Refactor details breakdown
   - Create separate subsections: "What's Ready" / "Must Fix" / "Improvements" / "Optional"
   - Map `healthScore.breakdown` values to plain-English text
   - Use color-coded headers (green/orange/red text)

3. **Phase 3:** Disable checkbox for blocked items
   - Set `disabled={grade === 'blocked'}` on checkbox input
   - Add `opacity-50 cursor-not-allowed` styling
   - Add title attr: "This item must be reviewed before publishing"

4. **Phase 4:** Move AI confidence label
   - Remove from collapsed view entirely
   - Add to expanded panel above the title edit field
   - Show only if `isAiTagged === true`
   - Label: `"AI suggested these fields (87% confidence). Review and adjust as needed."`

5. **Phase 5:** Dark mode verification
   - Test all status colors in dark mode
   - Verify contrast ratios (WCAG AA minimum 4.5:1 for text)
   - Test on actual dark phones (not just browser dev tools)

### Key Data Transformations

**In the component, after `healthScore` is received:**

```typescript
// Compute what to show for each status
const detailsToShow = {
  ready: [],        // Components at max value
  mustFix: [],      // Components at 0 when grade === 'blocked'
  improve: [],      // Components not at max when grade === 'nudge'
  optional: [],     // Components not at max (always show at bottom)
};

// Loop through healthScore.breakdown and categorize
```

**Mapping function (pseudo-code):**
```typescript
function getComponentLabel(component: keyof HealthBreakdown, score: number, max: number): string {
  if (score === max) {
    return `${humanize(component)} ✓`;  // "4 good photos ✓"
  } else if (score === 0) {
    return `Add ${humanize(component)}`;  // "Add a price"
  } else {
    return `${humanize(component)} needs work`;  // "Title needs work"
  }
}
```

### Testing Checklist (before marking ✅)

#### Mobile (375px width)
- [ ] Card header fits in one row (checkbox, thumbnail, title, arrow)
- [ ] Title does not truncate to <20 chars (should wrap to 2–3 lines if needed)
- [ ] Price and category display on second line
- [ ] Status line appears below header in correct color
- [ ] When expanded, details flow vertically without overflow
- [ ] Delete button and Edit button both have 44px+ touch targets
- [ ] Checkbox disabled for blocked items (visual feedback clear)
- [ ] Dark mode: all text readable, no mint-on-green, no white overexposure

#### Desktop (≥768px width)
- [ ] Card collapses to single horizontal row
- [ ] Thumbnail, title, category, price, status all visible without scrolling
- [ ] [Edit] and [🗑] buttons visible on the right
- [ ] Click-to-expand works and panel appears below

#### Functionality
- [ ] Selecting a card with checkbox adds it to batch
- [ ] Batch publish button appears at top and updates count
- [ ] Expanding a card shows all 3–4 breakdown subsections
- [ ] Collapsing a card returns to list view
- [ ] Edit button opens full edit panel (existing behavior, unchanged)

#### Text Accuracy
- [ ] No "AI confidence" label on collapsed view
- [ ] No health score numbers on cards (only in internal API)
- [ ] No jargon: "nudge", "blocked", "grade" all replaced with plain English
- [ ] Status line uses exactly: "Ready to Publish", "Review Before Publishing", "Cannot Publish Yet"

---

## Rationale: Why This Layout Works

1. **Scannability:** 2–3 second decision is supported by:
   - One dominant color (green/orange/red) + status text
   - No competing visual elements
   - Item name and thumbnail for identification

2. **Mobile-first:** Organizers at the sale venue need:
   - Large touch targets (44px minimum)
   - Vertical layout (not horizontal cramming)
   - Clear "ready vs. needs work" without calculation

3. **Plain language:** Avoids tech jargon that confuses non-technical organizers:
   - Not "health score 68" → "Review Before Publishing"
   - Not "AI confidence 74%" → Hidden from main view, details in edit panel
   - Not "nudge grade" → "Recommended improvements"

4. **Encourages batch publishing:** By showing N items ready at a glance and offering one-tap batch publish, we reduce friction:
   - "I see 12 ready items → tap [Publish All] → done"
   - Instead of: "I need to click each item to confirm it's ready"

5. **Maps to workflow:** The subsections ("What's Ready", "Must Fix", "Improvements") match how organizers think:
   - "What do I have already?" (positive reinforcement)
   - "What's blocking me?" (clarity on blockers)
   - "What should I consider?" (guidance without forced action)

---

## Future Enhancements (Out of Scope)

- [ ] "Auto-publish when ready" toggle (organizer sets a policy once)
- [ ] Scheduled publishing (publish at a specific time)
- [ ] Batch edits (change category on 5 items at once)
- [ ] AI photo quality score (separate from confidence)
- [ ] Suggested improvements (e.g., "Add 2 more photos, then you're at 90% ready")
