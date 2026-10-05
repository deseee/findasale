/**
 * BulkLotEbayBundlePanel (ADR-136 Addendum C, roadmap #659): sell a bulk lot on eBay as fixed-size bundles.
 *
 * MOUNT POINT (not mounted yet, BulkLotSection.tsx belongs to another lane): render it directly under <BulkLotSection />
 * wherever the item form shows a saved bulk lot, with the same itemId:
 *     {isBulkLot && itemId && <BulkLotEbayBundlePanel itemId={itemId} disabled={saving} />}
 * It renders nothing at all while CARD_BULK_EBAY_ENABLED is off (GET /api/bulk-lots/ebay/status says enabled: false), so
 * mounting it is safe before the flag is on. BulkLotSection's line "They are not listed on eBay." (BULK_COPY.ebayNote in
 * lib/bulkLot.ts) becomes untrue once this is on and should be reworded in that lane.
 *
 * Behavior: the bundle size field is disabled while a live eBay listing exists (the server refuses a size change then,
 * see isBundleSizeLocked). Mounted inside the item form, so every button is type="button", Enter is swallowed, and
 * nothing here uses native validation attributes. The server is the authority on every number; the browser shows the
 * bundle price, bundles available and leftover cards exactly as the server sent them.
 */
import React, { useEffect, useId, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useToast } from './ToastContext';
import {
  BundleView,
  EBAY_BUNDLE_COPY as C,
  describeBundleError,
  isBundleSizeLocked,
  parseBundleSize,
  parseMeasure,
  parsePercent,
  readBundleView,
} from '../lib/bulkLotEbay';

export interface BulkLotEbayBundlePanelProps {
  itemId: string;
  disabled?: boolean;
  /** Called with the fresh view after a save, list or sync. */
  onChange?: (view: BundleView) => void;
}

const inputCls =
  'w-full min-h-[44px] px-4 py-2 text-base sm:text-sm border border-warm-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-warm-900 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none disabled:opacity-60';
const labelCls = 'block text-sm font-medium text-warm-700 dark:text-warm-300 mb-1';
const primaryBtn = 'min-h-[44px] rounded-lg bg-amber-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-50';
const secondaryBtn =
  'min-h-[44px] rounded-lg border border-warm-300 px-4 text-sm font-semibold text-warm-800 transition-colors hover:bg-warm-50 disabled:opacity-50 dark:border-gray-600 dark:text-warm-200 dark:hover:bg-gray-700';
const muted = 'text-xs text-warm-500 dark:text-warm-400';

const swallowEnter = (e: React.KeyboardEvent) => {
  if (e.key === 'Enter') e.preventDefault();
};

function errText(err: unknown): string {
  const r = (err as { response?: { data?: { error?: unknown; code?: unknown } } } | null)?.response;
  return describeBundleError(typeof r?.data?.code === 'string' ? r.data.code : null, typeof r?.data?.error === 'string' ? r.data.error : null);
}

