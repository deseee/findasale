/**
 * Shared class names and small pure helpers for the Price Book screens (ADR-140 batch B7).
 *
 * No React here and no pricing arithmetic: only layout classes, option lists, list moves and date helpers. Every control is at
 * least 44 px tall and every container can shrink (min-w-0) so nothing forces a horizontal page scroll at 375 px. The class
 * names are the ones the card intake screens already use, so the Price Book looks like the rest of the organizer area.
 */
import type { PriceBookRule, PriceBookRuleInput, PriceBookRunSummary, VocabEntry } from '../../lib/priceBook';

export {
  cardCls,
  headingCls,
  inputCls,
  labelCls,
  mutedCls,
  noticeErrorCls,
  noticeInfoCls,
  noticeOkCls,
  noticeWarnCls,
  primaryBtn,
  secondaryBtn,
} from '../cardIntake/ui';

export const dangerBtn =
  'inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto';
/** A compact secondary button that still keeps the 44 px touch target. */
export const smallBtn =
  'inline-flex min-h-[44px] items-center justify-center rounded-lg border border-warm-300 bg-white px-3 py-2 text-sm font-medium text-warm-800 transition-colors hover:border-amber-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100';
export const checkboxCls = 'h-5 w-5 flex-shrink-0 rounded border-warm-300 text-amber-600 focus:ring-2 focus:ring-amber-500 dark:border-gray-600';
export const linkBtn =
  'inline-flex min-h-[44px] items-center text-sm font-medium text-amber-700 underline focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:text-amber-400';
export const sectionCls = 'min-w-0 space-y-3 rounded-lg border border-warm-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800';
export const subHeadingCls = 'text-base font-semibold text-warm-900 dark:text-warm-100';

/** Panel classes for the side drawer, passed to AccessibleModal (the existing modal wrapper). */
export const drawerOverlayCls = 'fixed inset-0 z-50 flex justify-end bg-black bg-opacity-50';
export const drawerContentCls =
  'h-full w-full max-w-md overflow-y-auto bg-white p-4 shadow-xl dark:bg-gray-800 sm:p-6';
/** Panel classes for a centered dialog that can be taller than a phone screen. */
export const dialogContentCls =
  'w-full max-w-lg max-h-full overflow-y-auto rounded-lg bg-white p-4 shadow-xl dark:bg-gray-800 sm:p-6';

// ---------------------------------------------------------------------------
// Option lists
// ---------------------------------------------------------------------------

/**
 * The choices for a dropdown or checkbox list. The server list (GET /status vocabulary or the card vocabulary) wins when it
 * has entries; otherwise the fallback table's own keys are used. A label from the copy table wins over the server's label,
 * so the same code reads the same way on every screen.
 */
export function optionsFrom(
  server: ReadonlyArray<VocabEntry> | undefined | null,
  table: Record<string, string>,
  skip: ReadonlyArray<string> = []
): VocabEntry[] {
  const out: VocabEntry[] = [];
  const seen: Record<string, boolean> = {};
  const add = (code: string, serverLabel: string): void => {
    if (!code || seen[code] || skip.indexOf(code) >= 0) return;
    seen[code] = true;
    const own = Object.prototype.hasOwnProperty.call(table, code) ? table[code] : '';
    out.push({ code, label: own || serverLabel || code });
  };
  if (server && server.length > 0) server.forEach((e) => add(e.code, e.label));
  else Object.keys(table).forEach((code) => add(code, table[code]));
  return out;
}

