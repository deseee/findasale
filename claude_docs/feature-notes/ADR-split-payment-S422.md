# ADR: Split Payment Architecture — POS System

**Session:** S422  
**Status:** ARCHITECTURE DECISION  
**Approval:** Architect (pending Patrick feedback)

---

## Executive Summary

Split payment allows a POS organizer to accept a transaction split between two payment methods — typically cash + card. Example: $88.30 total = $50.00 cash + $38.30 card.

**Decision:** Add `cashAmountCents` + `cardAmountCents` fields to existing `POSPaymentRequest` model (Option A). This preserves the audit trail, simplifies implementation, and correctly applies the 10% platform fee to only the card portion.

**Key invariant:** `cashAmountCents + cardAmountCents = totalAmountCents`  
**Platform fee:** Applies to `cardAmountCents` only, never to cash.

---

## Schema Changes (Option A Selected)

### Modification: POSPaymentRequest Model

Add two optional fields to track split amounts:

```prisma
model POSPaymentRequest {
  id                    String   @id @default(cuid())
  organizerId           String
  organizerUserId       String
  shopperUserId         String
  saleId                String
  itemIds               String[]
  totalAmountCents      Int       // Always the full cart total
  
  // Split payment fields (NEW)
  isSplitPayment        Boolean   @default(false)  // Flag: is this a split?
  cashAmountCents       Int?      // Cash portion (null if not split)
  cardAmountCents       Int?      // Card portion (null if not split)
  
  // Stripe PI always charged for the card portion only
  platformFeeCents      Int       // 10% of cardAmountCents (or totalAmountCents if not split)
  stripeFeeEstimate     Int?
  stripePaymentIntentId String?   @unique
  clientSecret          String?   @db.VarChar(255)
  
  status                String    @default("PENDING") // PENDING | ACCEPTED | PAID | DECLINED | EXPIRED | CANCELLED
  expiresAt             DateTime
  requestedAt           DateTime  @default(now())
  acceptedAt            DateTime?
  paidAt                DateTime?
  declineReason         String?
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  organizer User        @relation("OrganizerPaymentRequests", fields: [organizerUserId], references: [id], onDelete: Cascade)
  shopper   User        @relation("ShopperPaymentRequests", fields: [shopperUserId], references: [id], onDelete: Cascade)
  sale      Sale        @relation(fields: [saleId], references: [id], onDelete: Cascade)

  @@index([organizerId, saleId])
  @@index([organizerUserId, saleId])
  @@index([shopperUserId, status])
  @@index([status, expiresAt])
  @@index([stripePaymentIntentId])
}
```

### Why Option A

| Aspect | Option A | Option B | Option C |
|--------|----------|----------|----------|
| **Audit trail** | ✅ Full history | ✅ Full history | ❌ LocalStorage only |
| **Fee correctness** | ✅ Easy to track which fees apply | ✅ Same | ❌ Manual tracking |
| **DB simplicity** | ✅ One table | ❌ Parent + child models | ✅ None |
| **Rollback** | ✅ Easy | ❌ Requires cleanup | ⚠️ Session-dependent |
| **Stripe PI cost** | ✅ One PI (card amount) | ❌ One PI (might differ) | ✅ One PI (card amount) |
| **Query cost** | ✅ Single fetch | ❌ Join required | ✅ None (no DB) |

---

## Validation Rules

**At request creation (backend):**
1. If `isSplitPayment = true`, both `cashAmountCents` and `cardAmountCents` must be provided
2. Both must be > 0
3. `cashAmountCents + cardAmountCents` must equal `totalAmountCents` (within 1 cent rounding)
4. Stripe PI is created for `cardAmountCents` only, NOT `totalAmountCents`
5. `platformFeeCents = Math.round(cardAmountCents * 0.1)` — never applies to cash portion
6. If `isSplitPayment = false` (default), behave as before: `cardAmountCents = totalAmountCents`

**At frontend input (real-time validation):**
- Live calculation: `sum = cashAmount + cardAmount` must equal `totalAmount`
- If cashAmount changes, cardAmount auto-updates (or vice versa)
- Both must be ≥ 0.01 USD (1 cent minimum)
- Show running balance: "Card charge: $38.30 → Fee: $3.83"

---

## API Contract

### POST /api/pos/payment-request (Modified)

**Request body:**
```typescript
{
  shopperUserId: string;
  saleId: string;
  itemIds: string[];
  totalAmountCents: number;
  expiresInSeconds?: number;    // defaults to 900 (15 min)
  
  // New fields (split payment)
  isSplitPayment?: boolean;     // defaults to false
  cashAmountCents?: number;     // only when isSplitPayment=true
  cardAmountCents?: number;     // only when isSplitPayment=true
}
```

