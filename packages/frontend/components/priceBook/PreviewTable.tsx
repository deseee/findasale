/**
 * PreviewTable (ADR-140 section 11.5): the rows of a repricing preview. Card runs show card, old price, new price, change,
 * source and a "Why this price" button, with a checkbox on every row that will change. Lot runs show lot, current per 1,000
 * and rate card per 1,000. Each row is a small card with labelled facts (two columns on a phone, four from the small
 * breakpoint up), so the "Why this price" text has the full row width. Rows that need a look are unticked by the server;
 * the shop ticks them by hand. Nothing here changes a price.
 */
import React from 'react';
import type { PriceBookResultBlock, PriceBookRunItem } from '../../lib/priceBook';
import { PRICE_BOOK_UI, WARNING_WORDING, lookupWord, reviewReasonText, sourceLabel, warningText } from '../../lib/priceBookCopy';
import { formatChangePercent, formatMoney, runItemStatusText } from '../../lib/priceBookRules';
import WhyThisPrice from './WhyThisPrice';
import { checkboxCls, dollarsToCents, mutedCls } from './ui';

export type RunKindName = 'BULK' | 'LOT';

export interface PreviewTableProps {
  kind: RunKindName;
  rows: PriceBookRunItem[];
  /** Ticks the shop made that the server has not confirmed yet. They win over the row's own selected flag. */
  overrides: Record<string, boolean>;
  /** False once the run is applied: the checkboxes become plain text. */
  editable: boolean;
  busy: boolean;
  onToggle: (row: PriceBookRunItem, selected: boolean) => void;
}

/** A price the server sent in dollars as "$2.25". Empty when there is none. */
export function priceText(dollars: number | null | undefined): string {
  return formatMoney(dollarsToCents(dollars));
}

export function isTickable(row: Pick<PriceBookRunItem, 'state'>): boolean {
  return row.state === 'PENDING';
}

export function isTicked(row: Pick<PriceBookRunItem, 'id' | 'selected'>, overrides: Record<string, boolean>): boolean {
  return Object.prototype.hasOwnProperty.call(overrides, row.id) ? overrides[row.id] : row.selected;
}

/** The run row as a suggestion block, so "Why this price" shows it the way the editor does. Only fields from the row are used. */
export function whyBlockFor(row: PriceBookRunItem): PriceBookResultBlock {
  const priceCents = dollarsToCents(row.newPrice);
  return {
    ok: priceCents !== null,
    priceCents,
    priceSource: row.priceSource ? (row.priceSource as PriceBookResultBlock['priceSource']) : null,
    why: row.why,
    review: { required: row.reviewReasons.length > 0, reasons: row.reviewReasons.slice(), movePercent: row.changePercent },
    warnings: row.warnings.map((w) => ({ code: w, message: lookupWord(WARNING_WORDING, w, '') ? '' : w })),
  };
}

/** The "needs a look" lines of a row, in plain words. */
export function lookNotes(row: PriceBookRunItem): string[] {
  const out: string[] = [];
  row.reviewReasons.forEach((r) => {
    const t = reviewReasonText(r, row.changePercent);
    if (t && out.indexOf(t) < 0) out.push(t);
  });
  row.warnings.forEach((w) => {
    const t = warningText(w, lookupWord(WARNING_WORDING, w, '') ? '' : w);
    if (t && out.indexOf(t) < 0) out.push(t);
  });
  return out;
}

const PreviewTable: React.FC<PreviewTableProps> = ({ kind, rows, overrides, editable, busy, onToggle }) => {
  if (rows.length === 0) return null;
  const isLot = kind === 'LOT';
  const dt = 'text-xs font-semibold uppercase tracking-wide text-warm-500 dark:text-warm-400';
  const dd = 'break-words text-sm text-warm-800 dark:text-warm-200';

  const tick = (row: PriceBookRunItem): React.ReactNode => {
    if (!editable || !isTickable(row)) return null;
    return (
      <input
        type="checkbox"
        className={checkboxCls}
        checked={isTicked(row, overrides)}
        disabled={busy}
        aria-label={PRICE_BOOK_UI.tickRow(row.title)}
        onChange={(e) => onToggle(row, e.target.checked)}
      />
    );
  };

  return (
    <ul className="min-w-0 space-y-2" aria-label={PRICE_BOOK_UI.previewTableCaption}>
      {rows.map((row) => {
        const notes = lookNotes(row);
        const status = isTickable(row) ? '' : runItemStatusText(row);
        const source = isLot ? status : sourceLabel(row.priceSource);
        return (
          <li key={row.id} className="min-w-0 rounded-lg border border-warm-200 p-3 dark:border-gray-700">
            <div className="flex items-start gap-2">
              <span className="inline-flex min-h-[44px] min-w-[44px] flex-shrink-0 items-center justify-center">{tick(row)}</span>
              <div className="min-w-0 flex-1 space-y-2">
                <p className="break-words text-sm font-semibold text-warm-900 dark:text-warm-100">{row.title}</p>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
                  <div className="min-w-0">
                    <dt className={dt}>{isLot ? PRICE_BOOK_UI.colCurrentPer1000 : PRICE_BOOK_UI.colBefore}</dt>
                    <dd className={dd}>{priceText(row.oldPrice)}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className={dt}>{isLot ? PRICE_BOOK_UI.colRateCardPer1000 : PRICE_BOOK_UI.colAfter}</dt>
                    <dd className={dd}>{priceText(row.newPrice)}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className={dt}>{PRICE_BOOK_UI.colChange}</dt>
                    <dd className={dd}>{formatChangePercent(row.changePercent)}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className={dt}>{isLot ? PRICE_BOOK_UI.colStatus : PRICE_BOOK_UI.colSource}</dt>
                    <dd className={dd}>{source}</dd>
                  </div>
                </dl>
                {!isLot && status && <p className={mutedCls}>{status}</p>}
                {notes.map((n) => (
                  <p key={n} className="break-words text-xs text-amber-800 dark:text-amber-200">{n}</p>
                ))}
                {!isLot && row.newPrice !== null && <WhyThisPrice block={whyBlockFor(row)} />}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
};

export default PreviewTable;
