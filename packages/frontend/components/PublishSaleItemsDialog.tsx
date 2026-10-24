/**
 * PublishSaleItemsDialog: the confirm step for publishing (or reopening) a sale, 2026-10-23.
 *
 * When the sale has unpublished items, it offers "Also publish N ready items" (ticked by default) and lists
 * the items that are not ready yet and why (needs a title / price / photo, or hidden). Ready items go live in
 * the same server transaction as the sale (lib/publishSale.ts, saleController.updateSaleStatus). With no
 * unpublished items it is a plain "Publish this sale?" confirm. Used through hooks/useGuardedPublish.tsx by
 * every publish path outside the create-sale wizard (edit-sale, dashboard card, ?publish=1 links).
 *
 * needsVerification (2026-10-23): publishing needs a verified email. For an unverified organizer the dialog
 * explains that the draft is saved and offers a new verification link inline instead of a Publish button.
 */
import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import AccessibleModal from './AccessibleModal';
import type { SalePublishReadiness } from '../lib/publishSale';
import { VerifyEmailResendButton } from './VerifyEmailToPublishBanner';

export interface PublishSaleItemsDialogProps {
  isOpen: boolean;
  saleId: string;
  title: string;
  message: string;
  confirmLabel?: string;
  readiness: SalePublishReadiness | null;
  busy?: boolean;
  /** The organizer's email is not verified: explain and offer a new link instead of publishing. */
  needsVerification?: boolean;
  email?: string | null;
  onConfirm: (publishReadyItems: boolean) => void;
  onCancel: () => void;
}

const TITLE_ID = 'publish-sale-items-title';
const BODY_ID = 'publish-sale-items-body';

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

const PublishSaleItemsDialog: React.FC<PublishSaleItemsDialogProps> = ({
  isOpen,
  saleId,
  title,
  message,
  confirmLabel = 'Publish sale',
  readiness,
  busy = false,
  needsVerification = false,
  email = null,
  onConfirm,
  onCancel,
}) => {
  const primaryRef = useRef<HTMLButtonElement>(null);
  const [includeReady, setIncludeReady] = useState(true);

  // Default to "yes" every time the dialog opens.
  useEffect(() => {
    if (!isOpen) return;
    setIncludeReady(true);
    const t = window.setTimeout(() => primaryRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [isOpen]);

  const ready = readiness?.readyItems ?? [];
  const notReady = readiness?.notReadyItems ?? [];
  const readyCount = ready.length;
  // 2026-10-23 (first-sale QA): items saved straight to PUBLISHED (Manual Entry) are part of what goes
  // live too, so the confirm counts every item that will be visible: already-published plus ticked ready ones.
  const publishedCount = readiness?.publishedItemCount ?? 0;
  const visibleCount = publishedCount + (includeReady ? readyCount : 0);
  const handleClose = () => {
    if (!busy) onCancel();
  };

  const primaryText = busy
    ? 'Publishing…'
    : visibleCount > 0
      ? `${confirmLabel} with ${plural(visibleCount, 'item', 'items')}`
      : confirmLabel;

  const btnBase =
    'w-full sm:flex-1 min-h-[44px] rounded-lg px-4 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800 disabled:opacity-60 disabled:cursor-not-allowed';

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={handleClose}
      ariaLabelledBy={TITLE_ID}
      ariaDescribedBy={BODY_ID}
      contentClassName="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg shadow-xl w-full max-w-md p-4 sm:p-6 max-h-[90vh] overflow-y-auto"
    >
      <div>
        <h2 id={TITLE_ID} className="text-lg font-semibold text-warm-900 dark:text-warm-100">
          {needsVerification ? 'Verify your email to publish' : title}
        </h2>
        <p id={BODY_ID} className="mt-2 text-sm text-warm-700 dark:text-warm-300 break-words">
          {needsVerification
            ? `Your sale and items are saved as a draft. Publishing needs a verified email: open the link we sent${email ? ` to ${email}` : ''}, then publish. Check your spam folder too.`
            : message}
        </p>
        {!needsVerification && publishedCount > 0 && (
          <p className="mt-2 text-sm text-warm-700 dark:text-warm-300">
            {publishedCount === 1
              ? '1 item is already approved and shows on your sale page as soon as it goes live.'
              : `${publishedCount} items are already approved and show on your sale page as soon as it goes live.`}
          </p>
        )}

        {needsVerification && (
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <VerifyEmailResendButton className="w-full sm:flex-1" />
            <button
              ref={primaryRef}
              type="button"
              onClick={handleClose}
              className={`${btnBase} border border-warm-300 dark:border-gray-600 bg-transparent text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700`}
            >
              Close
            </button>
          </div>
        )}

        {!needsVerification && readyCount > 0 && (
          <label className="mt-4 flex items-start gap-3 rounded-lg border border-sage-300 dark:border-sage-700 bg-sage-50 dark:bg-gray-900 p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={includeReady}
              onChange={(e) => setIncludeReady(e.target.checked)}
              disabled={busy}
              className="mt-0.5 h-5 w-5 flex-shrink-0 rounded border-warm-400 dark:border-gray-500 text-amber-700 focus:ring-amber-500"
            />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-warm-900 dark:text-warm-100">
                Also publish {plural(readyCount, 'ready item', 'ready items')}
              </span>
              <span className="block text-xs text-warm-700 dark:text-warm-300">
                {includeReady
                  ? 'They show on your sale page as soon as it goes live.'
                  : 'They stay as drafts. Shoppers won’t see them until you publish them.'}
              </span>
            </span>
          </label>
        )}

        {!needsVerification && notReady.length > 0 && (
          <div className="mt-4">
            <p className="text-sm font-semibold text-warm-900 dark:text-warm-100">
              {readyCount === 0
                ? `None of your ${plural(notReady.length, 'item is', 'items are')} ready yet`
                : `${plural(notReady.length, 'item isn’t', 'items aren’t')} ready yet`}
            </p>
            <p className="text-xs text-warm-700 dark:text-warm-300">
              {notReady.length === 1 ? 'It stays a draft' : 'They stay as drafts'} until you finish{' '}
              {notReady.length === 1 ? 'it' : 'them'}. You can publish the sale now either way.
            </p>
            <ul className="mt-2 max-h-40 overflow-y-auto divide-y divide-warm-200 dark:divide-gray-700 rounded-lg border border-warm-200 dark:border-gray-700">
              {notReady.map((item) => (
                <li key={item.id} className="px-3 py-2 text-sm">
                  <span className="block truncate text-warm-900 dark:text-warm-100">{item.title}</span>
                  <span className="block text-xs text-amber-800 dark:text-amber-300">{item.reasonLabels.join(', ')}</span>
                </li>
              ))}
            </ul>
            <Link
              href={`/organizer/add-items/${saleId}/review`}
              className="mt-1 inline-flex items-center min-h-[44px] text-sm underline text-warm-700 dark:text-warm-300"
            >
              Finish these items first
            </Link>
          </div>
        )}

        {!needsVerification && (
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-start">
          <button
            ref={primaryRef}
            type="button"
            onClick={() => onConfirm(readyCount > 0 ? includeReady : true)}
            disabled={busy}
            className={`${btnBase} bg-[#C2410C] hover:bg-[#9A3412] text-white`}
          >
            {primaryText}
          </button>
          <button
            type="button"
            onClick={handleClose}
            disabled={busy}
            className={`${btnBase} border border-warm-300 dark:border-gray-600 bg-transparent text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-700`}
          >
            Go back
          </button>
        </div>
        )}
      </div>
    </AccessibleModal>
  );
};

export default PublishSaleItemsDialog;
