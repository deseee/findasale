/**
 * ebayInsertionsQuotaTracker.ts — Monthly eBay free-insertion counter (ADR-115)
 *
 * OBSERVABILITY ONLY. This does NOT gate whether ebayListingQueueCron.ts or a
 * manual eBay push publishes an item -- that gate is the live per-item
 * getListingFees check (eBay's own account state, checked at publish time).
 * This counter exists purely so the organizer dashboard can show "you've used
 * ~N of your free eBay listings this month" without an extra eBay API call on
 * every page load.
 *
 * getEbayInsertionsUsed() got its first real caller in ADR ebay-renewal-
 * forecasting (2026-09-15): GET /api/organizers/me/ebay-insertions-forecast
 * (ebayInsertionsForecast.ts) combines this "actual used" half with the new
 * Item.ebayNextRenewalAt "projected additional" half. getMonthStart()/
 * getNextMonthStart() below are exported so that endpoint and the new
 * ebayRenewalForecastCron.ts reuse this file's own month-boundary logic
 * instead of reinventing it.
 *
 * Lazy-reset pattern copied from the working aiTagsQuotaTracker.ts (that one
 * is confirmed correct and in production use). Do NOT copy the OLDER
 * ebayPushesThisMonth/ebayPushesResetAt pattern in ebayController.ts --
 * that one was found during the ADR-115 review to never actually reset
 * (no code anywhere checks ebayPushesResetAt against the current month).
 *
 * TIMEZONE FIX (2026-09-20, Patrick-reported dashboard/eBay mismatch):
 * getMonthStart()/getNextMonthStart() previously used plain Date.UTC(...) for
 * midnight on the 1st. Patrick's own eBay account screenshot (reviewed this
 * session) shows eBay's free-listing period boundary as "12:00am PDT" --
 * eBay's Seller Hub standardizes on Pacific Time for this reset, not UTC and
 * not the seller's own local time (Patrick's business is in Michigan/Eastern,
 * so a PDT label confirms this is eBay's own server-side convention). Plain
 * UTC midnight is 7-8 hours off from eBay's real boundary, and Pacific's UTC
 * offset itself changes between PDT (-7) and PST (-8) with DST, so a fixed
 * hour shim would itself be wrong across the DST transition. Below computes
 * the boundary using Node's built-in Intl.DateTimeFormat against
 * 'America/Los_Angeles' -- no date-fns/luxon/dayjs/moment is installed in
 * packages/backend (checked this session), and none is needed for this.
 */

import { prisma } from './prisma';

const PACIFIC_TZ = 'America/Los_Angeles';

// Which Pacific calendar year/month a given instant falls in -- NOT the same
// as the instant's UTC year/month near a month boundary (e.g. Oct 1 02:00 UTC
// is still Sep 30 evening in Pacific).
function getPacificYearMonth(instant: Date): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PACIFIC_TZ,
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(instant);
  const year = parseInt(parts.find((p) => p.type === 'year')?.value ?? '', 10);
  const month = parseInt(parts.find((p) => p.type === 'month')?.value ?? '', 10);
  return { year, month };
}

// UTC instant corresponding to local midnight (00:00:00) on the 1st of the
// given Pacific-Time year/month (month is 1-indexed, human convention).
// DST-safe: looks up the actual UTC offset in effect at that specific date
// rather than assuming a fixed -7 or -8 hour shift.
function pacificMonthStartUtc(year: number, month1Indexed: number): Date {
  // Noon UTC on the 1st is always still the 1st in Pacific (Pacific is never
  // more than 8 hours behind UTC), so this is a safe instant to probe the
  // offset that applies on this calendar date.
  const noonGuessUtc = new Date(Date.UTC(year, month1Indexed - 1, 1, 12, 0, 0));
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PACIFIC_TZ,
    timeZoneName: 'longOffset',
  }).formatToParts(noonGuessUtc);
  const offsetPart = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT-08:00';
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(offsetPart);
  const sign = match?.[1] === '-' ? -1 : 1;
  const offsetHours = match ? parseInt(match[2], 10) : 8;
  const offsetMinutes = match ? parseInt(match[3], 10) : 0;
  const totalOffsetMinutes = sign * (offsetHours * 60 + offsetMinutes); // e.g. -420 for PDT (-7:00)

  // local = UTC + offset  =>  UTC = local - offset. Desired local is midnight.
  const utcMillis =
    Date.UTC(year, month1Indexed - 1, 1, 0, 0, 0) - totalOffsetMinutes * 60000;
  return new Date(utcMillis);
}

export function getMonthStart(): Date {
  const { year, month } = getPacificYearMonth(new Date());
  return pacificMonthStartUtc(year, month);
}

/**
 * ADR ebay-renewal-forecasting (2026-09-15): the next calendar-month boundary
 * in Pacific Time (matching eBay's own reset boundary -- see the TIMEZONE FIX
 * comment above), used as the organizer-facing "resets [date]" value and as
 * the upper bound for counting projected GTC renewals before that reset.
 * Exported alongside getMonthStart() so the forecast endpoint/cron reuse this
 * file's existing month-boundary logic rather than reinventing month-math
 * elsewhere.
 */
export function getNextMonthStart(): Date {
  const { year, month } = getPacificYearMonth(new Date());
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return pacificMonthStartUtc(nextYear, nextMonth);
}

/**
 * Increment the free-insertion counter for an organizer, resetting it first
 * if the stored reset timestamp is from a previous calendar month.
 * Call this AFTER a successful $0 eBay publish (queue cron or manual push).
 */
export async function recordFreeEbayInsertion(organizerId: string): Promise<void> {
  const monthStart = getMonthStart();

  const organizer = await prisma.organizer.findUnique({
    where: { id: organizerId },
    select: { ebayInsertionsResetAt: true },
  });

  if (!organizer) {
    console.warn(`[eBay Insertions Quota] Organizer ${organizerId} not found — skipping increment`);
    return;
  }

  const dbResetAt = organizer.ebayInsertionsResetAt ? new Date(organizer.ebayInsertionsResetAt) : null;
  const isStale = !dbResetAt || dbResetAt < monthStart;

  await prisma.organizer.update({
    where: { id: organizerId },
    data: isStale
      ? { ebayInsertionsThisMonth: 1, ebayInsertionsResetAt: monthStart }
      : { ebayInsertionsThisMonth: { increment: 1 } },
  });
}

/**
 * Read the current (lazily-reset) count for dashboard display. Does not
 * increment anything; resets in DB if the stored value is stale so the
 * number shown is never wrong across a month boundary.
 */
export async function getEbayInsertionsUsed(organizerId: string): Promise<number> {
  const monthStart = getMonthStart();

  const organizer = await prisma.organizer.findUnique({
    where: { id: organizerId },
    select: { ebayInsertionsThisMonth: true, ebayInsertionsResetAt: true },
  });

  if (!organizer) return 0;

  const dbResetAt = organizer.ebayInsertionsResetAt ? new Date(organizer.ebayInsertionsResetAt) : null;
  if (!dbResetAt || dbResetAt < monthStart) {
    await prisma.organizer.update({
      where: { id: organizerId },
      data: { ebayInsertionsThisMonth: 0, ebayInsertionsResetAt: monthStart },
    });
    return 0;
  }

  return organizer.ebayInsertionsThisMonth || 0;
}
