# Dashboard Redesign Brief — S350

**Status:** Design spec complete. Awaiting Patrick answers to open questions before dev dispatch.
**Sources:** UX Agent + Game Designer + Innovation Agent (S350 parallel batch)
**Applies to:** `organizer/dashboard.tsx` + `shopper/dashboard.tsx`

---

## DESIGN NORTH STAR

**Organizer 3-Second Test:** "I can see my active sale status and my single most important next action right now."
**Shopper 3-Second Test:** "I can see my collections, what sales are coming up, and exactly what I need to do to earn more XP."

**Core problem being fixed:** Both dashboards were navigation-menus-on-a-page (C+ / D ratings). This brief redesigns them as state-aware, job-to-be-done dashboards that guide users through the app rather than list links to features.

---

## PART 1: ORGANIZER DASHBOARD SPEC

### State 1 — New Organizer (0 sales ever)

**Above the fold:**
- Hero card: "Welcome to FindA.Sale Organizer"
- Subtext: "Let's set up your first sale in 5 minutes"
- 3-step visual path: Sale Details → Add Items → Publish (reassures user of simplicity)
- Primary CTA: "Create Your First Sale" (large, prominent)
- Secondary: "Watch a quick tour" (link, smaller)

**Mid-page:**
- 3 concrete benefits: "Reach 10,000+ treasure hunters in your area" | "List items with photos — AI tags them automatically" | "Track earnings and manage holds in real time"
- Quick-link grid: Create Sale | Browse Inspiration | See Pricing

**Below the fold:**
- FAQ accordion: "How does FindA.Sale work?" | "How much does it cost?" | "How do I add items?"
- Link to onboarding wizard (if not yet dismissed)

**Tooltips needed:** None — CTA is the guide.

---

### State 2 — Active Organizer (sale ACTIVE or DRAFT in progress)

**Above the fold:**

**Sale Status Widget** (highest visual priority — full width):
- Sale title + photo thumbnail + status badge (DRAFT | ACTIVE | ENDING SOON)
- Key stats in a row: "X items listed" | "Y visitors today ↑12%" | "Z active holds"
- Status-specific CTAs:
  - DRAFT: "Finish Setup" (orange/warning) + "Publish Sale"
  - ACTIVE: "Manage Items" + "View Live Sale"
  - ENDING SOON (last 24h): "Extend Sale" (red) or "Mark Ended"
- If DRAFT: progress bar showing steps completed

**Next Action Zone** (context-aware, single recommended action):
- DRAFT: "Add items to your inventory" → "Add Items"
- ACTIVE + missing photos: "5 items need photos — add them now" → "Upload Photos"
- ACTIVE + holds pending: "You have X pending holds. Review" → "View Holds"
- Ending soon: "Your sale ends in X hours. Ready to close?" → "View Options"

**Mid-page:**

**Quick Stats Grid** (3-col desktop / stacked mobile):
- Total Revenue: $X | Items Listed: X (link "Add More") | Holds Active: X (link "View" if >0)

**Tier Progress Card:**
- Current tier badge + progress bar toward next tier
- Single perk at next tier ("SILVER unlocks: Featured placement + verified badge")
- Link: "See all tiers"

**Revenue / Cash Fee Alert** (only if balance pending OR payout ready):
- "You have $X ready to payout" → "Withdraw"
- OR "Outstanding cash fees: $X (due by [date])" → "Review"

**Below the fold:**

**All Sales List** (tabbed: DRAFT | ACTIVE | ENDED):
- Per sale: thumbnail, title, dates, item count, quick actions (Edit | Publish | Clone)
- Empty tab states have CTA

**Selling Tools Quick Access** (collapsible):
- Grid of 6: Create Sale | Add Items | QR Codes | POS Checkout | Print Inventory | Analytics
- Tier-gated tools show lock icon with "Upgrade to PRO/TEAMS" on click

**Recent Activity Feed** (last 5 events — this is the 10x idea, see Innovation section):
- "Item viewed by [name]" | "[Name] placed a hold on [item]" | "[Name] purchased [item]"
- Link: "View full activity"

