import React, { useState } from 'react';
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
}

// Backend addTeamSeat (Square card on file) returns 400 with code NO_PAYMENT_METHOD
// when the organizer has no stored payment method. The message match is a fallback.
const isNoPaymentMethodError = (err: any): boolean => {
  const data = err?.response?.data;
  return (
    err?.response?.status === 400 &&
    (data?.code === 'NO_PAYMENT_METHOD' || /payment method/i.test(String(data?.message || '')))
  );
};

const TeamSeatUpsellModal: React.FC<TeamSeatUpsellModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  pendingInvite,
  memberLimit = 5,
}) => {
  const { showToast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsPaymentMethod, setNeedsPaymentMethod] = useState(false);

  const handleAddSeat = async () => {
    setIsLoading(true);
    setError(null);
    setNeedsPaymentMethod(false);

    try {
      // Add seat: backend charges the card on file via Square
      const addSeatRes = await api.post('/workspace/add-seat', {});

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

      showToast('Seat added successfully! You can now continue inviting team members.', 'success');
      onSuccess();
      onClose();
    } catch (err: any) {
      if (isNoPaymentMethodError(err)) {
        // Expected state (no card on file): show the amber panel, do not log as an error.
        setNeedsPaymentMethod(true);
        return;
      }
      console.error('Error adding team seat:', err);
      const message = err.response?.data?.message || 'Failed to add seat. Please try again.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onClose}
      ariaLabelledBy="team-seat-upsell-modal-title"
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 id="team-seat-upsell-modal-title" className="text-xl font-bold text-gray-900 dark:text-white">
            Team at Capacity
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 -mr-2 -my-2 min-w-[44px] min-h-[44px] inline-flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-6">
          <p className="text-gray-700 dark:text-gray-300 mb-6">
            Your team is full ({memberLimit}/{memberLimit} seats). Add another seat for <strong>$20/mo</strong> to continue inviting team members.
          </p>

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
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-800 dark:text-red-300 text-sm">
              {error}
            </div>
          )}

          <div className="mb-6 p-4 rounded border bg-sage-50 border-sage-200 dark:bg-sage-700/20 dark:border-sage-600">
            <p className="text-sm text-sage-700 dark:text-sage-200">
              New seats are billed monthly to your TEAMS subscription.
            </p>
          </div>
        </div>

        {/* Footer / Actions */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 min-h-touch border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleAddSeat}
            disabled={isLoading || needsPaymentMethod}
            className="px-4 py-2 min-h-touch bg-sage-600 hover:bg-sage-700 text-white rounded-md disabled:opacity-50 flex items-center gap-2"
          >
            {isLoading ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                Adding...
              </>
            ) : (
              'Add Seat, $20/mo'
            )}
          </button>
        </div>
      </div>
    </AccessibleModal>
  );
};

export default TeamSeatUpsellModal;
