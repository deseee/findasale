# Guide & Video Library Plan

**Drafted:** 2026-05-04 (S641 prep)
**Status:** Plan — not yet greenlit for production
**Owner:** Patrick + Marketing/Customer Champion subagents at production time

---

## 1. Goal

Give shoppers and organizers a place to learn how the product actually works, written and shot in the same plain language Patrick uses everywhere else. These pieces should:

- Answer questions before they end up in support
- Be linkable from FAQ entries, dashboard hints, empty states, onboarding tooltips, and the existing `/guide` page
- Build trust with prospective users who land on the marketing site and want to verify FindA.Sale is real before signing up
- Be short, scannable, and useful to someone in the middle of doing the thing — not promotional copy

Each piece is built to one of three formats described in §3.

---

## 2. What Already Exists (and Where the Gaps Are)

### Existing assets in `/packages/frontend/public/`
- `organizer-video-ad-fas.html`, `organizer-video-ad-fas1.html`, `organizer-video-ad.html` — three 45-second 9:16 vertical sales videos for the organizer pitch
- `shopper-video-ad.html`, `shopper-video.html` — shopper pitch videos
- `hunt-pass-video-ad.html`, `hunt-pass-video.html` — Hunt Pass pitch
- `treasure-trails-video-ad.html`, `treasure-trails-video.html` — Treasure Trails pitch
- `haul-post-video-ad.html`, `haul-post-video.html` — Haul Posts pitch
- `guild-xp-ad.html` — Guild/XP pitch
- A full set of music tracks (`fas-01.mp3` through `fas-13.mp3`, plus boosted variants) and voiceover takes (`vo-01.mp3` through `vo-13.mp3`) — these are the existing audio bed for new videos

These are **sales/ad** pieces. They tell someone "this exists, you should try it." None of them teach a user how to do the thing.

### Existing written content
- `/guide` — long-form organizer onboarding page, 14 broad sections (Getting Started, Creating a Sale, Adding Items, Auctions, Communication, Payouts, QR Codes, Notifications, Referral Program, Webhooks, Before You Go Live, Tips). Useful as a top-of-funnel walkthrough but doesn't drill into specific features.
- `/guide/[slug]` — 500 SEO-targeted ISR pages built from `data/seo-pages/index.json`. These are city-and-sale-type combos for search traffic, not feature explainers.
- `/faq` — extensive shopper + organizer Q&A. Some answers reference features that need their own guide ("What is a hold?" — answered, but "How do I extend a hold as an organizer?" needs a step-by-step).
- `/condition-guide` — explains S/A/B/C/D condition grades. Already in the right shape; needs to be linked from item pages, search filters, and shopper FAQ.
- `/plan` — public sale planner chat. Useful but discovery-only.
- `/about`, `/contact`, `/support`, `/privacy`, `/terms` — institutional pages

### The gap

The middle layer is missing: focused, single-feature guides for the moments when someone says "I'm trying to use this thing and I don't understand what to do next." That's the layer this plan fills.

---

## 3. Production Formats

Three formats. Pick the right one for the topic — don't over-build.

### Format A — Written Guide (markdown page on the site)

- 600–1,200 words
- One feature, one outcome, one user
- Hero summary in 2–3 sentences at the top: "What this is, who it's for, what you'll get done"
- Step list with screenshots where it matters
- "Common questions" section at the bottom (3–6 short Q&As — these are also linkable from `/faq`)
- "Related guides" footer (3 cross-links)
- New route shape: `/guides/<slug>` (note plural — keeps separation from the existing `/guide` and `/guide/[slug]` SEO pages)

### Format B — Short Explainer Video (HTML, 30–60s, 9:16)

- Same template Patrick already uses for the ad files (`organizer-video-ad-fas.html` etc.)
- Replace the sales-pitch scenes with how-it-works scenes
- Reuse the existing `fas-XX.mp3` music bed and create new VO takes
- Embed inline in the matching written guide (the written guide is the canonical home; the video is supplemental)
- Same 390×844 frame, same progress bar, same replay button

### Format C — Screen Capture (real product, 30–90s)

- Quick QuickTime/OBS capture of Patrick (or a seed account) doing the thing in the live app
- Voiceover added in post — same plain voice as the written guide
- Hosted as `.mp4` in `/public/guides/`
- Embed inline in the matching written guide
- Use this for any workflow where the actual UI is the explanation: rapidfire camera, review/publish, POS, holds management