**Tooltips needed:**
- "Holds" → "Reserve items for buyers before the sale starts. You set the hold duration."
- "Cash Fee Balance" → "Fees you can pay at checkout or balance against future earnings."
- Tier icons → "Your current tier determines search placement and features available."
- "Views/saves today" → "These are live shoppers viewing your sale right now."

---

### State 3 — Between Sales (last sale ENDED, no current sale)

**Above the fold:**
- Congratulations card: "Great job! Your sale has ended."
- Stats: "Total items sold: X | Total revenue: $X | Average rating: X"
- Primary CTA: "Create Another Sale" (large)
- Secondary: "Clone your last sale" + "View sale performance" + "Check your earnings"

**Mid-page:**
- Tier Progress Update (updated after sale completion)
- "You've completed X sales — Y more to reach next tier"
- If good reviews: highlight quote from shopper

**Below the fold:**
- Past Sales Archive (title, dates, thumbnail, item count, revenue, avg rating per row)
- "Reuse as Template" | "View Details" per sale

---

### Quick-Access Shortcuts (YES — these belong on the dashboard)

For older/less-tech-savvy users, shortcut buttons to the 3–5 most common tasks are valuable — especially for features buried in collapsible nav menus. These are **secondary** to state-aware content (sale status widget comes first), not the main event.

**Organizer shortcuts (State 2 — active sale):**
- Add Items (camera icon) → /[saleId]/add-items
- View Live Sale → /sales/[saleId]
- View Holds → /holds
- Print Inventory (PRO) → /print-inventory

**Organizer shortcuts (State 3 — between sales):**
- Create New Sale → /plan
- Clone Last Sale → (action)
- View Earnings → /earnings

Rules: max 4 shortcuts visible, icon + label, tier-gated shortcuts show lock icon (no hiding them — show the feature, gate on click).

### What NEVER appears on organizer dashboard
- Pure nav link dumps with no data/context (the old "Selling Tools" grid of 12 links)
- Feature announcements or newsletter signups
- Admin-only content or system notices
- Shopper activity unrelated to their sales

---

## PART 2: SHOPPER DASHBOARD SPEC

### Above the fold — state-aware

**A. New shopper (0 purchases, 0 saves):**
- "Welcome to treasure hunting!"
- Primary CTA: "Browse Sales"
- Secondary: "See an example collection"

**B. Returning shopper (active engagement):**
- "Welcome back, [first name]!"
- ONE personalized hook (priority order):
  1. Pending holds/payments: "💳 You have X pending payments due by [date]" → "Complete Payments" (red/orange, override everything)
  2. New items in saved sales: "X new items added to sales you follow"
  3. Collections summary: "You have X items saved. Y are still available."
- Primary CTA: "View Your Collections" or "See What's New"

---

### Gamification section — EXACT COPY FORMULAS

#### Rank Progress Card

**INITIATE** ⚔️
```
Progress: [X] / 500 XP
▓▓░░░░░░░░ [X]%
"[Y] more XP until Scout"
Best way to earn right now: Scan an item (+10 XP each)
You can scan items from any sale on your phone.
→ [Browse Sales]
```

**SCOUT** 🐦
```
Progress: [X] / 1500 XP
▓▓▓▓░░░░░░ [X]%
"[Y] more XP until Ranger"
Best way to earn right now: Make a purchase (+25 XP each)
You're unlocking more perks — keep going.
→ [View Your Sales]
```

**RANGER** 🧗
```
Progress: [X] / 2500 XP
▓▓▓▓▓▓░░░░ [X]%
"[Y] more XP until Sage"
Best way to earn right now: Visit sales daily (+5 XP each, once per sale)
Daily visits build your streak. You're close to Sage perks.
→ [See Sales Near You]
```

