/**
 * RedateSalePrompt: "This sale's dates have passed. Pick new dates." (2026-10-23)
 *
 * One click moves the sale to next weekend, keeping its length and hours (lib/saleRedate.ts), through
 * POST /sales/:id/redate (only the two dates change). "Pick other dates" lets the page focus its own date
 * fields (edit-sale) or links to edit-sale ?redate=1 (dashboard card).
 * Used by edit-sale (full banner) and FirstSaleNudge (variant="inline", the dashboard card's buttons).
 */
import React, { forwardRef, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarClock } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useToast } from './ToastContext';
import { suggestNextWeekendDates, formatSaleRange, formatSaleDay } from '../lib/saleRedate';

interface RedateSalePromptProps {
  saleId: string;
  startDate: string;
  endDate: string;
  /** Called with the saved dates after a successful one-click re-date. */
  onRedated?: (dates: { startDate: string; endDate: string }) => void;
  /** edit-sale: focus its own date fields. Without it, "Pick other dates" links to edit-sale ?redate=1. */
  onPickOtherDates?: () => void;
  /** "banner" (edit-sale) or "inline" (just the two actions, for the dashboard card). */
  variant?: 'banner' | 'inline';
  className?: string;
}

const primaryClass =
  'inline-flex items-center justify-center w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg px-4 min-h-[44px] text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 disabled:opacity-60 disabled:cursor-not-allowed';
const linkClass = 'inline-flex items-center justify-center min-h-[44px] px-2 text-sm underline text-warm-700 dark:text-warm-300';

const RedateSalePrompt = forwardRef<HTMLButtonElement, RedateSalePromptProps>(function RedateSalePrompt(
  { saleId, startDate, endDate, onRedated, onPickOtherDates, variant = 'banner', className = '' },
  buttonRef,
) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const suggestion = useMemo(() => suggestNextWeekendDates(startDate, endDate), [startDate, endDate]);

  const applySuggestion = async () => {
    setSaving(true);
    try {
      const body = { startDate: suggestion.start.toISOString(), endDate: suggestion.end.toISOString() };
      await api.post(`/sales/${saleId}/redate`, body);
      queryClient.invalidateQueries({ queryKey: ['organizer-sales'] });
      queryClient.invalidateQueries({ queryKey: ['sale', saleId] });
      showToast(`New dates saved: ${formatSaleRange(suggestion.start, suggestion.end)}.`, 'success');
      onRedated?.(body);
    } catch (error: unknown) {
      const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      showToast(msg || "We couldn't save the new dates. Please try again.", 'error');
    } finally {
      setSaving(false);
    }
  };

  const actions = (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 flex-shrink-0">
      <button ref={buttonRef} type="button" onClick={applySuggestion} disabled={saving} className={primaryClass}>
        {saving ? 'Saving…' : `Move to ${formatSaleDay(suggestion.start)}`}
      </button>
      {onPickOtherDates ? (
        <button type="button" onClick={onPickOtherDates} disabled={saving} className={linkClass}>
          Pick other dates
        </button>
      ) : (
        <Link href={`/organizer/edit-sale/${saleId}?redate=1`} className={linkClass}>
          Pick other dates
        </Link>
      )}
    </div>
  );

  if (variant === 'inline') return <div className={className}>{actions}</div>;

  return (
    <div
      role="region"
      aria-label="This sale's dates have passed"
      id="sale-redate-prompt"
      className={`rounded-lg border p-4 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700 ${className}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <CalendarClock className="h-5 w-5 mt-0.5 flex-shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-semibold text-warm-900 dark:text-warm-100">This sale&apos;s dates have passed</p>
            <p className="text-sm text-warm-700 dark:text-warm-300">
              Shoppers can&apos;t find it right now. Move it to next weekend, same hours and length:{' '}
              <span className="font-medium text-warm-900 dark:text-warm-100">{formatSaleRange(suggestion.start, suggestion.end)}</span>.
            </p>
          </div>
        </div>
        {actions}
      </div>
    </div>
  );
});

export default RedateSalePrompt;
