# Patrick's Dashboard — S603 Wrap → S604 National Cold-Start Blitz

## Status: 8 parallel work streams queued for S604. National scope from day one. Defaults overridden per Patrick directive: "go big fast before they can react, doing only one city at a time is how you get caught before you can scale."

**S604 directive:** Mechanics 1-4 in parallel + additional cold-start work streams. **National scope, NOT GR-only.** Saved as feedback memory `feedback_go_big_fast_not_local.md`. Overrides ADR-073 Phase 1 default (was: GR only) and ADR-074 default scope (was: 50 metros) — both flip to **national from day one**.

S603 was a strategy session — no code shipped. First pass produced founder-hustle spikes (cold-call sales, daily founder vlogs, Reddit AMA) → Patrick rejected verbatim as *"pathetic way of being viral."* Re-dispatched innovation with corrected viral-mechanics framing. Innovation generated 15 mechanics; advisory board GTM committee (5-voice stress test) verdicted top 5. Final plan: Waitlist Position-Jumping ships Week 1 (clean approve), Loot Drop Cascade ships infra Week 1 / activates Week 3-4 gated on 3+ real organizers × 5+ sales each, TikTok Creator Sponsorship capped at 5 creators ($15K/4mo, FTC contracts required), Auto-Reels REJECTED, Bounty Board reframed as retention not growth (Month 2). Patrick hours target ≤10h/wk. Supply seeded by Patrick's family + 2 friends (≤6h one-time) + organizer-referral bounty.

