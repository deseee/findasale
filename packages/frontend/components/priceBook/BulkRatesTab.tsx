/**
 * BulkRatesTab (ADR-140 sections 8.2, 8.3 and 11.3): the one-screen bulk rate card.
 *
 * Game tabs, a finish selector, "We sell" and "We pay (cash)" grids, one "Save rates" button that saves the whole screen in
 * one request, "Move all sell rates" (a preview first, nothing saved until the shop confirms), "Apply to my bulk lots" (hands
 * over to the Changes tab) and the buy calculator. Before saving, a rate that moved by more than half is flagged with the
 * "check that is what you meant" confirmation (the same check the server's rateChangeWarnings makes). The blank card is the
 * default: nothing is filled in from anywhere.
 */
import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ADJUST_PERCENT_MAX, ADJUST_PERCENT_MIN, BULK_RATES_MAX_ROWS, priceBookApi, readPriceBookError } from '../../lib/priceBook';
import type { PriceBookStatus, PriceBookView } from '../../lib/priceBook';
import {
  DIRECTION_LABELS,
  FINISH_LABELS,
  PRICE_BOOK_COPY,
  PRICE_BOOK_UI,
  TIER_LABELS,
  UNIT_LABELS,
} from '../../lib/priceBookCopy';
import { formatBps, formatMoney, rateChangeWarnings } from '../../lib/priceBookRules';
import AccessibleModal from '../AccessibleModal';
import ConfirmDialog from '../ConfirmDialog';
import { useToast } from '../ToastContext';
import BuyCalculator from './BuyCalculator';
import RateGrid, { buildSaveRows, draftFromRates, emptyCell, isGridDirty, originalByKey } from './RateGrid';
import type { CellDraft, GridDraft } from './RateGrid';
import {
  dialogContentCls,
  headingCls,
  inputCls,
  labelCls,
  labelOf,
  mutedCls,
  noticeErrorCls,
  noticeInfoCls,
  optionsFrom,
  parseSignedPercent,
  primaryBtn,
  secondaryBtn,
  sectionCls,
} from './ui';
import { pbKeys, useRefreshPriceBook, useReportError } from './usePriceBookData';

/** The game tabs of the rate card. Games other than Magic and Pokemon share the "Other" card. */
const GAME_TABS = ['MTG', 'POKEMON', 'OTHER'] as const;

// ---------------------------------------------------------------------------
// "Move all rates" preview
// ---------------------------------------------------------------------------

export interface AdjustRow {
  tier: string;
  finish: string;
  unit: string;
  direction: string;
  beforeCents: number;
  afterCents: number;
}

/** Reads the preview of "Move all rates": the rows that would change. Rows without both numbers are dropped. */
export function readAdjustPreview(data: unknown): { rows: AdjustRow[]; unchanged: number } {
  const root = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const list = Array.isArray(root.changes) ? root.changes : [];
  const rows: AdjustRow[] = [];
  list.forEach((x) => {
    const r = x && typeof x === 'object' ? (x as Record<string, unknown>) : {};
    if (typeof r.beforeCents === 'number' && typeof r.afterCents === 'number' && typeof r.tier === 'string') {
      rows.push({
        tier: r.tier,
        finish: typeof r.finish === 'string' ? r.finish : 'ANY',
        unit: typeof r.unit === 'string' ? r.unit : '',
        direction: typeof r.direction === 'string' ? r.direction : '',
        beforeCents: r.beforeCents,
        afterCents: r.afterCents,
      });
    }
  });
  return { rows, unchanged: typeof root.unchangedCount === 'number' ? root.unchangedCount : 0 };
}

interface MoveAllDialogProps {
  game: string;
  finish: string;
  onClose: () => void;
  onApplied: (count: number) => void;
}