**SAGE** 🧙
```
Progress: [X] / 5000 XP
▓▓▓▓▓▓▓▓░░ [X]%
"[Y] more XP until Grandmaster — the ultimate explorer rank"
Best way to earn: Keep your streak going
You unlock 6h Legendary-first access at Grandmaster.
→ [View Exclusive Hunt Pass Benefits]
```

**GRANDMASTER** 👑
```
Progress: [X] / ∞
▓▓▓▓▓▓▓▓▓▓ 100%
"You've reached the peak of the Explorer's Guild."
You earn XP infinitely. You get first access to all Legendary items.
Your rank badge appears on your public profile.
→ [View Your Public Profile]
```

---

#### Streak Widget — exact copy by state

**PERMANENT EXPLAINER (always visible, above all state variants):**
> "Visit one sale per week to keep your streak alive and earn bonus XP."
This line appears regardless of streak state. Without it, new users have no idea what a streak is.

**Zero Streak (Day 0 / never started or >7 days inactive):**
```
🔥 Streak Tracker   [0 days]
"Start your streak. Visit any sale to earn +5 XP today."
→ [Find a Sale]
```

**Active Streak (Day 1–7+):**
```
🔥 Streak Tracker   [N days]
"Keep it going! You've visited [N] days in a row.
+5 XP earned today. Return tomorrow to extend."
→ [View Your Streaks]
```

