/**
 * Marketplace notices for the item form: the failure banner, the save result row, and the eBay sync paused panel.
 * Presentational: state and requests live in useItemMarketplace.
 *
 * Copy follows the brand rules: plain words, no em dashes, never the word "AI". Every button is type="button" (these sit
 * inside the item <form>).
 */
import React, { useState } from 'react';
import type { PushRow } from '../../lib/itemMarketplaceApi';
import { describePushOutcome, fieldList } from '../../lib/marketplaceImpact';
import type { OutcomeView } from '../../lib/marketplaceImpact';
import type { HoldActionResult, SaveOutcome } from './useItemMarketplace';

const TONE: Record<OutcomeView['tone'], string> = {
  success: 'text-green-700 dark:text-green-400',
  error: 'text-red-700 dark:text-red-400',
  warning: 'text-amber-700 dark:text-amber-400',
  info: 'text-warm-700 dark:text-warm-300',
  pending: 'text-warm-700 dark:text-warm-300',
};

// ---------------------------------------------------------------------------------------------------------
// Banner at the top of the form: an eBay update failed and has not been acknowledged.
// ---------------------------------------------------------------------------------------------------------

export const PushFailureBanner: React.FC<{
  /** The newest failed or partial push the organizer has not acknowledged, when it is in the loaded history. */
  row: PushRow | null;
  onAcknowledge: () => void;
  pending: boolean;
}> = ({ row, onAcknowledge, pending }) => {
  const detail = row ? describePushOutcome(row).text : 'eBay did not accept your last update.';
  return (
    <div
      role="alert"
      data-testid="edit-item-push-failure-banner"
      className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3"
    >
      <p className="text-sm font-semibold text-red-800 dark:text-red-200">eBay did not take your last update.</p>
      <p className="mt-1 text-sm text-red-800 dark:text-red-200">{detail}</p>
      <p className="mt-1 text-xs text-red-700 dark:text-red-300">
        Your changes are saved here. Fix the problem and save again, or use Update eBay now.
      </p>
      <button
        type="button"
        onClick={onAcknowledge}
        disabled={pending}
        className="mt-2 min-h-[44px] px-4 text-sm font-semibold rounded-lg border border-red-300 dark:border-red-700 text-red-800 dark:text-red-200 bg-white dark:bg-gray-900 hover:bg-red-100 dark:hover:bg-red-900/40 disabled:opacity-50"
      >
        {pending ? 'Working...' : 'Acknowledge'}
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------------------------------------
// Result row next to Save: what the save did to eBay and the extension marketplaces.
// The wrapper is always mounted so a screen reader announces the text when it appears.
// ---------------------------------------------------------------------------------------------------------

export const SaveOutcomeRow: React.FC<{
  outcome: SaveOutcome | null;
  onRetry: () => void;
  /** True while an eBay request is in flight (the server answers 409 if one is already running). */
  retryDisabled: boolean;
}> = ({ outcome, onRetry, retryDisabled }) => {
  const view = outcome ? outcome.view : null;
  const lines = outcome ? outcome.extensionLines : [];
  return (
    <div aria-live="polite" aria-atomic="true" data-testid="edit-item-save-outcome" className="text-xs">
      {view ? (
        <div className={`mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 ${TONE[view.tone]}`}>
          <span className="font-medium">{view.text}</span>
          {view.canRetry ? (
            <button
              type="button"
              onClick={onRetry}
              disabled={retryDisabled}
              className="min-h-[44px] px-3 font-semibold rounded-lg border border-current bg-white dark:bg-gray-900 disabled:opacity-50"
            >
              {retryDisabled ? 'Retrying...' : 'Retry'}
            </button>
          ) : null}
        </div>
      ) : null}
      {lines.map((line) => (
        <p key={line} className="mt-1 font-medium text-amber-700 dark:text-amber-400">
          {line}
        </p>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------------------------------------
// eBay sync paused: chip, held fields, Update eBay now, Resume syncing (with a one-line confirm).
// ---------------------------------------------------------------------------------------------------------

export const EbayHoldPanel: React.FC<{
  heldAt: string | null;
  heldFields: string[];
  result: HoldActionResult | null;
  busy: boolean;
  updating: boolean;
  resuming: boolean;
  onUpdateNow: () => void;
  onResume: () => void;
}> = ({ heldAt, heldFields, result, busy, updating, resuming, onUpdateNow, onResume }) => {
  const [confirming, setConfirming] = useState(false);
  if (!heldAt && !result) return null;
  return (
    <div
      data-testid="edit-item-ebay-hold"
      className="rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3"
    >
      {heldAt ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
              eBay sync paused
            </span>
            <span className="text-xs text-amber-800 dark:text-amber-200">
              {heldFields.length > 0 ? `Not sent to eBay yet: ${fieldList(heldFields)}.` : 'Nothing is waiting to be sent.'}
            </span>
          </div>
          {confirming ? (
            <div className="mt-2" role="group" aria-label="Confirm resume syncing">
              <p className="text-xs text-amber-900 dark:text-amber-100">
                The next sync can replace text you have not sent to eBay with what is on eBay.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setConfirming(false);
                    onResume();
                  }}
                  className="min-h-[44px] px-4 text-sm font-semibold rounded-lg bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50"
                >
                  Resume syncing
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="min-h-[44px] px-4 text-sm font-semibold rounded-lg border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-100 bg-white dark:bg-gray-900"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={onUpdateNow}
                className="min-h-[44px] px-4 text-sm font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
              >
                {updating ? 'Updating eBay...' : 'Update eBay now'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirming(true)}
                className="min-h-[44px] px-4 text-sm font-semibold rounded-lg border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-100 bg-white dark:bg-gray-900 disabled:opacity-50"
              >
                {resuming ? 'Resuming...' : 'Resume syncing'}
              </button>
            </div>
          )}
        </>
      ) : null}
      <div aria-live="polite" aria-atomic="true">
        {result
          ? result.lines.map((line) => (
              <p key={line} className={`mt-2 text-xs font-medium ${TONE[result.tone]}`}>
                {line}
              </p>
            ))
          : null}
      </div>
    </div>
  );
};
