/**
 * BulkLotSection (ADR-136, roadmap #659): sell a card item by the thousand, inside the card record panel.
 *
 * Owns its own data (GET /api/bulk-lots/item/:id, POST .../enable, PATCH .../item/:id) and saves separately from the
 * rest of the item form. Renders nothing at all unless the server says CARD_BULK_LOTS_ENABLED is on, so a shop without
 * bulk lots sees no change.
 *
 * The page mounts this inside its item <form>, so Enter in a field here is swallowed (it must not save the item), every
 * button is type="button" and no control uses native validation attributes.
 *
 * Price per 1,000 is stored in Item.price and the card count in Item.stockTotal. After a save the item form's own copies
 * of those two fields are refreshed through onLotChange, so saving the item afterwards cannot overwrite them with old values.
 */
import React, { useEffect, useId, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useToast } from './ToastContext';
import BulkLotFollowupPanel from './BulkLotFollowupPanel'; // ADR-136 Addendum B: adjust count with history, take cards back, hold cards
import BulkLotEbayBundlePanel from './BulkLotEbayBundlePanel'; // ADR-136 Addendum C: eBay bundles (renders nothing while CARD_BULK_EBAY_ENABLED is off)
import { FOLLOWUP_COPY } from '../lib/bulkLotFollowup';
import {
  BULK_COPY,
  BulkLot,
  BulkStatus,
  describeBulkError,
  PACK_SIZE_PRESETS,
  formatCardCount,
  packOfferText,
  packPriceCentsPreview,
  packsAvailablePreview,
  packsLeftText,
  parseLotTotal,
  parsePackSizeInput,
  parsePricePerThousand,
  readBulkStatus,
} from '../lib/bulkLot';

export interface BulkLotSectionProps {
  itemId: string;
  /** True once the item has a saved card record. Turning an item into a lot needs one. */
  hasCardRecord: boolean;
  disabled?: boolean;
  /** Called with the saved lot, so the page can refresh its own price and stock fields. */
  onLotChange?: (lot: BulkLot) => void;
}

const inputCls =
  'w-full min-h-[44px] px-4 py-2 text-base sm:text-sm border border-warm-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-warm-900 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none disabled:opacity-60';
const labelCls = 'block text-sm font-medium text-warm-700 dark:text-warm-300 mb-1';
const primaryBtn =
  'min-h-[44px] rounded-lg bg-amber-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-50';

const swallowEnter = (e: React.KeyboardEvent) => {
  if (e.key === 'Enter') e.preventDefault();
};