**At-Risk Streak (last visit was yesterday; user hasn't visited today):**
```
🔥 Streak Tracker   [N days] ⚠️
"Your [N]-day streak ends at midnight if you don't visit a sale today.
+5 XP waiting for you right now."
→ [Visit a Sale Today]
```

**Broken Streak (last visit >1 day ago):**
```
🔥 Streak Tracker   [0 days]
"Your streak ended. But every explorer gets a fresh start.
Rebuild: Visit a sale today to earn +5 XP and restart at day 1."
→ [Start Over]
```

---

#### Hunt Pass CTA — rank-aware copy

**INITIATE / SCOUT — Hook: XP Boost:**
```
🎯 Hunt Pass — Level Up Faster
Earn 1.5x XP on everything you do.
Reach Ranger, Sage, and Grandmaster way faster.
$4.99/month. Cancel anytime.
→ [Unlock 1.5x XP]
```

**RANGER — Hook: Early Access:**
```
⚡ Hunt Pass — Get 6h Early Access to Legendary Items
You're almost at Sage rank. With Hunt Pass, you'll see all Legendary drops
6 hours before other shoppers.
Plus: 1.5x XP multiplier on every action.
$4.99/month. Cancel anytime.
→ [Claim Early Access]
```

**SAGE / GRANDMASTER — already subscribed (show active badge instead of upsell):**
```
✅ Hunt Pass Active
You're earning 1.5x XP and get 6h Legendary-first access.
→ [View Collector's League]
```

**SAGE / GRANDMASTER — NOT subscribed:**
```
🏆 Collector's League — Hunt Pass Exclusive
You're eligible for the Collector's League leaderboard.
Compete with other Sage and Grandmaster hunters.
Also unlocks: 6h Legendary-first access + 1.5x XP.
$4.99/month. Cancel anytime.
→ [Join Collector's League]
```

---

#### Achievement Badges — display rules

**0 badges earned:**
```
🎖️ Earn Badges
Complete actions to unlock achievement badges:
• First purchase → Treasure Hunter badge
• 30-day streak → Devotion badge
• 50+ items found → Legend badge
→ [Browse Sales]
```

**1–3 badges:** Show each with icon + name + date earned. "You're building your collector legend!"

**4+ badges:** Show 4 badges in grid, then "View All X Badges →" link to `/shopper/achievements`.

---

#### Rank Unlock Pathway Card (FIX #3 — replaces Leaderboard Snippet)

The leaderboard snippet was decorative (shows ranking, no reason to act). Replaced with a goal-state visualizer that shows what the NEXT rank unlocks and the fastest path to get there.

```
🎯 Your Path to [Next Rank]
┌──────────────────────────────────┐
│ [CURRENT RANK] (Your Rank)       │
│ [X] / [threshold] XP             │
│ ▓▓▓▓▓░░░░░ [X]%                  │
└──────────────────────────────────┘

What unlocks at [Next Rank]:
→ [Specific feature benefit, e.g., "First look at new items 6 hours early"]
→ [Second benefit, e.g., "Gold badge on your public profile"]

You're [X] XP away.
Fastest path: [Top action +XP] + [Second action +XP]

[Primary CTA: action that earns most XP]   [Secondary: see what unlocks]
```

**Per-rank unlock definitions (what to show):**

- **Initiate → Scout:** "Scout rank shows you've started your collection journey. Earn your first badge." CTA: [Browse Sales]
- **Scout → Ranger:** "Ranger unlocks Sale Insights — see which items are trending in sales near you." CTA: [See Trending Items]
- **Ranger → Sage:** "Sage unlocks 6-hour early access to Legendary items — see them before other shoppers." CTA: [See What's Coming]
- **Sage → Grandmaster:** "Grandmaster is the peak. Your rank badge appears on your public profile and you join the Collector's League." CTA: [View Collector's League]
- **Grandmaster (top):** "You've reached the peak of the Explorer's Guild. XP continues to grow your legacy." CTA: [View Your Profile]

**Leaderboard — moved to /shopper/league page only.** Not removed — just not primary dashboard real estate. Link from Rank Unlock Pathway: "See where you rank this week →"

---

### Active Engagement Section

**Priority order (FIX #5 — Collections moved to #2):**

1. **Pending Payments** (if any — PRIORITY, above everything else):
   - Per invoice card: item photo + title + price + due date + "Complete Payment" button
   - **Urgency color-coding (FIX #4):** If due < 6 hours: red border + "⚠️ Due in X hours" banner. If due < 24 hours: orange border. If due > 24 hours: standard card. Never let 2-hour and 2-day deadlines look identical.
   - Inline explainer on every card: "This is a hold you reserved. No charge until you confirm. Hold is released if not paid by the due date."

2. **Your Collections** (FIX #5 — moved up from #3):
   - If user has saved items: default "Favorites" collection always exists (auto-created for every user — eliminates "where are my saves?" confusion)
   - Grid of collection cards (name + 4-item thumbnail grid + item count)
   - CTA: "Create a New Collection"
   - Empty state (0 saves ever): "Save items from sales to build your collection. Browse sales to get started." → [Browse Sales]

3. **Upcoming Sales** (personalized — saved items / followed organizer / RSVP):
   - Per sale: thumbnail, title, dates, "X items saved", "View Sale"
   - Empty state (user has collections): "No upcoming sales from organizers you follow. Explore new sales below." (NOT "no data" — they have saves, just no followed organizers yet)
   - Empty state (no activity at all): "Follow organizers or save items to see upcoming sales here."

4. **Active Holds** (if any):
   - Per hold: item photo, title, organizer name, "Hold expires in X hours", "Pay Now"
   - Urgency color-coding: same rules as Pending Payments above

5. **Recently Viewed** (if any — horizontal scroll mobile / grid desktop):
   - 6–8 items max. Show status badge ("Still available" ✅ or "Sold" grayed-out overlay)
   - "View All" link always present
   - CTA: "Browse More"

---

### Quick-Access Shortcuts (YES — these belong on the shopper dashboard too)

Same logic as organizer: shortcuts to the 3–5 most-used features help older/less-tech-savvy users who won't find things buried in the nav. Secondary to state-aware content, not the main event.

**Shopper shortcuts:**
- Browse Sales → /sales
- My Collections → /shopper/wishlist
- Explorer's Guild (XP + rank) → /shopper/loyalty
- Active Holds → /holds
- Hunt Pass → /shopper/hunt-pass (hide if already active, or show "Active ✅")

Rules: max 4–5 shortcuts, icon + label, thumb-reachable on mobile.

### What NEVER appears on shopper dashboard
- Empty sections with no CTA
- Duplicate stat cards
- Seller/organizer tools
- Newsletter signup / email preferences (settings page only)
- Pure nav link dumps with no data/context (12 links, no hierarchy)

---

### Shopper Tooltips
1. **Explorer Rank** — "Climb the ranks by visiting sales, saving items, and buying. Higher ranks unlock exclusive badges."
2. **XP Values** — "Different actions earn different XP. Purchases earn the most."
3. **Hunt Pass** — "Double your XP earnings + get early access to new items for $4.99/mo."
4. **Streak** — "Visit a sale at least once per week to keep your streak alive."
5. **Hold Expiration** — "You must pay for holds before they expire, or the organizer releases them."
6. **Collections** — "Create wishlists to organize items you want to track across multiple sales."

---

## PART 3: SHARED DESIGN RULES

1. **State-awareness:** Never show "Create Sale" to shoppers or "Browse Sales" to organizers in primary zones. Detect state and render accordingly.
2. **Empty state rule:** Every empty section has a CTA. Never "No data." Always "Here's what to do next."
3. **Guidance rule (FIX #2):** All feature labels must use business outcomes, not feature names. Tooltips required for every confusing element. Full reference: `organizer-guidance-spec-s350.md`. Label all CTAs with verb + outcome ("See your earnings" not "View Analytics").
4. **Mobile-first:** Primary CTA is thumb-reachable. Stats stack vertically on mobile. No overflow or clipping.
5. **One primary action per section:** Everything else is secondary (smaller, link style). Prevents decision paralysis.
6. **Visual urgency color-coding (FIX #4):** Any time-sensitive element uses: 🔴 Red = due/expiring within 6 hours. 🟠 Orange = due/expiring within 24 hours. 🟢 Green = healthy/no action needed. Applies to: pending payments, active holds, sale ending soon, streak at risk, hold expiry timers. Never use one color for all urgency levels.
7. **Onboarding modal (FIX #1):** A one-time modal is shown to new users on first login. Shopper modal: explains XP, rank, and streak before any gamification widget is visible. Organizer modal: explains the create → add items → publish → get paid flow. Modal is shown ONCE, stored in localStorage (or user record), never shown again. Copy spec in `organizer-guidance-spec-s350.md` Section 5. This is mandatory — no gamification widget should be a user's first exposure to the system.
8. **Next Action Zone — choice-driven (friction fix):** The organizer Next Action Zone must show 2–3 urgent actions in priority order, not just one. User picks from the list. Example: "⚠️ 3 pending holds" + "📸 5 items need photos" + "📊 Check today's stats." Prescriptive single-action zones assume the app knows what the organizer wants — they don't.
9. **Streak widget — permanent explainer (friction fix):** The streak widget ALWAYS shows a one-line explainer regardless of state: "Visit one sale per week to keep your streak alive and earn bonus XP." Without this, new users see a fire emoji and a number and have no idea what it means.
10. **Cover photo — escape valve (friction fix):** The cover photo is required to publish a sale, but NOT required to save a draft. Organizers setting up in advance can save without a photo and receive a persistent reminder banner: "Add a cover photo before publishing — sales with photos get 3x more views."
11. **Tier benefits — business language only (FIX #2):** "Featured placement" → "Your sale shows up first in search results." "Verified badge" → "A blue checkmark shoppers trust." "Flip Report" → "See what sold and price smarter next time." Full dictionary: `organizer-guidance-spec-s350.md` Section 1.

---

## PART 4: INNOVATION — "SALE MOMENTUM" (THE 10X IDEA)

**Concept:** Real-time activity feed on the organizer dashboard.

Most organizers ask: "Is my sale going well right now?" They can't tell without checking manually.

**The feed shows:**
- "10 people viewed your inventory in the last hour"
- "Someone put a hold on the 1920s vanity"
- "3 people saved your sale to their wishlist today"
- "Visitor interest peaked at 2 PM — your Midcentury items got the most views"

**Why it's 10x:**
- Creates urgency: organizer feels the energy of a live sale
- Motivates action: high-viewed categories → organizer adds more of that type
- Retention: organizer checks 3–4x daily instead of once at end of day
- Turns dashboard from "static status page" → "living cockpit"

**Implementation scope:** 2–3 sessions
- Backend: log `view`, `hold`, `save` events to a lightweight activity table
- Frontend: show last 5–10 events in chronological order with icons + timestamp
- Optional: push notification on hold placed or "peak hour" trigger

**Benchmarks that prove this pattern works:**
- **Duolingo:** Streak + daily goal creates return habit. Daily visit metric = our "sale active" equivalent
- **Airbnb Host:** Color-coded status (Green/Orange/Red) for attention triage. Translates directly to our DRAFT/ACTIVE/ENDING SOON states
- **Strava:** Monthly goal with days remaining = our "sale ends in X days" urgency mechanic
- **Shopify:** Real-time metric cards with trend indicators = our "visitors today ↑12%"
- **Notion:** "Your first database in 30 seconds" zero-state = our "first sale in 60 seconds" onboarding

---

## PART 5: INNOVATION — FOUR KEY DESIGN RECOMMENDATIONS

These four came from the Innovation agent's benchmark research (Airbnb Host, Shopify, Strava, Notion, Duolingo). They are distinct, specific, implementable recommendations — not absorbed into the general spec above.

---

### 1. State-Aware "Sale in Progress" Card

**What it is:** A single full-width hero card that appears ONLY when an organizer has an active sale. It replaces the current static link grid with a live status panel.

**Design spec:**
- Sale title + photo thumbnail + pulsing "🟢 LIVE" badge (green, subtle animation)
- Three key metrics in a row:
  - **Items published** — large number, "items available"
  - **Unique visitors this week** — large number + trend indicator (↑12% or ↓3%)
  - **Active holds** — large number, **orange** if >0 (eye-catching but not alarming)
- Two CTAs:
  - "View visitor map" — see which items are being viewed in real time
  - "Add more items" — fast path to camera

**Why it works:** Answers "is my sale running well?" in <3 seconds. Visitor count with trend creates real-time urgency. Orange on holds is the primary attention signal — holds are the most important action item for an organizer mid-sale.

**When it appears:** Only in State 2 (active sale). Falls back to State 1 or State 3 card when no sale is running.

---

### 2. Personalized Shopper Hook

**What it is:** Replace the static "Find sales near you" card with a behavior-driven discovery feed: "Find treasures like the ones you saved."

**How it works:**
- On first load (new shopper): 10-second "tag your style" prompt — tap 2–3 emojis (🏺 Vintage / 🛋️ Midcentury / 🌾 Farmhouse / 🎨 Eclectic / 💍 Jewelry / 📚 Books & Art)
- Returning shopper: sales are ranked by match score based on items they've saved/purchased before
- Each sale card shows: "5 items match your style" + one photo of the best match item
- Micro-social layer: "3 people saved similar items from this sale" (creates FOMO without pressure)

**Why it works:** Estate sale shoppers hunt specific aesthetics. Generic proximity-based listings don't create urgency. A curated "this sale has your kind of stuff" card does. Turns a commodity feature (sale listing) into a personalized treasure map.

**Implementation note:** Match score can be approximate on MVP — query items from nearby sales for tag overlap with user's saved/purchased item tags. No ML required for V1.

---

### 3. Returning Shopper First Screen (3-element priority order)

When a shopper opens the app after being away 1–7 days, render in this exact priority order:

**Element 1 — Urgency card (top of page):**
"New this week" — sales added in the last 3 days, with photo + distance + personalized reference if possible ("2 new sales near Eastside Estate" for returning Grand Rapids shoppers).
Rationale: Time-bound information creates a reason to act now, not later.

**Element 2 — Smart reminder (middle):**
"You saved a [item name] [X days ago]. Similar items are being added to nearby sales today."
Rationale: Ties a past user action to a future opportunity. The shopper feels "remembered." This is the Strava social-proof equivalent — but for shopping instead of running.
Data required: user's most recently saved item + any new item in nearby sales with matching tags.

**Element 3 — Browse feed (bottom):**
Standard sale cards with "Trending" or "New" badges. Infinite scroll. Each card shows saved-item count if shopper has previously saved from that sale.
Rationale: Once curiosity is triggered by elements 1 and 2, a frictionless scroll feeds the momentum.

**What NOT to show here:** Empty sections with no content, duplicate CTAs, "no new sales" dead ends.

---

### 4. Zero-State Onboarding — "Your First Sale in 60 Seconds"

**What it is:** A fast, guided flow that gets a new organizer to a live (draft) sale without any blank forms.

**The flow:**

**Step 1 — What are you selling? (single tap, 2 options)**
- "Single sale (one-time event)" — estate sale, garage sale, auction
- "Weekly/recurring event" — flea market, consignment, pop-up

**Step 2 — Auto-populate template based on choice**
- Single sale: Date (today + 7 days default), Location, Description ("A curated selection of..."), Category (Estate)
- Weekly event: Day of week, Hours (8am–2pm default), Location, Description, Category
- Pre-filled fields reduce cognitive load. User edits, not creates from scratch.

**Step 3 — One mandatory cover photo**
- Camera CTA: "Add a cover photo (required)"
- Subtext: "Sales with photos get 3x more views"
- **Hard gate:** sale cannot go live without a cover photo. This ensures no organizer creates a text-only listing that won't perform.

**Step 4 — Celebrate the start**
- "Your sale is drafted! 0 items added."
- Single prominent CTA: "Add your first item →" (opens camera)
- This keeps the momentum going — the organizer leaves the form and immediately starts adding inventory.

**Why the mandatory photo matters:** Without it, organizers create invisible listings (no photo = very low click rate in shopper feed). The gate protects their success, not just the product's appearance.

---

## DECISIONS — LOCKED (S350)

All five questions resolved by Patrick (S350):

1. **Revenue display:** Show BOTH current-sale revenue and lifetime revenue. Visible to all tiers — it's their own money.

2. **Tier progress:** Always visible, compact — one row: badge + "X sales until [next tier]" + link. No collapsible.

3. **Hunt Pass upsell:** One placement only (gamification section). Dismiss hides it for 7 days, then resurfaces. Never show it twice on the same page simultaneously.

4. **Organizer analytics:** All tiers see inline summary stats (items published, views, holds, revenue). PRO+ sees "View Flip Report →" link for deep analytics (best category, revenue trends, avg sale duration). Non-PRO sees the same link grayed out with "Upgrade to PRO" tooltip — surface the feature, gate on click.
   - Tier breakdown: FREE/SIMPLE = basic stats only. PRO = basic stats + Flip Report link. TEAMS = all PRO features.

5. **Sale Momentum feed:** GREEN-LIT for S351. New lightweight activity events table + last 5–10 events feed on organizer dashboard. Push notification on holds placed is optional V2.

---

## IMPLEMENTATION NOTES FOR DEV AGENT (S351)

**Schema pre-flight (verify these exist before touching code):**
- `Sale.status` enum values (DRAFT, ACTIVE, ENDED, etc.)
- `User.guildXp`, `User.explorerRank`, `User.huntPassActive`
- `ItemReservation` (for active holds display)
- `UserStreak.currentStreak` and last-visit date field
- `Notification` model (for activity feed)

**Routes to verify:**
- `GET /organizers/me` — must return sale list, revenue, hold count
- `GET /users/me` — must return guildXp, explorerRank, huntPassActive, streak data
- `GET /users/me/wishlists` — for collections display

**Testing requirements:**
- Mobile at 375px and 768px
- Dark mode: all text contrast must pass WCAG AA
- Empty states: verify every CTA links to correct route
- Tooltips: use existing tooltip component from codebase

**Deployment note:**
State-aware organizer dashboard requires `Sale.status` read at page load. If organizer has no sales, render State 1. If any sale is ACTIVE or DRAFT, render State 2. Otherwise State 3.
