/**
 * BuyCalculator (ADR-140 sections 7 and 11.3): "what would we pay for this bulk?". The shop adds lines (a tier, a finish and a
 * number of cards) and the server prices them with POST /api/price-book/buylist/bulk-quote. The browser does no arithmetic:
 * it shows the cash and store credit the server sent. Nothing is saved and nothing is bought.
 */
import React, { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SEARCH_DEBOUNCE_MS } from '../../lib/cardRecord';
import { priceBookApi } from '../../lib/priceBook';
import { FINISH_LABELS, PRICE_BOOK_COPY, PRICE_BOOK_UI, TIER_LABELS, noRateText } from '../../lib/priceBookCopy';
import { formatMoney } from '../../lib/priceBookRules';
import useDebouncedValue from '../cardRecord/useDebouncedValue';
import { TIER_ORDER } from './RateGrid';
import { inputCls, labelCls, labelOf, mutedCls, noticeErrorCls, optionsFrom, parseWholeNumber, secondaryBtn, sectionCls, smallBtn, subHeadingCls } from './ui';

/** The most cards one line may hold (the same limit the server applies to a bulk line). */
export const MAX_QUOTE_CARDS = 1_000_000;

export interface QuoteLine {
  id: number;
  tier: string;
  finish: string;
  cardsText: string;
}

export interface BulkQuoteView {
  ok: boolean;
  code: string | null;
  cashCents: number | null;
  creditCents: number | null;
  lines: Array<{ ok: boolean; code: string | null; cents: number | null; creditCents: number | null }>;
}

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Reads the server's quote. Anything unreadable gives ok false with no code. */
export function readBulkQuote(data: unknown): BulkQuoteView {
  const root = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const src = root.quote && typeof root.quote === 'object' ? (root.quote as Record<string, unknown>) : root;
  const lines = (Array.isArray(src.lines) ? src.lines : []).map((x) => {
    const r = x && typeof x === 'object' ? (x as Record<string, unknown>) : {};
    return {
      ok: r.ok === true,
      code: typeof r.code === 'string' ? r.code : null,
      cents: numOrNull(r.cents),
      creditCents: numOrNull(r.creditCents),
    };
  });
  return {
    ok: src.ok === true,
    code: typeof src.code === 'string' ? src.code : null,
    cashCents: numOrNull(src.cashCents),
    creditCents: numOrNull(src.creditCents),
    lines,
  };
}

export interface BuyCalculatorProps {
  game: string;
}

