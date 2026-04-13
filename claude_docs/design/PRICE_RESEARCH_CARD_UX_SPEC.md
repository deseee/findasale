# UX Spec: Price Research Card Redesign

**Author:** UX/Product Design  
**Date:** 2026-04-11  
**Status:** Ready for findasale-dev implementation  
**Pages affected:** `/organizer/edit-item/[id]`, `/organizer/review-and-publish` (if applicable)  
**Component:** `PriceResearchPanel.tsx`

---

## Executive Summary

The Price Research Card currently presents five pricing/valuation tools with equal visual weight, forcing organizers to scan multiple sections to find the right pricing method. This spec reorganizes the card around the **organizer's mental model** (fastest method first, deepest insight last) and applies FindA.Sale's design language consistently (sage green for primary action, amber for premium features, clear button hierarchy).

**Job-to-be-Done:** Set the right price for an item before publishing it in 30–60 seconds.

---

## Current UX Problems

1. **Unclear priority:** Five sections (AI estimate, Smart Pricing, eBay comps, Sales Comps, Community Appraisal) presented in sequential order with no visual hierarchy indicating which method to use *first*.
2. **Button styling chaos:** Three different button colors (blue border, blue solid, sage green solid) convey no semantic meaning—no distinction between primary/secondary/tertiary actions.
3. **Section dividers reduce scanability:** 5 gray horizontal dividers (border-t) break the card into fragments, making it feel like multiple disconnected cards stacked vertically.
4. **Conflicting visual weight:** The "Request Community Appraisal" button is full-width and sage green (primary color), but it's the LEAST efficient pricing method (requires photos + community response time). This contradicts the visual hierarchy.
5. **PRO tier gating not obvious:** The "Sales Comps (PRO)" label is small (text-xs), easy to miss. Organizers on SIMPLE tier may click the button expecting results, then encounter a paywall message that feels like a broken feature.
6. **Mobile-unfriendly on rapid entry:** On mobile during rapid item capture, this card expands heavily and pushes organizers past the fold. The collapsible header helps, but the expanded content is still dense.
7. **Inconsistent with design system:** No use of the established amber accent color for premium features; no clear badge system for tier gating.

---

## Job-to-be-Done Analysis

### What is the organizer trying to do?
Set a competitive price for an item they're about to list, quickly, with confidence that they won't underprice or overprice.

### What's the fastest path?
1. AI estimate (if available) — instant, requires nothing
2. Smart Pricing button (AI-powered) — one click, uses title + category + condition
3. eBay search (real sold prices) — one click, shows median + range
4. Sales Comps (FindA.Sale data) — one click if PRO, shows internal comparable sales
5. Community Appraisal (crowdsourced) — requires photos + time, shows aggregate estimate

### What stops them?
- Too many options presented equally → paralysis by analysis
- Buttons that don't signal "use this first" → trial and error
- Gating messages that feel like errors → friction on tier-gated features
- Section breaks that feel like multiple cards → context-switching tax

### Mobile rapid-entry context
During RapidCapture mode (photo → title → category → price → repeat), organizers want a **quick price suggestion** that doesn't require leaving their flow. The ideal is: show AI estimate if available, one-click "Use This Price" button.

---

## Redesigned Section Order & Hierarchy

### Section 1: AI Smart Estimate (If Available)
**Visibility:** Always visible when collapsed OR expanded  
**Why first:** Instant, requires nothing, best UX  
**Container:** Small badge-like callout, `text-sm` emphasis, no extra chrome  
**Copy:**
```
🤖 Smart Estimate
$[price]

Based on title, category & condition
```
**Action:** Inline "Use This Price" button (secondary style, text-sm, px-3 py-1)

**Design notes:**
- Blue-tinted background (`bg-blue-50 dark:bg-blue-900/20`) with border
- Small, compact — doesn't dominate
- Still visible in collapsed state as a preview ("🤖 Smart Estimate: $X")

---

