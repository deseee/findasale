# eBay + Stripe Go-Live Prep
*Created S452 — 2026-04-13*

---

## Current State Summary

### eBay
| Feature | Status | Notes |
|---------|--------|-------|
| Browse API (price comps) | ✅ Working | Prod creds in Railway |
| OAuth connect flow | ✅ Working | Fixed S432 |
| CSV Export | ✅ Working | No code changes needed |
| Direct push to eBay (PRO/TEAMS) | 🔴 Blocked | Hardcoded `EBAY_DEFAULT` policy IDs — will fail at publish |
| Phase 3 sold sync | ⏸️ Deferred | Not started |

### Stripe
| Feature | Status | Notes |
|---------|--------|-------|
| Connect Express onboarding | ✅ Working | |
| Online payments (shopper checkout) | ✅ Working | |
| POS Terminal card payments | ✅ Working | Items NOT marking SOLD (see below) |
| Subscriptions (PRO/TEAMS purchase) | ✅ Working | Webhook-driven |
| Refunds | ✅ Working | |
| Payouts (organizer) | ✅ Working | |
| Stripe Connect webhook | 🔴 Not configured | Items don't mark SOLD after POS card payment (P2 deferred since S421) |

---

## Blockers to Resolve Before Going Live

### Blocker 1 — eBay direct push policy IDs (CODE FIX NEEDED)
eBay requires real payment/fulfillment/return policy IDs from the organizer's seller account. The current code uses `EBAY_DEFAULT` as a placeholder, which eBay will reject.

**Fix (dispatched to findasale-dev this session):**
After OAuth connect, fetch the organizer's existing policies from eBay Account API and store them on `EbayConnection`. Use them in every push call.

This also means organizers must have at minimum one of each policy type configured in their eBay seller account before their first push. The post-connect screen should verify this.

### Blocker 2 — Stripe Connect webhook (CONFIG CHANGE — Patrick does this)
See Patrick Actions section below.

---

## Patrick Actions (Dashboard/Config)

### Stripe Dashboard — Required Before Testing POS

**Step 1 — Add Connect webhook endpoint:**
1. Go to Stripe Dashboard → Developers → Webhooks
2. Click **"Add endpoint"**
3. Endpoint URL: `https://backend-production-153c9.up.railway.app/api/webhooks/stripe`
4. Select **"Events on Connected accounts"** (not "Events on your account")
5. Add event: `payment_intent.succeeded`
6. Click **"Add endpoint"**
7. After saving: click the endpoint → **"Reveal signing secret"** → copy it

**Step 2 — Set in Railway:**
1. Go to Railway → FindaSale backend service → Variables
2. Add: `STRIPE_CONNECT_WEBHOOK_SECRET = [the secret you copied]`
3. Railway will redeploy automatically

**That's it — POS card payments will now mark items SOLD after payment.**

---

### Stripe Dashboard — Verify Price IDs
Confirm these are set in Railway backend environment variables:
- `STRIPE_PRO_MONTHLY_PRICE_ID`
- `STRIPE_PRO_ANNUAL_PRICE_ID`
- `STRIPE_TEAMS_MONTHLY_PRICE_ID`
- `STRIPE_TEAMS_ANNUAL_PRICE_ID`

If any are missing, get them from Stripe Dashboard → Products → [PRO or TEAMS plan] → Price ID (format: `price_...`).

---

### eBay Developer Console — Verify Env Vars
Confirm these are set in Railway backend environment variables:
- `EBAY_CLIENT_ID`
- `EBAY_CLIENT_SECRET`
- `EBAY_OAUTH_REDIRECT_URI` (should be `https://backend-production-153c9.up.railway.app/api/ebay/callback`)
- `EBAY_VERIFICATION_TOKEN`
- `EBAY_DELETION_ENDPOINT_URL`

---

## Testing Sequence

### eBay Testing (after policy ID fix ships)

**Test 1 — OAuth connect:**
1. Login as user2 (SIMPLE organizer) → Settings → eBay tab
2. Click "Connect eBay"
3. Verify redirect to eBay sign-in
4. Complete eBay login
5. Verify redirect back to `/organizer/settings?ebay_connected=true`
6. Verify "eBay Connected ✓" shows in settings

**Test 2 — CSV Export (SIMPLE tier):**
1. Navigate to a sale with items
2. Find the eBay export option
3. Select items → download CSV
4. Verify CSV opens in Excel with correct columns and data

**Test 3 — Direct Push (PRO/TEAMS tier — after policy fix):**
1. Login as user1 (TEAMS) → confirm eBay connected
2. Navigate to a sale → select 1-2 items
3. Click "Push to eBay"
4. Verify items appear in eBay seller hub with correct title, price, photos
5. Verify `ebayListingId` stored on item (check Railway logs or DB)

**eBay prereq:** The test organizer's eBay account must have at least one payment policy, one fulfillment policy, and one return policy configured in eBay Seller Hub. These are created under: eBay Seller Hub → Account → Business policies.

---

### Stripe Testing

**Test 1 — Connect onboarding:**
1. Login as a fresh organizer (no `stripeConnectId`)
2. Settings → Payments → "Setup Stripe Connect"
3. Complete Stripe onboarding with test info
4. Return to settings — verify "Stripe Connected ✓"

**Test 2 — Online payment (shopper checkout):**
1. Login as user11 (shopper with Hunt Pass)
2. Find an available item from a Stripe-connected organizer
3. Click Buy → enter Stripe test card `4242 4242 4242 4242`, exp `12/34`, CVC `123`
4. Verify: purchase created, item marked SOLD, XP awarded to shopper, receipt email sent
5. Check organizer dashboard for payment notification

**Test 3 — POS card payment (requires Stripe Connect webhook configured):**
1. Login as user1 (TEAMS, Stripe-connected organizer)
2. Open POS screen
3. Add item(s) to cart — at least one with `AVAILABLE` status
4. Set `STRIPE_TERMINAL_SIMULATED=true` in Railway (or use real reader)
5. Complete payment with simulated reader
6. Verify: item marks SOLD, purchase created, XP awarded

**Note:** `STRIPE_TERMINAL_SIMULATED` — if not set, defaults to production mode (real reader required). For testing, add `STRIPE_TERMINAL_SIMULATED=true` to Railway env. Remove before actual merchant use.

**Test 4 — Subscription purchase:**
1. Login as a SIMPLE organizer
2. Settings → Subscription → Upgrade to PRO
3. Complete Stripe Checkout with test card
4. Verify tier upgrades in DB + nav shows PRO

---

## Post-Launch Monitoring

**Stripe:** Dashboard → Developers → Events — watch for `payment_intent.succeeded` and `customer.subscription.*` events.

**eBay:** Railway logs — watch for push errors, especially `400 BUSINESS_ERROR` which usually means policy IDs are wrong or the organizer hasn't verified their eBay seller account.

**Key Railway log patterns to watch:**
- `eBay push failed for item [id]: 400` → policy ID or tier issue
- `Stripe Connect webhook signature failed` → wrong `STRIPE_CONNECT_WEBHOOK_SECRET`
- `stripeConnectId invalid, clearing` → seeded/fake connect IDs being cleared (expected, not an error)
