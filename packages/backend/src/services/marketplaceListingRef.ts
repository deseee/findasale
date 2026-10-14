/**
 * Remote listing reference helpers (2026-10-18). The extension's edit engine (extension/fas-edit-engine.js +
 * fas-edit-core.js) finds a live listing by its platform id first and only falls back to a title match, which it SKIPS
 * when the title is not unique. So every price/stock sync queue entry should carry the best remote id (and URL) we have.
 *
 * MarketplaceListingJob.remoteListingId is the only column ("Marketplace's own listing url/id"), so it may hold a bare id
 * (Mercari/Vinted after-the-fact capture) OR a full URL (Facebook's markListed sends location.href). This module:
 *  - extractRemoteId: parse the platform's own id out of a URL (or accept a bare id of the right shape)
 *  - canonicalListingUrl: rebuild a stable URL from an id where the platform has an id-only URL form
 *  - pickStoredRemoteRef: what to persist when the extension reports a posting (id when parseable; for Craigslist and
 *    Gumtree AU, whose id-only URL cannot be rebuilt, the real URL itself so the URL survives and the id stays derivable)
 *  - resolveListingRef: at response time turn whatever is stored into { remoteListingId, remoteListingUrl }
 * Id shapes mirror extension/fas-edit-core.js extractIdFromUrl so the two sides agree. No network, no database.
 */

export type ListingRefPlatform = 'FACEBOOK' | 'CRAIGSLIST' | 'GUMTREE_AU' | 'GRAILED' | 'POSHMARK' | 'MERCARI' | 'VINTED';

const MAX_REF_LENGTH = 500;

// Hosts a stored/forwarded URL may point at, per platform (suffix match on the hostname).
const HOST_SUFFIXES: Record<string, string[]> = {
  FACEBOOK: ['facebook.com'],
  CRAIGSLIST: ['craigslist.org'],
  GUMTREE_AU: ['gumtree.com.au'],
  GRAILED: ['grailed.com'],
  POSHMARK: ['poshmark.com', 'poshmark.ca', 'poshmark.com.au'],
  MERCARI: ['mercari.com'],
  VINTED: ['vinted.com'],
};

