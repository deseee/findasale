import React, { useState } from 'react';
import api from '../lib/api';
import { useToast } from './ToastContext';

interface TeamSeatUpsellModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  pendingInvite?: {
    email: string;
    role: 'ADMIN' | 'MEMBER';
  };
}

const TeamSeatUpsellModal: React.FC<TeamSeatUpsellModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  pendingInvite,
}) => {
  const { showToast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddSeat = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Add seat via Stripe
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Team at Capacity
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-6">
          <p className="text-gray-700 dark:text-gray-300 mb-6">
            Your team is full (5/5 seats). Add another seat for <strong>$20/mo</strong> to continue inviting team members.
          </p>

          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-800 dark:text-red-300 text-sm">
              {error}
            </div>
          )}

          <div className="mb-6 p-4 bg-sage-50 dark:bg-sage-900/20 border border-sage-200 dark:border-sage-800 rounded">
            <p className="text-sm text-sage-900 dark:text-sage-100">
              New seats are billed monthly to your TEAMS subscription.
            </p>
          </div>
        </div>

        {/* Footer / Actions */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleAddSeat}
            disabled={isLoading}
            className="px-4 py-2 bg-sage-600 hover:bg-sage-700 text-white rounded-md disabled:opacity-50 flex items-center gap-2"
          >
            {isLoading ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                Adding...
              </>
            ) : (
              'Add Seat — $20/mo'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TeamSeatUpsellModal;
