/**
 * PosManualCard — Manual Card Entry for Card-Not-Present Payments
 *
 * Allows organizer to enter shopper's card details directly (no card reader needed).
 *
 * SQUARE REBUILD (2026-09-12, Stripe removal): this component's non-setup-intent branch
 * (register-entered manual card sales, reached from pos.tsx's "No reader? Enter card
 * manually" button) used to POST to /stripe/terminal/manual-card-payment-intent -- a
 * route that was NEVER registered server-side (confirmed via repo-wide grep this
 * session, see pos.tsx's ENABLE_MANUAL_CARD_ENTRY history) and could never have
 * worked. It is rewritten here to use Square's Web Payments SDK for card tokenization
 * (via SquarePaymentRequestForm.tsx, the SAME component the "Send to Phone" QR flow
 * already uses -- not reimplemented) and POSTs the resulting one-time card token
 * (sourceId) to the real POST /pos/manual-card-payment endpoint
 * (posPaymentController.ts's manualCardPayment), which creates and captures the
 * actual Square charge -- see that function's own header comment for the full design
 * (no persisted POSPaymentRequest row exists for this walk-up, no-shopper-account
 * flow, unlike the QR/phone rail).
 *
 * (The former Stripe setup-intent mode, used by the retired venue QR phone page, was
 * removed 2026-09-30 along with the Stripe client packages.)
 *
 * States: idle (form), processing (charging), success (receipt), error (decline message)
 */

import { useState } from 'react';
import api from '../lib/api';
import SquarePaymentRequestForm from './SquarePaymentRequestForm';

interface PosManualCardProps {
  cartTotal: number;
  cart: Array<{ itemId?: string; title: string; amount: number; bulkQuantity?: number }>; // bulkQuantity: cards on a bulk lot line (ADR-136); the server prices the line
  selectedSaleId: string;
  buyerEmail: string;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
  // Square rebuild (2026-09-12): the organizer's connected Square location, needed by
  // SquarePaymentRequestForm to initialize the Web Payments SDK for a register-entered
  // card.
  squareLocationId?: string | null;
  // POS Cashier Discount Permission parity (2026-08-28 feature, wired into this flow
  // for the first time in this rebuild -- the dead Stripe version never accepted these
  // at all, silently ignoring any discount applied in the POS discount panel even
  // though that panel renders regardless of payment mode). Optional/no-op when omitted
  // or discountAmount is 0/undefined, same convention every sibling payment mode
  // (cash/QR/split-tender) in pos.tsx already follows.
  discountAmount?: number;
  discountType?: 'PERCENT' | 'FIXED';
  discountValue?: number;
  discountReasonNote?: string;
  // ── Split tender (2026-09-29, P1 double-collect fix) ──────────────────────────────────────
  // Whole cents the cashier already collected in cash for THIS cart. When > 0 the card is charged
  // only the remainder (cart total - cash), never the full cart on top of the cash already taken;
  // the amount is sent to the server, which records the cash leg the same way the Send-to-Phone
  // split does. 0 / omitted = an ordinary all-card sale.
  cashAmountCents?: number;
  // Cash >= cart total: that is a cash sale. The card form is blocked and the cashier is pointed
  // to the cash flow instead of being allowed to charge a card for a sale already paid in cash.
  cashCoversTotal?: boolean;
  // Register fee quote + card floor from /pos/context (used only to explain why a too-small card
  // amount is blocked before the shopper's card is ever tokenized; the server re-checks).
  platformFee?: { inPersonRate: number; minimumFeeCents: number; referralDiscountActive: boolean } | null;
  minCardChargeCents?: number;
  onUseCash?: () => void;
  onClearCash?: () => void;
}

type ManualCardState = 'idle' | 'processing' | 'success' | 'error';

