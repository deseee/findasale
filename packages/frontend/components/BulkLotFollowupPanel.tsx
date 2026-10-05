/**
 * BulkLotFollowupPanel (ADR-136 Addendum B, roadmap #659): the parts of a bulk lot that change after it is created.
 *
 *   Adjust count   recount, damaged or lost, correction, added stock. The card count changes only here, and every change
 *                  is saved in the history below with the reason, the count before and after, and who made it.
 *   Take cards back   recent sales of the lot with the cards still out. A refund by card count pays exactly the money
 *                  for those cards (same rounding as the sale) and puts the cards back in the lot.
 *   Hold cards     set N cards aside for a customer. The hold gives the cards back when it expires or is released, and
 *                  turns into a sale when it is paid (cash now, or a Square link).
 *
 * Mounted by BulkLotSection inside the item form: every button is type="button", Enter is swallowed, and nothing here uses
 * native validation attributes. The server is the authority on every number; the previews here only show what it will do.
 */
import React, { useId, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useToast } from './ToastContext';
import { BulkLot, formatCardCount } from '../lib/bulkLot';
import {
  ADJUST_REASONS,
  ADJUST_REASON_LABELS,
  AdjustReason,
  FOLLOWUP_COPY as C,
  adjustReasonSetsCount,
  cardsOnHandAfter,
  describeAdjustment,
  describeFollowupCode,
  formatDollarsFromCents,
  previewCardRefund,
  readAdjustments,
} from '../lib/bulkLotFollowup';

export interface BulkLotFollowupPanelProps {
  itemId: string;
  lot: BulkLot;
  disabled?: boolean;
  /** Called with the lot after anything that changes its cards, so the page can refresh. */
  onLotChange?: (lot: BulkLot) => void;
}

interface SaleRow {
  purchaseId: string;
  amountCents: number;
  refundedCents: number;
  status: string;
  soldCards: number;
  returnedCards: number;
  outstandingCards: number;
  customer: string | null;
  createdAt: string;
}

interface HoldRow {
  id: string;
  quantity: number;
  quantityLabel: string;
  lineCents: number;
  lineLabel: string;
  customerName: string | null;
  status: string;
  expiresAt: string;
  holdInvoiceId: string | null;
}

const inputCls =
  'w-full min-h-[44px] px-4 py-2 text-base sm:text-sm border border-warm-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-warm-900 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none disabled:opacity-60';
const labelCls = 'block text-sm font-medium text-warm-700 dark:text-warm-300 mb-1';
const primaryBtn = 'min-h-[44px] rounded-lg bg-amber-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-50';
const secondaryBtn =
  'min-h-[44px] rounded-lg border border-warm-300 px-4 text-sm font-semibold text-warm-800 transition-colors hover:bg-warm-50 disabled:opacity-50 dark:border-gray-600 dark:text-warm-200 dark:hover:bg-gray-700';
const subHeading = 'text-sm font-semibold text-warm-900 dark:text-warm-100';
const muted = 'text-xs text-warm-500 dark:text-warm-400';

const swallowEnter = (e: React.KeyboardEvent) => {
  if (e.key === 'Enter') e.preventDefault();
};

