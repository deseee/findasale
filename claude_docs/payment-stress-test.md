# Payment Flow Stress Test — CA3
**Date:** 2026-03-05 | **Tier:** 2 — Load for payment/Stripe sessions

---

## Fee Logic (Locked for Beta)

| Sale type | Platform fee | Applied as |
|-----------|-------------|------------|
| Fixed-price item | 5% of `price` | `application_fee_amount` on PaymentIntent |
| Auction item | 7% of winning bid | `application_fee_amount` on PaymentIntent |
| Shipping add-on | No fee on shipping portion | Shipping added to `amount` but not fee base |

Fee calculation: `Math.round(priceCents * feePercent)` — rounded to nearest cent, no floating-point drift.

Transfer target: `organizer.stripeAccountId` via `transfer_data.destination`.

---

## Critical Paths — Test Coverage Required

### Path 1: Organizer Onboarding (Stripe Connect)

| Step | Endpoint | Expected | Edge cases |
|------|----------|----------|------------|
| Create Connect account | POST `/api/stripe/create-connect-account` | Returns `accountLink.url` for Express onboarding | Organizer already has account → 400 |
| Complete onboarding | Stripe-hosted flow | Stripe redirects to `/organizer/dashboard` | Abandons halfway — account in pending state |
| Check status | GET `/api/stripe/account-status` | `{ payoutsEnabled, chargesEnabled, detailsSubmitted }` | Incomplete account → charges disabled |

**⚡ Manual test:** Create a test organizer, hit the Connect flow, use Stripe test identity docs. Verify `stripeAccountId` stored in DB on `Organizer` record.

---

### Path 2: Fixed-Price Checkout (5% fee)

| Step | Action | Expected |
|------|--------|----------|
| Buyer selects item | Frontend `CheckoutModal` | Item status check: must be `ACTIVE` |
| Create PaymentIntent | POST `/api/stripe/create-payment-intent` | Returns `clientSecret`, `purchaseId`, `amount` |
| Confirm payment | Stripe.js `stripe.confirmPayment()` | 3DS challenge if required |
| Webhook: `payment_intent.succeeded` | Stripe → `/api/stripe/webhook` | Item status → `SOLD`, Purchase status → `PAID`, organizer payout queued |
| Buyer confirmation | Frontend redirect to `/purchases/[id]` | Purchase record with receipt |

**Fee check:** Item at $100 → PaymentIntent `amount: 10000`, `application_fee_amount: 500` ($5.00). Verify in Stripe dashboard.

**⚡ Manual test:** Use Stripe test card `4242 4242 4242 4242`, exp `12/29`, CVC `123`.

---

### Path 3: Auction Checkout (7% fee)

Same as Path 2 but `isAuctionItem: true` detected via `item.auctionStartPrice != null`.

**Fee check:** Winning bid $150 → `amount: 15000`, `application_fee_amount: 1050` ($10.50).

**Edge case:** Auction ends, winner takes 24h to pay → `auctionEndTime` passed, item stays `ACTIVE` until PaymentIntent confirms.

---

### Path 4: Shipping Add-On

| Scenario | Expected |
|----------|----------|
| `shippingRequested: true` + `item.shippingAvailable: true` | `amount` = price + shippingPrice, fee only on item price |
| `shippingRequested: true` + `item.shippingAvailable: false` | 400 error — shipping not available |
| `shippingRequested: true` + `item.shippingPrice: null` | 400 error — no shipping price set |

**Fee check:** Item $50, shipping $12 → `amount: 6200`, `application_fee_amount: 250` (5% of $50 only, not shipping).

---

### Path 5: Refund Flow

| Step | Endpoint | Expected |
|------|----------|----------|
| Organizer requests refund | POST `/api/stripe/refund/:purchaseId` | Stripe `refunds.create` called, Purchase status → `REFUNDED` |
| Wrong organizer tries refund | Same endpoint | 403 — "You can only refund purchases from your own sales" |
| Non-PAID purchase | Same endpoint | 400 — "Only paid purchases can be refunded" |
| Double refund | Same endpoint | Stripe rejects duplicate refund → 500 |

**Note:** No partial refunds in current implementation — full amount only.

---

### Path 6: Webhook Failure Recovery

