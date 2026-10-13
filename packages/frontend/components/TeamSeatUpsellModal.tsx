import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import api from '../lib/api';
import { useToast } from './ToastContext';
import AccessibleModal from './AccessibleModal';

interface TeamSeatUpsellModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  pendingInvite?: {
    email: string;
    role: 'ADMIN' | 'MEMBER';
  };
  /** Current member cap shown in the copy. Defaults to the TEAMS base cap of 5. */
  memberLimit?: number;
  /** How many seats in total this invite batch needs. Above 1, the copy says each is charged separately. */
  pendingCount?: number;
  /** Which of those seats this purchase is (1-based). */
  seatNumber?: number;
}

interface SeatQuote {
  amountCents: number;
  renewsOn: string;
  monthlyCents: number;
}

const formatMoney = (cents: number): string => (cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`);
const formatDate = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
};

// Backend addTeamSeat (Square card on file) returns 400 with code NO_PAYMENT_METHOD
// when the organizer has no stored payment method. Match on the code only: other 400s
// (declined card, card not found) carry friendly messages that mention "payment method"
// too, and must show as an ordinary error, not as the add-a-card panel.
const isNoPaymentMethodError = (err: any): boolean =>
  err?.response?.status === 400 && err?.response?.data?.code === 'NO_PAYMENT_METHOD';

const TeamSeatUpsellModal: React.FC<TeamSeatUpsellModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  pendingInvite,
  memberLimit = 5,
  pendingCount = 1,
  seatNumber = 1,
}) => {
  const { showToast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsPaymentMethod, setNeedsPaymentMethod] = useState(false);
  const [quote, setQuote] = useState<SeatQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteFailed, setQuoteFailed] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);

  // Fetch what the seat costs today each time the modal opens (and on "Try again"), so the amount
  // shown is the amount charged. Without a quote there is no charge path.
  const loadQuote = React.useCallback(() => {
    let cancelled = false;
    setQuote(null);
    setQuoteFailed(false);
    setError(null);
    setNeedsPaymentMethod(false);
    setQuoteLoading(true);
    api
      .get('/workspace/seat-quote')
      .then((res) => {
        if (!cancelled) setQuote(res.data as SeatQuote);
      })
      .catch((err) => {
        if (cancelled) return;
        if (isNoPaymentMethodError(err)) setNeedsPaymentMethod(true);
        else setQuoteFailed(true);
      })
      .finally(() => {
        if (!cancelled) setQuoteLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    return loadQuote();
  }, [isOpen, loadQuote]);

  // When a charge fails and the dialog stays open, put focus back on the action button.
  useEffect(() => {
    if (isOpen && !isLoading && error) addButtonRef.current?.focus();
  }, [isOpen, isLoading, error]);

  // While a charge is in flight, ignore every way of closing (X, Esc, backdrop) so the person
  // always sees the outcome of the payment.
  const handleClose = () => {
    if (isLoading) return;
    onClose();
  };

  const handleAddSeat = async () => {
    setIsLoading(true);
    setError(null);
    setNeedsPaymentMethod(false);
    // The focused control (the X or the button) is about to be disabled; keep focus inside the dialog.
    contentRef.current?.focus();

    try {
      // Add seat: backend charges the card on file via Square. expectedAmountCents is the amount the
      // person just saw; the server refuses (409) rather than charge a different amount.
      const addSeatRes = await api.post('/workspace/add-seat', { expectedAmountCents: quote?.amountCents });

      if (!addSeatRes.data.success) {
        setError(addSeatRes.data.message || 'Failed to add seat');
        return;
      }

      // If there's a pending invite, retry it now
      if (pendingInvite) {
        try {
          await api.post('/workspace/invite', {
            email: pendingInvite.email,
            role: pendingInvite.role,
          });
        } catch (inviteErr: any) {
          console.error('Error retrying invite after seat purchase:', inviteErr);
          // Still consider it a success since the seat was added
          showToast('Seat added successfully, but invite send failed. Please try again.', 'warning');
        }
      }

      // When more seats are still needed the wizard shows a single warning toast instead; one toast per round.
      if (seatNumber >= pendingCount) {
        showToast('Seat added successfully! You can now continue inviting team members.', 'success');
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      if (isNoPaymentMethodError(err)) {
        // Expected state (no card on file): show the amber panel, do not log as an error.
        setNeedsPaymentMethod(true);
        return;
      }
      const data = err.response?.data;
      if (err.response?.status === 409 && data?.code === 'SEAT_PRICE_CHANGED') {
        // Nothing was charged. Show the new amount and require another click.
        setQuote({ amountCents: data.amountCents, renewsOn: data.renewsOn, monthlyCents: data.monthlyCents });
        setError(data.message || 'The amount for this seat has changed. Please review the new amount and confirm again.');
        return;
      }
      console.error('Error adding team seat:', err);
      // One message only (inline); the server already sends user-safe wording.
      setError(data?.message || 'Failed to add seat. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const chargeCopy = quote
    ? `Today we charge your card on file ${formatMoney(quote.amountCents)} for the rest of this billing period. From your next renewal${formatDate(quote.renewsOn) ? ` on ${formatDate(quote.renewsOn)}` : ''}, each extra seat adds ${formatMoney(quote.monthlyCents)}/mo to your TEAMS subscription.`
    : '';

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={handleClose}
      ariaLabelledBy="team-seat-upsell-modal-title"
    >
      <div
        ref={contentRef}
        tabIndex={-1}
        aria-busy={isLoading}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full outline-none"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 id="team-seat-upsell-modal-title" className="text-xl font-bold text-gray-900 dark:text-white">
            Team at Capacity
          </h2>
          <button
            onClick={handleClose}
            disabled={isLoading}
            aria-label="Close"
            className="disabled:opacity-50 p-2 -mr-2 -my-2 min-w-[44px] min-h-[44px] inline-flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-6">
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            Your team is full ({memberLimit}/{memberLimit} seats). Add another seat to continue inviting team members.
          </p>

          {pendingCount > 1 && (
            <p className="text-sm font-medium text-gray-900 dark:text-white mb-4">
              Seat {Math.min(seatNumber, pendingCount)} of {pendingCount} needed. Each seat is charged separately.
            </p>
          )}

          {needsPaymentMethod && (
            <div
              role="alert"
              className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded text-amber-800 dark:text-amber-200 text-sm"
            >
              <p className="mb-3">
                Adding a seat charges the card on your subscription. Add a payment method on your subscription page first, then come back and add the seat.
              </p>
              <Link
                href="/organizer/subscription"
                className="inline-flex items-center min-h-touch px-4 py-2 bg-sage-600 hover:bg-sage-700 text-white rounded-md"
              >
                Add payment method
              </Link>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-800 dark:text-red-300 text-sm"
            >
              {error}
            </div>
          )}

          <div className="mb-6 p-4 rounded border bg-sage-50 border-sage-200 dark:bg-sage-700/20 dark:border-sage-600">
            {quoteFailed ? (
              <div className="text-sm text-sage-700 dark:text-sage-200">
                <p className="mb-2">We could not load the price for this seat, so nothing can be charged yet.</p>
                <button
                  type="button"
                  onClick={loadQuote}
                  className="px-4 py-2 min-h-touch border border-sage-300 dark:border-sage-600 rounded-md font-medium hover:bg-sage-100 dark:hover:bg-sage-700/40"
                >
                  Try again
                </button>
              </div>
            ) : (
              <p className="text-sm text-sage-700 dark:text-sage-200">
                {quoteLoading ? 'Checking the price...' : chargeCopy}
              </p>
            )}
          </div>
        </div>

        {/* Footer / Actions */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex gap-3 justify-end">
          <button
            onClick={handleClose}
            disabled={isLoading}
            className="px-4 py-2 min-h-touch border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            ref={addButtonRef}
            onClick={handleAddSeat}
            disabled={isLoading || quoteLoading || quoteFailed || !quote || needsPaymentMethod}
            className="px-4 py-2 min-h-touch bg-sage-600 hover:bg-sage-700 text-white rounded-md disabled:opacity-50 flex items-center gap-2"
          >
            {isLoading ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                Adding...
              </>
            ) : (
              'Charge Card and Add Seat'
            )}
          </button>
        </div>
      </div>
    </AccessibleModal>
  );
};

export default TeamSeatUpsellModal;
