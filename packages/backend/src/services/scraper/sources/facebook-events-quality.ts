/**
 * Facebook Events -- final quality gate (PURE, no network, no DB).
 *
 * Added 2026-10-25 after the manual retest run (GH Actions 40214371129) of the
 * paused FB Events scraper created 225 sales of which:
 *   - ~72 had already ended (start 10-20..10-24, no real end): the search-page
 *     path allowed a 2-day grace on START, and the date-recovery path
 *     (individual event page) had no past check at all;
 *   - ~126 carried the QUERY METRO's city/state (e.g. a Garage Sale in
 *     Effingham IL stored as Elgin IL, a Norwich UK flea market stored as
 *     Coeur d'Alene ID), because FB's events/search is not geo-scoped and every
 *     event without a parseable event_place fell back to the metro.
 *
 * Every item from either discovery path (proxy or SERP) goes through
 * filterFbEventItems() in run-search-facebook-events.ts right before it is
 * POSTed to ingest, so these rules hold regardless of which path produced it.
 */

import type { ScrapedItem } from '../index';

/** Events starting further out than this are dropped (parse error or a
 *  listing far too early to be useful to a shopper). */
export const FB_EVENT_MAX_FUTURE_DAYS = 180;

// Hawaii (UTC-10) is the westernmost US zone we list. "Today" starts at local
// midnight there, so a same-day sale anywhere in the US is never dropped early.
const WESTERNMOST_UTC_OFFSET_MS = 10 * 3_600_000;
const DAY_MS = 86_400_000;

/** Start of "today" (00:00 in UTC-10), expressed as a UTC instant. */
export function startOfTodayCutoff(now: Date = new Date()): Date {
  const shifted = new Date(now.getTime() - WESTERNMOST_UTC_OFFSET_MS);
  const midnightShifted = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate()
  );
  return new Date(midnightShifted + WESTERNMOST_UTC_OFFSET_MS);
}

export type EventWindowRejection =
  | 'invalid-date'
  | 'end-before-start'
  | 'ended-before-today'
  | 'too-far-future';

function toDate(v: unknown): Date | null {
  if (v === null || v === undefined || v === '') return null;
  const d = v instanceof Date ? v : new Date(v as any);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Validate an event's date window. `realEnd` is the event's OWN end time when
 * the source supplied one; pass null when the end was synthesised (start + 1
 * day), in which case the START is what must not be before today.
 * Returns null when the window is acceptable, else the rejection reason.
 */
export function checkEventWindow(
  start: unknown,
  realEnd: unknown,
  now: Date = new Date()
): EventWindowRejection | null {
  const s = toDate(start);
  if (!s) return 'invalid-date';
  // Guard against epoch/zero/garbage timestamps (e.g. ms parsed as seconds).
  if (s.getUTCFullYear() < 2000 || s.getUTCFullYear() > now.getUTCFullYear() + 2) {
    return 'invalid-date';
  }
  let effectiveEnd = s;
  if (realEnd !== null && realEnd !== undefined) {
    const e = toDate(realEnd);
    if (!e) return 'invalid-date';
    if (e.getTime() < s.getTime()) return 'end-before-start';
    effectiveEnd = e;
  }
  if (effectiveEnd.getTime() < startOfTodayCutoff(now).getTime()) return 'ended-before-today';
  if (s.getTime() > now.getTime() + FB_EVENT_MAX_FUTURE_DAYS * DAY_MS) return 'too-far-future';
  return null;
}

/**
 * True when the item's city/state came from the event itself (structured
 * place, its own address, its URL slug, or the event page) -- NOT from the
 * metro we happened to be searching.
 */
export function isLocationConfirmed(item: Pick<ScrapedItem, 'city' | 'state' | 'scrapedMetadata'>): boolean {
  if (!item.city || !item.state) return false;
  const md = item.scrapedMetadata ?? {};
  if (!md.cityStateSource || md.cityStateSource === 'metro-fallback') return false;
  if (md.geoConfidence === 'unresolved' || md.geoConfidence === 'metro-fallback') return false;
  return true;
}

/** Numeric FB event id from sourceItemId ("fb:events:<id>") or the URL. */
export function fbEventKey(item: Pick<ScrapedItem, 'sourceItemId' | 'sourceUrl'>): string {
  const fromItemId = item.sourceItemId?.match(/^fb:events:(\d+)$/);
  if (fromItemId) return fromItemId[1];
  const url = item.sourceUrl || '';
  const idx = url.indexOf('/events/');
  if (idx !== -1) {
    const runs = url.slice(idx).match(/\d{8,}/g);
    if (runs && runs.length > 0) return runs[runs.length - 1];
  }
  return url;
}

export interface FbEventFilterOptions {
  now?: Date;
  /** sourceUrls already stored as Facebook Events sales. These are passed
   *  through untouched: ingest dedupes them by sourceUrl and refreshes
   *  lastScrapedAt, which is the existing behaviour. */
  existingSourceUrls?: Set<string>;
}

export interface FbEventFilterResult {
  kept: ScrapedItem[];
  dropped: Record<string, number>;
}

/**
 * Final gate before ingest:
 *   1. one item per FB event id across ALL metros (a later metro's copy wins
 *      only if it has a confirmed location and the earlier one did not);
 *   2. drop events that ended before today, start > 180 days out, or carry an
 *      invalid date window;
 *   3. drop events whose location could not be confirmed from the event
 *      itself (never publish them under the searched metro).
 */
export function filterFbEventItems(
  items: ScrapedItem[],
  opts: FbEventFilterOptions = {}
): FbEventFilterResult {
  const now = opts.now ?? new Date();
  const existing = opts.existingSourceUrls ?? new Set<string>();
  const dropped: Record<string, number> = {};
  const bump = (reason: string): void => {
    dropped[reason] = (dropped[reason] ?? 0) + 1;
  };

  // 1. Cross-metro dedupe by event id.
  const byKey = new Map<string, ScrapedItem>();
  for (const item of items) {
    const key = fbEventKey(item);
    const prior = byKey.get(key);
    if (!prior) {
      byKey.set(key, item);
      continue;
    }
    bump('duplicate-event-id');
    if (!isLocationConfirmed(prior) && isLocationConfirmed(item)) byKey.set(key, item);
  }

  const kept: ScrapedItem[] = [];
  for (const item of byKey.values()) {
    // Already ingested: ingest skips it by sourceUrl; keep the freshness touch.
    if (item.sourceUrl && existing.has(item.sourceUrl)) {
      kept.push(item);
      continue;
    }
    const md = item.scrapedMetadata ?? {};
    const realEnd = md.endSource === 'event' ? item.endDate : null;
    const windowReject = checkEventWindow(item.startDate, realEnd, now);
    if (windowReject) {
      bump(windowReject);
      continue;
    }
    if (!isLocationConfirmed(item)) {
      bump('location-unconfirmed');
      continue;
    }
    kept.push(item);
  }
  return { kept, dropped };
}