**A guide can use more than one format.** The biggest topics (rapidfire, review/publish, holds) get a written guide AND a screen capture. Smaller topics get just a written guide.

---

## 4. Guide Library — Full Inventory

Grouped by audience and ranked within each group. Format codes: **W** = written, **W+V** = written + screen capture, **W+E** = written + 9:16 explainer video.

### 4.1 Organizer — Setup & Getting Started

| Pri | Title | Format | Length | Links from |
|-----|-------|--------|--------|------------|
| P1 | Set Up Your Organizer Account | W+V | 800w + 60s | `/guide`, `/register`, organizer dashboard empty state |
| P1 | Connect Stripe and Receive Your First Payout | W+V | 900w + 90s | Settings → Payouts, FAQ payout questions |
| P2 | Choosing a Plan: Simple, Pro, or Teams | W | 700w | `/pricing`, upgrade prompts, FAQ tier questions |
| P2 | Add Staff and Set Their Permissions | W | 600w | `/organizer/staff`, `/organizer/members` |
| P3 | Connect Your Workspace (multi-organizer setups) | W | 600w | `/organizer/workspace` |

### 4.2 Organizer — Creating a Sale

| Pri | Title | Format | Length | Links from |
|-----|-------|--------|--------|------------|
| P1 | Create Your First Sale, Step by Step | W+V | 1000w + 60s | Dashboard empty state, `/guide`, FAQ "How do I list a sale?" |
| P1 | Pick the Right Sale Type for What You're Running | W | 700w | Create-sale form, FAQ |
| P2 | Schedule a Sale and Pick Your Visibility Window | W | 600w | Create-sale form |
| P2 | Run a Sale Across Multiple Locations (Hubs) | W | 800w | `/organizer/hubs` empty state, FAQ |
| P3 | Run a Permanent Storefront (Shop Mode) | W | 700w | Settings, Shop Mode toggle |

### 4.3 Organizer — The Photo Workflow (Rapidfire Mode)

This cluster is Patrick's #1 stated priority. The rapidfire workflow is the product's biggest differentiator and the single biggest source of "wait, what just happened?" moments.

| Pri | Title | Format | Length | Links from |
|-----|-------|--------|--------|------------|
| P1 | Rapidfire Mode: Photograph an Entire Sale in One Pass | W+V | 1200w + 90s | Dashboard "Add items" CTA, `/organizer/rapid-capture`, FAQ |
| P1 | Lighting and Framing for Better Auto-Tagged Photos | W+V | 800w + 45s | Rapid-capture empty state, in-flow tip banner |
| P1 | Why Some Photos Need a Retake (and How to Tell) | W | 600w | Rapid-capture, review queue |
| P2 | Multi-Angle Photos for High-Value Items | W | 600w | Edit-item screen, FAQ rare items |
| P2 | Setting Up Photo Stations for Volume Sales | W | 700w | `/organizer/photo-ops` |
| P3 | Running a Photo Session With Helpers | W | 500w | Photo-ops, members docs |

### 4.4 Organizer — Review & Publish (where pricing lives)

This is the second cluster Patrick called out specifically. The review queue is where every item goes from "captured" to "live for shoppers" and where almost every pricing decision is made.

| Pri | Title | Format | Length | Links from |
|-----|-------|--------|--------|------------|
| P1 | The Review Queue: From Photo to Live Listing | W+V | 1000w + 90s | Rapid-capture handoff, dashboard "Review" CTA |
| P1 | Pricing an Item: Suggested Price, Comparable Sales, and Your Override | W+V | 1100w + 60s | Review queue, FAQ price questions |
| P1 | Picking the Right Condition Grade (with examples) | W | 800w | Review queue, links existing `/condition-guide`, FAQ |
| P1 | Categories, Tags, and Why They Affect Searchability | W | 700w | Review queue, FAQ |
| P2 | Editing a Listing After It's Already Live | W | 500w | `/organizer/edit-item`, FAQ |
| P2 | What "Rare" and "Legendary" Mean (and how items get tagged) | W | 600w | FAQ rarity question, review queue |

### 4.5 Organizer — Inventory Management

