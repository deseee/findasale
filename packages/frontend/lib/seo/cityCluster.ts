/**
 * cityCluster.ts: data plumbing for the ADR-074 city cluster on /city/[slug] (wired 2026-09-29).
 *
 * Everything here runs inside getStaticProps only (server side, ISR). Every fetch is best effort
 * and never throws: a slow or failing optional section must never fail or blank the whole city
 * page (the page's own sales fetch is the only one allowed to fail the build).
 */
import { getCityMeta, hasCuratedCityMeta } from '@/lib/seo/cityData';
import { getCityFromSlug } from '@/lib/city-slugs';
import { CITY_SLUG_PATTERN } from '@/lib/seo/citySlug';

export interface CityFindCardData {
  id: string;
  title: string;
  price: number;
  originalPrice: number | null;
  savingsPct: number | null;
  condition: string | null;
  photoUrl: string | null;
}

export interface DirectoryOrganizerData {
  id: string;
  businessName: string;
  website: string | null;
  businessCategory: string | null;
  // The API returns a boolean `claimable` (claimStatus was removed from the public response).
  // Defaults to false when absent so the claim link only shows for genuinely claimable entries.
  claimable: boolean;
}

export interface CitySlugRow {
  slug: string;
  city?: string;
  state?: string;
  count?: number;
}

export interface NearbyCityLinkData {
  slug: string;
  label: string;
}

const FETCH_TIMEOUT_MS = 8000;

function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';
}

async function getJsonBestEffort(path: string): Promise<any | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${apiBase()}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.REVALIDATE_SECRET ? { 'x-ssr-secret': process.env.REVALIDATE_SECRET } : {}),
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Fresh real items for the city (GET /api/cities/:slug/finds). Empty on any failure. */
export async function fetchCityFinds(slug: string): Promise<CityFindCardData[]> {
  if (!CITY_SLUG_PATTERN.test(slug)) return [];
  const data = await getJsonBestEffort(`/cities/${encodeURIComponent(slug)}/finds?limit=8`);
  const rows: any[] = Array.isArray(data?.finds) ? data.finds : [];
  return rows
    .filter((r) => r && typeof r.id === 'string' && typeof r.title === 'string' && typeof r.price === 'number')
    .map((r) => ({
      id: r.id,
      title: r.title,
      price: r.price,
      originalPrice: typeof r.originalPrice === 'number' ? r.originalPrice : null,
      savingsPct: typeof r.savingsPct === 'number' ? r.savingsPct : null,
      condition: typeof r.condition === 'string' ? r.condition : null,
      photoUrl: typeof r.photoUrl === 'string' ? r.photoUrl : null,
    }));
}

/**
 * Public directory listings for the city (GET /api/cities/:slug/directory), reduced to the fields
 * the site already publishes elsewhere. Address, Google rating and rating count are dropped here
 * on purpose (see CityDirectorySection docblock for the legal reasoning).
 */
export async function fetchCityDirectory(slug: string, max = 6): Promise<DirectoryOrganizerData[]> {
  if (!CITY_SLUG_PATTERN.test(slug)) return [];
  const data = await getJsonBestEffort(`/cities/${encodeURIComponent(slug)}/directory?limit=${max}`);
  const rows: any[] = Array.isArray(data?.organizers) ? data.organizers : [];
  return rows
    .filter((r) => r && typeof r.id === 'string' && typeof r.businessName === 'string' && r.businessName.trim().length > 0)
    .slice(0, max)
    .map((r) => ({
      id: r.id,
      businessName: r.businessName,
      website: typeof r.website === 'string' && r.website.length > 0 ? r.website : null,
      businessCategory: typeof r.businessCategory === 'string' ? r.businessCategory : null,
      // Current shape: boolean `claimable`. Older shape: claimStatus string (UNCLAIMED/INVITED = claimable).
      // Anything else, including an absent field, is not claimable.
      claimable:
        typeof r.claimable === 'boolean'
          ? r.claimable
          : typeof r.claimStatus === 'string'
            ? r.claimStatus === 'UNCLAIMED' || r.claimStatus === 'INVITED'
            : false,
    }));
}

/**
 * Brand rule D-001: user-facing copy is sale-type inclusive, never "estate sale" as a blanket
 * word. Curated city rows were written before that rule, so their wording is normalised at render
 * time instead of rewriting the editorial source: "estate sales" becomes "sales", "Estate Sale"
 * becomes "Sale". Also turns any em dash into a comma (house style: no em dashes).
 */
export function inclusiveSaleCopy(text: string): string {
  return text
    .replace(/\b([Ee])state[- ][Ss]ales\b/g, (_m, e: string) => (e === 'E' ? 'Sales' : 'sales'))
    .replace(/\b([Ee])state[- ][Ss]ale\b/g, (_m, e: string) => (e === 'E' ? 'Sale' : 'sale'))
    .replace(/\s*\u2014\s*/g, ', ');
}

/**
 * Editorial tips for the city page. Only curated cities get any; the generated fallback text in
 * getCityMeta is intentionally not used (identical boilerplate across ~1,200 pages is the thin
 * content risk ADR-074 section 9 warns about).
 */
export function getCuratedCityTips(slug: string): string[] {
  if (!hasCuratedCityMeta(slug)) return [];
  const meta = getCityMeta(slug);
  return [meta.knownFor, meta.tip]
    .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
    .map(inclusiveSaleCopy);
}

export function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function labelFor(slug: string, row?: CitySlugRow): string {
  const info = getCityFromSlug(slug);
  if (info) return `${info.name}, ${info.state}`;
  if (row?.city && row?.state) return `${row.city}, ${row.state}`;
  const parts = slug.split('-');
  const st = parts[parts.length - 1].toUpperCase();
  const name = parts.slice(0, -1).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return `${name}, ${st}`;
}

/**
 * Nearby cities for internal linking. Only cities that currently have live sales qualify
 * (linking to an empty city page is a dead end for shoppers and a thin page for crawlers).
 * Curated editorial neighbours come first, then the geographically closest qualifying cities
 * within maxMiles, up to `max`.
 */
export function pickNearbyCities(
  slug: string,
  rows: CitySlugRow[],
  max = 5,
  maxMiles = 150
): NearbyCityLinkData[] {
  const live = new Map<string, CitySlugRow>();
  for (const r of rows) {
    if (r && typeof r.slug === 'string' && r.slug !== slug && (r.count ?? 0) > 0) live.set(r.slug, r);
  }
  if (live.size === 0) return [];

  const out: NearbyCityLinkData[] = [];
  const used = new Set<string>();

  if (hasCuratedCityMeta(slug)) {
    for (const s of getCityMeta(slug).nearbySlugs) {
      if (out.length >= max) break;
      if (live.has(s) && !used.has(s)) {
        used.add(s);
        out.push({ slug: s, label: labelFor(s, live.get(s)) });
      }
    }
  }

  const here = getCityFromSlug(slug);
  if (here && out.length < max) {
    const ranked: Array<{ slug: string; d: number }> = [];
    for (const s of Array.from(live.keys())) {
      if (used.has(s)) continue;
      const other = getCityFromSlug(s);
      if (!other) continue;
      const d = haversineMiles(here.lat, here.lng, other.lat, other.lng);
      if (d <= maxMiles) ranked.push({ slug: s, d });
    }
    ranked.sort((a, b) => a.d - b.d);
    for (const r of ranked) {
      if (out.length >= max) break;
      out.push({ slug: r.slug, label: labelFor(r.slug, live.get(r.slug)) });
    }
  }

  return out;
}
