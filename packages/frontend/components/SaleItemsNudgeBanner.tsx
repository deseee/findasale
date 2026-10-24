/**
 * SaleItemsNudgeBanner: per-sale items banner for edit-sale and the organizer sale detail page.
 * Spec: claude_docs/ux-spotchecks/guided-first-sale-flow-spec-2026-10-12.md section B3 (+ C2 focus).
 *
 * State comes from GET /sales/mine (stats.itemCount = every item, stats.liveItemCount = items
 * shoppers can see), not from the sale's public item list, so a draft with unreviewed items is
 * never told it has no items. No dismiss on per-sale banners.
 *
 * Fallback (edit-sale only): when /sales/mine errors, or does not include this sale (e.g. a
 * workspace member editing someone else's sale), fallbackLiveCount === 0 shows the
 * LIVE_EMPTY / DRAFT_EMPTY copy, matching the banner this replaced.
 */
import React, { forwardRef } from 'react';
import Link from 'next/link';
import { Package, Rocket, ClipboardCheck } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useSaleItemStatus, getSaleItemState, pluralItems, SaleItemState } from '../hooks/useSaleItemStatus';
import { fetchSalePublishReadiness } from '../lib/publishSale';

interface SaleItemsNudgeBannerProps {
  saleId: string;
  /** edit-sale passes its existing publish handler; without it DRAFT_READY links to edit-sale. */
  onPublish?: () => void;
  /** Public item count the page already has, used only when the status hook cannot answer. */
  fallbackLiveCount?: number;
  /** Sale status the page already has, paired with fallbackLiveCount. */
  fallbackStatus?: string;
  /** Disables the publish button while the page's own publish request runs. */
  publishBusy?: boolean;
  className?: string;
}

const SaleItemsNudgeBanner = forwardRef<HTMLButtonElement, SaleItemsNudgeBannerProps>(function SaleItemsNudgeBanner(
  { saleId, onPublish, fallbackLiveCount, fallbackStatus, publishBusy = false, className = '' },
  publishButtonRef,
) {
  const { isLoading, isError, findSale } = useSaleItemStatus();
  // 2026-10-23 (first-sale QA): the "still need review" line must use the same ready / not-ready split as
  // the publish dialog (PublishSaleItemsDialog), otherwise the banner said "2 items still need review" while
  // the dialog called the same 2 items ready. Same endpoint, so both always agree.
  const { data: readiness } = useQuery({
    queryKey: ['sale-publish-readiness', saleId],
    queryFn: () => fetchSalePublishReadiness(saleId),
    enabled: !!saleId,
    staleTime: 15_000,
  });

  if (isLoading) return null;

  const sale = findSale(saleId);
  let state: SaleItemState;
  let total = 0;
  let live: number | undefined;

  // The banner this replaced on edit-sale also showed for an ended sale with no items; keep that.
  let endedEmpty = false;

  if (!isError && sale) {
    state = getSaleItemState(sale);
    total = sale.stats?.itemCount ?? 0;
    live = sale.stats?.liveItemCount;
    endedEmpty = sale.status === 'ENDED' && total === 0;
  } else if (fallbackLiveCount === 0 && fallbackStatus === 'ENDED') {
    state = 'OK';
    endedEmpty = true;
  } else if (fallbackLiveCount === 0 && (fallbackStatus === 'PUBLISHED' || fallbackStatus === 'DRAFT')) {
    state = fallbackStatus === 'PUBLISHED' ? 'LIVE_EMPTY' : 'DRAFT_EMPTY';
  } else {
    return null;
  }

  if (state === 'OK' && !endedEmpty) return null;

  const addItemsHref = `/organizer/add-items/${saleId}`;
  const primaryClass =
    'inline-flex items-center justify-center w-full sm:w-auto flex-shrink-0 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg px-4 min-h-[44px] text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 disabled:opacity-60 disabled:cursor-not-allowed';

  let heading = '';
  let body = '';
  let action: React.ReactNode = null;
  let Icon = Package;
  const isDraftReady = state === 'DRAFT_READY';

  if (endedEmpty) {
    heading = 'This sale has no items yet';
    body = 'Add items to this sale.';
    action = <Link href={addItemsHref} className={primaryClass}>Add items</Link>;
  } else if (state === 'LIVE_EMPTY') {
    heading = 'This sale is live with no items';
    body = "Shoppers can see the dates and place, but there's nothing to browse.";
    action = <Link href={addItemsHref} className={primaryClass}>Add your first item</Link>;
  } else if (state === 'LIVE_UNREVIEWED') {
    Icon = ClipboardCheck;
    heading = 'Items waiting for review';
    body =
      total === 1
        ? `${pluralItems(total)} won't show to shoppers until you review it.`
        : `${pluralItems(total)} won't show to shoppers until you review them.`;
    action = <Link href={`${addItemsHref}/review`} className={primaryClass}>Review items</Link>;
  } else if (state === 'DRAFT_EMPTY') {
    heading = 'No items yet';
    body = "Add items now, then publish when you're ready.";
    action = <Link href={addItemsHref} className={primaryClass}>Add items</Link>;
  } else {
    // DRAFT_READY
    Icon = Rocket;
    heading = 'Ready to publish';
    body = `You've added ${pluralItems(total)}. Shoppers can't see this sale until you publish it.`;
    action = onPublish ? (
      <button ref={publishButtonRef} type="button" onClick={onPublish} disabled={publishBusy} className={primaryClass}>
        Publish sale
      </button>
    ) : (
      <Link href={`/organizer/edit-sale/${saleId}?publish=1`} className={primaryClass}>
        Review and publish
      </Link>
    );
  }

  const unreviewed = isDraftReady && typeof live === 'number' && live < total ? total - live : 0;
  const tone = isDraftReady
    ? 'bg-sage-50 dark:bg-gray-800 border-sage-300 dark:border-sage-700'
    : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700';
  const iconTone = isDraftReady ? 'text-sage-700 dark:text-sage-200' : 'text-amber-700 dark:text-amber-300';

  return (
    <div
      role="region"
      aria-label={heading}
      id={isDraftReady ? 'sale-ready-to-publish' : undefined}
      className={`rounded-lg border p-4 ${tone} ${className}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <Icon className={`h-5 w-5 mt-0.5 flex-shrink-0 ${iconTone}`} aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-semibold text-warm-900 dark:text-warm-100">{heading}</p>
            <p className="text-sm text-warm-700 dark:text-warm-300">{body}</p>
            {unreviewed > 0 && readiness && readiness.readyItems.length > 0 && (
              <p className="text-sm text-warm-700 dark:text-warm-300">
                {readiness.readyItems.length === 1
                  ? '1 more item is ready and can go live when you publish.'
                  : `${readiness.readyItems.length} more items are ready and can go live when you publish.`}
              </p>
            )}
            {unreviewed > 0 && (readiness ? readiness.notReadyItems.length > 0 : true) && (
              <p className="text-sm text-warm-700 dark:text-warm-300">
                {(() => {
                  if (!readiness) {
                    return unreviewed === 1
                      ? '1 item is not published yet. You can publish now and finish it after.'
                      : `${unreviewed} items are not published yet. You can publish now and finish them after.`;
                  }
                  const n = readiness.notReadyItems.length;
                  return n === 1
                    ? '1 item isn’t ready yet (needs a title, price or photo, or is hidden). You can publish now and finish it after.'
                    : `${n} items aren’t ready yet (they need a title, price or photo, or are hidden). You can publish now and finish them after.`;
                })()}
              </p>
            )}
          </div>
        </div>
        {action}
      </div>
    </div>
  );
});

export default SaleItemsNudgeBanner;