### Section 2: Smart Pricing (One-Click AI Suggestion)
**Visibility:** Always expanded  
**Why second:** One-click action, no friction, most organizers will use this  
**Container:** Compact section with label + button  
**Copy:**
```
⚡ Get a Price Suggestion
Analyzes title, category, and condition to suggest a competitive price.
```
**Primary Action Button:**
```
Class: Primary (sage green, #4A7C59)
State: "Suggest Price"
Loading: "Analyzing..."
Text color: white
Icon: 💡
Width: Full width on mobile, auto on desktop
Padding: px-4 py-2.5
```

**Result Display:** When user clicks, show expandable result box:
```
Box: amber-50 bg with amber-200 border
Title: "Smart Price Suggestion"
Range: "$[low] – $[high] (suggested: $[mid])"
Reasoning: italic text explaining the logic
Action Button: "Use $[price]" (primary/sage green)
```

**Design notes:**
- Label is `text-sm font-semibold` (larger than current `text-xs`)
- Descriptive subtext helps first-time users understand what "Smart Pricing" means
- Button is the primary action on this card — gets sage green
- Result box uses amber (premium feature) to signal "AI-powered"

---

### Section 3: eBay Market Comps (Real-World Sold Prices)
**Visibility:** Collapsed by default, expand on click  
**Why third:** Requires external search, best paired with Smart Pricing result to compare  
**Container:** Labeled section with disclosure triangle  
**Copy:**
```
💰 Search eBay Sold Listings
Find real sold prices for identical or similar items.
```
**Action Button:**
```
Class: Secondary (light border, text color)
State: "Search eBay"
Loading: "Searching..."
Border: border-blue-400 dark:border-blue-500
Text: text-blue-600 dark:text-blue-400
Background: hover:bg-blue-50 dark:hover:bg-blue-900/20
Padding: px-3 py-1.5
Icon: 💰
Width: Auto (not full width)
```

**Result Display:** When results load, show in a contained box:
```
Box: green-50 bg if real data, amber-50 if mock
Title: "✓ [N] listings found" or "⚠️ Demo data"
Range: "$[min] – $[max] | Median: $[med]"
Action Buttons (inline grid):
  - Left: "Use $[median]" (blue, primary for this section)
  - Right: "eBay ↗" (external link, gray)
```

**Design notes:**
- Blue semantic color (external reference, not internal pricing)
- Collapsed by default to keep card compact
- Real eBay data gets green badge, mock data gets amber badge + disclaimer
- Two action buttons: internal (Use price) + external (Browse eBay)

---

### Section 4: Sales Comps (PRO/TEAMS Only)
**Visibility:** Always visible (not hidden)  
**Tier gate design:**
  - **For SIMPLE tier:** Show tan/amber card with upgrade CTA (not a disabled button)
  - **For PRO/TEAMS tier:** Show ValuationWidget result
**Copy:**
```
📊 Sales Comps (PRO Feature)
Compare against actual sales from FindA.Sale's network.
```

**For SIMPLE tier (upgrade prompt):**
```
Box: amber-50 bg, amber-200 border, `rounded-lg`
Icon: 📊
Heading: "Compare Against FindA.Sale Sales Data"
Body: "See price ranges from recent sales on the platform. Upgrade to PRO to unlock."
Action Button:
  - Class: Secondary (amber border, amber text)
  - Label: "View Plans →"
  - Link: /pricing
  - Padding: px-3 py-1.5
```

**For PRO/TEAMS tier:**
```
Button: "Load Comparable Sales"
Loading: "Fetching comparable sales..."
Result: ValuationWidget confidence score + median price
```

**Design notes:**
- Tier gate uses amber color (consistent with premium features — see D-007 in decisions-log.md)
- Not hidden entirely (organizers should know the feature exists)
- Upgrade CTA is friendly, not punitive
- For PRO/TEAMS: Widget result shows confidence bar (existing pattern in ValuationWidget.tsx)

---

