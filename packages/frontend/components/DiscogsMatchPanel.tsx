/**
 * DiscogsMatchPanel (ADR-132 section 5 / 11.4)
 *
 * Organizer-facing Discogs release matching for one item, rendered inside the edit-item
 * Discogs section: mismatch banner, release card, release picker (top candidates with veto
 * warnings, paste-a-link, "Not in Discogs"), "Re-check", and the editable record details
 * panel. The push buttons stay in the edit page; they read match.canPush.
 *
 * The match itself is fetched by the parent (query key ['discogs-match', itemId]); every
 * mutation here hands the fresh DiscogsMatchView back through onMatchUpdated so the parent
 * cache stays the single source of truth.
 */
import React, { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import api from '../lib/api';
import { useToast } from './ToastContext';
import DiscogsReleaseCard, { DiscogsStatusBadge } from './DiscogsReleaseCard';
import {
  DiscogsCorrectionFailure,
  DiscogsCorrectionResult,
  DiscogsMatchView,
  RecordIdentityFormat,
  RecordIdentitySource,
  RecordIdentityValues,
  discogsErrorCode,
  discogsErrorMessage,
  discogsReleaseUrl,
  parseDiscogsReleaseLink,
} from '../types/discogsMatch';

interface DiscogsMatchPanelProps {
  itemId: string;
  match: DiscogsMatchView | undefined;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  onMatchUpdated: (match: DiscogsMatchView) => void;
  /** Called when the Discogs listing itself changed (corrected, recreated or removed). */
  onListingChanged: () => void;
}

type CorrectionOutcome = DiscogsCorrectionResult | DiscogsCorrectionFailure;

const SOURCE_LABEL: Record<RecordIdentitySource, string> = {
  ai: 'Suggested',
  ocr: 'Read from photo',
  organizer: 'Entered by you',
  title_parse: 'From item title',
};

const FORMAT_OPTIONS: Array<{ value: RecordIdentityFormat; label: string }> = [
  { value: 'LP', label: 'LP' },
  { value: '7in', label: '7" single' },
  { value: '10in', label: '10"' },
  { value: '12in_single', label: '12" single' },
  { value: 'CD', label: 'CD' },
  { value: 'Cassette', label: 'Cassette' },
  { value: 'Box', label: 'Box set' },
  { value: 'Other', label: 'Other' },
];

const REASON_COPY: Record<string, string> = {
  query_too_weak: 'There isn\'t enough detail to search Discogs yet. Add the artist and album title under Record details, then re-check.',
  no_candidates: 'We couldn\'t find this record in Discogs. Paste a release link, add more record details, or mark it as not in Discogs.',
  all_candidates_vetoed: 'None of the closest Discogs results look like the same record. Check the warnings before you pick one.',
  ambiguous_album: 'Several pressings of this album look alike. Pick the one that matches your copy (check the label and catalog number on the record).',
  title_only: 'We only had the item title to go on, so please confirm the right release.',
  needs_confirmation: 'This looks close, but please confirm it is the right release.',
  listing_release_mismatch: 'Your Discogs listing uses a different release than the one we matched. Pick the right one.',
};

type IdentityForm = {
  artist: string;
  releaseTitle: string;
  label: string;
  catalogNumber: string;
  year: string;
  format: string;
};

const identityToForm = (ri: RecordIdentityValues | undefined): IdentityForm => ({
  artist: ri?.artist ?? '',
  releaseTitle: ri?.releaseTitle ?? '',
  label: ri?.label ?? '',
  catalogNumber: ri?.catalogNumber ?? '',
  year: ri?.year != null ? String(ri.year) : '',
  format: ri?.format ?? '',
});

const inputCls =
  'w-full px-3 py-2 text-sm border border-warm-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-warm-900 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none';
const secondaryBtn =
  'text-sm font-semibold py-2 px-3 rounded-lg bg-warm-100 dark:bg-gray-700 hover:bg-warm-200 dark:hover:bg-gray-600 text-warm-900 dark:text-gray-100 transition-colors disabled:opacity-50';
const primaryBtn =
  'text-sm font-semibold py-2 px-3 rounded-lg bg-amber-600 hover:bg-amber-700 text-white transition-colors disabled:opacity-50';

const DiscogsMatchPanel: React.FC<DiscogsMatchPanelProps> = ({
  itemId,
  match,
  isLoading,
  error,
  onRetry,
  onMatchUpdated,
  onListingChanged,
}) => {
  const { showToast } = useToast();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [chosenReleaseId, setChosenReleaseId] = useState<number | null>(null);
  const [pasteUrl, setPasteUrl] = useState('');
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [correction, setCorrection] = useState<CorrectionOutcome | null>(null);
  const [identityOpen, setIdentityOpen] = useState(false);
  const [identityForm, setIdentityForm] = useState<IdentityForm>(identityToForm(undefined));
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [offerRemoval, setOfferRemoval] = useState(false);
  const [confirmRemoval, setConfirmRemoval] = useState(false);

  const hasListing = !!match?.listing.listingId;
  const status = match?.status ?? null;
  const pickerRequired = status === 'needs_selection' || status === null;
  const showPicker = !!match && status !== 'not_in_discogs' && (pickerRequired || pickerOpen);

  // Open the record details panel by default when the matcher had too little to search with.
  useEffect(() => {
    if (match && (match.reason === 'query_too_weak' || match.reason === 'no_candidates') && status !== 'confirmed') {
      setIdentityOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.reason]);

  // Keep the form in sync with the server copy whenever the panel is closed.
  useEffect(() => {
    if (!identityOpen || !match) setIdentityForm(identityToForm(match?.recordIdentity));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.recordIdentity, identityOpen]);

  const applyMatch = (next: DiscogsMatchView) => {
    onMatchUpdated(next);
    setChosenReleaseId(null);
  };

  const selectMutation = useMutation({
    mutationFn: async (body: { releaseId?: number; url?: string; applyToListing?: boolean }) => {
      const res = await api.post(`/discogs/items/${itemId}/match/select`, body);
      return res.data as { match: DiscogsMatchView; correction: CorrectionOutcome | null };
    },
    onSuccess: (data) => {
      applyMatch(data.match);
      setPickerOpen(false);
      setPasteUrl('');
      setPasteError(null);
      setCorrection(data.correction ?? null);
      if (data.correction && data.correction.action !== 'failed') onListingChanged();
      showToast('Discogs release confirmed', 'success');
    },
    onError: (err: any, vars) => {
      const msg = discogsErrorMessage(err, 'Couldn\'t confirm that release. Try again.');
      if (vars.url) setPasteError(msg);
      else showToast(msg, 'error');
    },
  });

  const notInDiscogsMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/discogs/items/${itemId}/match/not-in-discogs`);
      return res.data as { match: DiscogsMatchView; hasListing: boolean };
    },
    onSuccess: (data) => {
      applyMatch(data.match);
      setPickerOpen(false);
      setCorrection(null);
      setOfferRemoval(!!data.hasListing);
      setConfirmRemoval(false);
    },
    onError: (err: any) => showToast(discogsErrorMessage(err, 'Couldn\'t update this record. Try again.'), 'error'),
  });

  const rerunMutation = useMutation({
    mutationFn: async (reset: boolean) => {
      const res = await api.post(`/discogs/items/${itemId}/match/rerun`, reset ? { reset: true } : {});
      return res.data as { match: DiscogsMatchView };
    },
    onSuccess: (data, reset) => {
      applyMatch(data.match);
      if (reset) {
        setOfferRemoval(false);
        setConfirmRemoval(false);
      }
      showToast(reset ? 'Discogs matching turned back on' : 'Discogs results refreshed', 'success');
    },
    onError: (err: any) => showToast(discogsErrorMessage(err, 'Couldn\'t re-check Discogs. Try again.'), 'error'),
  });

  const correctMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/discogs/items/${itemId}/listing/correct`);
      return res.data as { correction: DiscogsCorrectionResult; match: DiscogsMatchView };
    },
    onSuccess: (data) => {
      applyMatch(data.match);
      setCorrection(data.correction);
      onListingChanged();
    },
    onError: (err: any) => {
      setCorrection({
        action: 'failed',
        code: discogsErrorCode(err) || 'correction_failed',
        message: discogsErrorMessage(err, 'Couldn\'t fix the Discogs listing. Try again.'),
      });
    },
  });

  const removeListingMutation = useMutation({
    mutationFn: async () => api.delete(`/discogs/items/${itemId}/listing`),
    onSuccess: () => {
      setOfferRemoval(false);
      setConfirmRemoval(false);
      showToast('Removed from Discogs', 'success');
      onListingChanged();
      onRetry();
    },
    onError: (err: any) => showToast(discogsErrorMessage(err, 'Couldn\'t remove the Discogs listing. Try again.'), 'error'),
  });

  const identityMutation = useMutation({
    mutationFn: async (body: Record<string, string | number | null>) => {
      const res = await api.put(`/discogs/items/${itemId}/record-identity`, body);
      return res.data as { match: DiscogsMatchView };
    },
    onSuccess: (data) => {
      applyMatch(data.match);
      setIdentityOpen(false);
      setIdentityError(null);
      showToast('Record details saved', 'success');
    },
    onError: (err: any) => setIdentityError(discogsErrorMessage(err, 'Couldn\'t save the record details. Try again.')),
  });

  const anyPending =
    selectMutation.isPending ||
    notInDiscogsMutation.isPending ||
    rerunMutation.isPending ||
    correctMutation.isPending ||
    identityMutation.isPending ||
    removeListingMutation.isPending;

  // Loading and error states
  if (isLoading) {
    return (
      <div className="rounded-lg border border-warm-200 dark:border-gray-700 p-3 animate-pulse" aria-busy="true">
        <div className="flex gap-3">
          <div className="w-16 h-16 rounded bg-warm-200 dark:bg-gray-700" />
          <div className="flex-1 space-y-2 py-1">
            <div className="h-3 w-3/4 rounded bg-warm-200 dark:bg-gray-700" />
            <div className="h-3 w-1/2 rounded bg-warm-200 dark:bg-gray-700" />
          </div>
        </div>
        <p className="sr-only">Checking the Discogs catalog</p>
      </div>
    );
  }

  if (error || !match) {
    return (
      <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3">
        <p className="text-sm text-red-700 dark:text-red-300">
          {discogsErrorMessage(error, 'Couldn\'t check the Discogs catalog right now.')}
        </p>
        <button type="button" onClick={onRetry} className="mt-2 text-sm font-medium underline text-red-700 dark:text-red-300">
          Try again
        </button>
      </div>
    );
  }

  // Handlers
  const handleConfirmChosen = () => {
    if (chosenReleaseId == null) return;
    selectMutation.mutate({ releaseId: chosenReleaseId, applyToListing: hasListing || undefined });
  };

  const handlePaste = () => {
    const parsed = parseDiscogsReleaseLink(pasteUrl);
    if (!parsed.ok) {
      setPasteError(parsed.error);
      return;
    }
    setPasteError(null);
    selectMutation.mutate({ url: pasteUrl.trim(), applyToListing: hasListing || undefined });
  };

  const handleSaveIdentity = () => {
    const yearText = identityForm.year.trim();
    let year: number | null = null;
    if (yearText) {
      year = Number(yearText);
      if (!Number.isInteger(year) || year < 1880 || year > 2100) {
        setIdentityError('Year should be a 4-digit year, like 1978.');
        return;
      }
    }
    const clean = (v: string) => (v.trim() ? v.trim() : null);
    setIdentityError(null);
    identityMutation.mutate({
      artist: clean(identityForm.artist),
      releaseTitle: clean(identityForm.releaseTitle),
      label: clean(identityForm.label),
      catalogNumber: clean(identityForm.catalogNumber),
      year,
      format: identityForm.format || null,
    });
  };

  // 2026-09-23 QA: only a real listing/release disagreement shows the red banner. needs_selection
  // alone (e.g. several lookalike pressings) is handled by the picker, not flagged as wrong.
  const showMismatchBanner = hasListing && match.listing.releaseMismatch;
  const cardRelease = match.selected ?? (status === 'not_in_discogs' ? null : match.candidates[0] ?? null);
  const candidates = match.candidates.slice(0, 4);
  const sources = match.recordIdentitySources || {};

  const sourceHint = (key: keyof RecordIdentityValues) => {
    const src = sources[key];
    return src ? (
      <span className="ml-1 text-[11px] font-normal text-warm-500 dark:text-gray-400">({SOURCE_LABEL[src] ?? src})</span>
    ) : null;
  };

  return (
    <div className="space-y-3">
      {/* Mismatch banner */}
      {showMismatchBanner && (
        <div role="alert" className="rounded-lg border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 p-3">
          <p className="text-sm font-semibold text-red-800 dark:text-red-200">
            Your Discogs listing is on a different release
          </p>
          <p className="mt-1 text-sm text-red-700 dark:text-red-300">
            Buyers could be paying for a different pressing than the record you have.
            {match.listing.listingReleaseId ? (
              <>
                {' '}It&apos;s currently listed as{' '}
                <a
                  href={discogsReleaseUrl(match.listing.listingReleaseId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  release {match.listing.listingReleaseId}
                </a>
                .
              </>
            ) : null}
          </p>
          <div className="mt-2">
            {status === 'confirmed' ? (
              <button
                type="button"
                onClick={() => correctMutation.mutate()}
                disabled={anyPending}
                className="text-sm font-semibold py-2 px-3 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50"
              >
                {correctMutation.isPending ? 'Fixing listing...' : 'Fix listing'}
              </button>
            ) : status === 'auto_high' && match.releaseId ? (
              <button
                type="button"
                onClick={() => selectMutation.mutate({ releaseId: match.releaseId as number, applyToListing: true })}
                disabled={anyPending}
                className="text-sm font-semibold py-2 px-3 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50"
              >
                {selectMutation.isPending ? 'Fixing listing...' : 'Confirm this release and fix listing'}
              </button>
            ) : (
              <p className="text-sm text-red-700 dark:text-red-300">
                Pick the right release below. We&apos;ll fix the listing when you confirm it.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Correction result */}
      {correction && (
        <div
          role="status"
          className={`rounded-lg border p-3 text-sm ${
            correction.action === 'failed'
              ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
              : correction.action === 'recreated_old_listing_not_deleted' || correction.action === 'listing_gone'
                ? 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200'
                : 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <p>
              {correction.message}
              {correction.action !== 'failed' && correction.listingStatus ? ` (Listing status: ${correction.listingStatus})` : ''}
            </p>
            <button
              type="button"
              onClick={() => setCorrection(null)}
              aria-label="Dismiss"
              className="flex-shrink-0 text-current opacity-70 hover:opacity-100"
            >
              &times;
            </button>
          </div>
        </div>
      )}

      {/* Release card or not-in-Discogs state */}
      {status === 'not_in_discogs' ? (
        <div className="rounded-lg border border-warm-200 dark:border-gray-700 bg-warm-50 dark:bg-gray-800/60 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-warm-900 dark:text-gray-100">Not in Discogs</p>
            <DiscogsStatusBadge status="not_in_discogs" />
          </div>
          <p className="text-sm text-warm-600 dark:text-gray-400">
            Discogs only allows listings for records in its catalog. School, church and private pressings often
            aren&apos;t there, so this item won&apos;t be listed on Discogs.
          </p>
          <button
            type="button"
            onClick={() => rerunMutation.mutate(true)}
            disabled={anyPending}
            className="text-sm font-medium underline text-blue-600 dark:text-blue-400 disabled:opacity-50"
          >
            {rerunMutation.isPending ? 'Undoing...' : 'Undo'}
          </button>
          {(offerRemoval || hasListing) && (
            <div className="pt-2 border-t border-warm-200 dark:border-gray-700">
              <p className="text-sm text-warm-700 dark:text-gray-300">This item still has a Discogs listing.</p>
              {confirmRemoval ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => removeListingMutation.mutate()}
                    disabled={anyPending}
                    className="text-sm font-semibold py-2 px-3 rounded-lg bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
                  >
                    {removeListingMutation.isPending ? 'Removing...' : 'Yes, remove it'}
                  </button>
                  <button type="button" onClick={() => setConfirmRemoval(false)} className={secondaryBtn}>
                    Keep it
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmRemoval(true)} className={`${secondaryBtn} mt-2`}>
                  Remove from Discogs
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <DiscogsReleaseCard release={cardRelease} status={status} draftOnly={match.draftOnly} />
      )}

      {/* Status-specific guidance + picker toggles */}
      {status !== 'not_in_discogs' && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {status === 'auto_high' && !pickerOpen && (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="text-sm font-medium underline text-blue-600 dark:text-blue-400"
            >
              {match.draftOnly ? 'Confirm the pressing' : 'Wrong release?'}
            </button>
          )}
          {status === 'confirmed' && !pickerOpen && (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="text-sm font-medium underline text-blue-600 dark:text-blue-400"
            >
              Change release
            </button>
          )}
          {pickerOpen && !pickerRequired && (
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              className="text-sm font-medium underline text-warm-600 dark:text-gray-400"
            >
              Close
            </button>
          )}
          <button
            type="button"
            onClick={() => rerunMutation.mutate(false)}
            disabled={anyPending}
            className="text-sm font-medium underline text-blue-600 dark:text-blue-400 disabled:opacity-50"
          >
            {rerunMutation.isPending && !rerunMutation.variables ? 'Re-checking...' : 'Re-check Discogs'}
          </button>
        </div>
      )}

      {/* Picker */}
      {showPicker && (
        <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50/60 dark:bg-amber-900/10 p-3 space-y-3">
          <div>
            <p className="text-sm font-semibold text-warm-900 dark:text-gray-100">Choose the right release</p>
            {match.reason && REASON_COPY[match.reason] && (
              <p className="mt-1 text-sm text-warm-600 dark:text-gray-400">{REASON_COPY[match.reason]}</p>
            )}
          </div>

          {candidates.length > 0 ? (
            <fieldset className="space-y-2">
              <legend className="sr-only">Discogs releases</legend>
              {candidates.map((c) => {
                const checked = chosenReleaseId === c.releaseId;
                const inputId = `discogs-release-${itemId}-${c.releaseId}`;
                // 2026-09-23 QA: real mouse clicks on a row did not select it. The whole row is
                // now an explicit <label htmlFor> for its radio, holds no nested link (the
                // "View on Discogs" link sits outside the label), selects on its own click as a
                // fallback, and keeps clear of the fixed site header when scrolled into view.
                return (
                  <div key={c.releaseId} className="relative">
                    <label
                      htmlFor={inputId}
                      onClick={() => setChosenReleaseId(c.releaseId)}
                      className={`block cursor-pointer select-none scroll-mt-28 rounded-lg border p-3 transition-colors ${
                        checked
                          ? 'border-amber-500 bg-white dark:bg-gray-800 ring-2 ring-amber-500'
                          : 'border-warm-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-amber-400'
                      }`}
                    >
                    <div className="flex items-start gap-2">
                      <input
                        id={inputId}
                        type="radio"
                        name={`discogs-release-${itemId}`}
                        value={c.releaseId}
                        checked={checked}
                        onChange={() => setChosenReleaseId(c.releaseId)}
                        className="mt-1 h-4 w-4 flex-shrink-0 cursor-pointer accent-amber-600"
                      />
                      <div className="min-w-0 flex-1">
                        <DiscogsReleaseCard release={c} compact hideLink />
                        <div className="mt-2 flex flex-wrap gap-1">
                          {match.releaseId === c.releaseId && (
                            <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200">
                              Current pick
                            </span>
                          )}
                          {c.currentlyListed && (
                            <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-warm-200 dark:bg-gray-700 text-warm-800 dark:text-gray-200">
                              Currently on Discogs
                            </span>
                          )}
                          {c.fromPastedUrl && (
                            <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-warm-200 dark:bg-gray-700 text-warm-800 dark:text-gray-200">
                              From your link
                            </span>
                          )}
                          {c.warnings.map((w) => (
                            <span
                              key={w}
                              className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200"
                            >
                              {w}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    </label>
                    <a
                      href={c.uri || discogsReleaseUrl(c.releaseId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block mt-1 ml-9 text-xs font-medium text-blue-600 dark:text-blue-400 underline"
                    >
                      View on Discogs
                    </a>
                  </div>
                );
              })}
            </fieldset>
          ) : (
            <p className="text-sm text-warm-600 dark:text-gray-400">No close Discogs results to choose from.</p>
          )}

          {candidates.length > 0 && (
            <button
              type="button"
              onClick={handleConfirmChosen}
              disabled={chosenReleaseId == null || anyPending}
              className={`${primaryBtn} w-full sm:w-auto`}
            >
              {selectMutation.isPending && !selectMutation.variables?.url
                ? 'Saving...'
                : hasListing
                  ? 'Use this release and update my listing'
                  : 'Use this release'}
            </button>
          )}

          {/* Paste a link */}
          <div className="pt-3 border-t border-amber-200 dark:border-amber-800/60">
            <label htmlFor={`discogs-paste-${itemId}`} className="block text-sm font-medium text-warm-800 dark:text-gray-200">
              Paste a Discogs release link
            </label>
            <div className="mt-1 flex flex-col sm:flex-row gap-2">
              <input
                id={`discogs-paste-${itemId}`}
                type="url"
                inputMode="url"
                value={pasteUrl}
                onChange={(e) => {
                  setPasteUrl(e.target.value);
                  if (pasteError) setPasteError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handlePaste();
                  }
                }}
                placeholder="https://www.discogs.com/release/1234567"
                aria-invalid={!!pasteError}
                className={inputCls}
              />
              <button type="button" onClick={handlePaste} disabled={anyPending || !pasteUrl.trim()} className={secondaryBtn}>
                {selectMutation.isPending && selectMutation.variables?.url ? 'Checking...' : 'Use link'}
              </button>
            </div>
            {pasteError && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{pasteError}</p>}
          </div>

          <div className="pt-3 border-t border-amber-200 dark:border-amber-800/60">
            <button
              type="button"
              onClick={() => notInDiscogsMutation.mutate()}
              disabled={anyPending}
              className={secondaryBtn}
            >
              {notInDiscogsMutation.isPending ? 'Saving...' : 'This record isn\'t in Discogs'}
            </button>
            <p className="mt-1 text-xs text-warm-500 dark:text-gray-400">
              For private, school or church pressings that Discogs doesn&apos;t list.
            </p>
          </div>
        </div>
      )}

      {/* Record details */}
      <div className="rounded-lg border border-warm-200 dark:border-gray-700">
        <button
          type="button"
          onClick={() => setIdentityOpen((o) => !o)}
          aria-expanded={identityOpen}
          className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-warm-800 dark:text-gray-200"
        >
          <span>Record details</span>
          <span aria-hidden="true" className="text-warm-500 dark:text-gray-400">{identityOpen ? '−' : '+'}</span>
        </button>
        {identityOpen && (
          <div className="px-3 pb-3 space-y-3">
            <p className="text-xs text-warm-500 dark:text-gray-400">
              These details are what we search Discogs with. The label and catalog number printed on the record are
              the most reliable way to find the exact pressing.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {([
                ['artist', 'Artist'],
                ['releaseTitle', 'Album title'],
                ['label', 'Label'],
                ['catalogNumber', 'Catalog number'],
              ] as Array<[keyof IdentityForm & keyof RecordIdentityValues, string]>).map(([key, label]) => (
                <div key={key}>
                  <label htmlFor={`ri-${key}-${itemId}`} className="block text-xs font-medium text-warm-700 dark:text-gray-300 mb-1">
                    {label}
                    {sourceHint(key)}
                  </label>
                  <input
                    id={`ri-${key}-${itemId}`}
                    type="text"
                    value={identityForm[key]}
                    onChange={(e) => setIdentityForm((f) => ({ ...f, [key]: e.target.value }))}
                    className={inputCls}
                  />
                </div>
              ))}
              <div>
                <label htmlFor={`ri-year-${itemId}`} className="block text-xs font-medium text-warm-700 dark:text-gray-300 mb-1">
                  Year
                  {sourceHint('year')}
                </label>
                <input
                  id={`ri-year-${itemId}`}
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={identityForm.year}
                  onChange={(e) => setIdentityForm((f) => ({ ...f, year: e.target.value.replace(/[^0-9]/g, '') }))}
                  className={inputCls}
                />
              </div>
              <div>
                <label htmlFor={`ri-format-${itemId}`} className="block text-xs font-medium text-warm-700 dark:text-gray-300 mb-1">
                  Format
                  {sourceHint('format')}
                </label>
                <select
                  id={`ri-format-${itemId}`}
                  value={identityForm.format}
                  onChange={(e) => setIdentityForm((f) => ({ ...f, format: e.target.value }))}
                  className={inputCls}
                >
                  <option value="">Not sure</option>
                  {FORMAT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {identityError && <p className="text-sm text-red-600 dark:text-red-400">{identityError}</p>}
            {(status === 'confirmed' || status === 'not_in_discogs') && (
              <p className="text-xs text-warm-500 dark:text-gray-400">
                Your release choice stays as is. Use Re-check Discogs to see fresh suggestions.
              </p>
            )}
            <div className="flex flex-col sm:flex-row gap-2">
              <button type="button" onClick={handleSaveIdentity} disabled={anyPending} className={primaryBtn}>
                {identityMutation.isPending ? 'Saving and re-checking...' : 'Save and re-check'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIdentityOpen(false);
                  setIdentityError(null);
                }}
                className={secondaryBtn}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DiscogsMatchPanel;