**Response (201 Created):**
```typescript
{
  requestId: string;
  status: "PENDING";
  shopperName: string;
  totalAmountCents: number;
  isSplitPayment: boolean;
  cashAmountCents?: number;     // if split
  cardAmountCents?: number;     // if split (this is what Stripe PI is for)
  displayAmount: string;        // "$88.30" (total)
  cardDisplayAmount?: string;   // "$38.30" (card portion, if split)
  expiresAt: string;
  stripePaymentIntentId: string;
  stripePaymentIntentSecret: string;
}
```

### GET /api/pos/payment-request/:requestId (Modified response)

```typescript
{
  id: string;
  organizerName: string;
  saleName: string;
  saleLocation: string;
  itemIds: string[];
  itemNames: string[];
  totalAmountCents: number;
  displayAmount: string;
  
  // Split payment details (NEW)
  isSplitPayment: boolean;
  cashAmountCents?: number;
  cardAmountCents?: number;
  cardDisplayAmount?: string;  // e.g., "$38.30"
  
  platformFeeCents: number;    // 10% of card amount (not cash)
  status: string;
  expiresAt: string;
  isExpired: boolean;
  stripePaymentIntentId: string;
  clientSecret: string;
  organizerStripeAccountId: string;
  createdAt: string;
  acceptedAt?: string;
  paidAt?: string;
}
```

### Note on webhook handling

The existing webhook listener for `payment_intent.succeeded` continues to work unchanged. When the card portion of a split payment succeeds:
1. The PI webhook fires with `amount = cardAmountCents`
2. Backend marks the POSPaymentRequest as PAID
3. Items are marked SOLD, XP is awarded
4. The transaction is marked complete

The cash portion is recorded in the DB (`cashAmountCents`) but requires **no Stripe interaction** — it's cash, so it's settled immediately at the counter.

---

## Stripe Implications

### Payment Intent Creation (Single PI for card portion only)

**Current behavior (non-split):**
```typescript
const PI = await stripe.paymentIntents.create(
  {
    amount: totalAmountCents,           // e.g., 8830 (cents)
    currency: 'usd',
    payment_method_types: ['card'],
    application_fee_amount: 883,        // 10% of 8830
    metadata: { ... }
  },
  { stripeAccount: orgStripeConnectId }
);
```

**New behavior (split):**
```typescript
const PI = await stripe.paymentIntents.create(
  {
    amount: cardAmountCents,            // e.g., 3830 (card portion only)
    currency: 'usd',
    payment_method_types: ['card'],
    application_fee_amount: 383,        // 10% of 3830 (NOT of the cash portion)
    metadata: { ... }
  },
  { stripeAccount: orgStripeConnectId }
);
```

**Why this works:**
- Stripe only charges the connected account for the card amount (`amount`)
- The platform fee (10%) is calculated on the card amount, not the total
- Cash is not sent to Stripe — it's recorded locally
- When the PI succeeds, the webhook handler marks the entire transaction (cash + card) as PAID

### No Changes to Webhook Flow

The `payment_intent.succeeded` webhook continues unchanged:
1. Receives event with `amount = cardAmountCents`
2. Fetches POSPaymentRequest by `metadata.requestId`
3. Updates status to PAID
4. Marks items SOLD, awards XP
5. Notifies organizer and shopper

---

## Frontend State Machine

### POS Page (/organizer/pos)

**New state additions:**
```typescript
// Split payment UI state
const [splitPaymentActive, setSplitPaymentActive] = useState(false);
const [splitCashAmount, setSplitCashAmount] = useState(0);
const [splitCardAmount, setSplitCardAmount] = useState(0);
const [splitPaymentMode, setSplitPaymentMode] = useState<'phone' | 'reader' | 'manual_card'>();
```

**Flow (after cart total is set, before payment submission):**

```
1. Organizer clicks cart → sees "Pay $88.30"
2. Organizer clicks "Split Payment" toggle → enters split mode
3. Split payment UI shows:
   - Total: $88.30 (locked)
   - Cash input: ___ (starts empty)
   - Card auto-calc: $88.30 - $0.00 = $88.30 (live)
   - Platform fee preview: $8.83 (live)
4. Organizer enters "50.00" in cash field
   - Card auto-updates: $38.30
   - Fee preview: $3.83
5. Organizer selects card payment method:
   - "Send to Phone" (existing PaymentRequest flow, but for $38.30 PI)
   - "Card Reader" (existing Stripe Terminal flow, but for $38.30 PI)
   - "Manual Card Entry" (existing Stripe Elements, but for $38.30 PI)
6. Payment processes (card portion only)
7. Upon PI success → entire transaction marked PAID (cash + card)
8. Items marked SOLD, XP awarded
```

