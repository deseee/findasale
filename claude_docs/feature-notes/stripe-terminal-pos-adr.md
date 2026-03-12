# ADR — Stripe Terminal POS — 2026-03-12

## Decision

Build a Stripe Terminal POS screen for organizers at `/organizer/pos`. Organizers tap through items in an active sale, present a card reader to the buyer, and the payment is captured via Stripe Terminal. Integrates with the existing Stripe Connect Express payment rails. Same 10% platform fee applies.

## Rationale

Estate sales are hybrid events — many buyers prefer to pay in person with a card. Stripe Terminal eliminates the need for a separate card reader service, has no monthly fees, and plugs directly into the existing Stripe Connect Express account each organizer already uses. This means organizer payouts, fee collection, and webhook handling all work identically to online sales.

---

## Architecture

### Reader Hardware Decision

**Selected: BBPOS WisePOS E (~$249) or Stripe Reader S700 (~$349) — WiFi/LAN connection.**

Rejected M2 (Bluetooth, ~$60): Web Bluetooth API is not supported in iOS Safari or PWA WebViews. Since organizers use iPhones, Bluetooth readers are incompatible with the PWA. WisePOS E/S700 connect over local network (WiFi) and work on all browsers including iOS Safari.

### SDK

`@stripe/terminal-js` — official browser SDK. Uses `internet` discovery mode for WisePOS E/S700. Uses `simulated` discovery mode for dev/test (no hardware needed).

### Payment Flow

```
1. Organizer opens /organizer/pos → selects active sale
2. Searches item by title or SKU → adds to transaction
3. Taps "Charge $X" → calls POST /api/stripe/terminal/connection-token
4. SDK discovers reader (internet mode) → presentPaymentMethod called on reader
5. Buyer taps/inserts card on WisePOS E reader
6. SDK processes → calls POST /api/stripe/terminal/capture
7. Backend captures the PI → marks Purchase PAID + Item SOLD
8. Webhook fires payment_intent.succeeded (same existing handler)
```

### Schema Changes

Three additive changes to `Purchase`:

```prisma
model Purchase {
  // ... existing fields ...
  userId        String?        // was String — nullable for anonymous POS walk-ins
  user          User?          @relation(fields: [userId], references: [id])
  source        String         @default("ONLINE") // "ONLINE" | "POS"
  buyerEmail    String?        // Optional: POS buyer email for receipt delivery
}
```

**Why nullable userId:** POS buyers are walk-in customers with no FindA.Sale account. The organizer acts as the terminal operator. The `userId` FK becomes nullable so anonymous purchases can be recorded without forcing account creation.

**Migration file name:** `20260312000002_add_purchase_pos_fields`

**Migration SQL:**
```sql
-- Safe additive migration: no data loss
ALTER TABLE "Purchase" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "Purchase" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'ONLINE';
ALTER TABLE "Purchase" ADD COLUMN "buyerEmail" TEXT;
```

### v1 Scope: One Item Per Transaction

POS v1 processes one item per transaction. Multi-item cart (single PaymentIntent for N items) requires a new `POSTransaction` model to handle the 1:many Purchase relationship — deferred to v2. Estate sale organizers typically ring up items individually, so this matches the real-world workflow.

### New Backend Endpoints

