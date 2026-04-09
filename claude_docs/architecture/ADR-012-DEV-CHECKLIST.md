# ADR-012 Developer Checklist

**Use this checklist when implementing the holds-to-cart + split cash invoice feature.**

Reference: `ADR-holds-to-cart-invoice.md` (full spec) and `ADR-012-SUMMARY.md` (business overview)

---

## Phase 1: Schema & Database

- [ ] Read `packages/database/prisma/schema.prisma`
- [ ] Add `HOLD_IN_CART` to `ItemReservation.status` enum (update comment if using string enum)
- [ ] Add 3 fields to `HoldInvoice` model:
  - `cashAmountCents: Int?`
  - `cardAmountCents: Int?`
  - `cartSessionId: String?` with FK constraint to `POSSession`
- [ ] Create migration file in `packages/database/prisma/migrations/`
- [ ] Run `npx prisma migrate dev` to test locally
- [ ] Verify migration applies cleanly to Railway DB (with DATABASE_URL override):
  ```powershell
  cd packages/database
  $env:DATABASE_URL="postgresql://postgres:..."
  npx prisma migrate deploy
  npx prisma generate
  ```

---

## Phase 2: Backend — Endpoint 1 (Pull Holds)

**File:** `packages/backend/src/controllers/posController.ts`

- [ ] Add function `pullHoldsIntoCart(req: AuthRequest, res: Response)`
  - [ ] Verify organizer auth (req.user + organizer role)
  - [ ] Fetch POSSession, validate ownership
  - [ ] Fetch ItemReservations by IDs, validate:
    - [ ] Status in [PENDING, CONFIRMED]
    - [ ] Not expired (`expiresAt > now`)
    - [ ] No invoiceId (not already invoiced)
    - [ ] No other session lock
  - [ ] Wrap in transaction:
    - [ ] Update each ItemReservation: `status = 'HOLD_IN_CART'`
    - [ ] Add items to POSSession.cartItems with `holdReservationId` field
  - [ ] Return updated session with all cart items
  - [ ] Error handling: 400 (invalid input), 403 (access denied), 409 (state invalid)

**Route:** Add to `packages/backend/src/routes/posRoutes.ts` or similar:
```typescript
router.post('/sessions/:sessionId/pull-holds', authenticateRequest, pullHoldsIntoCart);
```

---

## Phase 3: Backend — Endpoint 2 (Create Invoice)

**File:** `packages/backend/src/controllers/posController.ts`

- [ ] Add function `createCartInvoice(req: AuthRequest, res: Response)`
  - [ ] Verify organizer auth
  - [ ] Fetch POSSession, validate ownership + status = 'OPEN'
  - [ ] Validate cartItems not empty
  - [ ] Calculate totals:
    - [ ] `totalAmountCents = sum of all item prices`
    - [ ] `cashAmountCents = req.body.cashAmountCents || 0`
    - [ ] `cardAmountCents = totalAmountCents - cashAmountCents`
    - [ ] Validate: `cardAmountCents >= 0`
  - [ ] Create Stripe Checkout Session (use `markSoldAndCreateInvoice` as template):
    - [ ] Extract all items from cartItems
    - [ ] Build line_items array
    - [ ] Calculate platform fee on `cardAmountCents` only (10% SIMPLE, 8% PRO)
    - [ ] Set `application_fee_amount` to platform fee (in cents)
    - [ ] Set `expires_at` = hold soonest expiry date
    - [ ] Store organizer Stripe Connect ID in transfer_data
  - [ ] Wrap in transaction:
    - [ ] Create HoldInvoice with:
      - `cartSessionId` = session ID
      - `cashAmountCents` = request value (or null)
      - `cardAmountCents` = calculated value
      - `totalAmount` = sum in cents
      - `itemIds` = all item IDs from cart
      - Other fields: shopper, organizer, sale, Stripe session ID, status='PENDING', expiresAt
    - [ ] Update all ItemReservations in cart:
      - [ ] If `holdReservationId` set: status = 'INVOICE_ISSUED'
      - [ ] Update invoiceId reference
    - [ ] Update POSSession: status = 'PULLED'
  - [ ] Send email to shopper (Resend) with invoice link + details:
    - [ ] If split payment: show "Cash collected: $X, Remaining to charge: $Y"
    - [ ] Include Stripe checkout URL
    - [ ] Include expiry time
  - [ ] Return response with invoiceId, stripeSessionId, URLs, amounts
  - [ ] Error handling: 400, 403, 409, 402 (Stripe)

**Route:** Add to routes:
```typescript
router.post('/sessions/:sessionId/create-invoice', authenticateRequest, createCartInvoice);
```

---

## Phase 4: Backend — Webhook Handler

**File:** `packages/backend/src/webhooks/stripeWebhook.ts` or existing handler

