# Patrick's Dashboard — S686 Wrap

---

## Current State

| Area | Status |
|------|--------|
| Vercel build | ✅ GREEN |
| Railway backend | ✅ Green |
| Google OAuth | ⚠️ Still broken (root cause unclear) |
| Login (email/password) | ✅ Working |
| MCP Server (mcp.finda.sale) | ✅ LIVE — 7 tools |
| Organizer DB (post-purge) | ✅ Clean — 7,897 records intact, zero orphaned sales |
| Directory workflows | ✅ All 4 active sources confirmed working |
| #393 Chrome QA Sprint | 🟡 One item remaining — Auction #174 (needs items listed) |
| #394 Full Walkthrough | ⬜ After QA sprint |
| Directory rebuild plan | ✅ Complete — specs written, ready to dispatch S687 |

---

## What Happened This Session (S686)

Pure research and planning session. No code shipped.

**Google Places purge verified clean:**
- 7,897 organizer records still exist (none deleted)
- Only the `googlePlaceId` field was nulled across all records
- Zero orphaned Sale records
- Zero shopper-facing impact — no frontend page references googlePlaceId

**All four active workflows confirmed working:**
- Foursquare: 3,656 organizer records, ~12/run avg — working
- HERE Places: 596 organizer records, ~4/run avg — working
- EstateSalesNet: 7,492 sales linked to organizers — working
- Facebook Events: 699 sales — working
- OSM: 71 crawl log entries, last run May 4 — workflow confirmed running

**New sources evaluated:**
- **EstateSales.org** — Tier 1 candidate (different company from .NET, organizer-focused, national). Need to verify their ToS on data storage before building scraper.
- **State auctioneer licensing boards** — Tier 1, public records, zero ToS risk. Indiana + Ohio first. Yields verified licensed professionals only.
- **MaxSold** — Skip. Transaction platform, not a directory. No organizer profiles.

**Architecture designed (ready for dev dispatch):**
- Corroboration schema: sourceCount, sourcesJson, corroborationScore, dedupeKey fields on Organizer model. Full merge algorithm written.
- Lead scoring rubric: 0–100 scale, 7 signal categories, maps to Teams/Enterprise tiers. All new Organizer fields identified.

---

## Patrick Push Block (S686)

No code changes. Only doc updates:

```powershell
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "S686: Session wrap — directory rebuild research complete"
.\push.ps1
```

---

## Next Session (S687) — Ready to Fire

Three parallel dispatches at session start:

1. **Dev A** — Corroboration schema migration + merge logic (spec complete from S686 Architect agent)
2. **Dev B** — Lead scoring fields on Organizer model (spec complete from S686 Sales Ops agent)
3. **Research C** — EstateSales.org ToS verification + confirm OSM workflow file location on GitHub

After C returns:
- If EstateSales.org ToS clear → dev dispatch scraper workflow
- State auctioneer licensing board scraper (Indiana first)
