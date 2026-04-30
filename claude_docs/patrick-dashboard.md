# Patrick's Dashboard — S600 ✅ COMPLETE

## Status: Storefront v2 gap audit + 3 parallel fixes shipped. Tier Lapse card ✅ fixed. /items/{id} 500 ✅ fixed. Schema fields #352/#353/#360 ✅ built.

---

## S600 Summary

**Decisions locked:**
- **#354 OrganizerHours table** — build it. Standard model per Google/Yelp/Apple Maps: day-of-week rows, HH:MM open/close times, timezone on Organizer, byAppointment Boolean.
- **#357 RETAIL saleType** — already done. Migration `20260420200000_retail_saletype` committed RETAIL to saleType months ago. Boolean fields (`isRetailMode`/`hasRetailMode`) no longer exist — dropped in that migration. Feature is "Retail Mode" (not "Shop Mode"). Storefront v2 retail layout keys off `saleType === 'RETAIL'` and `retailAutoRenewDays`.

**Bugs fixed:**
- **Tier Lapse plan card gradient** — `dashboard.tsx` — card was teal/cyan even when `isLapsed=true`. Fixed: separated gradient + border into independent ternaries so both switch to amber on lapse.
- **`/items/{id}` 500 in production** — root cause: `lib/ogImage.ts` was embedding a `data:image/svg+xml` URI as a Cloudinary base path. Special characters in the URI broke Vercel's Node runtime URL parser → SyntaxError on every items page. Fixed: use Cloudinary native `b_rgb:fef3c7` background parameter instead. No data URIs.

**New schema fields shipped (#352 tagline / #353 year founded / #360 social links):**
- `Organizer.tagline String?` — one-liner below business name
- `Organizer.yearFounded Int?` — year business founded
- `Organizer.twitterUrl/tiktokUrl/youtubeUrl/pinterestUrl String?` — 4 new social link fields
- Migration: `20260430100000_storefront_v2_organizer_fields`
- Backend validation + response updated in `routes/organizers.ts`
- Settings UI: tagline (120-char counter), year founded, 4 social link inputs added to Profile + Social sections

**Roadmap:** Entries #352–#363 added (storefront v2 gap audit). #357 marked resolved.

---

## ⚡ Do This Now

**Step 1 — Push all S600 changes:**

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/frontend/pages/organizer/dashboard.tsx
git add packages/frontend/lib/ogImage.ts
git add packages/database/prisma/schema.prisma
git add "packages/database/prisma/migrations/20260430100000_storefront_v2_organizer_fields/migration.sql"
git add packages/backend/src/routes/organizers.ts
git add packages/frontend/pages/organizer/settings.tsx
git add claude_docs/strategy/roadmap.md
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "fix: Tier Lapse card gradient + /items/{id} 500 (data URI ogImage); feat #352/#353/#360 tagline/yearFounded/social links schema + settings UI"
.\push.ps1
```

**Step 2 — Run migration (new schema fields):**

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="[Railway DATABASE_URL — copy from Railway dashboard → findasale-db → Variables]"
npx prisma migrate deploy
npx prisma generate
```

---

## Outstanding — Queued for S601

| Item | Priority | Notes |
|------|----------|-------|
| **Sales pages SSR OG meta** | P2 | `/sales/[id]` has no per-sale og:image/title/description server-side. SaleOGMeta renders post-mount only — FB/iMessage scrapers don't see it. Pattern: add getServerSideProps like `items/[id].tsx`. |
| **#354 OrganizerHours table** | Roadmap | Build the table when ready for storefront v2. |

---

## Pending Patrick Actions

| Action | Why | Blocking? |
|--------|-----|-----------|
| dev-environment skill Neon URL fix | Flagged 5x now — Neon decommissioned S264, skill still has old URL. skill-creator + present_files install button. | No |
| eBay backfill 96 stuck items | Click "Sync eBay Inventory" on /organizer/settings (eBay tab). Verify via SQL in STATE.md. | No |
| Vercel env vars (eBay token Mode 1) | EBAY_CLIENT_ID/SECRET not reaching function. Confirm values, redeploy without build cache. Mode 2 cron unaffected. | No |
| Advisory outreach | 28 Gmail drafts queued. Send 1–2/day using patrick@finda.sale Send As alias. | No |

---

## QA Queue

| Feature | Status | Notes |
|---------|--------|-------|
| S599 Hydration #418 click test | Pending Chrome QA | Code-verified, visual click test deferred |
| S599 Hunt Pass status (Karen) | Pending QA | Needs stale-JWT scenario unlikely on prod seed |
| S599 PDF watermark visual | Pending Chrome QA | Generate one of each (Print Kit, Marketing, Earnings, Settlement) as TEAMS toggled-on vs SIMPLE |
| S599 iCal footer | Pending Chrome QA | Trigger AddToCalendar, open .ics, confirm footer in DESCRIPTION |
| S599 DonationModal end-to-end | Pending Chrome QA | Needs sale with unsold items + active settlement |
| S599 Holds /shopper end-to-end | Pending Chrome QA | Needs active hold setup |
| S598 dark mode modals | Pending Chrome QA | 8 components |
| S598 mobile overflow | Pending Chrome QA | admin/items + shopper/history |
| S598 error states | Pending Chrome QA | dashboard + edit-sale |
| S598 Wishlist rename | Pending Chrome QA | visual scan across pages |
| S597 condition rating sync + FAQ merge | Pending Chrome QA | From S597 |
| Treasure hunt progress page | Pending Chrome QA | S595 carryover |
| ConfirmDialog smoke test | UNVERIFIED | Need deletable consignor/location |
| #278 Treasure Hunt Pro | Blocked | Needs Hunt Pass + live QR scan |
| #268 Trail Completion XP | Blocked | Karen's trail has 0 stops |
| #281 Streak Milestone XP | Blocked | Needs 5 real consecutive days |
| RankUpModal dark mode | Blocked | Can't trigger rank artificially |
| S529 mobile nav rank | Pending | Mobile viewport test |
| #52 Encyclopedia detail page | Pending | Railway redeploy d77cff42 |

---

## Carry-over

- **Advisory outreach:** 28 Gmail drafts queued. Send 1–2/day using patrick@finda.sale Send As alias.
- **eBay sync:** Click "Sync eBay Inventory" after deploy to re-import 96 items with null ebayListingId.
- **Sandbox stability:** S597 + parts of S599 had VM workspace unavailable. File tools + GitHub MCP + Vercel MCP + Railway MCP all worked normally. Pattern continues — flag for investigation if it persists across more sessions.
