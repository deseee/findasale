# Patrick's Dashboard — S590 ✅ COMPLETE

## Status: eBay sync end-to-end working. Real Apr 24 sale marked SOLD via cron.

---

## S590 Results

| Item | Result | Notes |
|------|--------|-------|
| eBay proxy ENOTFOUND root cause | ✅ IDENTIFIED | Akamai's authoritative DNS requires EDNS Client Subnet — serverless resolvers don't send it |
| eBay proxy DNS workaround | ✅ DONE | DoH (Google) with explicit ECS → resolved IPs → node:https with Host/SNI/family:4 |
| Migrate 35+ direct api.ebay.com calls | ✅ DONE | All routed through `ebayProxyUrl()` helper across 5 backend files |
| Helper refactor (post-crash) | ✅ DONE | Module-level `ebayProxyUrl(path)` + `ebayProxyHeaders()` — fixed duplicate-const SyntaxError |
| Sold-sync filter `creationdate` → `lastmodifieddate` | ✅ DONE | Catches late-paying orders that race the watermark |
| Mode 1 URL bug (`?path=?action=token`) | ✅ FIXED | Inline URL construction; helper only handles Mode 2 |
| Cron back to */15 (was */6 for debug) | ✅ DONE | |
| Nintendo Power Apr 24 sale stuck AVAILABLE | ✅ FIXED | SQL'd `ebayListingId=136308590245` + reset watermark → cron caught it → SOLD |
| **Mode 1 startup 500 (Vercel env vars)** | ❌ STILL OUT | Patrick task — see below |
| **96 other items with NULL ebayListingId** | ⚠️ PARTIAL | Need import-inventory dedup fix shipped first, then click "Sync eBay Inventory" button |

---

## ⚡ Do This First (next session)

**ONE message with TWO parallel `Agent` calls** — see task #13 in TaskList for the exact template. Briefs live verbatim in tasks #9 and #10. Different files → safe to parallelize.

After both return → spot-check diffs → push → Patrick clicks "Sync eBay Inventory" on the eBay tab of organizer settings → 96 items get backfilled.

---

## Pending Patrick Actions

| Action | Why |
|--------|-----|
| **Vercel redeploy without build cache** | Mode 1 token (`?action=token`) returns 500 because Vercel proxy can't read EBAY_CLIENT_ID/SECRET. Vars are set in UI (Production+Preview) but not reaching the function. Forced redeploy without build cache should fix it. NOT blocking the cron — Mode 2 works independently. |
| **Click "Sync eBay Inventory"** (after S591 ships) | Backfills the 96 AVAILABLE items missing `ebayListingId`. Wait until task #9 dedup fix is shipped or it'll create duplicates. |
| Push wrap docs (block below) | STATE.md + dashboard updated tonight |

---

## S590 Wrap Push Block

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "wrap: S590 — eBay sync end-to-end fix (DoH+ECS proxy + 35+ call migration)"
.\push.ps1
```

All code from S590 was already pushed mid-session via your `.\push.ps1` runs. Latest backend + frontend commits on main contain everything: proxy migration, helper refactor, Mode 1 URL fix, lastmodifieddate filter, DoH+ECS proxy implementation.

---

## What S590 Actually Solved

The story turned out to be three layered bugs, not one:

1. **Layer 1 (the headline bug):** `api.ebay.com` won't resolve from serverless functions because eBay's Akamai-fronted DNS requires EDNS Client Subnet which Vercel's resolver doesn't send. ALL the DNS workarounds (ipv4first, Google DNS via UDP, undici Agent) failed because they didn't carry ECS forward to Akamai. Fix: Google DoH with explicit ECS in the URL → reads the chain → returns Akamai IPs → node:https connects to those IPs with proper Host/SNI.
2. **Layer 2 (the data bug):** Even with the proxy working, the eBay-push flow never wrote `ebayListingId` back to local items. So when sales happen, the cron has nothing to match against. Manual SQL fix worked for one item. Real fix queued as task #9.
3. **Layer 3 (the design flaw):** The sold-sync cron unconditionally advances `lastEbaySoldSyncAt` to NOW after every run — turning any transient outage into permanent data loss for orders within the outage window. Real fix queued as task #10.

---

## Carry-over (non-eBay)
- **#75 Tier Lapse Chrome QA** — tier-lapse-test@example.com / Seedy2025!
- **Hunt Pass status inconsistency (P2)** — XP Store says "Inactive" while AvatarDropdown says "Active" for Karen
