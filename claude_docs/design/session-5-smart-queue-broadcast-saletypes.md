# Design Session 5 — Smart Review Queue · Broadcast Composer · Sale Type Matrix
FindA.Sale · May 2026 · Mid-fi target

---

## Context

FindA.Sale is a two-sided PWA for secondary sale organizers (estate sales, yard sales,
auctions, flea markets, antique malls) and shoppers. You have an established design system
from Sessions 1–4: light as the default public tone, dark as organizer-selectable, parchment
`#F4EFE7` email base, accent `#C8552B` light / `#E97C4D` dark, Inter + Inter Tight + JetBrains
Mono, fs-shared.jsx token set.

**Brand voice:** Warm, local, knowledgeable. No "AI" in copy — use "Smart" or "Auto."
Organizer-set values always win over Smart suggestions; design should reflect that hierarchy
visually.

**Three briefs this session:**
- **Brief D** — Bulk Smart review queue (item manager, post-upload)
- **Brief E** — Broadcast composer (organizer → followers, Pro/Teams)
- **Brief F** — Sale type matrix (expanded types + badge system)

---

## Brief D — Bulk Smart Review Queue

### What it is

When an organizer uploads a batch of photos in the item manager, the Smart pipeline
(Cloudinary → AI) processes each photo and generates suggested fields: title, category,
condition, price, tags, rarity. These items land in a **review queue** — the organizer
must confirm or edit each one before items publish to the live sale.

The Session 3 item manager entry state showed the two entry paths ("Add one by one" vs.
"Bulk Smart upload"). This brief designs what happens **after** the organizer taps
"Bulk Smart upload" — the review queue itself.

### What exists in the data

**Item fields relevant to the queue:**
- `draftStatus` — DRAFT / PENDING_REVIEW / PUBLISHED
  Items from Smart upload land as `PENDING_REVIEW`. The queue shows only PENDING_REVIEW items.
- `isAiTagged` — true when AI generated the fields (drives the review border treatment)
- `title`, `description` — AI-generated, editable
- `category` — eBay L1 category (e.g. "Home & Garden", "Jewelry & Watches")
- `condition` — NEW / USED / REFURBISHED / PARTS_OR_REPAIR
- `conditionGrade` — S / A / B / C / D (null until set)
- `price` — organizer's final price (AI suggestion stored separately)
- `aiSuggestedPrice` — what AI recommended (shown as a reference, never the final value)
- `rarity` — COMMON / UNCOMMON / RARE / LEGENDARY (AI suggests, organizer confirms)
- `tags[]` — AI-generated search tags
- `photoUrls[]` — already uploaded; first photo is the cover

**Critical rule:** `aiSuggestedPrice` is a reference, never a default. The organizer's
price field must start empty (or at the AI suggestion shown as a ghosted placeholder),
not pre-filled. Organizer-set values always win. This has been a recurring bug — design
should make the distinction visually unambiguous.

### The queue flow

**Entry state — upload in progress:**
- Photo strip with upload progress per item (spinner → checkmark as AI processes)
- "Smart is reading your photos" status line — not "AI is analyzing"
- Estimated time: "Usually done in under a minute for 20 photos"
- While processing: the organizer can watch progress but can't review yet

**Queue view — ready to review:**
- List of PENDING_REVIEW items, one card per item
- Each card has a **review border** — a left accent stripe in amber/warning color — to
  signal "needs your eyes"
- Card anatomy (left to right on desktop, stacked on mobile):
  - Photo thumbnail (tap to zoom or reorder photos)
  - Title — editable inline, AI-generated value shown, cursor placed at end
  - Category — dropdown pre-selected by AI; organizer can change
  - Condition — segmented control (NEW / USED / REFURBISHED / PARTS)
  - Price — **empty field with AI suggestion as placeholder text** (e.g., `$45 suggested`)
    The placeholder disappears on focus. Organizer types their price. Never pre-fill.
  - Rarity — COMMON pre-selected; RARE+ shown with a badge preview
  - Tags — chip row; AI tags shown with an "×" to remove, "+" to add more
