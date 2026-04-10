# Patrick's Dashboard — April 9, 2026 (S431)

## ✅ Done This Session (S431)

- **Treasure Trails on the map** — Trail stops now only appear when you explicitly tap "View Treasure Trail →" on a sale popup (not cluttering the default map). Dismissal bar shows trail name + "View Details" link + ✕ to close. Amber circle markers appear for each stop.
- **"Failed to load trail" toast fixed** — Double `/api/api/` prefix bug in the map component. Trail now loads correctly when you tap the button.
- **"Trail Not Found" on detail page fixed** — Backend was looking up trails by ID only; frontend passes shareToken. Added shareToken fallback. Trail detail page (`/trail/[shareToken]`) should now load.
- **`usePublicTrail` hook fixed** — Was calling a nonexistent route `/trails/public/...`. Now uses the correct `/trails/:shareToken` endpoint.
- **XP purchase rate bug fixed (P0)** — Purchases were awarding flat 1 XP regardless of amount. A $617 POS session was giving 1 XP. Fixed: now computes `Math.floor(dollars × 1)` so $20 = 20 XP, $617 = 617 XP. Applies to both POS and regular purchases. Historical XP is undercounted but not worth retroactive correction.

## ✅ No Action Required — Already Pushed

All S431 fixes are live on GitHub (push `0acdeaad`). Railway and Vercel auto-deploying.

## 🟡 Next Session — Hunt Pass sink rows

`packages/frontend/pages/shopper/hunt-pass.tsx` still needs 3 missing XP sink rows (Custom Map Pin 75 XP, Profile Showcase Slot 50/150 XP, Treasure Trail Sponsor 100 XP). Dispatch findasale-dev to add them, then push.

---

## Pending QA (next week)

| Feature | What to Test |
|---|---|
| Trail activation | Map → sale popup → "View Treasure Trail →" → amber circle markers appear |
| Trail dismissal | ✕ button → markers disappear |
| Trail detail page | `/trail/[shareToken]` loads (not "Trail Not Found") |
| XP on purchase | Complete a purchase → check that XP = purchase amount in dollars |
| Email spam | Send payment link email to Yahoo → confirm inbox not spam |
| QR code on sale page | Navigate to any sale → QR renders (not broken image) |
| iOS map geolocation | Test on iOS Safari — correct error message if denied |
| Sale page activity | Only 2 live elements: viewer pill + LiveFeedTicker card |
| Auction Buy Now | Auction sale → no Buy Now button on items |
| Print label | Edit item → Print Label → PDF opens, 1 page, centred layout |
| Photo upload (organizer) | Sale page → Add Photos → renders in gallery, capped at 6 |
| Send to Phone end-to-end | Organizer sends → shopper pays → redirect to receipts (no stuck "Processing") |
| POS invoice flow | Load hold + misc items → Send Invoice → shopper pays via link |
