# Cash Platform Fee Collection — Quick Reference

**Business Rule:** 10% platform fee applies to all cash POS transactions. Fees accumulate on organizer account and are deducted from the next Stripe payout.

## Schema (2 fields added to Organizer)

```prisma
cashFeeBalance        Float        @default(0.0)    // Accumulated fees in dollars
cashFeeBalanceUpdatedAt DateTime?  // Last update timestamp (for 30-day guardrail)
```

## Code Changes (3 locations)

### 1. terminalController.ts — `cashPayment()` (after line 559)

Add after items marked SOLD:

```typescript
const totalPlatformFees = items.reduce((sum, item) => {
  const itemAmountCents = Math.round(item.amount * 100);
  return sum + Math.round(itemAmountCents * feeRate);
}, 0);

await prisma.organizer.update({
  where: { id: organizer.id },
  data: {
    cashFeeBalance: { increment: totalPlatformFees / 100 },
    cashFeeBalanceUpdatedAt: new Date(),
  },
});
```

### 2. payoutController.ts — `createPayout()` (beginning)

Before `stripe.payouts.create()`:

```typescript
const organizer = await prisma.organizer.findUnique({
  where: { userId: req.user.id },
  select: { cashFeeBalance: true, cashFeeBalanceUpdatedAt: true },
});

const payoutAmount = amount - organizer.cashFeeBalance;

if (payoutAmount < 0.50) {
  return res.status(400).json({
    message: `Fees ($${organizer.cashFeeBalance.toFixed(2)}) exceed payout amount.`,
  });
}

// ... call stripe.payouts.create with payoutAmount ...

// After successful payout:
await prisma.organizer.update({
  where: { userId: req.user.id },
  data: { cashFeeBalance: 0, cashFeeBalanceUpdatedAt: new Date() },
});
```

### 3. New Endpoint: `GET /api/stripe/cash-fees`

Returns `{ balance: Float, updatedAt: DateTime }` for dashboard display.

## UI Changes (3 locations)

1. **POS Completion Screen:** Show fee line item and "Your accumulated cash fees: $X.XX"
2. **Organizer Dashboard:** "Cash Platform Fees" card showing balance, age, warning if > 30 days
3. **Payout Modal:** Show deduction + net payout amount before submit

## Migration

File: `20260312_add_cash_fee_balance_to_organizer.sql`

```sql
ALTER TABLE "Organizer" ADD COLUMN "cashFeeBalance" DOUBLE PRECISION NOT NULL DEFAULT 0.0;
ALTER TABLE "Organizer" ADD COLUMN "cashFeeBalanceUpdatedAt" TIMESTAMP(3);
CREATE INDEX "idx_Organizer_cashFeeBalance_updatedAt" ON "Organizer"("cashFeeBalance", "cashFeeBalanceUpdatedAt");
```

## Key Behaviors

- **Accumulation:** Happens immediately when cash sale completes (in memory + DB).
- **Payout Deduction:** Automatic, no organizer choice. Deducts before Stripe call.
- **Refunds:** Fee is NOT refunded if cash purchase is refunded (organizer keeps it).
- **30-Day Guardrail:** Advisory warning only. Hard stop at 90 days is future phase.
- **Idempotency:** If cash-payment called twice, only first increments balance (Purchase already PAID check prevents double-accumulation).

## Test Cases

1. Two $100 cash sales ($10 fee each) → $180 payout request → Receives $160, fees deducted. ✓
2. $15 payout requested but $20 in fees → Error (payout would be negative). ✓
3. 31-day-old balance → Dashboard shows warning but payout still allowed. ✓
4. Cash sale refunded → Fee stays in balance. ✓

---

**Status:** Ready for dev. No Stripe API calls or major refactors. Minimal schema. Leverage existing terminalController + payoutController structure.
