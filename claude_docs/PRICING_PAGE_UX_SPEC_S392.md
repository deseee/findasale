# FindA.Sale Pricing Page UX Redesign Spec
**Session:** S392
**Author:** findasale-ux
**Date:** 2026-04-04
**Status:** Specification (Design Phase)

---

## Executive Summary

The current pricing page suffers from redundancy, visual dissonance, and missing value propositions. Key problems:

1. **Duplicate information** — Tier cards show features, then the comparison table repeats the same features with inconsistent naming
2. **Misaligned table** — TierComparisonTable has column header/checkmark misalignment (CSS issue)
3. **Missing value drivers** — Photo-to-publish workflow, exports, social posts, POS, QR codes, holds/reservations, and Hunt Pass unique benefits are not mentioned on the pricing page
4. **Visual hierarchy problem** — À la carte section uses purple gradient and feels disconnected from the main tier narrative
5. **Enterprise messaging too narrow** — "Need unlimited team members?" doesn't speak to the TEAMS buyer (most are small businesses or families running multiple sales, not enterprise)
6. **No trust signals** — No stats, testimonials, or social proof for a non-technical audience that trusts peer validation
7. **No annual/monthly toggle** — SaaS best practice, though for an early-stage product this may be premature

---

## Audience Profile (Constraint)

- **Age:** Primarily 40–65, estate sale organizers
- **Tech literacy:** Low to moderate. Mobile-first users (phone at sale)
- **Decision criteria:** Time saved, lower fees, simplicity, peer validation
- **Payment friction:** High. Subscription hesitation is real — annual pricing may increase decision anxiety

**Implication:** Don't over-engineer interactive comparisons, toggles, or calculators. Clarity > feature parity. Micro-copy matters more than visual storytelling.

---

## SECTION 1: RECOMMENDED PAGE STRUCTURE

### Recommendation: Keep Cards as Visual Lead + Improve Table as Reference

**Why NOT eliminate cards?**
- Cards are scannable, emotion-aligned, and familiar to this audience (similar to insurance/utility pricing)
- Three tiers are easy to compare visually at a glance
- Card layout works great on mobile (single column → minimal scrolling)
- Feature-heavy tables intimidate non-technical users

**Why NOT eliminate table?**
- Table provides exhaustive reference for decision-makers
- Allows side-by-side feature depth comparison
- Required for serious buyers evaluating tier cost-benefit

**New approach:**
- **Cards (visual opener)** → Lead with core value prop + clear pricing + CTA + **top 5 differentiators only** (not 10–25 features)
- **Feature Comparison Table (reference depth)** → Exhaustive feature matrix below
- **Single naming authority** → Features must use exact same names in both card and table
- **Table visual fix** → Correct column alignment and add row group headers (tiers of features: basics, organizer tools, team features, advanced)

**Rationale for non-technical audience:**
- Estate sale organizers don't want to read 25-item feature lists on cards
- They want to know: "Will this help me run my sale?" + clear price
- Cards answer that quickly. Table answers the "prove it" question for fence-sitters

---

## SECTION 2: SECTION-BY-SECTION LAYOUT SPEC

### 2.0 — PAGE CONTAINER & SPACING

```
Page width:       max-w-7xl (1280px)
Padding (mobile): 1rem (16px)
Padding (desktop): 1.5rem (24px)
Gap between sections: 3rem (48px)
Section bg:       warm-50 (light cream) / dark:gray-900
```

Mobile breakpoint: `md` (768px) — sections stack vertically, cards switch to single column

---

### 2.1 — HERO HEADLINE & SUBHEAD

**Purpose:**
Story-driven hook that reframes pricing as value, not cost. Moves past "simple, transparent" (assumed, not differentiated).

**Layout:**

```
┌─────────────────────────────────────────────────┐
│                                                 │
│  Headline (h1, 3xl–4xl, bold, center)           │
│                                                 │
│  Subhead (p, lg, muted, center)                 │
│                                                 │
│  Optional: Trust stat or testimonial (xs text)  │
└─────────────────────────────────────────────────┘
```

**Proposed Copy:**

**Headline:**
"One tool for every sale, any size"
(Or) "Your sale, your rules. Pricing that scales with you."

**Subhead:**
"Start free, upgrade only when you're ready. No contracts, no surprises."

**Trust Line (optional, if data exists):**
"Used by 5,000+ organizers managing $2M+ in sales"
*Include only if accurate to current metrics*

