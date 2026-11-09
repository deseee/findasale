/**
 * itemPhotoDownload.ts -- the one download routine for an item's STORED photos (2026-11-08).
 *
 * Used by re-analyze (services/reanalyzeService.ts) and the inventory recheck (services/intakeRecheckService.ts) so both
 * read exactly the same photos. Before this the two had separate copies of the loop; the recheck silently skipped a URL
 * that failed the SSRF guard (no log line), so 51 of 212 items came back as "photo download failed" with no clue why.
 *
 * Rules: only URLs that pass isSafeItemPhotoUrl (https Cloudinary, SAFE_FETCH_ALLOWED_HOSTS, eBay's picture CDN for
 * eBay-imported items), redirects never followed, bounded size and time. Every skipped or failed URL is reported with a
 * short reason (host only, never the full URL) so the caller can say why an item had no readable photo. Never throws.
 */
import axios from 'axios';
import { isSafeItemPhotoUrl, SAFE_FETCH_AXIOS_OPTIONS } from './safeFetchUrl';

export interface ItemPhotoFailure {
  /** Hostname of the URL (or "invalid url"). */
  host: string;
  /** "host not allowed", "http 404", "timeout", "network error", "empty response". */
  reason: string;
}

export interface ItemPhotoDownload {
  buffers: Buffer[];
  mimeTypes: string[];
  /** The source URL of each downloaded buffer (same order). */
  urls: string[];
  failures: ItemPhotoFailure[];
}

const USER_AGENT = 'FindaSale-ImageTagger/1.0 (+https://finda.sale; secondary-sale item tagging)';

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase() || 'invalid url';
  } catch {
    return 'invalid url';
  }
}

function failureReason(err: unknown): string {
  const e = err as { response?: { status?: number }; code?: string; message?: string } | null;
  if (e?.response?.status) return `http ${e.response.status}`;
  if (e?.code === 'ECONNABORTED' || e?.code === 'ETIMEDOUT' || /timeout/i.test(String(e?.message ?? ''))) return 'timeout';
  if (/maxContentLength|maxBodyLength/i.test(String(e?.message ?? ''))) return 'too large';
  return 'network error';
}

/** Downloads up to `max` (default 5) of the item's stored photos. Stored URLs are trimmed first. */
export async function downloadItemPhotos(urls: unknown, opts: { max?: number; logTag?: string } = {}): Promise<ItemPhotoDownload> {
  const out: ItemPhotoDownload = { buffers: [], mimeTypes: [], urls: [], failures: [] };
  const tag = opts.logTag || '[itemPhotos]';
  const list = (Array.isArray(urls) ? urls : []).filter((u): u is string => typeof u === 'string').map((u) => u.trim()).filter(Boolean);
  for (const url of list.slice(0, opts.max ?? 5)) {
    const host = hostOf(url);
    if (!isSafeItemPhotoUrl(url)) {
      out.failures.push({ host, reason: 'host not allowed' });
      console.warn(`${tag} skipped photo on ${host}: not an allowed https image host`);
      continue;
    }
    try {
      const resp = await axios.get(url, {
        ...SAFE_FETCH_AXIOS_OPTIONS,
        responseType: 'arraybuffer',
        timeout: 10000,
        headers: { 'User-Agent': USER_AGENT },
      });
      const buf = Buffer.from(resp?.data ?? []);
      if (buf.length === 0) {
        out.failures.push({ host, reason: 'empty response' });
        continue;
      }
      const contentType = String(resp?.headers?.['content-type'] || '').split(';')[0].trim();
      out.buffers.push(buf);
      out.mimeTypes.push(contentType.startsWith('image/') ? contentType : 'image/jpeg');
      out.urls.push(url);
    } catch (err) {
      const reason = failureReason(err);
      out.failures.push({ host, reason });
      console.warn(`${tag} photo download failed on ${host}: ${reason}`);
    }
  }
  return out;
}

/** "host not allowed (example.com) x2, http 404 (res.cloudinary.com)" for a summary line. */
export function describePhotoFailures(failures: ItemPhotoFailure[]): string {
  const counts = new Map<string, number>();
  for (const f of failures) {
    const k = `${f.reason} (${f.host})`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts].map(([k, n]) => (n > 1 ? `${k} x${n}` : k)).join(', ');
}
