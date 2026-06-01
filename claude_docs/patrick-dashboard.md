# Patrick's Dashboard — S843 Wrap

---

## What Happened This Session (S843)

QA session. One feature verified, one blocked by a newly-discovered production bug.

**#27b iCal Watermark — ✅ VERIFIED** — Confirmed live in Chrome. The `.ics` download now correctly appends "Shared via FindA.Sale — finda.sale" to the event description for SIMPLE-tier organizers. Watermark removal only suppresses it for TEAMS+ organizers who have that toggle enabled.

**#461 FB Nudge — UNVERIFIED (blocked by production bug)** — The fix code is correct, but a pre-existing bug prevents testing: all exports on the Promote page (Facebook Marketplace, EstateSales.NET, Craigslist) are silently broken in production. The `downloadFile` function sends an empty Bearer token because it reads from `localStorage`, which has been null since the auth cookie migration. This means no real user can download FB Marketplace exports right now, so `fbExportedAt` is never set, so the nudge never fires. A quick fix is needed for `downloadFile` first, then #461 can be re-verified.

---

## ⚠️ New P2 Bug — Promote Page Exports Broken for All Users

**All exports on the Promote page return 401.** This affects:
- Facebook Marketplace spreadsheet download
- Facebook Marketplace JSON download
- EstateSales.NET CSV download
- Craigslist plain text download

Root cause: `downloadFile()` uses the old `localStorage.getItem('token')` pattern, which has been null for all users since the cookie auth security update. Fix is straightforward (2–3 lines) — will be dispatched as first item next session.

---

## Current State

**Blocked Queue: 6 items** (below ≥8 ceiling — dev sessions available)

| Item | Status |
|------|--------|
| RSVP XP Monthly Cap | P0 — infrastructure gap (needs 5 RSVPs) |
| #332 Shopify Cross-Listing | P0 — needs Shopify Partners dev store |
| #293 eBay Post-Sale Panel | P0 — needs ended sale in DB |
| #335 Consignor Payout Email | P0 — run a test payout to verify email fires |
| #461 FB Nudge single-item path | UNVERIFIED — fix downloadFile first, then re-QA |
| Promote exports broken (P2) | `downloadFile` localStorage JWT — all exports 401 |

---

## Your Actions Required

1. **Delete test invite SVPKNKV3** — finda.sale/admin/invites → Delete SVPKNKV3 row.

2. **GBP phone verification** — business.google.com → "Verify now" → phone code.

3. **#239 legal gate** — Attorney + CPA before live consignor payouts.

**Push block (S843 — 2 files, docs only):**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "docs: S843 QA wrap — #27b verified, #461 unverified, P2 downloadFile bug"
.\push.ps1
```

---

## Next Session

Priority order:

1. Fix `downloadFile` on the promote page (P2, trivial fix, blocks #461 QA)
2. Re-QA #461 after the fix ships
3. Apply #27b ✅ to roadmap (records)
4. QA backlog: #32 (wishlist alerts), #68 (command center), #91 (auto-markdown)
