/**
 * RateGrid (ADR-140 sections 8.2, 8.3 and 11.3): one table of the bulk rate card, "We sell" or "We pay (cash)".
 *
 * One row per tier with two number fields (Per 1,000 and Per card) in dollars, and a note with an optional rate the shop
 * noted elsewhere and its date. The note belongs to the cell that has a rate (Per 1,000 first). The screen types and shows
 * dollars; the whole grid is saved in one request by BulkRatesTab. Nothing is looked up or filled in from anywhere: a new
 * rate card is blank. On a phone each tier is a stacked card with the same fields.
 */
import React, { useId } from 'react';
import type { BulkRateCell, BulkRateInput } from '../../lib/priceBook';
import {
  DIRECTION_LABELS,
  FINISH_LABELS,
  PRICE_BOOK_COPY,
  PRICE_BOOK_UI,
  TIER_LABELS,
  UNIT_LABELS,
} from '../../lib/priceBookCopy';
import { describeRateGap, formatMoney, parseMoneyToCents } from '../../lib/priceBookRules';
import { dateInputToIso, inputCls, isoToDateInput, labelCls, labelOf } from './ui';

export const TIER_ORDER = ['COMMON', 'UNCOMMON', 'COMMON_UNCOMMON', 'RARE', 'MYTHIC', 'SPECIAL', 'LAND', 'MIXED'] as const;
export const UNITS = ['PER_1000', 'PER_CARD'] as const;

export interface CellDraft {
  /** The rate as typed, in dollars. Empty means no rate for this cell. */
  text: string;
  creditRateCents: number | null;
  noteText: string;
  theirText: string;
  dateText: string;
}

export type GridDraft = Record<string, CellDraft>;

export function cellKey(direction: string, tier: string, finish: string, unit: string): string {
  return `${direction}|${tier}|${finish}|${unit}`;
}

function dollarsText(cents: number | null): string {
  return cents === null ? '' : (cents / 100).toFixed(2);
}

export function emptyCell(): CellDraft {
  return { text: '', creditRateCents: null, noteText: '', theirText: '', dateText: '' };
}

/** The draft the grid starts from: exactly what the server has. */
export function draftFromRates(rates: BulkRateCell[]): GridDraft {
  const out: GridDraft = {};
  rates.forEach((r) => {
    out[cellKey(r.direction, r.tier, r.finish, r.unit)] = {
      text: dollarsText(r.rateCents),
      creditRateCents: r.creditRateCents,
      noteText: r.benchmarkNote || '',
      theirText: dollarsText(r.benchmarkRateCents),
      dateText: isoToDateInput(r.benchmarkAsOf),
    };
  });
  return out;
}

export function originalByKey(rates: BulkRateCell[]): Record<string, BulkRateCell> {
  const out: Record<string, BulkRateCell> = {};
  rates.forEach((r) => {
    out[cellKey(r.direction, r.tier, r.finish, r.unit)] = r;
  });
  return out;
}

/** Which unit carries the note for a row: Per 1,000 when it has a rate, else Per card when it has one, else none. */
export function primaryUnit(draft: GridDraft, direction: string, tier: string, finish: string): string | null {
  for (const unit of UNITS) {
    const c = draft[cellKey(direction, tier, finish, unit)];
    if (c && c.text.trim() !== '') return unit;
  }
  return null;
}

export interface GridProblem {
  key: string;
  message: string;
}

export interface GridSaveRows {
  rows: BulkRateInput[];
  problems: GridProblem[];
  /** Cells that are new, changed or removed compared with the server. */
  changed: number;
  /** Rate changes for the "check that is what you meant" warning, labelled in words. */
  changes: Array<{ label: string; oldCents: number | null; newCents: number | null }>;
}

function cellLabel(direction: string, tier: string, finish: string, unit: string): string {
  return [
    labelOf(DIRECTION_LABELS, direction, direction),
    labelOf(TIER_LABELS, tier, tier),
    labelOf(FINISH_LABELS, finish, finish),
    labelOf(UNIT_LABELS, unit, unit),
  ].join(', ');
}

