import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import AccessibleModal from '../AccessibleModal';
import {
  ETSY_ATTESTATION_TEXT,
  ETSY_ATTRIBUTION,
  ETSY_ELIGIBILITY_NOTE,
  ETSY_FEE_NOTICE,
  ETSY_LISTING_FEE_AMOUNT,
  ETSY_MODAL_COPY,
  ETSY_PANEL_COPY,
} from '../../lib/etsyCopy';
import {
  ETSY_MAX_PHOTOS,
  buildEtsyDraftRequest,
  buildEtsyPreview,
  deriveEtsyListingView,
  filterEtsyCategories,
  formatEtsyDate,
  getEtsyDraftProblems,
  initialEtsyDraftForm,
} from '../../lib/etsyUiState';
import type {
  EtsyCategoryOptions,
  EtsyChip,
  EtsyConnectionInfo,
  EtsyDraftFormValues,
  EtsyDraftRequestBody,
  EtsyItemInput,
  EtsyListingInfo,
  EtsySetupInfo,
} from '../../lib/etsyUiState';
import { etsyEraOptionsFor, getEtsyEra, reconcileEra } from '../../lib/etsyWhenMade';
import {
  useEtsyCategories,
  useEtsyConnection,
  useEtsyListing,
  useEtsyListingActions,
  useEtsyShopSetup,
} from '../../lib/useEtsyConnection';

// ADR-135 batch E-B5 (D7.4, D8). The draft review window for one item.
//
// Two separate steps, on purpose:
//   Step 1  "Save draft on Etsy"   creates a draft in the organizer's Etsy shop. Nothing is charged.
//   Step 2  "Publish on Etsy"      only after the draft is ready; the $0.20 listing fee is shown above it.
// The organizer must tick the attestation before step 1 (the server stores it and re-checks eligibility
// on both calls; the checks here only explain problems early, they are not the gate).
//
// The trademark sentence (ETSY_ATTRIBUTION) is shown at the bottom of this window.
// This window renders in a portal on document.body, so it never sits inside the edit-item <form>.

const CHIP_CLASSES: Record<EtsyChip['tone'], string> = {
  neutral: 'bg-warm-100 text-warm-800 dark:bg-gray-700 dark:text-gray-100',
  info: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  warning: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200',
  success: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
  danger: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
};

const FIELD_CLASS =
  'w-full min-h-[44px] rounded-lg border border-warm-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-warm-900 dark:text-gray-100 px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500';
const PRIMARY_BTN =
  'w-full sm:w-auto min-h-[44px] bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const SECONDARY_BTN =
  'w-full sm:w-auto min-h-[44px] bg-warm-100 dark:bg-gray-700 hover:bg-warm-200 dark:hover:bg-gray-600 text-warm-900 dark:text-gray-100 font-semibold py-2 px-5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const DANGER_BTN =
  'w-full sm:w-auto min-h-[44px] bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const LABEL_CLASS = 'block text-sm font-medium text-warm-800 dark:text-gray-200 mb-1';

export interface EtsyDraftReviewActions {
  onSaveDraft: (body: EtsyDraftRequestBody) => void;
  isSavingDraft: boolean;
  draftError: string | null;
  onPublish: () => void;
  isPublishing: boolean;
  publishError: string | null;
  onDiscard: () => void;
  isDiscarding: boolean;
  discardError: string | null;
}

export interface EtsyDraftReviewBodyProps {
  item: EtsyItemInput;
  /** Year used to work out which eras are 20 or more years old. */
  asOfYear: number;
  connection: EtsyConnectionInfo | undefined;
  listing: EtsyListingInfo | null;
  setup: { data: EtsySetupInfo | undefined; isLoading: boolean; errorMessage: string | null; onRetry: () => void };
  categories: { data: EtsyCategoryOptions | undefined; isLoading: boolean; isError: boolean; onRetry: () => void };
  actions: EtsyDraftReviewActions;
  /** Polling stopped while the draft or publish is still in flight. */
  pollTimedOut: boolean;
  onClose: () => void;
}

