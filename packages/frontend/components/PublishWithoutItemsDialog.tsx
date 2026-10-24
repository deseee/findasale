/**
 * PublishWithoutItemsDialog: confirm step before publishing a sale that has no items
 * (guided first-sale flow spec, section A1). Publishing stays one extra tap away; nothing is blocked.
 * Used by create-sale Step 5 and, through hooks/useGuardedPublish.tsx, by every other publish path
 * (edit-sale, dashboard). The server refuses an empty publish with 409 EMPTY_SALE_PUBLISH; only the
 * "Publish, then add items" choice here sends allowEmpty (lib/publishSale.ts).
 */
import React, { useEffect, useRef } from 'react';
import AccessibleModal from './AccessibleModal';
import { VerifyEmailResendButton } from './VerifyEmailToPublishBanner';

interface PublishWithoutItemsDialogProps {
  isOpen: boolean;
  onPublish: () => void;
  onAddItemsFirst: () => void;
  onCancel: () => void;
  busy?: 'publish' | 'draft' | null;
  /** Shown under the secondary button (create-sale only). */
  addItemsFirstHelper?: string;
  /** 2026-10-23: the organizer's email is not verified yet, so publishing will save a draft instead. */
  needsVerification?: boolean;
}

const TITLE_ID = 'publish-without-items-title';
const BODY_ID = 'publish-without-items-body';

const PublishWithoutItemsDialog: React.FC<PublishWithoutItemsDialogProps> = ({
  isOpen,
  onPublish,
  onAddItemsFirst,
  onCancel,
  busy = null,
  addItemsFirstHelper,
  needsVerification = false,
}) => {
  const primaryRef = useRef<HTMLButtonElement>(null);

  // Initial focus on the primary action. Focus return is handled by the caller's trigger button
  // (FocusTrap returns focus to the previously focused element on deactivate).
  useEffect(() => {
    if (!isOpen) return;
    const t = window.setTimeout(() => primaryRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [isOpen]);

  const isBusy = busy === 'publish' || busy === 'draft';
  const handleClose = () => {
    if (!isBusy) onCancel();
  };

  const btnBase =
    'w-full sm:flex-1 min-h-[44px] rounded-lg px-4 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800 disabled:opacity-60 disabled:cursor-not-allowed';

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={handleClose}
      ariaLabelledBy={TITLE_ID}
      ariaDescribedBy={BODY_ID}
      contentClassName="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg shadow-xl w-full max-w-md p-4 sm:p-6"
    >
      <div>
        <h2 id={TITLE_ID} className="text-lg font-semibold text-warm-900 dark:text-warm-100">
          Publish without items?
        </h2>
        <p id={BODY_ID} className="mt-2 text-sm text-warm-700 dark:text-warm-300">
          Your sale page will show the dates and place, but there won&apos;t be anything for shoppers to browse yet.
          You can add items right after you publish.
        </p>
        {needsVerification && (
          <div className="mt-3 rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3">
            <p className="text-sm text-amber-900 dark:text-amber-100">
              Your email isn&apos;t verified yet, so your sale will be saved as a draft. Verify your email to publish it.
            </p>
            <VerifyEmailResendButton className="mt-2 w-full sm:w-auto" />
          </div>
        )}

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-start">
          <button
            ref={primaryRef}
            type="button"
            onClick={onPublish}
            disabled={isBusy}
            className={`${btnBase} bg-amber-600 hover:bg-amber-700 text-white`}
          >
            {busy === 'publish' ? 'Publishing…' : 'Publish, then add items'}
          </button>
          <div className="w-full sm:flex-1">
            <button
              type="button"
              onClick={onAddItemsFirst}
              disabled={isBusy}
              className={`${btnBase} w-full border border-warm-300 dark:border-gray-600 bg-transparent text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700`}
            >
              {busy === 'draft' ? 'Saving…' : 'Add items first'}
            </button>
            {addItemsFirstHelper && (
              <p className="mt-1 text-xs text-warm-600 dark:text-warm-400 text-center">{addItemsFirstHelper}</p>
            )}
          </div>
        </div>

        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={handleClose}
            disabled={isBusy}
            className="min-h-[44px] px-4 text-sm text-warm-700 dark:text-warm-300 underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-60"
          >
            Go back
          </button>
        </div>
      </div>
    </AccessibleModal>
  );
};

export default PublishWithoutItemsDialog;