/** Turns the draft into the rows PUT /bulk-rates takes. A cell cleared by the shop that exists on the server is sent with a null price. */
export function buildSaveRows(draft: GridDraft, original: Record<string, BulkRateCell>): GridSaveRows {
  const rows: BulkRateInput[] = [];
  const problems: GridProblem[] = [];
  const changes: Array<{ label: string; oldCents: number | null; newCents: number | null }> = [];
  let changed = 0;
  const keys = Object.keys(draft);
  Object.keys(original).forEach((k) => {
    if (keys.indexOf(k) < 0) keys.push(k);
  });
  keys.forEach((key) => {
    const [direction, tier, finish, unit] = key.split('|');
    const d = draft[key] || emptyCell();
    const o = Object.prototype.hasOwnProperty.call(original, key) ? original[key] : null;
    const text = d.text.trim();
    if (text === '') {
      if (o) {
        rows.push({ direction, tier, finish, unit, priceCents: null });
        changed += 1;
        changes.push({ label: cellLabel(direction, tier, finish, unit), oldCents: o.rateCents, newCents: null });
      }
      return;
    }
    const cents = parseMoneyToCents(text);
    if (cents === null || cents < 1) {
      problems.push({ key, message: PRICE_BOOK_UI.errorRate(cellLabel(direction, tier, finish, unit)) });
      return;
    }
    const row: BulkRateInput = { direction, tier, finish, unit, priceCents: cents };
    if (d.creditRateCents !== null) row.creditPriceCents = d.creditRateCents;
    const note = d.noteText.trim();
    if (note) row.benchmarkNote = note;
    const theirText = d.theirText.trim();
    if (theirText) {
      const their = parseMoneyToCents(theirText);
      if (their === null || their < 1) {
        problems.push({ key, message: PRICE_BOOK_UI.errorTheirRate(cellLabel(direction, tier, finish, unit)) });
        return;
      }
      row.benchmarkPriceCents = their;
    }
    const dateText = d.dateText.trim();
    if (dateText) {
      const iso = dateInputToIso(dateText);
      if (!iso) {
        problems.push({ key, message: PRICE_BOOK_UI.errorDate });
        return;
      }
      row.benchmarkAsOf = iso;
    }
    rows.push(row);
    if (!o || o.rateCents !== cents) {
      changed += 1;
      changes.push({ label: cellLabel(direction, tier, finish, unit), oldCents: o ? o.rateCents : null, newCents: cents });
    }
  });
  return { rows, problems, changed, changes };
}

/** True when the draft differs from the server in any field the shop can edit. */
export function isGridDirty(draft: GridDraft, original: Record<string, BulkRateCell>): boolean {
  const keys = Object.keys(draft);
  Object.keys(original).forEach((k) => {
    if (keys.indexOf(k) < 0) keys.push(k);
  });
  return keys.some((key) => {
    const d = draft[key] || emptyCell();
    const o = Object.prototype.hasOwnProperty.call(original, key) ? original[key] : null;
    if (!o) return d.text.trim() !== '';
    return (
      d.text.trim() !== dollarsText(o.rateCents) ||
      d.noteText.trim() !== (o.benchmarkNote || '') ||
      d.theirText.trim() !== dollarsText(o.benchmarkRateCents) ||
      d.dateText.trim() !== isoToDateInput(o.benchmarkAsOf)
    );
  });
}

/**
 * Rows and columns of text pasted from a spreadsheet (tab between columns, new line between rows). Null when the text is a
 * single value, so a normal paste into one field is left to the browser.
 */
export function parsePastedGrid(text: string): string[][] | null {
  const rows = text
    .replace(/\r/g, '')
    .split('\n')
    .filter((line, i, all) => line.length > 0 || i < all.length - 1)
    .map((line) => line.split('\t').map((c) => c.trim()));
  while (rows.length > 0 && rows[rows.length - 1].every((c) => c === '')) rows.pop();
  if (rows.length === 0) return null;
  if (rows.length === 1 && rows[0].length === 1) return null;
  return rows;
}

// ---------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------

export interface RateGridProps {
  direction: 'SELL' | 'BUY';
  /** The finish whose rates are shown and edited ("ANY" or one finish). */
  finish: string;
  draft: GridDraft;
  onChange: (key: string, patch: Partial<CellDraft>) => void;
  disabled?: boolean;
  /** The store credit percent of cash, as text such as "120" (shown under the "We pay" table). */
  creditPercentText?: string;
}

