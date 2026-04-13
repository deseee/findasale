# Payment Edge-Case QA — 2026-03-09

## Summary
- **Pass**: 8 cases
- **Fail**: 4 critical issues
- **Needs-Review**: 3 cases
- **Not-Found**: 2 cases

---

## Results by Category

### Price Edge Cases

| Edge Case | Status | Code Location | Notes |
|-----------|--------|---------------|-------|
| $0.00 item purchase | ✅ PASS | `stripeController.ts:201-203` | Rejected: `price <= 0` guard enforces minimum price. Returns 400 with message "Invalid price value" |
| $0.50 (Stripe minimum) | ✅ PASS | `stripeController.ts:206-208` | Accepted. Code explicitly checks `price < 0.5` and rejects below threshold. Exact minimum allowed. |
| Decimal precision ($9.99 → 999 cents) | ✅ PASS | `stripeController.ts:219` | Correctly converted: `Math.round((price + shippingCost) * 100)` handles float rounding properly. |
| Negative price via malicious POST | ❌ FAIL | `stripeController.ts:195-199` | **CRITICAL**: Item prices fetched from DB, but no validation prevents DB-level negative price storage. Frontend may prevent UI entry, but POST body not re-validated. If item.price is negative in DB, it could bypass the `price <= 0` check if parsing fails. |
| Very large amount ($99,999+) | ⚠️ NEEDS-REVIEW | `stripeController.ts:219` | No explicit integer overflow protection. Stripe API has a hard limit (~$999,999 USD), but code doesn't validate. `Math.round()` returns JavaScript number (safe up to 2^53-1). Risk is low but should be documented. |
| Discount reduces price below $0.50 | ✅ PASS | `stripeController.ts:231, 237` | Capped at `priceCents - 50`: ensures final amount never drops below Stripe minimum. |

---

### Flow Edge Cases

| Edge Case | Status | Code Location | Notes |
|-----------|--------|---------------|-------|
| Double-submit (buy button clicked twice) | ✅ PASS | `stripeController.ts:244-245` | Idempotency key includes `itemId` + `userId` + coupon suffix. Stripe API ensures only one PI created per key. Subsequent requests return existing PI. No double-charge risk. |
| Concurrent purchase (two buyers, one item) | ✅ PASS | `stripeController.ts:369-394` | **CA3 guard implemented**. On `payment_intent.succeeded`, code checks if item already SOLD. If yes, refund silently and mark purchase REFUNDED. Race condition resolved correctly. |
| Refund after payout issued | ⚠️ NEEDS-REVIEW | `payoutController.ts`, `stripeController.ts:527-571` | **Issue**: Refund endpoint (`createRefund`) does not check payout status. If organizer has already received funds, refunding still reverses the charge but may not automatically reverse the payout. Stripe handles this at account level, but app doesn't warn organizer of the liability. Recommend adding payout status check or warning dialog. |
| Chargeback webhook (`charge.dispute.created`) | ❌ FAIL | `stripeController.ts:326-475` (webhook handler) | **CRITICAL**: Webhook handler does NOT process `charge.dispute.created` or any chargeback events. Only handles `payment_intent.succeeded` and `payment_intent.payment_failed`. Disputes will not be synced to Purchase model. E2E test explicitly flags this at line 14-16. |
| Failed webhook (3x retry exhausted) | ❌ FAIL | `stripeController.ts:308-324` | **CRITICAL**: No webhook retry logic or dead-letter queue. If webhook signature verification fails (line 320), request returns 400 immediately. Stripe will retry automatically (5 attempts over ~36 hours), but if all fail, order status remains PENDING indefinitely. No alerting or recovery mechanism in app. |
| Session expiry mid-checkout | ✅ PASS | `stripeController.ts:150-154` | `authenticate` middleware enforces auth on all payment endpoints. If JWT expires mid-checkout, next request returns 401. Checkout session can be resumed via `/pending-payment/:purchaseId` endpoint (line 478-524). |

---

### Auth Edge Cases

