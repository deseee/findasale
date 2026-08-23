/**
 * ClaimCard Component
 * For shoppers: displays pending payment requests with countdown timer and CTA.
 * Shows when shopper has an INVOICE_ISSUED hold (awaiting payment).
 */

import { useState } from 'react';
import HoldTimer from './HoldTimer';
import api from '../lib/api';
import { useToast } from './ToastContext';
import ConfirmDialog from './ConfirmDialog';

interface ClaimCardProps {
  invoiceId: string;
  /**
   * The ItemReservation id this invoice was issued against (HoldInvoice.reservationId).
   * POST /reservations/:id/release-invoice is keyed on the RESERVATION id -- not the
   * invoice id and not the item id. Optional because GET /reservations/my-invoices does
   * not return it yet (see the pending backend change); the action below refuses to fire
   * without it rather than sending a request with `undefined` in the path.
   */
  reservationId?: string | null;
  itemTitle?: string | null;
  /** Item.price is `Float?` in schema.prisma -- genuinely nullable, so never assume a number. */
  itemPrice?: number | null;
  itemPhoto?: string | null;
  checkoutUrl?: string | null;
  expiresAt: string;
  organizerName?: string | null;
  onPaymentSuccess?: () => void;
  onReleaseHold?: () => void;
}

export default function ClaimCard({
  invoiceId,
  reservationId,
  itemTitle,
  itemPrice,
  itemPhoto,
  checkoutUrl,
  expiresAt,
  organizerName,
  onPaymentSuccess,
  onReleaseHold,
}: ClaimCardProps) {
  const { showToast } = useToast();
  const [isReleasing, setIsReleasing] = useState(false);

  const displayTitle = itemTitle || 'Your item';
  const displayOrganizer = organizerName || 'the organizer';

  const handlePayment = () => {
    // Silent no-op removed: `checkoutUrl` is not persisted anywhere (HoldInvoice stores
    // only stripeSessionId), so this button did nothing at all and said nothing about it.
    if (!checkoutUrl) {
      showToast(
        `That payment link isn't available right now. Ask ${displayOrganizer} to resend the invoice.`,
        'error'
      );
      return;
    }
    window.open(checkoutUrl, '_blank', 'noopener,noreferrer');
  };

  // Cancel the outstanding payment request.
  //
  // Two backend paths, picked by whether `reservationId` is present:
  //   - present: POST /reservations/:reservationId/release-invoice (releaseInvoice) --
  //     the item(s) behind this invoice were actually held, so this is the path that
  //     also reverts them to RESERVED.
  //   - absent: POST /reservations/invoice/:invoiceId/release (releaseInvoiceById,
  //     2026-08-23 fix). A POS-cart invoice built entirely from register-entered misc
  //     items (posController.createCombinedInvoice with no holdIds) has no
  //     ItemReservation at all, so release-invoice can never address it -- this
  //     shopper-or-organizer-authorized endpoint cancels it directly by the invoice's
  //     own id instead. Before this fix there was genuinely no way to cancel this case;
  //     the button below silently refused with an apology toast.
  //
  // Mirrors the organizer-side caller of the reservation-based endpoint
  // (pages/organizer/holds.tsx releaseInvoiceMutation) for status handling and copy.
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const handleCancelRequest = async () => {
    setIsReleasing(true);
    try {
      const res = reservationId
        ? await api.post(`/reservations/${reservationId}/release-invoice`)
        : await api.post(`/reservations/invoice/${invoiceId}/release`);
      const count = res?.data?.itemsReleased ?? 1;
      showToast(
        count > 1
          ? `Payment request cancelled. ${count} items are back on hold for you.`
          : 'Payment request cancelled.',
        'success'
      );
      onReleaseHold?.();
    } catch (err: any) {
      // Surface the server's own copy, never a hardcoded string. 409 = already paid or no
      // longer PENDING; 502 = the payment link could not be closed so the request was
      // deliberately left in place. On 409 the card is stale either way, so refresh it.
      if (err.response?.status === 409) onReleaseHold?.();
      showToast(
        err.response?.data?.message || 'Could not cancel that payment request. Please try again.',
        'error'
      );
    } finally {
      setIsReleasing(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 border-2 border-amber-200 dark:border-amber-700 rounded-xl p-4 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-bold text-amber-900 dark:text-amber-100">Payment Requested</h3>
          <p className="text-xs text-amber-700 dark:text-amber-400">
            From {displayOrganizer}
          </p>
        </div>
        <div className="px-2 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 text-xs font-semibold rounded">
          Pending
        </div>
      </div>

      {/* Item Info */}
      <div className="mb-4 flex gap-3">
        {itemPhoto && (
          <img
            src={itemPhoto}
            alt={displayTitle}
            className="w-16 h-16 object-cover rounded-lg flex-shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">
            {displayTitle}
          </p>
          {/* Guarded, not assumed: this was `itemPrice.toFixed(2)` on a prop the caller
              never actually populated, so rendering the card threw a TypeError and took
              the whole Pending Payments section down with it. Item.price is nullable in
              the schema besides. */}
          {typeof itemPrice === 'number' && (
            <p className="text-lg font-bold text-amber-600 dark:text-amber-400 mt-1">
              ${itemPrice.toFixed(2)}
            </p>
          )}
        </div>
      </div>

      {/* Timer */}
      <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/10 rounded-lg">
        <HoldTimer expiresAt={expiresAt} />
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handlePayment}
          className="flex-1 py-2 px-3 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm transition-colors"
        >
          Complete Payment →
        </button>
      </div>

      {/* Secondary Action.
          Relabelled from "Release Hold": release-invoice cancels the payment request and
          returns the item to RESERVED -- the hold SURVIVES (the server's own shopper
          notification says "Your hold remains active"). Releasing the hold itself is then
          possible from the holds list, where the item is no longer at INVOICE_ISSUED and
          cancelHold's 409 gate no longer applies. */}
      <button
        type="button"
        onClick={() => setShowCancelConfirm(true)}
        disabled={isReleasing}
        className="w-full mt-2 py-1 text-xs text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-300 font-medium disabled:opacity-50 transition-colors"
      >
        {isReleasing ? 'Cancelling...' : 'Cancel payment request'}
      </button>

      {showCancelConfirm && (
        <ConfirmDialog
          isOpen
          title="Cancel this payment request?"
          message={`Your payment link for ${displayTitle} will stop working. You can ask ${displayOrganizer} for a new one later.`}
          confirmLabel="Cancel the request"
          cancelLabel="Leave it active"
          variant="danger"
          onCancel={() => setShowCancelConfirm(false)}
          onConfirm={() => {
            setShowCancelConfirm(false);
            handleCancelRequest();
          }}
        />
      )}
    </div>
  );
}
