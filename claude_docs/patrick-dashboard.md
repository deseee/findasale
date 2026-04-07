# Patrick's Dashboard — April 7, 2026

---

## What Happened This Session (S406)

Bug fix session focused on the review & publish page, health score, and eBay integration.

**What shipped:**
- **Review page condition dropdown** — was showing New/Like New/Good/Fair/Poor (old values). Now shows New/Used/Refurbished/Parts or Repair across all pages. AI prompts, upload controllers, and display maps all updated to match.
- **Legacy condition handling** — items created before the fix (with old condition values in DB) now map correctly when loaded: LIKE_NEW→New, GOOD→Used, POOR→Parts or Repair.
- **Dynamic category in review page** — AI-suggested categories not in the curated list (e.g. "Linens") now appear in the dropdown instead of showing "Select category..." while health score shows ✓.
- **Health score category bug** — the backend was never passing the `category` field to the health score calculator, so it always showed as missing even when selected. Fixed.
- **Health score gate** — score now caps at 69 (nudge grade) when category or condition grade is missing, so the Improvements panel actually fires and tells organizers what's needed.
- **ValuationWidget** — was using raw `axios` (no auth token) causing 401 errors. Fixed to use the authenticated `api` helper. Dark mode white card fixed (was using `sage-*` Tailwind colors that don't exist).
- **eBay switched to production** — URLs updated from sandbox to `api.ebay.com`. Production credentials are in Railway.
- **eBay deletion endpoint** — new `GET/POST /api/ebay/account-deletion` endpoint added, required by eBay for production keyset activation.

---

## ⚠️ Action Required — eBay Keyset Activation

The production credentials and deletion endpoint are live. One manual step left:

1. Go to [developer.ebay.com](https://developer.ebay.com) → Develop → Alerts & Notifications
2. Confirm endpoint: `https://backend-production-153c9.up.railway.app/api/ebay/account-deletion`
3. Confirm token: `findasale-ebay-verify-2026-primary`
4. Click **Save** — the endpoint will pass validation and the production keyset will be enabled
5. eBay Market Comps will start showing real sold listings

---

## Action Items for Patrick

- [ ] **Complete eBay keyset activation** (see above — 2 min)
- [ ] **Run S405 migration** (POSPaymentRequest table) if not done
- [ ] **Create Google Places API key** — console.cloud.google.com → Maps Platform → Enable Places API → Create key → Add to Railway as `GOOGLE_PLACES_API_KEY`
- [ ] **Run S399 migration** if not done — FeedbackSuppression table
- [ ] **Run S404 migration** if not done — `20260406_add_treasure_trails`
- [ ] **Set Railway env var:** `MAILERLITE_SHOPPERS_GROUP_ID=182012431062533831`
- [ ] **Stripe seat product** — $20/mo team member seat needs a Stripe product created

---

## What Happened Last Session (S405)

Bug fix session that ended up fighting Vercel build failures most of the time. Eight fixes shipped plus the POS in-app payment request feature.

**What shipped:**
- **TrailCheckIn TS error on Railway** — `photoId` field was removed from schema in S404 but the controller still referenced it. Removed.
- **Support page chat gate broken for admin/TEAMS** — The page was calling the wrong API (`fetch('/api/users/me')` → Next.js 404 instead of the backend). Also was reading `roleSubscriptions` which isn't in the response. Fixed to use `api.get()` and check `organizer.subscriptionTier`. Removed the dead "Teams Community Forum" block (no forum exists).
- **TreasureHunt race condition crash** — Concurrent requests on the same date were both trying to `create` the same daily hunt record → P2002 unique constraint error. Fixed with `upsert`.
- **GET /reservations/my-holds-full missing** — Frontend was getting 404s. Endpoint added and registered.
- **POS shopper QR scan** — Organizer can now scan a shopper's QR code in POS to load their account. QR format is `findasale://user/{userId}`. Toast shows on scan, linked shopper banner now persists even when cart is empty. Dark mode colors fixed on the banner.
- **Shopper QR code on dashboard** — Shoppers now have a "My QR Code" section on their dashboard that organizers can scan at the POS.
- **POS in-app payment request** — When a shopper's account is loaded in POS, the organizer can send them a payment notification through the app. Shopper gets a real-time push (Socket.io) with a countdown timer, accept/decline, and a Stripe payment form. New `POSPaymentRequest` model + migration. Full backend (4 endpoints) + frontend (hook, form component, dedicated page at `/shopper/pay-request/[requestId]`).
- **Vercel build fixed (two separate issues):**
  - `server-sitemap.xml.tsx` catch block still had `ctx` argument (removed in next-sitemap v4)
  - `usePOSPaymentRequest.ts` was importing from `./useSocket` which doesn't exist — replaced with direct `socket.io-client` pattern

---

## Run This Now — S405 Migration

The POS payment request feature needs a new database table before it will work:

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

---

## Action Items for Patrick

- [ ] **Run S405 migration above** (POSPaymentRequest table)
- [ ] **Verify Vercel is green** — last push was the sitemap fix; confirm the deployment succeeded
- [ ] **Create Google Places API key** — console.cloud.google.com → Maps Platform → Enable Places API → Create key → Set $200/mo billing cap → Add to Railway env as `GOOGLE_PLACES_API_KEY` (Treasure Trails work without it, but "Search Nearby" stops won't find places)
- [ ] **Run S399 migration** if not already done — FeedbackSuppression table (required for feedback surveys)
- [ ] **Run S404 migration** if not already done — `20260406_add_treasure_trails`
- [ ] **Encyclopedia rename decision** — "Resale Encyclopedia," "Secondhand Encyclopedia," or keep "Estate Sale Encyclopedia" for SEO?
- [ ] **Trademark call** — File for FindA.Sale? ~$250–$400 per class.
- [ ] **Set Railway env var:** `MAILERLITE_SHOPPERS_GROUP_ID=182012431062533831`
- [ ] **Stripe seat product** — $20/mo team member seat needs a Stripe product created
- [ ] **eBay production credentials** — When ready for real eBay data, get production creds from developer.ebay.com and swap Railway env vars + two API URLs back to `api.ebay.com`

---

## ⚠️ Brand Drift Alert — 2026-04-07

**Weekly brand scanner ran.** ~20 active D-001 violations remain. 2 items fixed since 3/31.

**Highest urgency (P0 — 3rd week unresolved):** `components/SharePromoteModal.tsx` and `pages/sales/[id].tsx` hardcode "estate sale" in all social share templates. Every garage sale and auction organizer sharing their event on Threads, TikTok, and Nextdoor gets "Running an estate sale this weekend." Embarrassing and factually wrong.

**Newly detected:** Homepage `<meta>`, OG, Twitter, and Schema.org tags all omit flea markets and consignment. The hero text is compliant; the meta tags were missed. Affects SEO and social link previews.

**Full findings:** `claude_docs/audits/brand-drift-2026-04-07.md`

**Recommended:** One `findasale-dev` dispatch for Batch 1 (SharePromoteModal) + Batch 2 (index.tsx meta) clears the highest-priority items in a single pass. ~16 single-line copy changes total for all remaining batches.

---

## Next Session (S406) — Chrome QA Sweep (finally)

S405 was supposed to be all QA but the build was broken. S406 opens with:
1. Vercel smoke test — confirm the build is actually green
2. Chrome QA sweep across S396–S405 — POS full walkthrough (4 payment modes + shopper QR + payment request), Treasure Trails discovery + check-in, dashboard, review card, camera flow, support chat gate

*Updated S405 — 2026-04-07*