const BulkLotEbayBundlePanel: React.FC<BulkLotEbayBundlePanelProps> = ({ itemId, disabled, onChange }) => {
  const baseId = useId();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const enc = encodeURIComponent(itemId);
  const key = ['bulk-lot-ebay', itemId];

  const statusQuery = useQuery({
    queryKey: ['bulk-lot-ebay-status'],
    queryFn: async () => (await api.get('/bulk-lots/ebay/status')).data?.data?.enabled === true,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
  const enabled = statusQuery.data === true;

  const viewQuery = useQuery({
    queryKey: key,
    queryFn: async () => readBundleView((await api.get(`/bulk-lots/ebay/item/${enc}`)).data),
    enabled,
    staleTime: 0,
    retry: 1,
    refetchOnWindowFocus: false,
  });
  const view = viewQuery.data ?? null;

  const [on, setOn] = useState(false);
  const [sizeText, setSizeText] = useState('');
  const [adjustText, setAdjustText] = useState('');
  const [titleText, setTitleText] = useState('');
  const [condition, setCondition] = useState('USED');
  const [language, setLanguage] = useState('English');
  const [weightText, setWeightText] = useState('');
  const [lengthText, setLengthText] = useState('');
  const [widthText, setWidthText] = useState('');
  const [heightText, setHeightText] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<'' | 'save' | 'list' | 'sync'>('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const fillFrom = (v: BundleView) => {
    setOn(v.enabled);
    setSizeText(String(v.bundleSize));
    setAdjustText(v.adjustmentPercent === 0 ? '' : String(v.adjustmentPercent));
    setTitleText(v.ebayTitle ?? '');
    setCondition(v.condition === 'NEW' ? 'NEW' : 'USED');
    setLanguage(v.language);
    setWeightText(String(v.package.weightOz));
    setLengthText(String(v.package.lengthIn));
    setWidthText(String(v.package.widthIn));
    setHeightText(String(v.package.heightIn));
    setConfirmed(v.package.confirmed);
  };

  // Fill the form once per fetched view (a refetch after a save re-fills it with what the server kept).
  useEffect(() => {
    if (view) fillFrom(view);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  if (!enabled) return null;
  if (viewQuery.isError) {
    return (
      <section className="space-y-2 rounded-lg border border-warm-200 p-4 dark:border-gray-700">
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">{C.loadFailed}</p>
      </section>
    );
  }
  if (!view) return null;

  const locked = !!disabled || busy !== '';
  const sizeLocked = isBundleSizeLocked(view);
  const limits = view.limits;

  const accept = (next: BundleView | null, toast: string) => {
    if (!next) return;
    queryClient.setQueryData(key, next);
    fillFrom(next);
    onChange?.(next);
    setNotice(next.sync?.message ?? '');
    showToast(toast, 'success');
  };

  const buildBody = (): Record<string, unknown> | null => {
    const size = parseBundleSize(sizeText, limits.minBundleSize, limits.maxBundleSize);
    if (size === null) {
      setError(`Enter the bundle size as a whole number of cards, from ${limits.minBundleSize.toLocaleString('en-US')} to ${limits.maxBundleSize.toLocaleString('en-US')}.`);
      return null;
    }
    const adjust = parsePercent(adjustText, -50, 100);
    if (adjust === null) {
      setError('Enter the premium or discount as a number between -50 and 100.');
      return null;
    }
    const weight = parseMeasure(weightText, 0.1, 1120);
    const len = parseMeasure(lengthText, 0.1, 108);
    const wid = parseMeasure(widthText, 0.1, 108);
    const hei = parseMeasure(heightText, 0.1, 108);
    if (weight === null || len === null || wid === null || hei === null) {
      setError('Enter the weight and the three box measurements as positive numbers.');
      return null;
    }
    return {
      enabled: on,
      bundleSize: size,
      adjustmentPercent: adjust,
      ebayTitle: titleText.trim() ? titleText.trim() : null,
      condition,
      language: language.trim() || 'English',
      weightOz: weight,
      lengthIn: len,
      widthIn: wid,
      heightIn: hei,
      dimsConfirmed: confirmed,
    };
  };

  const run = async (what: 'save' | 'list' | 'sync') => {
    setError('');
    setNotice('');
    let body: Record<string, unknown> | null = null;
    if (what === 'save') {
      body = buildBody();
      if (!body) return;
    }
    setBusy(what);
    try {
      if (what === 'save') {
        accept(readBundleView((await api.put(`/bulk-lots/ebay/item/${enc}`, body)).data), C.saved);
      } else if (what === 'list') {
        accept(readBundleView((await api.post(`/bulk-lots/ebay/item/${enc}/list`)).data), C.listed);
      } else {
        accept(readBundleView((await api.post(`/bulk-lots/ebay/item/${enc}/sync`)).data), C.synced);
      }
    } catch (err) {
      setError(errText(err));
      // A refused list still returns the view; reload so the screen shows what eBay says now.
      queryClient.invalidateQueries({ queryKey: key });
    } finally {
      setBusy('');
    }
  };

  const useSuggested = () => {
    const s = view.package.suggested;
    setWeightText(String(s.weightOz));
    setLengthText(String(s.lengthIn));
    setWidthText(String(s.widthIn));
    setHeightText(String(s.heightIn));
    setConfirmed(false);
  };

  const canList = view.hasSettings && view.enabled && view.blockers.length === 0 && !view.listing.isLive;

  return (
    <section className="space-y-4 rounded-lg border border-warm-200 p-4 dark:border-gray-700" aria-labelledby={`${baseId}-h`}>
      <div>
        <h3 id={`${baseId}-h`} className="text-base font-semibold text-warm-900 dark:text-warm-100">{C.heading}</h3>
        <p className={muted}>{C.intro}</p>
      </div>

      <label className="flex min-h-[44px] items-center gap-3 text-sm text-warm-800 dark:text-warm-200">
        <input type="checkbox" checked={on} disabled={locked} onChange={(e) => setOn(e.target.checked)} className="h-5 w-5 rounded border-warm-300 text-amber-600 focus:ring-amber-500" />
        {C.enableLabel}
      </label>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${baseId}-size`} className={labelCls}>{C.sizeLabel}</label>
          <input id={`${baseId}-size`} type="text" inputMode="numeric" value={sizeText} disabled={locked || sizeLocked} onChange={(e) => setSizeText(e.target.value)} onKeyDown={swallowEnter} className={inputCls} />
          <p className={`mt-1 ${muted}`}>{sizeLocked ? C.sizeLockedHelp : C.sizeHelp}</p>
          {!sizeLocked && limits.presets.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {limits.presets.map((n) => (
                <button key={n} type="button" disabled={locked} onClick={() => setSizeText(String(n))} className={`${secondaryBtn} px-3`}>{n.toLocaleString('en-US')}</button>
              ))}
            </div>
          )}
        </div>
        <div>
          <label htmlFor={`${baseId}-adj`} className={labelCls}>{C.adjustLabel}</label>
          <input id={`${baseId}-adj`} type="text" inputMode="decimal" value={adjustText} disabled={locked} onChange={(e) => setAdjustText(e.target.value)} onKeyDown={swallowEnter} className={inputCls} />
          <p className={`mt-1 ${muted}`}>{C.adjustHelp}</p>
        </div>
        <div>
          <label htmlFor={`${baseId}-cond`} className={labelCls}>{C.conditionLabel}</label>
          <select id={`${baseId}-cond`} value={condition} disabled={locked} onChange={(e) => setCondition(e.target.value)} className={inputCls}>
            <option value="USED">Used</option>
            <option value="NEW">New</option>
          </select>
        </div>
        <div>
          <label htmlFor={`${baseId}-lang`} className={labelCls}>{C.languageLabel}</label>
          <input id={`${baseId}-lang`} type="text" value={language} disabled={locked} onChange={(e) => setLanguage(e.target.value)} onKeyDown={swallowEnter} className={inputCls} />
        </div>
      </div>

      <div>
        <label htmlFor={`${baseId}-title`} className={labelCls}>{C.titleLabel}</label>
        <input id={`${baseId}-title`} type="text" value={titleText} maxLength={80} disabled={locked} onChange={(e) => setTitleText(e.target.value)} onKeyDown={swallowEnter} className={inputCls} />
        <p className={`mt-1 ${muted}`}>{C.titleHelp} {view.titlePreview}</p>
      </div>

      <fieldset className="space-y-3" disabled={locked}>
        <legend className="text-sm font-semibold text-warm-900 dark:text-warm-100">{C.packageHeading}</legend>
        <p className={muted}>{C.packageHelp}</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {([
            [C.weightLabel, weightText, setWeightText, 'w'],
            [C.lengthLabel, lengthText, setLengthText, 'l'],
            [C.widthLabel, widthText, setWidthText, 'x'],
            [C.heightLabel, heightText, setHeightText, 'h'],
          ] as const).map(([label, value, set, id]) => (
            <div key={id}>
              <label htmlFor={`${baseId}-${id}`} className={labelCls}>{label}</label>
              <input id={`${baseId}-${id}`} type="text" inputMode="decimal" value={value} onChange={(e) => set(e.target.value)} onKeyDown={swallowEnter} className={inputCls} />
            </div>
          ))}
        </div>
        <button type="button" onClick={useSuggested} className={secondaryBtn}>{C.useSuggested}</button>
        <label className="flex min-h-[44px] items-center gap-3 text-sm text-warm-800 dark:text-warm-200">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="h-5 w-5 rounded border-warm-300 text-amber-600 focus:ring-amber-500" />
          {C.confirmLabel}
        </label>
      </fieldset>

      <div className="space-y-1 rounded-lg bg-warm-50 p-3 text-sm text-warm-800 dark:bg-gray-800 dark:text-warm-200" aria-live="polite">
        <p>{C.stockLine(view.stock.bundlesAvailable, view.stock.leftoverCards)}</p>
        {view.price.summary && <p>{view.price.summary}</p>}
        <p>{view.listing.endedForStock ? C.endedForStockLine : C.liveLine(view.listing.isLive ? view.listing.listedQty : null)}</p>
        {view.listing.lastSyncError && <p className="text-red-700 dark:text-red-300">{view.listing.lastSyncError}</p>}
        {view.listing.ebayUrl && (
          <p>
            <a href={view.listing.ebayUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-amber-700 underline dark:text-amber-400">View on eBay</a>
          </p>
        )}
      </div>

      {view.blockers.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-warm-700 dark:text-warm-300">
          {view.blockers.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={() => run('save')} disabled={locked} className={primaryBtn}>
          {busy === 'save' ? `${C.savingButton}...` : C.saveButton}
        </button>
        <button type="button" onClick={() => run('list')} disabled={locked || !canList} className={secondaryBtn}>
          {busy === 'list' ? `${C.listingButton}...` : C.listButton}
        </button>
        <button type="button" onClick={() => run('sync')} disabled={locked || !view.hasSettings} className={secondaryBtn}>
          {busy === 'sync' ? `${C.syncingButton}...` : C.syncButton}
        </button>
      </div>

      {notice && <p className="text-sm text-warm-700 dark:text-warm-300">{notice}</p>}
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </section>
  );
};

export default BulkLotEbayBundlePanel;
