import React from 'react';
import AccessibleModal from '../AccessibleModal';
import {
  batchStatusLabel,
  isLegacyBatchStatus,
  payoutStatusLabel,
} from '../../lib/types/consignorSettlement';

/**
 * Shared modal frame. Patrick has been bitten by modals that ignore the viewport, so every
 * dialog here is capped at 90vh, scrolls inside itself, keeps a side margin and never grows
 * past max-w-md (max-w-2xl only for the statement preview).
 */
export const ModalShell: React.FC<{
  titleId: string;
  onClose: () => void;
  wide?: boolean;
  children: React.ReactNode;
}> = ({ titleId, onClose, wide, children }) => (
  <AccessibleModal
    isOpen={true}
    onClose={onClose}
    ariaLabelledBy={titleId}
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    contentClassName={
      'bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 ' +
      (wide ? 'max-w-2xl' : 'max-w-md')
    }
  >
    {children}
  </AccessibleModal>
);

export const inputClass =
  'w-full min-h-[44px] border border-warm-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-warm-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent disabled:opacity-60';

export const labelClass = 'block text-sm font-bold text-warm-700 dark:text-warm-300 mb-1';

export const helperClass = 'text-xs text-warm-500 dark:text-warm-400 mt-1';

export const btnBase =
  'inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-lg font-bold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
export const btnPrimary = btnBase + ' bg-amber-600 hover:bg-amber-700 text-white';
export const btnSecondary =
  btnBase +
  ' bg-warm-100 dark:bg-gray-700 hover:bg-warm-200 dark:hover:bg-gray-600 text-warm-900 dark:text-warm-100';
export const btnOutline =
  btnBase +
  ' border border-warm-300 dark:border-gray-600 text-warm-700 dark:text-warm-300 hover:bg-warm-50 dark:hover:bg-gray-700';
export const btnDanger =
  btnBase +
  ' bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-700 dark:text-red-400';

const BATCH_CLASSES: Record<string, string> = {
  DRAFT: 'bg-warm-100 text-warm-700 dark:bg-gray-700 dark:text-warm-300',
  APPROVED: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  PARTIALLY_PAID: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  PAID: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  CANCELLED: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

export const BatchStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const cls = isLegacyBatchStatus(status)
    ? 'bg-warm-100 text-warm-600 dark:bg-gray-700 dark:text-warm-400'
    : BATCH_CLASSES[status] || BATCH_CLASSES.DRAFT;
  return (
    <span className={`inline-block px-2 py-1 rounded text-xs font-bold ${cls}`}>
      {batchStatusLabel(status)}
    </span>
  );
};

const PAYOUT_CLASSES: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  ON_HOLD: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  PAID: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  VOID: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

export const PayoutStatusBadge: React.FC<{ status: string; simulated?: boolean }> = ({
  status,
  simulated,
}) => {
  if (simulated) {
    return (
      <span className="inline-block px-2 py-1 rounded text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
        Test only. No money was sent.
      </span>
    );
  }
  const cls =
    PAYOUT_CLASSES[status] || 'bg-warm-100 text-warm-600 dark:bg-gray-700 dark:text-warm-400';
  return (
    <span className={`inline-block px-2 py-1 rounded text-xs font-bold ${cls}`}>
      {payoutStatusLabel(status)}
    </span>
  );
};

/** The permanent neutral banner shown on every payouts surface. */
export const NoMoneyBanner: React.FC = () => (
  <div
    className="mb-6 rounded-lg border border-warm-200 dark:border-gray-700 bg-warm-100 dark:bg-gray-800 p-4"
    role="note"
  >
    <p className="text-sm text-warm-700 dark:text-warm-300">
      You pay your consignors yourself, by cash, check, Square, or another way. FindA.Sale keeps the
      numbers and the paper trail. We do not send or hold any money.
    </p>
  </div>
);