All under `/api/stripe/terminal/`, all require `authenticate` middleware + organizer role check.

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/terminal/connection-token` | Create Stripe Terminal connection token for reader discovery |
| POST | `/terminal/payment-intent` | Create PaymentIntent for terminal capture |
| POST | `/terminal/capture` | Capture a terminal PaymentIntent after card presented |
| POST | `/terminal/cancel` | Cancel an in-progress terminal PaymentIntent |

**connection-token request/response:**
```
POST /api/stripe/terminal/connection-token
Auth: Organizer JWT
Body: {}
Response: { secret: string }  // Stripe connection token secret
```

**payment-intent request/response:**
```
POST /api/stripe/terminal/payment-intent
Auth: Organizer JWT
Body: { itemId: string, buyerEmail?: string }
Response: {
  paymentIntentId: string,
  clientSecret: string,
  amount: number,       // cents
  platformFee: number   // cents
}
```

**capture request/response:**
```
POST /api/stripe/terminal/capture
Auth: Organizer JWT
Body: { paymentIntentId: string }
Response: {
  purchaseId: string,
  status: 'PAID',
  receiptSent: boolean
}
```

**cancel request/response:**
```
POST /api/stripe/terminal/cancel
Auth: Organizer JWT
Body: { paymentIntentId: string }
Response: { status: 'CANCELLED' }
```

### Fee Handling

Same as online purchases:
- `application_fee_amount` = item price × 10% (from FeeStructure table)
- `on_behalf_of` = organizer's `stripeConnectId`
- `transfer_data.destination` = organizer's `stripeConnectId`
- Referral discount applies if `referralDiscountExpiry > now`

Terminal-specific Stripe PaymentIntent params:
```typescript
{
  amount: priceCents,
  currency: 'usd',
  payment_method_types: ['card_present'],  // Terminal-specific
  capture_method: 'manual',               // Terminal requires manual capture
  application_fee_amount: platformFeeAmount,
  on_behalf_of: organizer.stripeConnectId,
  transfer_data: { destination: organizer.stripeConnectId },
  metadata: { itemId, saleId, source: 'POS', ...(buyerEmail ? { buyerEmail } : {}) }
}
```

**Note:** Terminal uses `capture_method: 'manual'` — the PI is authorized on card swipe, then explicitly captured via the backend `/terminal/capture` endpoint. This is different from online PIs which use `capture_method: 'automatic'`.

### Webhook Handler

The existing `payment_intent.succeeded` handler will fire for Terminal payments. It already handles:
- Purchase status → PAID
- Item status → SOLD
- Loyalty coupon issuance
- Points award
- Receipt email

One addition needed in the webhook handler: skip receipt email if `metadata.source === 'POS'` and `metadata.buyerEmail` is missing (buyer didn't provide email). If `buyerEmail` is in metadata, send receipt to that address.

### New Frontend Page: `/organizer/pos`

Route: `pages/organizer/pos.tsx`

UI Components:
1. **Sale selector** — dropdown of active sales (calls `GET /api/sales/mine`)
2. **Item search** — text input that calls `GET /api/items?saleId=X&q=...&status=AVAILABLE`
3. **Item card** — shows title, price, photo thumbnail; "Add" button
4. **Current transaction** — shows selected item + price + platform fee note
5. **Charge button** — triggers Terminal SDK flow
6. **Reader status indicator** — "Reader connected" / "Searching..." / "Not connected"
7. **Optional buyer email input** — "Email receipt to buyer?" (optional field)

### New npm Package Required

`@stripe/terminal-js` — add to frontend package.

```powershell
pnpm --filter frontend add @stripe/terminal-js
```

### Controller File: `terminalController.ts`

New file: `packages/backend/src/controllers/terminalController.ts`

Exports: `createConnectionToken`, `createTerminalPaymentIntent`, `captureTerminalPaymentIntent`, `cancelTerminalPaymentIntent`

---

## Rollback: `20260312000002_add_purchase_pos_fields`

**Down migration:**
```sql
ALTER TABLE "Purchase" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Purchase" DROP COLUMN IF EXISTS "source";
ALTER TABLE "Purchase" DROP COLUMN IF EXISTS "buyerEmail";
```

**Playbook:** "If deploy vX fails at migration step, run the down migration above against Neon (read credentials from packages/backend/.env), then roll back the Railway deploy to the previous image."

**Risk:** Low. All three changes are purely additive/permissive. Making `userId` nullable cannot break existing ONLINE purchases (they all have userIds already). The `source` column defaults to 'ONLINE' so all existing rows remain valid.

---

## Consequences

- Stripe Terminal requires a live Stripe account for hardware registration. Patrick can open the account while dev proceeds (simulated reader works without a live account).
- WisePOS E must be connected to the same WiFi network as the organizer's phone/tablet.
- iOS PWA should work for the entire flow since WisePOS E uses `internet` discovery (HTTP, not Bluetooth).
- Multi-item carts deferred to v2 (requires POSTransaction model).
- No new auth patterns — organizer JWT + stripeConnectId check, identical to existing payment endpoints.

## Constraints Added

- `payment_method_types: ['card_present']` is Terminal-only and must not be used in online payment intents.
- Terminal PaymentIntents must use `capture_method: 'manual'` — explicit capture required.
- WisePOS E/S700 readers only (no M2 Bluetooth). Document this in README/onboarding.
