/**
 * ManualSearch (ADR-138 batch B7): "Search and add". Find a card in the card list (GET /api/cards/search) and add it to this scan
 * as a card of its own, or add it by hand with the details typed. Every Add makes one more card in the queue, so a second copy
 * is a second tap. Nothing is chosen for the seller: a card added here still needs its finish and condition in the queue.
 * Works with the camera and Smart scan turned off, which is why it is always available while the scan is open.
 */
import React, { useId, useState } from 'react';
import type { VocabOption } from '../../lib/cardIntake';
import { canSearch, printingMeta } from '../../lib/cardRecord';
import type { PrintingResult } from '../../lib/cardRecord';
import { buildManualEntryBody } from '../../lib/cardScan';
import type { ScanEntry, ScanFailure, ScanResult } from '../../lib/cardScan';
import { SCAN_COPY, wordingForScanError } from '../../lib/cardScanCopy';
import { newClientEntryId } from '../../lib/cardScanQueue';
import { MiniPicture } from './CandidatePicker';
import ScanNotice from './ScanNotice';
import { inputCls, labelCls, mutedCls, primaryBtn, secondaryBtn } from './ui';
import { useCardSearch } from './useCardSearch';

export interface ManualSearchProps {
  enabled: boolean;
  games: readonly VocabOption[];
  defaultGame: string | null;
  /** Games the card list covers. Empty when the card list is not ready at all. */
  readyGames: readonly string[];
  onAdd: (body: Record<string, unknown>) => Promise<ScanResult<ScanEntry>>;
}

function pickGame(games: readonly VocabOption[], preferred: string | null): string {
  if (preferred && games.some((g) => g.code === preferred)) return preferred;
  if (games.some((g) => g.code === 'MTG')) return 'MTG';
  return games.length > 0 ? games[0].code : 'MTG';
}