### Section 5: Request Community Appraisal (Bottom, De-Emphasized)
**Visibility:** Always visible, below fold  
**Why last:** Requires most effort (photos required), longest wait time (community response time)  
**Container:** Full-width card at bottom of expanded view  
**Copy:**
```
🤝 Request Community Appraisal
Get crowdsourced estimates from experienced community members.

📸 Photos required (you've uploaded [N])
⏱️ Estimates arrive in 1–3 hours
```

**Action Button:**
```
Class: Primary (sage green, #4A7C59)
State: "Request Appraisal" (with count if photos present)
Disabled state: "Add Photos to Request Appraisal"
Loading: "Submitting..."
Icon: 🤝
Width: Full width
Padding: px-4 py-2.5
```

**Confirmation Modal (when clicked):**
```
Title: "Request Community Appraisal"
Info box: "Cost: [XP cost] | Your balance: [X] XP" (for SIMPLE tier) or "✓ Free for [TIER] members" (PRO/TEAMS)
Body text: "Submit your item for community valuation. Community members will provide price estimates based on your photos."
Action buttons (inline):
  - Left: "Cancel" (secondary)
  - Right: "Confirm & Submit" (primary/sage green)
```

**Design notes:**
- Moved to bottom because it's the most friction-heavy option
- Requirement callouts (📸, ⏱️) manage expectations
- Button stays primary color but is positioned as a secondary pricing method
- Modal cost/balance info is clear (not buried)
- For SIMPLE tier: shows XP cost; for PRO/TEAMS: shows free

---

## Button Hierarchy & Color System

### Primary Action Buttons (Sage Green #4A7C59)
**Use case:** Main CTA on the card, high confidence actions  
**Where:**
- "Suggest Price" (Smart Pricing section)
- "Use $[Price]" (when result is displayed)
- "Request Appraisal" (bottom section, when photos present)

**Styling:**
```
bg: #4A7C59
hover:bg: #3d654a (darker shade)
text: white
disabled:bg: gray-400
padding: px-4 py-2.5 (full height buttons) | px-3 py-1.5 (compact buttons)
rounded: rounded-lg
transition: transition-colors duration-200
```

### Secondary Action Buttons (Border + Text)
**Use case:** Optional or less-critical actions, exploration  
**Where:**
- "Search eBay" (eBay section)
- "Cancel" (modal)
- "View Plans →" (tier gate upgrade CTA)

**Styling:**
```
border: border-[color]
text: text-[color]
bg: transparent, hover:bg-[color]/10
padding: px-3 py-1.5
rounded: rounded-lg
transition: transition-colors
```

**Color variants:**
- Blue (eBay): `border-blue-400 text-blue-600` — signals external reference
- Amber (upgrade): `border-amber-500 text-amber-600` — signals premium feature
- Gray/warm (dismiss): `border-warm-300 text-warm-700` — neutral/dismissive

### Tertiary / Link Buttons
**Use case:** Exploratory, lowest priority  
**Where:**
- "Learn more →" (help text links, if added)
- External links like "eBay ↗"

**Styling:**
```
text: text-sm
text-color: text-gray-600 dark:text-gray-400
hover: text-amber-600 dark:text-amber-400, underline
background: none
```

---

## Collapsed vs Expanded States

### Collapsed State
**What's visible:**
```
┌─ Price Research ▶ ─────────┐
│                             │
│ 🤖 Smart Estimate: $[X]     │ (if available)
│ [Use This Price]            │
└─────────────────────────────┘
```

**Purpose:** Mobile optimization + keeps form scannable  
**On mobile RapidCapture:** Organizer can see the estimate without expanding

### Expanded State
**What's visible:**
All 5 sections as described above, in order: Smart Estimate → Smart Pricing → eBay → Sales Comps → Community Appraisal

**Section dividers:**
Replace gray `border-t` lines with subtle spacing (`py-3` between sections, no border).
This reduces visual fragmentation while maintaining clear section boundaries.

---

## Mobile Considerations

