/**
 * TryItPanel (ADR-140 section 11.2): pick a card with the catalog search (or type one), choose finish, condition and language,
 * press "Try it", and see the answer the price book gives. It calls POST /suggest with no itemId, so it changes nothing.
 * The answer is shown by WhyThisPrice (the same popover content as the item editor); this file computes nothing.
 */
import React, { useEffect, useId, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { UNKNOWN_STATUS, lookupAvailability, readStatus as readCatalogStatus } from '../../lib/cardRecord';
import type { PrintingResult } from '../../lib/cardRecord';
import { priceBookApi, readPriceBookError } from '../../lib/priceBook';
import type { PriceBookFamily, PriceBookStatus, PriceSuggestionResult, SuggestCardInput } from '../../lib/priceBook';
import {
  CONDITION_LABELS,
  FAMILY_LABELS,
  FINISH_LABELS,
  PRICE_BOOK_COPY,
  PRICE_BOOK_UI,
  RARITY_CLASS_LABELS,
  RULE_GAME_WORDS,
  RULE_LANGUAGE_WORDS,
  failureText,
} from '../../lib/priceBookCopy';
import { formatMoney } from '../../lib/priceBookRules';
import CardSearchBox from '../cardRecord/CardSearchBox';
import WhyThisPrice from './WhyThisPrice';
import { checkboxCls, inputCls, labelCls, mutedCls, noticeErrorCls, optionsFrom, primaryBtn, sectionCls, smallBtn, subHeadingCls } from './ui';
import { useCardVocabulary } from './usePriceBookData';

export interface TryItPanelProps {
  status: PriceBookStatus;
}

type Mode = 'catalog' | 'typed';

function printingMetaLine(p: PrintingResult): string {
  const code = p.setCode ? p.setCode.toUpperCase() : '';
  const set = p.setName ? (code ? `${p.setName} (${code})` : p.setName) : code;
  return p.collectorNumber ? `${set} #${p.collectorNumber}` : set;
}

const TryItPanel: React.FC<TryItPanelProps> = () => {
  const baseId = useId();
  const vocab = useCardVocabulary().data || null;
  const catalogStatus = useQuery({
    queryKey: ['card-catalog-status'],
    queryFn: async () => readCatalogStatus((await api.get('/cards/status')).data),
    staleTime: 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [family, setFamily] = useState<PriceBookFamily>('RETAIL');
  const [game, setGame] = useState('MTG');
  const [mode, setMode] = useState<Mode>('catalog');
  const [printing, setPrinting] = useState<PrintingResult | null>(null);
  const [cardName, setCardName] = useState('');
  const [setCode, setSetCode] = useState('');
  const [collectorNumber, setCollectorNumber] = useState('');
  const [rarity, setRarity] = useState('');
  const [finish, setFinish] = useState('');
  const [condition, setCondition] = useState('NM');
  const [language, setLanguage] = useState('en');
  const [result, setResult] = useState<PriceSuggestionResult | null>(null);
  const [error, setError] = useState('');

  const games = optionsFrom(vocab ? vocab.games : null, RULE_GAME_WORDS);
  const finishes = useMemo(
    () =>
      printing && printing.finishes && printing.finishes.length > 0
        ? optionsFrom(printing.finishes.map((code) => ({ code, label: FINISH_LABELS[code] || code })), FINISH_LABELS)
        : optionsFrom(vocab ? vocab.finishes : null, FINISH_LABELS, ['ANY']),
    [printing, vocab]
  );
  const conditions = optionsFrom(vocab ? vocab.conditionCodes : null, CONDITION_LABELS);
  const languages = optionsFrom(vocab ? vocab.languages : null, RULE_LANGUAGE_WORDS);
  const rarities = optionsFrom(null, RARITY_CLASS_LABELS, ['UNKNOWN']);

  useEffect(() => {
    if (finishes.length > 0 && !finishes.some((f) => f.code === finish)) setFinish(finishes[0].code);
  }, [finishes, finish]);

  const availability = vocab ? lookupAvailability(catalogStatus.data || UNKNOWN_STATUS, game, vocab.games) : 'chooseGame';

  const mutation = useMutation({
    mutationFn: (card: SuggestCardInput) => priceBookApi.suggest(family, [card]),
    onSuccess: (response) => {
      const first = response.results.length > 0 ? response.results[0] : null;
      if (first) {
        setResult(first);
        setError('');
      } else {
        setResult(null);
        setError(PRICE_BOOK_UI.tryFailed);
      }
    },
    onError: (err) => {
      setResult(null);
      setError(readPriceBookError(err).message);
    },
  });

  const press = (): void => {
    setError('');
    if (!finish) {
      setError(PRICE_BOOK_UI.errorFinish);
      return;
    }
    const base: SuggestCardInput = { ref: 'try', game, finish, conditionCode: condition, language };
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
    mutation.mutate({ ...base, typed: { cardName, setCode, collectorNumber, rarity } });
  };

  const titleId = `${baseId}-title`;
  const busy = mutation.isPending;
  const priceCents = result && result.ok && typeof result.priceCents === 'number' ? result.priceCents : null;
  const creditCents = result && result.ok && typeof result.creditCents === 'number' ? result.creditCents : null;

  return (
    <section aria-labelledby={titleId} className={sectionCls}>
      <h2 id={titleId} className={subHeadingCls}>{PRICE_BOOK_COPY.tryItHeading}</h2>
      <p className={mutedCls}>{PRICE_BOOK_COPY.tryItHelp}</p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${baseId}-family`} className={labelCls}>{PRICE_BOOK_UI.tryFamily}</label>
          <select
            id={`${baseId}-family`}
            className={inputCls}
            value={family}
            onChange={(e) => {
              setFamily(e.target.value === 'BUYLIST' ? 'BUYLIST' : 'RETAIL');
              setResult(null);
            }}
          >
            <option value="RETAIL">{FAMILY_LABELS.RETAIL}</option>
            <option value="BUYLIST">{FAMILY_LABELS.BUYLIST}</option>
          </select>
        </div>
        <div>
          <label htmlFor={`${baseId}-game`} className={labelCls}>{PRICE_BOOK_UI.fieldGame}</label>
          <select
            id={`${baseId}-game`}
            className={inputCls}
            value={game}
            onChange={(e) => {
              setGame(e.target.value);
              setPrinting(null);
              setResult(null);
            }}
          >
            {games.map((g) => (
              <option key={g.code} value={g.code}>{g.label}</option>
            ))}
          </select>
        </div>
      </div>

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

      {mode === 'catalog' &&
        (printing ? (
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
              setResult(null);
              if (p.language) setLanguage(p.language);
            }}
          />
        ))}

      {mode === 'typed' && (
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
            <label htmlFor={`${baseId}-rarity`} className={labelCls}>{PRICE_BOOK_UI.fieldRarity}</label>
            <select id={`${baseId}-rarity`} className={inputCls} value={rarity} onChange={(e) => setRarity(e.target.value)}>
              <option value="">{PRICE_BOOK_UI.anyOption}</option>
              {rarities.map((r) => (
                <option key={r.code} value={r.label}>{r.label}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor={`${baseId}-finish`} className={labelCls}>{PRICE_BOOK_UI.fieldFinish}</label>
          <select id={`${baseId}-finish`} className={inputCls} value={finish} onChange={(e) => setFinish(e.target.value)}>
            {finishes.map((f) => (
              <option key={f.code} value={f.code}>{f.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${baseId}-cond`} className={labelCls}>{PRICE_BOOK_UI.fieldCondition}</label>
          <select id={`${baseId}-cond`} className={inputCls} value={condition} onChange={(e) => setCondition(e.target.value)}>
            {conditions.map((c) => (
              <option key={c.code} value={c.code}>{c.label}</option>
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
      </div>

      <div>
        <button type="button" className={primaryBtn} disabled={busy} onClick={press}>
          {busy ? PRICE_BOOK_UI.working : PRICE_BOOK_COPY.tryIt}
        </button>
      </div>

      <div aria-live="polite" className="space-y-3">
        {error && <p role="alert" className={noticeErrorCls}>{error}</p>}
        {result && (
          <div className="min-w-0 space-y-2 rounded-lg border border-warm-200 bg-warm-50 p-3 dark:border-gray-600 dark:bg-gray-900">
            {priceCents !== null && family === 'RETAIL' && (
              <p className="break-words text-lg font-semibold text-warm-900 dark:text-warm-100">{PRICE_BOOK_COPY.headline(formatMoney(priceCents))}</p>
            )}
            {priceCents !== null && family === 'BUYLIST' && (
              <div className="space-y-1">
                <p className="break-words text-lg font-semibold text-warm-900 dark:text-warm-100">
                  {PRICE_BOOK_COPY.buyCalcCash}: {formatMoney(priceCents)}
                </p>
                {creditCents !== null && (
                  <p className="break-words text-sm text-warm-800 dark:text-warm-200">
                    {PRICE_BOOK_COPY.buyCalcCredit}: {formatMoney(creditCents)}
                  </p>
                )}
              </div>
            )}
            {priceCents === null && <p className="break-words text-sm text-warm-800 dark:text-warm-200">{failureText(result.code)}</p>}
            {priceCents !== null && <WhyThisPrice block={result} />}
            <p className={mutedCls}>{PRICE_BOOK_UI.tryNothingChanged}</p>
          </div>
        )}
      </div>
    </section>
  );
};

export default TryItPanel;
