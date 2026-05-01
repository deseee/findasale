# Patrick's Dashboard — S605 Wrap (P0 SSR Closed + Subagent Fabrication Discovery)

## Status: P0 SSR ✅ FIXED. /sales/[id] returns 200 unauth (build `ouEe_ZxrqSurr9RHc_b5F`). Sitemap + robots ✅ live via static `public/` bypass. Three S605 re-dispatches all fabricated their files — deferred to S606 with verified protocol.

**Headline win:** the 30+ session-long P0 unauth SSR 500 across `/sales/[id]`, `/items/[id]`, `/sitemap.xml` is closed. Root cause was `@vercel/analytics@1.6.1` shipping an ESM file that does `import { useEffect } from "react"` — but react@18 ships as CJS, so Node's strict ESM loader 500'd every SSR page that loaded `_app.tsx` at module-load time. Same for `@vercel/speed-insights`. Both were imported and rendered statically in `_app.tsx`, so EVERY dynamic page failed unauth. Authed users saw cached client chunks; unauth visitors and crawlers got `/500`. Fix: replaced both static imports with `next/dynamic(..., { ssr: false })`. The bug was live since at least S572 — masked because all QA was done logged-in.

**S604/S603/S600/S599 all chased the wrong fix** (null guards, OG image fallbacks, defensive try/catches in our own code). The throw was upstream in a node_modules path, not in any code we'd written. The Vercel runtime log via `mcp__27b581af__get_runtime_logs` was the unlock — error message `⨯ file:///var/task/node_modules/.pnpm/@vercel+analytics@1.6.1.../dist/react/index.mjs:4 SyntaxError: Named export 'useEffect' not found`.

**Subagent fabrication pattern surfaced:** 4+ dispatches across S604+S605 (scraper Phase 1 ×2, metro auto-content ×2, PR Wire checklist ×1) all reported success and produced detailed file lists. Verified by `Glob`: zero files exist on disk for any of them. Hypothesis — general-purpose Agent dispatches write to their own VM scratch space (`/sessions/[isolated-id]/...`) instead of the mounted Windows workspace. Tool calls succeed inside their VM; files vanish on teardown; agents Read their own scratch and confirm "their" files exist. **Real fixes that landed this session went through main-session Edit tool directly** (proven by the verified-200 deploy outcome). S606 is set up to use main-session inline writes for the three queued workstreams instead of subagent dispatches.

