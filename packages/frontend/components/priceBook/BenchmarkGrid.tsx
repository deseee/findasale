/**
 * BenchmarkGrid (ADR-140 sections 5.2 and 11.4): "Typical value for this kind of card". A short list of the Near Mint values
 * the shop sets for a game, a rarity class and a finish. This is how a line with no sales history starts. The list is what
 * the server sent; the form saves one value at a time (the same game, rarity and finish replaces the old value).
 */
import React, { useId, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { NOTE_MAX_CHARS, priceBookApi, readPriceBookError } from '../../lib/priceBook';
import type { PriceBookBenchmarkRow } from '../../lib/priceBook';
import {
  FINISH_LABELS,
  PRICE_BOOK_COPY,
  PRICE_BOOK_UI,
  RARITY_CLASS_LABELS,
  RULE_GAME_WORDS,
} from '../../lib/priceBookCopy';
import { formatMoney, formatShortDate, parseMoneyToCents } from '../../lib/priceBookRules';
import ConfirmDialog from '../ConfirmDialog';
import {
  dateInputToIso,
  inputCls,
  isoToDateInput,
  labelCls,
  labelOf,
  mutedCls,
  noticeErrorCls,
  optionsFrom,
  primaryBtn,
  sectionCls,
  secondaryBtn,
  smallBtn,
  subHeadingCls,
} from './ui';
import { useCardVocabulary, useRefreshPriceBook } from './usePriceBookData';

export interface BenchmarkGridProps {
  rows: PriceBookBenchmarkRow[];
}

const BenchmarkGrid: React.FC<BenchmarkGridProps> = ({ rows }) => {
  const baseId = useId();
  const vocab = useCardVocabulary().data || null;
  const refresh = useRefreshPriceBook();
  const [game, setGame] = useState('MTG');
  const [rarityClass, setRarityClass] = useState('RARE');
  const [finish, setFinish] = useState('ANY');
  const [priceText, setPriceText] = useState('');
  const [asOfText, setAsOfText] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<PriceBookBenchmarkRow | null>(null);

  const games = optionsFrom(vocab ? vocab.games : null, RULE_GAME_WORDS);
  const rarities = optionsFrom(null, RARITY_CLASS_LABELS, ['UNKNOWN']);
  const finishes = optionsFrom(null, FINISH_LABELS);

  const save = useMutation({
    mutationFn: (input: { cents: number; asOf: string | null }) =>
      priceBookApi.putBenchmark({ game, rarityClass, finish, priceCents: input.cents, note, asOf: input.asOf }),
    onSuccess: () => {
      setError('');
      setPriceText('');
      setNote('');
      setAsOfText('');
      void refresh();
    },
    onError: (err) => setError(readPriceBookError(err).message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => priceBookApi.deleteBenchmark(id),
    onSuccess: () => {
      setDeleting(null);
      void refresh();
    },
    onError: (err) => {
      setDeleting(null);
      setError(readPriceBookError(err).message);
    },
  });

  const submit = (e: React.FormEvent): void => {
    e.preventDefault();
    setError('');
    const cents = parseMoneyToCents(priceText);
    if (cents === null || cents < 1) {
      setError(PRICE_BOOK_UI.errorPrice);
      return;
    }
    const asOf = asOfText.trim() ? dateInputToIso(asOfText) : null;
    if (asOfText.trim() && !asOf) {
      setError(PRICE_BOOK_UI.errorDate);
      return;
    }
    save.mutate({ cents, asOf });
  };

  const edit = (row: PriceBookBenchmarkRow): void => {
    setGame(row.game);
    setRarityClass(row.rarityClass);
    setFinish(row.finish);
    setPriceText((row.valueCents / 100).toFixed(2));
    setNote(row.note || '');
    setAsOfText(isoToDateInput(row.asOf));
    setError('');
  };

  return (
    <section aria-labelledby={`${baseId}-title`} className={sectionCls}>
      <div>
        <h3 id={`${baseId}-title`} className={subHeadingCls}>{PRICE_BOOK_COPY.benchmarksHeading}</h3>
        <p className={mutedCls}>{PRICE_BOOK_UI.benchmarkHelp}</p>
      </div>

      {rows.length === 0 ? (
        <p className={mutedCls}>{PRICE_BOOK_UI.benchmarkEmpty}</p>
      ) : (
        <ul className="divide-y divide-warm-200 dark:divide-gray-700">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold text-warm-900 dark:text-warm-100">
                  {PRICE_BOOK_UI.benchmarkRowTitle(
                    labelOf(RULE_GAME_WORDS, row.game, row.game),
                    labelOf(RARITY_CLASS_LABELS, row.rarityClass, row.rarityClass),
                    labelOf(FINISH_LABELS, row.finish, row.finish)
                  )}
                </p>
                <p className="break-words text-sm text-warm-700 dark:text-warm-300">
                  {formatMoney(row.valueCents)}
                  {row.asOf ? `, ${formatShortDate(row.asOf)}` : ''}
                  {row.note ? `, ${row.note}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={smallBtn} onClick={() => edit(row)}>{PRICE_BOOK_COPY.ruleEdit}</button>
                <button type="button" className={smallBtn} disabled={remove.isPending} onClick={() => setDeleting(row)}>
                  {PRICE_BOOK_COPY.ruleDelete}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label={PRICE_BOOK_UI.benchmarkFormLabel}>
        <div>
          <label htmlFor={`${baseId}-game`} className={labelCls}>{PRICE_BOOK_UI.fieldGame}</label>
          <select id={`${baseId}-game`} className={inputCls} value={game} onChange={(e) => setGame(e.target.value)}>
            {games.map((g) => (
              <option key={g.code} value={g.code}>{g.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${baseId}-rarity`} className={labelCls}>{PRICE_BOOK_UI.fieldRarity}</label>
          <select id={`${baseId}-rarity`} className={inputCls} value={rarityClass} onChange={(e) => setRarityClass(e.target.value)}>
            {rarities.map((r) => (
              <option key={r.code} value={r.code}>{r.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${baseId}-finish`} className={labelCls}>{PRICE_BOOK_UI.fieldFinish}</label>
          <select id={`${baseId}-finish`} className={inputCls} value={finish} onChange={(e) => setFinish(e.target.value)}>
            {finishes.map((f) => (
              <option key={f.code} value={f.code}>{f.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${baseId}-price`} className={labelCls}>{PRICE_BOOK_UI.fieldNearMintPrice}</label>
          <input id={`${baseId}-price`} className={inputCls} type="text" inputMode="decimal" autoComplete="off" value={priceText} onChange={(e) => setPriceText(e.target.value)} />
        </div>
        <div>
          <label htmlFor={`${baseId}-asof`} className={labelCls}>{PRICE_BOOK_UI.fieldAsOf}</label>
          <input id={`${baseId}-asof`} className={inputCls} type="date" value={asOfText} onChange={(e) => setAsOfText(e.target.value)} />
        </div>
        <div>
          <label htmlFor={`${baseId}-note`} className={labelCls}>{PRICE_BOOK_UI.fieldNote}</label>
          <input id={`${baseId}-note`} className={inputCls} type="text" maxLength={NOTE_MAX_CHARS} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {error && (
          <p role="alert" className={`${noticeErrorCls} sm:col-span-3`}>{error}</p>
        )}
        <div className="flex flex-col gap-3 sm:col-span-3 sm:flex-row">
          <button type="submit" className={primaryBtn} disabled={save.isPending}>
            {save.isPending ? PRICE_BOOK_UI.saving : PRICE_BOOK_UI.benchmarkSave}
          </button>
          <button
            type="button"
            className={secondaryBtn}
            onClick={() => {
              setPriceText('');
              setNote('');
              setAsOfText('');
              setError('');
            }}
          >
            {PRICE_BOOK_UI.clearForm}
          </button>
        </div>
      </form>

      <ConfirmDialog
        isOpen={deleting !== null}
        title={PRICE_BOOK_UI.deleteBenchmarkTitle}
        message={PRICE_BOOK_UI.deleteBenchmarkMessage}
        confirmLabel={PRICE_BOOK_COPY.ruleDelete}
        cancelLabel={PRICE_BOOK_UI.cancel}
        variant="danger"
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id);
        }}
      />
    </section>
  );
};

export default BenchmarkGrid;
