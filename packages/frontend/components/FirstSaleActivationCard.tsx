/**
 * FirstSaleActivationCard
 *
 * One clear next step for organizers who have not activated yet. Driven entirely by
 * the GET /sales/mine response the dashboard and the sales list already fetch
 * (status + stats.itemCount, see saleController.getMySales), so it adds no requests.
 *
 * Two cases, highest priority first:
 * 1. A PUBLISHED sale with 0 items: shoppers can find it but there is nothing to browse.
 *    CTA -> /organizer/add-items/[saleId]
 * 2. A DRAFT sale with items > 0 while no sale is live: the work is done but hidden.
 *    CTA -> /organizer/edit-sale/[saleId] (where the Publish button lives; it calls
 *    PATCH /sales/:id/status and handles the SIMPLE-tier a la carte flow).
 *
 * Renders nothing when neither case applies. Loading and error states belong to the
 * parent page's existing /sales/mine query handling.
 */

import React from 'react';
import Link from 'next/link';

export interface ActivationSale {
  id: string;
  title: string;
  status: string;
  stats?: { itemCount?: number };
  items?: Array<unknown>;
}

export type ActivationTarget =
  | { kind: 'live-empty'; sale: ActivationSale }
  | { kind: 'draft-ready'; sale: ActivationSale; itemCount: number };

const itemCountOf = (sale: ActivationSale): number =>
  sale.stats?.itemCount ?? sale.items?.length ?? 0;

/**
 * Pick the single sale the organizer should act on next, or null.
 * preferredSaleId (e.g. the dashboard's primary sale) wins when it qualifies.
 */
export function getActivationTarget(
  sales: ActivationSale[] | undefined | null,
  preferredSaleId?: string | null
): ActivationTarget | null {
  if (!sales || sales.length === 0) return null;

  const liveEmpty = sales.filter((s) => s.status === 'PUBLISHED' && itemCountOf(s) === 0);
  if (liveEmpty.length > 0) {
    const sale = liveEmpty.find((s) => s.id === preferredSaleId) ?? liveEmpty[0];
    return { kind: 'live-empty', sale };
  }

  // Only nudge to publish when nothing is live; an organizer running a live sale
  // while prepping the next one does not need this.
  if (sales.some((s) => s.status === 'PUBLISHED')) return null;

  const draftsWithItems = sales.filter((s) => s.status === 'DRAFT' && itemCountOf(s) > 0);
  if (draftsWithItems.length > 0) {
    const sale =
      draftsWithItems.find((s) => s.id === preferredSaleId) ??
      [...draftsWithItems].sort((a, b) => itemCountOf(b) - itemCountOf(a))[0];
    return { kind: 'draft-ready', sale, itemCount: itemCountOf(sale) };
  }

  return null;
}

interface FirstSaleActivationCardProps {
  target: ActivationTarget | null;
  className?: string;
}

const FirstSaleActivationCard: React.FC<FirstSaleActivationCardProps> = ({ target, className = '' }) => {
  if (!target) return null;

  const isLiveEmpty = target.kind === 'live-empty';
  const title = target.sale.title || 'your sale';

  const heading = isLiveEmpty
    ? 'Your sale is live but has no items yet'
    : `You have ${target.itemCount} item${target.itemCount === 1 ? '' : 's'} ready in ${title}`;

  const body = isLiveEmpty
    ? `Shoppers can already find ${title}. Add your first item so they have something to browse.`
    : 'Shoppers cannot see this sale until you publish it. Publish to go live.';

  const ctaLabel = isLiveEmpty ? 'Add your first item' : 'Publish your sale';
  const ctaHref = isLiveEmpty
    ? `/organizer/add-items/${target.sale.id}`
    : `/organizer/edit-sale/${target.sale.id}`;

  return (
    <section
      aria-label="Next step"
      className={`bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-300 dark:border-amber-700 rounded-lg p-4 sm:p-5 ${className}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <span className="text-2xl flex-shrink-0" aria-hidden="true">
            {isLiveEmpty ? '📷' : '🚀'}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300 mb-1">
              Next step
            </p>
            <h2 className="text-lg font-bold text-amber-900 dark:text-amber-100 break-words">{heading}</h2>
            <p className="text-sm text-amber-800 dark:text-amber-200 mt-1 break-words">{body}</p>
          </div>
        </div>
        <Link
          href={ctaHref}
          className="w-full sm:w-auto inline-flex items-center justify-center min-h-[44px] bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2.5 px-5 rounded-lg transition-colors text-sm flex-shrink-0"
        >
          {ctaLabel} →
        </Link>
      </div>
    </section>
  );
};

export default FirstSaleActivationCard;
