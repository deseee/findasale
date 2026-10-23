/**
 * FirstSaleNudge: dashboard card for a live sale with no items (or none shoppers can see yet)
 * and for a draft sale that has items but was never published.
 * Spec: claude_docs/ux-spotchecks/guided-first-sale-flow-spec-2026-10-12.md sections B1 and C1.
 *
 * One card only (highest-priority sale). No close button: "Remind me later" collapses it to a
 * one-line bar for 24 hours, and the bar still carries the primary action. The card goes away on
 * its own once the sale has items / is published / is ended.
 * Renders nothing while loading, on error, or when no sale qualifies.
 *
 * STALE_DATES (2026-10-23): a draft or live sale whose dates have passed with nothing sold gets
 * "Pick new dates" with a one-click "Move to <next weekend>" (RedateSalePrompt, POST /sales/:id/redate).
 * Once re-dated the sale drops out of this state and the card moves on to its next step
 * (publish, or add items).
 */
import React, { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { Package, Rocket, CalendarClock } from 'lucide-react';
import { useSaleItemStatus, pluralItems, trackNudgeEvent, SaleItemNudge } from '../hooks/useSaleItemStatus';
import RedateSalePrompt from './RedateSalePrompt';

const COLLAPSE_KEY = 'findasale_itemNudgeCollapsed';
const COLLAPSE_MS = 24 * 60 * 60 * 1000;

function readCollapsed(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(COLLAPSE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeCollapsed(map: Record<string, string>): void {
  try {
    window.localStorage.setItem(COLLAPSE_KEY, JSON.stringify(map));
  } catch {
    /* storage unavailable: the card simply stays expanded */
  }
}

function isCollapsedNow(saleId: string): boolean {
  const at = readCollapsed()[saleId];
  if (!at) return false;
  const t = Date.parse(at);
  return Number.isFinite(t) && Date.now() - t < COLLAPSE_MS;
}

interface Copy {
  eyebrow: string;
  heading: string;
  body: string;
  extra?: string;
  primaryLabel: string;
  primaryHref: string;
  collapsedText: string;
  collapsedButton: string;
  updateDatesHref?: string;
}

function buildCopy(n: SaleItemNudge): Copy {
  const { sale, state, total, live } = n;
  const title = sale.title?.trim() || 'Your sale';
  if (state === 'STALE_DATES') {
    return {
      eyebrow: 'Dates have passed',
      heading: `${title} needs new dates`,
      body:
        total > 0
          ? `Your ${pluralItems(total)} ${total === 1 ? 'is' : 'are'} saved. Pick new dates so shoppers can find this sale.`
          : "Shoppers can't find a sale whose dates have passed. Pick new dates to bring it back.",
      extra: 'One tap moves it to next weekend, same hours and length.',
      primaryLabel: 'Pick new dates',
      primaryHref: `/organizer/edit-sale/${sale.id}?redate=1`,
      collapsedText: `${title} needs new dates.`,
      collapsedButton: 'Pick new dates',
    };
  }
  if (state === 'LIVE_EMPTY') {
    const end = sale.endDate ? Date.parse(sale.endDate) : NaN;
    const pastDates = Number.isFinite(end) && end < Date.now() && sale.saleType !== 'RETAIL';
    return {
      eyebrow: 'Your sale is live',
      heading: `${title} has no items yet`,
      body: pastDates
        ? "This sale's dates have passed and it has no items. Add items or update the dates to keep it useful."
        : "Shoppers can see your sale on the map, but there's nothing for them to browse. Add a few items to give them a reason to come.",
      primaryLabel: 'Add your first item',
      primaryHref: `/organizer/add-items/${sale.id}`,
      collapsedText: `${title} has no items yet.`,
      collapsedButton: 'Add items',
      updateDatesHref: pastDates ? `/organizer/edit-sale/${sale.id}` : undefined,
    };
  }
  if (state === 'LIVE_UNREVIEWED') {
    return {
      eyebrow: 'Your sale is live',
      heading: `${title} has items shoppers can't see yet`,
      body:
        total === 1
          ? `${pluralItems(total)} needs review before it shows on your sale page.`
          : `${pluralItems(total)} need review before they show on your sale page.`,
      primaryLabel: 'Review items',
      primaryHref: `/organizer/add-items/${sale.id}/review`,
      collapsedText: `${title} has items shoppers can't see yet.`,
      collapsedButton: 'Review items',
    };
  }
  // DRAFT_READY
  const unreviewed = typeof live === 'number' && live < total ? total - live : 0;
  return {
    eyebrow: 'Draft, not published',
    heading: `${title} is ready to publish`,
    body: `You've added ${pluralItems(total)}. Shoppers can't see this sale until you publish it.`,
    extra:
      unreviewed > 0
        ? unreviewed === 1
          ? '1 item still needs review. You can publish now and review it after.'
          : `${unreviewed} items still need review. You can publish now and review them after.`
        : undefined,
    primaryLabel: 'Review and publish',
    primaryHref: `/organizer/edit-sale/${sale.id}?publish=1`,
    collapsedText: `${title} is ready to publish.`,
    collapsedButton: 'Review and publish',
  };
}

const FirstSaleNudge: React.FC = () => {
  const { nudges } = useSaleItemStatus();
  const headingId = useId();
  const top = nudges[0];
  const saleId = top?.sale.id;
  const state = top?.state;

  const [collapsed, setCollapsed] = useState(false);
  const [expandedOverride, setExpandedOverride] = useState(false);

  // Read the collapse flag on the client only (localStorage), re-read when the featured sale changes.
  useEffect(() => {
    if (!saleId) return;
    setCollapsed(isCollapsedNow(saleId));
    setExpandedOverride(false);
  }, [saleId]);

  useEffect(() => {
    if (saleId && state) trackNudgeEvent('item_nudge_shown', { state, sale_id: saleId });
  }, [saleId, state]);

  if (!top) return null;

  const copy = buildCopy(top);
  const isDraft = top.state === 'DRAFT_READY';
  const isStale = top.state === 'STALE_DATES';
  const moreCount = nudges.length - 1;
  const showCollapsed = collapsed && !expandedOverride;

  const containerTone = isDraft
    ? 'bg-sage-50 dark:bg-gray-800 border-sage-300 dark:border-sage-700'
    : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700';
  const eyebrowTone = isDraft ? 'text-sage-700 dark:text-sage-200' : 'text-amber-800 dark:text-amber-200';
  const Icon = isStale ? CalendarClock : isDraft ? Rocket : Package;

  const primaryClass =
    'inline-flex items-center justify-center bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg px-4 min-h-[44px] text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900';

  const onPrimary = () => trackNudgeEvent('item_nudge_clicked', { state: top.state, sale_id: top.sale.id });

  const remindLater = () => {
    const map = readCollapsed();
    map[top.sale.id] = new Date().toISOString();
    writeCollapsed(map);
    setCollapsed(true);
    setExpandedOverride(false);
  };

  const moreLink =
    moreCount > 0 ? (
      <Link
        href="/organizer/sales"
        className="inline-flex items-center min-h-[44px] text-sm underline text-warm-700 dark:text-warm-300"
      >
        {moreCount === 1 ? '1 more sale needs attention' : `${moreCount} more sales need attention`}
      </Link>
    ) : null;

  if (showCollapsed) {
    return (
      <div
        role="region"
        aria-labelledby={headingId}
        className={`mb-6 rounded-lg border py-2 px-3 ${containerTone}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={`h-4 w-4 flex-shrink-0 ${eyebrowTone}`} aria-hidden="true" />
          <p id={headingId} className="flex-1 min-w-0 truncate text-sm font-medium text-warm-900 dark:text-warm-100">
            {copy.collapsedText}
          </p>
          <button
            type="button"
            aria-expanded={false}
            onClick={() => setExpandedOverride(true)}
            className="hidden sm:inline-flex flex-shrink-0 items-center min-h-[44px] px-2 text-sm underline text-warm-700 dark:text-warm-300"
          >
            Show details
          </button>
          <Link href={copy.primaryHref} onClick={onPrimary} className={`${primaryClass} flex-shrink-0`}>
            {copy.collapsedButton}
          </Link>
        </div>
        <div className="sm:hidden flex justify-center">
          <button
            type="button"
            aria-expanded={false}
            onClick={() => setExpandedOverride(true)}
            className="inline-flex items-center min-h-[44px] px-2 text-sm underline text-warm-700 dark:text-warm-300"
          >
            Show details
          </button>
        </div>
      </div>
    );
  }

  return (
    <div role="region" aria-labelledby={headingId} className={`mb-6 rounded-lg border p-4 sm:p-5 ${containerTone}`}>
      <div className="sm:flex sm:items-center sm:justify-between sm:gap-6">
        <div className="min-w-0 flex-1">
          <p className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${eyebrowTone}`}>
            <Icon className="h-4 w-4" aria-hidden="true" />
            {copy.eyebrow}
          </p>
          <h2 id={headingId} className="mt-1 text-lg font-semibold text-warm-900 dark:text-warm-100 break-words">
            {copy.heading}
          </h2>
          <p className="mt-1 text-sm text-warm-700 dark:text-warm-300">{copy.body}</p>
          {copy.extra && <p className="mt-1 text-sm text-warm-700 dark:text-warm-300">{copy.extra}</p>}
          {copy.updateDatesHref && (
            <Link
              href={copy.updateDatesHref}
              className="inline-flex items-center min-h-[44px] text-sm underline text-warm-700 dark:text-warm-300"
            >
              Update dates
            </Link>
          )}
        </div>
        <div className="mt-4 sm:mt-0 flex flex-col items-center sm:items-end gap-1 flex-shrink-0">
          {isStale && top.sale.endDate ? (
            <RedateSalePrompt
              variant="inline"
              saleId={top.sale.id}
              startDate={top.sale.startDate || top.sale.endDate}
              endDate={top.sale.endDate}
              onRedated={() => trackNudgeEvent('item_nudge_clicked', { state: top.state, sale_id: top.sale.id, action: 'redate_next_weekend' })}
              className="w-full sm:w-auto"
            />
          ) : (
            <Link href={copy.primaryHref} onClick={onPrimary} className={`${primaryClass} w-full sm:w-auto`}>
              {copy.primaryLabel}
            </Link>
          )}
          <button
            type="button"
            onClick={remindLater}
            className="min-h-[44px] px-2 text-sm underline text-warm-700 dark:text-warm-300"
          >
            Remind me later
          </button>
        </div>
      </div>
      {moreLink && <div className="mt-2 flex justify-center sm:justify-start">{moreLink}</div>}
    </div>
  );
};

export default FirstSaleNudge;
