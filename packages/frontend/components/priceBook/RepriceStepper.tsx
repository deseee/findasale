/**
 * RepriceStepper (ADR-140 section 11.5): "Reprice my cards" as four steps. 1 Scope, 2 Preview (summary line, four views,
 * ticks), 3 Apply (the count and the one-line confirmation), 4 Done (the counts and "Undo these changes").
 *
 * The server owns the run, the ticks and the new prices. This file asks for a preview, shows the rows, sends the ticks the
 * shop makes, counts the ticked rows by reading them back (never by local arithmetic on prices), and calls apply with the
 * run's book version and that count. Apply and undo repeat until the status is no longer APPLYING (runUntilDone).
 * A run preview older than 30 minutes shows "This preview is out of date. Preview again."
 */
import React, { useId, useMemo, useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RUN_ITEMS_PAGE_MAX, priceBookApi, readPriceBookError, runUntilDone } from '../../lib/priceBook';
import type { PriceBookRunItem, PriceBookRunSummary, PriceBookView, RunProgress, RunScope, RunViewName } from '../../lib/priceBook';
import { FINISH_LABELS, PRICE_BOOK_COPY, PRICE_BOOK_UI, RARITY_CLASS_LABELS, RULE_GAME_WORDS } from '../../lib/priceBookCopy';
import {
  describeApplyButton,
  describeApplyConfirm,
  describeApplyOutcome,
  describePreviewSummary,
  describeUndoOutcome,
  isPreviewStale,
} from '../../lib/priceBookRules';
import PreviewTable from './PreviewTable';
import {
  cardCls,
  checkboxCls,
  headingCls,
  inputCls,
  labelCls,
  mutedCls,
  noticeErrorCls,
  noticeInfoCls,
  noticeOkCls,
  noticeWarnCls,
  optionsFrom,
  primaryBtn,
  secondaryBtn,
  smallBtn,
} from './ui';
import { PB_ROOT, useCardVocabulary, useNow, useOrganizerSaleChoices, useRefreshPriceBook } from './usePriceBookData';

export type StepperKind = 'BULK' | 'LOT';
type Phase = 'scope' | 'preview' | 'confirm' | 'done';

export interface RepriceStepperProps {
  kind: StepperKind;
  book: PriceBookView;
  /** Optional starting scope (the "Price the cards without a price" link). Read once when the stepper opens. */
  initialScope?: ScopeForm;
  onClose: () => void;
  /** Called after an apply or an undo finished, so the history list can refresh. */
  onFinished: () => void;
}

// ---------------------------------------------------------------------------
// Pure helpers (covered by lib/__tests__/priceBookComponents.test.ts)
// ---------------------------------------------------------------------------

export interface ScopeForm {
  saleId: string;
  game: string;
  rarityClass: string;
  setCode: string;
  finish: string;
  onlyUnpriced: boolean;
  includeMarkedDown: boolean;
  includeEbayLive: boolean;
  /** Set only by the link after a card import or scan save (ADR-140 section 12.4). Sent only together with onlyUnpriced. */
  intakeBatchId?: string;
}

export function emptyScope(): ScopeForm {
  return { saleId: '', game: '', rarityClass: '', setCode: '', finish: '', onlyUnpriced: false, includeMarkedDown: false, includeEbayLive: false };
}

/** The scope the "Price the cards without a price" link starts with: that sale, only cards without a price, that import batch. */
export function scopeFormFromPreset(preset: { saleId?: string | null; batchId?: string | null } | null | undefined): ScopeForm {
  if (!preset) return emptyScope();
  const out: ScopeForm = { ...emptyScope(), saleId: preset.saleId || '', onlyUnpriced: true };
  if (preset.batchId) out.intakeBatchId = preset.batchId;
  return out;
}