// ── CNP FEE (register-entered / manually-keyed card) DISPLAY ESTIMATE ──────────────────
// PLACEHOLDER, NOT INDEPENDENTLY VERIFIED (2026-09-12). This is a DISPLAY-ONLY estimate
// shown before the charge is sent; the AUTHORITATIVE fee actually charged is computed
// server-side using the SAME placeholder constants, defined and cited in full in
// posPaymentController.ts's manualCardPayment (search CNP_FEE_RATE_PLACEHOLDER there for
// the full citation and why this is flagged rather than a confirmed number). Keep these
// two numbers in sync with that file if either changes -- there is no shared POS-fee
// constants module today, so this is a deliberate, commented duplication rather than a
// new cross-package import for two numbers.
// 2026-09-29: synced to the server's CONFIRMED keyed-in rate (posPaymentController.ts
// CNP_FEE_RATE_PLACEHOLDER / CNP_FEE_FIXED_CENTS_PLACEHOLDER = 3.5% + 15 cents, live-verified
// against Square's own published schedule 2026-09-18). This file still held the older 2.9% + $0.30
// figure, so the amount shown on the pay button understated the real charge. The button label must
// equal the amount actually charged, so the estimate now uses the same formula the server does,
// in whole cents: round(card amount x 3.5%) + 15.
const CNP_FEE_RATE_ESTIMATE = 0.035;
const CNP_FEE_FIXED_DOLLARS_ESTIMATE = 0.15;
const CNP_FEE_FIXED_CENTS_ESTIMATE = 15;
// Square refuses a payment whose application fee is (nearly) the whole charge; mirrors
// cashFeeService.MAX_APP_FEE_SHARE_OF_CARD_LEG on the backend, which re-checks authoritatively.
const MAX_APP_FEE_SHARE_OF_CHARGE = 0.9;

interface ManualCardPaymentResponse {
  success: boolean;
  purchaseIds?: string[];
  squarePaymentId?: string;
  subtotalCents?: number;
  cnpFeeCents?: number;
  totalChargedCents?: number;
  processing?: boolean;
  message?: string;
}

// Not every failure here is an actual card decline -- posPaymentController.ts's
// manualCardPayment can also fail before ever reaching Square (e.g. a database error
// after the charge already captured, see the 2026-09-13 Eagles-album incident: Square
// approved the card, but the post-capture DB check crashed with a bare 500 whose
// message was literally "Internal server error", which this component used to relabel
// "Card Was Declined" -- telling the cashier the customer's card was bad when it
// wasn't, while the money had already been taken). Only show the decline headline when
// the message actually reads like one; anything else (a generic/server error, a
// network failure, a timeout) gets a neutral headline so the cashier isn't told
// something false about the customer's card.
function isActualCardDecline(message: string): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  const declineSignals = [
    'declin',
    'insufficient funds',
    'do not honor',
    'card_declined',
    'expired card',
    'invalid card',
    'invalid_expiration',
    'incorrect cvv',
    'incorrect_cvv',
    'card_not_supported',
    'transaction_limit',
    'generic_decline',
  ];
  return declineSignals.some((signal) => m.includes(signal));
}