### Mobile Viewport Challenges
- **Width constraint:** On iPhone 12, 375px width available (minus padding = ~340px content)
- **Height constraint:** During RapidCapture, organizers are mid-flow and don't want the card to dominate
- **Touch targets:** Buttons must be at least 44px tall (Apple HIG)

### Mobile-Specific Adjustments

1. **Collapsed by default on mobile**
   - Show only the Smart Estimate badge (if available) in collapsed state
   - Header shows "Price Research ▼" (collapse arrow)
   - Organizer taps to expand only when they want detailed pricing

2. **Full-width buttons on mobile, auto width on desktop**
   ```
   Mobile: w-full (100% width, easier to tap)
   Desktop (md+): w-auto (content width, cleaner layout)
   ```

3. **Smart Pricing section always visible when expanded**
   - Takes up minimal space: label + full-width button (44px minimum height)
   - Result box appears below button on click

4. **eBay section collapsed by default on all viewports**
   - Can be expanded on demand
   - Reduces initial card height

5. **Sales Comps section shows upgrade CTA on one line**
   - "📊 Sales Comps (PRO) — View Plans →" as a single compact row
   - No extra whitespace

6. **Community Appraisal at bottom**
   - Organizer must scroll down to see (intentional)
   - This method is intentionally de-emphasized on mobile

---

## Copy & Tone

### Guiding Principles
- **Be direct:** No jargon, explain what each method does in 1–2 sentences
- **Use action language:** "Get", "Search", "Request", "Compare" — not "View", "Check"
- **Build confidence:** Help organizers understand *why* each method matters
- **Set expectations:** Timeframes, requirements, costs (for appraisal)

### Section Copy (Final)

| Section | Label | Subtext | Button |
|---------|-------|---------|--------|
| AI Smart Estimate | "🤖 Smart Estimate" | "Based on title, category & condition" | "Use This Price" |
| Smart Pricing | "⚡ Get a Price Suggestion" | "Analyzes title, category, and condition to suggest a competitive price." | "Suggest Price" / "Analyzing..." |
| eBay Comps | "💰 Search eBay Sold Listings" | "Find real sold prices for identical or similar items." | "Search eBay" |
| Sales Comps (SIMPLE) | "📊 Sales Comps (PRO Feature)" | "Compare against actual sales from FindA.Sale's network. Upgrade to PRO to unlock." | "View Plans →" |
| Sales Comps (PRO/TEAMS) | "📊 Sales Comps" | "Compare against actual sales from FindA.Sale's network." | "Load Comparable Sales" |
| Community Appraisal | "🤝 Request Community Appraisal" | "Get crowdsourced estimates from experienced community members.\n\n📸 Photos required\n⏱️ Estimates arrive in 1–3 hours" | "Request Appraisal" / "Add Photos to Request Appraisal" |

---

## Container & Spacing

### Card Container
```
Border: border-warm-200 dark:border-gray-700
Rounded: rounded-lg
Background: bg-white dark:bg-gray-800
Overflow: overflow-hidden
```

### Content Padding
```
Header: px-4 py-3 (same as current)
Sections (expanded):
  - Top section: px-4 py-3
  - Middle sections: px-4 py-3 (consistent)
  - Bottom section: px-4 py-3
  - Between sections: no border-t, use py-3 margin or section-spacing class
```

### Result Boxes (sub-containers)
```
Padding: p-3 (compact)
Border: border-[color]
Rounded: rounded-lg
Margin: mt-2 (gap below button)
Background: [color]-50 with appropriate border-[color] variant
```

---

## Dark Mode

### Color Palette (existing FindA.Sale dark theme)
- **Background:** dark:bg-gray-800 (cards), dark:bg-gray-900 (page)
- **Border:** dark:border-gray-700
- **Text:** dark:text-warm-100 (headings), dark:text-warm-300 (body)
- **Accents:**
  - Blue: dark:bg-blue-900/20, dark:border-blue-700, dark:text-blue-300
  - Amber: dark:bg-amber-900/20, dark:border-amber-700, dark:text-amber-300
  - Green: dark:bg-green-900/20, dark:border-green-700, dark:text-green-300