- [ ] Find existing Stripe webhook handler for `checkout.session.completed`
- [ ] Add logic to detect if session is HoldInvoice-backed (via metadata or lookup)
- [ ] On payment completion:
  - [ ] Fetch HoldInvoice
  - [ ] If `cashAmountCents > 0`:
    - [ ] Create Purchase record for cash portion:
      - `amount` = cash amount (in dollars, not cents)
      - `source` = 'POS'
      - `status` = 'PAID'
      - `userId` = shopper ID (nullable for walk-ins)
      - `saleId`, `itemId` = from invoice
      - No `stripePaymentIntentId` (cash doesn't go through Stripe)
  - [ ] Create Purchase record for card portion (existing pattern):
    - `amount` = card amount
    - `source` = 'POS'
    - `stripePaymentIntentId` from Stripe webhook
    - `status` = 'PAID' (or 'PENDING' if you want async confirmation)
  - [ ] Update HoldInvoice: `status` = 'PAID', `paidAt` = now
  - [ ] Update associated Items: status = 'SOLD'
  - [ ] Mark ItemReservations as completed (optional field, or leave as-is)
  - [ ] Update POSSession: status = 'COMPLETED'
  - [ ] Send confirmation email to shopper

---

## Phase 5: Backend — Session Cleanup (Optional but Recommended)

**File:** Create `packages/backend/src/jobs/cleanupAbandonedPOSSessions.ts` or add to existing cleanup

- [ ] Background job (cron or on-demand):
  - [ ] Find POSSession where `status = 'OPEN'` and `expiresAt < now`
  - [ ] For each session:
    - [ ] Find all ItemReservations with `status = 'HOLD_IN_CART'` and `cartSessionId = session.id`
    - [ ] Revert each reservation: `status = 'PENDING'` (restore original state)
    - [ ] Update session: `status = 'ABANDONED'`
  - [ ] Run on schedule (e.g., every 15 minutes) or on-demand

---

## Phase 6: Frontend — Component 1 (Holds List + Pull Action)

**File:** `packages/frontend/pages/pos/[saleId]/holds.tsx` or new component

- [ ] Display list of active holds for the sale
  - [ ] Call `GET /api/pos/holds?saleId=[saleId]` (existing endpoint)
  - [ ] Show: item title, price, shopper name, expiry time
  - [ ] "Pull into Cart" button for each hold (or checkbox multi-select)
- [ ] On button click:
  - [ ] Call `POST /api/pos/sessions/:sessionId/pull-holds` with `reservationIds`
  - [ ] On success: redirect to cart view or refresh cart
  - [ ] On error: show toast with error message
- [ ] UI requirements (per DECISIONS.md):
  - [ ] Dark mode support (dark: variants for all colors)
  - [ ] Mobile-first: 44px buttons, no horizontal scroll, test at 375px
  - [ ] Empty state if no holds: "No active holds for this sale" + CTA

---

## Phase 7: Frontend — Component 2 (Cart Display)

**File:** Update existing POS cart component or create `packages/frontend/components/POS/CartSummary.tsx`

- [ ] Display cartItems from POSSession:
  - [ ] Item title, price, photo (if available)
  - [ ] Badge: "Held" or "Additional" (held vs. non-held)
  - [ ] Total cart amount
- [ ] "Remove Item" action (remove from cartItems, revert hold to PENDING if held)
- [ ] Dark mode + mobile-first compliance
- [ ] Empty state: "Cart is empty. Pull holds or add items above."

---

## Phase 8: Frontend — Component 3 (Invoice Form)

**File:** Create `packages/frontend/components/POS/CartInvoiceForm.tsx`

- [ ] Form fields:
  - [ ] Shopper email/ID (dropdown or autocomplete)
  - [ ] Total amount (read-only, calculated from cartItems)
  - [ ] Cash amount (number input, optional)
  - [ ] Display calculated card amount (total - cash)
  - [ ] Notes (optional textarea)
  - [ ] "Create Invoice" button
- [ ] Form validation:
  - [ ] Cash amount must be <= total
  - [ ] Cash amount must be >= 0
  - [ ] Shopper ID required
- [ ] On submit:
  - [ ] Call `POST /api/pos/sessions/:sessionId/create-invoice`
  - [ ] Show loading state
  - [ ] On success:
    - [ ] Display invoice ID + Stripe checkout URL
    - [ ] Show success toast: "Invoice created. Sending email to shopper..."
    - [ ] Optionally display QR code for organizer to share
  - [ ] On error: show error toast, preserve form data
- [ ] Dark mode + mobile-first compliance
  - [ ] Number input with proper touch keyboard on mobile
  - [ ] Stack form vertically on small screens

---

## Phase 9: Frontend — Invoice Display Page

**File:** Update `packages/frontend/pages/my-invoices/[invoiceId].tsx`

- [ ] Fetch invoice by ID (new query: include cashAmountCents + cardAmountCents)
- [ ] Show:
  - [ ] All items in invoice (held + non-held)
  - [ ] Total amount
  - [ ] If split payment: "Cash collected: $X" + "Remaining charge: $Y"
  - [ ] Platform fee breakdown
  - [ ] Invoice status + expiry timer
  - [ ] Stripe checkout link + button to complete payment
- [ ] Update to handle new split-payment fields
- [ ] Dark mode + mobile-first

---

## Phase 10: TypeScript Validation

After all changes, run:

```bash
cd /sessions/gracious-vigilant-cori/mnt/FindaSale/packages/frontend
npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | grep -v node_modules
```

- [ ] Zero TypeScript errors reported
- [ ] If errors: fix before returning

---

## Phase 11: Deprecation — Remove sendHoldInvoice

**File:** `packages/backend/src/controllers/posController.ts`

- [ ] Mark function as `@deprecated` (JSDoc comment)
- [ ] Remove route from `posRoutes.ts`: `DELETE router.post('/pos/holds/:reservationId/invoice', ...)`
- [ ] Function remains in code for archive/reference (don't delete yet)
- [ ] Update API docs (Swagger/OpenAPI if used)

---

## QA Handoff Checklist (for findasale-qa dispatch)

Copy this section when handing off to QA:

```
SCENARIOS TO TEST:

1. PULL HOLDS INTO CART
   - [ ] Pull 1 hold, verify cartItems updated
   - [ ] Pull 2 holds, verify both in cart
   - [ ] Hold status changes to HOLD_IN_CART
   - [ ] Error: attempt to pull expired hold → 409
   - [ ] Error: attempt to pull hold from another organizer's sale → 403

2. ADD NON-HELD ITEM TO CART
   - [ ] Organizer adds item manually to cart (if UI supports)
   - [ ] Cart displays mix of held + non-held correctly
   - [ ] Totals calculated correctly

3. CREATE FULL-CARD INVOICE (no split)
   - [ ] cashAmountCents = 0 or null
   - [ ] Stripe charges full amount
   - [ ] Platform fee calculated on total
   - [ ] Invoice email sent to shopper
   - [ ] Invoice link in email works

4. CREATE SPLIT INVOICE (with cash)
   - [ ] Enter $15 cash on $50 invoice
   - [ ] Form shows: Total $50, Cash $15, To Charge $35
   - [ ] Stripe Checkout loads with correct amount ($35 in cents = 3500)
   - [ ] Platform fee calculated on $35 only (not $50)
   - [ ] Invoice shows both amounts

5. PAYMENT CONFIRMATION
   - [ ] Shopper completes Stripe payment
   - [ ] Webhook confirms payment
   - [ ] Invoice marked PAID
   - [ ] Items marked SOLD
   - [ ] Session marked COMPLETED

6. SESSION ABANDONMENT
   - [ ] Pull hold into cart, don't create invoice
   - [ ] Session expires (2 hours)
   - [ ] Hold reverts to PENDING
   - [ ] Session marked ABANDONED

7. DARK MODE & MOBILE
   - [ ] All new components render in dark mode
   - [ ] Test on 375px viewport (iPhone SE)
   - [ ] No horizontal scroll, 44px tap targets

8. ERROR SCENARIOS
   - [ ] Invalid session ID → 400
   - [ ] Organizer access to another's session → 403
   - [ ] Empty cart → 400
   - [ ] Negative or excessive cash amount → 400
   - [ ] Stripe error (decline, insufficient balance) → 402, graceful error message
```

---

## File Checklist

**New files created:**
- [ ] Migration file: `packages/database/prisma/migrations/[timestamp]_add_split_payment_cart_tracking.sql`

**Modified files:**
- [ ] `packages/database/prisma/schema.prisma` (HoldInvoice + ItemReservation)
- [ ] `packages/backend/src/controllers/posController.ts` (2 new functions + deprecate sendHoldInvoice)
- [ ] `packages/backend/src/routes/posRoutes.ts` (2 new routes)
- [ ] `packages/backend/src/webhooks/stripeWebhook.ts` (update handler)
- [ ] `packages/backend/src/jobs/cleanupAbandonedPOSSessions.ts` (new or update)
- [ ] `packages/frontend/pages/pos/[saleId]/holds.tsx` (new or update)
- [ ] `packages/frontend/components/POS/CartSummary.tsx` (new)
- [ ] `packages/frontend/components/POS/CartInvoiceForm.tsx` (new)
- [ ] `packages/frontend/pages/my-invoices/[invoiceId].tsx` (update for split payment fields)

---

## Success Criteria

All must be ✅:

- [ ] Pull holds endpoint works end-to-end
- [ ] Hold status transitions to HOLD_IN_CART
- [ ] Create invoice endpoint accepts cash amount
- [ ] Stripe charges only card amount (total - cash)
- [ ] Platform fee calculated on card amount only
- [ ] Invoice email sent with checkout link
- [ ] Shopper can complete payment via Stripe Checkout
- [ ] Items marked SOLD on payment
- [ ] Abandoned cart reverts holds
- [ ] All new UI components support dark mode
- [ ] All new UI mobile-ready (375px viewport)
- [ ] Zero TypeScript errors
- [ ] No breaking changes to existing flows