export function labelOf(table: Record<string, string>, code: string | null | undefined, fallback = ''): string {
  return typeof code === 'string' && Object.prototype.hasOwnProperty.call(table, code) ? table[code] : fallback;
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

/** A stored rule as the body the editor sends back: everything the server lets the shop change. */
export function ruleToInput(rule: PriceBookRule, patch: Partial<PriceBookRuleInput> = {}): PriceBookRuleInput {
  return {
    family: rule.family,
    name: rule.name,
    enabled: rule.enabled,
    game: rule.game,
    setCode: rule.setCode,
    rarityClass: rule.rarityClass,
    rarityText: rule.rarityText,
    finish: rule.finish,
    language: rule.language,
    variantToken: rule.variantToken,
    refMinCents: rule.refMinCents,
    refMaxCents: rule.refMaxCents,
    sourceKinds: rule.sourceKinds.slice(),
    basis: rule.basis,
    percentBps: rule.percentBps,
    addCents: rule.addCents,
    fixedCents: rule.fixedCents,
    floorCents: rule.floorCents,
    ceilingCents: rule.ceilingCents,
    minMarginBps: rule.minMarginBps,
    roundingMode: rule.roundingMode,
    roundingDirection: rule.roundingDirection,
    creditBps: rule.creditBps,
    minOfferCents: rule.minOfferCents,
    ...patch,
  };
}

/** The ids with one id moved one place up or down. The same array comes back when the move is not possible. */
export function moveId(ids: ReadonlyArray<string>, id: string, direction: 'up' | 'down'): string[] {
  const list = ids.slice();
  const at = list.indexOf(id);
  if (at < 0) return list;
  const to = direction === 'up' ? at - 1 : at + 1;
  if (to < 0 || to >= list.length) return list;
  list[at] = list[to];
  list[to] = id;
  return list;
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

/** "2026-10-12" from a date field to the ISO time the server reads. Anything that is not a date gives null. */
export function dateInputToIso(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10), 12, 0, 0));
  if (Number.isNaN(d.getTime()) || d.getUTCMonth() !== parseInt(m[2], 10) - 1) return null;
  return d.toISOString();
}

/** The ISO time from the server as the value of a date field ("2026-10-12"). Empty when unreadable. */
export function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

/** True when the date is more than `days` whole days before `now`. A missing or unreadable date is not old. */
export function isOlderThanDays(iso: string | null | undefined, days: number, now: Date): boolean {
  if (!iso || !(days > 0)) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return now.getTime() - d.getTime() > days * DAY_MS;
}

/** Whether "Undo these changes" is offered for a past run: applied (all or partly) and still inside the undo window. */
export function isUndoAllowed(run: Pick<PriceBookRunSummary, 'status' | 'createdAt'>, now: Date, undoDays: number): boolean {
  if (run.status !== 'APPLIED' && run.status !== 'PARTIAL') return false;
  const days = undoDays > 0 ? undoDays : 7;
  return !isOlderThanDays(run.createdAt, days, now);
}

/** A whole number from a text field, or null (no sign, no decimals, digits only). */
export function parseWholeNumber(input: string, min: number, max: number): number | null {
  const t = input.trim();
  if (!/^\d{1,9}$/.test(t)) return null;
  const n = parseInt(t, 10);
  return n >= min && n <= max ? n : null;
}

/** A signed percent such as "-10" or "25.5" from the "Move all rates" field. At most two decimals. */
export function parseSignedPercent(input: string): number | null {
  const t = input.trim().replace(/%$/, '').trim();
  if (!/^-?\d{1,4}(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Dollars from the server as whole cents for display (a price the server sent as a dollar amount). */
export function dollarsToCents(dollars: number | null | undefined): number | null {
  return typeof dollars === 'number' && Number.isFinite(dollars) ? Math.round(dollars * 100) : null;
}

// ---------------------------------------------------------------------------
// Tabs (the page reads and writes ?tab=)
// ---------------------------------------------------------------------------

export type TabKey = 'prices' | 'bulk' | 'cards' | 'changes';
export const TAB_KEYS: ReadonlyArray<TabKey> = ['prices', 'bulk', 'cards', 'changes'];

/** The tab named in the URL, or the first tab when the name is missing or not one of ours. */
export function readTab(value: string | string[] | undefined): TabKey {
  const v = Array.isArray(value) ? value[0] : value;
  return TAB_KEYS.find((k) => k === v) || 'prices';
}