### Component hierarchy

```
/organizer/pos
  ├─ SplitPaymentToggle (NEW)
  │   └─ Toggles splitPaymentActive
  ├─ (conditional) SplitPaymentInput (NEW)
  │   ├─ Cash amount input
  │   ├─ Live card amount calc
  │   ├─ Live fee preview
  │   └─ Card payment method selector
  └─ PaymentModeButtons (MODIFIED)
      └─ Reduced from {card, manual_card, cash, qr, invoice, phone}
         to only {card, manual_card, qr, invoice, phone}
         (because cash is now part of split, not standalone)
```

### Validation (frontend)

```typescript
// Real-time validation while user inputs cash amount
const validateSplitAmounts = (cashCents: number, totalCents: number) => {
  const cardCents = totalCents - cashCents;
  
  return {
    cashValid: cashCents >= 0 && cashCents <= totalCents,
    cardValid: cardCents >= 1,  // Must have at least 1 cent on card
    sumValid: Math.abs((cashCents + cardCents) - totalCents) <= 1,
    feeAmount: Math.round(cardCents * 0.1),
    cardDisplayAmount: `$${(cardCents / 100).toFixed(2)}`,
  };
};
```

---

## Migration Plan

**Migration file:** `packages/database/prisma/migrations/[timestamp]_add_split_payment.sql`

```sql
-- Add split payment fields to POSPaymentRequest
ALTER TABLE "POSPaymentRequest" 
ADD COLUMN "isSplitPayment" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "cashAmountCents" INTEGER,
ADD COLUMN "cardAmountCents" INTEGER;

-- Add index for split payment lookups
CREATE INDEX idx_split_payment ON "POSPaymentRequest"("isSplitPayment") WHERE "isSplitPayment" = true;

-- Verify: sum existing totalAmountCents and platform fees
-- (no data migration needed — new records will populate these fields)
```

### Rollback Plan

If split payment feature must be rolled back:

```sql
-- Remove split payment fields
ALTER TABLE "POSPaymentRequest" 
DROP COLUMN IF EXISTS "isSplitPayment",
DROP COLUMN IF EXISTS "cashAmountCents",
DROP COLUMN IF EXISTS "cardAmountCents";

-- Remove index
DROP INDEX IF EXISTS idx_split_payment;
```

**Code rollback:** Delete all split-payment-related components and branches from frontend.

---

## Dev Instructions (Ordered)

### Phase 1: Database & Backend (Sequential)

1. **Schema migration**
   - Create migration file in `packages/database/prisma/migrations/`
   - Add `isSplitPayment`, `cashAmountCents`, `cardAmountCents` to schema.prisma
   - Run `npx prisma migrate deploy` (Railway DB override)
   - Run `npx prisma generate`

2. **Backend validation logic** (posPaymentController.ts)
   - Modify `createPaymentRequest` endpoint:
     - Accept `isSplitPayment`, `cashAmountCents`, `cardAmountCents` in request body
     - Validate: `cashAmountCents + cardAmountCents = totalAmountCents`
     - Validate: both amounts > 0 when split is active
     - Calculate `platformFeeCents` based on `cardAmountCents`, not `totalAmountCents`
     - Create Stripe PI for `cardAmountCents` only
     - Store split fields in DB record
   - Modify `getPaymentRequest` response to include split fields
   - Verify: webhook handler does NOT need changes (PI still captures the right amount)

3. **TypeScript types** (shared types, backend types)
   - Update POSPaymentRequest DTO to include optional split fields
   - Add interface for split payment request body

### Phase 2: Frontend (Sequential)

4. **New component: SplitPaymentToggle**
   - Location: `packages/frontend/components/SplitPaymentToggle.tsx`
   - Props: `active: boolean`, `onToggle: (active) => void`
   - Renders: Toggle switch + label "Split between cash & card"

5. **New component: SplitPaymentInput** 
   - Location: `packages/frontend/components/SplitPaymentInput.tsx`
   - Props:
     - `totalAmountCents: number`
     - `onCashChange: (amountCents) => void`
     - `onCardChange: (amountCents) => void` (optional, can be auto-calc)
   - Renders:
     - "Total: $88.30" (label, locked)
     - Input: "Cash: [    ]" (numpad or text)
     - Auto-calc: "Card: $38.30 → Fee: $3.83" (read-only)
     - Validation: show red border if sum ≠ total or card < 1¢