const BuyCalculator: React.FC<BuyCalculatorProps> = ({ game }) => {
  const baseId = useId();
  const [nextId, setNextId] = useState(2);
  const [lines, setLines] = useState<QuoteLine[]>([{ id: 1, tier: 'COMMON', finish: 'ANY', cardsText: '' }]);
  const tiers = optionsFrom(null, TIER_LABELS).sort((a, b) => TIER_ORDER.indexOf(a.code as never) - TIER_ORDER.indexOf(b.code as never));
  const finishes = optionsFrom(null, FINISH_LABELS);

  const parsed = lines.map((l) => parseWholeNumber(l.cardsText, 1, MAX_QUOTE_CARDS));
  const allValid = lines.length > 0 && parsed.every((n) => n !== null);
  const requestKey = JSON.stringify([game, lines.map((l, i) => [l.tier, l.finish, parsed[i]])]);
  const debouncedKey = useDebouncedValue(requestKey, SEARCH_DEBOUNCE_MS * 2);

  const quote = useQuery({
    queryKey: ['price-book', 'bulk-quote', debouncedKey],
    queryFn: async () => {
      const [g, ls] = JSON.parse(debouncedKey) as [string, Array<[string, string, number]>];
      return readBulkQuote(await priceBookApi.buylistBulkQuote(g, ls.map((l) => ({ tier: l[0], finish: l[1], cards: l[2] }))));
    },
    enabled: allValid && debouncedKey === requestKey,
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const update = (id: number, patch: Partial<QuoteLine>): void => {
    setLines((cur) => cur.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const result = allValid && debouncedKey === requestKey ? quote.data : undefined;
  let failure = '';
  if (result && !result.ok) {
    const badIndex = result.lines.findIndex((l) => !l.ok);
    const tier = badIndex >= 0 && lines[badIndex] ? lines[badIndex].tier : '';
    failure = result.code === 'NO_RATE' ? noRateText(labelOf(TIER_LABELS, tier, '') || null) : PRICE_BOOK_UI.quoteFailed;
  }

  return (
    <section aria-labelledby={`${baseId}-title`} className={sectionCls}>
      <h3 id={`${baseId}-title`} className={subHeadingCls}>{PRICE_BOOK_COPY.buyCalcHeading}</h3>
      <p className={mutedCls}>{PRICE_BOOK_UI.buyCalcHelp}</p>
      <ul className="space-y-3">
        {lines.map((l, i) => (
          <li key={l.id} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div>
              <label htmlFor={`${baseId}-tier-${l.id}`} className={labelCls}>{PRICE_BOOK_UI.fieldTier}</label>
              <select id={`${baseId}-tier-${l.id}`} className={inputCls} value={l.tier} onChange={(e) => update(l.id, { tier: e.target.value })}>
                {tiers.map((t) => (
                  <option key={t.code} value={t.code}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${baseId}-finish-${l.id}`} className={labelCls}>{PRICE_BOOK_UI.fieldFinish}</label>
              <select id={`${baseId}-finish-${l.id}`} className={inputCls} value={l.finish} onChange={(e) => update(l.id, { finish: e.target.value })}>
                {finishes.map((f) => (
                  <option key={f.code} value={f.code}>{f.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${baseId}-cards-${l.id}`} className={labelCls}>{PRICE_BOOK_UI.fieldCards}</label>
              <input
                id={`${baseId}-cards-${l.id}`}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                className={inputCls}
                value={l.cardsText}
                aria-invalid={l.cardsText.trim() !== '' && parsed[i] === null}
                onChange={(e) => update(l.id, { cardsText: e.target.value })}
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                className={smallBtn}
                disabled={lines.length <= 1}
                onClick={() => setLines((cur) => cur.filter((x) => x.id !== l.id))}
              >
                {PRICE_BOOK_UI.removeLine}
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div>
        <button
          type="button"
          className={secondaryBtn}
          onClick={() => {
            setLines((cur) => cur.concat([{ id: nextId, tier: 'COMMON', finish: 'ANY', cardsText: '' }]));
            setNextId((n) => n + 1);
          }}
        >
          {PRICE_BOOK_UI.addLine}
        </button>
      </div>

      <div aria-live="polite" className="space-y-1">
        {!allValid && lines.some((l) => l.cardsText.trim() !== '') && <p className={mutedCls}>{PRICE_BOOK_UI.cardsHint}</p>}
        {allValid && quote.isFetching && <p role="status" className={mutedCls}>{PRICE_BOOK_UI.working}</p>}
        {failure && <p role="alert" className={noticeErrorCls}>{failure}</p>}
        {result && result.ok && result.cashCents !== null && (
          <div className="rounded-lg border border-warm-200 bg-warm-50 px-3 py-2 dark:border-gray-600 dark:bg-gray-900">
            <p className="text-sm text-warm-800 dark:text-warm-200">
              <span className="font-semibold">{PRICE_BOOK_COPY.buyCalcCash}</span> {formatMoney(result.cashCents)}
            </p>
            {result.creditCents !== null && (
              <p className="text-sm text-warm-800 dark:text-warm-200">
                <span className="font-semibold">{PRICE_BOOK_COPY.buyCalcCredit}</span> {formatMoney(result.creditCents)}
              </p>
            )}
          </div>
        )}
        {allValid && quote.isError && <p role="alert" className={noticeErrorCls}>{PRICE_BOOK_UI.quoteFailed}</p>}
      </div>
    </section>
  );
};

export default BuyCalculator;
