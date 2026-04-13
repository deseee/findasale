# Cash Platform Fee Collection — Architecture Decision Document

**Date:** 2026-03-12
**Status:** Ready for findasale-dev dispatch
**Business Rule:** 10% platform fee applies to ALL cash POS transactions. Collection method: accumulate as organizer balance, deduct from next Stripe payout.

---

## 1. Schema Changes

### 1.1 Add Field to Organizer Model

```prisma
model Organizer {
  // ... existing fields ...

  // Cash POS: accumulated platform fees awaiting payout deduction
  cashFeeBalance        Float        @default(0.0)    // Dollars, not cents
  cashFeeBalanceUpdatedAt DateTime?  // Track last accumulation time for 30-day guardrail
}
```

**Rationale:** Single `Float` on Organizer avoids schema bloat and mirrors how we track `organizerCredits`. Timestamp enables 30-day guardrail checks without additional queries.

### 1.2 No Purchase Schema Changes

The `Purchase.platformFeeAmount` field already exists and is set for cash sales. Cash PIs are created with `stripePaymentIntentId = 'cash_${uuid}'` (line 533 in terminalController.ts). No new fields needed.

---

## 2. Fee Accumulation Flow

### 2.1 Where It Happens: `POST /api/stripe/terminal/cash-payment`

In `packages/backend/src/controllers/terminalController.ts`, after line 559 (items marked SOLD), add:

```typescript
// Accumulate platform fee to organizer's cash fee balance
const totalPlatformFees = items.reduce((sum, item) => {
  const itemAmountCents = Math.round(item.amount * 100);
  return sum + Math.round(itemAmountCents * feeRate);
}, 0);

const totalPlatformFeeDollars = totalPlatformFees / 100;

await prisma.organizer.update({
  where: { id: organizer.id },
  data: {
    cashFeeBalance: { increment: totalPlatformFeeDollars },
    cashFeeBalanceUpdatedAt: new Date(),
  },
});
```

**Location:** After item SOLD updates, before receipt email send (around line 560).
**Idempotency:** If the endpoint is called twice with the same PI, the Purchase records will already exist as PAID. Check `purchases.length` > 0 and `purchases[0].status === 'PAID'` to return early without re-incrementing balance (existing code already does this check at line 290).

---

## 3. Payout Deduction Mechanism

### 3.1 Modified `POST /api/stripe/payout` (createPayout in payoutController.ts)

When organizer requests a payout, deduct accumulated cash fees first:

```typescript
export const createPayout = async (req: AuthRequest, res: Response) => {
  try {
    // ... existing auth + validation ...

    const connectId = await getOrganizerStripeId(req.user.id);
    // ... existing checks ...

    const { amount, method = 'standard' } = req.body;
    // ... existing validation ...

    // NEW: Fetch organizer cash fee balance
    const organizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id },
      select: { cashFeeBalance: true, cashFeeBalanceUpdatedAt: true },
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer not found' });
    }

    // Check 30-day guardrail: if balance > 0 and > 30 days old, warn but allow
    let guardrailWarning: string | null = null;
    if (organizer.cashFeeBalance > 0 && organizer.cashFeeBalanceUpdatedAt) {
      const daysSinceUpdate = (Date.now() - organizer.cashFeeBalanceUpdatedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceUpdate > 30) {
        guardrailWarning = `Your cash fee balance of $${organizer.cashFeeBalance.toFixed(2)} has been pending for ${Math.floor(daysSinceUpdate)} days.`;
      }
    }

    // Deduct cash fee balance from payout amount
    const payoutAmount = amount - organizer.cashFeeBalance;

    if (payoutAmount < 0.50) {
      // Payout is less than Stripe minimum after deducting fees
      return res.status(400).json({
        message: `Cash fees ($${organizer.cashFeeBalance.toFixed(2)}) exceed payout amount. Available balance after deduction: $${Math.max(0, payoutAmount).toFixed(2)}.`,
        cashFeeDeduction: organizer.cashFeeBalance,
        originalAmount: amount,
      });
    }

    const stripe = getStripe();
    const payout = await stripe.payouts.create(
      {
        amount: Math.round(payoutAmount * 100), // Only payout the net amount
        currency: 'usd',
        method: method as 'standard' | 'instant',
        statement_descriptor: 'FindA.Sale Payout',
      },
      { stripeAccount: connectId }
    );

    // Clear the cash fee balance after successful payout
    await prisma.organizer.update({
      where: { userId: req.user.id },
      data: {
        cashFeeBalance: 0,
        cashFeeBalanceUpdatedAt: new Date(),
      },
    });

    res.json({
      id: payout.id,
      amount: payout.amount / 100,
      method: payout.method,
      status: payout.status,
      arrivalDate: payout.arrival_date
        ? new Date(payout.arrival_date * 1000).toISOString()
        : null,
      ...(guardrailWarning && { guardrailWarning }),
      cashFeeDeducted: organizer.cashFeeBalance, // Inform frontend what was deducted
    });
  } catch (error: any) {
    // ... existing error handling ...
  }
};
```