/** The scope the preview call sends. A lot run only ever sends a sale. */
export function scopeFromForm(kind: StepperKind, form: ScopeForm): RunScope {
  if (kind === 'LOT') return { saleId: form.saleId || null };
  const out: RunScope = {
    saleId: form.saleId || null,
    game: form.game || null,
    setCode: form.setCode.trim() || null,
    rarityClass: form.rarityClass || null,
    finish: form.finish || null,
    onlyUnpriced: form.onlyUnpriced,
  };
  if (form.onlyUnpriced && form.intakeBatchId) out.intakeBatchId = form.intakeBatchId;
  return out;
}

/** Failures that mean "preview again": the rules changed, the preview expired, or the ticked count moved. */
export function needsFreshPreview(code: string): boolean {
  return code === 'BOOK_CHANGED' || code === 'PREVIEW_EXPIRED' || code === 'COUNT_MISMATCH' || code === 'RUN_NOT_PREVIEW';
}

export interface RunItemsPage {
  items: PriceBookRunItem[];
  nextCursor: string | null;
}

const COUNT_MAX_PAGES = 80;

/**
 * How many rows will be applied: the ticked rows that are still ready to apply, read back from the server's "changes" and
 * "needs a look" views (a row in both is counted once). This is a count of server rows, not a price calculation.
 */
export async function countSelectedRows(fetchPage: (view: RunViewName, cursor: string | null) => Promise<RunItemsPage>): Promise<number> {
  const seen: Record<string, boolean> = {};
  let count = 0;
  const views: RunViewName[] = ['changes', 'review'];
  for (let v = 0; v < views.length; v += 1) {
    let cursor: string | null = null;
    for (let page = 0; page < COUNT_MAX_PAGES; page += 1) {
      const result: RunItemsPage = await fetchPage(views[v], cursor);
      result.items.forEach((item) => {
        if (seen[item.id]) return;
        seen[item.id] = true;
        if (item.selected && item.state === 'PENDING') count += 1;
      });
      if (!result.nextCursor) break;
      cursor = result.nextCursor;
    }
  }
  return count;
}

const VIEWS: ReadonlyArray<RunViewName> = ['changes', 'review', 'skipped', 'unchanged'];

function viewLabel(view: RunViewName): string {
  if (view === 'changes') return PRICE_BOOK_COPY.tabChanges;
  if (view === 'review') return PRICE_BOOK_COPY.needsALook;
  if (view === 'skipped') return PRICE_BOOK_COPY.tabSkipped;
  return PRICE_BOOK_COPY.tabUnchanged;
}

