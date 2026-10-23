/**
 * saleRedate: one-click "pick new dates" for a sale whose dates have passed (2026-10-23).
 *
 * suggestNextWeekendDates keeps the sale's length (in calendar days) and its start and end times of day, and
 * moves it to the next weekend: the next upcoming Friday, Saturday or Sunday matching the original start day
 * when the sale started on a weekend day, otherwise the next Saturday. Always starts tomorrow or later.
 * Pure module (no React, no API) so it can be unit tested; the save goes through POST /sales/:id/redate.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addLocalDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

/** True when the sale's end date is in the past. Unknown or invalid dates count as not past. */
export function saleDatesHavePassed(endDate: string | Date | null | undefined, now: Date = new Date()): boolean {
  if (!endDate) return false;
  const t = new Date(endDate).getTime();
  return Number.isFinite(t) && t < now.getTime();
}

export function suggestNextWeekendDates(
  startDate: string | Date,
  endDate: string | Date,
  now: Date = new Date()
): { start: Date; end: Date } {
  let s = new Date(startDate);
  let e = new Date(endDate);
  if (!Number.isFinite(s.getTime())) s = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0);
  if (!Number.isFinite(e.getTime()) || e.getTime() < s.getTime()) e = new Date(s.getTime() + 6 * 60 * 60 * 1000);

  // Calendar days between start and end (0 = one-day sale). Capped so a typo never makes a months-long sale.
  const dayDiff = Math.min(13, Math.max(0, Math.round((startOfLocalDay(e).getTime() - startOfLocalDay(s).getTime()) / DAY_MS)));
  const startDay = s.getDay(); // 0 Sun ... 5 Fri, 6 Sat
  const targetDay = startDay === 5 || startDay === 6 || startDay === 0 ? startDay : 6;

  let day = addLocalDays(startOfLocalDay(now), 1);
  while (day.getDay() !== targetDay) day = addLocalDays(day, 1);

  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), s.getHours(), s.getMinutes());
  const endDay = addLocalDays(day, dayDiff);
  let end = new Date(endDay.getFullYear(), endDay.getMonth(), endDay.getDate(), e.getHours(), e.getMinutes());
  if (end.getTime() <= start.getTime()) end = new Date(start.getTime() + 6 * 60 * 60 * 1000);
  return { start, end };
}

/** "Sat, Nov 1, 9:00 AM" in the viewer's locale. */
export function formatSaleDateTime(d: Date): string {
  return d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** "Sat, Nov 1" in the viewer's locale. */
export function formatSaleDay(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** "Sat, Nov 1, 9:00 AM to Sun, Nov 2, 3:00 PM" (same-day sales show the end time only). */
export function formatSaleRange(start: Date, end: Date): string {
  const sameDay = startOfLocalDay(start).getTime() === startOfLocalDay(end).getTime();
  const endText = sameDay ? end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : formatSaleDateTime(end);
  return `${formatSaleDateTime(start)} to ${endText}`;
}
