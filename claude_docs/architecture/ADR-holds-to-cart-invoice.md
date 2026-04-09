# ADR-012: Holds-to-Cart + Cart-to-Invoice + Split Cash Payment

**Status:** READY FOR IMPLEMENTATION
**Date:** 2026-04-09
**Author:** FindA.Sale Systems Architect
**Relates to:** Feature request — Patrick (holds → POS cart with split cash + email invoice flow)

---

## Problem Statement

Patrick wants to enable a POS checkout workflow where:

1. **Organizer pulls a shopper's held items into the POS cart** directly from the holds list
2. **Organizer adds additional non-held items** to the same cart (cross-sell, upsells, customer requests)
3. **Organizer records partial cash payment** and bills remainder via an invoice link sent via email/SMS

Currently:
- `markSoldAndCreateInvoice` bundles ALL active holds for a shopper into one Stripe Checkout session and sends email
- `sendHoldInvoice` creates a HoldInvoice but doesn't generate a Stripe Checkout session (incomplete MVP)
- `POSPaymentLink` (QR code checkout) exists but is separate from holds workflow
- `POSPaymentRequest` (split payment) exists but is used only for direct POS card payments, not invoices sent to shoppers

The feature needs to unify these flows without breaking existing functionality.

---

## Architecture Decision: Invoice Channel Strategy

### Question
Should holds-backed invoices unify with the QR payment link flow (`POSPaymentLink`), or stay separate as email/SMS invoice links sent to shoppers?

### Recommendation: UNIFY via Enhanced HoldInvoice + Email Distribution

**DECISION:** Hold invoices generated from a POS cart will use the **existing Stripe Checkout Session** mechanism (like `markSoldAndCreateInvoice`), but will:

1. Support mixed cargo (held items + non-held items added by organizer)
2. Accept a `cashAmountCents` override to enable split payment
3. Be delivered via **email/SMS** (not QR code on device)
4. Intentionally **NOT** use `POSPaymentLink` (Stripe Payment Links) for holds invoices — keep that channel for immediate POS self-checkout

**Rationale:**
- **Checkout Sessions are invoice-appropriate** — they expire (respects hold timers), can be re-sent via email link, and feel like a "payment request" not an immediate POS transaction
- **Payment Links are self-checkout-appropriate** — they're shareable, permanent, and designed for walk-up scanning (QR code). Mixing holds with links creates confusion about invoice vs. immediate purchase
- **Separation of concerns** — holds are async (email), QR is sync (immediate). Keep them distinct
- **Reduces schema churn** — `HoldInvoice` already has all fields needed. Adding `cashAmountCents` to it is a 1-line migration. `POSPaymentLink` serves a different purpose and doesn't need to change
- **Stripe Connect compliance** — Organizers will be using Stripe Connect accounts throughout. Checkout Sessions on connected accounts work the same way as Payment Links; both can handle transfers properly

---

## Design Details

### 1. Holds-to-Cart Pull

**Implementation:**

- **New Endpoint:** `POST /api/pos/sessions/:sessionId/pull-holds`
  - Organizer specifies which reservation IDs to pull (can be subset of active holds)
  - Items are added to `POSSession.cartItems` JSON array
  - Hold status transitions: `PENDING|CONFIRMED` → `HOLD_IN_CART` (new status)
  - Holds remain "active" — if organizer abandons session, holds revert to `PENDING|CONFIRMED`

