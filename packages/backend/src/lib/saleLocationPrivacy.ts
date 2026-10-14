// ---------------------------------------------------------------------------------------------
// Public sale privacy gates (2026-10-13, Patrick-approved). Shared by every public surface.
//  1) Embargoed items: early-access / Legendary items stay hidden from viewers without early access
//     (rarity delay, Legendary legendaryVisibleAt, item-level earlyAccessUntil).
//  2) Street address: shown only to signed-in shoppers, and only from the day before the sale starts
//     (sale local time). Everyone else gets city / state / postal-level location, lat/lng rounded to
//     2 decimals (~1 km) and no entrance pin. Owning organizer, its staff and admin always see everything.
// Responses from cached/ISR/anonymous endpoints are public: gating must happen here, server-side.
// ---------------------------------------------------------------------------------------------
export const DEFAULT_SALE_TIMEZONE = 'America/Detroit';

function localDateKey(d: Date, timeZone: string): string {
  const fmt = (tz: string) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  try {
    return fmt(timeZone);
  } catch {
    return fmt(DEFAULT_SALE_TIMEZONE); // invalid IANA zone stored on the organizer
  }
}

export type SaleAddressGate =
  | { visible: true }
  | { visible: false; reason: 'SIGN_IN' | 'NOT_YET'; revealsOn: string };

/**
 * Decides whether the full street address of a sale may be shown to a viewer.
 * Calendar day of the sale start: date-only starts are stored as 00:00:00Z (the UTC date IS the intended
 * day); timed starts are real instants, so their day is read in the sale's local time zone.
 * Visible when viewer is signed in AND today (sale local time) >= start day - 1.
 */
export function getSaleAddressGate(
  sale: { startDate: Date | string | null },
  timeZone: string | null | undefined,
  signedIn: boolean,
  now: Date = new Date()
): SaleAddressGate {
  const tz = timeZone || DEFAULT_SALE_TIMEZONE;
  const start = sale.startDate ? new Date(sale.startDate) : null;
  let revealsOn = '';
  let reached = true;
  if (start && !Number.isNaN(start.getTime())) {
    const dateOnly = start.getUTCHours() === 0 && start.getUTCMinutes() === 0 && start.getUTCSeconds() === 0;
    const startDay = dateOnly ? start.toISOString().slice(0, 10) : localDateKey(start, tz);
    const [y, m, d] = startDay.split('-').map(Number);
    revealsOn = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
    reached = localDateKey(now, tz) >= revealsOn;
  }
  if (!reached) return { visible: false, reason: 'NOT_YET', revealsOn };
  if (!signedIn) return { visible: false, reason: 'SIGN_IN', revealsOn };
  return { visible: true };
}

/** True when the viewer is NOT entitled to see this item yet (embargo / early-access windows). */
export function isItemEmbargoedForViewer(item: any, viewer: any, now: Date = new Date()): boolean {
  const hasHuntPass = Boolean(viewer?.huntPassActive && viewer?.huntPassExpiry && new Date(viewer.huntPassExpiry) > now);
  const isSageOrHigher = ['SAGE', 'GRANDMASTER'].includes(viewer?.explorerRank ?? 'INITIATE');
  const ageHours = item.createdAt ? (now.getTime() - new Date(item.createdAt).getTime()) / 3600000 : Infinity;
  if (!hasHuntPass) {
    if (item.rarity === 'LEGENDARY' && ageHours < 12) return true;
    if (item.rarity === 'RARE' && ageHours < 6) return true;
    if (item.earlyAccessUntil && new Date(item.earlyAccessUntil) > now) return true;
  }
  if (item.isLegendary && item.legendaryVisibleAt && !isSageOrHigher && new Date(item.legendaryVisibleAt) > now) return true;
  return false;
}

/** ~1 km precision: without the street address the exact pin would give it away. */
export function coarseCoord<T extends number | null | undefined>(n: T): T {
  return (n == null ? n : (Math.round((n as number) * 100) / 100)) as T;
}

/**
 * Gate for a viewer on a sale. Privileged = owning organizer / admin (callers that know about staff
 * pass privileged: true). Online-only sales without a street address have nothing to protect.
 */
/**
 * True only for a sale with nothing to protect: its address column is present and empty AND it carries
 * no coordinates. A scraped sale with no street but an exact pin is NOT online-only (the pin is the house).
 */
export function hasNoLocationToProtect(sale: Record<string, any>): boolean {
  if (!('address' in sale) || sale.address) return false;
  return sale.lat == null && sale.lng == null && sale.latitude == null && sale.longitude == null
    && sale.entranceLat == null && sale.entranceLng == null;
}