const ManualSearch: React.FC<ManualSearchProps> = ({ enabled, games, defaultGame, readyGames, onAdd }) => {
  const base = useId();
  const [game, setGame] = useState(() => pickGame(games, defaultGame));
  const [name, setName] = useState('');
  const [setCode, setSetCode] = useState('');
  const [number, setNumber] = useState('');
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState<string | null>(null);
  const [failure, setFailure] = useState<ScanFailure | null>(null);
  const [localCode, setLocalCode] = useState<string | null>(null);
  const search = useCardSearch();

  const inputs = { game, q: name, set: setCode, number };
  const ready = canSearch(inputs);
  const covered = readyGames.indexOf(game) >= 0;
  const hasName = name.trim() !== '';

  const runSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (ready) void search.run(inputs);
  };

  const submit = async (body: Record<string, unknown>, label: string) => {
    setAdding(true);
    setFailure(null);
    setLocalCode(null);
    setAdded(null);
    try {
      const result = await onAdd(body);
      if (result.ok) setAdded(label);
      else setFailure(result.failure);
    } finally {
      setAdding(false);
    }
  };

  const addPrinting = (p: PrintingResult) => {
    const built = buildManualEntryBody({ clientEntryId: newClientEntryId(), printingId: p.id, game: p.game || game });
    if (!built.ok) {
      setLocalCode('BAD_REQUEST');
      return;
    }
    void submit(built.body, p.name);
  };

  const addByHand = () => {
    const built = buildManualEntryBody({
      clientEntryId: newClientEntryId(),
      game,
      cardName: name,
      setCode,
      collectorNumber: number,
    });
    if (!built.ok) {
      setLocalCode('BAD_REQUEST');
      return;
    }
    void submit(built.body, name.trim());
  };

  const localWording = localCode ? wordingForScanError(localCode) : null;

  return (
    <form onSubmit={runSearch} className="min-w-0 space-y-3" noValidate>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${base}-game`} className={labelCls}>
            {SCAN_COPY.gameLabel}
          </label>
          <select id={`${base}-game`} value={game} disabled={!enabled} onChange={(e) => setGame(e.target.value)} className={inputCls}>
            {games.map((g) => (
              <option key={g.code} value={g.code}>
                {g.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${base}-name`} className={labelCls}>
            {SCAN_COPY.searchLabel}
          </label>
          <input
            id={`${base}-name`}
            type="text"
            maxLength={100}
            autoComplete="off"
            disabled={!enabled}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor={`${base}-set`} className={labelCls}>
            {SCAN_COPY.setLabel}
          </label>
          <input
            id={`${base}-set`}
            type="text"
            maxLength={20}
            autoComplete="off"
            disabled={!enabled}
            value={setCode}
            onChange={(e) => setSetCode(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor={`${base}-number`} className={labelCls}>
            {SCAN_COPY.numberLabel}
          </label>
          <input
            id={`${base}-number`}
            type="text"
            maxLength={20}
            autoComplete="off"
            disabled={!enabled}
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            className={inputCls}
          />
        </div>
      </div>

      {readyGames.length === 0 ? <ScanNotice tone="info" text={SCAN_COPY.cardListNotReady} /> : null}
      {readyGames.length > 0 && !covered ? <ScanNotice tone="info" text={SCAN_COPY.gameNotServed} /> : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="submit" disabled={!enabled || !ready || search.phase === 'loading'} className={primaryBtn}>
          {SCAN_COPY.searchButton}
        </button>
        <button type="button" disabled={!enabled || !hasName || adding} onClick={addByHand} className={secondaryBtn}>
          {SCAN_COPY.addByHand}
        </button>
      </div>
      {!ready ? <p className={mutedCls}>{SCAN_COPY.searchNeedsMore}</p> : null}
      {hasName ? <p className={mutedCls}>{SCAN_COPY.addByHandHint}</p> : null}

      <div aria-live="polite" className="space-y-2">
        {added ? <ScanNotice tone="ok" text={SCAN_COPY.addedCard(added)} onDismiss={() => setAdded(null)} /> : null}
        {failure ? <ScanNotice tone="error" text={failure.message} help={failure.help} onDismiss={() => setFailure(null)} /> : null}
        {localWording ? <ScanNotice tone="error" text={localWording.message} help={localWording.help} onDismiss={() => setLocalCode(null)} /> : null}
        {search.phase === 'loading' ? <p className={mutedCls}>{SCAN_COPY.searching}</p> : null}
        {search.phase === 'empty' ? <ScanNotice tone="info" text={SCAN_COPY.searchNoResults} /> : null}
        {search.phase === 'off' ? <ScanNotice tone="info" text={SCAN_COPY.catalogOff} /> : null}
        {search.phase === 'error' ? (
          <ScanNotice tone="error" text={SCAN_COPY.searchError}>
            <button type="button" onClick={() => runSearch()} className={secondaryBtn}>
              {SCAN_COPY.sendRetry}
            </button>
          </ScanNotice>
        ) : null}
      </div>

      {search.phase === 'results' ? (
        <div className="min-w-0 space-y-2">
          <ul className="divide-y divide-warm-200 rounded-lg border border-warm-200 dark:divide-gray-600 dark:border-gray-600">
            {search.results.map((p) => (
              <li key={p.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <MiniPicture url={p.imageSmallUrl} />
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-semibold text-warm-900 dark:text-warm-100">{p.name}</p>
                    <p className="break-words text-xs text-warm-600 dark:text-warm-300">{printingMeta(p)}</p>
                  </div>
                </div>
                <button type="button" disabled={!enabled || adding} onClick={() => addPrinting(p)} className={primaryBtn} aria-label={SCAN_COPY.addPrintingLabel(p.name)}>
                  {SCAN_COPY.addCard}
                </button>
              </li>
            ))}
          </ul>
          {search.capped ? <p className={mutedCls}>{SCAN_COPY.resultsCapped}</p> : null}
          <p className={mutedCls}>{SCAN_COPY.scryfallCredit}</p>
        </div>
      ) : null}
    </form>
  );
};

export default ManualSearch;
