# Patrick's Dashboard — S611 Wrap (Storefront deferred features shipped)

## Status: #356 Broadcast + #363 Buyer's Premium + Tier Lapse card fix all shipped. 4 files ready to push. Pending Chrome QA.

**Headline:** S611 dispatched 3 parallel agents. #356 (Broadcast storefront display) and #363 (Buyer's Premium badge) are now in the codebase. Tier Lapse plan card now shows amber when lapsed. Unclaimed organizer seed added for #361 positive-path QA. OG meta issue diagnosed: likely missing `INTERNAL_API_URL` in Vercel env vars. 19 outreach drafts from S596 still unsent in Gmail.

---

## 🎯 Your Pending Actions (in priority order)

| Priority | Action | Deadline | Notes |
|----------|--------|----------|-------|
| **P0** | Push S611 wrap block (below) | Now | 4 code files + wrap docs |
| **P1** | Run `prisma migrate deploy` (pending migrations) | Before scraper/claim features activate | See migration block below |
| **P1** | Check Vercel env vars for `INTERNAL_API_URL` | Soon | Missing = ogData null on sales pages = no social OG previews |
| **P1** | Set `SCRAPER_ENABLED=true` in Railway env | When ready to go live | Scraper fully gated — won't run until you flip this |
| **P2** | Run `pnpm data:cities` from `packages/frontend` | When ready | Regenerates `data/us-cities-3000.json` with full ~3,000 cities |
| **P2** | Fill in `[Last Name]` (×3) + real cell in press release | **May 5** | File: `claude_docs/strategy/s603-pr-wire-blast-package.md` Version B |
| **P2** | File PR Wire release on PRNewswire | Tue May 5, 9:00 AM EST | Schedule for 9:00 AM EST |
| **P3** | Review + send 19 outreach drafts in Gmail | When ready | Nick Loper, Codie Sanchez, NAA, NASMM, ISA, etc. from S596 |

---

## 📦 Push Block — S611 Wrap

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/backend/src/routes/organizers.ts
git add "packages/frontend/pages/organizer/storefront/[slug].tsx"
git add packages/frontend/pages/organizer/dashboard.tsx
git add packages/database/prisma/seed.ts
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "feat: #356 broadcast storefront, #363 buyer's premium, tier lapse amber, unclaimed seed + S611 wrap docs"
.\push.ps1
```

---

## 🗄️ Migration Deploy Block

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

Pending migrations:
- `20260501020000_scraper_phase1` — Sale scrape fields, ScrapedSalesJob, ClaimEmail
- `20260430220000_storefront_v2_claim_listing` — Organizer.isClaimed/isUnmanagedListing, ClaimRequest

---

## ✅ S611 What Was Done

**Agent A — #356 Broadcast + #363 Buyer's Premium:**
- `packages/backend/src/routes/organizers.ts` — `GET /organizers/:id` now includes `broadcasts: { orderBy: sentAt desc, take: 1 }` + `auctionDetails: { select: { buyerPremiumRate: true } }` on sales
- `packages/frontend/pages/organizer/storefront/[slug].tsx` — "Latest Update" card (broadcast message + relative time); amber "Buyer's Premium: n%" pill on AUCTION sale cards

**Agent B — Tier Lapse plan card:**
- `packages/frontend/pages/organizer/dashboard.tsx` — line 844: amber gradient/border/text/button when `isLapsed=true`; teal when not

**Agent C — Seed + OG meta diagnosis:**
- `packages/database/prisma/seed.ts` — user11 = "Sunrise Consignment & Collectibles" (Muskegon MI, `isClaimed=false`, `isUnmanagedListing=true`); user12 = primary shopper
- OG meta: no code fix needed — `INTERNAL_API_URL` env var missing in Vercel is the likely culprit

**Draft contact audit:**
- 19 drafts from S596 batch still unsent (Nick Loper, Codie Sanchez, NAA ×2, NASMM, senior-settlers, ISA, NESA, Antique Trader, AntiqueWeek, Amanda's Mercantile, 8 others)

---

## 🚀 S612 Plan (Next Session)

1. Push S611 block (above) — first action
2. Run pending migrations
3. Chrome QA: storefront broadcast card, buyer's premium badge, tier lapse amber
4. Check Vercel for `INTERNAL_API_URL` — fix OG meta
5. Verify #361 claim banner positive path (user11 storefront after re-seed)

---

## Strategic Context

**"Get too big to ignore before partners can react."** Storefront v2 makes every organizer page a real landing page. Scraper → unmanaged listings → Claim flow → organizer conversion. All pieces are shipped or in-progress.
