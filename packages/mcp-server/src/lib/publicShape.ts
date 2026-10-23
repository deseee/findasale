/**
 * Public projections of backend sale and item records.
 *
 * The backend already applies anonymous-viewer rules, but its public responses
 * still carry many internal fields (payment processor ids, scrape metadata,
 * workflow timestamps, organizer user ids). Everything the MCP server returns is
 * rebuilt here from an explicit allow-list, so a new backend field can never leak
 * to agents by default.
 *
 * Public address rule: the MCP server never returns a street address, entrance
 * pin, approach notes or an exact map pin. Coordinates are rounded to 2 decimals
 * (about 1 km). The sale page on finda.sale shows the street address to
 * signed-in shoppers from the day before the sale starts.
 */

export const SITE_BASE = 'https://finda.sale';

export const ADDRESS_NOTE =
  'Street address is not shared here. Signed-in shoppers see it on the sale page from the day before the sale starts.';

const MAX_DESCRIPTION = 800;
const MAX_PHOTOS = 4;

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function coarse(v: unknown): number | null {
  const n = num(v);
  return n === null ? null : Math.round(n * 100) / 100;
}

function clip(v: unknown, max = MAX_DESCRIPTION): string | null {
  const s = str(v);
  if (!s) return null;
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function photos(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((u): u is string => typeof u === 'string' && /^https:\/\//.test(u))
    .slice(0, MAX_PHOTOS);
}

function iso(v: unknown): string | null {
  if (typeof v !== 'string' && !(v instanceof Date)) return null;
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function saleUrl(id: string): string {
  return `${SITE_BASE}/sales/${encodeURIComponent(id)}`;
}

export function itemUrl(id: string): string {
  return `${SITE_BASE}/items/${encodeURIComponent(id)}`;
}

/** True when a sale record is a public, current listing (not draft/ended/cancelled/deleted). */
export function isPublicActiveSale(s: any, now: Date = new Date()): boolean {
  if (!s || typeof s !== 'object' || !str(s.id)) return false;
  if (s.status !== undefined && s.status !== 'PUBLISHED') return false;
  if (s.deletedAt) return false;
  if (s.isInventoryContainer === true) return false;
  if (s.isOngoing === true) return true;
  const end = iso(s.endDate);
  return end === null || new Date(end) >= now;
}

export interface PublicSale {
  id: string;
  title: string;
  saleType: string | null;
  startDate: string | null;
  endDate: string | null;
  isOngoing: boolean;
  isOnlineOnly: boolean;
  city: string | null;
  state: string | null;
  zip: string | null;
  neighborhood: string | null;
  approxLat: number | null;
  approxLng: number | null;
  description: string | null;
  photoUrls: string[];
  organizerName: string | null;
  url: string;
  addressNote: string;
}

export function toPublicSale(s: any): PublicSale {
  const id = String(s.id);
  return {
    id,
    title: str(s.title) ?? 'Untitled sale',
    saleType: str(s.saleType) ?? str(s.type),
    startDate: iso(s.startDate),
    endDate: iso(s.endDate),
    isOngoing: s.isOngoing === true,
    isOnlineOnly: s.isOnlineOnly === true,
    city: str(s.city),
    state: str(s.state),
    zip: str(s.zip),
    neighborhood: str(s.neighborhood),
    approxLat: coarse(s.lat),
    approxLng: coarse(s.lng),
    description: clip(s.description),
    photoUrls: photos(s.photoUrls),
    organizerName: str(s.organizer?.businessName),
    url: saleUrl(id),
    addressNote: ADDRESS_NOTE,
  };
}

export interface PublicItem {
  id: string;
  title: string;
  description: string | null;
  price: number | null;
  category: string | null;
  condition: string | null;
  status: string | null;
  photoUrls: string[];
  saleId: string | null;
  saleTitle: string | null;
  saleCity: string | null;
  saleState: string | null;
  organizerName: string | null;
  url: string;
  saleUrl: string | null;
}

/** True when an item record is publicly listed (never drafts, hidden or embargoed items). */
export function isPublicItem(i: any, now: Date = new Date()): boolean {
  if (!i || typeof i !== 'object' || !str(i.id)) return false;
  if (i.draftStatus !== undefined && i.draftStatus !== 'PUBLISHED') return false;
  if (i.isActive === false) return false;
  if (i.listingType === 'CONSIGNOR_TAG') return false;
  if (i.status === 'GRACE_LOCKED') return false;
  const embargo = iso(i.earlyAccessUntil);
  if (embargo && new Date(embargo) > now) return false;
  const legendary = iso(i.legendaryVisibleAt);
  if (i.isLegendary === true && legendary && new Date(legendary) > now) return false;
  if (i.sale && typeof i.sale === 'object' && i.sale.status !== undefined && i.sale.status !== 'PUBLISHED') {
    return false;
  }
  return true;
}

export function toPublicItem(i: any, sale?: { title?: unknown; city?: unknown; state?: unknown } | null): PublicItem {
  const id = String(i.id);
  const saleId = str(i.saleId) ?? str(i.sale?.id);
  const saleSrc = sale ?? i.sale ?? null;
  return {
    id,
    title: str(i.title) ?? 'Untitled item',
    description: clip(i.description, 500),
    price: num(i.price),
    category: str(i.category),
    condition: str(i.conditionGrade) ? `${str(i.condition) ?? ''} (grade ${str(i.conditionGrade)})`.trim() : str(i.condition),
    status: str(i.status),
    photoUrls: photos(i.photoUrls),
    saleId,
    saleTitle: str(saleSrc?.title),
    saleCity: str(saleSrc?.city),
    saleState: str(saleSrc?.state),
    organizerName: str(i.businessName) ?? str(i.sale?.organizer?.businessName),
    url: itemUrl(id),
    saleUrl: saleId ? saleUrl(saleId) : null,
  };
}