| Scenario | Risk | Mitigation |
|----------|------|------------|
| Webhook arrives before DB write completes | Race condition → item stays `ACTIVE` after payment | PaymentIntent metadata includes `purchaseId` — webhook can always find and update the record |
| Stripe retries webhook 3×, all fail | Organizer not paid, item still active | Monitor Stripe webhook logs; manual DB fix via admin |
| `STRIPE_WEBHOOK_SECRET` not set | Webhook validation skipped | Current code logs error + returns 400 — ⚡ verify Railway env has this set |
| Duplicate webhook delivery | `payment_intent.succeeded` fired twice | Purchase update is idempotent — `status: 'PAID'` on already-PAID record is a no-op |

**⚡ Test:** Use Stripe CLI: `stripe listen --forward-to localhost:5000/api/stripe/webhook` → trigger `stripe trigger payment_intent.succeeded`

---

### Path 7: 3DS / Authentication Required

| Test card | Expected |
|-----------|----------|
| `4000002500003155` | 3DS required — confirm flow triggers challenge |
| `4000008400001629` | 3DS2 — succeeds after auth |
| `4000000000009995` | Always declines — `payment_failed` webhook fires |

**Verify:** After decline, `Purchase.status → FAILED`, item remains `ACTIVE` so another buyer can purchase.

---

### Path 8: Concurrent Purchase Race

Two buyers try to purchase the same item simultaneously.

| Step | Expected |
|------|----------|
| Buyer A creates PaymentIntent | Success — item still `ACTIVE` |
| Buyer B creates PaymentIntent before A confirms | Also succeeds (PaymentIntent creation doesn't lock item) |
| Buyer A webhook fires first | Item → `SOLD`, Buyer A `Purchase → PAID` |
| Buyer B webhook fires second | ⚠️ Item already `SOLD` — currently no guard in webhook handler |

**⚡ Gap found:** The webhook `payment_intent.succeeded` handler should check if item is already `SOLD` before updating. If already sold, issue automatic refund to Buyer B via `stripe.refunds.create`. This is a CA3 follow-up fix.

---

### Path 9: $0 / Edge Case Prices

| Scenario | Expected behavior |
|----------|------------------|
| Item price = $0 | PaymentIntent `amount: 0` → Stripe rejects (min $0.50) — needs frontend guard |
| Item price = $0.01 | Fee = 0 cents (rounds down) — technically valid, Stripe allows |
| Item price = $999,999 | No explicit cap — Stripe allows up to $999,999.99 |
| Missing `stripeAccountId` on organizer | `transfer_data.destination` undefined → Stripe 400 |

**⚡ Frontend guard needed:** Disable checkout button if `item.price < 0.50`. Add backend validation too.

---

### Path 10: Payout Management

| Endpoint | Expected |
|----------|----------|
| GET `/api/stripe/balance` | Returns available + pending balance from Stripe Connect account |
| GET `/api/stripe/payout-schedule` | Returns `interval` (daily/weekly/manual) |
| PATCH `/api/stripe/payout-schedule` | Updates payout interval |
| POST `/api/stripe/payout` | Triggers instant payout (requires Stripe Instant Payouts enabled) |

**⚡ Note:** Instant payouts require a debit card on the Connect account AND Stripe's instant payout feature — not available in all regions. Verify this works with a real test organizer account.

---

## Pre-Beta Stripe Checklist

- [ ] `STRIPE_SECRET_KEY` in Railway is the **live** key (starts with `sk_live_`)
- [ ] `STRIPE_PUBLISHABLE_KEY` in Vercel is the **live** key (starts with `pk_live_`)
- [ ] `STRIPE_WEBHOOK_SECRET` in Railway matches the webhook endpoint signing secret
- [ ] Webhook endpoint registered in Stripe Dashboard → finda.sale backend URL
- [ ] Webhook events subscribed: `payment_intent.succeeded`, `payment_intent.payment_failed`
- [ ] Stripe Connect platform settings: platform name "FindA.Sale", support email set
- [ ] Test a full round-trip: Connect onboarding → item purchase → payout → refund
- [ ] Fix concurrent purchase race (CA3 follow-up — issue automatic refund to second buyer)
- [ ] Add `price >= 0.50` guard to frontend CheckoutModal and backend `createPaymentIntent`

---

## CA3 Follow-Up Code Fix — Concurrent Purchase Guard

File: `packages/backend/src/controllers/stripeController.ts` — `payment_intent.succeeded` handler

Add this check after fetching the purchase record:
```typescript
// Guard: if item already SOLD by a concurrent purchase, refund this PI
if (item.status === 'SOLD' && purchase.status !== 'PAID') {
  await stripe.refunds.create({ payment_intent: paymentIntent.id });
  await prisma.purchase.update({ where: { id: purchase.id }, data: { status: 'REFUNDED' } });
  break;
}
```

This fix is pending implementation — tracked as CA3 follow-up.
