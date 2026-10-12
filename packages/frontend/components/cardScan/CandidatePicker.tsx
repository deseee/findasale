/**
 * CandidatePicker (ADR-138 batch B7): "Pick the printing".
 *
 *  - Up to five printings the card list found, as full-width cards (radio buttons: the whole card is the tap target and the arrow
 *    keys move between them). The seller compares each picture with their own card. Pictures are shown whole.
 *  - "Filter by set" opens a small search of the card list (GET /api/cards/search, up to 20 printings) for when the right printing
 *    is not among the five. Picking one there sends the same choice.
 *  - Nothing is chosen for the seller when the set and number did not agree with the name: the radio buttons start empty.
 */
import React, { useId, useState } from 'react';
import { candidateTitle, optionLabel } from '../../lib/cardIntake';
import type { Candidate, VocabOption } from '../../lib/cardIntake';
import { canSearch, printingMeta } from '../../lib/cardRecord';
import type { PrintingResult } from '../../lib/cardRecord';
import type { ScanEntry } from '../../lib/cardScan';
import { SCAN_COPY } from '../../lib/cardScanCopy';
import ScanNotice from './ScanNotice';
import { inputCls, labelCls, mutedCls, primaryBtn, secondaryBtn, smallBtn } from './ui';
import { useCardSearch } from './useCardSearch';

export interface CandidatePickerProps {
  entry: ScanEntry;
  finishes: readonly VocabOption[];
  disabled?: boolean;
  /** False when the card list does not cover this game, so a set search would find nothing. */
  allowFilter: boolean;
  onPick: (printingId: string, imageUrl: string | null) => void;
}

export const MiniPicture: React.FC<{ url: string | null | undefined }> = ({ url }) => {
  const [failed, setFailed] = useState(false);
  return (
    <div className="flex h-[88px] w-[63px] flex-shrink-0 items-center justify-center overflow-hidden rounded border border-warm-200 bg-warm-100 dark:border-gray-600 dark:bg-gray-700">
      {url && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" loading="lazy" className="h-full w-full object-contain" onError={() => setFailed(true)} />
      ) : (
        <span className="px-1 text-center text-[10px] leading-tight text-warm-600 dark:text-warm-300">{SCAN_COPY.noCatalogImage}</span>
      )}
    </div>
  );
};

function candidateMeta(c: Candidate, finishes: readonly VocabOption[]): string {
  return c.finishes.map((f) => optionLabel(finishes, f)).join(', ');
}