6. **Modify pos.tsx**
   - Add state: `splitPaymentActive`, `splitCashAmount`, `splitCardAmount`
   - Add UI section: Render `<SplitPaymentToggle>` above payment mode buttons
   - Conditional: If split active, render `<SplitPaymentInput>` and hide cash payment option
   - Modify request creation:
     - When sending cart for payment, check `splitPaymentActive`
     - If true, pass split fields to API: `{ isSplitPayment: true, cashAmountCents, cardAmountCents }`
     - If false, omit split fields (backward compatible)

7. **Update payment mode buttons**
   - Conditionally hide "Cash" payment button when `splitPaymentActive = true` (cash is now part of split, handled separately)
   - Keep "Send to Phone", "Card Reader", "Manual Card" options — these charge the `cardAmountCents` portion only

### Phase 3: Integration & Testing (Sequential)

8. **Integration: API call flow**
   - Test: Organizer enters $88.30 cart, selects "Split Payment", enters $50 cash
   - Verify API call includes: `{ totalAmountCents: 8830, isSplitPayment: true, cashAmountCents: 5000, cardAmountCents: 3830 }`
   - Verify response includes split fields and PI amount is 3830, not 8830

9. **Integration: Stripe PI creation**
   - Log the PI being created and verify `amount: 3830`
   - Log the `application_fee_amount: 383` (10% of card, not total)
   - Confirm PI metadata includes `requestId` and split indicator

10. **Smoke test: Happy path (Chrome MCP)**
    - Organizer at /organizer/pos with a $50 cart
    - Click "Split Payment" → toggle active
    - Enter $30 cash → card auto-updates to $20
    - Select "Send to Phone"
    - Shopper receives request for $20 (not $50)
    - Shopper pays with card → transaction marked PAID
    - Both items marked SOLD, XP awarded
    - Verify in DB: `isSplitPayment=true`, `cashAmountCents=3000`, `cardAmountCents=2000`

11. **Smoke test: Edge cases**
    - Total $10, split as $9.99 cash + $0.01 card → must work (minimum 1¢)
    - Total $100, enter $150 cash → validation error (exceeds total)
    - Total $100, toggle off split → reverts to full PI, hides split UI

12. **TypeScript & build check**
    - Run: `cd packages/frontend && npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | grep -v node_modules`
    - Zero errors required

---

## Flagged for Patrick

**Before dev dispatch, Patrick should confirm:**

1. **Terminology:** Is "split payment" the right term, or prefer "partial cash"?
2. **Fee transparency:** When organizer sees "Fee: $3.83", should we clarify "Platform Fee (10% of card portion)"?
3. **UX polish:** Should the cash input use numpad (same as price entry) or direct keyboard? Should it be multi-tap or long-press on payment buttons?
4. **Item marking:** After a split transaction succeeds, all items are marked SOLD for both the cash and card portions — correct?
5. **Refund scope:** If a split transaction is later refunded, is the full amount (cash + card) credited, or only the card portion? (Likely full, but confirm.)

---

## Rollback Plan

### If feature is unstable after deploy:

1. **Immediate:** Frontend hides SplitPaymentToggle component (feature flag or code comment)
2. **Same-day:** Backend `createPaymentRequest` rejects `isSplitPayment=true` with error "Feature not available"
3. **Next session:** Drop migration (revert schema, run rollback SQL)

### If Stripe fees are calculated incorrectly:

1. Identify affected transactions (query POSPaymentRequest where `isSplitPayment=true`)
2. Audit: Compare `platformFeeCents` vs. expected (10% of `cardAmountCents`)
3. If underbilled: Manual adjustment or recharge (Patrick decision)
4. If overbilled: Refund via Stripe Connect

---

## Success Criteria

✅ Feature is **✅ verified** when:
- Organizer can create a split payment request with $X cash + $Y card (X + Y = total)
- Stripe PI is created for card amount only
- Platform fee is 10% of card amount, not total
- Shopper receives payment request for card amount only
- Transaction marks items as SOLD after card payment succeeds
- XP is awarded to organizer for the full transaction (not double-counted)
- DB audit trail shows both cash and card amounts for the transaction

---

## References

- **Schema:** `packages/database/prisma/schema.prisma` (POSPaymentRequest model)
- **Controller:** `packages/backend/src/controllers/posPaymentController.ts`
- **Frontend:** `packages/frontend/pages/organizer/pos.tsx`
- **Types:** `packages/frontend/lib/types/` (add split payment types)
- **Related ADR:** Mark Sold → POS/Invoice evolution (S421 planning doc)
