# Patrick's Dashboard — Week of May 31, 2026

---

## What Happened This Session (S812 — QA + P0 Fix)

**The short version: the shopper dashboard was broken for every logged-in shopper, I found the cause and fixed it. Also verified all the outstanding QA items from recent sessions.**

### The P0 crash (shopper dashboard)

After the S810 widget-rendering work, every shopper account was hitting "Something went wrong" on `/shopper/dashboard`. Took some deep debugging to find it — production React suppresses error details — but I extracted the actual error message directly from the React component tree:

> `Cannot read properties of null (reading 'emailNewSalesFromFollowed')`

Two bugs, both introduced by S810:

1. **React hook ordering violation:** Six data-fetch hooks were being called *after* a "not logged in → redirect" guard. React 18 is strict about this — the server renders the page one way (no hooks called) and the client renders it another way (hooks called), and it crashes at hydration. Fix: moved all hooks above the redirect guard.

2. **Null vs. undefined:** The Notification Preferences widget received `null` from the API (instead of `undefined`). JavaScript default parameters (`= {}`) only kick in for `undefined` — so `null` passed straight through, and `null.emailNewSalesFromFollowed` threw. Fix: added `?? {}` as an explicit null coalesce.

Both fixes shipped and verified. Dashboard loads correctly for Leo Thomas and all other test accounts.

### QA results

Everything from the S811 backlog cleared:

- ✅ **Map pins (H-002):** The Leaflet CSS fix is working — the map pane now positions itself correctly. The reason no pins appear near Grand Rapids is data, not code: the top-200 sales from the API are all scraped national data (Texas, North Carolina, Arkansas). When an organizer publishes a real sale, its pin will appear correctly.
- ✅ **S811 polish:** Category emojis (💰, 📢), sale breadcrumb contrast in dark mode, branded placeholder on photoless sale cards — all confirmed live.
- ✅ **4 new shopper widgets:** Streak tracker, rank benefits card, notification preferences, and pickup appointments — all rendering correctly in dark mode.
- ✅ **markSold RECORD mode:** Organizer selects a hold → chooses "Record cash sale" → item immediately flips to SOLD in the database.
- ✅ **markSold POS_CART mode:** Hold moves into the POS cart (status: HOLD_IN_CART) — item stays AVAILABLE until the organizer processes payment through the POS screen.
- ⚠️ **markSold CHECKOUT_LINK:** The code path fires correctly, but the Stripe test environment doesn't recognize Bob's production Stripe account. This will work with a real Stripe test account connected.

---

## Pending: Your Actions

1. **Update your private global Claude settings** — the Railway database password stored there is still the old one. Update the `Railway DATABASE_URL (public proxy)` line manually (get the current password from Railway dashboard → findasale-db → Variables).

2. **Create a GitGuardian API token** — go to dashboard.gitguardian.com → API → Personal access tokens, create one with `incidents:read` scope. The daily health check is waiting for it.

3. **#239 legal sign-off** — the multi-consignor settlement is built and waiting. Once your attorney + CPA answer the merchant-of-record / 1099 questions, we can turn on live transfers and do the final QA.

4. **Google Merchant Center** — check if the ~52 products from the shopping feed have been approved (the 3-day review window should be up soon if not already).

---

## System Health

- **Blocked queue: 2 active items** (well below the 8-item ceiling — feature work is cleared to resume)
- **Build status:** ✅ Vercel green, Railway healthy
- **Dashboard:** ✅ Shopper dashboard P0 resolved
- **Sentry:** 4 unresolved issues (all slow DB query warnings from recent crons — non-critical)

---

## What's Next

Next session the focus is:
- Verify the streak widget also shows up on the `/shopper/loyalty` page (we only checked the dashboard)
- QA the consignor settlement flow once legal clears
- Continue QA carryover: Sneak Peek Email, Local Legends badge, Scan & Split (all need specific conditions to trigger)
- Feature work: blocked queue is low enough to pick up new roadmap items