| Edge Case | Status | Code Location | Notes |
|-----------|--------|---------------|-------|
| Buyer purchases their own item | ➖ NOT-FOUND | `stripeController.ts:150-305` | **CRITICAL GAP**: `createPaymentIntent` does not verify that `req.user.id !== item.sale.organizer.userId`. An organizer can purchase their own items at no cost to themselves (organizer is paid in full, buyer pays, no net loss to platform). This is likely intentional (testing, seeding), but undocumented. Recommend explicit check or documented rationale. |
| Missing auth on refund endpoint | ✅ PASS | `stripeController.ts:527-530` | `authenticate` middleware required. Role check ensures ORGANIZER or ADMIN. Organizer can only refund their own sales (line 546-548). Authorization is correct. |
| Missing auth on webhook endpoint | ✅ PASS | `stripe.ts:33` | Webhook endpoint is **intentionally public** (no `authenticate` middleware). Signature verification via `constructEvent` (line 320) is the only auth. This is standard Stripe practice. ✓ Correct. |

---

## P0 Blockers (must fix before beta)

### 1. Chargeback/Dispute Events Not Handled
**Severity**: CRITICAL
**Location**: `controllers/stripeController.ts:326-475`
**Issue**: The webhook handler ignores `charge.dispute.created`, `charge.dispute.updated`, and `charge.dispute.closed` events. If a buyer initiates a chargeback with their bank, the app has no visibility.
**Impact**: Organizer's balance may be reversed by Stripe without app knowing. Purchase record remains incorrectly marked PAID.
**Recommendation**:
- Add handler for `charge.dispute.created` → mark Purchase as DISPUTED
- Add handler for `charge.dispute.won` → keep Purchase as PAID
- Add handler for `charge.dispute.lost` → revert Purchase to REFUNDED + mark Item as AVAILABLE
- Send notification to organizer when dispute opened

