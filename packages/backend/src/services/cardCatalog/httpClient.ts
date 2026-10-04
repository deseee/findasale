/**
 * Minimal HTTP layer for the card catalog ingest jobs (ADR-134 sections 3.3 and 11).
 *
 * - Fixed hosts only: api.scryfall.com, *.scryfall.io and tcgcsv.com. No user-supplied URL is ever
 *   fetched, and every redirect hop is checked against the same allowlist.
 * - Uses Node's https module (no new dependency) and exposes the response body as a stream so the
 *   78 MB Scryfall file is never buffered.
 * - Importing this module performs no network call and reads no environment variable.
 */
import * as https from 'https';
import { Readable } from 'stream';
import { StringDecoder } from 'string_decoder';

export interface HttpResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Readable;
}

export type HttpGet = (url: string, headers: Record<string, string>) => Promise<HttpResponse>;

export class HttpStatusError extends Error {
  status: number;
  url: string;
  constructor(status: number, url: string, message?: string) {
    super(message ?? `HTTP ${status} from ${url}`);
    this.name = 'HttpStatusError';
    this.status = status;
    this.url = url;
  }
}

/** Raised on HTTP 429. Callers stop the run immediately and never retry. */
export class RateLimitedError extends HttpStatusError {
  constructor(url: string) {
    super(429, url, `RATE_LIMITED: HTTP 429 from ${url}`);
    this.name = 'RateLimitedError';
  }
}

export function isAllowedCatalogHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === 'api.scryfall.com' || h === 'scryfall.io' || h.endsWith('.scryfall.io') || h === 'tcgcsv.com';
}

/** Parses a URL and throws unless it is https on an allowed host. */
export function assertAllowedUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`Refusing to fetch an invalid URL: ${String(raw).slice(0, 120)}`);
  }
  if (parsed.protocol !== 'https:' || !isAllowedCatalogHost(parsed.hostname)) {
    throw new Error(`Refusing to fetch a URL outside the card data allowlist: ${parsed.protocol}//${parsed.hostname}`);
  }
  return parsed;
}

/**
 * Scryfall requires an accurate User-Agent and an Accept header on every request to
 * api.scryfall.com (https://scryfall.com/docs/api). They are sent on every request we make,
 * to every allowed host.
 */
export function buildHeaders(userAgent: string, accept: string = 'application/json;q=0.9,*/*;q=0.8'): Record<string, string> {
  return { 'User-Agent': userAgent, Accept: accept };
}

const MAX_REDIRECTS = 3;
const SOCKET_IDLE_TIMEOUT_MS = 60_000;

/** Default HttpGet backed by node:https. */
export const nodeHttpGet: HttpGet = (url, headers) => {
  const hop = (target: string, redirectsLeft: number): Promise<HttpResponse> =>
    new Promise<HttpResponse>((resolve, reject) => {
      const parsed = assertAllowedUrl(target);
      const req = https.get(parsed, { headers }, (res) => {
        const status = res.statusCode ?? 0;
        const location = res.headers.location;
        if ([301, 302, 303, 307, 308].includes(status) && location) {
          res.resume();
          if (redirectsLeft <= 0) {
            reject(new Error(`Too many redirects fetching ${url}`));
            return;
          }
          let next: string;
          try {
            next = new URL(location, parsed).toString();
          } catch {
            reject(new Error(`Invalid redirect location from ${parsed.hostname}`));
            return;
          }
          hop(next, redirectsLeft - 1).then(resolve, reject);
          return;
        }
        resolve({ status, headers: res.headers, body: res });
      });
      req.setTimeout(SOCKET_IDLE_TIMEOUT_MS, () => req.destroy(new Error(`Timed out fetching ${parsed.hostname}`)));
      req.on('error', reject);
    });
  return hop(url, MAX_REDIRECTS);
};

/** Reads at most maxBytes of a response body as UTF-8 text, destroying the stream beyond that. */
export async function readBodyText(body: Readable, maxBytes: number): Promise<string> {
  const decoder = new StringDecoder('utf8');
  let text = '';
  let bytes = 0;
  for await (const chunk of body) {
    const buf: Buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    bytes += buf.length;
    if (bytes > maxBytes) {
      body.destroy();
      throw new Error(`Response body larger than ${maxBytes} bytes`);
    }
    text += decoder.write(buf);
  }
  return text + decoder.end();
}

/** Throws RateLimitedError on 429 and HttpStatusError on any other non-2xx status. Always drains a failed body. */
export function assertOk(res: HttpResponse, url: string): void {
  if (res.status === 429) {
    res.body.resume();
    throw new RateLimitedError(url);
  }
  if (res.status < 200 || res.status >= 300) {
    res.body.resume();
    throw new HttpStatusError(res.status, url);
  }
}

const MAX_JSON_BYTES = 64 * 1024 * 1024;

export async function getText(httpGet: HttpGet, url: string, headers: Record<string, string>): Promise<string> {
  assertAllowedUrl(url);
  const res = await httpGet(url, headers);
  assertOk(res, url);
  return readBodyText(res.body, MAX_JSON_BYTES);
}

export async function getJson<T = any>(httpGet: HttpGet, url: string, headers: Record<string, string>): Promise<T> {
  const text = await getText(httpGet, url, headers);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Invalid JSON from ${url}`);
  }
}

/**
 * Splits a byte or string stream into non-empty lines. Iterating the stream (rather than using
 * readline) means a stream error surfaces as a thrown error in the caller's loop.
 */
export async function* iterateLines(stream: AsyncIterable<Buffer | string>): AsyncGenerator<string> {
  const decoder = new StringDecoder('utf8');
  let pending = '';
  for await (const chunk of stream) {
    pending += typeof chunk === 'string' ? chunk : decoder.write(chunk);
    let start = 0;
    let idx = pending.indexOf('\n', start);
    while (idx >= 0) {
      const line = pending.slice(start, idx);
      start = idx + 1;
      if (line.trim().length > 0) yield line;
      idx = pending.indexOf('\n', start);
    }
    pending = pending.slice(start);
  }
  pending += decoder.end();
  if (pending.trim().length > 0) yield pending;
}
