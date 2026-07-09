/**
 * FindA.Sale - City page live-data helpers
 *
 * Turns the sales array from /sales/by-city and the activeByType breakdown
 * from /sales/city-slugs into on-page inventory stats and data-driven FAQ
 * entries. Used by the four type-city landing page families:
 *   /estate-sales/[city-slug], /yard-sales/[city-slug],
 *   /auctions/[city-slug], /flea-markets/[city-slug]
 *
 * Rule: every number shown to shoppers or search engines comes from real
 * listing data fetched at build/revalidate time. Nothing is fabricated.
 * When a count is zero the copy says so plainly instead of inventing one.
 */

import type { FaqItem } from './cityData';

export interface SaleDateRange {
  startDate: string;
  endDate: string;
}

export interface CitySaleStats {
  /** Listings returned for this city and sale type (API caps at 50) */
  total: number;
  /** Sales whose date range includes right now (build/revalidate time) */
  liveNow: number;
  /** Sales overlapping the current or upcoming Friday-to-Sunday window */
  thisWeekend: number;
  /** Human label for that weekend window, e.g. "Jul 4 to Jul 6" */
  weekendLabel: string;
}

/** Sale-type enum value to display labels and destination URL per city. */
export const SALE_TYPE_PAGES: Record<
  string,
  { label: string; singular: string; href: (citySlug: string) => string }
> = {
  ESTATE: {
    label: 'Estate Sales',
    singular: 'estate sale',
    href: (citySlug) => `/estate-sales/${citySlug}`,
  },
  YARD: {
    label: 'Yard Sales',
    singular: 'yard sale',
    href: (citySlug) => `/yard-sales/${citySlug}`,
  },
  AUCTION: {
    label: 'Auctions',
    singular: 'auction',
    href: (citySlug) => `/auctions/${citySlug}`,
  },
  FLEA_MARKET: {
    label: 'Flea Markets',
    singular: 'flea market',
    href: (citySlug) => `/flea-markets/${citySlug}`,
  },
  RETAIL: {
    label: 'Resale Listings',
    singular: 'resale listing',
    href: (citySlug) => `/city/${citySlug}/resale`,
  },
};

/**
 * Friday 00:00 through Sunday 23:59:59 of the current week when we are
 * already inside that window, otherwise the upcoming weekend.
 */
function getWeekendWindow(now: Date): { start: Date; end: Date } {
  const day = now.getDay(); // 0 Sun ... 5 Fri, 6 Sat
  const friday = new Date(now);
  if (day === 0) {
    friday.setDate(now.getDate() - 2);
  } else if (day === 6) {
    friday.setDate(now.getDate() - 1);
  } else {
    friday.setDate(now.getDate() + (5 - day));
  }
  friday.setHours(0, 0, 0, 0);
  const sunday = new Date(friday);
  sunday.setDate(friday.getDate() + 2);
  sunday.setHours(23, 59, 59, 999);
  return { start: friday, end: sunday };
}

/** Computes live/weekend/total counts from the fetched sales array. */
export function computeSaleStats(
  sales: SaleDateRange[],
  now: Date = new Date()
): CitySaleStats {
  const { start: weekendStart, end: weekendEnd } = getWeekendWindow(now);

  let liveNow = 0;
  let thisWeekend = 0;
  for (const sale of sales) {
    const start = new Date(sale.startDate);
    const end = new Date(sale.endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    if (start <= now && now <= end) liveNow += 1;
    if (start <= weekendEnd && end >= weekendStart) thisWeekend += 1;
  }

  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return {
    total: sales.length,
    liveNow,
    thisWeekend,
    weekendLabel: `${fmt(weekendStart)} to ${fmt(weekendEnd)}`,
  };
}

function joinWithAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

export interface LiveFaqParams {
  cityName: string;
  stateCode: string;
  /** e.g. "estate sale" */
  typeSingular: string;
  /** e.g. "estate sales" */
  typePlural: string;
  /** Sale-type enum key for this page, e.g. "ESTATE" */
  currentTypeKey: string;
  stats: CitySaleStats;
  /** Active listing counts per sale type from /sales/city-slugs */
  activeByType: Record<string, number>;
}

/**
 * Builds FAQ entries answered from live listing data. These render on the
 * page and feed the FAQPage JSON-LD, so answers must always match what the
 * page actually shows.
 */
export function buildLiveDataFaqs(params: LiveFaqParams): FaqItem[] {
  const {
    cityName,
    stateCode,
    typeSingular,
    typePlural,
    currentTypeKey,
    stats,
    activeByType,
  } = params;
  const faqs: FaqItem[] = [];

  const countAnswer =
    stats.total > 0
      ? `FindA.Sale currently lists ${stats.total} ${
          stats.total === 1 ? typeSingular : typePlural
        } in ${cityName}, ${stateCode}.` +
        (stats.liveNow > 0
          ? ` ${stats.liveNow} ${stats.liveNow === 1 ? 'is' : 'are'} open right now.`
          : '') +
        ' Listings refresh daily as organizers post new sales.'
      : `No ${typePlural} are listed in ${cityName}, ${stateCode} at the moment. New sales are posted daily, so check back soon or browse nearby cities.`;
  faqs.push({
    question: `How many ${typePlural} are in ${cityName}, ${stateCode} this week?`,
    answer: countAnswer,
  });

  const weekendAnswer =
    stats.thisWeekend > 0
      ? `Yes. ${stats.thisWeekend} ${
          stats.thisWeekend === 1 ? `${typeSingular} runs` : `${typePlural} run`
        } during the weekend of ${stats.weekendLabel} in ${cityName}. Open a listing for exact dates, hours, and directions.`
      : `None are scheduled for the weekend of ${stats.weekendLabel} yet. Organizers in ${cityName} often post weekend sales by Thursday evening, so check back later in the week.`;
  faqs.push({
    question: `Are there ${typePlural} in ${cityName} this weekend?`,
    answer: weekendAnswer,
  });

  const others = Object.keys(SALE_TYPE_PAGES)
    .filter((type) => type !== currentTypeKey && (activeByType[type] ?? 0) > 0)
    .map((type) => {
      const count = activeByType[type];
      const meta = SALE_TYPE_PAGES[type];
      return `${count} ${count === 1 ? meta.singular : meta.label.toLowerCase()}`;
    });

  const othersAnswer =
    others.length > 0
      ? `Beyond ${typePlural}, ${cityName} currently has ${joinWithAnd(
          others
        )} listed on FindA.Sale. The ${cityName} city page collects every sale type in one place.`
      : `Estate sales, yard sales, auctions, flea markets, and consignment listings all appear on FindA.Sale as organizers post them. Visit the ${cityName} city page to see everything currently scheduled.`;
  faqs.push({
    question: `What other kinds of sales are happening in ${cityName}?`,
    answer: othersAnswer,
  });

  return faqs;
}