## ⚠️ Push block — 11 strategy/architecture files + 2 wrap docs (PowerShell, copy-paste)

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add claude_docs/strategy/spike1-real-operator-seeding.md
git add claude_docs/strategy/spike2-visceral-content-plan.md
git add claude_docs/strategy/spike3-channel-exploration.md
git add claude_docs/strategy/s603-acquisition-action-plan.md
git add claude_docs/strategy/s603-viral-mechanics.md
git add claude_docs/strategy/s603-viral-mechanics-gtm-stress-test.md
git add claude_docs/strategy/s603-final-plan.md
git add claude_docs/strategy/s603-pr-wire-blast-package.md
git add claude_docs/strategy/s603-newsjacking-engine.md
git add claude_docs/architecture/ADR-073-DIRECTORY-SCRAPER.md
git add claude_docs/architecture/ADR-074-METRO-AUTO-CONTENT.md
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "S603 wrap: viral mechanics + cold-start dispatches (scraper, PR wire, newsjacking, metro auto-content), founder-hustle spikes superseded"
.\push.ps1
```

## 🚀 S604 Work Streams — 8 in flight (national scope)

**Batch 1 — Engineering parallel (4 dispatches week 1):**
1. **Directory scraper national** (ADR-073, override Phase 1 to national) — 80h dev, EstateSales.NET + Craigslist + GarageSaleFinder × all US metros via Vercel proxy. DMCA + 24h takedown baked in.
2. **Metro auto-content 3K cities** (ADR-074, override scope to 3K not 50) — 50h dev, per-city pages from eBay sold-comps via Census ZCTA mapping + Next.js ISR. Schema-light.
3. **SEO long-tail content moat** (NEW — architect spec then dev) — ~60h Phase 1, auto-generated category guides + city × category pages. Composes with #1 + #2 as SEO front-line.
4. **Public-browse mode** (NEW — architect spec) — ~24h, every page indexed without auth. Signup becomes upgrade event not access event. Like Zillow/Indeed.

**Batch 2 — Patrick + manual parallel to Batch 1 (~10h Patrick time week 1):**
5. **PR Wire Blast fire** — Patrick provides name+phone, picks version (A tech vs B business vs both), picks vendor (PRNewswire vs Cision), $600-800 cash, files release week 1.
6. **Newsjacking engine launch** — Patrick subscribes to alert stack (30 min), publishes first post week 1 from one of the 10 worked examples or current news.
7. **Creator UGC swap outreach** — REPLACES paid creator sponsorship D-S603-B. Patrick repurposes 60-contact advisory list, sends 15 DMs week 1, target 5 swaps signed by week 3. Zero cash.

**Batch 3 — Triggered after Batch 1 ships (week 2-3):**
8. **HN + Reddit + ProductHunt founder launch** — once Batch 1 deliverables are live and there's something to point to. Solo founder authenticity story. ~6h Patrick time.

**Optional / queued for week 4+:**
- Wikipedia backlink seeding ($1-2K freelance writer or 40h Patrick) — 20 antique/vintage/estate Wikipedia entries with citations. Compounds Google domain authority over 6-12mo.

## 📐 Original cold-start mechanics added in S603 (after viral-plan pushback)

Patrick rejected the viral plan's user/cash dependencies. Re-evaluated with zero-users + zero-cash filter. Four mechanics dispatched in parallel:

| Mechanic | Deliverable | Eng cost | Cash cost | First impact |
|---|---|---|---|---|
| **Public scrape-and-republish directory (#1)** | ADR-073 | 40h Phase 1, 160h full | $5/mo proxy | Becomes THE estate sale directory in 60-90 days |
| **PR Wire Blast (#2 promoted)** | Press release v1 + v2 + vendor comparison + 25 media targets + 4-wk plan | 4h Patrick | $300-800 (Cision/PRNewswire) | Fire next week, 50-500 clickthroughs |
| **Newsjacking engine (#5 reframed)** | 10 trigger categories + monitoring stack + 10 worked example posts | 0h eng (manual) | $0 | 1 post/week, compounds 12-24mo |
| **eBay metro auto-content (#8 promoted)** | ADR-074 | 32h Phase 1 (50 metros), 72h full (3K) | $0-99/mo | Per-city pages look lived-in immediately |

The thread that connects them: **build the most comprehensive sale-and-pricing index in the country before any organizer signs up.** Scraper indexes everything → metro pages display it per-city → newsjacking + PR Wire drive traffic to it → unmanaged listings convert organizers via Claim flow (S601 already shipped).

## 🎯 Decisions to lock by Sunday May 3 (defaults shown)

**Original 6 from viral plan:**
1. **D-S603-A** — Waitlist incentive (Founding 100 + 6mo PRO). Default = adopt.
2. **D-S603-B** — Creator cap (5 creators × $750/mo × 4mo = $15K). Default = 5 creators. **NOTE: Patrick rejected this as "no money to pay influencers" — recommend kill or replace with creator UGC swaps (#11) at $0 cash.**
3. **D-S603-C** — Organizer referral bounty ($200 + 6mo PRO per referral). Default = adopt.
4. **D-S603-D** — Loot Drop activation gate (3+ orgs × 5+ sales). Default = adopt. **NOTE: Patrick called this "no users to send to" — gate may be more aggressive (10 orgs × 10 sales) or Loot Drop may be replaced entirely by metro auto-content + scraper traffic.**
5. **D-S603-E** — Sales SSR OG meta P0. Default = P0.
6. **D-S603-F** — Supply seeding (3 friends, ≤6h). Default = adopt.

**New from cold-start dispatches:**
7. **D-S603-G** — Scraper legal comfort (cease-and-desist will come from EstateSales.NET). Default = proceed with DMCA registration + 24h takedown protocol.
8. **D-S603-H** — Scraper outreach (proactive email "we have you listed, claim free" → 3-4x conversion vs silent). Default = silent index Phase 1, evaluate Phase 2.
9. **D-S603-I** — PR Wire press release version (A: AI-powered tech angle vs B: inventory-mgmt business angle vs both). Default = both, A to tech tier 4, B to tiers 1-3. **D-006 nuance:** AI-powered fine in media-facing release.
10. **D-S603-J** — PR Wire vendor (PRNewswire $595-795 vs Cision $299). Default = PRNewswire if budget allows, Cision if testing first.
11. **D-S603-K** — PR Wire contact details needed (full name, phone for press release boilerplate).
12. **D-S603-L** — Metro auto-content title phrasing ("Top Estate Sale Finds in [City]" SEO-optimized vs "Top Sale Finds" inclusive). Default = estate-focused title + inclusive page copy.
13. **D-S603-M** — Metro auto-content scope. **OVERRIDDEN by Patrick's go-national directive — Phase 1 = 3K cities, not 50.** No further decision needed.
14. **D-S603-N** — Metro tips content owner. **OVERRIDDEN — at 3K cities scope, Patrick can't write all tips. Default = freelance writer pool ($30-50/article × ~200 high-value cities = $6-10K outsourced) or auto-generated tips from template + city stats for the long tail.**

**Override applied automatically (per S604 national directive):**
- D-S603-M flipped from 50 metros → 3K cities Phase 1
- D-S603-G scraper scope flipped from "1 source × 1 metro Phase 1" → "all major sources × national Phase 1"

Reply with letter + override only if you want to change a default. Silence = adopt all defaults including overrides above.

## 🎯 Six decisions to lock by Sunday May 3 (defaults shown — accept or override)

1. **D-S603-A — Waitlist incentive:** Founding 100 badge + 6mo free PRO + public name page. No referral-position-bumps in MVP. **Default = adopt.**
2. **D-S603-B — Creator cap:** 5 creators at $750/mo for 4 months ($15K total). **Default = 5 creators at $750/mo.**
3. **D-S603-C — Organizer referral bounty:** $200 cash + 6mo PRO per referred organizer who ships first sale. Cap 25/mo. **Default = adopt.**
4. **D-S603-D — Loot Drop activation gate:** 3+ real organizers × 5+ real sales each before Loot Drop activates. **Default = adopt.**
5. **D-S603-E — Sales SSR OG meta:** promote S599 carryover bug to P0 Week 3 (Loot Drop social-share previews depend on it). **Default = P0.**
6. **D-S603-F — Supply seeding:** Patrick onboards family + 2 friends only (≤6h, one-time). After that, referral bounty + eBay sync carry supply. **Default = adopt.**

Reply with letter + override only if you want to change a default. Silence = adopt all defaults.

---

## Strategic Stance (Locked S602 — D-007 amendment)

**"Get too big to ignore before partners can react."**

- Speed-to-distribution over partner agreements.
- Design for partner reneges (eBay/Mercari/etc. WILL renege, raise API prices, or build a competing layer — assume it).
- Real operators + real data = the only durable defensibility.
- Don't waste cycles on "venture vs acquisition" framing debates — frame-debates slow shipping.

---

## Q2 Primary Path — Organizer Acquisition Sprint (S603+)

| Spike | Initiative | Owner | Timeline | Status |
|-------|-----------|-------|----------|--------|
| **1 (GATING)** | Real-operator seeding (concierge onboard 10, Founding Operator program, GR Saturday hand-recruit, real-data acceleration) | findasale-sales-ops | 2-4 weeks | NEXT |
| **2 (PARALLEL)** | Visceral content (40→15 time-lapse, "what we found" series, "pile that doesn't sell," founder vlog, first-100 waitlist) | findasale-marketing | 1-2 weeks for first 3-4 pieces | NEXT |
| **3 (RESEARCH)** | Channel exploration (TikTok, YouTube, local TV, Reddit, FB groups, in-person GR circuit, trade pubs, influencers, local partnerships) | findasale-innovation | 2-3 weeks per channel | NEXT |

---

## Q3+ Deferred Initiatives

| Initiative | Status | Why Deferred |
|-----------|--------|--------------|
| RVM campaign (V2 scripts, A2P 10DLC, voice talent) | Design phase | 4-5 week ramp too slow vs spike approach. V2 scripts attorney-ready; A2P checklist pre-filled. |
| eBay + Mercari channel bridge | Architecturally approved, awaiting Hacker review | Need real-operator baseline before measuring channel-bridge ROI. 8-week build post-approval. |

---

## S602 Artifacts Produced (filed in `claude_docs/strategy/`)

- `ebay-channel-strategy-memo.md` — Phase 1 8wk + Phase 2 3mo channel routing playbook (in /outputs/, may need relocation)
- `ebay-strategy-board-stress-test.md` — GTM + Future Vision committee review (in /outputs/, may need relocation)
- `rvm-scripts-v1.md` — 5 original variants, Version C selected by board+gurus, then flagged for compliance issues
- `rvm-scripts-v2.md` — 5 revised variants with first-person Patrick substantiation; V2-D + V2-E recommended
- `rvm-scripts-board-guru-review.md` — full board + 6 business guru critique (Hormozi, Cialdini, Sugarman, Brunson, Suby, Halbert) (in /outputs/, may need relocation)
- `rvm-tcpa-compliance-review.md` — full 42-item attorney handoff checklist
- `rvm-a2p-10dlc-package.md` — pre-filled TCR brand + campaign registration package
- `phase1-channel-bridge-adr.md` — 296 eng hours, eBay first then Mercari, 4 new Prisma models, $40/mo recurring (in /outputs/, may need relocation)

**File hygiene note:** Four of the eight artifacts above only persist in `/outputs/` (the VM temp folder). Records flagged this — Patrick should decide whether to relocate to `claude_docs/strategy/` next session or leave as scratch.

---

## Pending Patrick Actions

| Action | Why | Blocking? |
|--------|-----|-----------|
| **`claude_docs/legal/` directory ratification or removal** | Created without approval by S602 legal subagent. Locked Folder Map decision needed. | No |
| **MI LLC details for A2P 10DLC** | Application package pre-filled; Patrick provides legal name, EIN, formation date, registered street address, authorized rep, business phone, contact email (recommend `contact@finda.sale` over yahoo for TCR vetting), estimated monthly volume | No (queued) |
| **V2 RVM script attorney sign-off** | V2-D + V2-E recommended; non-MI targeting scope needs final review | No (queued) |
| **Voice talent decision + booking** | 2-3 hour session for selected V2 scripts | No (queued) |
| **dev-environment skill stale Neon URL** | Flagged 5x — Neon decommissioned S264, skill still has old URL. skill-creator + present_files install button | No |
| **eBay backfill 96 items** | Click "Sync eBay Inventory" on `/organizer/settings`. Verify via SQL in STATE.md | No |
| **Vercel env vars (eBay Mode 1)** | EBAY_CLIENT_ID/SECRET not reaching function. Confirm values, redeploy without build cache. Mode 2 cron unaffected. | No |
| **Advisory outreach** | 28 Gmail drafts queued. Send 1-2/day using `patrick@finda.sale` Send As alias | No |

---

## Carryover QA Queue (Pending Chrome QA)

| Feature | Status | Notes |
|---------|--------|-------|
| S601 Storefront v2 (#354–#363) | Pending Chrome QA | 9 features, 4 migrations. One feature per QA dispatch. |
| S599 Hydration #418 click test | Pending Chrome QA | Code-verified, visual click test deferred |
| S599 Hunt Pass status (Karen) | Pending QA | Stale-JWT scenario unlikely on prod seed |
| S599 PDF watermark visual | Pending Chrome QA | Print Kit / Marketing / Earnings / Settlement, TEAMS-on vs SIMPLE |
| S599 iCal footer | Pending Chrome QA | Trigger AddToCalendar, open .ics, confirm footer in DESCRIPTION |
| S599 DonationModal end-to-end | Pending Chrome QA | Needs sale with unsold items + active settlement |
| S599 Holds /shopper end-to-end | Pending Chrome QA | Needs active hold setup |
| S598 dark mode modals | Pending Chrome QA | 8 components |
| S598 mobile overflow | Pending Chrome QA | admin/items + shopper/history |
| S598 error states | Pending Chrome QA | dashboard + edit-sale |
| S598 Wishlist rename | Pending Chrome QA | visual scan |
| S597 condition rating sync + FAQ merge | Pending Chrome QA | From S597 |
| Treasure hunt progress page | Pending Chrome QA | S595 carryover |
| ConfirmDialog smoke test | UNVERIFIED | Need deletable consignor/location |
| #278 Treasure Hunt Pro | Blocked | Needs Hunt Pass + live QR scan |
| #268 Trail Completion XP | Blocked | Karen's trail has 0 stops |
| #281 Streak Milestone XP | Blocked | Needs 5 real consecutive days |
| RankUpModal dark mode | Blocked | Can't trigger rank artificially |

---

## Deployment Status

**Frontend (Vercel):** Latest = S601 Storefront v2 full build-out. Auto-deploys on push.
**Backend (Railway):** Latest = S601 (4 migrations deployed). Auto-deploys on push.
**Database:** PostgreSQL on Railway. Migrations current as of S601.
**S602 changes:** Documentation + file relocation only. No deploy required for product.

---

## ⚡ Push Block (S602 Wrap)

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add claude_docs\STATE.md
git add claude_docs\patrick-dashboard.md
git add claude_docs\strategy\rvm-scripts-v1.md
git add claude_docs\strategy\rvm-scripts-v2.md
git add claude_docs\strategy\rvm-a2p-10dlc-package.md
git add claude_docs\strategy\rvm-tcpa-compliance-review.md
git commit -m "S602 wrap: strategy artifacts filed, S603 acquisition sprint directive locked, get-too-big-to-ignore stance D-007 amendment"
.\push.ps1
```

**If `claude_docs/legal/rvm-tcpa-compliance-review.md` still exists** (records said it was moved but verify):
```powershell
Remove-Item -LiteralPath "claude_docs\legal\rvm-tcpa-compliance-review.md"
Remove-Item -LiteralPath "claude_docs\legal" -Recurse  # only if empty and you want directory removed
```

**If RVM files still exist at project root** (records said moved but verify):
```powershell
Remove-Item -LiteralPath "rvm-scripts-v1.md","rvm-scripts-v2.md","rvm-a2p-10dlc-package.md"
```

---

## Key Dates

| Date | Milestone | Status |
|------|-----------|--------|
| Now (S603) | Real-operator seeding sprint kickoff | Next session |
| S603 + 1-2 weeks | First 3-4 visceral content pieces shipped | Next |
| S603 + 2-4 weeks | First 5-10 hand-recruited real organizers running real sales | Next |
| Q3 (post-baseline) | RVM campaign Phase 1 launch (if Spike 1 stalls, accelerate) | Deferred |
| Q3 (post-baseline) | eBay + Mercari channel bridge dev dispatch (post-Hacker review) | Deferred |