| Pri | Title | Format | Length | Links from |
|-----|-------|--------|--------|------------|
| P1 | Manage Holds: Approve, Extend, Cancel | W+V | 700w + 45s | `/organizer/holds`, FAQ holds questions |
| P2 | Color Rules: Use Tag Colors for In-Person Sorting | W | 600w | `/organizer/color-rules` empty state |
| P2 | Discount Rules and Markdown Cycles | W | 800w | `/organizer/discount-rules`, `/organizer/markdown-cycles` |
| P3 | Print Inventory Sheets for Walk-Through Reference | W | 400w | `/organizer/print-inventory` |
| P3 | Compose Custom Labels for Your Sale | W | 500w | `/organizer/label-composer` |

### 4.6 Organizer — Promotion & Print Marketing

Patrick called out "where to post flyers" — that's its own guide, not a section in another one.

| Pri | Title | Format | Length | Links from |
|-----|-------|--------|--------|------------|
| P1 | Where to Post Flyers (and How to Use the Tear-Off Flyer) | W | 900w | `/organizer/print-kit`, FAQ |
| P1 | The Promote Page: Share Your Sale on 8 Platforms | W+V | 700w + 45s | Dashboard share banner, `/organizer/promote` |
| P2 | Yard Signs and QR Codes: Print, Place, Track | W | 700w | `/organizer/print-kit`, `/organizer/qr-codes` |
| P2 | Set Up Your Brand Kit (logo, colors, custom storefront URL) | W | 800w | `/organizer/brand-kit` |
| P2 | Send Sale Updates to Followers (and what to write) | W | 600w | `/organizer/send-update` |
| P3 | Built-In Share Cards: Pick a Theme and Post It | W | 500w | Promote page, FAQ |

### 4.7 Organizer — Sale Day & Payments

| Pri | Title | Format | Length | Links from |
|-----|-------|--------|--------|------------|
| P1 | Run the POS: Take Payments In Person | W+V | 1000w + 60s | `/organizer/pos`, FAQ payment questions |
| P1 | Settle Up: Reconcile Sales, Pay Consignors, Get Your Payout | W+V | 1100w + 90s | `/organizer/settlement`, FAQ payout |
| P2 | The Line Queue: Manage Walk-Up Traffic | W | 600w | `/organizer/line-queue` |
| P2 | Message Templates and the Built-In Inbox | W | 600w | `/organizer/message-templates`, `/organizer/messages` |
| P3 | Treasure Trails (organizer side): Build a Multi-Stop Route | W | 700w | `/organizer/trails` |

### 4.8 Organizer — Consignment & Advanced

| Pri | Title | Format | Length | Links from |
|-----|-------|--------|--------|------------|
| P1 | Onboard a Consignor and Set Their Split | W+V | 900w + 60s | `/organizer/consignors` |
| P1 | List Items on eBay From Your Sale (and what gets through) | W+V | 1000w + 90s | `/organizer/inventory`, FAQ eBay questions |
| P2 | Connect Shopify and Cross-List | W | 700w | `/organizer/shopify` |
| P2 | Webhooks and Zapier: Send Sale Events to Your Tools | W | 700w | `/organizer/webhooks`, existing `/guide` Zapier section |
| P3 | Submit Items for Community Appraisals | W | 500w | `/organizer/appraisals` |
| P3 | Use Bounties to Source Items for Buyers | W | 600w | `/organizer/bounties` |
| P3 | Read Your Flip Report (price calibration over time) | W | 600w | `/organizer/flip-report` |

### 4.9 Shopper — Discovery

| Pri | Title | Format | Length | Links from |
|-----|-------|--------|--------|------------|
| P1 | Find Sales Near You: Map, Search, and Calendar | W+V | 800w + 45s | Homepage onboarding, FAQ |
| P1 | Save Items to Your Wishlist and Get Notified | W | 600w | Sale detail empty wishlist, FAQ |
| P2 | Follow an Organizer (and What "Following" Means) | W | 500w | Organizer profile, FAQ |
| P2 | Browse by City: Weekend Sale Pages | W | 500w | City landing pages, FAQ |
| P3 | Surprise Me, Trending, and the Inspiration Feed | W | 500w | Homepage navigation |
| P3 | Plan a Day With the Sale Planner | W | 500w | `/plan` empty state |

### 4.10 Shopper — At the Sale

