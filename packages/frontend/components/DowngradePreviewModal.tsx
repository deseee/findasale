import { useState } from 'react';

interface DowngradePreview {
  currentTier: string;
  itemsHidden: number;
  photosAffected: number;
  graceEndDate: string;
  teamMembersLosing: number;
  totalItems: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  preview: DowngradePreview;
  onConfirm: () => Promise<void>;
}

export default function DowngradePreviewModal({ isOpen, onClose, preview, onConfirm }: Props) {
  const [confirming, setConfirming] = useState(false);

  if (!isOpen) return null;

  const graceDate = new Date(preview.graceEndDate).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric'
  });

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-warm-900 rounded-2xl max-w-md w-full p-6">
        <h2 className="text-xl font-semibold mb-2">Downgrade to Free</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          You have {preview.totalItems} items. Here&apos;s what changes:
        </p>

        <ul className="space-y-2 mb-6 text-sm">
          <li className="flex gap-2">
            <span className="text-green-600">✓</span>
            First 200 items stay visible to shoppers
          </li>
          {preview.itemsHidden > 0 && (
            <li className="flex gap-2">
              <span className="text-amber-500">⚠</span>
              {preview.itemsHidden} items hidden from shoppers until {graceDate} (7-day grace period)
            </li>
          )}
          {preview.photosAffected > 0 && (
            <li className="flex gap-2">
              <span className="text-amber-500">⚠</span>
              Photos limited to 5 per item (extras hidden, not deleted)
            </li>
          )}
          {preview.teamMembersLosing > 0 && (
            <li className="flex gap-2">
              <span className="text-amber-500">⚠</span>
              {preview.teamMembersLosing} team members lose access (re-add them if you upgrade within 30 days)
            </li>
          )}
          <li className="flex gap-2">
            <span className="text-red-500">✗</span>
            Virtual Queue and eBay push disabled
          </li>
        </ul>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-warm-800"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={confirming}
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-red-700"
          >
            {confirming ? 'Processing...' : 'Downgrade to Free'}
          </button>
        </div>
      </div>
    </div>
  );
}
