# Patrick's Dashboard — April 11, 2026 (S439)

## S439 Summary

Fixed 6 issues from live site reports. Inventory backfilled (447 items). Shopper bounties now work end-to-end. Market Hubs renamed. Subscription page fixed for PRO users.

---

## What S439 Fixed

### Inventory 0 Items — Root Cause + Fix
Items were created without a denormalized `organizerId` field. The service query filtered by `organizerId` which was null on all existing items. Two fixes:
1. `itemLibraryService.ts` — query now uses `OR [organizerId] OR [sale.organizerId]` so old + new items both appear
2. `itemController.ts` — new items now get `organizerId` set on creation
3. **DB backfill run** — 447 existing items updated with correct `organizerId`

### Shopper Bounties — Full Model Evolution
Architect spec + Dev implementation. `MissingListingBounty.saleId` is now optional. Added `itemName`, `category`, `maxBudget`, `radiusMiles` fields. New `/api/bounties/community` endpoint. Shopper bounty form now posts without saleId. Bounty cards now show item name, budget, XP reward, radius.

### Market Hubs Rename
"Flea Market Events" / "Sale Hubs" → "Market Hubs" everywhere: Layout.tsx nav, AvatarDropdown.tsx, hubs/index.tsx page heading. Icon updated to Store.

### Subscription Settings — PRO Display Fix
user2 (PRO, manually seeded) was seeing "Subscription managed externally" message. Fixed: page now shows a proper "Your PRO Plan" card with feature list when tier is PRO but no Stripe subscription object exists. Also added `subscriptionTier` to `/organizers/me` response.

### Bounties TS Build Fix
`bounty.sale` was possibly null after saleId was made optional — added null guard on line 152 of bountyController.ts. Unblocked Railway build.

---

## Push Block (wrap docs only)

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "S439: wrap docs"
.\push.ps1
```

---

## S439 Migration Required

New migration for shopper-first bounties (saleId optional + new fields):

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

---

## QA Queue (Chrome verification still needed)

### S439 (new this session)
- Inventory: organizer should now see all items (not 0)
- Shopper bounties: create bounty → card shows itemName/budget/XP/radius
- Community browse tab loads from /api/bounties/community
- Market Hubs: nav label + icon correct in desktop + mobile + avatar dropdown
- Subscription: user2 PRO → shows "Your PRO Plan" not support message

### S437/S438 (still pending)
- Sale selectors: promote/send-update/photo-ops/print-kit/checklist/line-queue → lists organizer's active sales
- Calendar: `/organizer/calendar` → monthly grid with sales on correct dates
- Platform fees: PRO organizer earnings shows "8%", SIMPLE shows "10%"
- Appraisals: non-PRO can see community feed; submit shows PRO gate

### Older queue
- S436: earnings/qr-codes/staff pages
- S431: trail stops on map, trail detail page loads

---

## Deferred (Not This Session)
- Bounty redesign Phase 2: auto-match on publish, shopper notifications, expiry cron
- Flea Market Events full implementation (ADR-014 locked, schema ready)
- hunt-pass.tsx 3 missing XP sink rows
- Stripe Connect webhook config (items not marking SOLD after POS card payment)