**Rationale:**
- Shifts from "here are your options" to "this tool adapts to your needs"
- "No contracts, no surprises" addresses subscription friction directly
- Trust stat (if available) is critical for non-tech audience — they buy on peer validation

---

### 2.2 — THREE TIER CARDS (SIMPLE / PRO / TEAMS)

**Purpose:**
Quick visual comparison. Lead with price and core appeal. Minimal feature list (top 5 differentiators only).

**Container:**

```
Grid: md:grid-cols-3, gap-8
Mobile: grid-cols-1 (stack)
Card style: rounded-lg, bg-white dark:bg-gray-800, shadow-lg (or shadow-2xl for PRO)
Card padding: p-8
```

**Card Content (top to bottom):**

1. **Tier Name + Badge (if applicable)**
   ```
   <h3>SIMPLE</h3>
   {tier.featured && <badge>Most Popular</badge>}  // PRO only
   ```

2. **Value Prop Line (one sentence, 8–12 words)**
   ```
   SIMPLE:  "Getting started. No monthly cost."
   PRO:     "Growing organizers. Lower fees, better tools."
   TEAMS:   "Multiple sales, multiple people. Full control."
   ```

3. **Price (bold, large)**
   ```
   SIMPLE:   "Free" (on one line)
   PRO:      "$29/mo" (dollar large, "/mo" small)
   TEAMS:    "$79/mo" (dollar large, "/mo" small)
   ```

4. **Fee Info (xs text, muted)**
   ```
   SIMPLE:   "10% platform fee per item"
   PRO:      "8% platform fee per item"
   TEAMS:    "8% platform fee per item"
   ```

5. **CTA Button**
   ```
   SIMPLE:   "Get Started Free" (secondary style if not logged in, disabled if current)
   PRO:      "Upgrade to PRO" (primary style — amber)
   TEAMS:    "Upgrade to TEAMS" (secondary style)

   States:
   - Logged out:        "Get Started Free" / "Sign up for PRO" / "Sign up for TEAMS"
   - Not organizer:     "Start as Organizer" / "Upgrade to PRO" / "Upgrade to TEAMS"
   - Current tier:      "Current Plan" (disabled, gray)
   - Loading:           "Processing..."
   ```

6. **Top 5 Differentiators Only (bullet list, ✓ checkmark)**
   ```
   Each tier shows ONLY the features that distinguish it from lower tiers
   + The 1–2 table-stakes features that all tiers have
   ```

   **Feature Selection Logic (what goes in cards):**

   **SIMPLE** (top 3–4):
   - ✓ Up to 200 items per sale
   - ✓ Up to 5 photos per item
   - ✓ Auto Tags (mention photo-to-tag workflow)
   - ✓ FAQ + Organizer Guide (support tier)

   **PRO** (top 5 — what makes PRO worth $29):
   - ✓ Up to 500 items per sale (2.5x SIMPLE)
   - ✓ Up to 10 photos per item
   - ✓ 2,000 auto tags/month (20x SIMPLE)
   - ✓ Advanced Analytics (new, differentiator)
   - ✓ AI Chatbot Support

   **TEAMS** (top 5 — what makes TEAMS worth 3x PRO):
   - ✓ Unlimited items per sale
   - ✓ Unlimited photos per item
   - ✓ Unlimited auto tags per month
   - ✓ Up to 12 team members (multi-user workspace)
   - ✓ API access & webhooks (for solo power users integrating custom tools)

   **NOT in cards** (move to table):
   - CSV export, Brand Kit, Command Center, Flip Report, etc. (decision support tools, less differentiating)
   - Support SLAs (table covers this better with SLA row)

**Mobile Consideration:**
- On `<md`, cards stack vertically, one per row
- PRO card should visually stand out (scale-up effect removed on mobile for equal emphasis)
- Feature list becomes scrollable on very small screens, or items wrap naturally

---

### 2.3 — À LA CARTE ("PAY AS YOU GO") SECTION

**Purpose:**
Position the $9.99 one-time sale purchase as a **low-friction entry point** for someone who wants to try FindA.Sale without commitment. De-emphasize vs. current implementation.

**Current Problem:**
Purple gradient, prominent placement (below cards) makes it feel like a 4th tier option. Organizers get confused about SIMPLE vs. à la carte.

**New Positioning:**

Place **after** tier cards but **before** the comparison table. Reframe as:
- Not a tier (no subscription, no status)
- A test-drive for skeptical organizers
- Explicitly answer: "Why not just use SIMPLE free?" → "One-time fee gives you temporary PRO features for one sale, then reverts to SIMPLE limits"

