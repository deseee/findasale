# Patrick's Dashboard — S610 Wrap (Storefront v2 Chrome QA complete)

## Status: Storefront v2 ✅ all core features verified live. 2 features deferred. 1 line sort fix needs push.

**Headline:** All S601 storefront features are working live at `finda.sale/organizer/storefront/kellys-estate-sales`. The backend was returning only 12 fields — fixed in S609 to return 34. Chrome QA in S610 confirmed everything is rendering. One cosmetic bug found and fixed (hours sort order). Two features need future dispatch: #356 Broadcast storefront UI, #363 Buyer's Premium display.

---

## 🎯 Your Pending Actions (in priority order)

| Priority | Action | Deadline | Notes |
|----------|--------|----------|-------|
| **P0** | Push S610 wrap block (below) | Now | Includes hours sort fix + STATE.md + dashboard |
| **P1** | Run `prisma migrate deploy` (pending migrations) | Before scraper/claim features activate | See migration block below |
| **P1** | Set `SCRAPER_ENABLED=true` in Railway env | When ready to go live | Scraper fully gated — won't run until you flip this |
| **P2** | Run `pnpm data:cities` from `packages/frontend` | When ready | Regenerates `data/us-cities-3000.json` with full ~3,000 cities |
| **P2** | Fill in `[Last Name]` (×3) + real cell in press release | **May 5** | File: `claude_docs/strategy/s603-pr-wire-blast-package.md` Version B |
| **P2** | File PR Wire release on PRNewswire | Tue May 5, 9:00 AM EST | Schedule for 9:00 AM EST |

---

## 📦 Push Block — S610 Wrap

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/frontend/pages/organizer/storefront/[slug].tsx
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "fix: storefront hours sort + S610 wrap docs (storefront v2 QA complete)"
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

## ✅ S609+S610 What Was Done

**S609 — Backend root-cause fix:**
- `packages/backend/src/routes/organizers.ts` — `GET /organizers/:id` expanded from 12 → 34 fields; `hours: true` added to Prisma includes; `isPinned` + `attendanceCount` added to sales select
- `packages/frontend/pages/organizer/storefront/[slug].tsx` — `getOrgTypeLabel()` normalization helper (handles uppercase DB values), isClaimed state + claim banner, attendance count rendering

**S610 — Chrome QA + 1 bug fix:**
- `packages/frontend/pages/organizer/storefront/[slug].tsx` — hours sorted by dayOfWeek (was insertion order)

**QA Results (Chrome-verified):**

| Feature | Result |
|---------|--------|
| #354 Business Hours | ✅ Mon–Sat rendered, correct times |
| #355 Org Type Badges | ✅ "Estate Sales" + "Consignment" (uppercase normalized) |
| #359 Pinned "Featured" badge | ✅ Amber pill on pinned sale card |
| #361 Claim banner | ✅ Hidden for isClaimed:true (correct) |
| #362 "👥 247 attended" | ✅ Under sale title |
| Tagline (S609) | ✅ Italic in green header |
| yearFounded (S609) | ✅ "Est. 2015" in About |
| twitterUrl (S609) | ✅ "Twitter/X" link |
| tiktokUrl (S609) | ✅ "TikTok" link |
| #356 Broadcast | DEFERRED — no storefront frontend code |
| #363 Buyer's Premium | DEFERRED — nested AuctionDetails query needed |

---

## 🚀 S611 Plan (Next Session)

1. Smoke test: verify hours sort fix deployed (Mon, Tue, Wed, Thu, Fri, Sat order)
2. Dispatch #356 Broadcast storefront UI to `findasale-dev`
3. Dispatch #363 Buyer's Premium storefront display (add `auctionDetails` to sales include)
4. Add unclaimed organizer to seed for #361 claim banner positive-path QA

---

## Strategic Context

**"Get too big to ignore before partners can react."** Storefront v2 makes every organizer page a real landing page. Scraper → unmanaged listings → Claim flow → organizer conversion. All pieces are shipped or in-progress.