const RateGrid: React.FC<RateGridProps> = ({ direction, finish, draft, onChange, disabled, creditPercentText }) => {
  const baseId = useId();
  const heading = direction === 'SELL' ? PRICE_BOOK_COPY.weSellHeading : PRICE_BOOK_COPY.weBuyHeading;
  return (
    <section aria-labelledby={`${baseId}-title`} className="min-w-0 space-y-3">
      <h3 id={`${baseId}-title`} className="text-base font-semibold text-warm-900 dark:text-warm-100">{heading}</h3>
      {direction === 'BUY' && creditPercentText && (
        <p className="text-sm text-warm-600 dark:text-warm-300">{PRICE_BOOK_UI.creditShownAt(creditPercentText)}</p>
      )}
      <ul className="space-y-3">
        {TIER_ORDER.map((tier, tierIndex) => {
          const rowId = `${baseId}-${tier}`;
          const primary = primaryUnit(draft, direction, tier, finish);
          const noteUnit = primary || 'PER_1000';
          const noteKey = cellKey(direction, tier, finish, noteUnit);
          const note = draft[noteKey] || emptyCell();
          const anyFallback = finish !== 'ANY';
          const gap = primary
            ? describeRateGap({
                youCents: parseMoneyToCents(draft[cellKey(direction, tier, finish, primary)]?.text || ''),
                themCents: parseMoneyToCents(note.theirText),
                unit: primary,
                asOf: dateInputToIso(note.dateText),
              })
            : '';
          return (
            <li key={tier} className="min-w-0 rounded-lg border border-warm-200 p-3 dark:border-gray-700">
              <fieldset className="min-w-0 space-y-3" disabled={disabled}>
                <legend className="text-sm font-semibold text-warm-900 dark:text-warm-100">{labelOf(TIER_LABELS, tier, tier)}</legend>
                <div className="grid grid-cols-2 gap-3">
                  {UNITS.map((unit) => {
                    const key = cellKey(direction, tier, finish, unit);
                    const anyCell = anyFallback ? draft[cellKey(direction, tier, 'ANY', unit)] : undefined;
                    const cell = draft[key] || emptyCell();
                    return (
                      <div key={unit}>
                        <label htmlFor={`${rowId}-${unit}`} className={labelCls}>{labelOf(UNIT_LABELS, unit, unit)}</label>
                        <input
                          id={`${rowId}-${unit}`}
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          className={inputCls}
                          value={cell.text}
                          placeholder={anyCell && anyCell.text.trim() !== '' ? anyCell.text : ''}
                          onChange={(e) => onChange(key, { text: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key !== 'Enter') return;
                            e.preventDefault();
                            const next = TIER_ORDER[tierIndex + 1];
                            const target = next ? document.getElementById(`${baseId}-${next}-${unit}`) : null;
                            if (target) target.focus();
                          }}
                          onPaste={(e) => {
                            const grid = parsePastedGrid(e.clipboardData.getData('text'));
                            if (!grid) return;
                            e.preventDefault();
                            const unitIndex = UNITS.indexOf(unit);
                            grid.forEach((cols, r) => {
                              cols.forEach((value, c) => {
                                const t = TIER_ORDER[tierIndex + r];
                                const u = UNITS[unitIndex + c];
                                if (t && u) onChange(cellKey(direction, t, finish, u), { text: value });
                              });
                            });
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
                {anyFallback && primary === null && (draft[cellKey(direction, tier, 'ANY', 'PER_1000')]?.text.trim() || draft[cellKey(direction, tier, 'ANY', 'PER_CARD')]?.text.trim()) && (
                  <p className="text-xs text-warm-500 dark:text-warm-400">{PRICE_BOOK_UI.usesAnyRate}</p>
                )}
                {direction === 'BUY' && primary && (draft[cellKey(direction, tier, finish, primary)]?.creditRateCents ?? null) !== null && (
                  <p className="text-xs text-warm-600 dark:text-warm-300">
                    {PRICE_BOOK_UI.creditRateSet(formatMoney(draft[cellKey(direction, tier, finish, primary)].creditRateCents))}
                  </p>
                )}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="sm:col-span-1">
                    <label htmlFor={`${rowId}-note`} className={labelCls}>{PRICE_BOOK_COPY.noteColumn}</label>
                    <input
                      id={`${rowId}-note`}
                      type="text"
                      maxLength={200}
                      className={inputCls}
                      value={note.noteText}
                      disabled={primary === null}
                      onChange={(e) => onChange(noteKey, { noteText: e.target.value })}
                    />
                  </div>
                  <div>
                    <label htmlFor={`${rowId}-their`} className={labelCls}>{PRICE_BOOK_UI.fieldTheirRate}</label>
                    <input
                      id={`${rowId}-their`}
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      className={inputCls}
                      value={note.theirText}
                      disabled={primary === null}
                      onChange={(e) => onChange(noteKey, { theirText: e.target.value })}
                    />
                  </div>
                  <div>
                    <label htmlFor={`${rowId}-date`} className={labelCls}>{PRICE_BOOK_UI.fieldNotedOn}</label>
                    <input
                      id={`${rowId}-date`}
                      type="date"
                      className={inputCls}
                      value={note.dateText}
                      disabled={primary === null}
                      onChange={(e) => onChange(noteKey, { dateText: e.target.value })}
                    />
                  </div>
                </div>
                {gap && <p className="break-words text-sm text-warm-700 dark:text-warm-300">{gap}</p>}
              </fieldset>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default RateGrid;