**Container:**

```
Width: max-w-2xl (centered)
Background: bg-warm-100 dark:bg-gray-800 (subtle, lighter than featured card)
Border: subtle border-warm-200 / border-gray-700
Padding: p-8
Rounded: rounded-lg
```

**Content (3 parts):**

1. **Headline**
   ```
   "Try a single sale with PRO features"
   (or) "Just testing the waters? Pay for one sale."
   ```

2. **Price + What's Included (3-column sub-grid)**
   ```
   Center column (primary):
   ┌─────────────────────┐
   │ ONE-TIME: $9.99     │
   │                     │
   │ You get:            │
   │ ✓ Up to 500 items   │
   │ ✓ Up to 10 photos   │
   │ ✓ ~500 auto tags    │
   │ ✓ Flip Report       │
   │ ✓ All SIMPLE limits  │
   │    revert after     │
   └─────────────────────┘
   ```

3. **CTA Button**
   ```
   "Create a single sale"
   → Links to /organizer/create-sale (existing flow)
   Style: secondary (not as prominent as tier CTAs)
   ```

**Why this placement & design:**
- Not a tier competitor — positioned as a **time-limited upgrade** to SIMPLE
- Honest copy ("reverts after") prevents buyer's remorse
- Small, centered, subtle design doesn't distract from tier decision
- Clear answer to "why would I pay $9.99 if SIMPLE is free?" → "to test PRO features risk-free"

---

### 2.4 — FEATURE COMPARISON TABLE

**Purpose:**
Exhaustive feature matrix. Answer the "does it have X?" question for every feature across all tiers.

**Current Problem:**
- Column headers (SIMPLE, PRO, TEAMS) and checkmarks are misaligned (CSS bug)
- Feature names don't match card names (e.g., "AI tags" vs. "Auto Tags", "Link click stats" vs. "Ripples")
- 27 rows makes table feel overwhelming; needs grouping

**New Table Structure:**

```
4-column layout: Feature Name | SIMPLE | PRO | TEAMS

Row groups (headers above each group):
1. CORE FEATURES (item limits, photos, tags, basic support)
2. ORGANIZER TOOLS (analytics, exports, branding, POS)
3. TEAM FEATURES (multi-user, roles, audit logs)
4. ADVANCED (API, webhooks, white-label)

Column widths:
- Feature name:  40% (min-w-64)
- SIMPLE:        20% (center-aligned checkmark or value)
- PRO:           20% (center-aligned checkmark or value)
- TEAMS:         20% (center-aligned checkmark or value)

Row alternation: bg-white (odd) / bg-warm-50 dark:bg-gray-900/50 (even)
Row height:      py-4 (16px vertical padding)
```

**CSS Fix for Alignment:**

```
<th class="text-center py-4 px-6">  {/* was px-4 — increase */}
  <div class="space-y-1">
    <p class="font-semibold">SIMPLE</p>
    <p class="text-xs text-gray-600">Free</p>
  </div>
</th>

<td class="py-4 px-6 text-center">  {/* was px-4 — increase */}
  <FeatureCheck included={feature.simple} />
</td>
```

**Feature Rows (Use Consistent Naming):**

| Feature Group | Row | SIMPLE | PRO | TEAMS |
|---|---|---|---|---|
| **CORE FEATURES** | | | | |
| Create unlimited sales | ✓ | ✓ | ✓ |
| Items per sale | 200 | 500 | Unlimited |
| Photos per item | 5 | 10 | Unlimited |
| Auto Tags per month | 100 | 2,000 | Unlimited |
| Holds & Reservations | ✓ | ✓ | ✓ |
| Basic sales analytics | ✓ | ✓ | ✓ |
| Seller verification badge | ✓ | ✓ | ✓ |
| **ORGANIZER TOOLS** | | | | |
| Advanced Analytics | — | ✓ | ✓ |
| Data Export (CSV/PDF) | — | ✓ | ✓ |
| Smart Valuation | — | ✓ | ✓ |
| Flip Report (post-sale PDF) | — | ✓ | ✓ |
| Brand Kit customization | — | ✓ | ✓ |
| Custom storefront slug | — | ✓ | ✓ |
| Social post templates | — | ✓ | ✓ |
| Print Kit templates | — | ✓ | ✓ |
| Ripples (link click stats) | ✓ | ✓ | ✓ |
| **TEAM FEATURES** | | | | |
| Multi-user workspace | — | — | ✓ |
| Invite team members (up to 12) | — | — | ✓ |
| Role-based permissions | — | — | ✓ |
| Shared inventory & sales | — | — | ✓ |
| Team activity audit logs | — | — | ✓ |
| **ADVANCED** | | | | |
| API access & webhooks | — | — | ✓ |
| White-label customization | — | — | ✓ |
| **SUPPORT** | | | | |
| FAQ + Organizer Guide | ✓ | ✓ | ✓ |
| AI Chatbot support | — | ✓ | ✓ |
| Community forum | — | — | ✓ |

