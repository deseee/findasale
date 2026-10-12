/**
 * Shared class names for the Scan cards screens (ADR-138 batch B7).
 * The base classes are the card intake ones, so both screens look and feel the same. Every control is at least 44 px tall
 * and every container can shrink (min-w-0) so nothing forces a horizontal page scroll at 375 px.
 */
export {
  inputCls,
  labelCls,
  primaryBtn,
  secondaryBtn,
  cardCls,
  headingCls,
  mutedCls,
  noticeInfoCls,
  noticeWarnCls,
  noticeErrorCls,
  noticeOkCls,
} from '../cardIntake/ui';

/** A tappable choice (condition, finish). `suggested` gives the dashed look used for a suggestion the seller has not accepted. */
export function chipClass(selected: boolean, suggested = false): string {
  const base =
    'inline-flex min-h-[44px] items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50';
  if (selected) return `${base} border-amber-700 bg-amber-700 text-white`;
  if (suggested) return `${base} border-dashed border-amber-600 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-100`;
  return `${base} border-warm-300 bg-white text-warm-800 hover:border-amber-400 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100`;
}

export const smallBtn =
  'inline-flex min-h-[44px] items-center justify-center rounded-lg border border-warm-300 bg-white px-3 py-2 text-sm font-medium text-warm-800 transition-colors hover:border-amber-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100';

export const pillBase = 'inline-block rounded-full px-2 py-0.5 text-xs font-semibold';
