# Card Reader Hardware Section Spec — TEAMS Subscription Page
Session: S524 | Author: UX Designer | Date: 2026-04-20

---

## Job-to-be-Done (JTBD)

**TEAMS organizers want to:** Order a Stripe Terminal card reader so they can accept card payments at physical checkout stations (fixed shop, flea market, auction house, estate sale).

**Core friction point:** They don't know which reader they need or how to order it.

**Success metric:** In 60 seconds, organizer sees options, understands why one is "best for them," and clicks through to order.

---

## Scope & Placement

**Where it goes:** On the subscription.tsx TEAMS tier page, **after the "Included Features" list section**, before "Plan Actions".

This placement makes sense:
- Features establish what they can DO
- Hardware bridge their features to physical reality (take card payments)
- Actions come last

**Page affected:** `/organizer/subscription.tsx` (lines ~273, after the `</ul>` closing the features list, before the "Compare All Plans" button)

---

## Content Strategy

**Context:** TEAMS users are already paying $79/mo. They've committed to the platform. The hardware section is:
- An **optional** upsell, not mandatory
- A **convenience bridge** (we explain how to get what they need)
- **Transparent about compatibility** (this PWA only works with WiFi readers)

**Tone:** Professional, practical. "Here's what works with FindA.Sale. Order from Stripe directly."

---

## Layout: Desktop (md+) vs Mobile

### Desktop (1024px+)
- 4-column grid layout (to be contained in max-w-4xl)
- Each reader is a card (white bg, subtle shadow, rounded corners)
- Price badge in top-right corner
- "Best for" blurb at card top (under price)
- Key specs (3–4 bullet points) in middle
- "Learn & Order" link at bottom

### Mobile (< 768px)
- Single-column stacked cards
- Price badge prominent at card top
- Same content, more breathing room
- Full-width "Learn & Order" link on each card

---

## Reader Cards Design

### Card Template (Repeats for each reader)

**Card container:**
- Background: white (dark: gray-800)
- Border: 1px solid gray-200 (dark: gray-700)
- Padding: 24px (6 in Tailwind)
- Border-radius: 12px
- Shadow: shadow-sm hover:shadow-md transition
- Minimum height: ~340px (ensures visual parity across cards)

**Card sections (top-to-bottom):**

1. **Price Badge (absolute top-right)**
   - Background: sage-100 (dark: sage-900/30)
   - Text: sage-700 (dark: sage-300)
   - Font: text-sm font-semibold
   - Content: e.g., "$299"
   - Padding: px-3 py-1, rounded-full

2. **Reader Name & Icon**
   - Emoji: 📱 (small, approachable)
   - Name: font-bold text-lg, warm-900 (dark: warm-100)
   - Examples: "Stripe S700", "Stripe S710", "WisePOS E"

3. **"Best for" Blurb**
   - Text: text-sm, warm-700 (dark: warm-300)
   - 1–2 sentences, JTBD-focused
   - Examples:
     - S700: "Estate sales, yard sales, flea markets, shops. The most popular choice."
     - S710: "Outdoor events or venues with unreliable WiFi."
     - WisePOS E: "If you already have one, it works perfectly with FindA.Sale."

4. **Connectivity (inline badge)**
   - Text: text-xs, gray-600 (dark: gray-400)
   - Background: gray-100 (dark: gray-700/30)
   - Content: "WiFi" or "WiFi + Cellular"
   - Inline pill-style badge, px-2 py-1, rounded-full
   - Placed right below blurb

5. **Key Specs (bullet list)**
   - 3–4 short lines, text-sm, warm-700 (dark: warm-300)
   - SVG checkmark icon (green-500)
   - Examples for S700:
     - "5.5" customer-facing display"
     - "Tap, chip, or swipe"
     - "WiFi connection required"

6. **CTA Link (bottom)**
   - Text: "Order via Stripe Dashboard" or "Order via Stripe"
   - Style: text-sage-600 font-semibold hover:underline (unstyled link)
   - Destination: https://dashboard.stripe.com/terminal/hardware
   - Opens: _blank (new tab)
   - Icon: External link icon (→) after text

---

## Reader Card Content

