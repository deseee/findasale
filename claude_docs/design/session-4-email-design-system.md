# Design Session 4 — Email Design System
FindA.Sale · May 2026 · Mid-fi target

---

## Context

FindA.Sale is a two-sided PWA for secondary sale organizers (estate sales, yard sales,
auctions, flea markets, antique malls) and shoppers. Email is the primary re-engagement
channel for both sides of the marketplace. Organizers get digests and alerts; shoppers get
sale announcements, reminders, and follow notifications.

**Email provider:** Resend (transactional). MailerLite (marketing/digest campaigns).
**Rendering:** HTML email — must work in Gmail, Apple Mail, Outlook, and iOS/Android
native clients. No CSS Grid, no Flexbox reliably — use table-based layout for structure,
modern CSS only for cosmetic polish with fallbacks.

**Brand voice:** Warm, local, knowledgeable neighbor. Not corporate. Short sentences.
Subject lines should feel like a text from a friend, not a marketing blast.
No "AI" anywhere. Use "Smart" or "Auto."
Sender name: "The FindA.Sale Team" — never Patrick's name, never "Founder."

**Design system established in Sessions 1–3:** Token set, accent colors, typography. Email
should feel like a digital extension of the PWA — same warmth, lighter density.

---

## Why this matters

Every organizer and shopper in the product will receive these emails. Right now the emails are
plain functional HTML — no brand identity, no visual hierarchy, no personality. A well-designed
email system does three things:
1. Builds trust so recipients open the next one
2. Drives the one action we want per email (not five)
3. Makes FindA.Sale feel like a real product, not a side project

**The goal:** One email template system that covers all use cases. Not 12 one-off designs.

---

## The template system — structure first

Design a **base template** with these zones:

```
[ Header — logo + nav link ]
[ Hero — headline + optional image ]
[ Body — content blocks (modular) ]
[ CTA — single primary button ]
[ Footer — address + unsubscribe + social ]
```

Then design **5 content modules** that slot into Body:

1. **Sale card** — photo thumbnail, title, date, location, primary CTA
2. **Item card** — photo, title, price, rarity badge, "View item" link
3. **Metric row** — icon + stat + plain-language interpretation (for organizer digests)
4. **Text block** — headline + 2–3 sentences + optional link
5. **Quick wins list** — 3 items with icons and one-tap action links (for organizer pulse)

Any email is assembled from the base template + 1–4 modules. The system should feel like
blocks snapping together, not custom layouts per email.

---

## The 7 emails to design

### Email 1 — Shopper: New sale from followed organizer

**Trigger:** Organizer publishes a sale; shopper follows that organizer
**Goal:** Get the shopper to the sale detail page
**Tone:** Excited tip from a friend
**Subject line direction:** "[Organizer Name] just posted a sale near you"

Content:
- Sale card module (photo, title, dates, address)
- 2–3 featured items if available (item card modules)
- Single CTA: "View the sale →"
- Below CTA: soft "Invite a friend" nudge (referral link)

Design note: The sale photo is the most important element. If no sale photo, show a
branded placeholder — never a broken image.

---

### Email 2 — Shopper: Sale day reminder

**Trigger:** 24 hours before a saved/subscribed sale starts
**Goal:** Remind and drive attendance
**Tone:** Practical, day-before checklist energy
**Subject line direction:** "Your sale is tomorrow — [Sale Title]"

Content:
- Sale name and date/time (large, scannable)
- Address with one-tap map link
- Day-of notes field (`Sale.notes`) if set — "Parking tip: side street"
- Items the shopper has saved from this sale (if any) — "Your saved items"
- Single CTA: "Get directions →" or "View sale →"

Design note: This email is read at 7am the morning before a sale. Make it scannable
in 5 seconds on a phone screen. No long copy.

---

### Email 3 — Shopper: Welcome / account created

**Trigger:** New shopper creates an account
**Goal:** Drive their first save or follow
**Tone:** Welcoming, low-pressure
**Subject line direction:** "Welcome to FindA.Sale — here's where to start"

Content:
- One-sentence value prop: "We'll help you find estate sales, yard sales, auctions,
  and more — and let you know when something great is near you."
