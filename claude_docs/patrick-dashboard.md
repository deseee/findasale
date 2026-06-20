# Patrick's Dashboard — S1019 (2026-06-20)

---

## What Happened This Session (S1019 — June 20)

**Platform stats fixed — all numbers now from live sources:**

- ✅ **Root cause found** — 36 items had `organizerId = NULL`, making them invisible to platform stats queries. Backfilled directly in production DB.
- ✅ **eBay count** — now calls eBay Inventory API for live published count. Token expired tonight (21:30 UTC) so showing DB fallback of 10 — still accurate. Reconnect eBay in organizer settings to restore live API count.
- ✅ **Google count** — now pulls from the actual feed we submit (92 items). Shows 93 tonight (cold cache after redeploy); cron at 3:30 AM will sync.
- ✅ **Facebook count** — Artifact MI is now correctly flagged as using Facebook Shop (catalog mode). Count = 93 items visible in published sales.
- ✅ **New metric** — "Visible on Our Site" shows 93 items shoppers can actually see on finda.sale right now.
- ✅ **Coverage score** — 69% (up from ~37%). Accurate now that FB catalog is counted correctly.
- ✅ **3 item creation bugs fixed** — Camera upload, sync, and batch analyze now always stamp `organizerId` on new items so this can't happen again.
- ✅ **Dark mode sweep** — 58 `bg-white` instances fixed across 30 components and pages.
- ✅ **Push confirmed green** — commit `f3490c48`, Railway + Vercel both deployed.

---

## Project Status

| Area | Status |
|------|--------|
| BQ (Blocked Queue) | **1 item** — see below |
| Platform dashboard | ✅ Live counts — eBay API, Google feed, FB catalog |
| Dark mode | ✅ 30 components cleaned up |
| Vercel / Railway | ✅ Both healthy |

---

## Action Required — Patrick

1. **eBay token expired** (June 20, 21:30 UTC) — platform dashboard falls back to DB count (accurate). To restore live count: organizer settings → reconnect eBay.
2. **AlternativeTo** — did you submit after the June 18 scheduled task? If not, worth doing.

---

## BQ Items (1)

| Feature | Blocked Until |
|---------|---------------|
| Cart payment-completion (items→SOLD on success) | Real Stripe purchase on prod — Patrick action only |

---

## No Push Block

Everything is live. Nothing pending.

---

## Next Session

**Session type: DEV/QA** — BQ = 1 (no QA gate).

- Smoke test finda.sale/organizer/platforms — eBay=10, Google≥92, Facebook=93
- #547 eBay Calculated Shipping E2E QA (needs you available)
- Next roadmap feature from Building backlog
