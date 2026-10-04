import React, { useState } from 'react';
import Link from 'next/link';
import { ETSY_SECTION_COPY } from '../../lib/etsyCopy';
import {
  deriveEtsyListingView,
  deriveEtsySection,
} from '../../lib/etsyUiState';
import type { EtsyChip, EtsyItemInput, EtsySectionState } from '../../lib/etsyUiState';
import { useEtsyConnection, useEtsyEligibility, useEtsyListing } from '../../lib/useEtsyConnection';
import EtsyDraftReviewModal from './EtsyDraftReviewModal';

// ADR-135 batch E-B5 (D8). Per-item Etsy section for pages/organizer/edit-item/[id].tsx and the status
// chip. Everything it decides comes from lib/etsyUiState.ts (unit tested). It renders nothing when the
// connector is off, the shop is not connected, or the organizer is not allowed (the server answers
// that on GET /api/etsy/connection; there is no build-time public env flag).
//
// This section sits inside the edit-item <form>, so every button here is type="button".

const TONE_CLASSES: Record<EtsyChip['tone'], string> = {
  neutral: 'bg-warm-100 text-warm-800 dark:bg-gray-700 dark:text-gray-100',
  info: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  warning: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200',
  success: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
  danger: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
};

/** Small status chip: Preparing, Creating draft, Draft ready, Live on Etsy, Ended, Sold on Etsy, Needs attention. */
export function EtsyStatusChip({ chip }: { chip: EtsyChip }) {
  return (
    <span
      data-testid="etsy-status-chip"
      data-state={chip.state}
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${TONE_CLASSES[chip.tone]}`}
    >
      {chip.label}
    </span>
  );
}

export interface EtsyListingStatusViewProps {
  section: EtsySectionState;
  chip: EtsyChip | null;
  failureMessage: string | null;
  failureDetail: string | null;
  /** The connection or the item's Etsy state is still loading. */
  isLoading: boolean;
  errorMessage: string | null;
  onRetry: () => void;
  onOpen: () => void;
}

export function EtsyListingStatusView(props: EtsyListingStatusViewProps) {
  const { section, chip } = props;
  if (section.kind === 'hidden') return null;

  return (
    <div className="pt-4 border-t border-warm-200 dark:border-gray-700" data-testid="etsy-section" data-kind={section.kind}>
      <h3 className="text-sm font-semibold text-warm-700 dark:text-gray-300 mb-2">{ETSY_SECTION_COPY.heading}</h3>

      {props.isLoading && (
        <p role="status" className="text-sm text-warm-600 dark:text-gray-400">
          {ETSY_SECTION_COPY.loading}
        </p>
      )}

      {!props.isLoading && props.errorMessage && (
        <div role="alert" className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 space-y-2">
          <p className="text-sm text-red-700 dark:text-red-300 break-words">{props.errorMessage}</p>
          <button
            type="button"
            onClick={props.onRetry}
            className="min-h-[44px] px-4 rounded-lg bg-warm-100 dark:bg-gray-700 hover:bg-warm-200 dark:hover:bg-gray-600 text-warm-900 dark:text-gray-100 text-sm font-semibold"
          >
            {ETSY_SECTION_COPY.retry}
          </button>
        </div>
      )}

      {!props.isLoading && !props.errorMessage && section.kind === 'reconnect' && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 space-y-2">
          <p className="text-sm text-amber-900 dark:text-amber-200">{section.message}</p>
          <Link
            href="/organizer/settings?tab=etsy"
            className="inline-flex items-center min-h-[44px] text-sm font-semibold text-amber-700 dark:text-amber-300 underline"
          >
            {ETSY_SECTION_COPY.reconnectLink}
          </Link>
        </div>
      )}

      {!props.isLoading && !props.errorMessage && section.kind === 'blocked' && (
        <p className="text-sm text-warm-600 dark:text-gray-400 break-words">{section.message}</p>
      )}

      {!props.isLoading && !props.errorMessage && section.kind === 'ineligible' && (
        <div className="rounded-lg border border-warm-200 dark:border-gray-600 bg-warm-50 dark:bg-gray-800 p-3">
          <p className="text-sm text-warm-700 dark:text-gray-300 break-words">{section.message}</p>
        </div>
      )}

      {!props.isLoading && !props.errorMessage && section.kind === 'prepare' && (
        <div className="space-y-2">
          <p className="text-sm text-warm-600 dark:text-gray-400">{ETSY_SECTION_COPY.prepareHelp}</p>
          {section.hint && <p className="text-xs text-warm-500 dark:text-gray-400 break-words">{section.hint}</p>}
          <button
            type="button"
            onClick={props.onOpen}
            className="w-full min-h-[44px] bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
          >
            {section.buttonLabel}
          </button>
          <p className="text-xs text-warm-500 dark:text-gray-400">{ETSY_SECTION_COPY.priceNote}</p>
        </div>
      )}

      {!props.isLoading && !props.errorMessage && section.kind === 'status' && chip && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <EtsyStatusChip chip={chip} />
          </div>
          <p className="text-sm text-warm-600 dark:text-gray-400 break-words">{chip.detail}</p>
          {props.failureDetail && props.failureMessage && (
            <p className="text-xs text-warm-500 dark:text-gray-400 break-words">{props.failureDetail}</p>
          )}
          {section.buttonLabel && (
            <button
              type="button"
              onClick={props.onOpen}
              className="w-full min-h-[44px] bg-warm-100 dark:bg-gray-700 hover:bg-warm-200 dark:hover:bg-gray-600 text-warm-900 dark:text-gray-100 font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              {section.buttonLabel}
            </button>
          )}
          <p className="text-xs text-warm-500 dark:text-gray-400">{ETSY_SECTION_COPY.priceNote}</p>
        </div>
      )}
    </div>
  );
}

export interface EtsyListingStatusProps {
  /** The facts this section needs from the item (the server re-reads everything itself). */
  item: EtsyItemInput;
}

/** Per-item Etsy section with the draft review window. Mount it inside the edit-item page. */
export default function EtsyListingStatus({ item }: EtsyListingStatusProps) {
  const { connection } = useEtsyConnection();
  const applicable = Boolean(connection && connection.enabled && connection.hasAccount && connection.allowed);
  const listingQuery = useEtsyListing(item.id, applicable);
  const eligibilityQuery = useEtsyEligibility(item.id, applicable);
  const [open, setOpen] = useState(false);

  const listing = listingQuery.listing ?? null;
  const view = deriveEtsyListingView(listing);
  const section = deriveEtsySection({
    connection,
    eligibility: eligibilityQuery.eligibility ?? null,
    listing,
    labels: {
      prepare: ETSY_SECTION_COPY.prepare,
      seeProgress: ETSY_SECTION_COPY.seeProgress,
      reviewAndPublish: ETSY_SECTION_COPY.reviewAndPublish,
      viewDetails: ETSY_SECTION_COPY.viewDetails,
      fixAndRetry: ETSY_SECTION_COPY.fixAndRetry,
      pushPaused: ETSY_SECTION_COPY.pushPaused,
    },
  });

  return (
    <>
      <EtsyListingStatusView
        section={section}
        chip={view.chip}
        failureMessage={view.failureMessage}
        failureDetail={view.failureDetail}
        isLoading={applicable && listingQuery.isLoading}
        errorMessage={applicable && listingQuery.isError ? ETSY_SECTION_COPY.loadError : null}
        onRetry={() => {
          listingQuery.refetch();
          eligibilityQuery.refetch();
        }}
        onOpen={() => setOpen(true)}
      />
      {applicable && <EtsyDraftReviewModal isOpen={open} onClose={() => setOpen(false)} item={item} />}
    </>
  );
}
