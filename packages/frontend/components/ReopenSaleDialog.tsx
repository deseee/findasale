/**
 * ReopenSaleDialog
 *
 * Confirm dialog for "Mark available again" on a SOLD item whose marketplace sale was cancelled.
 * States which marketplace the sale was recorded on and that listings paused or ended when it sold are NOT
 * relisted. Shows the server's refusal reason on a 409 (paid through FindA.Sale, multi-quantity, bulk lot, ...).
 */

import React, { useEffect, useState } from 'react';
import AccessibleModal from './AccessibleModal';
import { REOPEN_MARKETPLACE_LABELS, useReopenSale } from '../hooks/useReopenSale';
import { useToast } from './ToastContext';

interface ReopenSaleDialogProps {
  isOpen: boolean;
  itemId: string;
  itemTitle?: string;
  /** Item.lastSoldVia, when the caller has it. Null/undefined reads as "the marketplace where it sold". */
  lastSoldVia?: string | null;
  onClose: () => void;
  onReopened?: () => void;
}

const ReopenSaleDialog: React.FC<ReopenSaleDialogProps> = ({ isOpen, itemId, itemTitle, lastSoldVia, onClose, onReopened }) => {
  const { showToast } = useToast();
  const reopen = useReopenSale();
  const [attested, setAttested] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setAttested(false);
      setRefusal(null);
    }
  }, [isOpen, itemId]);

  if (!isOpen) return null;

  const isEbay = lastSoldVia === 'EBAY';
  const isOffPlatform = lastSoldVia === 'OFF_PLATFORM_MANUAL';
  const needsAttestation = !isEbay && !isOffPlatform;
  const marketplace = (lastSoldVia && REOPEN_MARKETPLACE_LABELS[lastSoldVia]) || 'the marketplace where it sold';
  const name = itemTitle || 'this item';

  const handleConfirm = async () => {
    setRefusal(null);
    try {
      await reopen.mutateAsync({ itemId, confirm: needsAttestation ? attested : true });
      showToast('Item is available again', 'success');
      onReopened?.();
      onClose();
    } catch (err: any) {
      setRefusal(err?.response?.data?.message || 'Could not mark this item available again. Try again shortly.');
    }
  };

  return (
    <AccessibleModal isOpen={isOpen} onClose={onClose} ariaLabelledBy="reopen-sale-dialog-title">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md mx-4 shadow-xl max-h-[80vh] overflow-y-auto border-l-4 border-l-amber-500">
        <h3 id="reopen-sale-dialog-title" className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-2">
          Mark available again?
        </h3>

        <p className="text-sm text-warm-700 dark:text-warm-300 mb-3">
          {isOffPlatform
            ? `"${name}" was marked sold outside FindA.Sale. This removes that sale from your off-platform sales log and makes the item available.`
            : `"${name}" was recorded as sold on ${marketplace}. This makes it available again.`}
        </p>

        {isEbay && (
          <p className="text-sm text-warm-700 dark:text-warm-300 mb-3">
            FindA.Sale will check with eBay that the order was cancelled or refunded, and that the item has a live eBay listing again.
          </p>
        )}

        <p className="text-sm text-warm-700 dark:text-warm-300 mb-3">
          Listings that were paused or ended when it sold are not relisted automatically. Relist it on any marketplace where you want it
          to appear.
        </p>

        {needsAttestation && (
          <label className="flex items-start gap-2 text-sm text-warm-800 dark:text-warm-200 mb-4 cursor-pointer">
            <input
              type="checkbox"
              checked={attested}
              onChange={(e) => setAttested(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-warm-300 dark:border-gray-600 text-amber-600 focus:ring-amber-500"
            />
            <span>The sale was cancelled on {marketplace}. FindA.Sale cannot check this for you.</span>
          </label>
        )}

        {refusal && (
          <div role="alert" className="mb-4 p-3 rounded border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
            {refusal}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={reopen.isPending}
            className="px-4 py-2 rounded border border-warm-300 dark:border-gray-600 text-warm-700 dark:text-warm-200 hover:bg-warm-50 dark:hover:bg-gray-700 font-medium transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={reopen.isPending || (needsAttestation && !attested)}
            className="px-4 py-2 rounded bg-amber-600 text-white hover:bg-amber-700 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {reopen.isPending ? 'Working...' : 'Mark available again'}
          </button>
        </div>
      </div>
    </AccessibleModal>
  );
};

export default ReopenSaleDialog;
