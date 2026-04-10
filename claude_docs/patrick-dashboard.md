# Patrick's Dashboard — April 10, 2026 (S432)

## ✅ Done This Session (S432)

- **eBay OAuth "Authentication required" fixed** — Callback route was gated behind FindA.Sale JWT middleware. eBay's redirect doesn't carry a JWT. Removed middleware from the public callback; organizer identity recovered via base64 state parameter. OAuth flow now completes and redirects to settings with success toast.
- **eBay "Failed to start connection" double /api/ fixed** — Axios base URL already includes `/api`, settings.tsx was prepending `/api/` again. All three eBay calls corrected.
- **eBay axios redirect fixed** — Backend was calling `res.redirect(authUrl)` but axios doesn't follow external redirects cleanly. Changed to `res.json({ redirectUrl })` and frontend does `window.location.href`.
- **Stripe Connect status fixed** — Settings Payments tab always showed "Setup Stripe Connect" even for connected organizers. Backend now returns `stripeConnected: true/false` in `/organizers/me`. Settings page shows "Stripe Connected ✓" + "Manage Payouts" button for connected organizers.
- **Auction items showing as fixed price — fixed (3 layers):** (1) `getSale` backend wasn't returning `listingType` in item fields — added. (2) Sale page condition was `sale.isAuctionSale && item.auctionStartPrice` — changed to also check `item.listingType === 'AUCTION'`. (3) Item detail page `isAuction` flag only checked `auctionStartPrice` — now also checks `listingType`.
- **Auction end time field added to add-items form** — When listing type is set to AUCTION, organizers now see Starting Bid, Reserve Price, and Auction End Time fields. End time defaults to 8:00 PM the evening before the sale's start date.

## ⚠️ Push Required

```powershell
git add packages/frontend/pages/organizer/settings.tsx
git add packages/backend/src/routes/organizers.ts
git add packages/frontend/pages/sales/[id].tsx
git add packages/frontend/pages/organizer/add-items/[saleId].tsx
git add packages/backend/src/controllers/saleController.ts
git add packages/backend/src/controllers/itemController.ts
git add packages/frontend/pages/items/[id].tsx
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "S432: eBay OAuth fixes, Stripe Connect status, auction listing type display fixes"
.\push.ps1
```

## 🟡 Next Session — Auction overhaul + eBay categories in UI

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