- **New Hold Status:** Add `HOLD_IN_CART` to `ItemReservation.status` enum
  - Semantics: "This hold is in an active POS session awaiting checkout"
  - Prevents double-booking (hold can't be invoiced separately while in cart)
  - If session expires/closes without payment, auto-revert to `PENDING|CONFIRMED`

- **Additional Items:** 
  - Organizer can add any non-held items from the sale to the same `POSSession.cartItems`
  - These items have no associated hold — they're "additional cart items"
  - Schema: `cartItems` array already supports mixed items; no change needed

**No Schema Change Required:** `POSSession.cartItems` already stores JSON; cart can contain held + non-held items side-by-side.

---

### 2. Invoice Channel Architecture

**New Endpoint:** `POST /api/pos/sessions/:sessionId/create-invoice`

**Request:**
```json
{
  "shopperId": "user123",           // shopper to bill (may differ from session creator)
  "cashAmountCents": 0,              // optional: cash received (0 = no split, default)
  "notes": "Customer special request" // optional
}
```

**Response:**
```json
{
  "invoiceId": "inv_abc123",
  "stripeSessionId": "cs_test_...",
  "totalAmountCents": 5000,
  "cardAmountCents": 5000,           // after split, if any
  "expiresAt": "2026-04-10T18:00:00Z",
  "status": "PENDING",
  "invoiceLinkUrl": "https://checkout.stripe.com/pay/cs_test_..."
}
```

**Behavior:**

1. Convert `POSSession.cartItems` into a `HoldInvoice` record
2. Create Stripe Checkout Session with:
   - All items (held + non-held) as line items
   - Total amount = sum of all item prices
   - Amount to charge on Stripe = `totalAmount - cashAmount` (if split)
3. Update `HoldInvoice` with new fields:
   - `cartSessionId: String?` (links to POSSession for audit trail)
   - `cashAmountCents: Int?` (amount organizer collected in cash)
   - `cardAmountCents: Int` (derived: total - cash, or total if no split)
4. Update associated holds from `HOLD_IN_CART` → `INVOICE_ISSUED` (matches existing Item.status behavior)
5. Send invoice link via email/SMS using existing Resend integration
6. Mark `POSSession` status `OPEN` → `PULLED` → `COMPLETED` on payment confirmation

**No Logic in Stripe Checkout Configuration:**
- Stripe always charges the full `cardAmountCents` (organizer is responsible for math)
- Backend records `cashAmountCents` for accounting/receipts
- Cash portion is **not** sent to Stripe; organizer keeps it (reconciliation is off-platform)

---

### 3. Split Cash on Invoices

**Schema Addition:**

```prisma
model HoldInvoice {
  // ... existing fields ...
  cashAmountCents    Int?          // Amount organizer collected in cash (optional)
  cardAmountCents    Int?          // Amount to charge via Stripe (total - cash, optional)
  cartSessionId      String?       // FK to POSSession for audit trail (optional)
  
  @@index([cartSessionId])
}
```

**Calculation Rules:**

- If `cashAmountCents = null` → regular full-card invoice (backward compatible)
- If `cashAmountCents = 0` → no cash collected, charge full amount (equivalent to null)
- If `cashAmountCents > 0`:
  - If `cashAmountCents >= totalAmountCents` → no Stripe charge needed. Invoice shows as "PAID" after organizer confirms. Create a Purchase record with status "PAID", `source="POS"` (cash)
  - If `cashAmountCents < totalAmountCents` → charge only the difference. Stripe line items remain unchanged (total amount); Platform fee is calculated on the `cardAmountCents` portion only, not the cash portion
- Platform fee is always 10% (SIMPLE tier) or 8% (PRO tier) of the **card amount**, never the cash
- Stripe fees: estimate applies only to the `cardAmountCents` transaction

**Example:**
```
totalAmountCents = $50.00 (5000 cents)
cashAmountCents = $15.00 (1500 cents) [organizer collected in cash]
cardAmountCents = $35.00 (3500 cents) [to charge on card]
platformFeePercent = 0.10 (SIMPLE tier)

platformFeeAmount = round(35.00 * 0.10) = $3.50 (350 cents)
  [Note: platform fee is on the card portion, not the cash portion]
stripeAmount = 3500 cents
```

**No Change to Stripe Configuration:**
- Stripe Checkout Session is created with `totalAmountCents` as the sum, but the `application_fee_amount` in the Stripe intent metadata reflects only the card portion
- On webhook confirmation, create a Purchase record for the card portion, another for the cash portion
- Organizer UI shows both transactions in their dashboard

---

### 4. Deduplication: `sendHoldInvoice` vs `markSoldAndCreateInvoice`

**DECISION: Deprecate `sendHoldInvoice`. Mark it as `@deprecated` and remove all routing to it.**

**Rationale:**
- `sendHoldInvoice` creates a `HoldInvoice` without a Stripe Checkout session (incomplete)
- `markSoldAndCreateInvoice` does the same thing properly (creates full Stripe session + sends email)
- Having two paths is technical debt and confuses behavior
- The new POS cart endpoint unifies the pattern: create invoice from cart items, send link via email

**Action:**
1. Remove `POST /api/pos/holds/:reservationId/invoice` route entirely
2. Keep `POST /api/reservations/:id/mark-sold` as the "quick invoice" path for when organizer triggers from a single hold (backward compat)
3. Both routes (quick invoice + POS cart invoice) converge on the same `HoldInvoice` + Stripe Checkout pattern

**Backward Compatibility:**
- Existing frontend code calling `sendHoldInvoice` will 404; update to use `/mark-sold` instead (same semantics)
- No data migration needed — old `sendHoldInvoice`-created invoices are already in `HoldInvoice` table

---

## API Contracts

### New Endpoint 1: Pull Holds into Cart

**Endpoint:** `POST /api/pos/sessions/:sessionId/pull-holds`

**Auth:** Organizer only

**Request:**
```json
{
  "reservationIds": ["res_abc", "res_def"]  // which holds to pull
}
```

**Response:**
```json
{
  "sessionId": "psess_123",
  "status": "OPEN",
  "cartItems": [
    {
      "id": "item_1",
      "title": "Antique Lamp",
      "price": 45.00,
      "photoUrl": "https://...",
      "holdReservationId": "res_abc",  // null if non-held
      "saleId": "sale_123"
    },
    ...
  ],
  "totalAmount": 150.00,
  "updatedAt": "2026-04-09T14:30:00Z"
}
```

**Error Responses:**
- `400` — Invalid sessionId or reservationIds
- `403` — Session/sale not owned by organizer
- `409` — Hold already in another session / hold expired / hold in invalid state

---

### New Endpoint 2: Create Invoice from POS Cart

**Endpoint:** `POST /api/pos/sessions/:sessionId/create-invoice`

**Auth:** Organizer only

**Request:**
```json
{
  "shopperId": "user_abc",
  "cashAmountCents": 1500,  // optional: e.g., $15 cash collected
  "notes": "Customer requested 2-piece sale"  // optional
}
```

**Response:**
```json
{
  "invoiceId": "inv_abc123",
  "stripeSessionId": "cs_test_...",
  "stripeCheckoutUrl": "https://checkout.stripe.com/pay/cs_test_...",
  "totalAmountCents": 5000,
  "cashAmountCents": 1500,
  "cardAmountCents": 3500,
  "platformFeeAmount": 350,  // 10% of cardAmountCents
  "status": "PENDING",
  "expiresAt": "2026-04-10T18:00:00Z",
  "createdAt": "2026-04-09T14:30:00Z"
}
```

**Behavior:**
1. Validates sessionId, cartItems not empty, shopper exists
2. Bundles all cartItems into Stripe Checkout Session
3. Creates HoldInvoice record with `cartSessionId` + `cashAmountCents`
4. Calculates platform fee on `cardAmountCents` only
5. Updates all held items from `HOLD_IN_CART` → `INVOICE_ISSUED`
6. Sends invoice link via email to shopper (Resend)
7. Marks session status `OPEN` → `PULLED`
8. Returns invoice ID + Stripe URL (for shopper to complete payment)

**Error Responses:**
- `400` — Missing required fields, cartItems empty, invalid amounts
- `403` — Session not owned by organizer
- `409` — Session already completed/expired
- `402` — Stripe error (insufficient balance, card declined, etc.)

---

### Updated Endpoint: Mark Single Hold as Sold (Backward Compat)

**Endpoint:** `POST /api/reservations/:id/mark-sold` (existing, unchanged)

**Behavior (unchanged):**
- Bundles all active holds for shopper + sale
- Creates HoldInvoice + Stripe Checkout
- Sends email with invoice link
- Updates holds status to `INVOICE_ISSUED`

**No changes needed** — this endpoint already implements the unified pattern correctly.

---

## Schema Changes

### Migration: Add Split Payment + Cart Tracking to HoldInvoice

```prisma
model HoldInvoice {
  // ... existing ...
  
  // Feature: Split Cash Payments
  cashAmountCents    Int?          // Optional: amount organizer collected in cash
  cardAmountCents    Int?          // Derived: total - cash (optional for backcompat)
  
  // Feature: POS Cart Linkage
  cartSessionId      String?       // FK to POSSession (audit trail)
  
  // ... indexes ...
  @@index([cartSessionId])
}

model ItemReservation {
  // ... existing ...
  
  // Feature: Hold State During POS Session
  // (Update status enum to include 'HOLD_IN_CART')
  status    String   @default("PENDING") // PENDING, CONFIRMED, HOLD_IN_CART, CANCELLED, EXPIRED, INVOICE_ISSUED
}
```

### New Enum (Optional, for type safety)

```prisma
enum HoldStatus {
  PENDING
  CONFIRMED
  HOLD_IN_CART
  CANCELLED
  EXPIRED
  INVOICE_ISSUED
}
```

**Migration SQL (pseudo):**

```sql
-- Add new columns to HoldInvoice
ALTER TABLE "HoldInvoice" 
  ADD COLUMN "cashAmountCents" INTEGER,
  ADD COLUMN "cardAmountCents" INTEGER,
  ADD COLUMN "cartSessionId" VARCHAR(255),
  ADD INDEX "HoldInvoice_cartSessionId_idx" ("cartSessionId");

-- Add constraint for referential integrity (optional)
ALTER TABLE "HoldInvoice"
  ADD CONSTRAINT "HoldInvoice_cartSessionId_fkey"
  FOREIGN KEY ("cartSessionId")
  REFERENCES "POSSession"("id") ON DELETE SET NULL;
```

**No breaking changes:**
- Existing holds and invoices continue to work (new fields are nullable)
- `markSoldAndCreateInvoice` doesn't need to change (new fields stay null)
- New POS cart flow will populate these fields

---

## Dev Instructions (Ordered Implementation)

1. **Schema & Migration** (Database Package)
   - Read `packages/database/prisma/schema.prisma`
   - Add `HOLD_IN_CART` to `ItemReservation.status` enum comment (or migrate to Prisma enum if desired)
   - Add 3 new fields to `HoldInvoice`: `cashAmountCents`, `cardAmountCents`, `cartSessionId`
   - Create migration file: `packages/database/prisma/migrations/[timestamp]_add_split_payment_cart_tracking.sql`
   - Test locally with `prisma migrate dev`

2. **Backend: POS Controller — Pull Holds** (Backend Package)
   - New endpoint: `POST /api/pos/sessions/:sessionId/pull-holds`
   - Input: session ID + array of reservation IDs
   - Logic:
     - Fetch session and verify organizer ownership
     - Fetch reservations, validate they're active + not expired + no invoice yet
     - For each reservation: mark as `HOLD_IN_CART`, lock to this session (prevent pulling into another)
     - Add `{ holdReservationId: res.id, ... }` to session cartItems
     - Return updated session
   - Error handling: 400 (invalid input), 403 (access denied), 409 (hold state invalid)
   - **File:** `packages/backend/src/controllers/posController.ts` → add `pullHoldsIntoCart` function
   - **Route:** `router.post('/sessions/:sessionId/pull-holds', authenticateRequest, pullHoldsIntoCart);`

3. **Backend: POS Controller — Create Invoice from Cart** (Backend Package)
   - New endpoint: `POST /api/pos/sessions/:sessionId/create-invoice`
   - Input: session ID, shopper ID, optional cash amount
   - Logic:
     - Fetch session, validate cartItems not empty
     - Calculate total from all items
     - If `cashAmountCents` provided: `cardAmountCents = totalAmountCents - cashAmountCents`
     - Create Stripe Checkout Session with all items (use existing `markSoldAndCreateInvoice` pattern as template)
     - In Stripe intent metadata, use `cardAmountCents` for fee calculations, not total
     - Create HoldInvoice record with `cartSessionId` + `cashAmountCents` + `cardAmountCents`
     - Update all held items in cartItems from `HOLD_IN_CART` → `INVOICE_ISSUED`
     - Update session status to `PULLED`
     - Send invoice email with Stripe checkout link (Resend)
     - Return invoice + Stripe session ID
   - Error handling: 400, 403, 409, 402 (Stripe)
   - **File:** `packages/backend/src/controllers/posController.ts` → add `createCartInvoice` function
   - **Route:** `router.post('/sessions/:sessionId/create-invoice', authenticateRequest, createCartInvoice);`

4. **Backend: Webhook Handler — Invoice Payment Confirmation** (Backend Package)
   - When Stripe webhook fires `checkout.session.completed` for a `HoldInvoice`-backed session:
     - Fetch HoldInvoice by `stripeSessionId`
     - If `cashAmountCents > 0`: create a Purchase record for cash portion (source="POS", status="PAID", no PaymentIntent)
     - Create Purchase record for card portion (existing behavior, status="PENDING" → "PAID" on webhook)
     - Mark HoldInvoice status `PENDING` → `PAID`
     - Mark associated ItemReservations status to expire (they're sold)
   - **File:** Update `packages/backend/src/webhooks/stripeWebhook.ts` or relevant handler
   - **Validation:** Grep for existing Checkout webhook handler, reuse pattern

5. **Backend: Session Revert Logic** (Backend Package)
   - Background job or manual cleanup: if `POSSession` expires while in `HOLD_IN_CART` state:
     - Fetch all ItemReservations with status = `HOLD_IN_CART` and session ID
     - Revert to `PENDING|CONFIRMED` (restore original state)
     - Mark session `OPEN` → `ABANDONED`
   - **File:** Could be a scheduled task or part of session cleanup; consult `packages/backend/src/jobs/` for patterns

6. **Backend: Deprecation — Remove sendHoldInvoice** (Backend Package)
   - Mark `sendHoldInvoice` function as `@deprecated` with comment
   - Remove route: `router.post('/pos/holds/:reservationId/invoice', authenticateRequest, sendHoldInvoice);`
   - Leave function in code for now (for archive/reference), but route is gone
   - Update API docs
   - **File:** `packages/backend/src/controllers/posController.ts`

7. **Frontend: POS Cart UI** (Frontend Package)
   - New component: `POS/HoldsToCart.tsx` — display active holds list with "Pull into Cart" button
   - New component: `POS/CartSummary.tsx` — display current cart items with prices + held badge
   - New component: `POS/CartInvoiceForm.tsx` — form to enter cash amount + shopper selection, "Create Invoice" button
   - Calls:
     - `POST /api/pos/sessions/:id/pull-holds` on button click (pull holds)
     - `POST /api/pos/sessions/:id/create-invoice` on form submit (create invoice)
   - On invoice creation success: display Stripe Checkout URL for shopper to complete payment
   - Handle loading/error states
   - **Files:** `packages/frontend/pages/pos/[saleId]/checkout.tsx` or `/cart.tsx` (update existing or create new page)
   - **Requirements per DECISIONS.md:**
     - Dark mode support (D-002)
     - Mobile-first layout, 44px tap targets (D-004)
     - Empty states if no holds or no cart items (D-003)

8. **Frontend: Invoice Display** (Frontend Package)
   - Update shopper invoice page to show:
     - Held items + non-held items bundled in invoice
     - Cash amount collected (if split)
     - Remaining balance (to charge on Stripe)
     - Invoice link + expiry timer
   - **File:** `packages/frontend/pages/my-invoices/[invoiceId].tsx` (update existing)

9. **TypeScript Validation**
   - After all changes, run:
     ```bash
     cd /sessions/gracious-vigilant-cori/mnt/FindaSale/packages/frontend
     npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | grep -v node_modules
     ```
   - Zero errors required before returning

10. **Testing Checklist** (for QA dispatch)
    - Pull holds into cart: verify hold status updates to `HOLD_IN_CART`, item appears in cart
    - Add non-held item to cart: verify mixed cart renders correctly
    - Create split invoice: verify cash + card amounts calculated correctly, invoice created
    - Create full-card invoice: verify backward compatible (no cash = full charge)
    - Email sent: verify Resend integration sends invoice link
    - Stripe checkout: verify Stripe Checkout Session loads correctly for shopper
    - Payment confirmation: verify webhook marks invoice PAID, items marked SOLD
    - Session expiry: verify abandoned cart reverts holds to PENDING
    - Dark mode: verify all new components have dark mode support
    - Mobile: verify on 375px viewport, no horizontal scroll, 44px tap targets

---

## Flagged for Patrick

### Business Decision Required

**Question 1: Cash Reconciliation**

The spec treats cash as "organizer keeps it, records it in platform, Stripe doesn't know about it."

Should FindA.Sale instead:
- **Option A (recommended):** Organizer records cash locally, platform just logs it for receipts. Organizer manually reconciles (current spec)
- **Option B:** FindA.Sale deposits cash via Stripe Connect later (more complex, needs bank routing)
- **Option C:** Cash is collected but organizer must photograph receipt/note for audit (compliance)

**Recommendation:** Option A. It's the simplest and matches the "POS organizer" workflow (organizers are already handling cash at sales).

---

**Question 2: Hold Auto-Expiry on Session Abandon**

If an organizer pulls a hold into a POS cart and then abandons the session (closes browser, session times out), should:

- **Option A (recommended):** Hold reverts to `PENDING` after 2 hours (same as session expiry). Shopper can try holding again.
- **Option B:** Hold is released entirely (no re-hold allowed). Shopper must request new hold.
- **Option C:** Hold is locked to organizer until organizer explicitly cancels it.

**Recommendation:** Option A. It respects the original hold timer and allows retry without being punitive.

---

**Question 3: Non-Held Item Behavior**

If organizer adds a non-held item to a cart (e.g., upsell, customer special request), and the invoice is created with a mix of held + non-held items:

- Should held items be marked `SOLD` if payment fails (Stripe decline)?
- Should non-held items be marked `RESERVED` during the 2-hour invoice window (preventing another shopper from buying)?

**Recommendation:** Yes to both. Treat the entire invoice as an atomic unit. If shopper pays, all items move to SOLD. If shopper doesn't pay and invoice expires, all items revert to available. Non-held items should be softly reserved during the invoice window (optional, depends on your overbooking tolerance).

---

## Implementation Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| **Holds double-book if pull fails mid-operation** | Use database transaction; atomic HoldInvoice + ItemReservation updates |
| **Cash math errors (rounding)** | Always work in cents (integers), never floats. Test edge cases: $0.01 splits, $99.99 items |
| **Stripe fee underestimation** | Use Stripe's fee API to get actual fees; store `stripeFeeAmount` in HoldInvoice for accuracy |
| **Organizer confusion about split payment** | Clear UI labels: "Cash Collected: $15" + "Remaining to Charge: $35" |
| **Old code calling deprecated `sendHoldInvoice`** | Add 410 Gone response; log warnings. Monitor error tracking for any missed callers |
| **Mobile form input for cash amounts** | Use HTML5 number input with min/max constraints; test on small screens |
| **Email link expiry tracking** | Stripe handles session expiry; store `expiresAt` in HoldInvoice for UI timer display |

---

## Backward Compatibility

- Existing `markSoldAndCreateInvoice` flow unchanged (new fields are nullable)
- Existing invoices have `cartSessionId = null` and `cashAmountCents = null` (no side effects)
- `POSPaymentLink` (QR checkout) unaffected
- `POSSession` cart mechanism unchanged (already supports mixed items)

---

## Success Criteria

✅ Organizer can pull one or more holds into a POS cart
✅ Organizer can add non-held items to same cart
✅ Organizer can enter cash collected + generate invoice
✅ Invoice email sent to shopper with Stripe checkout link
✅ Stripe charges only the remainder (card amount), not the cash amount
✅ Platform fee calculated on card amount only
✅ Items marked SOLD on payment confirmation
✅ Holds revert if session abandoned before invoice created
✅ All new UI components support dark mode + mobile (375px viewport)
✅ Zero TypeScript errors

---

## References

- `schema.prisma` — HoldInvoice, ItemReservation, POSSession models
- `reservationController.ts` — `markSoldAndCreateInvoice` (template for new endpoints)
- `posController.ts` — `getActiveHolds`, `sendHoldInvoice` (to deprecate)
- `DECISIONS.md` — D-002 (Dark Mode), D-003 (Empty States), D-004 (Mobile)
- Stripe Checkout Sessions API — https://stripe.com/docs/payments/checkout
- SECURITY.md — Organizer access control patterns
