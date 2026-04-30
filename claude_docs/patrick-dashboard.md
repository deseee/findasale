# Patrick's Dashboard — S601 ✅ COMPLETE

## Status: Storefront v2 full build-out complete. All 9 remaining gap features shipped (#354–#356, #359, #361–#363). 4 new migrations. 2 new components. Designer can now finish.

---

## S601 Summary — Storefront v2 Full Build-Out

**Features shipped (all Pending Chrome QA):**
- **#354 Business Hours** — OrganizerHours table (day-of-week rows, HH:MM, timezone, by-appointment). Settings UI 7-day grid. Storefront Hours card.
- **#355 Organizer Type Multi-Select** — 8-type checkbox grid in settings (Estate Sales, Yard Sales, Auctions, etc.). Pill badges on storefront below bio.
- **#356 Broadcast to Followers** — BroadcastSection.tsx in settings (PRO/TEAMS only). POST /organizers/me/broadcast creates Notification rows for all followers. Recent broadcasts list.
- **#359 Sale Pinned / Featured Flag** — Pin toggle on sales mgmt page. Amber "Pinned" badge. Pinned sales sort first. "Featured" amber badge on storefront.
- **#361 Claim-This-Listing Flow** — ClaimListingModal.tsx (NEW). Amber claim banner on sales/[id]. POST /organizers/:id/claim (unauthenticated). isClaimed + isUnmanagedListing + ClaimRequest schema.
- **#362 Sale Attendance Count** — attendanceCount field + PATCH endpoint. Number input on ended sales in sales.tsx.
- **#363 Auction Buyer's Premium + Lot Numbers** — buyersPremiumPct on Sale (AUCTION-gated in create-sale), lotNumber on Item. Disclosure box on items/[id]. Lot badge on ItemCard.
- **Sales SSR OG meta** — getServerSideProps on sales/[id].tsx so FB/iMessage scrapers get per-sale og:image/title/description.

**4 new migrations (all must be deployed — see Step 2 below):**
1. `20260430000000_storefront_v2_hours_types_pinned` — OrganizerHours table + organizerTypes + byAppointment + timezone + isPinned
2. `20260430200000_organizer_broadcast` — OrganizerBroadcast table
3. `20260430210000_attendance_buyers_premium_lot_number` — attendanceCount + buyersPremiumPct + lotNumber
4. `20260430220000_storefront_v2_claim_listing` — isClaimed + isUnmanagedListing on Organizer + ClaimRequest table

**Note:** Migration `20260430000000_storefront_v2_hours_types_pinned` is alphabetically before `20260430100000_storefront_v2_organizer_fields` (already deployed S600). They touch different columns — Prisma will apply the unapplied one and skip the already-applied one. A drift warning may appear — ignore it.

---

## ⚡ Do This Now

**Step 1 — Push all S601 changes:**

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/database/prisma/schema.prisma
git add "packages/database/prisma/migrations/20260430000000_storefront_v2_hours_types_pinned/migration.sql"
git add "packages/database/prisma/migrations/20260430200000_organizer_broadcast/migration.sql"
git add "packages/database/prisma/migrations/20260430210000_attendance_buyers_premium_lot_number/migration.sql"
git add "packages/database/prisma/migrations/20260430220000_storefront_v2_claim_listing/migration.sql"
git add packages/backend/src/routes/organizers.ts
git add packages/backend/src/controllers/saleController.ts
git add packages/backend/src/controllers/itemController.ts
git add packages/frontend/pages/organizer/settings.tsx
git add packages/frontend/pages/organizer/sales.tsx
git add "packages/frontend/pages/organizer/storefront/[slug].tsx"
git add packages/frontend/components/OrganizerSaleCard.tsx
git add packages/frontend/components/BroadcastSection.tsx
git add packages/frontend/components/ClaimListingModal.tsx
git add "packages/frontend/pages/sales/[id].tsx"
git add "packages/frontend/pages/organizer/create-sale.tsx"
git add "packages/frontend/pages/items/[id].tsx"
git add packages/frontend/components/ItemCard.tsx
git add claude_docs/strategy/roadmap.md
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "feat: Storefront v2 full build-out — #354 Hours, #355 OrganizerTypes, #356 Broadcast, #359 PinnedSale, #361 ClaimListing, #362 Attendance, #363 BuyersPremium/LotNumber + sales SSR OG"
.\push.ps1
```

**Step 2 — Deploy all 4 new migrations (Railway DB):**

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

A drift advisory warning may appear about migration ordering — that's expected and safe to ignore.

---

## Outstanding — Queued for S602

| Item | Priority | Notes |
|------|----------|-------|
| **Chrome QA: all storefront v2 features** | P1 | #352/#353/#354/#355/#356/#359/#360/#361/#362/#363 all Pending Chrome QA. One feature per QA dispatch. |
| **dev-environment skill Neon URL** | P2 | Flagged 5x — use skill-creator to update old Neon URL. |
| **Draft contact audit** | P2 | Memory note from Apr 27: run draft contact audit next session. |

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
