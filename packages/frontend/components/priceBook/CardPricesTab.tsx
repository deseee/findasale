/**
 * CardPricesTab (ADR-140 section 11.4): the shop's own typed prices (references) and its benchmarks.
 *
 * A searchable list with edit and delete, "Add a price", "Use my current prices" and "Import a price list". The page says
 * which kind of price the book looks at first (the order of referenceOrder). Prices older than the book's warning age can be
 * filtered so stale numbers are easy to find. Nothing here changes an item price.
 */
import React, { useId, useMemo, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { SEARCH_DEBOUNCE_MS } from '../../lib/cardRecord';
import { priceBookApi, readPriceBookError } from '../../lib/priceBook';
import type { PriceBookReferenceRow, PriceBookStatus, PriceBookView } from '../../lib/priceBook';
import { PRICE_BOOK_COPY, PRICE_BOOK_UI, RULE_GAME_WORDS, SOURCE_PHRASES } from '../../lib/priceBookCopy';
import ConfirmDialog from '../ConfirmDialog';
import useDebouncedValue from '../cardRecord/useDebouncedValue';
import BenchmarkGrid from './BenchmarkGrid';
import ImportDialog from './ImportDialog';
import ReferenceTable, { ReferenceEditor, UseCurrentPricesButton } from './ReferenceTable';
import {
  checkboxCls,
  inputCls,
  isOlderThanDays,
  labelCls,
  mutedCls,
  noticeErrorCls,
  optionsFrom,
  primaryBtn,
  sectionCls,
  secondaryBtn,
  subHeadingCls,
} from './ui';
import { pbKeys, useCardVocabulary, useNow, useRefreshPriceBook } from './usePriceBookData';

export interface CardPricesTabProps {
  book: PriceBookView;
  status: PriceBookStatus;
}

const PAGE_SIZE = 100;

const CardPricesTab: React.FC<CardPricesTabProps> = ({ book }) => {
  const baseId = useId();
  const now = useNow();
  const refresh = useRefreshPriceBook();
  const vocab = useCardVocabulary().data || null;
  const [game, setGame] = useState('');
  const [q, setQ] = useState('');
  const [onlyOld, setOnlyOld] = useState(false);
  const [editing, setEditing] = useState<PriceBookReferenceRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState<PriceBookReferenceRow | null>(null);
  const [error, setError] = useState('');
  const debouncedQ = useDebouncedValue(q.trim(), SEARCH_DEBOUNCE_MS);

  const list = useInfiniteQuery({
    queryKey: pbKeys.references(game, debouncedQ),
    queryFn: ({ pageParam }) =>
      priceBookApi.listReferences({ game: game || undefined, q: debouncedQ || undefined, cursor: pageParam, limit: PAGE_SIZE }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 0,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const benchmarks = useQuery({
    queryKey: pbKeys.benchmarks,
    queryFn: () => priceBookApi.listBenchmarks(),
    staleTime: 0,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const remove = useMutation({
    mutationFn: (id: string) => priceBookApi.deleteReference(id),
    onSuccess: () => {
      setDeleting(null);
      void refresh();
    },
    onError: (err) => {
      setDeleting(null);
      setError(readPriceBookError(err).message);
    },
  });

  const allRows: PriceBookReferenceRow[] = useMemo(() => {
    const out: PriceBookReferenceRow[] = [];
    (list.data ? list.data.pages : []).forEach((p) => p.references.forEach((r) => out.push(r)));
    return out;
  }, [list.data]);

  const rows = onlyOld ? allRows.filter((r) => isOlderThanDays(r.asOf, book.referenceWarnDays, now)) : allRows;
  const games = optionsFrom(vocab ? vocab.games : null, RULE_GAME_WORDS);
  const orderWords = book.referenceOrder
    .map((k) => (Object.prototype.hasOwnProperty.call(SOURCE_PHRASES, k) ? SOURCE_PHRASES[k] : ''))
    .filter((w) => w.length > 0);

  return (
    <div className="space-y-6">
      <section aria-labelledby={`${baseId}-title`} className={sectionCls}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 id={`${baseId}-title`} className={subHeadingCls}>{PRICE_BOOK_COPY.cardPricesHeading}</h2>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" className={primaryBtn} onClick={() => setAdding(true)}>{PRICE_BOOK_COPY.addPrice}</button>
            <button type="button" className={secondaryBtn} onClick={() => setImporting(true)}>{PRICE_BOOK_COPY.importList}</button>
          </div>
        </div>
        {orderWords.length > 0 && <p className={mutedCls}>{PRICE_BOOK_UI.referenceOrderLine(orderWords.join(', '))}</p>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label htmlFor={`${baseId}-q`} className={labelCls}>{PRICE_BOOK_UI.searchPrices}</label>
            <input id={`${baseId}-q`} type="search" className={inputCls} value={q} autoComplete="off" onChange={(e) => setQ(e.target.value)} />
          </div>
          <div>
            <label htmlFor={`${baseId}-game`} className={labelCls}>{PRICE_BOOK_UI.fieldGame}</label>
            <select id={`${baseId}-game`} className={inputCls} value={game} onChange={(e) => setGame(e.target.value)}>
              <option value="">{PRICE_BOOK_UI.anyGame}</option>
              {games.map((g) => (
                <option key={g.code} value={g.code}>{g.label}</option>
              ))}
            </select>
          </div>
        </div>
        <label className="flex min-h-[44px] items-center gap-2 text-sm text-warm-800 dark:text-warm-200">
          <input type="checkbox" className={checkboxCls} checked={onlyOld} onChange={(e) => setOnlyOld(e.target.checked)} />
          {PRICE_BOOK_UI.onlyOlder(book.referenceWarnDays)}
        </label>

        {error && <p role="alert" className={noticeErrorCls}>{error}</p>}

        <div aria-live="polite">
          {list.isLoading && <p role="status" className={mutedCls}>{PRICE_BOOK_COPY.loading}</p>}
          {list.isError && (
            <div role="alert" className={noticeErrorCls}>
              <p>{PRICE_BOOK_COPY.loadError}</p>
              <button type="button" className={`${secondaryBtn} mt-2`} onClick={() => list.refetch()}>{PRICE_BOOK_COPY.retry}</button>
            </div>
          )}
          {list.isSuccess && rows.length === 0 && <p className={mutedCls}>{onlyOld ? PRICE_BOOK_UI.noOldPrices : PRICE_BOOK_UI.noPricesYet}</p>}
        </div>

        <ReferenceTable
          rows={rows}
          warnDays={book.referenceWarnDays}
          now={now}
          busyId={remove.isPending && deleting ? deleting.id : null}
          onEdit={(row) => setEditing(row)}
          onDelete={(row) => setDeleting(row)}
        />

        {list.hasNextPage && (
          <button type="button" className={secondaryBtn} disabled={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>
            {list.isFetchingNextPage ? PRICE_BOOK_UI.working : PRICE_BOOK_UI.loadMore}
          </button>
        )}
      </section>

      <section className={sectionCls} aria-label={PRICE_BOOK_COPY.useCurrentPrices}>
        <UseCurrentPricesButton />
      </section>

      <BenchmarkGrid rows={benchmarks.data || []} />

      {adding && (
        <ReferenceEditor
          initial={null}
          defaultGame={game || undefined}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            void refresh();
          }}
        />
      )}
      {editing && (
        <ReferenceEditor
          key={editing.id}
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void refresh();
          }}
        />
      )}
      {importing && <ImportDialog onClose={() => setImporting(false)} onImported={() => void refresh()} />}

      <ConfirmDialog
        isOpen={deleting !== null}
        title={PRICE_BOOK_UI.deletePriceTitle}
        message={PRICE_BOOK_UI.deletePriceMessage}
        confirmLabel={PRICE_BOOK_COPY.ruleDelete}
        cancelLabel={PRICE_BOOK_UI.cancel}
        variant="danger"
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id);
        }}
      />
    </div>
  );
};

export default CardPricesTab;
