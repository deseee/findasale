/**
 * CardRecordPanel (ADR-134 #640 and #641, batch B7)
 *
 * Trading card details for one item in the organizer item editor: search the free card catalog and
 * fill in the details, or type them by hand. It owns its own data (GET/PUT /api/item-cards/:itemId,
 * POST /api/item-cards/:itemId/apply-printing) and saves separately from the rest of the item form.
 *
 * Rules that matter (ADR-134 sections 3.5, 3.6, 3.7, 11):
 *  - A field the seller typed is locked on the server, so a later catalog pick will not replace it.
 *    A lock icon marks it, with "Reset to catalog value" (apply-printing with resetFields).
 *    Before a catalog pick the panel saves what the seller typed, so it stays locked.
 *  - No price is ever changed here except by "Use suggested price", which hands one number to the page
 *    through onApplyPrice. Likewise the title changes only through "Use suggested title" (onApplyTitle).
 *  - Card items with no price show "Add a price before you can publish".
 *  - If the catalog is off, a banner says so and every manual field stays usable.
 *  - Dropdown lists come from GET /api/cards/vocabulary; nothing is hardcoded in the page.
 *  - Graded cards hide condition and show grader, grade and certificate number.
 *  - The page mounts this inside its item <form>, so Enter in a card field is swallowed (it must not save
 *    the item) and no control here uses native validation attributes.
 */