### Card 1: Stripe S700
**Price:** $299
**Icon:** 📱
**Name:** Stripe Reader S700
**Best for:** Estate sales, yard sales, flea markets, and resale shops. The most popular choice — works with any WiFi network.
**Connectivity:** WiFi
**Key Specs:**
- ✓ 5.5" customer-facing display
- ✓ Accepts tap, chip, and swipe
- ✓ No additional setup or cabling
- ✓ 3–5 day delivery from Stripe

**CTA:** Order via Stripe Dashboard

---

### Card 2: Stripe S710
**Price:** $299
**Icon:** 📡
**Name:** Stripe Reader S710
**Best for:** Outdoor events, flea markets, or venues with spotty WiFi. Adds cellular fallback so you never lose connectivity.
**Connectivity:** WiFi + Cellular (LTE)
**Key Specs:**
- ✓ Same 5.5" display as S700
- ✓ Built-in LTE cellular backup
- ✓ Falls back automatically if WiFi drops
- ✓ Same payment types (tap, chip, swipe)

**CTA:** Order via Stripe Dashboard

---

### Card 3: BBPOS WisePOS E
**Price:** $249
**Icon:** 💳
**Name:** BBPOS WisePOS E
**Best for:** If you already have one from a previous setup. Fully compatible with FindA.Sale POS.
**Connectivity:** WiFi (or Ethernet with $49 optional dock)
**Key Specs:**
- ✓ 5" color display
- ✓ Accepts tap, chip, and swipe
- ✓ Works identically to the S700
- ✓ Slight savings if you own one already

**CTA:** Order via Stripe Dashboard

---

## Section Header & Context

**Position:** Right before the grid of reader cards

**Header copy:**
```
Accept card payments with a physical reader
```

**Subheading:**
```
For fixed checkout stations or high-volume sales, connect a Stripe Terminal reader 
to FindA.Sale. Set up in minutes — no additional software needed.
```

**Tone:** Practical, non-salesy.

---

## Edge Cases & Conditionals

### Case 1: TEAMS User Already Has a Reader
- No change to section display
- Copy is neutral ("Here are your options" not "You need one of these")
- Organizer can skim or ignore

### Case 2: PRO User Views (Should Not See This Section)
- This section only appears for TEAMS tier users
- Conditional render: `{tier === 'TEAMS' && <HardwareSection />}`
- PRO users get the section when/if they upgrade to TEAMS

### Case 3: SIMPLE User on Subscription Page
- Does not see this section
- Relevant only to TEAMS users

### Case 4: Mobile (<640px)
- Single-column layout
- Full-width cards
- Heading stacks naturally
- CTAs remain clickable (no overflow)

---

## Implementation Checklist

### Frontend Component
- [ ] Create `HardwareSection.tsx` component (reusable for pricing page too, if needed)
- [ ] Accept `tier` prop to conditionally render (only for TEAMS)
- [ ] Grid: `grid-cols-1 md:grid-cols-3 gap-4 md:gap-6` (3-column on desktop, 1 on mobile)
- [ ] Cards: Fixed height for visual balance (~340px min-height)
- [ ] External link icon: Use Next.js `<Link target="_blank" rel="noopener noreferrer">` or `<a>`
- [ ] Dark mode: Test all gray/warm/sage color overrides

### Tailwind Classes (Reference)
```
Card container: bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 shadow-sm hover:shadow-md transition-shadow
Price badge: bg-sage-100 dark:bg-sage-900/30 text-sage-700 dark:text-sage-300 px-3 py-1 rounded-full text-sm font-semibold
Blurb text: text-sm text-warm-700 dark:text-warm-300
Connectivity: bg-gray-100 dark:bg-gray-700/30 text-gray-600 dark:text-gray-400 text-xs px-2 py-1 rounded-full inline-block
Specs list: space-y-2 text-sm
CTA link: text-sage-600 dark:text-sage-400 font-semibold hover:underline
```

### Copy & Tone
- All copy: Action-focused, organizer-first
- No "AI" language (even though hardware has nothing to do with AI)
- No "free trial" talk (this is feature access, not sales)
- Stripe link: Always https://dashboard.stripe.com/terminal/hardware
- No internal "contact us" flow (users order directly from Stripe)

### Data Dependencies
- **NO database queries** — this is static content
- **NO API calls** — link is direct to Stripe
- **NO personalization** — same content for all TEAMS users