**Key Points:**
- Deduction happens BEFORE calling `stripe.payouts.create()` — only the net amount is sent to Stripe.
- After successful Stripe payout, reset `cashFeeBalance = 0` and update the timestamp.
- 30-day guardrail check runs silently (returns warning in response, allows payout to proceed). If balance is older than 30 days, organizer still sees a warning card on the dashboard.
- If deducting fees would drop the payout below $0.50 (Stripe minimum), reject with helpful error.

---

## 4. Refund Behavior

When an organizer issues a refund for a PAID cash purchase (via `POST /api/stripe/refund/{purchaseId}`):

- The cash fee was already accumulated into `Organizer.cashFeeBalance`.
- If a cash purchase is refunded, do NOT deduct the fee from the balance (no API call needed). Fee stays in balance; organizer keeps it as compensation for processing the return.
- Stripe refund handler does not apply here — cash PIs use `cash_${uuid}` placeholder, not real Stripe PIDs.

**Rationale:** Simplifies accounting. In practice, POS refunds are rare (in-person refunds given immediately). The accumulated balance covers volatility.

---

## 5. 30-Day Guardrail

### 5.1 UI Warning

Dashboard should display a card if `cashFeeBalance > 0 && daysSinceUpdate > 30`:

```
⚠️ Pending Cash Fees (30+ days)
You have $X.XX in unresolved platform fees from cash sales.
Request a payout to settle these fees.
[Request Payout Button]
```

### 5.2 Email Notification (Optional, Future)

When accumulated balance hits 30 days old, send organizer a reminder email. For now, the dashboard card is sufficient.

### 5.3 Hard Stop After 90 Days (Future)

If balance remains unpaid after 90 days, prevent new cash sales with an error message: "Resolve pending cash fees before accepting new cash payments."

---

## 6. UI Requirements

### 6.1 POS Completion Screen (`/organizer/pos`)

After cash transaction completes, display:

```
✓ Sale Completed
Items Sold: [list]
Total Collected: $X.XX
Platform Fee (10%): -$X.XX  ← Show the deduction
Organizer Receives: $X.XX

Your accumulated cash fees: $X.XX (will be deducted from next payout)
```

### 6.2 Organizer Dashboard

Add a card to the earnings section:

```
Cash Platform Fees
Accumulated balance: $X.XX
Updated: X days ago

[View Transactions] [Request Payout]
```

If balance > 0 and > 30 days old, highlight in yellow/warning color.

### 6.3 Payout Request Modal

Before submitting a payout request, show:

```
Available Balance: $X.XX
Pending Cash Fees: -$X.XX
Net Payout: $X.XX

These fees accumulated from cash sales and will be deducted automatically.
```

If payout would be < $0.50 after deduction, disable the submit button with an explanation.

---

## 7. Migration File

### 7.1 Name

```
20260312_add_cash_fee_balance_to_organizer.sql
```

### 7.2 Content

```sql
-- Add cash fee tracking to Organizer
ALTER TABLE "Organizer" ADD COLUMN "cashFeeBalance" DOUBLE PRECISION NOT NULL DEFAULT 0.0;
ALTER TABLE "Organizer" ADD COLUMN "cashFeeBalanceUpdatedAt" TIMESTAMP(3);

-- Create index for guardrail queries
CREATE INDEX "idx_Organizer_cashFeeBalance_updatedAt"
  ON "Organizer"("cashFeeBalance", "cashFeeBalanceUpdatedAt");
```

---

## 8. Implementation Order

1. **Database:** Run migration (Prisma migrate deploy) to add fields to Organizer.
2. **Backend:**
   - Update `cashPayment()` in terminalController.ts to accumulate fees.
   - Update `createPayout()` in payoutController.ts to deduct and reset balance.
   - Add `GET /api/stripe/cash-fees` endpoint to return `{ balance, updatedAt }` for dashboard.
3. **Frontend:**
   - Add "Cash Fees" card to organizer dashboard (displays balance, age, warning if > 30 days).
   - Update POS completion screen to show fee line item and accumulated balance note.
   - Update payout request modal to show deduction and net payout.

---

## 9. Testing Scenarios

1. **Happy path:** Organizer takes 2 cash sales ($100 each, $10 fee each). Requests $180 payout. Receives $160 (net after $20 fee deduction). `cashFeeBalance` reset to 0.
2. **Insufficient balance after deduction:** Organizer requests $15 payout but has $20 in fees. Error: "Fees exceed payout amount."
3. **Refund on cash:** Sale refunded (organizer gives cash back). Fee remains in balance (not deducted).
4. **30-day warning:** Create a test organizer with cashFeeBalance = $5 and cashFeeBalanceUpdatedAt = 31 days ago. Dashboard shows warning.
5. **Idempotency:** Call cash-payment endpoint twice with same payload. Only first call increments balance.

---

## 10. Notes for findasale-dev

- **No Stripe API calls** needed for cash fee collection — balance is local DB tracking only.
- **Payout deduction is automatic** — organizer doesn't manually enter a "fees to pay" field.
- **Minimal schema expansion** — just 2 fields on Organizer, 1 index.
- **Leverage existing Purchase records** — no new table needed; `platformFeeAmount` already set in cash-payment flow.
- **30-day guardrail is advisory** — warn but don't block (yet). Full enforcement (90-day hard stop) is a future phase.

---

**Ready for dispatch to findasale-dev. No architectural blockers. Start with schema migration, then cashPayment() accumulation, then payout deduction.**