- Two actions per card: **Approve** (publishes item) · **Edit more** (opens full item editor)
- Keyboard shortcut: Tab through fields, Enter to approve, moves to next item

**Bulk actions bar (top of queue):**
- "X items pending review"
- "Approve all" — approves every item with its current (possibly edited) values.
  Requires a confirmation step: "Publish X items to [Sale Name]? You can edit them later."
- "Discard all" — removes all PENDING_REVIEW items. Destructive — requires confirmation.

**Progress indicator:**
- As items are approved: "8 of 24 published" counter updates live
- Approved items slide out of the queue (don't stay as greyed-out clutter)
- When queue is empty: success state — "All [N] items are live" with a link to view the
  sale listing

**Mobile-specific behavior:**
- Full-screen card per item — swipe left to approve, swipe right to skip (review later)
- Skip moves item to the bottom of the queue, not to a "skipped" limbo
- "Approve all" is available as a bottom-sheet action, not a floating button

**Empty price state — zero tolerance for ambiguity:**
- If organizer taps "Approve" with an empty price field: block with inline error —
  "Set a price before publishing" — field highlights in red
- Exception: POS items (cash only, no listed price) have a "Price at door" toggle that
  clears the price requirement
- Never auto-fill price from `aiSuggestedPrice` on approve — make the organizer type it

### Questions for design to answer back

1. Should the review border (amber stripe) persist after the organizer edits a field, or
   clear once they've touched the card?
2. "Approve all" with empty prices — block the whole batch or approve only priced items
   and flag the rest?
3. On mobile swipe-to-approve: should swiping require a price to be set first, or should
   swipe be a "stage for approval" action that still requires price before final publish?
4. Should AI-generated tags be visually distinguished from organizer-added tags after the
   fact, or treated identically once approved?

---

## Brief E — Broadcast Composer

### What it is

Organizers can send a direct message to all their followers — a sale-day reminder,
a teaser for new inventory, a flash deal announcement. Available on **Pro and Teams only**.

The `OrganizerBroadcast` model already exists in the schema:
- `subject` — the message subject line / headline
- `message` — body text
- `sentAt`, `recipientCount` — populated on send

Broadcasts arrive as email (via the follow notification system) and push (via
`PushSubscription`). The email format reuses the base template + text block module
from Session 4.

### Where it lives

**Access point:** Organizer dashboard sidebar — "Broadcasts" nav item (already in the
Session 3 dashboard shell design). Tapping it opens the broadcast history / composer.

**Secondary access:** Quick-compose button on the Sale Pulse card — "Message your
[N] followers" — which pre-loads the composer with a sale-day template.

### The composer flow

**Step 1 — Broadcast history + compose entry**
- List of past broadcasts: date, subject, recipient count, open-rate placeholder ("–" for
  now — not tracked in v1)
- "New broadcast" button — primary CTA, opens composer
- Empty state for first broadcast: "You have [N] followers. Send them a message."

**Step 2 — Composer**
Two-panel layout on desktop: compose left, preview right (live as they type).
Single-column on mobile with a "Preview" toggle tab.

Left panel:
- Subject line — one line, 60-char soft limit with counter
- Message body — free text, ~3–5 sentences max. Character counter. No rich text.
- Optional: attach a sale — dropdown of their PUBLISHED sales. Attaching a sale appends
  a sale card (from the email module set) below the message body in the preview.
- Optional: attach a link — URL field for external links (website, auction platform, etc.)

Right panel (live preview):
- Shows the email rendering: inbox chrome (From / Subject / Preheader), full email layout
  using the Session 4 base template + text block module
- Toggle: "Email preview" / "Push preview" — push preview shows a phone notification
  chrome with the subject as the notification title and the first line of message as body

**Step 3 — Send confirmation**
Before sending, a modal:
- "Send to [N] followers?"
- Recipient count prominent
- Frequency guardrail warning if applicable (see below)
- Two buttons: "Send now" / "Cancel"
- No scheduling in v1 — send now only

**Frequency guardrails:**
- Limit: 1 broadcast per 7 days per organizer (enforced in backend)
- If organizer tries to send within 7 days of last broadcast: show inline warning in the
  composer — "You sent a broadcast [X days] ago. You can send again on [date]." Primary
  button is disabled. Not a hard block in the UI — show the date, disable Send.
- Teams organizers: same limit applies to the parent account's broadcast, not sub-vendors

**Step 4 — Sent state**
- Full-screen confirmation: "Broadcast sent to [N] followers"
- Shows the sent message as a read-only card
- Link to view broadcast history
- "Back to dashboard" quiet link

### Quick-compose templates (pre-loaded text)

Accessible via a "Templates" dropdown in the composer. Three templates:
1. **Sale day** — "We open [tomorrow/today] at [time]. [Address]. [Sale name] — come find
   something great." (Placeholders filled from attached sale if one is selected.)
2. **New inventory** — "Just added [N] new items to [Sale name]. Some great [category]
   pieces in the mix — come take a look before they go."
3. **Flash deal** — "[N] items marked down today only. [Sale name] closes [day]."

Templates are starting points — organizer edits freely before sending.

### Pro/Teams gate

- Simple organizers see the "Broadcasts" nav item as greyed out with a lock icon
- Tapping it shows an upgrade prompt: "Broadcasts are available on Pro and Teams.
  Message your followers directly — upgrade to unlock."
- Don't hide the feature entirely; showing it (locked) is part of the upgrade nudge

### Questions for design to answer back

1. Should the live preview update on every keystroke, or on a short debounce (300ms)?
   Keystroke feel is ideal but may be distracting on mobile.
2. For the attached sale card in the preview: use the full Session 4 sale card module,
   or a compact single-line version to keep the broadcast short?
3. Should "Templates" be a dropdown in the composer header, or a separate step before
   the composer opens?
4. What's the empty-state treatment when an organizer has 0 followers? ("You have 0
   followers — share your storefront to build your audience" + storefront link, or
   hide the Broadcasts nav item entirely until they have ≥1?)