import React, { useEffect, useId, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import api from '../lib/api';
import { useToast } from './ToastContext';
import Skeleton from './Skeleton';
import CardSearchBox from './cardRecord/CardSearchBox';
import CardConditionConfirm from './cardRecord/CardConditionConfirm';
import SuggestedPriceBox from './cardRecord/SuggestedPriceBox';
import {
  CARD_PANEL_COPY,
  CARD_PANEL_TEMPLATES,
  CERT_MAX_LENGTH,
  CardFormValues,
  CardVocabulary,
  FIELD_LABELS,
  FieldErrors,
  FormField,
  PrintingResult,
  StoredCard,
  UNKNOWN_STATUS,
  buildSuggestedTitle,
  canResetField,
  creditLine,
  diffFormAgainstCard,
  formFromCard,
  formatDataDate,
  hasUnsavedChanges,
  isGradedCard,
  lockedFormFields,
  lookupAvailability,
  needsPriceFlag,
  normalizeVocabulary,
  readApiError,
  readStatus,
  validateForm,
} from '../lib/cardRecord';

export interface CardRecordPanelProps {
  /** The item being edited. */
  itemId: string;
  /** The page's current Price field value, used only to show the "Add a price" flag. */
  currentPrice: string | number | null | undefined;
  /** Called with a number only when the seller presses "Use suggested price". The page fills its Price field. */
  onApplyPrice: (price: number) => void;
  /** Optional. Called only when the seller presses "Use suggested title". When omitted the button is hidden. */
  onApplyTitle?: (title: string) => void;
  /** Optional. Tells the page whether the card form has changes that are not saved yet. */
  onDirtyChange?: (dirty: boolean) => void;
  /** Optional. Disables every control while the page is busy. */
  disabled?: boolean;
}

const inputCls =
  'w-full min-h-[44px] px-4 py-2 text-base sm:text-sm border border-warm-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-warm-900 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none disabled:opacity-60';
const labelCls = 'block text-sm font-medium text-warm-700 dark:text-warm-300 mb-1';
const secondaryBtn =
  'min-h-[44px] rounded-lg bg-warm-100 px-4 text-sm font-semibold text-warm-900 transition-colors hover:bg-warm-200 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600';
const primaryBtn =
  'min-h-[44px] rounded-lg bg-amber-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-50';

const GENERIC_ERROR = CARD_PANEL_COPY.errorGeneric;

/** What "Try again" repeats. It is run through the latest handlers, so anything typed since is kept. */
type RetryTarget = { kind: 'save' } | { kind: 'apply'; printing: PrintingResult } | { kind: 'reset'; field: FormField };

interface FieldShellProps {
  id: string;
  field: FormField;
  locked: boolean;
  canReset: boolean;
  resetting: boolean;
  busy: boolean;
  error?: string;
  onReset: (field: FormField) => void;
  className?: string;
  children: React.ReactNode;
}

/** Label, control, error text, and the lock icon with "Reset to catalog value" for fields the seller typed. */
const FieldShell: React.FC<FieldShellProps> = ({ id, field, locked, canReset, resetting, busy, error, onReset, className, children }) => {
  const label = FIELD_LABELS[field];
  return (
    <div className={className}>
      <label htmlFor={id} className={labelCls}>
        {label}
        {locked && (
          <span className="ml-1 inline-flex align-middle text-warm-500 dark:text-warm-400" title={CARD_PANEL_TEMPLATES.lockedFor(label)}>
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only">{CARD_PANEL_TEMPLATES.lockedFor(label)}</span>
          </span>
        )}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      {locked && (
        <div className="mt-1 flex flex-wrap items-center gap-x-2">
          <span className="text-xs text-warm-500 dark:text-warm-400">{CARD_PANEL_COPY.locked}</span>
          {canReset && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onReset(field)}
              aria-label={CARD_PANEL_TEMPLATES.resetFor(label)}
              className="inline-flex min-h-[44px] items-center px-1 text-xs font-semibold text-amber-700 underline hover:text-amber-800 disabled:opacity-50 dark:text-amber-300"
            >
              {resetting ? `${CARD_PANEL_COPY.resetting}...` : CARD_PANEL_COPY.resetToCatalog}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const LoadError: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => (
  <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200">
    <p>{message}</p>
    <button type="button" onClick={onRetry} className="mt-2 min-h-[44px] rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700">
      {CARD_PANEL_COPY.retry}
    </button>
  </div>
);

const CardRecordPanel: React.FC<CardRecordPanelProps> = ({ itemId, currentPrice, onApplyPrice, onApplyTitle, onDirtyChange, disabled }) => {
  const baseId = useId();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  // --- server data ---------------------------------------------------------
  const vocabQuery = useQuery({
    queryKey: ['card-vocabulary'],
    queryFn: async (): Promise<CardVocabulary> => {
      const res = await api.get('/cards/vocabulary');
      const vocab = normalizeVocabulary(res.data);
      if (!vocab) throw new Error('Card options were empty');
      return vocab;
    },
    staleTime: 10 * 60 * 1000,
    retry: 1,
    retryDelay: 500,
    refetchOnWindowFocus: false,
  });

  const statusQuery = useQuery({
    queryKey: ['card-catalog-status'],
    queryFn: async () => readStatus((await api.get('/cards/status')).data),
    staleTime: 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const cardQueryKey = ['item-card', itemId];
  const cardQuery = useQuery({
    queryKey: cardQueryKey,
    queryFn: async (): Promise<StoredCard | null> => {
      const res = await api.get(`/item-cards/${itemId}`);
      return (res.data?.data ?? null) as StoredCard | null;
    },
    enabled: !!itemId,
    staleTime: 0,
    retry: 1,
    retryDelay: 500,
    refetchOnWindowFocus: false,
  });

  const card: StoredCard | null = cardQuery.data ?? null;
  const vocab = vocabQuery.data;
  const status = statusQuery.data ?? UNKNOWN_STATUS;

  // --- local form state ----------------------------------------------------
  const [form, setForm] = useState<CardFormValues>(() => formFromCard(null));
  const [graded, setGraded] = useState(false);
  const [open, setOpen] = useState<boolean | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [panelError, setPanelError] = useState<string | null>(null);
  const [retryTarget, setRetryTarget] = useState<RetryTarget | null>(null);
  const [saving, setSaving] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [resettingField, setResettingField] = useState<FormField | null>(null);
  const syncedFor = useRef<string | null>(null);

  // Fill the form once per item when its card has loaded. After that the form is the seller's.
  useEffect(() => {
    if (!cardQuery.isSuccess) return;
    if (syncedFor.current === itemId) return;
    syncedFor.current = itemId;
    setForm(formFromCard(cardQuery.data));
    setGraded(isGradedCard(cardQuery.data));
    setFieldErrors({});
    setPanelError(null);
  }, [cardQuery.isSuccess, cardQuery.data, itemId]);

  const dirty = cardQuery.isSuccess && hasUnsavedChanges(form, graded, card);
  useEffect(() => {
    if (onDirtyChange) onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  const busy = !!disabled || saving || !!applyingId || !!resettingField;
  const isOpen = open ?? (card !== null || dirty);
  const showPriceFlag = cardQuery.isSuccess && needsPriceFlag(card, form, currentPrice);

  const setField = (field: FormField, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  /** Shows a server card in the form and in the cache. */
  const takeServerCard = (next: StoredCard | null) => {
    queryClient.setQueryData(cardQueryKey, next);
    setForm(formFromCard(next));
    setGraded(isGradedCard(next));
    setFieldErrors({});
  };

  /**
   * Saves what the seller typed (so the server locks it) before a catalog pick or a reset. Returns false
   * when something has to be fixed first or the save failed. `exclude` leaves a field out (a typed edit
   * that a reset is throwing away). A new card with only a game chosen is not saved here: the pick
   * creates the card with the catalog's game.
   */
  const saveTypedFirst = async (exclude: FormField[] = []): Promise<boolean> => {
    const patch = diffFormAgainstCard(form, graded, card, { exclude });
    const keys = Object.keys(patch).filter((k) => !(card === null && k === 'game'));
    if (keys.length === 0) return true;
    const errors = validateForm(form, graded);
    for (const f of exclude) delete errors[f];
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setPanelError(CARD_PANEL_COPY.fixFields);
      setRetryTarget(null);
      return false;
    }
    const res = await api.put(`/item-cards/${itemId}`, patch);
    takeServerCard((res.data?.data ?? null) as StoredCard | null);
    return true;
  };

  const savePanel = async () => {
    setPanelError(null);
    setRetryTarget(null);
    const errors = validateForm(form, graded);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setPanelError(CARD_PANEL_COPY.fixFields);
      return;
    }
    const patch = diffFormAgainstCard(form, graded, card);
    if (Object.keys(patch).length === 0) {
      showToast(CARD_PANEL_COPY.nothingToSave, 'info');
      return;
    }
    setSaving(true);
    try {
      const res = await api.put(`/item-cards/${itemId}`, patch);
      takeServerCard((res.data?.data ?? null) as StoredCard | null);
      showToast(CARD_PANEL_COPY.saved, 'success');
    } catch (err) {
      // The form is left exactly as typed, so Try again re-sends the same values.
      setPanelError(readApiError(err).message || GENERIC_ERROR);
      setRetryTarget({ kind: 'save' });
    } finally {
      setSaving(false);
    }
  };

  const applyPrinting = async (printing: PrintingResult) => {
    setPanelError(null);
    setRetryTarget(null);
    setApplyingId(printing.id);
    try {
      const ready = await saveTypedFirst();
      if (!ready) return;
      const res = await api.post(`/item-cards/${itemId}/apply-printing`, { printingId: printing.id });
      takeServerCard((res.data?.data ?? null) as StoredCard | null);
      setOpen(true);
      showToast(CARD_PANEL_COPY.printingApplied, 'success');
    } catch (err) {
      setPanelError(readApiError(err).message || GENERIC_ERROR);
      setRetryTarget({ kind: 'apply', printing });
    } finally {
      setApplyingId(null);
    }
  };

  const resetField = async (field: FormField) => {
    if (!card?.catalogPrintingId) return;
    const printingId = card.catalogPrintingId;
    setPanelError(null);
    setRetryTarget(null);
    setResettingField(field);
    try {
      const ready = await saveTypedFirst([field]);
      if (!ready) return;
      const res = await api.post(`/item-cards/${itemId}/apply-printing`, { printingId, resetFields: [field] });
      takeServerCard((res.data?.data ?? null) as StoredCard | null);
      showToast(CARD_PANEL_COPY.fieldReset, 'success');
    } catch (err) {
      setPanelError(readApiError(err).message || GENERIC_ERROR);
      setRetryTarget({ kind: 'reset', field });
    } finally {
      setResettingField(null);
    }
  };

  const retry = () => {
    if (!retryTarget) return;
    if (retryTarget.kind === 'save') void savePanel();
    else if (retryTarget.kind === 'apply') void applyPrinting(retryTarget.printing);
    else void resetField(retryTarget.field);
  };

  // --- render --------------------------------------------------------------
  const loadingBody = vocabQuery.isLoading || cardQuery.isLoading;
  const lockedFields = new Set<FormField>(lockedFormFields(card));
  const availability = vocab ? lookupAvailability(status, form.game, vocab.games) : 'chooseGame';
  const lookupEnabled = !(status.known && !status.ready);
  const suggestedTitle = vocab && onApplyTitle ? buildSuggestedTitle(form, graded, vocab) : null;
  const credit = creditLine(status);
  const asOf = formatDataDate(status.dataAsOf.SCRYFALL ?? status.dataAsOf.TCGCSV);
  const bodyId = `${baseId}-body`;

  const fieldShell = (field: FormField, id: string, control: React.ReactNode, className?: string) => (
    <FieldShell
      id={id}
      field={field}
      locked={lockedFields.has(field)}
      canReset={canResetField(card, field)}
      resetting={resettingField === field}
      busy={busy}
      error={fieldErrors[field]}
      onReset={resetField}
      className={className}
    >
      {control}
    </FieldShell>
  );

  const textInput = (field: FormField, id: string, maxLength: number, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input
      id={id}
      type="text"
      value={form[field]}
      maxLength={maxLength}
      disabled={busy}
      aria-invalid={fieldErrors[field] ? true : undefined}
      aria-describedby={fieldErrors[field] ? `${id}-error` : undefined}
      autoComplete="off"
      onChange={(e) => setField(field, e.target.value)}
      className={inputCls}
      {...extra}
    />
  );

  const selectInput = (field: FormField, id: string, placeholder: string, options: Array<{ code: string; label: string }>) => (
    <select
      id={id}
      value={form[field]}
      disabled={busy}
      aria-invalid={fieldErrors[field] ? true : undefined}
      aria-describedby={fieldErrors[field] ? `${id}-error` : undefined}
      onChange={(e) => setField(field, e.target.value)}
      className={inputCls}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.code} value={o.code}>
          {o.label}
        </option>
      ))}
    </select>
  );

  return (
    <section
      aria-labelledby={`${baseId}-title`}
      className="min-w-0 max-w-full space-y-4 rounded-xl border border-warm-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900"
      onKeyDown={(e) => {
        // The page mounts this panel inside its item form. Enter in a card field must not submit (save) the whole item.
        if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') e.preventDefault();
      }}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 id={`${baseId}-title`} className="text-base font-semibold text-warm-900 dark:text-warm-100">
          {CARD_PANEL_COPY.title}
        </h2>
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={bodyId}
          onClick={() => setOpen(!isOpen)}
          className={`${secondaryBtn} w-full sm:w-auto`}
        >
          {isOpen ? CARD_PANEL_COPY.close : CARD_PANEL_COPY.open}
        </button>
      </div>

      {showPriceFlag && (
        <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-700 dark:bg-amber-900/30">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">{CARD_PANEL_COPY.needsPrice}</p>
          <p className="text-xs text-amber-800 dark:text-amber-300">{CARD_PANEL_COPY.needsPriceHint}</p>
        </div>
      )}

      {/* One-tap confirmation of the condition the photo tagging pass suggested. Shows only while the card has no condition. */}
      <CardConditionConfirm itemId={itemId} onSaved={takeServerCard} hideWhenConfirmed disabled={disabled} />

      <div id={bodyId} hidden={!isOpen} className="min-w-0 space-y-5">
        {isOpen && (
          <>
            {loadingBody && (
              <div role="status" aria-label={CARD_PANEL_COPY.loadingCard} className="space-y-3">
                <Skeleton className="h-11 w-full" />
                <Skeleton className="h-11 w-full" />
                <Skeleton className="h-11 w-2/3" />
              </div>
            )}

            {!loadingBody && vocabQuery.isError && (
              <LoadError message={CARD_PANEL_COPY.loadOptionsError} onRetry={() => vocabQuery.refetch()} />
            )}
            {!loadingBody && !vocabQuery.isError && cardQuery.isError && (
              <LoadError message={`${CARD_PANEL_COPY.loadCardError} ${readApiError(cardQuery.error).message}`} onRetry={() => cardQuery.refetch()} />
            )}

            {!loadingBody && vocab && cardQuery.isSuccess && (
              <>
                <p className="text-xs text-warm-500 dark:text-warm-400">{CARD_PANEL_COPY.intro}</p>

                <CardSearchBox game={form.game} availability={availability} busy={busy} applyingId={applyingId} onUse={applyPrinting} />

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-warm-900 dark:text-warm-100">{CARD_PANEL_COPY.detailsHeading}</h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {fieldShell('game', `${baseId}-game`, selectInput('game', `${baseId}-game`, CARD_PANEL_COPY.gameChoose, vocab.games))}
                    {fieldShell('cardName', `${baseId}-name`, textInput('cardName', `${baseId}-name`, 200), 'sm:col-span-2')}
                    {fieldShell('setName', `${baseId}-setname`, textInput('setName', `${baseId}-setname`, 200))}
                    {fieldShell('setCode', `${baseId}-setcode`, textInput('setCode', `${baseId}-setcode`, 20))}
                    {fieldShell('collectorNumber', `${baseId}-number`, textInput('collectorNumber', `${baseId}-number`, 20))}
                    {fieldShell('rarity', `${baseId}-rarity`, textInput('rarity', `${baseId}-rarity`, 40))}
                    {fieldShell('language', `${baseId}-language`, selectInput('language', `${baseId}-language`, CARD_PANEL_COPY.notSet, vocab.languages))}
                    {fieldShell('finish', `${baseId}-finish`, selectInput('finish', `${baseId}-finish`, CARD_PANEL_COPY.notSet, vocab.finishes))}
                    {fieldShell(
                      'releaseYear',
                      `${baseId}-year`,
                      textInput('releaseYear', `${baseId}-year`, 4, { inputMode: 'numeric' })
                    )}
                  </div>

                  <div className="space-y-3 rounded-lg border border-warm-200 p-3 dark:border-gray-600">
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={graded}
                        aria-labelledby={`${baseId}-graded-label`}
                        disabled={busy}
                        onClick={() => {
                          setGraded(!graded);
                          setFieldErrors({});
                        }}
                        className={`relative inline-flex h-[44px] w-[64px] flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
                          graded ? 'bg-amber-600' : 'bg-warm-300 dark:bg-gray-600'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`inline-block h-8 w-8 transform rounded-full bg-white shadow transition-transform ${graded ? 'translate-x-[28px]' : 'translate-x-1'}`}
                        />
                      </button>
                      <div className="min-w-0">
                        <p id={`${baseId}-graded-label`} className="text-sm font-medium text-warm-900 dark:text-warm-100">
                          {CARD_PANEL_COPY.graded}
                        </p>
                        <p className="text-xs text-warm-500 dark:text-warm-400">{CARD_PANEL_COPY.gradedHint}</p>
                      </div>
                    </div>

                    {graded ? (
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {fieldShell(
                          'grader',
                          `${baseId}-grader`,
                          selectInput('grader', `${baseId}-grader`, CARD_PANEL_COPY.graderChoose, vocab.graders.map((g) => ({ code: g, label: g })))
                        )}
                        {fieldShell(
                          'grade',
                          `${baseId}-grade`,
                          selectInput('grade', `${baseId}-grade`, CARD_PANEL_COPY.gradeChoose, vocab.grades.map((g) => ({ code: g, label: g })))
                        )}
                        {fieldShell('certNumber', `${baseId}-cert`, textInput('certNumber', `${baseId}-cert`, CERT_MAX_LENGTH), 'sm:col-span-2')}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {fieldShell('conditionCode', `${baseId}-condition`, selectInput('conditionCode', `${baseId}-condition`, CARD_PANEL_COPY.notSet, vocab.conditionCodes))}
                      </div>
                    )}
                  </div>

                  {panelError && (
                    <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200">
                      <p>{panelError}</p>
                      {retryTarget && (
                        <button type="button" onClick={retry} disabled={busy} className="mt-2 min-h-[44px] rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                          {CARD_PANEL_COPY.retry}
                        </button>
                      )}
                    </div>
                  )}

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <button type="button" onClick={savePanel} disabled={busy || !dirty} className={`${primaryBtn} w-full sm:w-auto`}>
                      {saving ? `${CARD_PANEL_COPY.saving}...` : CARD_PANEL_COPY.save}
                    </button>
                    {dirty && <p className="text-xs text-amber-700 dark:text-amber-300">{CARD_PANEL_COPY.unsaved}</p>}
                  </div>
                </div>

                <SuggestedPriceBox
                  printingId={card?.catalogPrintingId ?? null}
                  graded={graded}
                  finish={form.finish}
                  conditionCode={form.conditionCode}
                  language={form.language}
                  vocab={vocab}
                  lookupEnabled={lookupEnabled}
                  busy={busy}
                  onUse={(price) => {
                    onApplyPrice(price);
                    showToast(CARD_PANEL_COPY.priceApplied, 'success');
                  }}
                />

                {onApplyTitle && suggestedTitle && (
                  <div className="space-y-2 rounded-lg border border-warm-200 px-3 py-3 dark:border-gray-600">
                    <p className="break-words text-sm text-warm-700 dark:text-warm-300">{suggestedTitle}</p>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        onApplyTitle(suggestedTitle);
                        showToast(CARD_PANEL_COPY.titleApplied, 'success');
                      }}
                      className={`${secondaryBtn} w-full sm:w-auto`}
                    >
                      {CARD_PANEL_COPY.suggestedTitle}
                    </button>
                  </div>
                )}

                {credit && (
                  <p className="text-xs text-warm-500 dark:text-warm-400">
                    {credit}
                    {asOf ? `. ${CARD_PANEL_COPY.creditAsOf}${asOf}.` : '.'}
                  </p>
                )}
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
};

export default CardRecordPanel;
