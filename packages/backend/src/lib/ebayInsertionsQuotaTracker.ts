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
 * RECONCILIATION (2026-09-21, adr-ebay-renewal-forecasting-2026-09-15.md's
 * "ADR Update -- Flagged Question #1 Reopened" section): the FAS-push-only
 * counter above was confirmed to badly undercount real eBay usage for a
 * mature listing base -- it has zero visibility into eBay's own silent GTC
 * (Good-Til-Cancelled) auto-renewals, which dominate real consumption once an
 * organizer has been live a while. Patrick's own eBay Seller Hub screenshot
 * showed 207/250 real insertions used (83%) when this file's own counter +
 * the forward-only renewal projection totaled 32/250 (13%) for the same
 * organizer, same day. reconcileEbayInsertionsUsage() below adds a real,
 * periodic (throttled to 24h) live true-up against eBay's Trading API
 * GetAccount call -- the same proven OAuth/XML pattern already used
 * elsewhere in this codebase (ebayController.ts's GetMyeBaySelling/GetItem/
 * ReviseItem calls) -- and OVERWRITES ebayInsertionsThisMonth when it
 * succeeds, stamping ebayInsertionsReconciledAt. Between successful
 * reconciliations, the FAS-push-only value above remains the fallback
 * estimate -- this file's original counter is not removed, just no longer
 * fully trusted on its own once a real reconciliation is available.
 *
 * DISCLOSED UNCERTAINTY: eBay Trading API GetAccount's exact AccountEntry /
 * AccountDetailEntryCodeType response shape for insertion-fee-credit entries
 * was NOT independently verified against a live eBay response while writing
 * this (no eBay credentials available in this dev/CI environment) -- same
 * limitation already disclosed in ebayListingFeeCheck.ts and
 * ebayStoreSubscriptionService.ts. The parser below is intentionally
 * defensive (keys on the word "insertion" appearing in either the entry's
 * type or description field, case-insensitively, rather than a specific
 * assumed enum value) and logs the full raw AccountEntry list on every call
 * so the real shape can be confirmed from production and the filter
 * tightened later. On any failure or a response that yields zero matched
 * entries where entries clearly exist, this fails closed (leaves the
 * existing value untouched) rather than writing a guessed number.
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
import { ebayProxyUrl, ebayProxyHeaders } from '../services/ebayHttp';

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

// ─── Live reconciliation against eBay's real account data (2026-09-21) ──────

const RECONCILE_THROTTLE_MS = 24 * 60 * 60 * 1000; // once per 24h per organizer