---

## Brief F — Sale Type Matrix

### What it is

`Sale.saleType` currently supports: ESTATE / YARD / AUCTION / FLEA_MARKET / RETAIL (just
added). Five sale types that cover most of the market, but leave out real organizer
categories that exist in the product today. This brief designs the **visual identity and
badge system** for an expanded set, and the updated Step 1 of the sale creation wizard.

No new engineering scope is needed for this brief — all new types map to the existing
`saleType` field. The goal is to make each type feel intentional and distinct in the UI
rather than a flat string.

### The expanded type set

Design a badge/pill for each type — distinct icon, label, and a subtle color or texture
that makes the type scannable in a sale card grid.

| Type | Current enum value | Display label | Who uses it |
|---|---|---|---|
| Estate Sale | ESTATE | Estate Sale | Estate companies, liquidators |
| Yard / Garage Sale | YARD | Yard Sale | One-time homeowners |
| Auction | AUCTION | Auction | Auction houses, bidding events |
| Flea Market | FLEA_MARKET | Flea Market | Recurring vendor markets |
| Retail / Shop | RETAIL | Antique Shop · Salvage · Retail | Always-open storefronts |
| Moving Sale | YARD (subtype) | Moving Sale | Homeowners relocating |
| Pop-Up | FLEA_MARKET (subtype) | Pop-Up | Temporary vendor events |
| Charity / Nonprofit | ESTATE (subtype) | Benefit Sale | Charity, nonprofit, church |
| Storage Auction | AUCTION (subtype) | Storage Auction | Storage unit facilities |
| Online Only | new flag | Ships Nationwide | Online-only, no address required |

**Note on subtypes:** Moving Sale, Pop-Up, Charity, and Storage Auction are subtypes of
existing enums — they don't need new enum values, just a secondary `saleSubtype` display
flag. Design for the display; data spec will follow. Online Only needs a flag
(`isOnlineOnly`) rather than a new type.

### What to design

**1. Sale type badge system**
- Each type gets: an icon (from the established icon set or two new additions), a
  label, and a treatment for how it appears on a sale card