const MoveAllDialog: React.FC<MoveAllDialogProps> = ({ game, finish, onClose, onApplied }) => {
  const baseId = useId();
  const [direction, setDirection] = useState<'SELL' | 'BUY'>('SELL');
  const [finishChoice, setFinishChoice] = useState(finish === 'ANY' ? '' : finish);
  const [percentText, setPercentText] = useState('');
  const [rows, setRows] = useState<AdjustRow[] | null>(null);
  const [error, setError] = useState('');
  const finishes = optionsFrom(null, FINISH_LABELS);

  const percent = parseSignedPercent(percentText);
  const percentOk = percent !== null && percent >= ADJUST_PERCENT_MIN && percent <= ADJUST_PERCENT_MAX;

  const preview = useMutation({
    mutationFn: () => priceBookApi.adjustBulkRates({ game, finish: finishChoice || null, direction, percent: percent as number, apply: false }),
    onSuccess: (data) => {
      setError('');
      const read = readAdjustPreview(data);
      setRows(read.rows);
    },
    onError: (err) => setError(readPriceBookError(err).message),
  });

  const apply = useMutation({
    mutationFn: () => priceBookApi.adjustBulkRates({ game, finish: finishChoice || null, direction, percent: percent as number, apply: true }),
    onSuccess: () => onApplied(rows ? rows.length : 0),
    onError: (err) => setError(readPriceBookError(err).message),
  });

  const busy = preview.isPending || apply.isPending;
  const titleId = `${baseId}-title`;

  return (
    <AccessibleModal isOpen onClose={onClose} ariaLabelledBy={titleId} contentClassName={dialogContentCls}>
      <div className="space-y-4">
        <h2 id={titleId} className={headingCls}>{PRICE_BOOK_COPY.moveAllRates}</h2>
        <p className={mutedCls}>{PRICE_BOOK_UI.moveAllHelp}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor={`${baseId}-dir`} className={labelCls}>{PRICE_BOOK_UI.fieldWhichRates}</label>
            <select
              id={`${baseId}-dir`}
              className={inputCls}
              value={direction}
              disabled={busy}
              onChange={(e) => {
                setDirection(e.target.value === 'BUY' ? 'BUY' : 'SELL');
                setRows(null);
              }}
            >
              <option value="SELL">{DIRECTION_LABELS.SELL}</option>
              <option value="BUY">{DIRECTION_LABELS.BUY}</option>
            </select>
          </div>
          <div>
            <label htmlFor={`${baseId}-fin`} className={labelCls}>{PRICE_BOOK_UI.fieldFinish}</label>
            <select
              id={`${baseId}-fin`}
              className={inputCls}
              value={finishChoice}
              disabled={busy}
              onChange={(e) => {
                setFinishChoice(e.target.value);
                setRows(null);
              }}
            >
              <option value="">{PRICE_BOOK_UI.allFinishes}</option>
              {finishes.map((f) => (
                <option key={f.code} value={f.code}>{f.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${baseId}-pct`} className={labelCls}>{PRICE_BOOK_UI.fieldChangePercent}</label>
            <input
              id={`${baseId}-pct`}
              className={inputCls}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={percentText}
              disabled={busy}
              aria-invalid={percentText.trim() !== '' && !percentOk}
              onChange={(e) => {
                setPercentText(e.target.value);
                setRows(null);
              }}
            />
          </div>
        </div>
        {percentText.trim() !== '' && !percentOk && (
          <p role="alert" className={noticeErrorCls}>{PRICE_BOOK_UI.errorPercentRange(ADJUST_PERCENT_MIN, ADJUST_PERCENT_MAX)}</p>
        )}
        {error && <p role="alert" className={noticeErrorCls}>{error}</p>}

        {rows && rows.length === 0 && <p role="status" className={noticeInfoCls}>{PRICE_BOOK_UI.moveAllNothing}</p>}
        {rows && rows.length > 0 && (
          <div className="max-h-72 overflow-y-auto rounded-lg border border-warm-200 dark:border-gray-700">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">{PRICE_BOOK_UI.moveAllPreviewCaption}</caption>
              <thead>
                <tr className="text-xs uppercase text-warm-500 dark:text-warm-400">
                  <th scope="col" className="px-3 py-2">{PRICE_BOOK_UI.fieldTier}</th>
                  <th scope="col" className="px-3 py-2">{PRICE_BOOK_UI.colBefore}</th>
                  <th scope="col" className="px-3 py-2">{PRICE_BOOK_UI.colAfter}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-warm-200 dark:divide-gray-700">
                {rows.map((r, i) => (
                  <tr key={`${i}-${r.tier}-${r.finish}-${r.unit}`}>
                    <td className="px-3 py-2 text-warm-900 dark:text-warm-100">
                      {labelOf(TIER_LABELS, r.tier, r.tier)}
                      <span className="block text-xs text-warm-500 dark:text-warm-400">
                        {labelOf(FINISH_LABELS, r.finish, r.finish)}, {labelOf(UNIT_LABELS, r.unit, r.unit)}
                      </span>
                    </td>
                    <td className="px-3 py-2">{formatMoney(r.beforeCents)}</td>
                    <td className="px-3 py-2 font-semibold">{formatMoney(r.afterCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" className={secondaryBtn} onClick={onClose} disabled={apply.isPending}>{PRICE_BOOK_UI.cancel}</button>
          <button type="button" className={secondaryBtn} disabled={busy || !percentOk} onClick={() => preview.mutate()}>
            {preview.isPending ? PRICE_BOOK_UI.working : PRICE_BOOK_UI.previewChanges}
          </button>
          <button type="button" className={primaryBtn} disabled={busy || !rows || rows.length === 0} onClick={() => apply.mutate()}>
            {apply.isPending ? PRICE_BOOK_UI.working : PRICE_BOOK_UI.applyChanges}
          </button>
        </div>
      </div>
    </AccessibleModal>
  );
};

// ---------------------------------------------------------------------------
// The tab
// ---------------------------------------------------------------------------

export interface BulkRatesTabProps {
  book: PriceBookView;
  status: PriceBookStatus;
  /** Switches to the Changes tab with a bulk lot run ready to preview. */
  onApplyToLots: () => void;
}

const BulkRatesTab: React.FC<BulkRatesTabProps> = ({ book, onApplyToLots }) => {
  const baseId = useId();
  const { showToast } = useToast();
  const report = useReportError();
  const refresh = useRefreshPriceBook();
  const [game, setGame] = useState<string>('MTG');
  const [pendingGame, setPendingGame] = useState<string | null>(null);
  const [finish, setFinish] = useState('ANY');
  const [draft, setDraft] = useState<GridDraft>({});
  const [warnings, setWarnings] = useState<string[] | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [problem, setProblem] = useState('');

  const query = useQuery({
    queryKey: pbKeys.bulkRates(game),
    queryFn: () => priceBookApi.getBulkRates(game),
    staleTime: 0,
    retry: 1,
    refetchOnWindowFocus: false,
  });
  const rates = useMemo(() => (query.data ? query.data.rates : []), [query.data]);
  const original = useMemo(() => originalByKey(rates), [rates]);

  useEffect(() => {
    setDraft(draftFromRates(rates));
    setProblem('');
  }, [rates]);

  const dirty = useMemo(() => isGridDirty(draft, original), [draft, original]);
  const finishes = optionsFrom(null, FINISH_LABELS);

  const onCellChange = useCallback((key: string, patch: Partial<CellDraft>) => {
    setDraft((cur) => ({ ...cur, [key]: { ...(cur[key] || emptyCell()), ...patch } }));
  }, []);

  const save = useMutation({
    mutationFn: async () => {
      const built = buildSaveRows(draft, original);
      const version = query.data && query.data.version !== null ? query.data.version : book.version;
      await priceBookApi.putBulkRates(game, built.rows, version);
      return built.changed;
    },
    onSuccess: (changed) => {
      setWarnings(null);
      showToast(PRICE_BOOK_COPY.ratesSaved(changed), 'success');
      void refresh();
    },
    onError: (err) => {
      setWarnings(null);
      report(err);
    },
  });

  const startSave = (): void => {
    const built = buildSaveRows(draft, original);
    if (built.problems.length > 0) {
      setProblem(built.problems[0].message);
      return;
    }
    setProblem('');
    if (built.rows.length > BULK_RATES_MAX_ROWS) {
      setProblem(PRICE_BOOK_UI.tooManyRates);
      return;
    }
    const found = rateChangeWarnings(built.changes);
    if (found.length > 0) {
      setWarnings(found);
      return;
    }
    save.mutate();
  };

  const creditPercent = formatBps(book.buyCreditBps);

  return (
    <div className="space-y-6">
      <section aria-labelledby={`${baseId}-title`} className={sectionCls}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 id={`${baseId}-title`} className={headingCls}>{PRICE_BOOK_COPY.bulkHeading}</h2>
          <div role="group" aria-label={PRICE_BOOK_UI.fieldGame} className="flex flex-wrap gap-2">
            {GAME_TABS.map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={game === g}
                onClick={() => (g === game ? undefined : dirty ? setPendingGame(g) : setGame(g))}
                className={`inline-flex min-h-[44px] items-center rounded-lg px-4 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                  game === g
                    ? 'bg-amber-600 text-white'
                    : 'border border-warm-300 bg-white text-warm-800 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100'
                }`}
              >
                {PRICE_BOOK_UI.gameTab(g)}
              </button>
            ))}
          </div>
        </div>
        <div className="max-w-xs">
          <label htmlFor={`${baseId}-finish`} className={labelCls}>{PRICE_BOOK_UI.fieldFinish}</label>
          <select id={`${baseId}-finish`} className={inputCls} value={finish} onChange={(e) => setFinish(e.target.value)}>
            {finishes.map((f) => (
              <option key={f.code} value={f.code}>{f.label}</option>
            ))}
          </select>
        </div>
        <p className={mutedCls}>{PRICE_BOOK_COPY.rateNoteHelp}</p>

        {query.isLoading && <p role="status" className={mutedCls}>{PRICE_BOOK_COPY.loading}</p>}
        {query.isError && (
          <div role="alert" className={noticeErrorCls}>
            <p>{PRICE_BOOK_COPY.loadError}</p>
            <button type="button" className={`${secondaryBtn} mt-2`} onClick={() => query.refetch()}>{PRICE_BOOK_COPY.retry}</button>
          </div>
        )}

        {query.isSuccess && (
          <>
            <RateGrid direction="SELL" finish={finish} draft={draft} onChange={onCellChange} disabled={save.isPending} />
            <RateGrid direction="BUY" finish={finish} draft={draft} onChange={onCellChange} disabled={save.isPending} creditPercentText={creditPercent} />
          </>
        )}

        {problem && <p role="alert" className={noticeErrorCls}>{problem}</p>}

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <button type="button" className={primaryBtn} disabled={!query.isSuccess || !dirty || save.isPending} onClick={startSave}>
            {save.isPending ? PRICE_BOOK_UI.saving : PRICE_BOOK_COPY.saveRates}
          </button>
          <button type="button" className={secondaryBtn} disabled={!query.isSuccess || dirty} onClick={() => setMoveOpen(true)}>
            {PRICE_BOOK_COPY.moveAllRates}
          </button>
          <button type="button" className={secondaryBtn} onClick={onApplyToLots}>
            {PRICE_BOOK_COPY.applyToLots}
          </button>
        </div>
        {dirty && <p className="text-xs text-warm-500 dark:text-warm-400">{PRICE_BOOK_UI.saveBeforeMove}</p>}
      </section>

      <BuyCalculator game={game} />

      {moveOpen && (
        <MoveAllDialog
          game={game}
          finish={finish}
          onClose={() => setMoveOpen(false)}
          onApplied={(count) => {
            setMoveOpen(false);
            showToast(PRICE_BOOK_COPY.ratesSaved(count), 'success');
            void refresh();
          }}
        />
      )}

      <ConfirmDialog
        isOpen={pendingGame !== null}
        title={PRICE_BOOK_UI.switchGameTitle}
        message={PRICE_BOOK_UI.switchGameMessage}
        confirmLabel={PRICE_BOOK_UI.switchGameYes}
        cancelLabel={PRICE_BOOK_UI.goBack}
        onCancel={() => setPendingGame(null)}
        onConfirm={() => {
          if (pendingGame) setGame(pendingGame);
          setPendingGame(null);
        }}
      />

      <ConfirmDialog
        isOpen={warnings !== null}
        title={PRICE_BOOK_UI.checkRatesTitle}
        message={warnings ? warnings.join('\n') : ''}
        confirmLabel={PRICE_BOOK_UI.saveAnyway}
        cancelLabel={PRICE_BOOK_UI.goBack}
        onCancel={() => setWarnings(null)}
        onConfirm={() => save.mutate()}
      />
    </div>
  );
};

export default BulkRatesTab;