**Missing from Current Table (Add These):**
- Smart Valuation (currently called "AI valuation engine" — rename)
- Photo-to-tag workflow (mentioned nowhere — add as core feature row)
- Exports to Facebook Marketplace / Craigslist / EstateSales.NET
- QR codes for signage
- Explorer's Guild / Hunt Pass benefits (shopper-facing, but worth mentioning for organizer lead gen)

**Rows to Remove (Already in Card):**
- POS integration (all tiers, table-stakes)
- Batch operations (all tiers, table-stakes)
- Create unlimited sales (redundant with "items per sale" row)
- Email & SMS reminders (not a differentiator; already in app)

---

### 2.5 — MISSING VALUE PROPS CALLOUT BOX

**Purpose:**
Highlight the features that make FindA.Sale unique — currently **nowhere on the pricing page**. This is critical because non-technical organizers don't realize what they're paying for.

**Placement:**
After tier cards, before comparison table.

**Container:**

```
Width: max-w-3xl (centered)
Background: bg-sage-50 dark:bg-sage-900/20
Border: border-l-4 border-sage-600
Padding: p-8
Rounded: rounded-lg
```

**Content:**

**Headline:**
"What Makes FindA.Sale Different"

**Visual (3-column grid on desktop, single column on mobile):**

```
┌─────────────────────────┬─────────────────────────┬─────────────────────────┐
│ Camera → Tags → Publish │ Export Everywhere       │ Built-In POS System     │
│ ─────────────────────── │ ─────────────────────   │ ─────────────────────   │
│ Snap a photo of your    │ List your items on      │ Take payments on        │
│ item, AI auto-tags it   │ Facebook Marketplace,   │ day-of sale without     │
│ with title, category,   │ Craigslist,             │ leaving the app. Lower  │
│ description, estimated  │ EstateSales.NET in      │ checkout friction than  │
│ value. One click to     │ one click. No copy-     │ cash-only sales.        │
│ publish.                │ pasting across sites.   │ PRO+ feature.           │
└─────────────────────────┴─────────────────────────┴─────────────────────────┘

┌─────────────────────────┬─────────────────────────┬─────────────────────────┐
│ QR Codes for Signage    │ Holds & Reservations    │ Hunter Pass Benefits     │
│ ─────────────────────   │ ─────────────────────   │ ─────────────────────   │
│ Print QR codes for      │ Shoppers can reserve    │ Organize a Hunt Pass    │
│ physical signage. Each  │ items online before     │ event to drive traffic. │
│ QR code links to your   │ pickup. Builds          │ Hunt Pass holders get   │
│ storefront, no app      │ excitement & improves   │ exclusive early access, │
│ needed. Works both at   │ conversion. All tiers.  │ bonus XP. (Shopper-     │
│ sale & as marketing.    │                         │ facing, benefit to you) │
└─────────────────────────┴─────────────────────────┴─────────────────────────┘
```

**Each sub-section:**
- **Icon** (camera, share arrow, shopping cart, qr-code, heart, trophy)
- **Feature name** (bold, 3–4 words)
- **Explanation** (xs–sm text, 2–3 sentences, benefit-focused)
- **Tier availability** (xs text, muted, only if not all tiers)

**Rationale:**
- Organizers don't understand their own value prop until explained in plain language
- Photo-to-publish is the **core differentiator** — must be front-and-center
- Exports solve the "my stuff is trapped here" concern
- Hunt Pass is a shopper benefit, but organizers care because it drives foot traffic

---

### 2.6 — ENTERPRISE / CUSTOM SECTION

**Purpose:**
Capture deals that don't fit TEAMS' $79/mo or organizers with > 12 team members.

**Current Problem:**
Headline "Need Unlimited Team Members?" is too narrow. TEAMS supports 12 team members, which covers most family + small business operations. Enterprise is really for: multi-location franchise operations, auction houses, consignment chains, white-label resellers.

**New Placement:**
After comparison table, before FAQ.

**Container:**