function Spinner() {
  return <div className="w-5 h-5 border-2 border-amber-600 border-t-transparent rounded-full animate-spin flex-shrink-0" aria-hidden="true" />;
}

function ChipPill({ chip }: { chip: EtsyChip }) {
  return (
    <span
      data-testid="etsy-modal-chip"
      data-state={chip.state}
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${CHIP_CLASSES[chip.tone]}`}
    >
      {chip.label}
    </span>
  );
}

function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-red-700 dark:text-red-300 break-words">
      {message}
    </p>
  );
}

/** The window's content, driven only by props so every state can be rendered with mocked data. */
export function EtsyDraftReviewBody(props: EtsyDraftReviewBodyProps) {
  const { item, asOfYear, connection, listing, actions } = props;
  const view = deriveEtsyListingView(listing);
  const [form, setForm] = useState<EtsyDraftFormValues>(() => initialEtsyDraftForm(listing, connection));
  const [categoryQuery, setCategoryQuery] = useState('');
  const [confirming, setConfirming] = useState<null | 'discard' | 'remove'>(null);

  const preview = useMemo(() => buildEtsyPreview(item), [item]);
  const eraOptions = etsyEraOptionsFor(form.isSupply, asOfYear);
  const setupData = props.setup.data;

  // A saved choice that Etsy no longer lists counts as not chosen.
  const hasOption = (list: { id: string }[] | undefined, id: string): boolean => !list || list.some((o) => o.id === id);
  const effective: EtsyDraftFormValues = {
    ...form,
    shippingProfileId: setupData && !hasOption(setupData.shippingProfiles, form.shippingProfileId) ? '' : form.shippingProfileId,
    readinessStateId: setupData && !hasOption(setupData.processingProfiles, form.readinessStateId) ? '' : form.readinessStateId,
    returnPolicyId: setupData && !hasOption(setupData.returnPolicies, form.returnPolicyId) ? '' : form.returnPolicyId,
  };
  const problems = getEtsyDraftProblems({ item, connection, form: effective, asOfYear });
  const busy = actions.isSavingDraft || actions.isPublishing || actions.isDiscarding;

  const showForm = view.mode === 'form' || (view.mode === 'failed' && view.retry === 'draft');
  const showReady = view.mode === 'ready' || (view.mode === 'failed' && view.retry === 'publish');
  const showLive = view.mode === 'live' || (view.mode === 'failed' && view.retry === 'remove');
  const optionsReady = Boolean(setupData) && !setupData!.needsEtsySideSetup;

  const selectedNode = props.categories.data?.leaves.filter((l) => l.id === form.taxonomyId)[0] ?? null;
  const shownCategories = props.categories.data ? filterEtsyCategories(props.categories.data, categoryQuery, 50) : [];

  const submitDraft = () => {
    const body = buildEtsyDraftRequest(effective);
    if (body && problems.canSubmit && !busy) actions.onSaveDraft(body);
  };

  // ------------------------------------------------------------------------------------------
  const renderPreview = () => (
    <div className="rounded-lg border border-warm-200 dark:border-gray-700 bg-warm-50 dark:bg-gray-900/40 p-3 sm:p-4 space-y-3" data-testid="etsy-preview">
      <h4 className="text-sm font-semibold text-warm-800 dark:text-gray-200">{ETSY_MODAL_COPY.previewHeading}</h4>
      <dl className="space-y-2 text-sm">
        <div>
          <dt className="text-xs uppercase tracking-wide text-warm-500 dark:text-gray-400">{ETSY_MODAL_COPY.previewTitle}</dt>
          <dd className="text-warm-900 dark:text-gray-100 break-words">{preview.title || '-'}</dd>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-warm-500 dark:text-gray-400">{ETSY_MODAL_COPY.previewPrice}</dt>
            <dd className="text-warm-900 dark:text-gray-100">{preview.priceText ?? '-'}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-warm-500 dark:text-gray-400">{ETSY_MODAL_COPY.previewQuantity}</dt>
            <dd className="text-warm-900 dark:text-gray-100">{preview.quantity}</dd>
          </div>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-warm-500 dark:text-gray-400">{ETSY_MODAL_COPY.previewTags}</dt>
          <dd>
            {preview.tags.length === 0 ? (
              <span className="text-warm-600 dark:text-gray-400">{ETSY_MODAL_COPY.previewNoTags}</span>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {preview.tags.map((t) => (
                  <li key={t} className="rounded-full bg-warm-100 dark:bg-gray-700 px-2.5 py-1 text-xs text-warm-800 dark:text-gray-200 break-all">
                    {t}
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-warm-500 dark:text-gray-400">{ETSY_MODAL_COPY.previewDescription}</dt>
          <dd className="whitespace-pre-line break-words text-warm-900 dark:text-gray-100 max-h-40 overflow-y-auto">
            {preview.description || <span className="text-warm-600 dark:text-gray-400">{ETSY_MODAL_COPY.previewNoDescription}</span>}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-warm-500 dark:text-gray-400">{ETSY_MODAL_COPY.previewPhotos}</dt>
          <dd className="space-y-2">
            {preview.photoUrls.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {preview.photoUrls.map((url, i) => (
                  <li key={`${i}-${url}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`Photo ${i + 1} of ${preview.photoUrls.length}`}
                      loading="lazy"
                      className="h-14 w-14 sm:h-16 sm:w-16 rounded object-cover bg-warm-100 dark:bg-gray-700"
                    />
                  </li>
                ))}
              </ul>
            )}
            <p className="text-warm-700 dark:text-gray-300">
              {preview.photoCount === 0
                ? ETSY_MODAL_COPY.photosNone
                : preview.photoCount === 1
                  ? ETSY_MODAL_COPY.photoCountOne
                  : ETSY_MODAL_COPY.photoCountMany(preview.photoCount, ETSY_MAX_PHOTOS)}
            </p>
          </dd>
        </div>
      </dl>
      <p className="text-xs text-warm-500 dark:text-gray-400">{ETSY_MODAL_COPY.previewNote}</p>
    </div>
  );

  const renderSelect = (
    id: string,
    label: string,
    value: string,
    options: { id: string; label: string }[],
    onChange: (v: string) => void,
    emptyLabel: string
  ) => (
    <div>
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={busy} className={FIELD_CLASS}>
        <option value="">{emptyLabel}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );

  const renderCategory = () => (
    <div data-testid="etsy-category">
      <p className={LABEL_CLASS} id="etsy-category-label">
        {ETSY_MODAL_COPY.categoryLabel}
      </p>
      {form.taxonomyId !== null ? (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wide text-green-700 dark:text-green-300">{ETSY_MODAL_COPY.categorySelected}</p>
            <p className="text-sm text-warm-900 dark:text-gray-100 break-words">{selectedNode ? selectedNode.fullPath : ETSY_MODAL_COPY.categorySavedEarlier}</p>
          </div>
          <button type="button" onClick={() => setForm({ ...form, taxonomyId: null })} disabled={busy} className={SECONDARY_BTN}>
            {ETSY_MODAL_COPY.categoryChange}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-warm-600 dark:text-gray-400">{ETSY_MODAL_COPY.categoryConfirmHint}</p>
          {props.categories.isLoading && (
            <p role="status" className="flex items-center gap-2 text-sm text-warm-600 dark:text-gray-400">
              <Spinner />
              {ETSY_MODAL_COPY.categoryLoading}
            </p>
          )}
          {props.categories.isError && (
            <div role="alert" className="space-y-2">
              <p className="text-sm text-red-700 dark:text-red-300">{ETSY_MODAL_COPY.categoryLoadError}</p>
              <button type="button" onClick={props.categories.onRetry} className={SECONDARY_BTN}>
                {ETSY_MODAL_COPY.retry}
              </button>
            </div>
          )}
          {props.categories.data && (
            <>
              {props.categories.data.suggested && (
                <button
                  type="button"
                  onClick={() => setForm({ ...form, taxonomyId: props.categories.data!.suggested!.id })}
                  disabled={busy}
                  className="w-full min-h-[44px] text-left rounded-lg border-2 border-amber-500 bg-amber-50 dark:bg-amber-900/20 p-3 disabled:opacity-50"
                >
                  <span className="inline-block rounded-full bg-amber-600 text-white text-xs font-semibold px-2 py-0.5 mr-2">
                    {ETSY_MODAL_COPY.categorySuggested}
                  </span>
                  <span className="text-sm text-warm-900 dark:text-gray-100 break-words">{props.categories.data.suggested.fullPath}</span>
                  <span className="block text-xs font-semibold text-amber-800 dark:text-amber-300 mt-1">{ETSY_MODAL_COPY.categoryUse}</span>
                </button>
              )}
              <input
                type="text"
                value={categoryQuery}
                onChange={(e) => setCategoryQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.preventDefault();
                }}
                placeholder={ETSY_MODAL_COPY.categorySearch}
                aria-label={ETSY_MODAL_COPY.categorySearch}
                autoComplete="off"
                className={FIELD_CLASS}
              />
              <ul className="max-h-56 overflow-y-auto rounded-lg border border-warm-200 dark:border-gray-600 divide-y divide-warm-100 dark:divide-gray-700">
                {shownCategories.length === 0 && <li className="px-3 py-3 text-sm text-warm-600 dark:text-gray-400">{ETSY_MODAL_COPY.categoryEmpty}</li>}
                {shownCategories.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, taxonomyId: n.id })}
                      disabled={busy}
                      className="w-full min-h-[44px] text-left px-3 py-2 text-sm text-warm-900 dark:text-gray-100 break-words hover:bg-warm-50 dark:hover:bg-gray-700 disabled:opacity-50"
                    >
                      {n.fullPath}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );

  const renderProfiles = () => {
    if (props.setup.isLoading) {
      return (
        <p role="status" className="flex items-center gap-2 text-sm text-warm-600 dark:text-gray-400">
          <Spinner />
          {ETSY_MODAL_COPY.optionsLoading}
        </p>
      );
    }
    if (props.setup.errorMessage || !setupData) {
      return (
        <div role="alert" className="space-y-2">
          <p className="text-sm text-red-700 dark:text-red-300 break-words">{props.setup.errorMessage ?? ETSY_MODAL_COPY.optionsLoadError}</p>
          <button type="button" onClick={props.setup.onRetry} className={SECONDARY_BTN}>
            {ETSY_MODAL_COPY.retry}
          </button>
        </div>
      );
    }
    if (setupData.needsEtsySideSetup) {
      return (
        <p role="alert" className="rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-900 dark:text-amber-200">
          {ETSY_PANEL_COPY.setupEmpty}
        </p>
      );
    }
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {renderSelect(
          'etsy-shipping',
          ETSY_MODAL_COPY.shippingLabel,
          effective.shippingProfileId,
          setupData.shippingProfiles,
          (v) => setForm({ ...form, shippingProfileId: v }),
          ETSY_MODAL_COPY.choose
        )}
        {renderSelect(
          'etsy-processing',
          ETSY_MODAL_COPY.processingLabel,
          effective.readinessStateId,
          setupData.processingProfiles,
          (v) => setForm({ ...form, readinessStateId: v }),
          ETSY_MODAL_COPY.choose
        )}
        <div className="sm:col-span-2">
          {renderSelect(
            'etsy-return',
            ETSY_MODAL_COPY.returnLabel,
            effective.returnPolicyId,
            setupData.returnPolicies,
            (v) => setForm({ ...form, returnPolicyId: v }),
            ETSY_MODAL_COPY.returnNone
          )}
        </div>
      </div>
    );
  };

  const renderForm = () => (
    <section aria-labelledby="etsy-step-draft" className="space-y-4" data-testid="etsy-step-draft">
      <div>
        <h3 id="etsy-step-draft" className="text-base font-semibold text-warm-900 dark:text-gray-100">
          {ETSY_MODAL_COPY.stepDraft}
        </h3>
        <p className="text-sm text-warm-600 dark:text-gray-400">{ETSY_MODAL_COPY.draftHelp}</p>
      </div>

      {problems.blocking.length > 0 && (
        <div role="alert" className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 space-y-1" data-testid="etsy-problems">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">{ETSY_MODAL_COPY.blockedHeading}</p>
          <ul className="list-disc pl-5 space-y-1">
            {problems.blocking.map((m) => (
              <li key={m} className="text-sm text-amber-900 dark:text-amber-200 break-words">
                {m}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <label htmlFor="etsy-era" className={LABEL_CLASS}>
          {ETSY_MODAL_COPY.eraLabel}
        </label>
        <select
          id="etsy-era"
          value={form.whenMade}
          onChange={(e) => setForm({ ...form, whenMade: e.target.value })}
          disabled={busy}
          className={FIELD_CLASS}
          aria-describedby="etsy-era-help"
        >
          <option value="">{ETSY_MODAL_COPY.eraChoose}</option>
          {eraOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <p id="etsy-era-help" className="mt-1 text-xs text-warm-600 dark:text-gray-400">
          {form.isSupply ? ETSY_MODAL_COPY.eraHelpSupply : ETSY_MODAL_COPY.eraHelpVintage}
        </p>
      </div>

      <label className="flex items-start gap-3 min-h-[44px] py-2 cursor-pointer">
        <input
          type="checkbox"
          checked={form.isSupply}
          disabled={busy}
          onChange={(e) => {
            const isSupply = e.target.checked;
            setForm({ ...form, isSupply, whenMade: reconcileEra(form.whenMade, etsyEraOptionsFor(isSupply, asOfYear)) });
          }}
          className="mt-0.5 h-5 w-5 flex-shrink-0 rounded border-warm-400 text-amber-600 focus:ring-amber-500"
        />
        <span className="text-sm text-warm-900 dark:text-gray-100">{ETSY_MODAL_COPY.supplyLabel}</span>
      </label>

      {renderCategory()}
      {renderProfiles()}
      {renderPreview()}

      <label className="flex items-start gap-3 min-h-[44px] py-2 cursor-pointer rounded-lg border border-warm-200 dark:border-gray-600 p-3">
        <input
          type="checkbox"
          checked={form.attested}
          disabled={busy}
          onChange={(e) => setForm({ ...form, attested: e.target.checked })}
          className="mt-0.5 h-5 w-5 flex-shrink-0 rounded border-warm-400 text-amber-600 focus:ring-amber-500"
          data-testid="etsy-attestation"
        />
        <span className="text-sm text-warm-900 dark:text-gray-100">{ETSY_ATTESTATION_TEXT}</span>
      </label>

      <p className="text-xs text-warm-500 dark:text-gray-400">{ETSY_ELIGIBILITY_NOTE}</p>

      <ErrorLine message={actions.draftError} />
      {problems.missing.length > 0 && (
        <p className="text-sm text-warm-700 dark:text-gray-300" data-testid="etsy-missing">
          {ETSY_MODAL_COPY.stillNeeded} {problems.missing.join(', ')}.
        </p>
      )}
      <button
        type="button"
        onClick={submitDraft}
        disabled={!problems.canSubmit || !optionsReady || busy}
        className={PRIMARY_BTN}
        data-testid="etsy-save-draft"
      >
        {actions.isSavingDraft ? ETSY_MODAL_COPY.savingDraft : ETSY_MODAL_COPY.saveDraft}
      </button>

      <div className="rounded-lg border border-dashed border-warm-300 dark:border-gray-600 p-3">
        <p className="text-sm font-semibold text-warm-700 dark:text-gray-300">{ETSY_MODAL_COPY.stepPublish}</p>
        <p className="text-xs text-warm-600 dark:text-gray-400">{ETSY_FEE_NOTICE}</p>
      </div>
    </section>
  );

  const renderPending = () => {
    const total = Math.max(1, Math.min(ETSY_MAX_PHOTOS, preview.photoCount || 1));
    return (
      <section className="space-y-3" role="status" aria-live="polite" data-testid="etsy-pending">
        <div className="flex items-center gap-3">
          <Spinner />
          <h3 className="text-base font-semibold text-warm-900 dark:text-gray-100">
            {view.mode === 'publishing' ? ETSY_MODAL_COPY.publishing : ETSY_MODAL_COPY.draftPendingTitle}
          </h3>
        </div>
        {view.mode === 'pending' && (
          <>
            <p className="text-sm text-warm-600 dark:text-gray-400">{ETSY_MODAL_COPY.draftPendingBody}</p>
            <p className="text-sm text-warm-700 dark:text-gray-300">
              {ETSY_MODAL_COPY.draftPendingPhotos(Math.min(listing ? listing.imagesUploaded : 0, total), total)}
            </p>
          </>
        )}
        {props.pollTimedOut && <p className="text-sm text-amber-800 dark:text-amber-300">{ETSY_MODAL_COPY.draftSlow}</p>}
      </section>
    );
  };

  const renderReady = () => {
    const era = getEtsyEra(listing?.whenMade);
    return (
      <div className="space-y-4" data-testid="etsy-ready">
        <section aria-labelledby="etsy-step-saved" className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-3 sm:p-4 space-y-2">
          <h3 id="etsy-step-saved" className="text-base font-semibold text-green-900 dark:text-green-200">
            {ETSY_MODAL_COPY.draftSaved}
          </h3>
          <p className="text-sm text-green-900 dark:text-green-200">{ETSY_MODAL_COPY.readyBody}</p>
          <div className="text-sm text-warm-800 dark:text-gray-200 space-y-1">
            <p className="font-medium">{ETSY_MODAL_COPY.summaryHeading}</p>
            {era && (
              <p>
                {ETSY_MODAL_COPY.summaryEra}: {era.label}
              </p>
            )}
            {listing?.isSupply && <p>{ETSY_MODAL_COPY.summarySupply}</p>}
            <p>{preview.photoCount === 1 ? ETSY_MODAL_COPY.photoCountOne : preview.photoCount === 0 ? ETSY_MODAL_COPY.photosNone : ETSY_MODAL_COPY.photoCountMany(preview.photoCount, ETSY_MAX_PHOTOS)}</p>
          </div>
        </section>

        <section aria-labelledby="etsy-step-publish" className="rounded-lg border-2 border-amber-400 dark:border-amber-600 p-3 sm:p-4 space-y-3" data-testid="etsy-step-publish">
          <h3 id="etsy-step-publish" className="text-base font-semibold text-warm-900 dark:text-gray-100">
            {ETSY_MODAL_COPY.stepPublish}
          </h3>
          <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 p-3 space-y-1" data-testid="etsy-fee">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">{ETSY_MODAL_COPY.publishFeeHeading}</p>
            <p className="text-sm font-bold text-warm-900 dark:text-gray-100">
              {ETSY_MODAL_COPY.feeLabel}: {ETSY_LISTING_FEE_AMOUNT}
            </p>
            <p className="text-sm text-amber-900 dark:text-amber-200">{ETSY_FEE_NOTICE}</p>
          </div>
          {!listing?.attestedAt && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{ETSY_MODAL_COPY.attestationMissing}</p>}
          <ErrorLine message={actions.publishError} />
          <ErrorLine message={actions.discardError} />
          {confirming === 'discard' ? (
            <div role="alertdialog" aria-label={ETSY_MODAL_COPY.discardConfirm} className="rounded-lg border border-red-200 dark:border-red-800 p-3 space-y-2">
              <p className="text-sm font-semibold text-warm-900 dark:text-gray-100">{ETSY_MODAL_COPY.discardConfirm}</p>
              <p className="text-sm text-warm-700 dark:text-gray-300">{ETSY_MODAL_COPY.discardConfirmBody}</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <button type="button" disabled={busy} onClick={() => { setConfirming(null); actions.onDiscard(); }} className={DANGER_BTN}>
                  {actions.isDiscarding ? ETSY_MODAL_COPY.discarding : ETSY_MODAL_COPY.discardYes}
                </button>
                <button type="button" disabled={busy} onClick={() => setConfirming(null)} className={SECONDARY_BTN}>
                  {ETSY_MODAL_COPY.discardNo}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2">
              <button type="button" onClick={() => actions.onPublish()} disabled={busy || !listing?.attestedAt} className={PRIMARY_BTN} data-testid="etsy-publish">
                {actions.isPublishing ? ETSY_MODAL_COPY.publishing : ETSY_MODAL_COPY.publish}
              </button>
              <button type="button" onClick={() => setConfirming('discard')} disabled={busy} className={SECONDARY_BTN}>
                {actions.isDiscarding ? ETSY_MODAL_COPY.discarding : ETSY_MODAL_COPY.discard}
              </button>
            </div>
          )}
        </section>
      </div>
    );
  };

  const renderLive = () => {
    const until = formatEtsyDate(listing?.expiresAt);
    return (
      <section className="space-y-3" data-testid="etsy-live">
        {view.mode === 'live' && (
          <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-3 sm:p-4 space-y-1">
            <h3 className="text-base font-semibold text-green-900 dark:text-green-200">{ETSY_MODAL_COPY.liveTitle}</h3>
            <p className="text-sm text-green-900 dark:text-green-200">{until ? ETSY_MODAL_COPY.liveUntil(until) : ETSY_MODAL_COPY.liveNoDate}</p>
          </div>
        )}
        <ErrorLine message={actions.discardError} />
        {confirming === 'remove' ? (
          <div role="alertdialog" aria-label={ETSY_MODAL_COPY.removeConfirm} className="rounded-lg border border-red-200 dark:border-red-800 p-3 space-y-2">
            <p className="text-sm font-semibold text-warm-900 dark:text-gray-100">{ETSY_MODAL_COPY.removeConfirm}</p>
            <p className="text-sm text-warm-700 dark:text-gray-300">{ETSY_MODAL_COPY.removeConfirmBody}</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <button type="button" disabled={busy} onClick={() => { setConfirming(null); actions.onDiscard(); }} className={DANGER_BTN}>
                {actions.isDiscarding ? ETSY_MODAL_COPY.removing : ETSY_MODAL_COPY.removeYes}
              </button>
              <button type="button" disabled={busy} onClick={() => setConfirming(null)} className={SECONDARY_BTN}>
                {ETSY_MODAL_COPY.removeNo}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirming('remove')} disabled={busy} className={SECONDARY_BTN}>
            {actions.isDiscarding ? ETSY_MODAL_COPY.removing : ETSY_MODAL_COPY.remove}
          </button>
        )}
      </section>
    );
  };

  return (
    <div className="space-y-5" data-testid="etsy-modal-body" data-mode={view.mode}>
      {view.chip && (
        <div className="flex flex-wrap items-center gap-2">
          <ChipPill chip={view.chip} />
          <span className="text-sm text-warm-600 dark:text-gray-400 break-words min-w-0">{view.chip.detail}</span>
        </div>
      )}

      {view.mode === 'failed' && view.failureMessage && (
        <div role="alert" className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 space-y-1" data-testid="etsy-failed">
          <h3 className="text-sm font-semibold text-red-800 dark:text-red-200">{ETSY_MODAL_COPY.failedTitle}</h3>
          <p className="text-sm text-red-800 dark:text-red-200 break-words">{view.failureMessage}</p>
          {view.failureDetail && <p className="text-xs text-red-700 dark:text-red-300 break-words">{view.failureDetail}</p>}
        </div>
      )}

      {view.mode === 'ready' && view.failureDetail && (
        <div role="alert" className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 space-y-1" data-testid="etsy-publish-failed">
          <p className="text-sm font-semibold text-red-800 dark:text-red-200">{ETSY_MODAL_COPY.lastPublishFailed}</p>
          <p className="text-sm text-red-800 dark:text-red-200 break-words">{view.failureDetail}</p>
        </div>
      )}

      {listing && listing.state === 'ENDED' && <p className="text-sm text-warm-600 dark:text-gray-400">{ETSY_MODAL_COPY.endedNote}</p>}

      {showForm && renderForm()}
      {(view.mode === 'pending' || view.mode === 'publishing') && renderPending()}
      {showReady && renderReady()}
      {showLive && renderLive()}
      {view.mode === 'sold' && (
        <p className="text-sm text-warm-700 dark:text-gray-300" data-testid="etsy-sold">
          {ETSY_MODAL_COPY.soldTitle}
        </p>
      )}
      {view.mode === 'orphaned' && (
        <p className="text-sm text-warm-700 dark:text-gray-300" data-testid="etsy-orphaned">
          {ETSY_MODAL_COPY.orphanedTitle}
        </p>
      )}

      <p className="text-xs text-warm-500 dark:text-gray-400 break-words border-t border-warm-200 dark:border-gray-700 pt-3" data-testid="etsy-attribution">
        {ETSY_ATTRIBUTION}
      </p>
    </div>
  );
}

export interface EtsyDraftReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: EtsyItemInput;
}

/** The draft review window: a full-height sheet on phones, a centered dialog from 640 px up. */
export default function EtsyDraftReviewModal({ isOpen, onClose, item }: EtsyDraftReviewModalProps) {
  const { connection } = useEtsyConnection();
  const listingQuery = useEtsyListing(item.id, isOpen);
  const listing = listingQuery.listing ?? null;
  const view = deriveEtsyListingView(listing);
  const connected = Boolean(connection && connection.enabled && connection.connected);
  const needsForm = view.mode === 'form' || (view.mode === 'failed' && view.retry === 'draft');
  const setupQuery = useEtsyShopSetup(isOpen && connected && needsForm);
  const categoriesQuery = useEtsyCategories(item.id, isOpen && connected && needsForm);
  const actions = useEtsyListingActions(item.id);
  const asOfYear = useMemo(() => new Date().getFullYear(), []);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!isOpen) actions.resetErrors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!mounted || !isOpen) return null;

  const swallow = (p: Promise<unknown>) => {
    p.catch(() => undefined);
  };

  const content = (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onClose}
      ariaLabelledBy="etsy-modal-title"
      overlayClassName="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
      contentClassName="bg-white dark:bg-gray-800 w-full sm:max-w-2xl h-[100dvh] sm:h-auto sm:max-h-[90vh] overflow-y-auto overflow-x-hidden sm:rounded-lg shadow-xl p-4 sm:p-6"
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <h2 id="etsy-modal-title" className="text-lg sm:text-xl font-bold text-warm-900 dark:text-gray-100 min-w-0 break-words">
          {ETSY_MODAL_COPY.title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={ETSY_MODAL_COPY.closeAria}
          className="min-h-[44px] min-w-[44px] flex-shrink-0 rounded-lg text-2xl leading-none text-warm-600 dark:text-gray-300 hover:bg-warm-100 dark:hover:bg-gray-700"
        >
          <span aria-hidden="true">&times;</span>
        </button>
      </div>

      {listingQuery.isLoading ? (
        <p role="status" className="flex items-center gap-2 text-sm text-warm-600 dark:text-gray-400">
          <Spinner />
          {ETSY_MODAL_COPY.loading}
        </p>
      ) : (
        <EtsyDraftReviewBody
          key={`${view.mode}:${listing ? listing.state : 'none'}`}
          item={item}
          asOfYear={asOfYear}
          connection={connection}
          listing={listing}
          setup={{
            data: setupQuery.setup,
            isLoading: setupQuery.isLoading,
            errorMessage: setupQuery.errorMessage,
            onRetry: () => {
              setupQuery.refetch();
            },
          }}
          categories={{
            data: categoriesQuery.categories,
            isLoading: categoriesQuery.isLoading,
            isError: categoriesQuery.isError,
            onRetry: () => {
              categoriesQuery.refetch();
            },
          }}
          actions={{
            onSaveDraft: (body) => swallow(actions.saveDraft(body)),
            isSavingDraft: actions.isSavingDraft,
            draftError: actions.draftError,
            onPublish: () => swallow(actions.publish()),
            isPublishing: actions.isPublishing,
            publishError: actions.publishError,
            onDiscard: () => swallow(actions.discard()),
            isDiscarding: actions.isDiscarding,
            discardError: actions.discardError,
          }}
          pollTimedOut={listingQuery.pollTimedOut}
          onClose={onClose}
        />
      )}
    </AccessibleModal>
  );

  return createPortal(content, document.body);
}