export default function PosManualCard({
  cartTotal,
  cart,
  selectedSaleId,
  buyerEmail,
  onSuccess,
  onError,
  squareLocationId,
  discountAmount,
  discountType,
  discountValue,
  discountReasonNote,
  cashAmountCents,
  cashCoversTotal,
  platformFee,
  minCardChargeCents,
  onUseCash,
  onClearCash,
}: PosManualCardProps) {
  const [state, setState] = useState<ManualCardState>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const feeEstimate = cartTotal * CNP_FEE_RATE_ESTIMATE + CNP_FEE_FIXED_DOLLARS_ESTIMATE;
  const [totalWithFee, setTotalWithFee] = useState<number>(cartTotal + feeEstimate);
  const [cnpFeeAmount, setCnpFeeAmount] = useState<number>(feeEstimate);

  // Derived, whole-cent view of what THIS charge will be (recomputed every render, so it can never
  // go stale the way the mount-time state above would if the cart or cash changed): card amount =
  // cart total - cash already collected, then the server's keyed-in surcharge on top of that.
  // totalWithFee/cnpFeeAmount above are now only the post-charge actuals shown on the success screen.
  const cartTotalCents = Math.round(cartTotal * 100);
  const splitCashCents = cashAmountCents && cashAmountCents > 0 ? cashAmountCents : 0;
  const cardSubtotalCents = Math.max(0, cartTotalCents - splitCashCents);
  const chargeFeeCents = Math.round(cardSubtotalCents * CNP_FEE_RATE_ESTIMATE) + CNP_FEE_FIXED_CENTS_ESTIMATE;
  const chargeCents = cardSubtotalCents + chargeFeeCents;
  const platformFeeCents = platformFee
    ? platformFee.referralDiscountActive
      ? 0
      : Math.max(Math.round(cardSubtotalCents * platformFee.inPersonRate), platformFee.minimumFeeCents)
    : null;
  const minChargeCents = minCardChargeCents ?? 50;
  let blockedReason: string | null = null;
  {
    const way = splitCashCents > 0
      ? 'Collect more of this sale in cash, or take the whole sale in cash.'
      : 'Take this sale in cash instead.';
    if (cashCoversTotal) {
      blockedReason = 'The cash received covers the whole sale, so there is nothing left to charge to a card. Record it as a cash sale.';
    } else if (chargeCents < minChargeCents) {
      blockedReason = `The card amount ($${(chargeCents / 100).toFixed(2)}) is below the $${(minChargeCents / 100).toFixed(2)} minimum a card can be charged. ${way}`;
    } else if (platformFeeCents !== null && platformFeeCents > Math.floor(chargeCents * MAX_APP_FEE_SHARE_OF_CHARGE)) {
      blockedReason = `The card amount ($${(chargeCents / 100).toFixed(2)}) is too small to cover the $${(platformFeeCents / 100).toFixed(2)} minimum platform fee. ${way}`;
    }
  }
  const [successTimestamp, setSuccessTimestamp] = useState<string>('');

  // Register-entered card flow (Square rebuild, 2026-09-12). Fired by
  // SquarePaymentRequestForm's onSuccess once the organizer's device has tokenized the
  // shopper's manually-keyed card client-side (card.tokenize() -- see that file). Posts
  // the resulting one-time sourceId to the real backend endpoint, which resolves the
  // organizer, preflights their Square account, computes the authoritative (server-
  // side) total including the CNP fee, and creates+captures the actual Square charge.
  const handleSquareSourceId = async (sourceId: string) => {
    setState('processing');
    setErrorMessage('');

    try {
      const items = cart.map((item) => ({
        ...(item.itemId ? { itemId: item.itemId } : {}),
        amount: item.amount,
        label: item.title,
        ...(item.bulkQuantity ? { quantity: item.bulkQuantity } : {}), // ADR-136: the server prices a bulk lot line from this
      }));

      const response = await api.post<ManualCardPaymentResponse>('/pos/manual-card-payment', {
        sourceId,
        saleId: selectedSaleId,
        items, // raw, undiscounted per-item amounts -- backend applies the discount itself
        ...(buyerEmail.trim() ? { buyerEmail: buyerEmail.trim() } : {}),
        // Split tender (2026-09-29): the cash already collected. The server charges the card only
        // the remainder and records the cash leg; expectedTotalCents lets it refuse the split if
        // its own total disagrees with the register's (discount-on-custom-items rounding).
        ...(splitCashCents > 0 ? { cashAmountCents: splitCashCents, expectedTotalCents: cartTotalCents } : {}),
        // POS Cashier Discount Permission parity -- see prop doc comment above.
        ...(discountAmount && discountAmount > 0
          ? {
              discountType,
              discountValue,
              ...(discountReasonNote?.trim() ? { discountReasonNote: discountReasonNote.trim() } : {}),
            }
          : {}),
      });

      if (response.data.processing) {
        // Held authorization, not yet captured by Square -- see manualCardPayment's own
        // KNOWN GAP comment (no persisted request row exists to retry against for this
        // walk-up, no-shopper-account flow, unlike the QR/phone rail's POSPaymentRequest).
        const msg = response.data.message || 'Your payment is still processing. Please check again shortly.';
        setErrorMessage(msg);
        setState('error');
        onError(msg);
        return;
      }

      const chargedTotal = (response.data.totalChargedCents ?? Math.round((cartTotal + feeEstimate) * 100)) / 100;
      const chargedFee = (response.data.cnpFeeCents ?? Math.round(feeEstimate * 100)) / 100;
      setTotalWithFee(chargedTotal);
      setCnpFeeAmount(chargedFee);

      const now = new Date();
      setSuccessTimestamp(
        now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
      );
      setState('success');
      onSuccess(
        splitCashCents > 0
          ? `Card payment of $${chargedTotal.toFixed(2)} processed. Cash received: $${(splitCashCents / 100).toFixed(2)}.`
          : `Payment of $${chargedTotal.toFixed(2)} processed successfully.`
      );
    } catch (err: any) {
      const errorMsg =
        err?.response?.data?.message ||
        (err instanceof Error ? err.message : 'An error occurred processing the payment.');
      setErrorMessage(errorMsg);
      setState('error');
      onError(errorMsg);
    }
  };

  const handleRetry = () => {
    setState('idle');
    setErrorMessage('');
  };

  // ─── Render States ────────────────────────────────────────────────────────────

  return (
    <div className="mb-4 p-4 rounded-xl bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700">
      {/* Header */}
      <h4 className="text-sm font-semibold text-warm-900 dark:text-warm-100 mb-1">
        💳 Manual Card Entry
      </h4>
      <p className="text-xs text-warm-600 dark:text-warm-400 mb-4">
        Card-not-present payment
      </p>

      {/* ═══ IDLE STATE: Form ═══ */}
      {state === 'idle' && (
        <div className="space-y-4">
          {/* CNP Fee + Dispute Warning -- only applies to the register-entered manual
              flow (higher processing fee, no dispute protection). */}
          <div className="mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700">
            <div className="flex items-start gap-2">
              <span className="text-amber-600 dark:text-amber-400 text-base mt-0.5">⚠</span>
              <div>
                <p className="text-xs font-semibold text-amber-900 dark:text-amber-200 mb-1">Manual Entry. Higher Risk</p>
                <p className="text-xs text-amber-800 dark:text-amber-300 mb-1">
                  Card-not-present fee: {(CNP_FEE_RATE_ESTIMATE * 100).toFixed(1)}% + ${CNP_FEE_FIXED_DOLLARS_ESTIMATE.toFixed(2)}
                  {' '}(Square's rate for a manually keyed card), added to the card amount and shown as its own line on the receipt. It is refunded in proportion to any refund.
                </p>
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  <strong>No dispute protection.</strong> If a shopper disputes this charge, you may lose the sale amount plus a dispute fee with no recourse.
                </p>
              </div>
            </div>
          </div>

          {(
            <>
              {/* Split tender (2026-09-29): show exactly what was already collected and that the
                  card is charged only the remainder. */}
              {splitCashCents > 0 && !cashCoversTotal && (
                <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-xs">
                  <p className="font-semibold text-emerald-800 dark:text-emerald-300">
                    Cash already collected: ${(splitCashCents / 100).toFixed(2)} of ${cartTotal.toFixed(2)}
                  </p>
                  <p className="text-emerald-700 dark:text-emerald-400 mt-0.5">
                    The card is charged only the remaining ${(cardSubtotalCents / 100).toFixed(2)}, plus the card-not-present fee.
                  </p>
                  {onClearCash && (
                    <button
                      type="button"
                      onClick={onClearCash}
                      className="mt-1 underline text-emerald-800 dark:text-emerald-300"
                    >
                      Clear the cash and charge the full amount to the card instead
                    </button>
                  )}
                </div>
              )}
              <div className="p-3 rounded-lg bg-warm-50 dark:bg-gray-700 border border-warm-200 dark:border-gray-600">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-warm-600 dark:text-warm-400">{splitCashCents > 0 ? 'Card amount' : 'Subtotal'}</p>
                    <p className="font-semibold text-warm-900 dark:text-warm-100">
                      ${(cardSubtotalCents / 100).toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-warm-600 dark:text-warm-400">Est. Total</p>
                    <p className="font-semibold text-warm-900 dark:text-warm-100">
                      ${(chargeCents / 100).toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Separator */}
          <div className="border-t border-warm-200 dark:border-gray-700"></div>

          {blockedReason ? (
            /* Blocked (2026-09-29): cash covers the sale, or the card amount is below what a card
               can be charged. The card form is not rendered at all, so a shopper's card is never
               tokenized for a charge that cannot (or must not) happen. */
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 space-y-2">
              <p className="text-xs text-amber-900 dark:text-amber-200">{blockedReason}</p>
              <div className="flex gap-2">
                {onUseCash && (
                  <button
                    type="button"
                    onClick={onUseCash}
                    className="flex-1 py-2 rounded-lg bg-sage-700 text-white text-sm font-semibold hover:bg-sage-800 transition"
                  >
                    {cashCoversTotal ? 'Record as cash sale' : 'Use cash'}
                  </button>
                )}
                {!cashCoversTotal && splitCashCents > 0 && onClearCash && (
                  <button
                    type="button"
                    onClick={onClearCash}
                    className="flex-1 py-2 rounded-lg bg-warm-200 dark:bg-gray-700 text-warm-700 dark:text-warm-300 text-sm font-semibold hover:bg-warm-300 dark:hover:bg-gray-600 transition"
                  >
                    Clear cash
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* Register-entered mode: Square Web Payments SDK card form (2026-09-12
               rebuild). SquarePaymentRequestForm owns its own card-input UI and submit
               button, tokenizing the card client-side and handing the one-time sourceId
               back via onSuccess -- see handleSquareSourceId above for what happens next. */
            <SquarePaymentRequestForm
              requestId={`manual-${selectedSaleId}`}
              totalAmountCents={chargeCents}
              squareLocationId={squareLocationId ?? null}
              onSuccess={handleSquareSourceId}
              onError={(msg) => {
                setErrorMessage(msg);
                setState('error');
                onError(msg);
              }}
            />
          )}
        </div>
      )}

      {/* ═══ PROCESSING STATE ═══ */}
      {state === 'processing' && (
        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 animate-spin text-blue-600 dark:text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <div>
                <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">Charging card…</p>
                <p className="text-xs text-blue-700 dark:text-blue-300">Do not close this screen</p>
              </div>
            </div>
          </div>
          <p className="text-center text-xs text-warm-600 dark:text-warm-400">
            Amount: ${(chargeCents / 100).toFixed(2)}
          </p>
        </div>
      )}

      {/* ═══ SUCCESS STATE ═══ */}
      {state === 'success' && (
        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700">
            <p className="text-3xl mb-2">✓</p>
            <p className="text-sm font-bold text-green-900 dark:text-green-100 mb-1">
              Payment Confirmed
            </p>
            <p className="text-xs text-green-700 dark:text-green-300">
              Card charged successfully
            </p>
          </div>

          <div className="p-3 rounded-lg bg-warm-50 dark:bg-gray-700 border border-warm-200 dark:border-gray-600 space-y-2 text-sm">
            {cnpFeeAmount > 0 ? (
              <>
                <div className="flex justify-between">
                  <span className="text-warm-600 dark:text-warm-400">Sale amount:</span>
                  <span className="font-semibold text-warm-900 dark:text-warm-100">${(totalWithFee - cnpFeeAmount).toFixed(2)}</span>
                </div>
                {/* Card-not-present fee: its own receipt line (never folded into the sale amount). */}
                <div className="flex justify-between">
                  <span className="text-warm-600 dark:text-warm-400">Card-not-present fee:</span>
                  <span className="font-semibold text-warm-900 dark:text-warm-100">${cnpFeeAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-warm-600 dark:text-warm-400">Total charged to card:</span>
                  <span className="font-semibold text-warm-900 dark:text-warm-100">${totalWithFee.toFixed(2)}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between">
                <span className="text-warm-600 dark:text-warm-400">Amount:</span>
                <span className="font-semibold text-warm-900 dark:text-warm-100">${totalWithFee.toFixed(2)}</span>
              </div>
            )}
            {successTimestamp && (
              <div className="flex justify-between">
                <span className="text-warm-600 dark:text-warm-400">Time:</span>
                <span className="font-semibold text-warm-900 dark:text-warm-100">{successTimestamp}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ ERROR STATE ═══ */}
      {state === 'error' && (
        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700">
            <p className="text-3xl mb-2">✗</p>
            <p className="text-sm font-bold text-red-900 dark:text-red-100 mb-1">
              {isActualCardDecline(errorMessage) ? 'Card Was Declined' : "Payment Couldn't Be Completed"}
            </p>
            <p className="text-xs text-red-700 dark:text-red-300 mt-2">
              {errorMessage || 'Something went wrong processing this payment. Please check with the customer before trying again.'}
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleRetry}
              className="flex-1 py-2 rounded-lg bg-sage-700 text-white text-sm font-semibold hover:bg-sage-800 transition"
            >
              Try Again
            </button>
            <button
              onClick={() => {
                setState('idle');
                onError('User switched to cash payment');
              }}
              className="flex-1 py-2 rounded-lg bg-warm-200 dark:bg-gray-700 text-warm-700 dark:text-warm-300 text-sm font-semibold hover:bg-warm-300 dark:hover:bg-gray-600 transition"
            >
              Use Cash
            </button>

          </div>
        </div>
      )}
    </div>
  );
}