const CandidatePicker: React.FC<CandidatePickerProps> = ({ entry, finishes, disabled, allowFilter, onPick }) => {
  const base = useId();
  const [filterOpen, setFilterOpen] = useState(false);
  const [setText, setSetText] = useState('');
  const [nameText, setNameText] = useState(() => entry.chosen.cardName || (entry.read && entry.read.name) || '');
  const search = useCardSearch();

  const selectedId = entry.chosen.printingId || entry.resolution.printingId;
  const game = entry.chosen.game || (entry.read && entry.read.game) || 'MTG';
  const inputs = { game, q: nameText, set: setText, number: '' };
  const ready = canSearch(inputs);

  const runSearch = () => {
    if (ready) void search.run(inputs);
  };

  const pickFromSearch = (p: PrintingResult) => {
    onPick(p.id, p.imageSmallUrl || null);
    search.reset();
    setFilterOpen(false);
  };

  return (
    <div className="min-w-0 space-y-3">
      {entry.resolution.candidates.length > 0 ? (
        <fieldset className="min-w-0" disabled={disabled}>
          <legend className="text-sm font-medium text-warm-900 dark:text-warm-100">{SCAN_COPY.pickPrinting}</legend>
          <p className={`mb-2 ${mutedCls}`}>{SCAN_COPY.pickPrintingHint}</p>
          <div className="flex flex-col gap-2">
            {entry.resolution.candidates.map((c) => {
              const checked = selectedId === c.printingId;
              const id = `${base}-${c.printingId}`;
              return (
                <label
                  key={c.printingId}
                  htmlFor={id}
                  className={`flex min-h-[44px] w-full cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm focus-within:ring-2 focus-within:ring-amber-500 ${
                    checked ? 'border-amber-600 bg-amber-50 dark:bg-amber-900/20' : 'border-warm-200 hover:border-amber-300 dark:border-gray-600'
                  }`}
                >
                  <input
                    id={id}
                    type="radio"
                    name={`${base}-printing`}
                    className="h-5 w-5 flex-shrink-0 accent-amber-600"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => onPick(c.printingId, c.imageSmallUrl)}
                  />
                  <MiniPicture url={c.imageSmallUrl} />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words font-medium text-warm-900 dark:text-warm-100">{candidateTitle(c)}</span>
                    <span className="block break-words text-warm-600 dark:text-warm-300">{candidateMeta(c, finishes)}</span>
                  </span>
                </label>
              );
            })}
          </div>
          {entry.resolution.truncated ? <p className={`mt-2 ${mutedCls}`}>{SCAN_COPY.candidatesMore}</p> : null}
        </fieldset>
      ) : null}

      {allowFilter ? (
        <div className="min-w-0">
          <button type="button" aria-expanded={filterOpen} disabled={disabled} onClick={() => setFilterOpen(!filterOpen)} className={smallBtn}>
            {SCAN_COPY.moreFilters}
          </button>
          {filterOpen ? (
            <div className="mt-3 space-y-3 rounded-lg border border-warm-200 p-3 dark:border-gray-600">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor={`${base}-name`} className={labelCls}>
                    {SCAN_COPY.nameLabel}
                  </label>
                  <input id={`${base}-name`} type="text" maxLength={100} autoComplete="off" value={nameText} onChange={(e) => setNameText(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label htmlFor={`${base}-set`} className={labelCls}>
                    {SCAN_COPY.setLabel}
                  </label>
                  <input id={`${base}-set`} type="text" maxLength={20} autoComplete="off" value={setText} onChange={(e) => setSetText(e.target.value)} className={inputCls} />
                </div>
              </div>
              <button type="button" disabled={!ready || search.phase === 'loading'} onClick={runSearch} className={secondaryBtn}>
                {SCAN_COPY.searchButton}
              </button>
              {!ready ? <p className={mutedCls}>{SCAN_COPY.searchNeedsMore}</p> : null}
              <div aria-live="polite" className="space-y-2">
                {search.phase === 'loading' ? <p className={mutedCls}>{SCAN_COPY.searching}</p> : null}
                {search.phase === 'empty' ? <ScanNotice tone="info" text={SCAN_COPY.searchNoResults} /> : null}
                {search.phase === 'off' ? <ScanNotice tone="info" text={SCAN_COPY.catalogOff} /> : null}
                {search.phase === 'error' ? (
                  <ScanNotice tone="error" text={SCAN_COPY.searchError}>
                    <button type="button" onClick={runSearch} className={secondaryBtn}>
                      {SCAN_COPY.sendRetry}
                    </button>
                  </ScanNotice>
                ) : null}
                {search.phase === 'results' ? (
                  <ul className="max-h-96 divide-y divide-warm-200 overflow-y-auto overscroll-contain rounded-lg border border-warm-200 dark:divide-gray-600 dark:border-gray-600">
                    {search.results.map((p) => (
                      <li key={p.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                        <div className="flex min-w-0 flex-1 items-start gap-3">
                          <MiniPicture url={p.imageSmallUrl} />
                          <div className="min-w-0 flex-1">
                            <p className="break-words text-sm font-semibold text-warm-900 dark:text-warm-100">{p.name}</p>
                            <p className="break-words text-xs text-warm-600 dark:text-warm-300">{printingMeta(p)}</p>
                          </div>
                        </div>
                        <button type="button" onClick={() => pickFromSearch(p)} className={primaryBtn}>
                          {SCAN_COPY.usePrinting}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {search.phase === 'results' && search.capped ? <p className={mutedCls}>{SCAN_COPY.resultsCapped}</p> : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export default CandidatePicker;
