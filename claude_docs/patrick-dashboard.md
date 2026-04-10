# Patrick's Dashboard — April 9, 2026 (S430)

## ✅ Done This Session (S430)

- **Email spam fixed** — 3 triggers removed: `findasale.com` sender (unverified) unified to `finda.sale`, literal `[UNSUBSCRIBE_URL]` placeholder replaced, "Payment link:" subject line replaced with "Your checkout is ready —"
- **QR code on sale page fixed** — `api.qrserver.com` wasn't in `next.config.js` image domains; QR was silently broken
- **iOS geolocation improved** — Permissions API query-first on homepage, two-phase accuracy + iOS-specific error messages on map
- **Sale page activity deduplication** — was 4 activity widgets; now 2 (HypeMeter pill inline above LiveFeedTicker). ActivityFeed, SocialProofBadge, standalone HypeMeter card all removed
- **Organized By card removed** — "Plan My Route in Maps" button moved into Location card where it belongs
- **Auction Buy Now gate hardened** — `Buy Now` now also gated on `!item.auctionStartPrice` (double guard)
- **PickupBookingCard moved to receipt page** — removed from sale page; now shows on checkout-success with GPS haversine gate (hidden if buyer is within 300m of sale)
- **Organizer photo upload on sale page** — "+ Add Photos" button in gallery (max 6), × remove button on thumbnail hover, file size validation, Cloudinary upload
- **Print label auth fixed** — was `window.open(url)` (no auth token) → now `api.get(blob)` + blob URL. No more "Authentication required"
- **Label redesign** — two-column layout, QR 72×72 vertically centred right column, content block centred in label, no more blank second page

## 🔴 Action Required — Push S430

```powershell
git add packages/backend/src/controllers/buyingPoolController.ts
git add packages/backend/src/controllers/posController.ts
git add packages/backend/src/controllers/userController.ts
git add packages/backend/src/controllers/labelController.ts
git add packages/backend/src/services/collectorPassportService.ts
git add packages/backend/src/services/emailTemplateService.ts
git add packages/frontend/components/PickupBookingCard.tsx
git add packages/frontend/next.config.js
git add packages/frontend/pages/index.tsx
git add packages/frontend/pages/map.tsx
git add packages/frontend/pages/sales/[id].tsx
git add packages/frontend/pages/shopper/checkout-success.tsx
git add packages/frontend/pages/organizer/edit-item/[id].tsx
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "S430: email spam fixes, iOS geo UX, sale page layout, organizer photo upload, label redesign, print label auth, activity dedup"
.\push.ps1
```

## 🔴 Still Needed — Stripe Connect Onboarding

Settings → Payments → Setup Stripe Connect. Fake `acct_test_user3` was cleared in S429 — real Stripe Express onboarding link should now appear.

## 🟡 Next Session — Treasure Trails on the Map

Open the `/map` page and look for Treasure Trails. Are they visible? Are there any seeded trails in the DB? Session will start by checking the schema and map endpoint, then seeding 1-2 test trails if needed.

---

## Pending QA

| Feature | What to Test |
|---|---|
| Email spam | Send payment link email to Yahoo → confirm inbox not spam |
| QR code on sale page | Navigate to any sale → QR renders (not broken image) |
| iOS map geolocation | Test on iOS Safari — correct error message if denied |
| Sale page activity | Only 2 live elements: viewer pill + LiveFeedTicker card |
| Auction Buy Now | Auction sale → no Buy Now button on items |
| Receipt pickup scheduling | Buy an item, check receipt → pickup card hidden if at sale |
| Print label | Edit item → Print Label → PDF opens, 1 page, centred layout |
| Photo upload (organizer) | Sale page → Add Photos → renders in gallery, capped at 6 |
| Stripe QR AccessDenied | Generate QR → shopper scans → no AccessDenied (retest after S430 push) |