### Contrast Requirements
- **Button text on dark button:** White text on #4A7C59 (dark green) ✅ WCAG AA compliant
- **Dark mode result boxes:** Reduce opacity of background (e.g., `blue-900/20` = 20% opacity) for readability

---

## Accessibility Checklist

- [ ] Button text is descriptive ("Suggest Price" vs "Click here")
- [ ] All buttons have focus states (ring-2 outline on focus)
- [ ] Loading states are announced (aria-busy, aria-label updates)
- [ ] Modal has role="dialog" with aria-labelledby
- [ ] Cost/balance info in modal is not color-coded alone (also uses text)
- [ ] Tier gate shows in UI (not hidden in tooltip)
- [ ] Touch targets are 44px minimum (mobile buttons)
- [ ] Color contrasts meet WCAG AA (4.5:1 for text)

---

## Design System References

### Existing patterns to match
- **Button styling:** See `PriceSuggestion.tsx` (amber button for secondary actions)
- **Result boxes:** See `ValuationWidget.tsx` (bordered box with confident/low states)
- **Modal dialog:** See existing appraisal confirmation modal in `PriceResearchPanel.tsx` (lines 340–391)
- **Tier gate copy & styling:** See `ValuationWidget.tsx` (lines 34–47) for reference pattern

### Colors (Tailwind + custom)
- **Primary (sage green):** `#4A7C59` (existing, used for main CTAs)
- **Premium (amber):** `amber-100` / `amber-600` (existing, used for features and alerts)
- **Secondary (blue):** `blue-500` / `blue-600` (existing, used for external links)
- **Status (green):** `green-600` (existing, used for "live" or success states)

### Typography
- **Section headers:** `text-sm font-semibold text-warm-700 dark:text-warm-300`
- **Body text:** `text-xs text-warm-500 dark:text-warm-400`
- **Button text:** `text-sm font-medium` (or `text-xs` for compact buttons)

---

## Handoff Notes for findasale-dev

1. **Component props remain unchanged** — `PriceResearchPanel.tsx` signature stays the same
2. **Internal restructuring:**
   - Reorder sections to: AI Estimate → Smart Pricing → eBay → Sales Comps → Community Appraisal
   - Consolidate dividers: replace `border-t` lines with section margin/padding
   - Update button classNames to use new hierarchy colors

3. **PriceSuggestion.tsx:** Should already produce result boxes with amber-50 styling (verify against this spec)
4. **ValuationWidget.tsx:** Verify tier gate messaging matches the amber-border style in this spec
5. **Testing:** Verify on mobile (375px) and desktop (1440px) viewports

---

## Success Metrics

A redesigned Price Research Card is successful when:
1. **Organizers complete pricing in <30 seconds on RapidCapture** — collapsible header + Smart Estimate visible from start
2. **No visual confusion about which method to use first** — Smart Pricing is the primary CTA (sage green, full width)
3. **Tier gates are clear** — organizers don't click expecting results, then see an error
4. **Button colors match the design system** — no orphaned blue buttons in the card
5. **Mobile layout feels uncluttered** — sections collapse appropriately, buttons are touch-friendly

---

## Open Design Questions

- [ ] **eBay integration status:** Does `handleGetPriceComps` consistently return real data or mock data? Should UI show "mock data" disclaimer when credentials aren't configured?
- [ ] **Community Appraisal cost:** Is the XP cost (50 XP) user-facing on this card, or only in the modal? Spec assumes modal-only.
- [ ] **AI Estimate availability:** How often is `aiEstimate` provided? Should the section be hidden if always null, or shown as a placeholder?
- [ ] **ValuationWidget result format:** Should it show a confidence bar (existing) or simplified range + median? Spec assumes confidence bar is kept.
- [ ] **Rapid entry context:** Should the card auto-collapse when entering RapidCapture mode, or should the organizer manually collapse?