| Pri | Title | Format | Length | Links from |
|-----|-------|--------|--------|------------|
| P1 | Holds: Reserve an Item Before You Get There | W+V | 800w + 45s | Sale detail item card, FAQ holds |
| P1 | What the Condition Grades Mean (with photo examples) | W | 700w | Sale detail, item detail, search filters; **promotes existing `/condition-guide`** |
| P2 | Bidding on Auction Items | W | 700w | Item detail auction state, FAQ |
| P2 | Trade Items With Other Shoppers | W | 600w | `/shopper/trades`, FAQ |
| P3 | Pay Requests: How Organizers Bill You (and how to avoid scams) | W | 700w | Pay request notification, FAQ |
| P3 | Loot Log: Track Everything You've Bought | W | 500w | `/shopper/loot-log` |

### 4.11 Shopper — The Explorer's Guild

The Guild Primer page (`/shopper/guild-primer`) is the canonical mechanics reference. **All Guild guides link to it rather than duplicating XP values.**

| Pri | Title | Format | Length | Links from |
|-----|-------|--------|--------|------------|
| P1 | Hunt Pass: What You Get and Whether It's Worth It | W+E | 1000w + 45s | Hunt Pass paywall, FAQ Hunt Pass |
| P1 | How Ranks Work (Initiate to Grandmaster) | W+E | 800w + 30s | Guild primer, profile rank badge |
| P2 | Earning XP Without Spending: 12 Ways That Cost Nothing | W | 700w | Loyalty page, FAQ |
| P2 | Rare Finds and Early Access: Why Subscribers See Items First | W | 600w | Hunt Pass landing, FAQ |
| P3 | Achievements and the Hall of Fame | W | 500w | `/shopper/achievements`, `/shopper/hall-of-fame` |
| P3 | Streak Rewards: Daily Logins and How to Keep Them Going | W | 400w | Streak widget, FAQ |
| P3 | The Loot Legend: Your Lifetime Spending and Finds | W | 400w | `/shopper/loot-legend` |

### 4.12 Shopper — Community

| Pri | Title | Format | Length | Links from |
|-----|-------|--------|--------|------------|
| P1 | Post a Haul: Show Off What You Found | W+V | 700w + 45s | Sale detail post-purchase, `/shopper/haul-posts`, FAQ |
| P2 | Create or Join a Crew | W | 600w | `/shopper/crews`, FAQ |
| P2 | Walk a Treasure Trail (multi-sale routing) | W+E | 700w + 30s | `/shopper/trails`, FAQ |
| P3 | Bounties: Get Paid to Find Items for Other Shoppers | W | 700w | `/shopper/bounties`, FAQ |
| P3 | The Leaderboard and Monthly League | W | 500w | `/shopper/leaderboard`, `/shopper/league` |

### 4.13 Trust & Community Bridge (Both Sides)

These are the trust-building guides. They explain to people **why** the platform works, not just **how**. Most live at the public/marketing edge of the site so non-signed-in visitors can read them.

| Pri | Title | Format | Length | Links from |
|-----|-------|--------|--------|------------|
| P1 | How Organizer Reputation Works (and Why You Can Trust Ratings) | W | 700w | Organizer profile, FAQ, `/about` |
| P1 | Refer a Friend, Earn XP and Coupons | W | 600w | `/shopper/referrals`, dashboard widget |
| P1 | Introduce an Organizer to FindA.Sale and Earn Rewards | W | 800w | `/shopper/referrals`, organizer profile claim flow, FAQ |
| P2 | Build Your Reputation as an Organizer | W | 800w | `/organizer/reputation`, `/organizer/reviews` |
| P2 | Affiliate Links: Track Sales You Promote | W | 600w | `/organizer/affiliate` |
| P3 | The Ripples Page: See Who's Talking About Your Sale | W | 500w | `/organizer/ripples` |
| P3 | How Disputes and Refunds Work | W | 700w | FAQ, sale detail return policy |

---

## 5. Work Plan (Two Steps, No Phases)

The library is 75 guides. Don't ship in waves — ship in two big steps.

**Step 1 — Draft everything first.**
Write every one of the 75 guides as a markdown file in `claude_docs/strategy/guides-drafts/<slug>.md`. Each file includes the written guide AND, where applicable, the script for the matching video (9:16 explainer scenes + voiceover script, or screen-capture VO script). Patrick and any other reviewer can then read all 75 in one pass before any production work touches the live site.

Why this order: the audit in §6 below shows that ~25 of the 75 have substantial existing coverage on `/guide`, `/faq`, `/condition-guide`, or `/shopper/guild-primer`. Reviewing the drafts side-by-side with what already exists is the only way to spot duplication and decide which existing pages just need a deeper cross-link versus a brand-new dedicated page.

