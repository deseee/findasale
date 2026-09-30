import { useState } from 'react';
import AccessibleModal from './AccessibleModal';

interface DowngradePreview {
  currentTier: string;
  itemsHidden: number;
  photosAffected: number;
  teamMembersLosing: number;
  totalItems: number;
  // 2026-09-29 (Patrick D1/D2): the plan stays active until its current billing period ends.
  // Replaces the invented 7-day graceEndDate the old copy was built around.
  planEndsAt?: string | null;
  planEndsAtIsEstimate?: boolean;
  alreadyScheduled?: boolean;
  activeMarkdownCycles?: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  preview: DowngradePreview;
  onConfirm: () => Promise<void>;
}

const formatPlanEnd = (iso?: string | null): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

export default function DowngradePreviewModal({ isOpen, onClose, preview, onConfirm }: Props) {
  const [confirming, setConfirming] = useState(false);

  if (!isOpen) return null;

  const planEndDate = formatPlanEnd(preview.planEndsAt);
  const cycles = preview.activeMarkdownCycles ?? 0;

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
    <AccessibleModal
      isOpen={isOpen}
      onClose={onClose}
      ariaLabelledBy="downgrade-preview-modal-title"
    >
      <div className="bg-white dark:bg-warm-900 rounded-2xl max-w-md w-full p-6">
        <h2 id="downgrade-preview-modal-title" className="text-xl font-semibold mb-2">Downgrade to Free</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
          Your {preview.currentTier} plan stays fully active until{' '}
          <strong>{planEndDate ?? 'the end of your current billing period'}</strong>. After that your account moves to the
          free plan. You have {preview.totalItems} items. Here&apos;s what changes:
        </p>
        {preview.planEndsAtIsEstimate && planEndDate && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            This date is an estimate because your plan is not on a standard billing cycle. If it changes, this page will show the final date.
          </p>
        )}
        {preview.alreadyScheduled && (
          <p className="text-sm text-amber-700 dark:text-amber-300 mb-4">
            Your downgrade is already scheduled. You can undo it from the subscription page until the plan ends.
          </p>
        )}

        <ul className="space-y-2 mb-6 text-sm">
          <li className="flex gap-2">
            <span className="text-green-600">✓</span>
            Nothing is deleted. Your items, sales and settings stay exactly as they are
          </li>
          <li className="flex gap-2">
            <span className="text-green-600">✓</span>
            Free features keep working, including your storefront, the free Day 2 and Day 3 sale markdowns, and the Re-tag list
          </li>
          <li className="flex gap-2">
            <span className="text-amber-500">⚠</span>
            {cycles > 0
              ? `Your ${cycles} automatic markdown ${cycles === 1 ? 'cycle pauses' : 'cycles pause'} when the plan ends. Prices already changed by a cycle stay where they are, and your cycle settings are kept.`
              : 'Automatic markdown cycles (a PRO feature) pause when the plan ends. Any settings you have are kept.'}
          </li>
          {preview.photosAffected > 0 && (
            <li className="flex gap-2">
              <span className="text-amber-500">⚠</span>
              {preview.photosAffected} {preview.photosAffected === 1 ? 'item has' : 'items have'} more than 5 photos. Those photos are kept, and new uploads to {preview.photosAffected === 1 ? 'it are' : 'them are'} capped at 5
            </li>
          )}
          {preview.teamMembersLosing > 0 && (
            <li className="flex gap-2">
              <span className="text-amber-500">⚠</span>
              {preview.teamMembersLosing} team {preview.teamMembersLosing === 1 ? 'member loses' : 'members lose'} access when TEAMS ends. Access comes back when you are on TEAMS again
            </li>
          )}
          <li className="flex gap-2">
            <span className="text-amber-500">⚠</span>
            Free plan limits apply again: 5 photos per item, 100 auto tags per month, and the standard 10% fee when items sell
          </li>
          <li className="flex gap-2">
            <span className="text-gray-500">•</span>
            Nothing is switched back on or restored automatically if you upgrade later
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
            disabled={confirming || preview.alreadyScheduled}
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-red-700"
          >
            {confirming ? 'Processing...' : preview.alreadyScheduled ? 'Already scheduled' : 'Downgrade to Free'}
          </button>
        </div>
      </div>
    </AccessibleModal>
  );
}