**Decisions you locked this session (4 of 17):**
- D-073-A scraper legal: "beg forgiveness, not permission" + 24h takedown protocol
- D-074-B metro scale: 3000 cities (the agents' 137 cap was fabricated)
- D-S603-F supply seeding: you + 2 organizers = 3 (clears Loot Drop gate D-S603-D)
- D-PR-C launch date: Tuesday May 5 9am EST (4 days from now)

**Decision defaults applied** (industry-standard, flip if desired): D-073-B email outreach 3-touch Day 1/3/7 ✓ • D-073-C placeholder photos ✓ • D-073-D scraped visible to all tiers ✓ • D-073-E first claim free ✓ • D-PR-A press release version B (no "AI") ✓ • D-PR-B vendor PRNewswire eSpeed $595–795 ✓.

## ⚠️ Push block — wrap docs only (S605 code already pushed mid-session)

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "S605 wrap: P0 SSR fix landed (vercel analytics dynamic-import) + fabrication pattern documented + S606 prep"
.\push.ps1
```

**Already pushed mid-session (no action needed):**
- `packages/frontend/pages/_app.tsx` (the SSR fix — verified 200 production)
- `packages/frontend/public/sitemap.xml` (static, replaces broken dynamic)
- `packages/frontend/pages/sitemap.xml.ts` (top-level try/catch, superseded but harmless)
- `packages/frontend/pages/sales/[id].tsx` + `pages/items/[id].tsx` (defensive guards, harmless)
- `packages/frontend/pages/robots.txt.ts` (DELETED — conflicted with `public/robots.txt`)

**Nothing else to push.** The three S605 re-dispatches (scraper, metro, PR checklist) all fabricated — no real files to add.

## 🚀 S606 Work Plan (Multi-step verified — main-session inline writes)

**Why the protocol changed:** S604 + S605 produced 4+ subagent dispatches that all fabricated their files. The pattern is consistent — general-purpose Agent dispatches for net-new file creation report success but write to their own VM scratch instead of the Windows workspace. S606 uses main-session inline Write tool for the small workstreams and a verified-multi-step subagent loop for the big one.

**Priority order for S606 (~3-4 hours total):**

1. **PR Wire launch checklist** (May 5 deadline — 4 days out). Main session writes `claude_docs/strategy/s606-pr-wire-launch-checklist.md` directly. Reads `s603-pr-wire-blast-package.md` in chunks (file is large), composes the 6-section checklist (Tomorrow Morning Action Plan, v2 review prompts, distribution targets, day-of playbook, risk flags, post-launch tracking). ~30-45 min. Decisions all locked: Version B, PRNewswire eSpeed, May 5 9am EST.

2. **Metro auto-content build script** (3000 cities). Main session writes `packages/frontend/scripts/generate-us-cities.ts` directly. Script fetches from `https://raw.githubusercontent.com/kelvins/US-Cities-Database/main/csv/us_cities.csv` (public domain, ~30K rows), filters population ≥ 2,500, slugifies as `{kebab-name}-{state}` with county tie-break, writes to `packages/frontend/data/us-cities-3000.json`. Also writes `pages/city/[slug].tsx` per ADR-074. Patrick runs `pnpm data:cities` locally after push to populate the JSON. ~45-60 min.

3. **Scraper Phase 1** (~12 files — biggest). Two paths:
   - **3a. Multi-step verified subagent loop:** main session dispatches ONE file at a time, `Glob`s after each return, dispatches the next only if file exists. ~12 round trips × 3 min = 30-45 min. Bulletproof against fabrication.
   - **3b. Patrick uses Cursor / Claude Code locally** with the ADR-073 spec. Cursor writes to disk natively. Faster if Patrick has 90 min. Recommended path.

   Decisions all locked: D-073-A "beg forgiveness" + 24h takedown, D-073-B email outreach 3-touch, D-073-C placeholder photos, D-073-D scraped visible to all tiers, D-073-E first claim free.

**Already in flight from S603/S604 plan but DEFERRED to S607+:**
- SEO long-tail content moat (ADR-075 written, dev not started)
- Public-browse mode audit (architect spec needed)
- Newsjacking engine launch (Patrick manual, ~30 min setup + 3h first post)
- Creator UGC swap outreach (Patrick manual, ~3h)
- HN/Reddit/ProductHunt launch (after Batch 1 deliverables are live)
- Wikipedia backlink seeding ($1-2K freelance, optional)

## 📐 Original cold-start mechanics added in S603 (after viral-plan pushback)

Patrick rejected the viral plan's user/cash dependencies. Re-evaluated with zero-users + zero-cash filter. Four mechanics dispatched in parallel:

| Mechanic | Deliverable | Eng cost | Cash cost | First impact |
|---|---|---|---|---|
| **Public scrape-and-republish directory (#1)** | ADR-073 | 40h Phase 1, 160h full | $5/mo proxy | Becomes THE estate sale directory in 60-90 days |
| **PR Wire Blast (#2 promoted)** | Press release v1 + v2 + vendor comparison + 25 media targets + 4-wk plan | 4h Patrick | $300-800 (Cision/PRNewswire) | Fire next week, 50-500 clickthroughs |
| **Newsjacking engine (#5 reframed)** | 10 trigger categories + monitoring stack + 10 worked example posts | 0h eng (manual) | $0 | 1 post/week, compounds 12-24mo |
| **eBay metro auto-content (#8 promoted)** | ADR-074 | 32h Phase 1 (50 metros), 72h full (3K) | $0-99/mo | Per-city pages look lived-in immediately |

The thread that connects them: **build the most comprehensive sale-and-pricing index in the country before any organizer signs up.** Scraper indexes everything → metro pages display it per-city → newsjacking + PR Wire drive traffic to it → unmanaged listings convert organizers via Claim flow (S601 already shipped).

## 🎯 Decision status (as of S605 wrap)

**Locked by Patrick this session:**
- **D-073-A** Scraper legal — beg forgiveness, 24h takedown ✓
- **D-074-B** Metro scale — 3000 cities ✓
- **D-S603-F** Supply seeding — Patrick + 2 organizers ✓ (clears D-S603-D Loot Drop gate)
- **D-PR-C** Launch date — Tuesday May 5 9am EST ✓

**Defaults applied (industry-standard — flip if you want to change):**
- D-073-B email outreach — yes, 3-touch Day 1/3/7 (CAN-SPAM compliant)
- D-073-C photos — placeholder only on unmanaged listings
- D-073-D tier-gating — scraped listings visible to all tiers
- D-073-E claim flow — first claim free, full edit unlocked
- D-PR-A press release version — Version B (no "AI" per D-006)
- D-PR-B vendor — PRNewswire eSpeed $595–795
- D-S603-A waitlist incentive — Founding 100 + 6mo PRO + public page
- D-S603-C organizer referral bounty — $200 + 6mo PRO per referral
- D-S603-E Sales SSR OG meta — P0 in Week 3 (still pending — separate from the SSR fix shipped this session)

**Still open / replaced:**
- **D-S603-B** Creator paid sponsorship — Patrick rejected as "no money for influencers." Replaced by Creator UGC Swap (zero cash, free PRO + featured placement). 60-contact advisory list available; outreach is Batch 2 manual work, not blocking.
- **D-074-A** Metro page title — recommended "Top Estate Sale Finds in [City]" + intro covers all sale types. Not yet locked but defaulting at S606 dispatch unless you flip.
- **D-074-C** City tips ownership — at 3000 cities scope, you can't write all of them. Auto-gen for long tail, you write top 10 metros (~10 hours one-time). Default applies.

Industry-standard recommendations were compiled in S605 (Robinhood waitlist mechanics, Zillow/Redfin city-page patterns, hiQ Labs CFAA precedent for public-facts scraping, SaaS marketplace claim/conversion conventions). 14 of 17 decisions had a clear standard answer; 3 were genuine judgment calls (your time allocation + risk tolerance).

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
