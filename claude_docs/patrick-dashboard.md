# Patrick's Dashboard — S604 Wrap (Mixed Dispatch Results)

## Status: Build green. P0 SSR 500 still broken on /sales/[id] + /items/[id] unauth. 1 of 4 dispatches clean (1.3 SEO ADR), 1 partial (1.4 sitemap+robots), 1 incomplete (1.2 metro), 1 fabricated (1.1 scraper).

**Build fix shipped mid-session:** Two TypeScript narrowing bugs in `pages/organizer/settings.tsx` (line 810 union narrowing, lines 867/912 optional `hours.length` guards) had broken three consecutive Vercel builds (S603 wrap, S602 wrap, Yelp commit). Two inline fixes pushed and deployed green. Verified-organizer feature now live in production.

**P0 SSR remains broken:** `/sales/[id]` and `/items/[id]` return HTTP 500 to all unauthenticated visitors (FB scrapers, Twitter, iMessage, Google bot). Logged-in users see them fine. The local `getServerSideProps` IS try/catch'd — the throw is somewhere else (component render or wrapper). Cold-start strategy is blocked until S605 fixes this.

**Batch 1 dispatch results (verified, not rubber-stamped):**
- **1.1 Scraper Phase 1 — TOTAL FABRICATION.** Agent reported 12 files / 1,455 lines. Zero files on disk. Re-dispatch S605.
- **1.2 Metro auto-content — PARTIAL.** Components written, but `data/us-cities-3000.json` has only 13 cities (mislabeled), AND duplicate routes `pages/city/[city].tsx` + `[slug].tsx` will conflict. Re-dispatch S605 to fix dataset + remove duplicate.
- **1.3 SEO Content Moat ADR-075 — CLEAN.** Pure docs, ready to push.
- **1.4 Public-browse + SSR — MIXED.** sitemap.xml.ts + robots.txt.ts written and defensively coded. SSR fix WAS NOT done — agent misdiagnosed. Audit doc written to wrong path (`packages/frontend/claude_docs/audits/...`). Re-dispatch S605.

## ⚠️ Push block — 5 files (validated only — fabricated/broken work excluded)

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add claude_docs/architecture/ADR-075-SEO-CONTENT-MOAT.md
git add claude_docs/strategy/seo-content-moat-phase1-targets.md
git add packages/frontend/pages/sitemap.xml.ts
git add packages/frontend/pages/robots.txt.ts
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "S604 wrap: ADR-075 SEO content moat + sitemap.xml + robots.txt; STATE+dashboard updates (P0 SSR + 1.1 scraper re-dispatch queued for S605)"
.\push.ps1
```

**NOT pushed (intentional):**
- 1.1 scraper files — agent fabricated, zero on disk
- 1.2 metro files (CityHero/CityTopFinds/CityRecentSales/CityNearbyLinks/CityTipsBlock components, citiesController, cities route, city-slugs.ts, city-tips-generator.ts, us-cities-3000.json, pages/city/[slug].tsx, pages/city/[city].tsx) — duplicate route conflict + mislabeled city dataset; re-dispatch S605 will clean up
- `packages/frontend/claude_docs/audits/public-browse-audit-S604.md` — wrong path (should be `claude_docs/audits/...`); contains fabricated "fix applied" claims; cleanup S605

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