**Step 2 — Site prep, then slot in approved drafts.**
Once Patrick has read and approved (or rewritten, or merged) the drafts, build the surface:
- The new `/guides` route (index page + slug page)
- The data shape for guide content
- The FAQ-to-guide and dashboard-to-guide inbound links per §8
- The video embeds for guides that include a video
- Any expansions to existing pages (`/guide` sections, `/faq` answers) that the audit calls for

Drafts that don't earn a dedicated page in step 2 either expand an existing section or get folded into a FAQ answer with a deeper anchor link. Nothing gets thrown away — but nothing gets duplicated either.

## 6. Existing Coverage Audit

Before drafting, every guide is tagged with one of three treatments based on what's already on the site. This keeps the writing pass strategic — surface what works, don't recreate it.

### 6.1 What already exists

- **`/guide`** — 14 sections covering organizer onboarding broadly: `getting-started`, `creating-a-sale`, `adding-items`, `community-appraisals`, `managing-inventory`, `auction-items`, `shopper-communication`, `payouts`, `qr-codes`, `notifications`, `referral-program`, `zapier-webhooks`, `before-you-go-live`, `tips`. Each section is medium depth — useful as a starting point but not exhaustive on any one feature.
- **`/faq`** — 53 questions across shopper and organizer tabs, including condition grades, rarity tiers, holds, follow-an-organizer, push notifications, search, and many more. Many shopper-side discovery questions are already well answered here.
- **`/condition-guide`** — Full S/A/B/C/D condition grade explanation with examples. The "Condition grades for shoppers" guide should not duplicate this — it should link to it and add only the shopper-context wrapper (where to find the badge, what to do if you disagree).
- **`/shopper/guild-primer`** — Canonical Explorer's Guild reference. XP values, ranks, perks. Every Guild-cluster guide treats this as the source of truth and links to it rather than restating XP numbers.
- **`/guide/[slug]`** — 500 SEO ISR pages (city + sale-type combos). These are search-traffic landing pages, not product help. Out of scope for this audit.

### 6.2 Treatment codes

Each guide in §4 carries one of these treatments:
- **FRESH** — No meaningful existing coverage; full new draft (600–1,200 words)
- **THIN** — Partial existing coverage on `/guide` or `/faq`; new draft of ~300–500 words that goes deeper than the existing piece and is then cross-linked
- **WRAPPER** — Substantial coverage already exists elsewhere (`/condition-guide`, `/shopper/guild-primer`, or a deep `/guide` section); new draft is ~150–250 words explaining the user context and deep-linking. The existing page does the heavy lifting

### 6.3 Treatment assignments

**Organizer Setup (§4.1):**
- Set Up Your Organizer Account → **WRAPPER** (`/guide#getting-started` covers this)
- Connect Stripe and Receive Your First Payout → **THIN** (`/guide#payouts` partial)
- Choosing a Plan: Simple, Pro, or Teams → **FRESH** (no comparison guide exists)
- Add Staff and Set Their Permissions → **FRESH**
- Connect Your Workspace → **FRESH**

**Organizer Sale Creation (§4.2):**
- Create Your First Sale → **THIN** (`/guide#creating-a-sale` partial)
- Pick the Right Sale Type → **FRESH**
- Schedule a Sale and Pick Your Visibility Window → **THIN** (`/guide#creating-a-sale` mentions dates)
- Run a Sale Across Multiple Locations (Hubs) → **FRESH**
- Run a Permanent Storefront (Shop Mode) → **FRESH**

**Organizer Photo Workflow (§4.3):** All six → **FRESH**. No existing coverage of rapidfire, lighting, retake logic, multi-angle, photo stations.

**Organizer Review & Publish (§4.4):**
- The Review Queue → **FRESH** (Patrick called this out)
- Pricing an Item → **FRESH** (Patrick called this out)
- Picking the Right Condition Grade → **WRAPPER** (`/condition-guide` is canonical)
- Categories, Tags, and Searchability → **FRESH**
- Editing a Listing After It's Live → **THIN** (`/faq` has a question but shallow)
- What "Rare" and "Legendary" Mean → **WRAPPER** (`/faq` rarity question covers it)