```
Width: max-w-2xl (centered)
Background: bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20
Border: border-amber-200 dark:border-amber-800
Padding: p-8
Rounded: rounded-lg
```

**Content:**

**Headline (revised):**
"Running a team-based operation? Need custom integrations?"

**Subhead:**
"Enterprise plans start at $500/mo with volume discounts, dedicated support, and white-label options."

**Feature List (3 bullet points):**
- Unlimited team members & sales
- Custom integrations & API SLAs
- Dedicated account manager

**CTA:**
"Contact Sales" → Link to `/contact` or `/organizer/contact-sales`

**Button Style:** Amber (matches current)

**Rationale:**
- Opens Enterprise door to more use cases (franchise, auction, reseller)
- Honest price anchor ($500/mo) sets expectations
- "Dedicated account manager" is the actual TEAMS differentiator vs. SIMPLE/PRO
- Lower stakes than current "contact sales" — feels consultative, not a hard sell

---

### 2.7 — FAQ ACCORDION

**Purpose:**
Address common objections quickly. Should reduce support burden for customer service.

**Current State:**
4 questions, good coverage. Keep as-is but reorder by frequency + add 1–2 new questions if feedback warrants.

**Placement:**
After Enterprise section.

**Container:**

```
Width: max-w-3xl (centered)
Background: bg-white dark:bg-gray-800
Padding: p-8
Rounded: rounded-lg
Border: shadow-lg
```

**Recommended Questions (reordered by likely frequency):**

1. **"Can I change plans later?"**
   "Yes, you can upgrade or downgrade anytime. Changes take effect at your next billing cycle."

2. **"Can I cancel anytime?"**
   "Yes. No long-term contracts. You can cancel your subscription immediately and will retain access through your current billing period."

3. **"Is there a free trial?"**
   "SIMPLE is always free — no trial needed. Use it as long as you want. PRO and TEAMS are available for a $1 trial on your first month (if we run one) or you can upgrade from SIMPLE risk-free."

4. **"What payment methods do you accept?"**
   "We accept all major credit cards (Visa, MasterCard, American Express, Discover) via Stripe. Payments are secure and encrypted."

5. **"What happens to my data if I downgrade or cancel?"** *(NEW)*
   "All your sales, items, and photos remain in your account permanently. You can always upgrade again or export your data. We never delete your inventory."

6. **"Do you offer annual discounts?"** *(NEW — only if annual pricing exists)*
   "Not currently. Billing is monthly with no long-term commitment required."

**Accordion Behavior:**
- One question open by default (question 1, "Can I change plans later?")
- Click to expand/collapse
- Smooth animation (transition-all duration-200)

**Mobile:**
- Full width on small screens
- Maintain spacing & readability

---

## SECTION 3: À LA CARTE DECISION TREE

**Question:** Where should à la carte live? As 4th tier card? Before/after main tiers? In the table?