/** A count that may be zero (a recount of an empty lot). */
function parseCountAllowZero(text: string): number | null {
  const cleaned = text.replace(/[\s,]/g, '');
  if (!/^\d{1,9}$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return n <= 1_000_000 ? n : null;
}

function parseWhole(text: string, min: number, max: number): number | null {
  const cleaned = text.replace(/[\s,]/g, '');
  if (!/^\d{1,9}$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return n >= min && n <= max ? n : null;
}

function errText(err: unknown): string {
  const r = (err as { response?: { data?: { error?: unknown; code?: unknown } } } | null)?.response;
  const code = typeof r?.data?.code === 'string' ? r.data.code : null;
  const text = typeof r?.data?.error === 'string' ? r.data.error : null;
  return describeFollowupCode(code, text);
}

const BulkLotFollowupPanel: React.FC<BulkLotFollowupPanelProps> = ({ itemId, lot, disabled, onLotChange }) => {
  const baseId = useId();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const enc = encodeURIComponent(itemId);

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = !!disabled || busy;

  // ---- Adjust ----
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [reason, setReason] = useState<AdjustReason>('RECOUNT');
  const [countText, setCountText] = useState('');
  const [noteText, setNoteText] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);

  const historyQuery = useQuery({
    queryKey: ['bulk-lot-adjustments', itemId],
    queryFn: async () => readAdjustments((await api.get(`/bulk-lots/item/${enc}/adjustments`)).data),
    enabled: historyOpen,
    staleTime: 0,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const entered = parseCountAllowZero(countText);
  const afterCount = entered === null ? null : cardsOnHandAfter(reason, lot.remainingCards, entered);

  const saveAdjust = async () => {
    if (entered === null || afterCount === null) return setError(C.adjustEntryInvalid);
    if (afterCount === lot.remainingCards && reason !== 'RECOUNT') return setError(C.adjustNoChange);
    setBusy(true);
    setError('');
    try {
      const res = await api.post(`/bulk-lots/item/${enc}/adjust`, { reason, cards: entered, ...(noteText.trim() ? { note: noteText.trim() } : {}) });
      const saved = res.data?.data?.lot as BulkLot | null | undefined;
      if (saved) {
        queryClient.setQueryData(['bulk-lot', itemId], saved);
        onLotChange?.(saved);
      }
      queryClient.invalidateQueries({ queryKey: ['bulk-lot-adjustments', itemId] });
      setCountText('');
      setNoteText('');
      setAdjustOpen(false);
      showToast(C.adjustSaved, 'success');
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  };

  // ---- Sales and refunds ----
  const salesQuery = useQuery({
    queryKey: ['bulk-lot-sales', itemId],
    queryFn: async (): Promise<SaleRow[]> => {
      const res = await api.get(`/bulk-lots/item/${enc}/sales`);
      const list = res.data?.data?.sales;
      return Array.isArray(list) ? (list as SaleRow[]) : [];
    },
    staleTime: 0,
    retry: 1,
    refetchOnWindowFocus: false,
  });
  const [refundFor, setRefundFor] = useState<string | null>(null);
  const [refundText, setRefundText] = useState('');

  const refreshLot = async () => {
    try {
      const res = await api.get(`/bulk-lots/item/${enc}`);
      const fresh = (res.data?.data ?? null) as BulkLot | null;
      if (fresh) {
        queryClient.setQueryData(['bulk-lot', itemId], fresh);
        onLotChange?.(fresh);
      }
    } catch {
      // The panel keeps working with what it has; the next load fixes it.
    }
  };

  const doRefund = async (sale: SaleRow, cards: number) => {
    setBusy(true);
    setError('');
    try {
      await api.post(`/stripe/refund/${encodeURIComponent(sale.purchaseId)}`, { cards });
      setRefundFor(null);
      setRefundText('');
      showToast(C.refundDone, 'success');
      await Promise.all([salesQuery.refetch(), refreshLot()]);
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  };

  // ---- Holds ----
  const holdsQuery = useQuery({
    queryKey: ['bulk-lot-holds', itemId],
    queryFn: async (): Promise<HoldRow[]> => {
      const res = await api.get(`/bulk-lots/item/${enc}/holds`);
      const list = res.data?.data?.holds;
      return Array.isArray(list) ? (list as HoldRow[]) : [];
    },
    staleTime: 0,
    retry: 1,
    refetchOnWindowFocus: false,
  });
  const [holdOpen, setHoldOpen] = useState(false);
  const [holdCards, setHoldCards] = useState('');
  const [holdName, setHoldName] = useState('');
  const [holdHours, setHoldHours] = useState('24');
  const [linkFor, setLinkFor] = useState<{ holdId: string; url: string } | null>(null);

  const placeHold = async () => {
    const cards = parseWhole(holdCards, 1, 1_000_000);
    if (cards === null) return setError(C.holdQuantityInvalid);
    const hours = parseWhole(holdHours, 1, 168);
    if (hours === null) return setError(C.holdHoursInvalid);
    setBusy(true);
    setError('');
    try {
      await api.post(`/bulk-lots/item/${enc}/holds`, { quantity: cards, hours, ...(holdName.trim() ? { customerName: holdName.trim() } : {}) });
      setHoldCards('');
      setHoldName('');
      setHoldOpen(false);
      showToast(C.holdPlaced, 'success');
      await Promise.all([holdsQuery.refetch(), refreshLot()]);
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  };

  const releaseHold = async (holdId: string) => {
    setBusy(true);
    setError('');
    try {
      await api.post(`/bulk-lots/holds/${encodeURIComponent(holdId)}/release`, {});
      showToast(C.holdReleased, 'success');
      await Promise.all([holdsQuery.refetch(), refreshLot()]);
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  };

  const convertHold = async (holdId: string, method: 'CASH' | 'SQUARE') => {
    setBusy(true);
    setError('');
    try {
      const res = await api.post(`/bulk-lots/holds/${encodeURIComponent(holdId)}/convert`, { method });
      const url = res.data?.data?.paymentUrl;
      if (method === 'SQUARE' && typeof url === 'string' && url) {
        setLinkFor({ holdId, url });
        showToast(C.holdLinkReady, 'success');
      } else {
        showToast(C.holdPaidCash, 'success');
      }
      await Promise.all([holdsQuery.refetch(), salesQuery.refetch(), refreshLot()]);
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      showToast(C.holdLinkCopied, 'success');
    } catch {
      // Clipboard may be blocked; the link stays on screen to copy by hand.
    }
  };

  const reasonSetsCount = adjustReasonSetsCount(reason);
  const sales = salesQuery.data ?? [];
  const holds = holdsQuery.data ?? [];

  return (
    <div className="space-y-4 border-t border-warm-200 pt-3 dark:border-gray-600">
      {/* Adjust */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setAdjustOpen((v) => !v)} disabled={locked} className={secondaryBtn}>
            {C.adjustButton}
          </button>
          <button type="button" onClick={() => setHistoryOpen((v) => !v)} className={secondaryBtn}>
            {historyOpen ? C.historyHide : C.historyShow}
          </button>
        </div>
        {adjustOpen && (
          <div className="space-y-3 rounded-lg border border-warm-200 px-3 py-3 dark:border-gray-600">
            <p className={subHeading}>{C.adjustTitle}</p>
            <p className={muted}>{C.adjustFormHint}</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor={`${baseId}-reason`} className={labelCls}>
                  {C.adjustReasonLabel}
                </label>
                <select id={`${baseId}-reason`} value={reason} disabled={locked} onChange={(e) => setReason(e.target.value as AdjustReason)} onKeyDown={swallowEnter} className={inputCls}>
                  {ADJUST_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {ADJUST_REASON_LABELS[r]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`${baseId}-count`} className={labelCls}>
                  {reasonSetsCount ? C.adjustCountLabelSet : C.adjustCountLabelDelta}
                </label>
                <input id={`${baseId}-count`} type="text" inputMode="numeric" value={countText} disabled={locked} onChange={(e) => setCountText(e.target.value)} onKeyDown={swallowEnter} className={inputCls} />
              </div>
            </div>
            <div>
              <label htmlFor={`${baseId}-note`} className={labelCls}>
                {C.adjustNoteLabel}
              </label>
              <input id={`${baseId}-note`} type="text" value={noteText} placeholder={C.adjustNotePlaceholder} maxLength={500} disabled={locked} onChange={(e) => setNoteText(e.target.value)} onKeyDown={swallowEnter} className={inputCls} />
            </div>
            <p className="text-sm text-warm-800 dark:text-warm-200">
              {C.adjustOnHandLine}: {formatCardCount(lot.remainingCards)}. {C.adjustSoldLine}: {formatCardCount(lot.soldCards)}.
              {afterCount !== null ? ` ${C.adjustAfterLine}: ${formatCardCount(afterCount)}.` : ''}
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={saveAdjust} disabled={locked} className={primaryBtn}>
                {busy ? C.adjustSaving : C.adjustSave}
              </button>
              <button type="button" onClick={() => setAdjustOpen(false)} disabled={busy} className={secondaryBtn}>
                {C.adjustCancel}
              </button>
            </div>
          </div>
        )}
        {historyOpen && (
          <div className="space-y-1">
            <p className={subHeading}>{C.adjustHistoryTitle}</p>
            {historyQuery.isLoading && <p className={muted}>{C.salesRefreshing}</p>}
            {historyQuery.isSuccess && (historyQuery.data ?? []).length === 0 && <p className={muted}>{C.adjustHistoryEmpty}</p>}
            <ul className="space-y-1">
              {(historyQuery.data ?? []).map((row) => (
                <li key={row.id} className="text-sm text-warm-800 dark:text-warm-200">
                  <span>{describeAdjustment(row)}</span>
                  <span className={`${muted} block`}>
                    {row.createdAt ? new Date(row.createdAt).toLocaleString() : ''}
                    {row.note ? `. ${row.note}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Sales and refunds */}
      <div className="space-y-2">
        <p className={subHeading}>{C.refundSalesTitle}</p>
        {salesQuery.isLoading && <p className={muted}>{C.salesRefreshing}</p>}
        {salesQuery.isSuccess && sales.length === 0 && <p className={muted}>{C.refundSalesEmpty}</p>}
        <ul className="space-y-2">
          {sales.map((s) => {
            const facts = { soldCards: s.soldCards, purchaseCents: s.amountCents, returnedCards: s.returnedCards, refundedCents: s.refundedCents };
            const cards = parseWhole(refundText, 1, 1_000_000);
            const preview = refundFor === s.purchaseId && cards !== null ? previewCardRefund(facts, cards) : null;
            return (
              <li key={s.purchaseId} className="rounded-lg border border-warm-200 px-3 py-2 dark:border-gray-600">
                <p className="text-sm text-warm-900 dark:text-warm-100">
                  {formatCardCount(s.soldCards)} cards, {formatDollarsFromCents(s.amountCents)}
                  {s.customer ? `, ${s.customer}` : ''}
                </p>
                <p className={muted}>
                  {C.refundCardsLeftOut}: {formatCardCount(s.outstandingCards)}. {C.refundCardsBack}: {formatCardCount(s.returnedCards)}.
                  {s.outstandingCards === 0 ? ` ${C.refundFullyRefunded}.` : ''}
                </p>
                {s.outstandingCards > 0 && refundFor !== s.purchaseId && (
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => {
                      setRefundFor(s.purchaseId);
                      setRefundText('');
                      setError('');
                    }}
                    className={`${secondaryBtn} mt-2`}
                  >
                    {C.refundButton}
                  </button>
                )}
                {refundFor === s.purchaseId && (
                  <div className="mt-2 space-y-2">
                    <label htmlFor={`${baseId}-refund-${s.purchaseId}`} className={labelCls}>
                      {C.refundCardsLabel}
                    </label>
                    <input id={`${baseId}-refund-${s.purchaseId}`} type="text" inputMode="numeric" value={refundText} disabled={locked} onChange={(e) => setRefundText(e.target.value)} onKeyDown={swallowEnter} className={inputCls} />
                    <div className="flex flex-wrap gap-2">
                      <button type="button" disabled={locked} onClick={() => setRefundText(String(s.outstandingCards))} className={secondaryBtn}>
                        {C.refundAll}
                      </button>
                    </div>
                    {refundText.trim() !== '' && cards === null && <p className="text-sm text-red-700 dark:text-red-300">{C.refundCardsInvalid}</p>}
                    {preview && preview.ok && (
                      <p className="text-sm text-warm-800 dark:text-warm-200">
                        {C.refundPreviewLine}: {formatDollarsFromCents(preview.cents)}
                      </p>
                    )}
                    {preview && !preview.ok && <p className="text-sm text-red-700 dark:text-red-300">{describeFollowupCode(`BULK_REFUND_${preview.code === 'BAD_CARDS' ? 'BAD_CARDS' : preview.code === 'TOO_MANY' ? 'TOO_MANY' : preview.code === 'DONE' ? 'DONE' : 'TOO_SMALL'}`)}</p>}
                    <p className={muted}>{C.refundCashNote}</p>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" disabled={locked || !preview || !preview.ok} onClick={() => cards !== null && doRefund(s, cards)} className={primaryBtn}>
                        {busy ? C.refundWorking : C.refundConfirm}
                      </button>
                      <button type="button" disabled={busy} onClick={() => setRefundFor(null)} className={secondaryBtn}>
                        {C.adjustCancel}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Holds */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className={subHeading}>{C.holdListTitle}</p>
          <button type="button" onClick={() => setHoldOpen((v) => !v)} disabled={locked} className={secondaryBtn}>
            {C.holdButton}
          </button>
        </div>
        {holdOpen && (
          <div className="space-y-3 rounded-lg border border-warm-200 px-3 py-3 dark:border-gray-600">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor={`${baseId}-hold-cards`} className={labelCls}>
                  {C.holdCardsLabel}
                </label>
                <input id={`${baseId}-hold-cards`} type="text" inputMode="numeric" value={holdCards} disabled={locked} onChange={(e) => setHoldCards(e.target.value)} onKeyDown={swallowEnter} className={inputCls} />
              </div>
              <div>
                <label htmlFor={`${baseId}-hold-name`} className={labelCls}>
                  {C.holdNameLabel}
                </label>
                <input id={`${baseId}-hold-name`} type="text" maxLength={120} value={holdName} disabled={locked} onChange={(e) => setHoldName(e.target.value)} onKeyDown={swallowEnter} className={inputCls} />
              </div>
              <div>
                <label htmlFor={`${baseId}-hold-hours`} className={labelCls}>
                  {C.holdHoursLabel} (hours)
                </label>
                <input id={`${baseId}-hold-hours`} type="text" inputMode="numeric" value={holdHours} disabled={locked} onChange={(e) => setHoldHours(e.target.value)} onKeyDown={swallowEnter} className={inputCls} />
              </div>
            </div>
            <button type="button" onClick={placeHold} disabled={locked} className={primaryBtn}>
              {busy ? C.holdPlacing : C.holdPlace}
            </button>
          </div>
        )}
        {holdsQuery.isSuccess && holds.length === 0 && <p className={muted}>{C.holdListEmpty}</p>}
        <ul className="space-y-2">
          {holds.map((h) => (
            <li key={h.id} className="rounded-lg border border-warm-200 px-3 py-2 dark:border-gray-600">
              <p className="text-sm text-warm-900 dark:text-warm-100">
                {h.quantityLabel}{h.customerName ? `, ${h.customerName}` : ''}. {C.holdTotal}: {h.lineLabel}
              </p>
              <p className={muted}>
                {C.holdExpires} {new Date(h.expiresAt).toLocaleString()}
                {h.holdInvoiceId ? `. ${C.holdWithInvoice}` : ''}
              </p>
              {linkFor && linkFor.holdId === h.id && (
                <div className="mt-2 space-y-1">
                  <p className="break-all text-xs text-warm-700 dark:text-warm-300">{linkFor.url}</p>
                  <button type="button" onClick={() => copyLink(linkFor.url)} className={secondaryBtn}>
                    {C.holdCopyLink}
                  </button>
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                {!h.holdInvoiceId && (
                  <>
                    <button type="button" disabled={locked} onClick={() => convertHold(h.id, 'CASH')} className={primaryBtn}>
                      {C.holdSendCash}
                    </button>
                    <button type="button" disabled={locked} onClick={() => convertHold(h.id, 'SQUARE')} className={secondaryBtn}>
                      {C.holdSendInvoice}
                    </button>
                  </>
                )}
                <button type="button" disabled={locked} onClick={() => releaseHold(h.id)} className={secondaryBtn}>
                  {C.holdRelease}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  );
};

export default BulkLotFollowupPanel;
