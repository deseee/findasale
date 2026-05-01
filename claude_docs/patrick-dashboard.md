# Patrick's Dashboard — S617 WRAP

## Status: S617 done. EstateSalesNet GitHub Actions scraper fully unblocked — all 6 TypeScript/CI errors resolved and confirmed on GitHub.

**Headline:** The GH Actions scraper had a cascade of 5 TypeScript errors + 1 missing CI step (prisma generate) that blocked every CI run. All fixed this session. The workflow is code-complete on `main`. The scraper will fire at midnight UTC once you add the 3 GitHub Secrets below — or you can trigger it manually right now via GitHub Actions.

---

## 🎯 Your Pending Actions (in priority order)

| Priority | Action | Deadline | Notes |
|----------|--------|----------|-------|
| **P1 URGENT** | Fill `[Last Name]` ×3 + real cell in press release | **File Mon May 5, 9:00 AM EST** | File: `claude_docs/strategy/s603-pr-wire-blast-package.md` Version B |
| **P1** | Push S617 wrap docs (block below) | Now | Just STATE.md + this file |
| **P1** | Add GitHub Secrets for GH Actions scraper | When ready | See below — 3 secrets needed |
| **P1** | Run 2 S614 migrations if not done yet | After push | Commands below |
| **P1** | `pnpm install` in `packages/backend` if not done | After push | Picks up puppeteer-extra + stealth plugin |
| **P2** | Add 4 Railway env vars | When ready | `METRO_SYNC_ENABLED=true`, `CLAIM_EMAIL_ENABLED=true`, `GOOGLE_PLACES_KEY`, `FB_ACCESS_TOKEN` |
| **P2** | Set `USE_GH_ACTIONS_ESTATESALESNET=true` in Railway | After scraper verified | Gates out Railway cron for EstateSalesNet — do this after a successful GH Actions run |
| **P2** | Audit other `setInterval + invalidateQueries` patterns | S618 | Same bypass-the-guard bug from S616 may live in `/sales/[id]/checkin`, `/sales/[id]/photo-station`, organizer dashboard |
| **P3** | Review + send 19 outreach drafts in Gmail | When ready | Nick Loper, Codie Sanchez, NAA ×2, NASMM, ISA, NESA, Antique Trader, AntiqueWeek, 8 others |

---

## 🔑 GitHub Secrets — Add These Now

Go to: **github.com/deseee/findasale → Settings → Secrets and variables → Actions → New repository secret**

| Secret Name | Value |
|------------|-------|
| `RAILWAY_BACKEND_URL` | Your Railway backend URL (e.g. `https://your-backend.up.railway.app`) |
| `INTERNAL_SCRAPER_KEY` | A random secret string — add same value to Railway env vars as `INTERNAL_SCRAPER_KEY` |
| `ESTATESALESNET_ORGANIZER_ID` | Leave blank or omit — the scraper auto-creates the system organizer |

**To test immediately:** Actions → EstateSalesNet Scraper → Run workflow (manual trigger).

---

## 📦 Push Block — S617 Wrap (docs only)

All code changes from this session are already on GitHub. Only wrap docs need pushing.

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "docs: S617 wrap — GH Actions scraper TS errors resolved"
.\push.ps1
```

---

## 🔧 S614 Migrations (if not yet run)

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

**New tables this creates:**
- `MetroTopFinds` — eBay sold items per city slug for city pages
- `OrganizerClaimEmail` — 3-touch claim email tracking per unmanaged organizer

---

## ✅ S617 What Was Done

Fixed 6 cascading CI errors blocking the EstateSalesNet GitHub Actions scraper:

1. **TS2307 module not found** — git case-split between `estateSalesNet.ts` (local) and `estatesalesnet.ts` (GitHub); resolved via `git rm --cached` + re-add with correct casing
2. **TS18046 unknown type** — `response.json()` missing type cast in `run-estatesalesnet.ts`; fixed with explicit `as { stats: ... }` cast
3. **TS2584/TS2304 `document`/`HTMLAnchorElement`** — backend tsconfig has no `dom` lib; fixed with `(globalThis as any).document` workaround inside `page.evaluate()` callback
4. **TS2345 `never[]`** — `const matches = []` in `htmlParser.ts` inferred as `never[]`; fixed: `const matches: string[] = []`
5. **TS2322 `string | null`** — two return paths in `getOrCreateSystemOrganizer()` returned nullable variable from `Promise<string>`; fixed with non-null assertions
6. **Prisma client not initialized at runtime** — workflow missing `prisma generate` step; added with dummy DATABASE_URL

All confirmed on GitHub main. Scraper ready to fire once Secrets are added.

---

## ✅ S616 What Was Done

Deleted-sale loop FULLY closed (root cause: `setInterval` calling `queryClient.invalidateQueries` every 5s, bypassing all `useQuery` guards). Fixed by checking query state inside the interval callback and skipping invalidation when errored. Verified live — zero requests for deleted sale URL across 25-second window.

---

## ✅ S614 What Was Done

### Group 1 — Metro Sync Cron (ADR-074)
- `MetroTopFinds` Prisma model — stores eBay sold items per city for city page display
- Nightly cron at 04:00 UTC, 20 US metros, top 12 items per metro, gated by `METRO_SYNC_ENABLED=true`
- City pages (`/city/[slug]`) now pull real eBay sold-comp data instead of placeholders
- Backend `/api/cities/:slug/top-finds` endpoint added

### Group 2 — Scraper Enrichment
- After the scraper creates an unmanaged organizer, `enrichOrganizer()` fires-and-forgets
- Google Places API lookup → stores `googlePlaceId` on Organizer
- Facebook Graph API search → stores `facebookPageId` on Organizer
- Both gated by env var — graceful skip if keys not set
- ⚠️ Needs: `GOOGLE_PLACES_KEY` + `FB_ACCESS_TOKEN` in Railway

### Group 3 — Craigslist Scraper
- `sources/craigslist.ts` stub replaced with real Cheerio+fetch implementation
- 31 metro subdomain mapping, 500ms rate limiting between metros
- Runs at 12:00 UTC daily
- ⚠️ Craigslist HTML selectors are assumption-based — validate on first prod run

### Group 4 — Claim Email Pipeline
- `OrganizerClaimEmail` model tracks which touch (1/2/3) each unmanaged organizer has received
- 3-touch Day 1/3/7 sequence via Resend, max 50 emails per daily batch, gated by `CLAIM_EMAIL_ENABLED=true`

### Group 5 — SEO Content Moat (ADR-075 Phase 1)
- 500 JSON content entries: 250 "How to run a [sale type] in [City]" + 250 "[City] [sale type] pricing guide"
- `/guide/[slug]` ISR page (24-hour cache, schema.org structured data)
- All 500 URLs added to sitemap