**Recommendation: Dedicated section after tier cards, before comparison table (as spec'd in §2.3)**

**Rationale:**

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **4th tier card** (current approach, improved) | Visual parity; easy to scan | Confuses buyers ("is this a tier or not?"); takes up real estate | ❌ Rejected |
| **In the table** (5th column) | Comprehensive; reference depth | Table gets too wide on mobile; adds clutter to matrix | ❌ Rejected |
| **Dedicated section before table** (RECOMMENDED) | Separates "entry test" from "tiers"; clear positioning; digestible | Adds scroll depth | ✓ Recommended |
| **In Enterprise section** | Consolidates non-recurring options | Lumps impulse buy ($9.99) with enterprise contracts | ❌ Rejected |
| **Sidebar / sticky element** | Doesn't distract; always visible | Breaks mobile layout; feels gimmicky | ❌ Rejected |

**Implementation:**

```
1. Hero
2. Tier cards (3-column grid, md:scale-105 for PRO)
3. [SEPARATOR]
4. À la carte section (centered, subtle)
5. [SEPARATOR]
6. Differentiators callout (3-column grid)
7. [SEPARATOR]
8. Comparison table
9. [SEPARATOR]
10. Enterprise section
11. [SEPARATOR]
12. FAQ
```

---

## SECTION 4: ENTERPRISE PLACEMENT & MESSAGING

**Current Problem:**
Headline "Need Unlimited Team Members?" is too narrow.

**Recommended Headline:**
"Running a larger operation or need white-label solutions?"

**Recommended Subhead:**
"Custom Enterprise plans start at $500/mo. Annual discounts available. Includes dedicated support and full API access."

**CTA:**
"Contact Sales" or "Request a demo" (your choice)

**Placement:**
After comparison table, before FAQ. Maintains visual hierarchy.

---

## SECTION 5: 2026 BEST PRACTICES — WHAT APPLIES & WHAT DOESN'T

### ✓ APPLY (to FindA.Sale)

| Practice | Why It Applies | Implementation |
|---|---|---|
| **Story-driven hero headline** | Emotional connection > feature list for non-tech buyers | "One tool for every sale" vs. "Simple, Transparent Pricing" |
| **Trust bar (social proof)** | Estate sale organizers buy on peer validation, not feature lists | "Used by 5,000+ organizers managing $2M+ in sales" (if available) |
| **Outcome-based testimonials** | "This saved me 3 hours" resonates more than "advanced analytics" | Single 1–2 sentence testimonial under hero (if available) |
| **Value proposition callout** | Non-tech users don't understand what "API" means | Differentiators section explaining photo-to-publish, exports, POS, Hunt Pass |
| **Clear CTA per tier** | Reduces decision paralysis | "Get Started Free", "Upgrade to PRO", "Upgrade to TEAMS" (context-aware) |
| **Dark mode support** | Mobile-first users, outdoor sales environments (low light) | Already implemented; maintain contrast ratios |
| **Mobile-first layout** | Cards stack on mobile (existing); ensure table is scrollable | Already done; verify on iPhone SE (375px) |
| **Feature grouping in table** | 27 features is overwhelming; group by category (core, organizer tools, team, advanced) | Table row groups with headers |

### ✗ SKIP (premature for stage & audience)

| Practice | Why It Doesn't Apply | What To Do Instead |
|---|---|---|
| **Annual/monthly billing toggle** | Non-technical audience has decision fatigue; annual pricing creates trust issue ("will I still use this in 12 months?"). Best practice for SaaS unicorns, not beta-stage products. | Keep monthly-only. If annual discount is future priority, add it in S400+. |
| **Interactive pricing slider** | Non-technical users get confused. "What does $X/mo get me?" is already clear in cards. | Skip. Simplicity > interactivity. |
| **ROI calculator** | Too much friction for initial pricing page. "What's my ROI on $29/mo?" assumes use case. | Skip. Add post-signup in onboarding if needed. |
| **Multi-step checkout flow** | Stripe Checkout is already streamlined. Extra steps = abandonment. | Keep existing /stripe/checkout-session flow. |
| **Live chat for pricing questions** | "Zero human support" is a stated constraint. Proactive AI chatbot (PRO+) can answer via FAQ first. | Use FAQ effectively; add AI chatbot link if PRO/TEAMS users click "Still have questions?" |
| **Trending/popularity badge on cards** | "Most Popular" badge on PRO is enough. Too many visual signals = noise. | Keep PRO "Most Popular" badge; skip "trending" or "recommended for you" |
| **Comparison mode toggle** (hide/show rows) | Non-technical users trust full tables more than filtered views. | Skip. Show all rows; use grouping to reduce overwhelm. |

---

## SECTION 6: TABLE ALIGNMENT FIX (TECHNICAL NOTE FOR DEV)

### Problem

Current TierComparisonTable has misaligned column headers and checkmarks. Visual inspection:
- Header cells (`<th>`) have padding `px-4` (16px)
- Data cells (`<td>`) have padding `px-4` (16px)
- But the feature name column (`<td>`) is much wider (`min-w-48`) due to long text wrapping
- Result: checkmark columns don't align vertically with headers

### Root Cause

```jsx
// Current (broken):
<thead>
  <tr>
    <th class="...px-4...min-w-48">Feature</th>
    <th class="...px-4...">  ← All headers same padding
      <div class="space-y-1">
        <p>SIMPLE</p>
        <p class="text-sm">Free</p>
      </div>
    </th>
  </tr>
</thead>

<tbody>
  <tr>
    <td class="...px-4...text-sm...">Long feature name wrapping to 2 lines</td>
    <td class="...px-4...text-center">
      <FeatureCheck />  ← Misaligned if td height > 1 line
    </td>
  </tr>
</tbody>
```

### Solution

```jsx
// Fixed:
<table class="w-full border-collapse">
  <thead>
    <tr class="border-b">
      <th class="text-left py-4 px-6 font-semibold min-w-64">Feature</th>
      <th class="text-center py-4 px-6">
        <div class="space-y-1">
          <p class="font-semibold text-gray-900 dark:text-gray-100">SIMPLE</p>
          <p class="text-xs text-gray-600 dark:text-gray-400">Free</p>
        </div>
      </th>
      <th class="text-center py-4 px-6">
        <div class="space-y-1">
          <p class="font-semibold text-gray-900 dark:text-gray-100">PRO</p>
          <p class="text-xs text-gray-600 dark:text-gray-400">$29/mo</p>
        </div>
      </th>
      <th class="text-center py-4 px-6">
        <div class="space-y-1">
          <p class="font-semibold text-gray-900 dark:text-gray-100">TEAMS</p>
          <p class="text-xs text-gray-600 dark:text-gray-400">$79/mo</p>
        </div>
      </th>
    </tr>
  </thead>

  <tbody>
    {FEATURES.map((feature, index) => (
      <tr key={index} class={`border-b ${index % 2 === 1 ? 'bg-gray-50 dark:bg-gray-900' : ''}`}>
        <td class="text-left py-4 px-6 text-sm font-medium text-gray-700 dark:text-gray-300">
          {feature.name}
        </td>
        <td class="text-center py-4 px-6 align-middle">
          <FeatureCheck included={feature.simple} />
        </td>
        <td class="text-center py-4 px-6 align-middle">
          <FeatureCheck included={feature.pro} />
        </td>
        <td class="text-center py-4 px-6 align-middle">
          <FeatureCheck included={feature.teams} />
        </td>
      </tr>
    ))}
  </tbody>
</table>
```

### Key Changes

1. **Increase horizontal padding** from `px-4` to `px-6` (24px) — better visual breathing room
2. **Add `align-middle`** to all data `<td>` cells — vertically centers checkmarks regardless of row height
3. **Increase feature column min-width** from `min-w-48` to `min-w-64` (256px) — accommodates longer feature names without wrapping
4. **Explicit `py-4`** on all cells — consistent row height (16px top + 16px bottom)

### Optional Enhancement: Row Groups

Add category headers above feature groups:

```jsx
<thead>
  <tr class="bg-gray-100 dark:bg-gray-800">
    <th colspan="4" class="text-left py-3 px-6 font-semibold text-sm text-gray-900 dark:text-gray-100">
      CORE FEATURES
    </th>
  </tr>
</thead>

<tbody>
  {/* CORE feature rows here */}
  <tr>...</tr>

  {/* ORGANIZER TOOLS header */}
  <tr class="bg-gray-100 dark:bg-gray-800">
    <td colspan="4" class="text-left py-3 px-6 font-semibold text-sm text-gray-900 dark:text-gray-100">
      ORGANIZER TOOLS
    </td>
  </tr>

  {/* ORGANIZER TOOLS feature rows here */}
</tbody>
```

This groups 27 features into 4 digestible categories, reducing cognitive load.

---

## SECTION 7: FEATURE NAMING ALIGNMENT CHECKLIST

**Problem:** Inconsistent naming between card, table, and in-app menu causes confusion.

**Solution:** Use these exact names everywhere:

| Feature | Approved Name | Where It Appears |
|---|---|---|
| `AI tags` | **Auto Tags** | Card, table, help text |
| `AI valuation engine` | **Smart Valuation** | Card, table, help text |
| `Link click stats` | **Ripples** | Card, table (use "Ripples — link click stats" in table for clarity) |
| `Multi-user workspace` | **Multi-user workspace** (or **Team workspace**) | Table, cards |
| `Email support, 48-hour SLA` | **Email support (48h response)** | Table |
| `Email support, 24-hour SLA + 1 onboarding call` | **Email support (24h response) + onboarding** | Table |
| `Dedicated account manager` | **Dedicated account manager** | Table, TEAMS/Enterprise |
| `API & webhooks` | **API access & webhooks** | Table, card (TEAMS only) |
| `White-label options` | **White-label customization** | Table, Enterprise |

---

## SECTION 8: IMPLEMENTATION PRIORITIES

### Phase 1 (High Impact, Medium Effort) — Recommended for S392+

1. **Hero copy update** → "One tool for every sale, any size" + trust stat
2. **Card feature reduction** → Replace 10–25 item lists with top 5 differentiators
3. **À la carte repositioning** → Move to dedicated section, subtle design
4. **Differentiators callout** → Add 6-box section explaining photo-to-publish, exports, POS, Hunt Pass
5. **Enterprise headline revision** → "Running a larger operation..." vs. "Need unlimited team members?"
6. **Feature naming alignment** → Find-replace "AI tags" → "Auto Tags", "Link click stats" → "Ripples", etc.

### Phase 2 (Polish, Low Effort) — S393+

7. **Table row grouping** → Add category headers (CORE, ORGANIZER TOOLS, TEAM, ADVANCED)
8. **Table alignment fix** → CSS `px-4` → `px-6`, add `align-middle`, increase column min-width
9. **FAQ reordering** → Move cancel/downgrade questions higher; add data retention question
10. **Annual/monthly toggle** → If annual pricing launches (defer until S400+)

### Phase 3 (Future, Lower Priority)

11. Trust bar styling (if stats available)
12. Testimonial slot (if quotes available)
13. AI chatbot pricing widget (if FAQ link proves insufficient)

---

## APPENDIX A: MOBILE BREAKPOINTS & CONSIDERATIONS

### iPhone SE (375px) — Minimum Support

- **Tier cards:** Single column stack
- **À la carte:** Full width
- **Differentiators:** Single column (6 boxes stack vertically)
- **Table:** Horizontal scroll enabled; feature column fixed at min-w-64
- **Enterprise section:** Full width, centered

### iPad (768px+) — `md` breakpoint

- **Tier cards:** 3-column grid, PRO card scale-105
- **À la carte:** Centered, max-w-2xl
- **Differentiators:** 2–3 column grid
- **Table:** Fully visible, no horizontal scroll
- **Enterprise section:** Full width, centered

### Desktop (1024px+)

- **Layout:** max-w-7xl (1280px) container
- **Tier cards:** 3-column, 8 gap
- **All sections:** Full breathing room, no constraint

---

## APPENDIX B: COPY GUIDELINES

### Tone for Organizers (40–65, non-technical)

- **Use:** Simple, direct sentences. "What's in it for me?" framing. Numbers and specifics (not vague superlatives).
- **Avoid:** Jargon ("webhooks", "API", "white-label" — explain or omit). Hype ("game-changing", "revolutionary"). Passive voice.

### Examples

**Bad:**
"Advanced orchestration capabilities through white-label API integrations enable enterprise synergy."

**Good:**
"Connect FindA.Sale to your own tools with API access."

**Bad:**
"Flip Report generation for comprehensive post-sale analysis."

**Good:**
"Flip Report — a summary of what you sold, what you earned, what to inventory next time."

**Bad:**
"Unlimited concurrent sales management."

**Good:**
"Run multiple sales at the same time."

---

## APPENDIX C: CONVERSION FUNNEL NOTES

### Expected User Flows

**Flow 1: Logged-Out Shopper → Organizer**
1. Land on pricing page
2. Click "Get Started Free" (SIMPLE) or "Sign up for PRO"
3. Redirect to register page
4. Post-register, become organizer via modal
5. Land on organizer dashboard

**Flow 2: SIMPLE Organizer → PRO**
1. On pricing page, click "Upgrade to PRO"
2. Stripe checkout (existing /stripe/checkout-session flow)
3. Redirect to dashboard with "upgrade=success" query param
4. Show toast: "Welcome to PRO! Your new features are live."

**Flow 3: À la Carte Test**
1. On pricing page, click "Create a single sale"
2. Redirect to /organizer/create-sale (existing form)
3. Checkout flow for $9.99 one-time fee
4. Sale launches with PRO-level limits for that sale only
5. Subsequent sales revert to SIMPLE limits (unless upgraded)

### Metrics to Track (post-launch QA)

- Click rate: SIMPLE vs. PRO vs. TEAMS vs. À la Carte
- Checkout conversion rate per tier
- Time spent on pricing page (longer = higher friction)
- Exit rate from pricing page (high = unclear messaging)
- FAQ accordion expansion rates (which questions matter most?)

---

## CONCLUSION

The revised pricing page moves from a feature-dump approach to a **value-story approach** appropriate for non-technical organizers:

1. **Hero** → Emotional hook ("One tool for every sale")
2. **Cards** → Quick decision (top 5 differentiators, clear price, CTA)
3. **À la carte** → Low-friction test drive
4. **Differentiators** → "Why FindA.Sale?" (photo-to-publish, exports, POS, Hunt Pass)
5. **Table** → Proof for fence-sitters (exhaustive feature matrix)
6. **Enterprise** → Open door for larger teams
7. **FAQ** → Common objections answered

This structure respects the audience (non-technical, mobile-first, decision-anxious) while incorporating 2026 best practices that actually apply to a beta-stage product with a mature demographic.

---

**Next Step:** Patrick reviews this spec. If approved, dispatch findasale-dev to implement Phase 1 changes (copy, card layout, differentiators callout, and feature naming alignment).
