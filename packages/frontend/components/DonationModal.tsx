/**
 * DonationModal — Feature #235: Charity Close + Tax Receipt PDF
 * Allows organizers to donate unsold items to charity and generate tax receipts
 */
import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useToast } from './ToastContext';
import { useAuth } from './AuthContext';

interface DonationModalProps {
  saleId: string;
  availableItems: Array<{
    id: string;
    title: string;
    price: number | null;
    condition: string | null;
  }>;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function DonationModal({
  saleId,
  availableItems,
  onClose,
  onSuccess,
}: DonationModalProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(0);
  const [charityName, setCharityName] = useState('');
  const [charityEin, setCharityEin] = useState('');
  const [charityAddress, setCharityAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [selectAll, setSelectAll] = useState(false);

  const isProOrTeams = user?.organizerTier === 'PRO' || user?.organizerTier === 'TEAMS';

  // Donation mutation
  const donationMutation = useMutation({
    mutationFn: () =>
      api.post(`/api/organizer/sales/${saleId}/donate`, {
        charityName,
        charityEin,
        charityAddress,
        notes,
        itemIds: selectedItems,
      }),
    onSuccess: (response) => {
      const donationId = response.data.donation.id;
      showToast('Donation created successfully!', 'success');
      queryClient.invalidateQueries({ queryKey: ['sale-for-settlement', saleId] });
      queryClient.invalidateQueries({ queryKey: ['donations', saleId] });

      // Move to receipt download step
      setStep(2);
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to create donation';
      showToast(message, 'error');
    },
  });

  // Fetch donation to get receipt URL
  const { data: donation } = useQuery({
    queryKey: ['recent-donation', saleId],
    queryFn: () => api.get(`/api/organizer/sales/${saleId}/donations`).then((r) => r.data.donations[0]),
    enabled: step === 2,
    staleTime: 0,
  });

  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked);
    if (checked) {
      setSelectedItems(availableItems.map((item) => item.id));
    } else {
      setSelectedItems([]);
    }
  };

  const handleToggleItem = (itemId: string) => {
    setSelectedItems((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    );
  };

  const totalEstimatedValue = selectedItems.reduce((sum, itemId) => {
    const item = availableItems.find((i) => i.id === itemId);
    return sum + (item?.price || 0);
  }, 0);

  const handleDownloadReceipt = () => {
    if (donation) {
      const receiptUrl = `/api/organizer/donations/${donation.id}/receipt`;
      window.open(receiptUrl, '_blank');
      showToast('Receipt downloaded!', 'success');
      onSuccess?.();
      onClose();
    }
  };

  // PRO gate
  if (!isProOrTeams) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-sm w-full">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
            Charity Close — PRO Feature
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
            Generate professional tax receipts for donated items. Upgrade to PRO or TEAMS to unlock this feature.
          </p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2 px-3 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                window.location.href = '/organizer/billing';
              }}
              className="flex-1 py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
            >
              Upgrade Now
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-6 flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Donate Unsold Items</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-6">
          {/* Step indicator */}
          <div className="flex gap-2 mb-6">
            {[0, 1, 2].map((s) => (
              <div
                key={s}
                className={`flex-1 h-1 rounded-full transition-colors ${
                  s <= step
                    ? 'bg-blue-600'
                    : 'bg-gray-200 dark:bg-gray-700'
                }`}
              />
            ))}
          </div>

          {/* Step 0: Charity Info */}
          {step === 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Charity Information
              </h3>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Charity Name *
                </label>
                <input
                  type="text"
                  value={charityName}
                  onChange={(e) => setCharityName(e.target.value)}
                  placeholder="e.g., Red Cross, Goodwill, Salvation Army"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Tax ID / EIN
                </label>
                <input
                  type="text"
                  value={charityEin}
                  onChange={(e) => setCharityEin(e.target.value)}
                  placeholder="e.g., 12-3456789"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Charity Address
                </label>
                <input
                  type="text"
                  value={charityAddress}
                  onChange={(e) => setCharityAddress(e.target.value)}
                  placeholder="Street address"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Notes (Optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any additional notes..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <button
                onClick={() => setStep(1)}
                disabled={!charityName}
                className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white font-medium rounded-lg transition-colors"
              >
                Next: Select Items
              </button>
            </div>
          )}

          {/* Step 1: Select Items */}
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Select Items to Donate
              </h3>

              {availableItems.length === 0 ? (
                <p className="text-gray-600 dark:text-gray-400">No available items to donate.</p>
              ) : (
                <>
                  {/* Select All */}
                  <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <input
                      type="checkbox"
                      checked={selectAll}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      Select All ({availableItems.length} items)
                    </span>
                  </div>

                  {/* Item list */}
                  <div className="space-y-2 max-h-80 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                    {availableItems.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-start gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded"
                      >
                        <input
                          type="checkbox"
                          checked={selectedItems.includes(item.id)}
                          onChange={() => handleToggleItem(item.id)}
                          className="w-4 h-4 mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {item.title}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {item.condition || 'Unknown'} · ${(item.price || 0).toFixed(2)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Summary */}
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                    <p className="text-sm text-blue-900 dark:text-blue-200">
                      <strong>{selectedItems.length}</strong> items selected
                    </p>
                    <p className="text-sm text-blue-900 dark:text-blue-200">
                      Est. Value: <strong>${totalEstimatedValue.toFixed(2)}</strong>
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setStep(0)}
                      className="flex-1 py-2 px-3 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium"
                    >
                      Back
                    </button>
                    <button
                      onClick={() => donationMutation.mutate()}
                      disabled={selectedItems.length === 0 || donationMutation.isPending}
                      className="flex-1 py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white font-medium"
                    >
                      {donationMutation.isPending ? 'Creating...' : 'Create Donation & Receipt'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 2: Receipt Download */}
          {step === 2 && (
            <div className="text-center space-y-4">
              <div className="text-6xl mb-4">✓</div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Donation Recorded!
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Your tax receipt PDF is ready to download and print.
              </p>

              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <p className="text-sm text-green-900 dark:text-green-200">
                  {selectedItems.length} items donated to <strong>{charityName}</strong>
                </p>
                <p className="text-sm text-green-900 dark:text-green-200 mt-1">
                  Est. Value: <strong>${totalEstimatedValue.toFixed(2)}</strong>
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 py-2 px-3 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium"
                >
                  Done
                </button>
                <button
                  onClick={handleDownloadReceipt}
                  disabled={!donation}
                  className="flex-1 py-2 px-3 rounded-lg bg-green-600 hover:bg-green-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white font-medium"
                >
                  Download Receipt
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