**Organizer Inventory (§4.5):**
- Manage Holds (organizer) → **THIN** (`/faq` mentions holds, no organizer-side flow)
- Color Rules → **FRESH**
- Discount Rules and Markdown Cycles → **FRESH**
- Print Inventory Sheets → **FRESH**
- Compose Custom Labels → **FRESH**

**Organizer Promotion (§4.6):**
- Where to Post Flyers → **FRESH** (Patrick called this out)
- The Promote Page → **FRESH**
- Yard Signs and QR Codes → **THIN** (`/guide#qr-codes` covers QR basics)
- Set Up Your Brand Kit → **FRESH**
- Send Sale Updates → **FRESH**
- Built-In Share Cards → **FRESH**

**Organizer Sale Day (§4.7):**
- Run the POS → **FRESH**
- Settle Up → **THIN** (`/guide#payouts` covers payouts only)
- The Line Queue → **FRESH**
- Message Templates → **THIN** (`/guide#shopper-communication` partial)
- Treasure Trails (organizer) → **FRESH**

**Organizer Advanced (§4.8):**
- Onboard a Consignor → **FRESH**
- List Items on eBay → **FRESH**
- Connect Shopify → **FRESH**
- Webhooks and Zapier → **WRAPPER** (`/guide#zapier-webhooks` already at depth)
- Submit Items for Community Appraisals → **WRAPPER** (`/guide#community-appraisals` already at depth)
- Use Bounties to Source Items → **FRESH**
- Read Your Flip Report → **FRESH**

**Shopper Discovery (§4.9):**
- Find Sales Near You → **THIN** (`/faq` has the basic question)
- Save Items to Your Wishlist → **THIN** (`/faq` partial)
- Follow an Organizer → **WRAPPER** (`/faq` answers this directly)
- Browse by City → **FRESH**
- Surprise Me, Trending, Inspiration Feed → **FRESH**
- Plan a Day With the Sale Planner → **FRESH**

**Shopper At the Sale (§4.10):**
- Holds (shopper) → **THIN** (`/faq` covers basics)
- What the Condition Grades Mean → **WRAPPER** (`/condition-guide` is canonical)
- Bidding on Auction Items → **THIN** (`/guide#auction-items` is organizer-side)
- Trade Items With Other Shoppers → **FRESH**
- Pay Requests → **FRESH**
- Loot Log → **FRESH**

**Shopper Explorer's Guild (§4.11):**
- Hunt Pass → **THIN** (`/faq` has questions; `/shopper/hunt-pass` page exists)
- How Ranks Work → **WRAPPER** (`/shopper/guild-primer` is canonical)
- Earning XP Without Spending → **WRAPPER** (`/shopper/guild-primer` is canonical)
- Rare Finds and Early Access → **THIN** (`/faq` rare-finds question)
- Achievements and the Hall of Fame → **FRESH**
- Streak Rewards → **FRESH**
- The Loot Legend → **FRESH**

**Shopper Community (§4.12):** All five → **FRESH**. No existing coverage of haul posts, crews, trails, bounties, leaderboard/league.

**Trust & Community (§4.13):**
- How Organizer Reputation Works → **THIN** (`/faq` has trust questions)
- Refer a Friend → **WRAPPER** (`/guide#referral-program` partial)
- Introduce an Organizer → **FRESH** (S635 mechanic, no existing docs)
- Build Your Reputation as an Organizer → **FRESH**
- Affiliate Links → **FRESH**
- The Ripples Page → **FRESH**
- How Disputes and Refunds Work → **THIN** (`/faq` has dispute question)

### 6.4 Audit totals

- **FRESH** — 47 guides (full new drafts)
- **THIN** — 18 guides (deeper-than-existing drafts, ~300–500 words)
- **WRAPPER** — 10 guides (short context wrappers, ~150–250 words, deep-link to existing canonical page)

Writing burden by treatment: FRESH ~47 × 900 = 42,300 words, THIN ~18 × 400 = 7,200 words, WRAPPER ~10 × 200 = 2,000 words. **Total ~51,500 words across 75 drafts** — significantly less than the naive "75 × 900 words" estimate (~67,500) because the audit caught the WRAPPER and THIN cases.

---

## 6. Tone, Language & Style Rules

These are non-negotiable per Patrick's existing memory and brand decisions.

### 6.1 Vocabulary