function parseUrl(value: string): URL | null {
  if (!/^https?:\/\//i.test(value)) return null;
  try { return new URL(value); } catch { return null; }
}

/** True when `value` is an http(s) URL whose host belongs to `platform`. */
export function isPlatformUrl(platform: string, value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const u = parseUrl(value.trim());
  const suffixes = HOST_SUFFIXES[platform];
  if (!u || !suffixes) return false;
  const host = u.hostname.toLowerCase();
  return suffixes.some((s) => host === s || host.endsWith('.' + s));
}

/** The platform's own listing id parsed from a URL, or a bare id of the right shape. '' when nothing parses. */
export function extractRemoteId(platform: string, value: unknown): string {
  const v = typeof value === 'string' ? value.trim() : '';
  if (!v) return '';
  const isUrl = /^https?:\/\//i.test(v);
  // A URL for another platform must never yield an id.
  if (isUrl && !isPlatformUrl(platform, v)) return '';
  let m: RegExpExecArray | null;
  switch (platform) {
    case 'FACEBOOK':
      m = /\/marketplace\/item\/(\d{6,})/.exec(v) || (/^\d{6,}$/.test(v) ? [v, v] as unknown as RegExpExecArray : null);
      return m ? m[1] : '';
    case 'POSHMARK':
      m = /(?:[-/])([0-9a-f]{24})(?:[/?#]|$)/i.exec(v) || (/^[0-9a-f]{24}$/i.test(v) ? [v, v] as unknown as RegExpExecArray : null);
      return m ? m[1].toLowerCase() : '';
    case 'MERCARI':
      m = /(?:^|[^a-z0-9])(m\d{6,})(?:[^a-z0-9]|$)/i.exec(v);
      return m ? m[1].toLowerCase() : '';
    case 'GRAILED':
      m = /\/listings\/(\d+)/.exec(v) || (/^\d+$/.test(v) ? [v, v] as unknown as RegExpExecArray : null);
      return m ? m[1] : '';
    case 'CRAIGSLIST':
      m = /(?:^|[^\d])(\d{9,12})(?:[^\d]|$)/.exec(isUrl ? (parseUrl(v) as URL).pathname : v);
      return m ? m[1] : '';
    case 'GUMTREE_AU':
      m = /(\d{8,12})(?:[/?#]|$)/.exec(isUrl ? (parseUrl(v) as URL).pathname : v);
      return m ? m[1] : '';
    default:
      return '';
  }
}

/** A stable listing URL rebuilt from the id alone, for the platforms that have one. '' otherwise. */
export function canonicalListingUrl(platform: string, id: string): string {
  const v = (id || '').trim();
  if (!v) return '';
  switch (platform) {
    case 'FACEBOOK': return /^\d{6,}$/.test(v) ? `https://www.facebook.com/marketplace/item/${v}/` : '';
    case 'POSHMARK': return /^[0-9a-f]{24}$/i.test(v) ? `https://poshmark.com/listing/${v.toLowerCase()}` : '';
    case 'MERCARI': return /^m\d{6,}$/i.test(v) ? `https://www.mercari.com/us/item/${v.toLowerCase()}/` : '';
    case 'GRAILED': return /^\d+$/.test(v) ? `https://www.grailed.com/listings/${v}` : '';
    default: return ''; // Craigslist / Gumtree AU / Vinted: no id-only URL form we can rebuild
  }
}

/**
 * What to persist in MarketplaceListingJob.remoteListingId when the extension reports a posting.
 * Accepts the id and/or URL the extension sent (any may be missing). null = nothing usable to store.
 */
export function pickStoredRemoteRef(platform: string, input: { remoteListingId?: unknown; remoteListingUrl?: unknown }): string | null {
  const rawId = typeof input.remoteListingId === 'string' ? input.remoteListingId.trim() : '';
  const rawUrl = typeof input.remoteListingUrl === 'string' ? input.remoteListingUrl.trim() : '';
  const id = extractRemoteId(platform, rawId) || extractRemoteId(platform, rawUrl);
  // Craigslist / Gumtree AU: keep the real URL (the id alone cannot rebuild it); the id stays derivable from it.
  if (platform === 'CRAIGSLIST' || platform === 'GUMTREE_AU') {
    const url = [rawUrl, rawId].find((c) => c && isPlatformUrl(platform, c) && extractRemoteId(platform, c));
    if (url) return url.slice(0, MAX_REF_LENGTH);
  }
  if (id) return id;
  return rawId ? rawId.slice(0, MAX_REF_LENGTH) : null; // unparseable but reported: keep it exactly as before
}

/** Resolve a stored value to what a sync queue entry should carry. Empty strings when there is nothing. */
export function resolveListingRef(platform: string, stored: string | null | undefined): { remoteListingId: string; remoteListingUrl: string } {
  const raw = typeof stored === 'string' ? stored.trim() : '';
  if (!raw) return { remoteListingId: '', remoteListingUrl: '' };
  const id = extractRemoteId(platform, raw);
  const storedIsUrl = isPlatformUrl(platform, raw);
  const url = storedIsUrl ? raw : canonicalListingUrl(platform, id);
  // Unparseable non-URL legacy value (e.g. an opaque token): pass it through as the id, unchanged. A URL we could not read an id
  // from (or a URL on a foreign host) is never passed off as an id.
  const looksLikeUrl = /^https?:\/\//i.test(raw);
  return { remoteListingId: id || (looksLikeUrl ? '' : raw), remoteListingUrl: url };
}

/** Spread-ready fields for a queue entry; empty when the item has no stored reference. */
export function listingRefFields(platform: string, stored: string | null | undefined): { remoteListingId?: string; remoteListingUrl?: string } {
  const r = resolveListingRef(platform, stored);
  return {
    ...(r.remoteListingId ? { remoteListingId: r.remoteListingId } : {}),
    ...(r.remoteListingUrl ? { remoteListingUrl: r.remoteListingUrl } : {}),
  };
}