### 2. Webhook Failure (All Retries Exhausted)
**Severity**: CRITICAL
**Location**: `controllers/stripeController.ts:308-324`
**Issue**: If webhook signature verification or database transaction fails 5 times (Stripe's limit), order status remains PENDING indefinitely. No alerting or recovery.
**Impact**: Buyer paid, organizer gets money, but app thinks transaction is pending. Inventory never marked SOLD.
**Recommendation**:
- Log all webhook errors with full request/response to a DLQ table (`WebhookFailure`)
- Implement a recovery job that periodically syncs PI status from Stripe API
- Send alert to admin dashboard if webhook fails >1 time for same PI

### 3. Negative Price Can Be Stored in DB
**Severity**: HIGH
**Location**: `packages/database/prisma/schema.prisma:164`, `stripeController.ts:195-199`
**Issue**: Item.price field is a Float with no check constraint. A malicious organizer (or DB corruption) could set `price: -100`. The payment creation code checks `price <= 0`, but only if data reads correctly from DB.
**Impact**: If negative price somehow reaches PI creation, subtraction logic breaks.
**Recommendation**:
- Add Prisma `@db.Decimal` with precision constraint or add check in itemController on item price updates
- Document: Item prices must be validated as `>= 0` on write, not just read

### 4. Buyer Can Purchase Own Items (Silent Logic Gap)
**Severity**: MEDIUM
**Location**: `controllers/stripeController.ts:150-305`
**Issue**: No validation that `req.user.id !== item.sale.organizer.userId`. Organizer can buy their own items: they pay $X via Stripe, $Y (fee-adjusted) is transferred to them. Net effect: organizer paid to list their own item.
**Impact**: Unintended flow; encourages test purchases on production (or price inflation exploits).
**Recommendation**:
- Add explicit check: `if (req.user.id === item.sale.organizer.userId) return 400 "Cannot purchase your own item"`
- Or document as intentional + enforce in frontend

---

## P1 Issues (fix within first week of beta)

### 1. Refund Doesn't Check Payout Status
**Severity**: MEDIUM
**Location**: `controllers/stripeController.ts:527-571`
**Issue**: `createRefund` issues refund via Stripe but doesn't validate whether the payout has already landed in organizer's bank. If refunded after payout, Stripe reverses the charge, but payout money stays with organizer. Organizer is liable.
**Recommendation**:
- Query Stripe balance history before issuing refund
- If payout already sent, warn organizer they will be charged back by Stripe
- Add `refundedAfterPayout` flag to Purchase model to track this edge case

### 2. Unhandled Stripe Webhook Events
**Severity**: MEDIUM
**Location**: `controllers/stripeController.ts:470-472`
**Issue**: Events like `transfer.created` (payout confirmation), `account.updated` (organizer deauth), `charge.refunded` (Stripe-initiated refund) are logged but ignored.
**Recommendation**:
- Implement `transfer.created` → log to `PayoutAudit` table for organizer invoice generation
- Implement `account.updated` with `charges_enabled=false` → disable item listing for that organizer
- Implement `charge.refunded` → sync Purchase status if refund is Stripe-initiated

### 3. No Max Amount Validation
**Severity**: LOW
**Location**: `controllers/stripeController.ts:219`
**Issue**: Stripe max is ~$999,999 USD, but code doesn't validate. Very large items (e.g., `$1,000,000`) will fail silently at Stripe API layer.
**Recommendation**:
- Add explicit check: `if (finalPriceCents > 99999900) return 400 "Amount exceeds $999,999 limit"`
- Document Stripe limits in purchase flow comments

---

## Not-Found Cases

| Edge Case | Status | Code Location | Notes |
|-----------|--------|---------------|-------|
| Price manipulation via query string tampering | ➖ NOT-FOUND | `stripeController.ts:162-175` | Frontend constructs POST body with `itemId`. Item price is fetched server-side (not from client). Cannot be manipulated. ✓ Safe. |
| Concurrent refund (two admins refund same purchase simultaneously) | ➖ NOT-FOUND | `stripeController.ts:527-571` | Stripe refund API is idempotent. Second refund returns same refund ID. No double-refund risk. Database constraint `stripePaymentIntentId UNIQUE` ensures only one purchase per PI. ✓ Safe. |

---

## Code Quality Notes

### Strengths
- Idempotency keys implemented correctly (line 244-245)
- Concurrent purchase race condition handled (CA3 guard, line 369-394)
- Coupon discount capped correctly (line 231, 237)
- Auth middleware enforced on all payment endpoints
- Stripe Connect separation of concerns (transfer_data, on_behalf_of)

### Weaknesses
- No dead-letter queue for failed webhooks
- Dispute events completely unhandled
- Negative price not prevented at schema level
- No payout status check before refund
- Self-purchase not explicitly rejected
- Max amount limit not documented or enforced

---

## Testing Recommendations Before Beta

### Manual Tests (Staging, Test Cards)
1. Test card `4242 4242 4242 4242` (succeeds) → confirm PI created, Purchase PENDING
2. Webhook success → confirm Purchase marked PAID, Item marked SOLD, receipt email sent
3. Stripe dashboard: confirm platform fee captured, organizer receives net payout
4. Test card `4000 0000 0000 0002` (declined) → confirm PI fails, Purchase marked FAILED
5. Simulate concurrent purchase: two browsers, buy same item simultaneously
6. Issue refund after payment → confirm Purchase marked REFUNDED, Item marked AVAILABLE
7. Coupon valid + discount applied correctly
8. Coupon expired → rejected at payment creation (line 227)

### Integration Tests Needed
1. Webhook retry loop (simulate network failure, verify Stripe retries)
2. Dispute webhook received (add to test suite)
3. Payout created webhook → sync to audit log
4. Account deauth webhook → disable organizer

### Code Review Checklist
- [ ] Confirm idempotency key strategy is unique per itemId+userId+couponId
- [ ] Confirm fee structure is read from DB at transaction time (not cached)
- [ ] Confirm Stripe Connect account verification happens before payment (not after)
- [ ] Confirm all error paths log to monitoring service (Sentry/similar)
- [ ] Confirm webhook signature validation is cryptographically correct

---

## Audit Date
**2026-03-09** | Code version: Main branch, latest commit
**Auditor**: QA Lead | **Scope**: Payment flow edge cases only