**Never use:**
- "AI" anywhere a user can see — banned by decision D-006. Use "Auto", "Smart", "Suggested", or describe the mechanic ("photo recognition", "comparable-sale lookup")
- "Estate sale" as the only kind of sale — every guide should reflect that the platform serves yard sales, auctions, flea markets, consignment, and retail too. When an example is needed, vary it
- Founder voice — no first-person Patrick, no "I built this because…", no Silicon Valley positioning
- Buzzwords: "leverage", "ecosystem", "seamless", "frictionless", "powerful", "robust", "next-generation", "best-in-class", "game-changing"
- Sales urgency: "act now", "limited time", "don't miss out", exclamation points in headlines

**Use:**
- Plain verbs: "open", "tap", "save", "set", "send", "take a photo", "review the price"
- Specific numbers when they help: "30 seconds", "10% platform fee", "60 photos in 5 minutes"
- The user's actual goal: "list a sale" instead of "leverage our listing platform"

### 6.2 Voice

- Sound like a clerk at a hardware store explaining how to use the new register, not a brand manager
- Sender on every email/help piece is "The FindA.Sale Team" — never named individuals
- One idea per paragraph
- Sentences should mostly fit on one line on a phone

### 6.3 Format conventions

- Title is the user's task, not the feature name: "Photograph an entire sale in one pass" beats "Rapidfire Mode"
- First sentence answers "what is this and who is it for"
- Steps are numbered, not bulleted
- Screenshots are real screenshots from a seed account, not mockups
- Every guide ends with a short "Common questions" block — these answers are also pulled into `/faq` so questions show up wherever the user is looking

### 6.4 What "explanatory not salesy" looks like

Bad: "Rapidfire Mode is the fastest way to bring your inventory online and unlock the full power of the FindA.Sale platform."

Good: "Rapidfire Mode lets you photograph an entire sale in one pass. The app handles the parts most organizers hate — naming items, picking categories, and suggesting a price — so you can focus on shooting the next photo. Most organizers can do 60 items in five minutes."

---

## 7. Where to Link From (FAQ-to-Guide Map)

The point of writing these is that they get found. Each Phase 1 guide gets at least three inbound links across the existing site. Below is the linking plan for Phase 1 — Phase 2 and 3 follow the same pattern.

| Guide | Inbound link locations |
|-------|------------------------|
| Rapidfire Mode | `/faq` organizer Q "How do I list items quickly?" → link / `/organizer/rapid-capture` empty state → CTA / `/guide` Adding Items section → "See full guide" / dashboard "Add Items" button hover hint |
| Review & Publish | `/organizer/add-items` review pane top banner / `/faq` Q "How do I edit items before publishing?" / `/guide` Adding Items section |
| Pricing an Item | Review queue price-edit field info icon / `/faq` Q "How are prices suggested?" / `/faq` Q "Can I change the suggested price?" / Item detail "Why this price?" link |
| Where to Post Flyers | `/organizer/print-kit` page top / `/faq` Q "How do people find my sale?" / `/guide` Promotion section / Promote page Print & Flyer block |
| Find Sales Near You | Homepage hero "How it works" link / `/faq` shopper Q "How do I find sales near me?" / Map page empty state / `/about` |
| Shopper Holds | Sale detail item card hold button hover / `/faq` Q "What is a hold?" → expand to full guide / `/shopper/holds` empty state |
| Organizer Holds | `/organizer/holds` empty state / `/faq` organizer Q "How do I approve a hold?" / Notifications about pending holds |
| Condition Grades | Search filter info icon / Item detail condition badge tooltip / `/faq` Q "What is a condition rating?" / `/condition-guide` page (cross-link) |
| Stripe Payouts | `/organizer/stripe-connect` setup page / `/faq` payout questions / `/guide` Payouts section / Settings → Payouts |
| Hunt Pass | Hunt Pass landing/upsell modals / `/faq` Q "What is Hunt Pass?" / Rare Finds / Early Access paywall pages |
| Refer a Friend | `/shopper/referrals` page top / Dashboard widget / `/faq` Q "Do you have a referral program?" |
| Organizer Reputation | Organizer profile rating block / `/about` trust section / `/faq` Q "How do I know an organizer is legit?" |

---

## 8. Production Logistics

### Where the files live

- Written guides: new directory `packages/frontend/pages/guides/<slug>.tsx` (or single `[slug].tsx` reading from `data/guides/<slug>.md` for easier authoring — Architect call)
- Screen capture videos: `packages/frontend/public/guides/<slug>.mp4`
- 9:16 explainer videos: `packages/frontend/public/guides/<slug>.html` (same template as existing ad files)
- Source markdown for written guides (if file-based): `packages/frontend/data/guides/<slug>.md` with frontmatter (title, slug, audience, related)