export function saleAddressGateForViewer(
  sale: { startDate: Date | string | null; address?: string | null; [k: string]: any },
  timeZone: string | null | undefined,
  viewer: { id?: string } | null | undefined,
  privileged: boolean,
  now: Date = new Date()
): SaleAddressGate {
  // Only a sale whose address column was selected AND is empty is online-only. A select that omits the
  // address (map pins, lat/lng only) is still gated, or its exact coordinates would leak.
  if (privileged || hasNoLocationToProtect(sale)) return { visible: true };
  return getSaleAddressGate(sale, timeZone, Boolean(viewer?.id), now);
}

/**
 * Scraped sales keep the raw source response in scrapedMetadata (apiResponse, lat/lng), which carries the
 * source site's street address and exact pin. Public responses only need the display keys the frontend
 * reads; everything else is dropped on every public path, whatever the address gate says.
 */
const PUBLIC_SCRAPED_METADATA_KEYS = ['aiEnriched', 'hours_display', 'dateApproximate'] as const;
export function publicScrapedMetadata(meta: unknown): Record<string, unknown> | null {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null;
  const out: Record<string, unknown> = {};
  for (const k of PUBLIC_SCRAPED_METADATA_KEYS) if ((meta as any)[k] !== undefined) out[k] = (meta as any)[k];
  return Object.keys(out).length ? out : null;
}

/**
 * Returns a copy of a sale-shaped object with street-level location removed when the gate is closed:
 * address '', lat/lng coarse, entranceLat/entranceLng null (only keys already present are touched,
 * so `select` shapes stay unchanged). Organizer address, when nested, is blanked too.
 */
export function redactSaleLocation<T extends Record<string, any>>(sale: T, gate: SaleAddressGate): T {
  const out: any = { ...sale };
  if ('scrapedMetadata' in out) out.scrapedMetadata = publicScrapedMetadata(out.scrapedMetadata);
  if (gate.visible) return out;
  if ('address' in out) out.address = '';
  if ('lat' in out) out.lat = coarseCoord(out.lat);
  if ('lng' in out) out.lng = coarseCoord(out.lng);
  if ('latitude' in out) out.latitude = coarseCoord(out.latitude);
  if ('longitude' in out) out.longitude = coarseCoord(out.longitude);
  if ('entranceLat' in out) out.entranceLat = null;
  if ('entranceLng' in out) out.entranceLng = null;
  if ('entranceNote' in out) out.entranceNote = null;
  if (out.organizer && typeof out.organizer === 'object' && 'address' in out.organizer) {
    out.organizer = { ...out.organizer, address: '' };
  }
  return out;
}

/**
 * One-call helper for list/search endpoints: gates every sale for the viewer. Each sale needs
 * startDate, address and (for the time zone / ownership check) organizer.{userId, timezone} when
 * available; missing organizer data falls back to the default time zone and non-owner.
 */
export function redactSalesForViewer<T extends Record<string, any>>(
  sales: T[],
  viewer: { id?: string; role?: string } | null | undefined,
  now: Date = new Date()
): T[] {
  const isAdmin = viewer?.role === 'ADMIN';
  return sales.map((s) => {
    const owner = Boolean(viewer?.id && s.organizer?.userId && s.organizer.userId === viewer.id);
    const gate = saleAddressGateForViewer(s as any, s.organizer?.timezone, viewer, isAdmin || owner, now);
    return redactSaleLocation(s, gate);
  });
}

/**
 * Prisma Item where-fragment: items that are NOT embargoed for a viewer without early access
 * (anonymous / no Hunt Pass / below Sage). Mirrors isItemEmbargoedForViewer for that viewer, for use in
 * public lists and _count so counts never reveal a hidden item. Combine with PUBLIC_ITEM_FILTER via AND.
 */
export function notEmbargoedForPublicWhere(now: Date = new Date()) {
  const h = (hours: number) => new Date(now.getTime() - hours * 3600000);
  return {
    AND: [
      { OR: [{ earlyAccessUntil: null }, { earlyAccessUntil: { lte: now } }] },
      { NOT: { rarity: 'LEGENDARY' as const, createdAt: { gt: h(12) } } },
      { NOT: { rarity: 'RARE' as const, createdAt: { gt: h(6) } } },
      // not: null keeps SQL NULL semantics from hiding Legendary items that have no reveal time
      { NOT: { isLegendary: true, legendaryVisibleAt: { not: null, gt: now } } },
    ],
  };
}
