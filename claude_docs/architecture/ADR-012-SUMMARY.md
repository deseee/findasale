# ADR-012 Executive Summary: Holds-to-Cart + Invoice Flow

## What You Asked For

Pull shopper's held items → POS cart → add more items → charge partial cash + invoice remainder

## What I Decided

### Architecture
- **Pull holds into cart** with new endpoint `POST /api/pos/sessions/:sessionId/pull-holds`
  - Holds enter `HOLD_IN_CART` status during the session (prevents double-booking)
  - Non-held items can be mixed into the same cart (upsells, special requests)

- **Create invoice from cart** with new endpoint `POST /api/pos/sessions/:sessionId/create-invoice`
  - Accepts optional `cashAmountCents` for split payment (e.g., shopper gives $15 cash, bill $35 to card)
  - Creates Stripe Checkout Session (same as your existing `markSoldAndCreateInvoice`)
  - Sends invoice link via email to shopper
  - All items bundled into one invoice

- **Keep invoices separate from QR payment links**
  - Invoices are async (email, shopper completes payment later)
  - QR links are sync (immediate self-checkout on device)
  - No reason to unify them; both already work via Stripe

### Schema Changes
Three new fields on `HoldInvoice`:
- `cashAmountCents?: int` — amount organizer collected in cash
- `cardAmountCents?: int` — amount to charge card (total - cash)
- `cartSessionId?: string` — links to the POS session (audit trail)

One new hold status:
- `HOLD_IN_CART` — hold is pulled into an active POS session

Both are backward compatible (existing invoices unaffected).

### Deduplication
**Remove** `POST /api/pos/holds/:reservationId/invoice` endpoint (`sendHoldInvoice`).
- It was incomplete MVP (created invoice but no Stripe session)
- Your existing `POST /api/reservations/:id/mark-sold` already does it correctly
- New POS cart endpoint unifies the pattern

### Fee Calculation (Split Payment)
Platform fee applies **only to the card amount**, not the cash amount.

Example:
- Total: $50
- Organizer collected $15 cash
- Card amount: $35
- Platform fee (10% of $35): $3.50
- Organizer nets: $15 (cash) + $31.50 (card - fee) = $46.50

Stripe fees also apply only to the card amount.

---

## What Needs Your Input

### 1. Cash Reconciliation
How should cash be handled?
- **Recommended:** Organizer records cash in POS, notes it on invoice. No integration with Stripe/bank (simplest).
- **Alternative:** Organizer photographs receipt or provides note for audit (more compliance).
- **Complex:** FindA.Sale deposits cash to organizer's bank later (not recommended — operational burden).

### 2. Hold Auto-Expiry on Abandoned Session
If organizer pulls a hold into a cart but then closes the browser (doesn't create invoice):
- **Recommended:** Hold reverts to `PENDING` after 2 hours (session expiry). Shopper can retry.
- **Alternative:** Hold is locked to organizer until organizer cancels it.
- **Alternative:** Hold is released entirely (shopper starts fresh).

### 3. Non-Held Item Reservation During Invoice
If organizer adds a non-held item to a cart with held items, should that non-held item be softly reserved during the 2-hour invoice window?
- **Recommended:** Yes. Treat the entire invoice as atomic — if not paid by expiry, all items revert to available.
- **Alternative:** No. Non-held items stay available for other shoppers (could oversell).

---

## Timeline to Implement

- **Schema + Migration:** 1 hour
- **Backend (3 endpoints + webhook):** 4–5 hours
- **Frontend (cart UI + invoice display):** 3–4 hours
- **QA (dark mode, mobile, all scenarios):** 2–3 hours

**Total estimate:** 10–13 hours of dev time.

---

## What Stays the Same

- `markSoldAndCreateInvoice` endpoint — no changes (continues to work)
- `POSPaymentLink` (QR code checkout) — unchanged
- Existing invoices and holds — no breaking changes
- Dark mode + mobile compliance — enforced in new frontend code

---

## Full Technical Spec

See `ADR-holds-to-cart-invoice.md` for:
- Detailed API contracts (request/response schemas)
- Complete migration SQL
- 10-step dev instructions (ordered)
- Risk mitigation table
- Success criteria