### Authoring tools

- Marketing content goes through the `findasale-marketing` skill (already covers brand voice and audience). Each guide draft passes through this agent before shipping
- Customer Champion (`findasale-customer-champion` skill) reviews each guide for "would this answer a real support question"
- Polish Agent (`findasale-polish` skill) reviews UI references for accuracy before publish
- Architect signs off on the new `/guides` route before Phase 1 writing starts

### Sequence per guide

1. Architect: confirm route + data shape (one-time, before Phase 1)
2. Marketing subagent: draft written guide from outline
3. Customer Champion: review for real support coverage
4. Polish: verify UI refs match production
5. Patrick: 5-minute read + final voice check
6. Dev: ship the page (and embed video if applicable)
7. Add inbound links per §7 in same dispatch

### Video production sequence

1. Patrick (or seed account) captures the workflow at 1080×1920 with QuickTime/OBS
2. Voice take recorded against the captured footage
3. Editor composites and exports `.mp4`
4. Add to public guides folder, embed in written page

### Per-guide token estimate

- Written-only Phase 1 guide: ~5k tokens to draft, ~2k to QA = 7k
- Written + video Phase 1 guide: ~7k draft + ~3k video script + ~2k QA = 12k
- Phase 1 total: ~110k tokens of agent work spread across 4–6 sessions

---

## 9. What This Plan Does Not Include

These were considered and intentionally left out:

- **A separate brand-ambassador certification program.** Research shows the product doesn't have a formal program — it has the referral mechanic, the affiliate page, and the introduce-an-organizer flow (S635). Bundling those under an "Ambassador Program" label would require building the program first, which is a roadmap decision, not a docs decision. The existing pieces get guides; a formal ambassador program would get its own PRD.
- **A user-champion certification.** Same reasoning. The Customer Champion is an internal subagent role, not a user-facing program.
- **Long-form courses or webinars.** The library is per-feature. If a multi-part course is wanted later (e.g., "Run your first sale, end to end" — covering whichever sale type the user is running), it would stitch together existing guides rather than be authored fresh.
- **Translated versions.** All guides are English-only at first. Add Spanish in Phase 4 if/when audience signal warrants it.
- **A help-search bar.** The existing `/faq` and the new `/guides` library should be linkable but a dedicated search UI is out of scope here.

---

## 10. First Action

If Patrick approves this plan:

1. **Drafting kickoff (no site work yet).** Marketing-skill subagent dispatch starts with one cluster at a time, in this order:
   1. Organizer Photo Workflow (6 drafts — includes Patrick's #1 rapidfire ask)
   2. Organizer Review & Publish (6 drafts — includes Patrick's #2 pricing ask)
   3. Organizer Promotion (6 drafts — includes Patrick's "where to post flyers" ask)
   4. Shopper At the Sale (6 drafts — holds + bidding + condition wrapper)
   5. Shopper Discovery (6 drafts)
   6. Trust & Community (7 drafts)
   7. Organizer Sale Day (5 drafts)
   8. Organizer Inventory (5 drafts)
   9. Organizer Advanced (7 drafts)
   10. Organizer Sale Creation (5 drafts)
   11. Organizer Setup (5 drafts)
   12. Shopper Explorer's Guild (7 drafts)
   13. Shopper Community (5 drafts)
   Each cluster returns the drafts to Patrick for read + voice check before the next cluster starts. This catches a tone-drift early instead of after 75 drafts are done.

2. **Architect dispatch (parallel to drafting clusters 1–3).** Decide the `/guides/<slug>` route shape: markdown source files in `data/guides/` driving a single `[slug].tsx`, or JSX per page. Return decision; no implementation yet.

3. **Patrick reviews all 75 drafts.** Edits, merges, kills any that turn out to duplicate `/guide` or `/faq`.

4. **Site prep dispatch.** Once drafts are approved: build the `/guides` index, the slug page, the FAQ inbound links (per §7), the dashboard hint links, and the `/guide` section expansions for the THIN cases that didn't earn a dedicated page.

5. **Video production runs after the written drafts.** Patrick reviews scripts in step 3; capture sessions batch 4–5 workflows in one sitting; 9:16 explainer videos use the existing template + music bed.
