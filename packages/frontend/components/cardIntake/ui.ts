/**
 * Shared class names and tiny helpers for the card intake screens (ADR-134 #642, batch B8).
 * Every control is at least 44 px tall (rule 7) and every container can shrink (min-w-0) so nothing
 * forces a horizontal page scroll at 375 px.
 */
export const inputCls =
  'w-full min-h-[44px] px-4 py-2 text-base sm:text-sm border border-warm-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-warm-900 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none disabled:opacity-60';
export const labelCls = 'block text-sm font-medium text-warm-700 dark:text-warm-300 mb-1';
export const primaryBtn =
  'inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto';
export const secondaryBtn =
  'inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-warm-100 px-4 py-2 text-sm font-semibold text-warm-900 transition-colors hover:bg-warm-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600 sm:w-auto';
export const cardCls = 'min-w-0 rounded-lg border border-warm-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800';
export const headingCls = 'text-lg font-semibold text-warm-900 dark:text-warm-100';
export const mutedCls = 'text-sm text-warm-600 dark:text-warm-300';
export const noticeInfoCls =
  'rounded-lg border border-warm-200 bg-warm-50 px-3 py-2 text-sm text-warm-700 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-300';
export const noticeWarnCls =
  'rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-100';
export const noticeErrorCls =
  'rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-700 dark:bg-red-900/20 dark:text-red-200';
export const noticeOkCls =
  'rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900 dark:border-green-700 dark:bg-green-900/20 dark:text-green-100';

export function formatBytes(bytes: number): string {
  if (!(bytes >= 0)) return '';
  if (bytes < 1024) return bytes + ' bytes';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
