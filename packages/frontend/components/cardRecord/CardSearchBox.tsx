/**
 * CardSearchBox (ADR-134 3.5, batch B7): the "Find your card" part of the card record panel.
 *
 * The seller types a card name, or a set code and card number. The search runs 250 ms after they stop
 * typing against GET /api/cards/search and shows up to 20 printings in a list that scrolls inside the
 * panel. States: skeleton while searching, an empty message, an error message with a retry that keeps
 * everything typed, and a plain note when lookup is switched off (manual entry stays available in the
 * parent form). Thumbnails use object-fit: contain with no crop, filter or stretch (Scryfall image rules).
 */
import React, { useEffect, useId, useRef, useState } from 'react';
import api from '../../lib/api';
import Skeleton from '../Skeleton';
import {
  CARD_PANEL_COPY,
  CARD_PANEL_TEMPLATES,
  PrintingResult,
  SEARCH_DEBOUNCE_MS,
  buildSearchParams,
  canSearch,
  printingMeta,
  readApiError,
  readSearchResults,
} from '../../lib/cardRecord';

export type LookupAvailability = 'ok' | 'catalogOff' | 'gameNotCovered' | 'chooseGame';

interface CardSearchBoxProps {
  game: string;
  availability: LookupAvailability;
  /** True while the parent is saving or applying something. */
  busy: boolean;
  /** Printing id currently being applied, so its button shows progress. */
  applyingId: string | null;
  onUse: (printing: PrintingResult) => void;
}

type Phase = 'idle' | 'loading' | 'results' | 'empty' | 'error' | 'off';

const inputCls =
  'w-full min-h-[44px] px-4 py-2 text-base sm:text-sm border border-warm-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-warm-900 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none disabled:opacity-60';
const labelCls = 'block text-sm font-medium text-warm-700 dark:text-warm-300 mb-1';
const noteCls = 'rounded-lg border border-warm-200 dark:border-gray-600 bg-warm-50 dark:bg-gray-800 px-3 py-2 text-sm text-warm-700 dark:text-warm-300';

const Thumb: React.FC<{ url: string | null | undefined; name: string }> = ({ url, name }) => {
  const [failed, setFailed] = useState(false);
  return (
    <div className="flex h-[66px] w-[48px] flex-shrink-0 items-center justify-center overflow-hidden rounded border border-warm-200 bg-warm-100 dark:border-gray-600 dark:bg-gray-700">
      {url && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={`Card image for ${name}`}
          loading="lazy"
          className="h-full w-full object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="px-1 text-center text-[10px] leading-tight text-warm-500 dark:text-warm-400">{CARD_PANEL_COPY.noImage}</span>
      )}
    </div>
  );
};

