/**
 * publicSaleLocation.ts: location privacy for anything the frontend renders on the server.
 *
 * Policy (Patrick, 2026-10-13): a sale's street address is visible only to signed-in shoppers
 * from the day before the sale starts, plus the owner organizer, staff and admins. Every page
 * built by getStaticProps / getServerSideProps / ISR, every pages/api route and every build
 * script is cached and served to anonymous visitors, so none of them may carry a street address
 * or exact coordinates, whatever the backend returns. The signed-in view is fetched client side.
 *
 * Applied here (defense in depth, independent of the backend gate):
 *  - address / streetAddress -> '' (city, state and zip are kept)
 *  - lat / lng / latitude / longitude rounded to 2 decimals (about 1 km)
 *  - entrance pin fields removed
 *  - a nested organizer loses its street address and its phone number
 */

const ENTRANCE_KEYS = ['entranceLat', 'entranceLng', 'entranceNote'] as const;
const COORD_KEYS = ['lat', 'lng', 'latitude', 'longitude'] as const;
const ADDRESS_KEYS = ['address', 'streetAddress'] as const;

/** Round a coordinate to 2 decimals. Non-numbers pass through unchanged (null stays null). */
export function roundCoord<T>(value: T): T {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return (Math.round(value * 100) / 100) as unknown as T;
  }
  return value;
}

/** Organizer as shown publicly: no street address, no phone. */
export function toPublicOrganizer<T>(organizer: T): T {
  if (!organizer || typeof organizer !== 'object') return organizer;
  const copy: Record<string, unknown> = { ...(organizer as Record<string, unknown>) };
  if ('address' in copy) copy.address = '';
  if ('streetAddress' in copy) copy.streetAddress = '';
  delete copy.phone;
  return copy as T;
}

/** One sale (or sale-like listing) with its street address and exact location removed. */
export function toPublicSaleLocation<T>(sale: T): T {
  if (!sale || typeof sale !== 'object') return sale;
  const copy: Record<string, unknown> = { ...(sale as Record<string, unknown>) };
  for (const key of ADDRESS_KEYS) {
    if (key in copy) copy[key] = '';
  }
  for (const key of COORD_KEYS) {
    if (key in copy) copy[key] = roundCoord(copy[key]);
  }
  for (const key of ENTRANCE_KEYS) {
    delete copy[key];
  }
  if (copy.organizer && typeof copy.organizer === 'object') {
    copy.organizer = toPublicOrganizer(copy.organizer);
  }
  // Raw scraper payload can hold the source street address and exact pin: keep display keys only.
  if (copy.scrapedMetadata && typeof copy.scrapedMetadata === 'object') {
    const meta = copy.scrapedMetadata as Record<string, unknown>;
    const kept: Record<string, unknown> = {};
    for (const k of ['aiEnriched', 'hours_display', 'dateApproximate']) if (meta[k] !== undefined) kept[k] = meta[k];
    copy.scrapedMetadata = Object.keys(kept).length ? kept : null;
  }
  return copy as T;
}

/** Array form; anything that is not an array becomes an empty array. */
export function toPublicSaleList<T>(sales: T[] | null | undefined): T[] {
  return Array.isArray(sales) ? sales.map((s) => toPublicSaleLocation(s)) : [];
}

/**
 * One display line for a public location: "Grand Rapids, MI 49503". Empty parts are skipped,
 * so a withheld street address never leaves a dangling comma.
 */
export function formatPublicLocation(parts: {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}): string {
  const clean = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const stateZip = [clean(parts.state), clean(parts.zip)].filter(Boolean).join(' ');
  return [clean(parts.address), clean(parts.city), stateZip].filter(Boolean).join(', ');
}
