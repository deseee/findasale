# Patrick's Dashboard — S591 ✅ COMPLETE

## Status: eBay sold-sync fully repaired. Root cause fixed end-to-end.

---

## S591 Results

| Item | Result | Notes |
|------|--------|-------|
| Cron matching blind (96/97 null IDs invisible) | ✅ FIXED | Removed `ebayListingId IS NOT NULL` filter from both queries; all AVAILABLE items now candidates |
| Third-tier title match fallback | ✅ DONE | Normalized title match on items with null ID; unambiguous only; backfills `ebayListingId` on match |
| Import root cause: SKU stored instead of numeric ID | ✅ FIXED | Added offer API call in import loop to fetch numeric `listingId`; dedup checks both values; create block uses numeric ID |
| Backfill of existing items with wrong ID | ✅ DONE | Import now finds items with either numeric ID or SKU stored, backfills to numeric if needed |
| **Mode 1 startup 500 (Vercel env vars)** | ❌ STILL OUT | Patrick task — Vercel redeploy without build cache |

---

## ⚡ Do This Now

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/backend/src/jobs/ebaySoldSyncCron.ts
git add packages/backend/src/controllers/ebayController.ts
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "fix(ebay): complete sold-sync and import ebayListingId tracking [wrap S591]"
.\push.ps1
```

After deploy, go to organizer Settings → eBay tab → click **"Sync eBay Inventory"**. This re-imports the 96 items with null `ebayListingId`. The fixed import now fetches the numeric listing ID from eBay's offer API and stores it correctly, so future cron runs will match them.

---

## Pending Patrick Actions

| Action | Why |
|--------|-----|
| Push block above | S591 code + wrap docs |
| Click "Sync eBay Inventory" (after push deploys) | Backfills numeric `ebayListingId` on all 96 AVAILABLE items. The cron's title-match fallback will handle any that were already sold on eBay in the meantime. |
| **Vercel redeploy without build cache** | Mode 1 token (`?action=token`) returns 500 because Vercel proxy can't read EBAY_CLIENT_ID/SECRET. Vars are set in UI but not reaching the function. NOT blocking the cron — Mode 2 works independently. |

---

## Carry-over (non-eBay)

- **#75 Tier Lapse Chrome QA** — tier-lapse-test@example.com / Seedy2025!
- **Hunt Pass status inconsistency (P2)** — XP Store says "Inactive" while AvatarDropdown says "Active" for Karen