- Two actions (not one, because it's a welcome):
  1. "Browse sales near you →"
  2. "Set your interests →" (categoryInterests)
- Brief "how it works" — three steps, icon + one line each:
  1. Browse or search sales near you
  2. Save sales and items you want to revisit
  3. Follow organizers to get alerts for their next sale
- No feature list. No terms recap. No "here's your account details."

---

### Email 4 — Organizer: Weekly digest

**Trigger:** Every Monday morning for organizers with at least one sale in the past 30 days
**Goal:** Surface key metrics and drive one re-engagement action
**Tone:** Friendly weekly check-in from a coach, not a report
**Subject line direction:** "Your week at FindA.Sale — [N] views, [N] saves"

Content:
- Greeting: "Here's how [businessName] did this week"
- 3–4 metric rows: Views, Saves, New Followers, Items Sold
  Each row: icon + number + plain-language context ("8 views — add photos to increase reach")
- If any sale is coming up: sale card module for the next sale
- Quick wins block (same as Sale Pulse Brief C from Session 1): 2–3 actions with links
- Single CTA: "View your dashboard →"
- Unsubscribe: "Manage email preferences" (links to notification prefs — not a global unsubscribe that kills all email)

Design note: Organizers open this email to see one number: views. Lead with it.
Everything else is secondary.

---

### Email 5 — Organizer: Onboarding sequence (3 emails)

Three emails sent over the first 7 days after signup. Design as a series — consistent
header treatment, numbered "Step X of 3" indicator.

**Email 5a — Day 0 (immediately after signup)**
Subject: "You're in — here's your first step"
Goal: Create first sale
Content:
- One CTA only: "Create your first sale →"
- Three social proof bullets: "Organizers who post within 24 hours get 4x more first-week views"
- No feature tour. No settings. No profile completion nag. Just the one thing.

**Email 5b — Day 2 (if no sale created)**
Subject: "Quick question, [firstName]"
Goal: Remove friction — understand why they haven't posted
Content:
- "Still getting set up? Here's what takes most people less than 5 minutes:"
- Three mini-steps with links: (1) Pick your sale type, (2) Add an address, (3) Upload one photo
- Softer CTA: "Start where you are →"

**Email 5c — Day 7 (if no sale created)**
Subject: "One last nudge — then we'll leave you alone"
Goal: Last activation attempt before deprioritizing in comms
Content:
- Warmth, no guilt: "We know setting up something new takes time."
- Show a real example: "An organizer near you posted their first sale last week and got 34 views in 48 hours."
- CTA: "Create your first sale →"
- Small print: "Not ready yet? No worries — your account stays active."

---

### Email 6 — Shopper: Smart match alert

**Trigger:** A new item is posted that matches a shopper's saved wishlist or categoryInterests
**Goal:** Drive click-through to the item
**Tone:** Excited tip — "thought you'd want to know"
**Subject line direction:** "Found something that might be yours — [item title]"

Content:
- Item card module (photo, title, price, category, rarity badge)
- Sale card below it (the sale it's in — dates, location)
- CTA: "View this item →"
- Below: "Not interested? Update your interests →"

Design note: One item per email. If 3 items matched today, send one email with
the best match — not 3 emails. Batch logic is handled in code; design for the
single-item version.

---

### Email 7 — Organizer: Sale went live confirmation

**Trigger:** Organizer publishes a sale
**Goal:** Confirm it's live + prompt sharing
**Tone:** Celebratory, action-oriented
**Subject line direction:** "Your sale is live — share it now"

Content:
- Confirmation: "[Sale Title] is live on FindA.Sale"
- Sale link (large, tappable): finda.sale/sales/[id]
- Share prompt: "The more you share, the more shoppers find you."
  Three share options as inline links: Copy link · Share on Facebook · Share on Instagram
- Metric context: "Sales shared in the first hour average 2x more views"
- Secondary CTA: "Add items to your sale →" (links to item manager)

---

## Base template specs

**Width:** 600px max (standard email safe width)
**Fonts:** System stack — `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
  (Web fonts don't render in Outlook — use system fonts, match Inter visually)
**Colors:**
  - Background: `#F4EFE7` (light parchment — more email-appropriate than dark)
  - Surface: `#FFFFFF`
  - Text primary: `#1A1814`
  - Text secondary: `rgba(26,24,20,0.62)`
  - Accent: `#C8552B`
  - Border: `rgba(20,18,14,0.10)`

**Note on dark mode:** Email clients handle dark mode inconsistently. Design in light mode.
Add `@media (prefers-color-scheme: dark)` overrides for Apple Mail only.

**Header:**
- FindA.Sale wordmark/logo left, "View in browser" link right
- Thin accent-color border below

**Footer (every email):**
- Physical address: 219 E Michigan Ave, Suite F, Paw Paw, MI 49079 (CAN-SPAM required)
- Unsubscribe link (type-specific — unsubscribing from sale reminders doesn't kill digest)
- Social links: Instagram, Facebook
- "© FindA.Sale" + current year

---

## CTA button specs

- Single CTA per email (two max for welcome/onboarding only)
- Background: `#C8552B` (accent)
- Text: white, 15px, medium weight
- Padding: 14px 28px
- Border radius: 6px
- Fallback for Outlook: VML button (code provides this — design the visual only)

---

## Questions for design to answer back

1. Should the base template background be the parchment `#F4EFE7` or white? Parchment is on-brand but less standard for email.
2. For the weekly digest: should the metric rows use a data-table feel (structured columns) or a card-per-metric layout?
3. For the onboarding sequence (Emails 5a–5c): should all three share a header treatment that shows "Step X of 3" — or should they feel more like standalone correspondence?
4. For the smart match alert (Email 6): if the item has no photo, should the email suppress the item card and lead with text instead, or show a branded placeholder?
5. Are there additional email triggers we haven't covered? (e.g., bid outbid notification, hold expiring, review request after sale ends)

---

## What to deliver back

1. Base template — header, body zone, CTA section, footer
2. All 5 content modules (sale card, item card, metric row, text block, quick wins list)
3. All 7 emails assembled (or 9 counting the 3-part onboarding series separately)
4. Dark mode override spec for Apple Mail
5. Answers to questions above

