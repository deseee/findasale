# Session Prompt: Directory & App Listing Pipeline
**Created:** 2026-06-11 | **Status:** Ready to execute | **Session type:** RESEARCH/CREATIVE

---

## Context

FindA.Sale is a two-sided marketplace PWA for secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment) and shoppers. It is live at finda.sale. The backend is Node.js/Prisma/PostgreSQL on Railway; frontend is Next.js on Vercel.

Patrick is the sole non-technical founder. He uses Claude subagents as his entire product team.

---

## What this session is about

FindA.Sale has no presence on software directories, comparison sites, or launch platforms — while competitors MaxSold and EstateSales.NET are already indexed on most of them. We planned a Tier 1–3 submission pipeline in S952 and submitted to G2 Digital Markets that session (Request ID: 45e97946-6161-4a9e-b84d-463e66267636). Everything else remains unstarted.

This session should **execute as many directory submissions as possible** and **produce ready-to-use assets for the ones that need prep** (especially Product Hunt).

---

## State going in

Roadmap section: `claude_docs/strategy/roadmap.md` → `## Directory & App Listing Submissions`

| # | Platform | Status |
|---|---------|--------|
| 476 | G2 Digital Markets (covers G2 + Capterra + GetApp + Software Advice) | ✅ SUBMITTED S952 — pending review |
| 477 | AlternativeTo | ⬜ **HIGH URGENCY — free, ~10 min, goes live immediately** |
| 478 | Product Hunt | ⬜ Needs 2–3 weeks prep — assets need building this session |
| 479 | G2 Profile Page | ⬜ PENDING G2 review (blocked until #476 clears) |
| 480 | SaaSHub | ⬜ Free — saashub.com/add |
| 481 | Crunchbase | ⬜ Free — crunchbase.com/add-a-company |
| 482 | SourceForge | ⬜ Free |
| 483 | Software Finder | ⬜ Free |
| 484 | Roundup article outreach (Gitnux, WifiTalents, DIYAuctions) | ⬜ Email outreach needed |
| 485 | Trustpilot | ⬜ Free — trustpilot.com/signup |
| 486 | AppSumo | ⬜ Post-beta |
| 487 | BetaList | ⬜ betalist.com/submit |
| 488 | Uneed | ⬜ uneed.be |

---

## Product facts for submissions

Use these consistently across all submissions. Do NOT invent details not listed here.

**Product name:** FindA.Sale  
**URL:** https://finda.sale  
**Tagline options (use the best fit per platform):**
- "The marketplace where local sales go to be found."
- "Discover estate sales, yard sales, auctions, and flea markets near you."
- "The organizer platform for estate sales, yard sales, auctions, and flea markets."

**Category:** Event Management software / Marketplace / Estate Sale Software  
**Target users:** Two-sided — (1) sale organizers who manage/list sales, (2) shoppers who discover and attend  
**Key features:**
- Organizer tools: sale creation, inventory management with smart item tagging, QR codes, print kits, consignor tracking, insights dashboard
- Shopper tools: sale discovery by location, favorites, wishlist matching, sale alerts, Explorer's Guild loyalty program
- Smart item categorization and pricing suggestions
- PWA (works on mobile without app store install)
- Map-based sale discovery

**Pricing:**
- SIMPLE: Free (1 active sale, basic tools)
- PRO: $29/month (unlimited sales, advanced tools, analytics)
- TEAMS: $79/month (multi-organizer workspaces)
- Enterprise: $500+/month (large organizations)
- Single Sale: $9.99 (one-time)

**Founded:** 2025  
**HQ:** Grand Rapids, MI (business mailing: 219 E Michigan Ave, Suite F, Paw Paw, MI 49079)  
**Contact:** info@finda.sale  
**Stage:** Live beta with paying customers  

**What makes it different from competitors:**
- EstateSales.NET and MaxSold are listing-only directories; FindA.Sale is a full management platform for organizers
- Mobile-first PWA — organizers can run a sale from their phone
- Smart item tagging reduces manual data entry
- Two-sided marketplace flywheel (organizers attract shoppers who attract more organizers)
- Explorer's Guild gamification encourages repeat shopper visits

**Competitors to list in AlternativeTo (as alternatives TO FindA.Sale):**

The goal is breadth — list FindA.Sale against every tool in every category where someone running secondary sales might be searching for alternatives. This maximizes discovery surface on AlternativeTo.

**Estate sale platforms (direct — highest intent):**
- EstateSales.NET — the dominant estate sale listing directory
- EstateSales.org — major estate sale listing directory
- MaxSold — Canadian-origin online-only estate sale platform
- AuctionNinja — estate sale online auction platform

**Auction platforms (organizers looking to switch):**
- HiBid — popular online auction hosting platform
- LiveAuctioneers — auction marketplace with large buyer base
- Invaluable — auction aggregator and marketplace
- Proxibid / Bidspotter — industrial and estate auction platforms
- 32auctions — simple online fundraiser/charity auction tool
- Auctria — nonprofit auction management (events/fundraisers overlap)
- AuctionFlex — traditional auction house software

**Consignment software (organizers running consignment sales):**
- SimpleConsign — cloud consignment shop management software
- ConsignCloud — consignment store POS and management
- Liberty4 Consignment — consignment POS software

**Garage/yard sale finder sites (direct shopper-side competitors):**
- GarageSaleFinder.com — aggregates garage/yard sale listings by zip
- gsalr.com — garage sale listing and route planning site
- YardSaleSearch.com — yard sale finder site

**General marketplace apps (high traffic, cast-wide-net play):**
- Facebook Marketplace — used by millions for garage/yard sales and local resale
- Craigslist — primary free listing tool for garage sales
- OfferUp — local buying/selling app with sale listings
- Nextdoor — neighborhood app widely used to advertise yard/garage sales
- Mercari — peer-to-peer marketplace used by consignment sellers

**Event management tools (organizers who manage sales as events):**
- Eventbrite — used by some organizers to create event pages for estate/specialty sales
- Accelevents — virtual and hybrid event management (some estate auction overlap)

---

## Priority order for this session

### 1. AlternativeTo (#477) — DO THIS FIRST
**Why urgent:** MaxSold and EstateSales.NET are already there. FindA.Sale not being there while competitors are is the single fastest-to-fix discoverability gap.  
**What to do:** Use Claude in Chrome to navigate https://alternativeto.net/about/add-software/ and submit. Goes live immediately — no approval queue.  
**Fields needed:** Name, URL, short description (under 250 chars), category, tags, logo.  
**Short description to use:** "FindA.Sale helps organizers manage estate sales, yard sales, auctions, and flea markets — with inventory tools, smart item tagging, QR codes, and a shopper discovery marketplace."

### 2. SaaSHub (#480) and Crunchbase (#481) — SAME SESSION
Both are free, no approval queue. Navigate and submit via Chrome MCP.  
- SaaSHub: https://www.saashub.com/add  
- Crunchbase: https://www.crunchbase.com/add-a-company  

### 3. Product Hunt (#478) — Build assets (don't launch yet)
Product Hunt needs 2–3 weeks of community warm-up before a launch. This session should produce all the assets Patrick needs so the launch can be queued whenever he's ready:

**Assets to build:**
1. **Tagline** (60 chars max): One punchy line for the PH post
2. **Description** (260 chars max): Expanded pitch
3. **Maker comment** (the launch post "from the maker") — ~200 words, friendly, product-led (no founder name — signed "The FindA.Sale Team")
4. **Feature list** (5–6 bullet points for the PH sidebar)
5. **First comment responses** — 3 example responses to common PH questions ("Is this just estate sales?" "How does pricing work?" "How is this different from EstateSales.NET?")
6. **Topic tags** to select on PH (suggest 5)
7. **Screenshot/demo order** — recommend the order of 5 screenshots for maximum impact (describe each shot needed; Patrick captures from finda.sale)
8. **Hunter recommendation** — self-hunt or find a hunter, and why

### 4. BetaList (#487) and Uneed (#488)
Quick submissions — betalist.com/submit and uneed.be. No approval required.

### 5. Roundup article outreach (#484)
Draft 3 outreach emails for:
- Gitnux "Top 10 Estate Sale Software" article
- WifiTalents "Top 10 Estate Sale Software" article  
- DIYAuctions roundup

Research the articles first to find the author and contact form. Emails should be brief (4–6 sentences), reference the specific article, note FindA.Sale fits the list, include the URL. Signed "The FindA.Sale Team." No founder name.

---

## Submission constraints (brand rules — non-negotiable)

- **Never write "AI" in user-facing copy** — use "Smart" or "Auto" instead
- **No founder voice** — sender is always "The FindA.Sale Team," never name Patrick
- **No "estate sale" as sole sale type** — always include yard sales, auctions, flea markets in descriptions
- **National positioning** — never position as Grand Rapids–only or Michigan-only product

---

## Output expected from this session

1. **Submission receipts or screenshots** for AlternativeTo, SaaSHub, Crunchbase, BetaList, Uneed — any completable via Chrome MCP
2. **Formatted submission data** for platforms requiring a form Patrick fills manually — copy-paste text for every field
3. **Complete Product Hunt assets** as a single `.md` file saved to `claude_docs/brand/product-hunt-assets-2026-06-11.md`
4. **3 roundup outreach emails** — formatted, ready to send
5. **Roadmap updates** — update `claude_docs/strategy/roadmap.md` § Directory & App Listing Submissions (✅ SUBMITTED or ⬜ ASSETS READY per item)
6. **STATE.md + patrick-dashboard.md** update at session wrap

---

## Files to read at session start

1. `claude_docs/STATE.md` — current project state and session history
2. `claude_docs/strategy/roadmap.md` — specifically § Directory & App Listing Submissions
3. `claude_docs/decisions-log.md` — brand/messaging locked decisions

---

## Session rules reminders

- **No code work this session** — RESEARCH/CREATIVE mode only
- **Chrome MCP available** for actual submissions — use it
- **Do NOT use AskUserQuestion tool** — ask Patrick in plain text if needed
- **Push block at wrap** — STATE.md + patrick-dashboard.md + roadmap.md in one block
- **Credential blackout in STATE.md** — never write passwords or connection strings in wrap docs
- **Edit tool BANNED** — use Python via bash or Write tool for any file edits
- **National Phase 1 by default** — no local-pilot framing in any submission copy