function viewCount(run: PriceBookRunSummary, view: RunViewName): number {
  if (view === 'changes') return run.counts.changes;
  if (view === 'review') return run.counts.review;
  if (view === 'skipped') return run.counts.skipped;
  return run.counts.unchanged;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const RepriceStepper: React.FC<RepriceStepperProps> = ({ kind, book, initialScope, onClose, onFinished }) => {
  const baseId = useId();
  const now = useNow();
  const queryClient = useQueryClient();
  const refresh = useRefreshPriceBook();
  const vocab = useCardVocabulary().data || null;
  const sales = useOrganizerSaleChoices(true);
  const [phase, setPhase] = useState<Phase>('scope');
  const [scope, setScope] = useState<ScopeForm>(() => initialScope || emptyScope());
  const [run, setRun] = useState<PriceBookRunSummary | null>(null);
  const [view, setView] = useState<RunViewName>('changes');
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [expected, setExpected] = useState(0);
  const [progress, setProgress] = useState<RunProgress | null>(null);
  const [doneLines, setDoneLines] = useState<string[]>([]);
  const [undoLines, setUndoLines] = useState<string[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [error, setError] = useState('');
  const [freshNeeded, setFreshNeeded] = useState(false);

  const isLot = kind === 'LOT';
  const runId = run ? run.id : '';
  const stale = run ? isPreviewStale(run.expiresAt, now) : false;

  const games = optionsFrom(vocab ? vocab.games : null, RULE_GAME_WORDS);
  const finishes = optionsFrom(vocab ? vocab.finishes : null, FINISH_LABELS, ['ANY']);
  const rarities = optionsFrom(null, RARITY_CLASS_LABELS, ['UNKNOWN']);

  const report = (err: unknown): void => {
    const known = readPriceBookError(err);
    setError(known.message);
    setFreshNeeded(needsFreshPreview(known.code));
  };

  const preview = useMutation({
    mutationFn: () =>
      priceBookApi.previewRun({
        kind,
        scope: scopeFromForm(kind, scope),
        includeMarkedDown: isLot ? false : scope.includeMarkedDown,
        includeEbayLive: isLot ? false : scope.includeEbayLive,
      }),
    onSuccess: (response) => {
      if (!response) {
        setError(PRICE_BOOK_UI.previewFailed);
        return;
      }
      setError('');
      setFreshNeeded(false);
      setRun(response.run);
      setOverrides({});
      setView('changes');
      setPhase('preview');
    },
    onError: report,
  });

  const rowsQuery = useInfiniteQuery({
    queryKey: [PB_ROOT, 'run-items', runId, view],
    queryFn: ({ pageParam }) => priceBookApi.listRunItems(runId, { view, cursor: pageParam, limit: RUN_ITEMS_PAGE_MAX }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: phase === 'preview' && runId !== '',
    staleTime: 0,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const rows: PriceBookRunItem[] = useMemo(() => {
    const out: PriceBookRunItem[] = [];
    (rowsQuery.data ? rowsQuery.data.pages : []).forEach((p) => p.items.forEach((r) => out.push(r)));
    return out;
  }, [rowsQuery.data]);

  const tickOne = useMutation({
    mutationFn: (args: { row: PriceBookRunItem; selected: boolean }) =>
      priceBookApi.patchRunItems(runId, args.selected ? { selectIds: [args.row.id] } : { deselectIds: [args.row.id] }),
    onMutate: (args) => {
      setOverrides((o) => ({ ...o, [args.row.id]: args.selected }));
    },
    onError: (err, args) => {
      setOverrides((o) => {
        const next = { ...o };
        delete next[args.row.id];
        return next;
      });
      report(err);
    },
  });

  const tickMany = useMutation({
    mutationFn: (opts: { selectAllChanges?: boolean; selectReview?: boolean }) => priceBookApi.patchRunItems(runId, opts),
    onSuccess: () => {
      setOverrides({});
      void queryClient.invalidateQueries({ queryKey: [PB_ROOT, 'run-items', runId] });
    },
    onError: report,
  });

  const count = useMutation({
    mutationFn: () => countSelectedRows((v, cursor) => priceBookApi.listRunItems(runId, { view: v, cursor, limit: RUN_ITEMS_PAGE_MAX })),
    onSuccess: (n) => {
      setError('');
      setExpected(n);
      setPhase('confirm');
    },
    onError: report,
  });

  const apply = useMutation({
    mutationFn: (args: { target: PriceBookRunSummary; expectedCount: number }) =>
      runUntilDone(
        () =>
          priceBookApi.applyRun(args.target.id, {
            ifBookVersion: args.target.bookVersion === null ? book.version : args.target.bookVersion,
            expectedCount: args.expectedCount,
          }),
        { onProgress: setProgress }
      ),
    onSuccess: (final) => {
      setError('');
      setFreshNeeded(false);
      setDoneLines(describeApplyOutcome(final));
      setCanUndo((final.status === 'APPLIED' || final.status === 'PARTIAL') && final.applied > 0);
      setPhase('done');
      void refresh();
      onFinished();
    },
    onError: report,
  });

  const undo = useMutation({
    mutationFn: (target: PriceBookRunSummary) => runUntilDone(() => priceBookApi.undoRun(target.id), { onProgress: setProgress }),
    onSuccess: (final) => {
      setError('');
      setUndoLines(describeUndoOutcome(final));
      setCanUndo(false);
      void refresh();
      onFinished();
    },
    onError: report,
  });

  const working = preview.isPending || count.isPending || apply.isPending || undo.isPending;

  const close = (): void => {
    if (run && (phase === 'preview' || phase === 'confirm')) {
      void priceBookApi.cancelRun(run.id).catch(() => undefined);
    }
    onClose();
  };

  const startOver = (): void => {
    setError('');
    setFreshNeeded(false);
    setProgress(null);
    if (run && (phase === 'preview' || phase === 'confirm')) void priceBookApi.cancelRun(run.id).catch(() => undefined);
    setRun(null);
    setPhase('scope');
  };

  const steps: Array<{ id: Phase; label: string }> = [
    { id: 'scope', label: PRICE_BOOK_UI.stepScope },
    { id: 'preview', label: PRICE_BOOK_UI.stepPreview },
    { id: 'confirm', label: PRICE_BOOK_UI.stepApply },
    { id: 'done', label: PRICE_BOOK_UI.stepDone },
  ];
  const currentIndex = steps.findIndex((s) => s.id === phase);
  const titleId = `${baseId}-title`;
  const setField = <K extends keyof ScopeForm>(key: K, value: ScopeForm[K]): void => setScope((s) => ({ ...s, [key]: value }));

  return (
    <section
      aria-labelledby={titleId}
      className={`${cardCls} min-w-0 space-y-4`}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !working) {
          e.stopPropagation();
          close();
        }
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id={titleId} className={headingCls}>{isLot ? PRICE_BOOK_UI.repriceLotsHeading : PRICE_BOOK_COPY.changesHeading}</h2>
        {phase !== 'done' && (
          <button type="button" className={smallBtn} disabled={working} onClick={close}>{PRICE_BOOK_UI.cancel}</button>
        )}
      </div>

      <ol className="flex flex-wrap gap-2" aria-label={PRICE_BOOK_UI.stepsLabel}>
        {steps.map((s, i) => (
          <li
            key={s.id}
            aria-current={i === currentIndex ? 'step' : undefined}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              i === currentIndex
                ? 'bg-amber-600 text-white'
                : i < currentIndex
                  ? 'bg-warm-200 text-warm-800 dark:bg-gray-700 dark:text-warm-100'
                  : 'border border-warm-300 text-warm-600 dark:border-gray-600 dark:text-warm-300'
            }`}
          >
            {PRICE_BOOK_UI.stepNumber(i + 1, s.label)}
          </li>
        ))}
      </ol>

      <div aria-live="polite" className="space-y-2">
        {error && (
          <div role="alert" className={noticeErrorCls}>
            <p>{error}</p>
            {freshNeeded && phase !== 'scope' && (
              <button type="button" className={`${secondaryBtn} mt-2`} disabled={working} onClick={startOver}>{PRICE_BOOK_UI.previewAgain}</button>
            )}
          </div>
        )}
      </div>

      {phase === 'scope' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={`${baseId}-sale`} className={labelCls}>{PRICE_BOOK_UI.scopeSale}</label>
              <select id={`${baseId}-sale`} className={inputCls} value={scope.saleId} onChange={(e) => setField('saleId', e.target.value)}>
                <option value="">{PRICE_BOOK_UI.allSales}</option>
                {(sales.data || []).map((s) => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </select>
            </div>
            {!isLot && (
              <>
                <div>
                  <label htmlFor={`${baseId}-game`} className={labelCls}>{PRICE_BOOK_UI.fieldGame}</label>
                  <select id={`${baseId}-game`} className={inputCls} value={scope.game} onChange={(e) => setField('game', e.target.value)}>
                    <option value="">{PRICE_BOOK_UI.anyGame}</option>
                    {games.map((g) => (
                      <option key={g.code} value={g.code}>{g.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor={`${baseId}-rarity`} className={labelCls}>{PRICE_BOOK_UI.fieldRarity}</label>
                  <select id={`${baseId}-rarity`} className={inputCls} value={scope.rarityClass} onChange={(e) => setField('rarityClass', e.target.value)}>
                    <option value="">{PRICE_BOOK_UI.anyOption}</option>
                    {rarities.map((r) => (
                      <option key={r.code} value={r.code}>{r.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor={`${baseId}-set`} className={labelCls}>{PRICE_BOOK_UI.fieldSetCode}</label>
                  <input id={`${baseId}-set`} className={inputCls} type="text" maxLength={20} value={scope.setCode} onChange={(e) => setField('setCode', e.target.value)} />
                </div>
                <div>
                  <label htmlFor={`${baseId}-finish`} className={labelCls}>{PRICE_BOOK_UI.fieldFinish}</label>
                  <select id={`${baseId}-finish`} className={inputCls} value={scope.finish} onChange={(e) => setField('finish', e.target.value)}>
                    <option value="">{PRICE_BOOK_UI.allFinishes}</option>
                    {finishes.map((f) => (
                      <option key={f.code} value={f.code}>{f.label}</option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>
          {isLot ? (
            <p className={mutedCls}>{PRICE_BOOK_UI.lotScopeHelp}</p>
          ) : (
            <div className="space-y-1">
              <label className="flex min-h-[44px] items-center gap-2 text-sm text-warm-800 dark:text-warm-200">
                <input type="checkbox" className={checkboxCls} checked={scope.onlyUnpriced} onChange={(e) => setField('onlyUnpriced', e.target.checked)} />
                {PRICE_BOOK_UI.onlyUnpriced}
              </label>
              <label className="flex min-h-[44px] items-center gap-2 text-sm text-warm-800 dark:text-warm-200">
                <input type="checkbox" className={checkboxCls} checked={scope.includeMarkedDown} onChange={(e) => setField('includeMarkedDown', e.target.checked)} />
                {PRICE_BOOK_COPY.includeMarkedDown}
              </label>
              <label className="flex min-h-[44px] items-center gap-2 text-sm text-warm-800 dark:text-warm-200">
                <input type="checkbox" className={checkboxCls} checked={scope.includeEbayLive} onChange={(e) => setField('includeEbayLive', e.target.checked)} />
                {PRICE_BOOK_COPY.includeEbayLive}
              </label>
            </div>
          )}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" className={secondaryBtn} onClick={close} disabled={working}>{PRICE_BOOK_UI.cancel}</button>
            <button type="button" className={primaryBtn} disabled={working} onClick={() => preview.mutate()}>
              {preview.isPending ? PRICE_BOOK_UI.working : PRICE_BOOK_COPY.previewButton}
            </button>
          </div>
        </div>
      )}

      {(phase === 'preview' || phase === 'confirm') && run && (
        <div className="space-y-4">
          <p className="text-sm font-semibold text-warm-900 dark:text-warm-100">{describePreviewSummary(run.counts)}</p>
          {stale && (
            <div role="alert" className={noticeWarnCls}>
              <p>{PRICE_BOOK_COPY.previewStale}</p>
              <button type="button" className={`${secondaryBtn} mt-2`} disabled={working} onClick={startOver}>{PRICE_BOOK_UI.previewAgain}</button>
            </div>
          )}
        </div>
      )}

      {phase === 'preview' && run && (
        <div className="space-y-4">
          <div role="group" aria-label={PRICE_BOOK_UI.viewsLabel} className="flex flex-wrap gap-2">
            {VIEWS.map((v) => (
              <button key={v} type="button" aria-pressed={view === v} className={view === v ? primaryBtn : secondaryBtn} onClick={() => setView(v)}>
                {PRICE_BOOK_UI.viewWithCount(viewLabel(v), viewCount(run, v))}
              </button>
            ))}
          </div>

          {(view === 'changes' || view === 'review') && run.counts.changes > 0 && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className={smallBtn} disabled={working || tickMany.isPending} onClick={() => tickMany.mutate({ selectAllChanges: true })}>{PRICE_BOOK_UI.tickAll}</button>
              <button type="button" className={smallBtn} disabled={working || tickMany.isPending} onClick={() => tickMany.mutate({ selectAllChanges: false })}>{PRICE_BOOK_UI.untickAll}</button>
              {run.counts.review > 0 && (
                <>
                  <button type="button" className={smallBtn} disabled={working || tickMany.isPending} onClick={() => tickMany.mutate({ selectReview: true })}>{PRICE_BOOK_UI.tickReview}</button>
                  <button type="button" className={smallBtn} disabled={working || tickMany.isPending} onClick={() => tickMany.mutate({ selectReview: false })}>{PRICE_BOOK_UI.untickReview}</button>
                </>
              )}
            </div>
          )}

          <div aria-live="polite">
            {rowsQuery.isLoading && <p role="status" className={mutedCls}>{PRICE_BOOK_COPY.loading}</p>}
            {rowsQuery.isError && (
              <div role="alert" className={noticeErrorCls}>
                <p>{PRICE_BOOK_COPY.loadError}</p>
                <button type="button" className={`${secondaryBtn} mt-2`} onClick={() => rowsQuery.refetch()}>{PRICE_BOOK_COPY.retry}</button>
              </div>
            )}
            {rowsQuery.isSuccess && rows.length === 0 && <p className={mutedCls}>{view === 'changes' ? PRICE_BOOK_UI.nothingToChange : PRICE_BOOK_UI.nothingInView}</p>}
          </div>

          <PreviewTable
            kind={kind}
            rows={rows}
            overrides={overrides}
            editable
            busy={tickOne.isPending || tickMany.isPending}
            onToggle={(row, selected) => tickOne.mutate({ row, selected })}
          />

          {rowsQuery.hasNextPage && (
            <button type="button" className={secondaryBtn} disabled={rowsQuery.isFetchingNextPage} onClick={() => rowsQuery.fetchNextPage()}>
              {rowsQuery.isFetchingNextPage ? PRICE_BOOK_UI.working : PRICE_BOOK_UI.loadMore}
            </button>
          )}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" className={secondaryBtn} disabled={working} onClick={startOver}>{PRICE_BOOK_UI.goBack}</button>
            <button type="button" className={primaryBtn} disabled={working || stale || tickOne.isPending || tickMany.isPending || run.counts.changes === 0} onClick={() => count.mutate()}>
              {count.isPending ? PRICE_BOOK_UI.working : PRICE_BOOK_UI.continueToApply}
            </button>
          </div>
        </div>
      )}

      {phase === 'confirm' && run && (
        <div className="space-y-4">
          {expected > 0 ? (
            <p className={noticeInfoCls}>{describeApplyConfirm(expected)}</p>
          ) : (
            <p className={noticeWarnCls}>{PRICE_BOOK_UI.nothingSelected}</p>
          )}
          {apply.isPending && progress && (
            <p role="status" className={mutedCls}>{PRICE_BOOK_UI.applyProgress(progress.applied, progress.remaining)}</p>
          )}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" className={secondaryBtn} disabled={working} onClick={() => setPhase('preview')}>{PRICE_BOOK_UI.goBack}</button>
            <button
              type="button"
              className={primaryBtn}
              disabled={working || stale || expected === 0}
              onClick={() => {
                setProgress(null);
                apply.mutate({ target: run, expectedCount: expected });
              }}
            >
              {apply.isPending ? PRICE_BOOK_UI.working : describeApplyButton(expected)}
            </button>
          </div>
        </div>
      )}

      {phase === 'done' && (
        <div className="space-y-4">
          <div role="status" className="space-y-1">
            <p className="text-base font-semibold text-warm-900 dark:text-warm-100">{PRICE_BOOK_UI.finishedHeading}</p>
            {doneLines.map((line) => (
              <p key={line} className={noticeOkCls}>{line}</p>
            ))}
            {undoLines.map((line) => (
              <p key={line} className={noticeOkCls}>{line}</p>
            ))}
            {undo.isPending && progress && <p className={mutedCls}>{PRICE_BOOK_UI.applyProgress(progress.undone, progress.remaining)}</p>}
          </div>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            {canUndo && run && (
              <button type="button" className={secondaryBtn} disabled={working} onClick={() => undo.mutate(run)}>
                {undo.isPending ? PRICE_BOOK_UI.working : PRICE_BOOK_COPY.undo}
              </button>
            )}
            <button type="button" className={primaryBtn} disabled={working} onClick={onClose}>{PRICE_BOOK_UI.done}</button>
          </div>
        </div>
      )}
    </section>
  );
};

export default RepriceStepper;