### Accessibility
- Heading hierarchy: h3 for "Accept card payments with a physical reader"
- Link text: "Order via Stripe Dashboard" is descriptive (screen reader friendly)
- External link icon or "(opens in new tab)" label after link text
- Color not sole differentiator (use text + icons)
- Contrast: sage/warm text on white meets WCAG AA (test in dark mode too)

---

## Testing & Verification Checklist

### Functional QA
- [ ] Section renders only for TEAMS tier users
- [ ] Section does NOT appear on PRO or SIMPLE subscription page
- [ ] All three reader cards display correctly
- [ ] Prices match guide: S700=$299, S710=$299, WisePOS E=$249
- [ ] External links open Stripe Terminal Hardware page in new tab
- [ ] No console errors or broken images

### Visual QA
- [ ] Desktop (1024+): 3-column grid, balanced card heights
- [ ] Tablet (768–1023): 2-column grid OR single column (TBD by Patrick)
- [ ] Mobile (< 640): Single-column, full width, readable text
- [ ] Dark mode: All text has sufficient contrast, colors render correctly
- [ ] Hover states: Cards lift slightly on hover, links underline on hover
- [ ] Spacing: Section fits naturally between "Included Features" and "Plan Actions"

### Copy QA
- [ ] No mentions of "AI" in reader names or copy
- [ ] Tone matches existing subscription page (warm, professional, clarity-first)
- [ ] No broken links or typos in reader names
- [ ] Stripe link is correct URL (https://dashboard.stripe.com/terminal/hardware)

---

## Backend / Data Dependencies

**Short answer: None.**

This section is **purely presentational**. No new database tables, API endpoints, or feature flags needed.

**Why:**
- Hardware is optional infrastructure (organizers order from Stripe directly)
- FindA.Sale does not inventory or sell hardware
- Stripe handles order fulfillment and billing
- FindA.Sale's job is only to inform organizers that hardware exists and link them to Stripe

---

## Open Questions for Patrick

1. **Tablet layout:** On tablets (768–1023px), do you want 2 columns or single column? Current spec assumes 3 columns on desktop, 1 on mobile. Tablet falls through to 1. Would 2 columns be better?

2. **Section prominence:** Should the hardware section have a colored background to stand out (like the "Upgrade to TEAMS" section in the PRO tier page uses a gradient)? Or keep it minimal white card on white background?

3. **Messaging for free tier:** If a SIMPLE user visits the pricing page and sees TEAMS tier, should they see the hardware section? (My spec: No, hardware section only renders for users who ARE on TEAMS. But if you want to surface it as a feature for users CONSIDERING TEAMS upgrade, we'd change the conditional.)

4. **WisePOS E positioning:** The WisePOS E card is positioned as "if you already have one." Does that positioning feel right, or should it be removed from the section entirely (since it's legacy hardware)? Current spec keeps it as an option for completeness.

5. **Card specs detail level:** Are the 3–4 bullet points in each card enough detail, or should we expand (e.g., "Bluetooth: No" for WisePOS E to clarify Bluetooth incompatibility)? Current spec keeps specs brief.

---

## Related Files & Reference

- **Hardware compatibility guide:** `claude_docs/guides/stripe-card-reader-hardware-guide.md`
- **Subscription page:** `packages/frontend/pages/organizer/subscription.tsx`
- **Pricing page:** `packages/frontend/pages/pricing.tsx` (may also benefit from hardware section, TBD)
- **Decisions log:** `claude_docs/decisions-log.md` (no prior hardware decisions locked)
- **Design system:** Tailwind classes align with existing warm/sage/gray palette

---

## Next Steps (for implementation)

1. **Patrick review:** Clarify the 5 open questions above
2. **Dev dispatch:** Create `HardwareSection.tsx` component with spec copy and styling
3. **Styling verification:** Dark mode, contrast, responsive layout smoke test
4. **Integration:** Add component to subscription.tsx TEAMS tier section
5. **Browser QA:** Test on mobile, tablet, desktop; dark mode; link opens correctly
6. **Copy polish:** Patrick final review of tone & accuracy before shipping

---

**Spec status:** READY FOR IMPLEMENTATION  
**Estimated dev time:** 2–3 hours (component creation + integration + styling + QA)
