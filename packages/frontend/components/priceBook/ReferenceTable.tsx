/**
 * ReferenceTable (ADR-140 sections 5.2, 5.4 and 11.4): the list of prices the shop typed for its own cards, the form that adds
 * or edits one (ReferenceEditor), and the "Use my current prices" button (UseCurrentPricesButton).
 *
 * A reference is the shop's own Near Mint price for one card, one finish and one language. The list shows what the server
 * sent. Notes are plain text and are escaped by React. Nothing here changes an item price.
 */
import React, { useEffect, useId, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { UNKNOWN_STATUS, lookupAvailability, readStatus as readCatalogStatus } from '../../lib/cardRecord';
import type { PrintingResult } from '../../lib/cardRecord';
import { NOTE_MAX_CHARS, priceBookApi, readPriceBookError } from '../../lib/priceBook';
import type { PriceBookReferenceRow, ReferenceInput } from '../../lib/priceBook';
import {
  FINISH_LABELS,
  PRICE_BOOK_COPY,
  PRICE_BOOK_UI,
  RULE_GAME_WORDS,
  RULE_LANGUAGE_WORDS,
} from '../../lib/priceBookCopy';
import { formatMoney, formatShortDate, parseMoneyToCents } from '../../lib/priceBookRules';
import AccessibleModal from '../AccessibleModal';
import CardSearchBox from '../cardRecord/CardSearchBox';
import ConfirmDialog from '../ConfirmDialog';
import { useToast } from '../ToastContext';
import {
  checkboxCls,
  dateInputToIso,
  dialogContentCls,
  headingCls,
  inputCls,
  isoToDateInput,
  isOlderThanDays,
  labelCls,
  mutedCls,
  noticeErrorCls,
  optionsFrom,
  primaryBtn,
  secondaryBtn,
  smallBtn,
} from './ui';
import { useCardVocabulary, useRefreshPriceBook, useReportError } from './usePriceBookData';

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------

export interface ReferenceTableProps {
  rows: PriceBookReferenceRow[];
  /** Typed prices older than this many days get an "older" badge (the book's referenceWarnDays). */
  warnDays: number;
  now: Date;
  busyId: string | null;
  onEdit: (row: PriceBookReferenceRow) => void;
  onDelete: (row: PriceBookReferenceRow) => void;
}

function setLine(row: PriceBookReferenceRow): string {
  const code = row.setCode ? row.setCode.toUpperCase() : '';
  const set = row.setName ? (code ? `${row.setName} (${code})` : row.setName) : code;
  if (!set) return row.collectorNumber ? `#${row.collectorNumber}` : '';
  return row.collectorNumber ? `${set} #${row.collectorNumber}` : set;
}

const cellCls = 'block px-3 py-1 sm:table-cell sm:py-2 sm:align-top';
const headCls = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-warm-500 dark:text-warm-400';

export const ReferenceTable: React.FC<ReferenceTableProps> = ({ rows, warnDays, now, busyId, onEdit, onDelete }) => {
  if (rows.length === 0) return null;
  return (
    <table className="block w-full min-w-0 text-sm sm:table">
      <thead className="hidden sm:table-header-group">
        <tr>
          <th scope="col" className={headCls}>{PRICE_BOOK_UI.colCard}</th>
          <th scope="col" className={headCls}>{PRICE_BOOK_UI.colFinish}</th>
          <th scope="col" className={headCls}>{PRICE_BOOK_UI.colLanguage}</th>
          <th scope="col" className={headCls}>{PRICE_BOOK_UI.colPrice}</th>
          <th scope="col" className={headCls}>{PRICE_BOOK_UI.colAsOf}</th>
          <th scope="col" className={headCls}>{PRICE_BOOK_UI.colNote}</th>
          <th scope="col" className={headCls}>
            <span className="sr-only">{PRICE_BOOK_UI.colActions}</span>
          </th>
        </tr>
      </thead>
      <tbody className="block divide-y divide-warm-200 dark:divide-gray-700 sm:table-row-group">
        {rows.map((row) => {
          const old = isOlderThanDays(row.asOf, warnDays, now);
          const title = row.cardName || row.cardKey;
          const meta = setLine(row);
          return (
            <tr key={row.id} className="block py-2 sm:table-row">
              <td className={`${cellCls} min-w-0`}>
                <p className="break-words font-semibold text-warm-900 dark:text-warm-100">{title}</p>
                {meta && <p className="break-words text-xs text-warm-600 dark:text-warm-400">{meta}</p>}
              </td>
              <td className={cellCls}>
                <span className="sm:hidden text-xs text-warm-500 dark:text-warm-400">{PRICE_BOOK_UI.colFinish}: </span>
                {FINISH_LABELS[row.finish] || row.finish}
              </td>
              <td className={cellCls}>
                <span className="sm:hidden text-xs text-warm-500 dark:text-warm-400">{PRICE_BOOK_UI.colLanguage}: </span>
                {RULE_LANGUAGE_WORDS[row.language] || row.language.toUpperCase()}
              </td>
              <td className={`${cellCls} font-semibold text-warm-900 dark:text-warm-100`}>{formatMoney(row.valueCents)}</td>
              <td className={cellCls}>
                <span className="sm:hidden text-xs text-warm-500 dark:text-warm-400">{PRICE_BOOK_UI.colAsOf}: </span>
                {formatShortDate(row.asOf)}
                {old && (
                  <span className="ml-2 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
                    {PRICE_BOOK_UI.olderBadge(warnDays)}
                  </span>
                )}
              </td>
              <td className={`${cellCls} min-w-0 break-words text-warm-700 dark:text-warm-300`}>{row.note || ''}</td>
              <td className={cellCls}>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={smallBtn} disabled={busyId === row.id} onClick={() => onEdit(row)}>
                    {PRICE_BOOK_COPY.ruleEdit}
                  </button>
                  <button type="button" className={smallBtn} disabled={busyId === row.id} onClick={() => onDelete(row)}>
                    {PRICE_BOOK_COPY.ruleDelete}
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

export default ReferenceTable;

// ---------------------------------------------------------------------------
// Add or edit one typed price
// ---------------------------------------------------------------------------

export interface ReferenceEditorProps {
  /** The row being edited, or null to add a new price. */
  initial: PriceBookReferenceRow | null;
  defaultGame?: string;
  onClose: () => void;
  onSaved: () => void;
}

type EditorMode = 'catalog' | 'typed';

function printingFromRow(row: PriceBookReferenceRow): PrintingResult {
  return {
    id: row.catalogPrintingId || row.cardKey,
    game: row.game,
    name: row.cardName || row.cardKey,
    setCode: row.setCode,
    setName: row.setName,
    collectorNumber: row.collectorNumber,
  };
}

function printingMetaLine(p: PrintingResult): string {
  const code = p.setCode ? p.setCode.toUpperCase() : '';
  const set = p.setName ? (code ? `${p.setName} (${code})` : p.setName) : code;
  return p.collectorNumber ? `${set} #${p.collectorNumber}` : set;
}

export const ReferenceEditor: React.FC<ReferenceEditorProps> = ({ initial, defaultGame, onClose, onSaved }) => {
  const baseId = useId();
  const vocabQuery = useCardVocabulary();
  const vocab = vocabQuery.data || null;
  const catalogStatus = useQuery({
    queryKey: ['card-catalog-status'],
    queryFn: async () => readCatalogStatus((await api.get('/cards/status')).data),
    staleTime: 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const isEdit = initial !== null;
  const [mode, setMode] = useState<EditorMode>(initial && !initial.catalogPrintingId ? 'typed' : 'catalog');
  const [game, setGame] = useState(initial ? initial.game : defaultGame || 'MTG');
  const [printing, setPrinting] = useState<PrintingResult | null>(initial && initial.catalogPrintingId ? printingFromRow(initial) : null);
  const [cardName, setCardName] = useState(initial && !initial.catalogPrintingId ? initial.cardName || '' : '');
  const [setCode, setSetCode] = useState(initial && !initial.catalogPrintingId ? initial.setCode || '' : '');
  const [collectorNumber, setCollectorNumber] = useState(initial && !initial.catalogPrintingId ? initial.collectorNumber || '' : '');
  const [setName, setSetName] = useState(initial && !initial.catalogPrintingId ? initial.setName || '' : '');
  const [finish, setFinish] = useState(initial ? initial.finish : '');
  const [language, setLanguage] = useState(initial ? initial.language : 'en');
  const [priceText, setPriceText] = useState(initial ? (initial.valueCents / 100).toFixed(2) : '');
  const [note, setNote] = useState(initial && initial.note ? initial.note : '');
  const [asOfText, setAsOfText] = useState(initial ? isoToDateInput(initial.asOf) : '');
  const [error, setError] = useState('');

  const games = optionsFrom(vocab ? vocab.games : null, RULE_GAME_WORDS);
  const finishes = useMemo(
    () =>
      printing && printing.finishes && printing.finishes.length > 0
        ? optionsFrom(printing.finishes.map((code) => ({ code, label: FINISH_LABELS[code] || code })), FINISH_LABELS)
        : optionsFrom(vocab ? vocab.finishes : null, FINISH_LABELS, ['ANY']),
    [printing, vocab]
  );
  const languages = optionsFrom(vocab ? vocab.languages : null, RULE_LANGUAGE_WORDS);

  // Keep the finish valid for the card chosen: a printing only offers its own finishes.
  useEffect(() => {
    if (finishes.length > 0 && !finishes.some((f) => f.code === finish)) setFinish(finishes[0].code);
  }, [finishes, finish]);

  const availability = vocab
    ? lookupAvailability(catalogStatus.data || UNKNOWN_STATUS, game, vocab.games)
    : 'chooseGame';

  const mutation = useMutation({
    mutationFn: (input: ReferenceInput) => priceBookApi.putReference(input),
    onSuccess: () => onSaved(),
    onError: (err) => setError(readPriceBookError(err).message),
  });

  const save = (): void => {
    setError('');
    const cents = parseMoneyToCents(priceText);
    if (cents === null || cents < 1) {
      setError(PRICE_BOOK_UI.errorPrice);
      return;
    }
    if (!finish) {
      setError(PRICE_BOOK_UI.errorFinish);
      return;
    }
    const asOf = asOfText.trim() ? dateInputToIso(asOfText) : null;
    if (asOfText.trim() && !asOf) {
      setError(PRICE_BOOK_UI.errorDate);
      return;
    }
    const base: ReferenceInput = { game, finish, language, priceCents: cents, note, asOf };
    if (mode === 'catalog') {
      if (!printing) {
        setError(PRICE_BOOK_UI.errorPickCard);
        return;
      }
      mutation.mutate({ ...base, printingId: printing.id });
      return;
    }
    const hasIdentity = cardName.trim() !== '' || (setCode.trim() !== '' && collectorNumber.trim() !== '');
    if (!hasIdentity) {
      setError(PRICE_BOOK_UI.errorTypedCard);
      return;
    }
    mutation.mutate({ ...base, typed: { cardName, setCode, collectorNumber, setName } });
  };

  const busy = mutation.isPending;
  const titleId = `${baseId}-title`;

  return (
    <AccessibleModal isOpen onClose={onClose} ariaLabelledBy={titleId} contentClassName={dialogContentCls}>
      <div className="space-y-4">
        <h2 id={titleId} className={headingCls}>
          {isEdit ? PRICE_BOOK_UI.editPriceHeading : PRICE_BOOK_COPY.addPrice}
        </h2>

        {!isEdit && (
          <fieldset className="space-y-2">
            <legend className={labelCls}>{PRICE_BOOK_UI.pickHow}</legend>
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
              <label className="inline-flex min-h-[44px] items-center gap-2 text-sm text-warm-800 dark:text-warm-200">
                <input type="radio" name={`${baseId}-mode`} className={checkboxCls} checked={mode === 'catalog'} onChange={() => setMode('catalog')} />
                {PRICE_BOOK_UI.modeCatalog}
              </label>
              <label className="inline-flex min-h-[44px] items-center gap-2 text-sm text-warm-800 dark:text-warm-200">
                <input type="radio" name={`${baseId}-mode`} className={checkboxCls} checked={mode === 'typed'} onChange={() => setMode('typed')} />
                {PRICE_BOOK_UI.modeTyped}
              </label>
            </div>
          </fieldset>
        )}

        {!isEdit && (
          <div>
            <label htmlFor={`${baseId}-game`} className={labelCls}>{PRICE_BOOK_UI.fieldGame}</label>
            <select id={`${baseId}-game`} className={inputCls} value={game} onChange={(e) => { setGame(e.target.value); setPrinting(null); }}>
              {games.map((g) => (
                <option key={g.code} value={g.code}>{g.label}</option>
              ))}
            </select>
          </div>
        )}

        {isEdit && (
          <div className="rounded-lg border border-warm-200 bg-warm-50 px-3 py-2 dark:border-gray-600 dark:bg-gray-900">
            <p className="break-words text-sm font-semibold text-warm-900 dark:text-warm-100">{initial ? initial.cardName || initial.cardKey : ''}</p>
            <p className="break-words text-xs text-warm-600 dark:text-warm-400">{initial ? setLine(initial) : ''}</p>
          </div>
        )}

        {!isEdit && mode === 'catalog' && (
          <div className="space-y-3">
            {printing ? (
              <div className="flex items-start justify-between gap-3 rounded-lg border border-warm-200 bg-warm-50 px-3 py-2 dark:border-gray-600 dark:bg-gray-900">
                <div className="min-w-0">
                  <p className="break-words text-sm font-semibold text-warm-900 dark:text-warm-100">{printing.name}</p>
                  <p className="break-words text-xs text-warm-600 dark:text-warm-400">{printingMetaLine(printing)}</p>
                </div>
                <button type="button" className={smallBtn} onClick={() => setPrinting(null)}>{PRICE_BOOK_UI.changeCard}</button>
              </div>
            ) : (
              <CardSearchBox
                game={game}
                availability={availability}
                busy={busy}
                applyingId={null}
                onUse={(p) => {
                  setPrinting(p);
                  if (p.language) setLanguage(p.language);
                }}
              />
            )}
          </div>
        )}

        {!isEdit && mode === 'typed' && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor={`${baseId}-name`} className={labelCls}>{PRICE_BOOK_UI.fieldCardName}</label>
              <input id={`${baseId}-name`} className={inputCls} type="text" maxLength={120} value={cardName} onChange={(e) => setCardName(e.target.value)} />
            </div>
            <div>
              <label htmlFor={`${baseId}-set`} className={labelCls}>{PRICE_BOOK_UI.fieldSetCode}</label>
              <input id={`${baseId}-set`} className={inputCls} type="text" maxLength={20} value={setCode} onChange={(e) => setSetCode(e.target.value)} />
            </div>
            <div>
              <label htmlFor={`${baseId}-num`} className={labelCls}>{PRICE_BOOK_UI.fieldCollectorNumber}</label>
              <input id={`${baseId}-num`} className={inputCls} type="text" maxLength={20} value={collectorNumber} onChange={(e) => setCollectorNumber(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor={`${baseId}-setname`} className={labelCls}>{PRICE_BOOK_UI.fieldSetName}</label>
              <input id={`${baseId}-setname`} className={inputCls} type="text" maxLength={120} value={setName} onChange={(e) => setSetName(e.target.value)} />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {!isEdit && (
            <>
              <div>
                <label htmlFor={`${baseId}-finish`} className={labelCls}>{PRICE_BOOK_UI.fieldFinish}</label>
                <select id={`${baseId}-finish`} className={inputCls} value={finish} onChange={(e) => setFinish(e.target.value)}>
                  {finishes.map((f) => (
                    <option key={f.code} value={f.code}>{f.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`${baseId}-lang`} className={labelCls}>{PRICE_BOOK_UI.fieldLanguage}</label>
                <select id={`${baseId}-lang`} className={inputCls} value={language} onChange={(e) => setLanguage(e.target.value)}>
                  {languages.map((l) => (
                    <option key={l.code} value={l.code}>{l.label}</option>
                  ))}
                </select>
              </div>
            </>
          )}
          <div>
            <label htmlFor={`${baseId}-price`} className={labelCls}>{PRICE_BOOK_UI.fieldNearMintPrice}</label>
            <input
              id={`${baseId}-price`}
              className={inputCls}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={priceText}
              onChange={(e) => setPriceText(e.target.value)}
              aria-describedby={`${baseId}-price-help`}
            />
            <p id={`${baseId}-price-help`} className="mt-1 text-xs text-warm-500 dark:text-warm-400">{PRICE_BOOK_UI.nearMintHelp}</p>
          </div>
          <div>
            <label htmlFor={`${baseId}-asof`} className={labelCls}>{PRICE_BOOK_UI.fieldAsOf}</label>
            <input id={`${baseId}-asof`} className={inputCls} type="date" value={asOfText} onChange={(e) => setAsOfText(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor={`${baseId}-note`} className={labelCls}>{PRICE_BOOK_UI.fieldNote}</label>
            <input id={`${baseId}-note`} className={inputCls} type="text" maxLength={NOTE_MAX_CHARS} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        {error && (
          <p role="alert" className={noticeErrorCls}>{error}</p>
        )}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" className={secondaryBtn} onClick={onClose} disabled={busy}>{PRICE_BOOK_UI.cancel}</button>
          <button type="button" className={primaryBtn} onClick={save} disabled={busy}>
            {busy ? PRICE_BOOK_UI.saving : PRICE_BOOK_UI.save}
          </button>
        </div>
      </div>
    </AccessibleModal>
  );
};

// ---------------------------------------------------------------------------
// "Use my current prices" (ADR-140 section 5.4)
// ---------------------------------------------------------------------------

function whole(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null;
}

/** What the from-stock call reported. Both numbers are null when the answer has a shape this file does not know. */
export function readStockSummary(data: unknown): { created: number | null; skipped: number | null } {
  const root = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const nested = root.summary && typeof root.summary === 'object' ? (root.summary as Record<string, unknown>) : root;
  const created = [nested.created, nested.createdCount, nested.learned, nested.added]
    .map(whole)
    .find((n) => n !== null);
  const skipped = [nested.skipped, nested.skippedCount].map(whole).find((n) => n !== null);
  return { created: created === undefined ? null : created, skipped: skipped === undefined ? null : skipped };
}

export interface UseCurrentPricesButtonProps {
  /** Called first, so the price book exists before the call (the start card passes this). */
  ensureBook?: () => Promise<void>;
  onDone?: () => void;
  className?: string;
}

export const UseCurrentPricesButton: React.FC<UseCurrentPricesButtonProps> = ({ ensureBook, onDone, className }) => {
  const baseId = useId();
  const { showToast } = useToast();
  const report = useReportError();
  const refresh = useRefreshPriceBook();
  const [overwrite, setOverwrite] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [message, setMessage] = useState('');

  const mutation = useMutation({
    mutationFn: async (doOverwrite: boolean) => {
      if (ensureBook) await ensureBook();
      return priceBookApi.referencesFromStock({ overwrite: doOverwrite });
    },
    onSuccess: (data) => {
      const s = readStockSummary(data);
      const lines: string[] = [s.created === null ? PRICE_BOOK_UI.stockDoneGeneric : PRICE_BOOK_UI.stockDone(s.created)];
      if (s.skipped !== null && s.skipped > 0) lines.push(PRICE_BOOK_UI.stockSkipped(s.skipped));
      setMessage(lines.join(' '));
      showToast(lines[0], 'success');
      void refresh();
      if (onDone) onDone();
    },
    onError: (err) => {
      setMessage('');
      report(err);
    },
  });

  const press = (): void => {
    if (overwrite) setConfirmOpen(true);
    else mutation.mutate(false);
  };

  return (
    <div className={`min-w-0 space-y-2 ${className || ''}`}>
      <label className="flex min-h-[44px] items-center gap-2 text-sm text-warm-800 dark:text-warm-200">
        <input
          type="checkbox"
          className={checkboxCls}
          checked={overwrite}
          onChange={(e) => setOverwrite(e.target.checked)}
          aria-describedby={`${baseId}-help`}
        />
        {PRICE_BOOK_UI.stockOverwrite}
      </label>
      <p id={`${baseId}-help`} className={mutedCls}>{PRICE_BOOK_UI.stockHelp}</p>
      <button type="button" className={primaryBtn} disabled={mutation.isPending} onClick={press}>
        {mutation.isPending ? PRICE_BOOK_UI.working : PRICE_BOOK_COPY.useCurrentPrices}
      </button>
      {message && (
        <p role="status" className="text-sm text-green-800 dark:text-green-200">{message}</p>
      )}
      <ConfirmDialog
        isOpen={confirmOpen}
        title={PRICE_BOOK_UI.stockConfirmTitle}
        message={PRICE_BOOK_UI.stockConfirmMessage}
        confirmLabel={PRICE_BOOK_UI.stockConfirmYes}
        cancelLabel={PRICE_BOOK_UI.cancel}
        variant="danger"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          mutation.mutate(true);
        }}
      />
    </div>
  );
};