const CardSearchBox: React.FC<CardSearchBoxProps> = ({ game, availability, busy, applyingId, onUse }) => {
  const baseId = useId();
  const [q, setQ] = useState('');
  const [set, setSet] = useState('');
  const [number, setNumber] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [results, setResults] = useState<PrintingResult[]>([]);
  const [capped, setCapped] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [nonce, setNonce] = useState(0);
  const requestId = useRef(0);

  useEffect(() => {
    const inputs = { game, q, set, number };
    if (availability !== 'ok' || !canSearch(inputs)) {
      requestId.current += 1;
      setPhase('idle');
      setResults([]);
      return undefined;
    }
    const myId = ++requestId.current;
    setPhase('loading');
    const timer = setTimeout(async () => {
      try {
        const res = await api.get('/cards/search', { params: buildSearchParams(inputs) });
        if (requestId.current !== myId) return;
        const parsed = readSearchResults(res.data);
        if (parsed.catalogReady === false) {
          setResults([]);
          setPhase('off');
          return;
        }
        setResults(parsed.results);
        setCapped(parsed.capped);
        setPhase(parsed.results.length > 0 ? 'results' : 'empty');
      } catch (err) {
        if (requestId.current !== myId) return;
        setErrorText(readApiError(err).message);
        setPhase('error');
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      requestId.current += 1;
    };
  }, [availability, game, q, set, number, nonce]);

  const inputsDisabled = availability !== 'ok' || busy;
  const showInputs = availability !== 'catalogOff';

  return (
    <section aria-labelledby={`${baseId}-title`} className="space-y-3">
      <div>
        <h3 id={`${baseId}-title`} className="text-sm font-semibold text-warm-900 dark:text-warm-100">
          {CARD_PANEL_COPY.searchTitle}
        </h3>
        {availability === 'ok' && <p className="text-xs text-warm-500 dark:text-warm-400 mt-0.5">{CARD_PANEL_COPY.searchHint}</p>}
      </div>

      {availability === 'catalogOff' && (
        <p role="status" className={noteCls}>
          {CARD_PANEL_COPY.catalogOff}
        </p>
      )}
      {availability === 'gameNotCovered' && (
        <p role="status" className={noteCls}>
          {CARD_PANEL_COPY.gameNotCovered}
        </p>
      )}
      {availability === 'chooseGame' && (
        <p role="status" className={noteCls}>
          {CARD_PANEL_COPY.searchChooseGame}
        </p>
      )}

      {showInputs && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor={`${baseId}-q`} className={labelCls}>
              {CARD_PANEL_COPY.searchNameLabel}
            </label>
            <input
              id={`${baseId}-q`}
              type="text"
              value={q}
              maxLength={100}
              autoComplete="off"
              disabled={inputsDisabled}
              onChange={(e) => setQ(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor={`${baseId}-set`} className={labelCls}>
              {CARD_PANEL_COPY.searchSetLabel}
            </label>
            <input
              id={`${baseId}-set`}
              type="text"
              value={set}
              maxLength={20}
              autoComplete="off"
              disabled={inputsDisabled}
              onChange={(e) => setSet(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor={`${baseId}-number`} className={labelCls}>
              {CARD_PANEL_COPY.searchNumberLabel}
            </label>
            <input
              id={`${baseId}-number`}
              type="text"
              value={number}
              maxLength={20}
              autoComplete="off"
              disabled={inputsDisabled}
              onChange={(e) => setNumber(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>
      )}

      {availability === 'ok' && (
        <div aria-live="polite" className="space-y-2">
          {phase === 'idle' && (q.trim() !== '' || set.trim() !== '' || number.trim() !== '') && (
            <p className="text-xs text-warm-500 dark:text-warm-400">{CARD_PANEL_COPY.searchTooShort}</p>
          )}

          {phase === 'loading' && (
            <div role="status" aria-label={CARD_PANEL_COPY.searching} className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg border border-warm-200 p-3 dark:border-gray-600">
                  <Skeleton className="h-[66px] w-[48px] flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {phase === 'empty' && <p className={noteCls}>{CARD_PANEL_COPY.noMatch}</p>}

          {phase === 'off' && <p className={noteCls}>{CARD_PANEL_COPY.catalogOff}</p>}

          {phase === 'error' && (
            <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200">
              <p>{CARD_PANEL_COPY.searchError}</p>
              {errorText && <p className="mt-1 text-xs">{errorText}</p>}
              <button
                type="button"
                onClick={() => setNonce((n) => n + 1)}
                className="mt-2 inline-flex min-h-[44px] items-center rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700"
              >
                {CARD_PANEL_COPY.retry}
              </button>
            </div>
          )}

          {phase === 'results' && (
            <>
              <p className="text-xs text-warm-500 dark:text-warm-400">{CARD_PANEL_TEMPLATES.resultsCount(results.length)}</p>
              <ul
                role="region"
                aria-label={CARD_PANEL_TEMPLATES.resultsCount(results.length)}
                tabIndex={0}
                className="max-h-80 divide-y divide-warm-200 overflow-y-auto overscroll-contain rounded-lg border border-warm-200 dark:divide-gray-600 dark:border-gray-600"
              >
                {results.map((p) => (
                  <li key={p.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <Thumb url={p.imageSmallUrl} name={p.name} />
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-semibold text-warm-900 dark:text-warm-100">{p.name}</p>
                        <p className="break-words text-xs text-warm-600 dark:text-warm-400">{printingMeta(p)}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onUse(p)}
                      className="min-h-[44px] w-full rounded-lg bg-amber-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-50 sm:w-auto"
                    >
                      {applyingId === p.id ? `${CARD_PANEL_COPY.usingPrinting}...` : CARD_PANEL_COPY.usePrinting}
                    </button>
                  </li>
                ))}
              </ul>
              {capped && <p className="text-xs text-warm-500 dark:text-warm-400">{CARD_PANEL_COPY.resultsCapped}</p>}
            </>
          )}
        </div>
      )}
    </section>
  );
};

export default CardSearchBox;