const BulkLotSection: React.FC<BulkLotSectionProps> = ({ itemId, hasCardRecord, disabled, onLotChange }) => {
  const baseId = useId();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const statusQuery = useQuery({
    queryKey: ['bulk-lots-status'],
    queryFn: async (): Promise<BulkStatus> => readBulkStatus((await api.get('/bulk-lots/status')).data),
    staleTime: 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const status = statusQuery.data;
  const enabled = status?.enabled === true;

  const lotKey = ['bulk-lot', itemId];
  const lotQuery = useQuery({
    queryKey: lotKey,
    queryFn: async (): Promise<BulkLot | null> => {
      const res = await api.get(`/bulk-lots/item/${encodeURIComponent(itemId)}`);
      return (res.data?.data ?? null) as BulkLot | null;
    },
    enabled: enabled && !!itemId,
    staleTime: 0,
    retry: 1,
    retryDelay: 500,
    refetchOnWindowFocus: false,
  });
  const lot = lotQuery.data ?? null;

  const [totalText, setTotalText] = useState('');
  const [priceText, setPriceText] = useState('');
  const [kind, setKind] = useState('');
  const [packText, setPackText] = useState(''); // ADR-136 Addendum E: cards per pack ('' = not sold in packs)
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const syncedFor = useRef<string | null>(null);

  const fillFrom = (l: BulkLot | null) => {
    setTotalText(l ? String(l.totalCards) : '');
    setPriceText(l && l.pricePerThousandCents !== null ? (l.pricePerThousandCents / 100).toFixed(2) : '');
    setKind(l ? l.lotKind : status?.vocabulary?.defaultKind ?? '');
    setPackText(l && typeof l.packSize === 'number' ? String(l.packSize) : '');
  };

  // Fill the form once per item when the lot has loaded. After that the form is the seller's.
  useEffect(() => {
    if (!lotQuery.isSuccess) return;
    if (syncedFor.current === itemId) return;
    syncedFor.current = itemId;
    fillFrom(lotQuery.data ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lotQuery.isSuccess, lotQuery.data, itemId]);

  if (!enabled) return null;

  const vocab = status?.vocabulary ?? null;
  const locked = !!disabled || busy;

  const applySaved = (saved: BulkLot, message: string) => {
    queryClient.setQueryData(lotKey, saved);
    fillFrom(saved);
    setError('');
    if (onLotChange) onLotChange(saved);
    showToast(message, 'success');
  };

  const enable = async () => {
    const total = parseLotTotal(totalText);
    const price = parsePricePerThousand(priceText);
    if (total === null) return setError(BULK_COPY.errorTotal);
    if (price === null) return setError(BULK_COPY.errorPrice);
    setBusy(true);
    setError('');
    try {
      const res = await api.post(`/bulk-lots/item/${encodeURIComponent(itemId)}/enable`, {
        totalCards: total,
        pricePerThousand: price,
        ...(kind ? { lotKind: kind } : {}),
      });
      applySaved(res.data?.data as BulkLot, BULK_COPY.panelEnabled);
    } catch (err) {
      setError(describeBulkError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!lot) return;
    const body: Record<string, unknown> = {};
    const price = parsePricePerThousand(priceText);
    if (price === null) return setError(BULK_COPY.errorPrice);
    if (lot.pricePerThousandCents === null || Math.round(price * 100) !== lot.pricePerThousandCents) body.pricePerThousand = price;

    // ADR-136 Addendum B: the card count is NOT saved here. It changes only through Adjust count (below), which records history;
    // the server refuses totalCards and addCards on this save.
    if (kind && kind !== lot.lotKind) body.lotKind = kind;
    if (Object.keys(body).length === 0) return setError(BULK_COPY.errorNothingToSave);

    setBusy(true);
    setError('');
    try {
      const res = await api.patch(`/bulk-lots/item/${encodeURIComponent(itemId)}`, body);
      applySaved(res.data?.data as BulkLot, BULK_COPY.panelSaved);
    } catch (err) {
      setError(describeBulkError(err).message);
    } finally {
      setBusy(false);
    }
  };

  // ADR-136 Addendum E: pack size. Saves on its own (the server refuses a size change while a cart line or hold is open on the lot).
  const savePack = async (clear: boolean) => {
    if (!lot) return;
    let next: number | null = null;
    if (!clear) {
      next = parsePackSizeInput(packText);
      if (next === null) return setError(BULK_COPY.errorPackSize);
      if (next > lot.totalCards) return setError(BULK_COPY.errorPackTooBig);
    }
    const current = typeof lot.packSize === 'number' ? lot.packSize : null;
    if (next === current) return setError(BULK_COPY.errorNothingToSave);
    setBusy(true);
    setError('');
    try {
      const res = await api.patch(`/bulk-lots/item/${encodeURIComponent(itemId)}`, { packSize: next });
      applySaved(res.data?.data as BulkLot, next === null ? BULK_COPY.packSizeCleared : BULK_COPY.packSizeSaved);
    } catch (err) {
      setError(describeBulkError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const packSizeNumber = parsePackSizeInput(packText);
  const pricePreviewDollars = parsePricePerThousand(priceText);
  const packCentsShown = packSizeNumber !== null && pricePreviewDollars !== null ? packPriceCentsPreview(packSizeNumber, pricePreviewDollars) : null;
  const packsLeftShown = lot && packSizeNumber !== null ? packsAvailablePreview(lot.remainingCards, packSizeNumber) : 0;
  const packPreviewLine =
    packSizeNumber === null
      ? ''
      : pricePreviewDollars === null
        ? BULK_COPY.packPriceNeedsPrice
        : packCentsShown === null
          ? BULK_COPY.errorPackPrice
          : `${packOfferText(packSizeNumber, packCentsShown)}. ${packsLeftText(packsLeftShown)}.`;

  const kindSelect = (
    <div>
      <label htmlFor={`${baseId}-kind`} className={labelCls}>
        {BULK_COPY.kindLabel}
      </label>
      <select
        id={`${baseId}-kind`}
        value={kind}
        disabled={locked}
        onChange={(e) => setKind(e.target.value)}
        onKeyDown={swallowEnter}
        className={inputCls}
      >
        {(vocab?.kinds ?? []).map((k) => (
          <option key={k} value={k}>
            {vocab?.labels[k] ?? k}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <section aria-labelledby={`${baseId}-heading`} className="space-y-3 rounded-lg border border-warm-200 px-3 py-3 dark:border-gray-600">
      <h3 id={`${baseId}-heading`} className="text-sm font-semibold text-warm-900 dark:text-warm-100">
        {BULK_COPY.panelHeading}
      </h3>

      {lotQuery.isLoading && <p className="text-sm text-warm-600 dark:text-warm-400">{BULK_COPY.manageLoading}</p>}

      {lotQuery.isError && (
        <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200">
          <p>{BULK_COPY.panelLoadError}</p>
          <button type="button" onClick={() => lotQuery.refetch()} className="mt-2 min-h-[44px] rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700">
            {BULK_COPY.retry}
          </button>
        </div>
      )}

      {lotQuery.isSuccess && !lot && (
        <>
          <p className="text-xs text-warm-600 dark:text-warm-400">{BULK_COPY.panelIntro}</p>
          {!hasCardRecord ? (
            <p className="text-xs text-warm-600 dark:text-warm-400">{BULK_COPY.panelNeedsCard}</p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor={`${baseId}-total`} className={labelCls}>
                    {BULK_COPY.totalCardsLabel}
                  </label>
                  <input id={`${baseId}-total`} type="text" inputMode="numeric" value={totalText} disabled={locked} onChange={(e) => setTotalText(e.target.value)} onKeyDown={swallowEnter} className={inputCls} />
                  <p className="mt-1 text-xs text-warm-500 dark:text-warm-400">{BULK_COPY.totalCardsHelp}</p>
                </div>
                <div>
                  <label htmlFor={`${baseId}-price`} className={labelCls}>
                    {BULK_COPY.priceLabel}
                  </label>
                  <input id={`${baseId}-price`} type="text" inputMode="decimal" value={priceText} disabled={locked} onChange={(e) => setPriceText(e.target.value)} onKeyDown={swallowEnter} className={inputCls} />
                  <p className="mt-1 text-xs text-warm-500 dark:text-warm-400">{BULK_COPY.priceHelp}</p>
                </div>
              </div>
              {kindSelect}
              <p className="text-xs text-warm-500 dark:text-warm-400">{FOLLOWUP_COPY.channelsNote}</p>
              <button type="button" onClick={enable} disabled={locked} className={`${primaryBtn} w-full sm:w-auto`}>
                {busy ? `${BULK_COPY.enablingButton}...` : BULK_COPY.enableButton}
              </button>
            </div>
          )}
        </>
      )}

      {lotQuery.isSuccess && lot && (
        <div className="space-y-3">
          <p className="text-sm text-warm-800 dark:text-warm-200">{BULK_COPY.panelIsLot}</p>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-xs text-warm-500 dark:text-warm-400">{BULK_COPY.soldSoFar}</dt>
              <dd className="font-semibold text-warm-900 dark:text-warm-100">{formatCardCount(lot.soldCards)}</dd>
            </div>
            <div>
              <dt className="text-xs text-warm-500 dark:text-warm-400">{BULK_COPY.remaining}</dt>
              <dd className="font-semibold text-warm-900 dark:text-warm-100">{formatCardCount(lot.remainingCards)}</dd>
            </div>
          </dl>
          {lot.perCardLabel && (
            <p className="text-xs text-warm-500 dark:text-warm-400">
              {BULK_COPY.pricePerCard} {lot.perCardLabel}.
            </p>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={`${baseId}-price`} className={labelCls}>
                {BULK_COPY.priceLabel}
              </label>
              <input id={`${baseId}-price`} type="text" inputMode="decimal" value={priceText} disabled={locked} onChange={(e) => setPriceText(e.target.value)} onKeyDown={swallowEnter} className={inputCls} />
              <p className="mt-1 text-xs text-warm-500 dark:text-warm-400">{BULK_COPY.priceHelp}</p>
            </div>
            {kindSelect}
          </div>
          <p className="text-xs text-warm-500 dark:text-warm-400">{FOLLOWUP_COPY.channelsNote}</p>
          <button type="button" onClick={save} disabled={locked} className={`${primaryBtn} w-full sm:w-auto`}>
            {busy ? `${BULK_COPY.savingButton}...` : BULK_COPY.saveButton}
          </button>
          <div className="space-y-2 rounded-lg border border-warm-200 px-3 py-3 dark:border-gray-600" role="group" aria-labelledby={`${baseId}-pack-heading`}>
            <h4 id={`${baseId}-pack-heading`} className="text-sm font-semibold text-warm-900 dark:text-warm-100">
              {BULK_COPY.packHeading}
            </h4>
            <p className="text-xs text-warm-600 dark:text-warm-400">{BULK_COPY.packIntro}</p>
            <div>
              <label htmlFor={`${baseId}-pack`} className={labelCls}>
                {BULK_COPY.packSizeLabel}
              </label>
              <input id={`${baseId}-pack`} type="text" inputMode="numeric" value={packText} disabled={locked} onChange={(e) => setPackText(e.target.value)} onKeyDown={swallowEnter} className={inputCls} />
              <p className="mt-1 text-xs text-warm-500 dark:text-warm-400">{BULK_COPY.packSizeHelp}</p>
            </div>
            <div role="group" aria-label={BULK_COPY.packPresetsLabel} className="flex flex-wrap gap-2">
              {PACK_SIZE_PRESETS.filter((n) => n <= lot.totalCards).map((n) => (
                <button
                  key={n}
                  type="button"
                  disabled={locked}
                  onClick={() => setPackText(String(n))}
                  aria-pressed={packSizeNumber === n}
                  className={`min-h-[44px] rounded-lg border px-3 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-50 ${
                    packSizeNumber === n ? 'border-amber-600 bg-amber-50 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100' : 'border-warm-300 text-warm-800 dark:border-gray-600 dark:text-warm-200'
                  }`}
                >
                  {formatCardCount(n)}
                </button>
              ))}
            </div>
            {packPreviewLine && (
              <p aria-live="polite" className="text-sm font-medium text-warm-900 dark:text-warm-100">
                {packPreviewLine}
              </p>
            )}
            {packSizeNumber !== null && packCentsShown !== null && <p className="text-xs text-warm-500 dark:text-warm-400">{BULK_COPY.packPriceRounding}</p>}
            {typeof lot.packSize === 'number' ? (
              <p className="text-xs text-warm-600 dark:text-warm-400">{lot.packsAvailableLabel ?? ''} {lot.leftoverCards ? BULK_COPY.packLeftoverNote : ''}</p>
            ) : (
              <p className="text-xs text-warm-600 dark:text-warm-400">{BULK_COPY.packNotSold}</p>
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={() => savePack(false)} disabled={locked} className={`${primaryBtn} w-full sm:w-auto`}>
                {busy ? `${BULK_COPY.savingButton}...` : BULK_COPY.packSaveButton}
              </button>
              {typeof lot.packSize === 'number' && (
                <button
                  type="button"
                  onClick={() => savePack(true)}
                  disabled={locked}
                  className="min-h-[44px] w-full rounded-lg border border-warm-300 px-4 text-sm font-semibold text-warm-800 hover:bg-warm-50 disabled:opacity-50 dark:border-gray-600 dark:text-warm-200 sm:w-auto"
                >
                  {BULK_COPY.packClearButton}
                </button>
              )}
            </div>
          </div>
          <BulkLotFollowupPanel itemId={itemId} lot={lot} disabled={!!disabled} onLotChange={(l) => { queryClient.setQueryData(lotKey, l); fillFrom(l); if (onLotChange) onLotChange(l); }} />
          <BulkLotEbayBundlePanel itemId={itemId} disabled={!!disabled} />
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </section>
  );
};

export default BulkLotSection;
