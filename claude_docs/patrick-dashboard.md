# Patrick's Dashboard — S586 ✅

## Status: Search UX + 9 New Sale Types Shipped

S586 fixed the /search page layout, homepage UX regressions, and added 9 new sale types across the full stack. No migrations needed.

---

## S586 Results

| Item | Result | Notes |
|------|--------|-------|
| Homepage hero | ✅ DONE | Orange gradient, reduced padding |
| Homepage map | ✅ DONE | Explicit 220px height fix |
| Homepage search jump | ✅ DONE | Auto-scroll useEffect removed |
| Homepage Type filter | ✅ DONE | "Type:" dropdown in filter bar |
| /search merge conflict | ✅ DONE | HEAD version kept, filter sidebar always visible |
| Search suggestions on load | ✅ DONE | Only shows when input is focused |
| /search sidebar pushed down | ✅ DONE | Empty state moved inside flex container |
| 9 new sale types | ✅ DONE | Full stack: Zod, dashboard config, forms, map, share copy, OG meta, GPS radius |
| BOOTH type + copy | ✅ DONE | "Vendor Booth" — antique booth, flea booth, farmers market vendor |

---

## New Sale Types Added

GARAGE, MOVING, DOWNSIZING, SWAP_MEET, POPUP, LIQUIDATION, CHARITY, ONLINE, BOOTH

RETAIL remains TEAMS-gated. BUSINESS_CORPORATE (backend-only, pre-existing) left as-is — likely B2B artifact, possibly redundant with LIQUIDATION. Decide if it should stay or be cleaned up.

---

## Wrap Push Block

```powershell
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "wrap: S586 — 9 new sale types, search UX fixes, homepage fixes"
.\push.ps1
```

---

## S587 Priorities

1. Verify new sale types appear correctly in organizer create-sale dropdown on live site
2. Verify /search sidebar stays aligned on first load (no more push-down)
3. Settlement PDF — still UNVERIFIED (requires ENDED sale + SaleSettlement record)
4. S577 bug backlog: settlement payout $0, tier lapse gate, voice icon, #332/#333 Bob tier gates