// Local XML helpers -- mirrors the module-scope helpers in ebayController.ts
// (not exported from there, so duplicated here per this codebase's existing
// "avoid circular import" convention, same as ebayListingQueueCron.ts's own
// locally-mirrored eBay proxy helpers).
function xmlVal(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`));
  return m ? m[1].trim() : null;
}
function xmlAll(block: string, tag: string): string[] {
  const results: string[] = [];
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) results.push(m[1]);
  return results;
}

/**
 * True when this organizer's last successful reconciliation is missing or
 * older than RECONCILE_THROTTLE_MS. Callers (ebayListingSyncCron.ts) use this
 * to decide whether to piggyback a reconciliation call onto an eBay call
 * they're already making for that organizer this cycle.
 */
export function isEbayInsertionsReconciliationStale(reconciledAt: Date | null): boolean {
  if (!reconciledAt) return true;
  return Date.now() - reconciledAt.getTime() > RECONCILE_THROTTLE_MS;
}

/**
 * Live reconciliation: calls eBay's Trading API GetAccount for the current
 * Pacific-month billing period and, on a successful/parseable response,
 * OVERWRITES ebayInsertionsThisMonth with the real count and stamps
 * ebayInsertionsReconciledAt = now. Never throws -- any failure just leaves
 * the existing (FAS-push-only estimate) value untouched, matching the same
 * fail-safe posture as fetchAndCacheEbayStoreSubscription() in
 * ebayStoreSubscriptionService.ts. Call this at most once per
 * RECONCILE_THROTTLE_MS per organizer -- callers should check
 * isEbayInsertionsReconciliationStale() first.
 *
 * See this file's header comment for the disclosed uncertainty around the
 * exact response shape -- the parser here is intentionally defensive.
 */
export async function reconcileEbayInsertionsUsage(
  organizerId: string,
  accessToken: string
): Promise<{ reconciled: boolean; count?: number; reason?: string }> {
  try {
    const monthStart = getMonthStart();
    const nextMonthStart = getNextMonthStart();

    // eBay Trading API GetAccount -- NOT independently verified against a
    // live response this session (see header comment). BetweenSpecifiedDates
    // + explicit Begin/EndDate scopes this to exactly the current billing
    // period, matching what the Seller Hub's own "Used/Left" widget shows.
    const requestXml =
      `<?xml version="1.0" encoding="utf-8"?>` +
      `<GetAccountRequest xmlns="urn:ebay:apis:eBLBaseComponents">` +
      `<RequesterCredentials></RequesterCredentials>` +
      `<AccountHistorySelection>BetweenSpecifiedDates</AccountHistorySelection>` +
      `<BeginDate>${monthStart.toISOString()}</BeginDate>` +
      `<EndDate>${nextMonthStart.toISOString()}</EndDate>` +
      `<ExcludeBalance>true</ExcludeBalance>` +
      `<ErrorLanguage>en_US</ErrorLanguage>` +
      `</GetAccountRequest>`;

    const resp = await fetch(ebayProxyUrl('/ws/api.dll'), {
      method: 'POST',
      headers: {
        'X-EBAY-API-CALL-NAME': 'GetAccount',
        'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
        'X-EBAY-API-APP-NAME': process.env.EBAY_CLIENT_ID || '',
        'X-EBAY-API-IAF-TOKEN': accessToken,
        'Content-Type': 'text/xml',
        ...ebayProxyHeaders(),
      },
      body: requestXml,
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      console.warn(
        `[eBay Insertions Reconcile] organizer ${organizerId}: HTTP ${resp.status} -- leaving cached value unchanged. Body: ${errText.slice(0, 300)}`
      );
      return { reconciled: false, reason: `HTTP ${resp.status}` };
    }

    const text = await resp.text();
    const ack = xmlVal(text, 'Ack');
    if (ack !== 'Success' && ack !== 'Warning') {
      const errMsg = xmlVal(text, 'LongMessage') || xmlVal(text, 'ShortMessage') || 'Unknown error';
      console.warn(
        `[eBay Insertions Reconcile] organizer ${organizerId}: GetAccount Ack=${ack} -- ${errMsg}. Leaving cached value unchanged.`
      );
      return { reconciled: false, reason: errMsg };
    }

    const entries = xmlAll(text, 'AccountEntry');

    // TEMPORARY (remove once the real shape is confirmed from production,
    // per this file's header comment): log every entry's raw XML so the
    // actual field names/values can be inspected directly.
    console.log(
      `[eBay Insertions Reconcile] organizer ${organizerId}: GetAccount returned ${entries.length} AccountEntry row(s), raw dump follows for shape confirmation:`
    );
    for (const entry of entries) {
      console.log(`[eBay Insertions Reconcile]   entry: ${entry.slice(0, 500)}`);
    }

    if (entries.length === 0) {
      // A genuine 200/Success with zero entries is plausible (no account
      // activity yet this period) -- but with no entries to reconcile
      // against, there is nothing to confidently overwrite with. Fail closed
      // rather than writing 0 over a possibly-nonzero existing estimate.
      console.warn(
        `[eBay Insertions Reconcile] organizer ${organizerId}: GetAccount returned zero AccountEntry rows -- leaving cached value unchanged (ambiguous: could be genuinely zero activity, or a response-shape mismatch).`
      );
      return { reconciled: false, reason: 'zero AccountEntry rows returned' };
    }

    // Defensive filter: count entries whose type or description mentions
    // "insertion" case-insensitively, rather than keying on one assumed
    // AccountDetailEntryCodeType enum value (not confirmed live -- see
    // header). Each matching entry is treated as one insertion-consuming
    // event within the period.
    let insertionCount = 0;
    for (const entry of entries) {
      const type = xmlVal(entry, 'AccountDetailsEntryType') ?? '';
      const description = xmlVal(entry, 'Description') ?? '';
      if (/insertion/i.test(type) || /insertion/i.test(description)) {
        insertionCount++;
      }
    }

    console.log(
      `[eBay Insertions Reconcile] organizer ${organizerId}: matched ${insertionCount} insertion-related entries of ${entries.length} total -- writing as reconciled ebayInsertionsThisMonth.`
    );

    await prisma.organizer.update({
      where: { id: organizerId },
      data: {
        ebayInsertionsThisMonth: insertionCount,
        ebayInsertionsResetAt: monthStart,
        ebayInsertionsReconciledAt: new Date(),
      },
    });

    return { reconciled: true, count: insertionCount };
  } catch (error) {
    console.error(`[eBay Insertions Reconcile] organizer ${organizerId}: unexpected error, leaving cached value unchanged:`, error);
    return { reconciled: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