- Base: colored pill (same component as status pills from Sessions 1–2)
- Differentiation should be icon + label — avoid too many colors; the accent palette
  is fixed. Use icon shape + label to carry most of the meaning.
- Charity/Benefit Sale: add a small "♥" or heart badge — the only type that gets a
  visual indicator beyond the type pill (signals nonprofit nature to shoppers)
- Online Only: replace the map/location elements with a shipping icon and "Ships
  nationwide" wherever address/map would appear

**2. Updated wizard Step 1 (type selector)**
Session 3 designed four tiles. Expand to cover the full matrix without overwhelming
a first-time organizer. Suggested approach:
- Keep four primary tiles (Estate / Yard & Moving / Auction / Market & Pop-Up)
- Each primary tile expands on tap to show subtypes: "Yard Sale" expands to show
  "Yard / Garage Sale" and "Moving Sale" as radio options
- "Charity / Benefit Sale" lives as a checkbox on the Estate tile: "This is a
  benefit or charity sale" — it's not a primary type, it's a modifier
- "Online Only / Ships Nationwide" lives as a toggle at the bottom of Step 2
  (dates & location) — "No physical address — items ship to buyers" — because
  it affects the location step, not the type step

**3. Sale card treatments**
For each type, show how the sale card (from Sessions 1–2) adapts:
- Moving Sale: same as Yard but with a "Moving Sale" pill instead. No other changes.
- Pop-Up: add a recurring indicator if the sale has a template / recurs — small
  "↻ Weekly" chip.
- Charity / Benefit: heart badge overlaid on the sale card photo (top-right corner),
  "Benefit Sale" pill replaces Estate pill. Organizer name may show charity name.
- Storage Auction: gavel icon, "Storage Auction" pill, no item preview (lots not
  browseable in the same way).
- Online Only: shipping icon replaces map pin in the info strip. "Ships nationwide"
  or "Ships to [state]" depending on data. No map thumbnail.

**4. Explore / discovery filter update**
The category filter strip on the homepage (Brief A) showed: Estate · Yard · Auction ·
Flea Market · All. Design an updated filter strip that accommodates the expanded types
without becoming a scrollable wall of options. Suggested grouping:
- Estate | Yard & Moving | Auction | Markets & Pop-Ups | Online | All
- "Charity" is not a top-level filter — it's a badge that any type can have

### Questions for design to answer back

1. Should subtypes (Moving Sale, Pop-Up, Charity, Storage Auction) be visually distinct
   from their parent types in the sale card grid, or only distinguishable on close inspection?
   (i.e., does a Moving Sale card need to look meaningfully different from a Yard Sale card
   to a cold shopper scrolling the feed?)
2. For Online Only: when there's no address, what goes in the location/map slot on the
   sale detail page? ("Ships nationwide" + a shipping icon? A ship-to-state selector?)
3. The charity heart badge — should it be organizer-self-reported, or require a
   verification step (upload nonprofit docs) before the badge appears?
4. Does "Storage Auction" need its own storefront variant (like Auction House in Session 1),
   or is the existing Auction variant close enough with a different type pill?

---

## What to deliver back

**Brief D — Smart review queue:**
1. Upload-in-progress state (photo strip with per-item progress)
2. Review queue — desktop and mobile
3. Single item card — all field states (empty price, AI suggestion as placeholder, rarity selector)
4. "Approve all" confirmation modal
5. Empty queue success state
6. Mobile swipe-to-approve interaction

**Brief E — Broadcast composer:**
1. Broadcast history + entry state (desktop)
2. Composer — desktop two-panel (compose + live preview)
3. Composer — mobile single-column with preview toggle
4. Send confirmation modal
5. Sent confirmation state
6. Pro/Teams upgrade gate (Simple organizer locked view)
7. Quick-compose from Sale Pulse card

**Brief F — Sale type matrix:**
1. Badge system reference sheet — all 10 types, icon + pill treatment
2. Updated wizard Step 1 — expanded type selector with subtypes
3. Sale card variants — Moving Sale, Pop-Up, Charity, Storage Auction, Online Only
4. Updated homepage filter strip
5. Answers to questions above
