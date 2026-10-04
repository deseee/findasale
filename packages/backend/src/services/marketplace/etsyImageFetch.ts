/**
 * etsyImageFetch.ts -- the ONLY place a user-supplied photo URL is ever fetched for Etsy
 * (ADR-135 section 7 item 5, batch E-B3 acceptance 5). SSRF-guarded download of an item photo so
 * the bytes can be uploaded to a draft listing.
 *
 * A URL is accepted only when ALL of these hold:
 *   - protocol https, no credentials in the URL, port empty or 443;
 *   - the hostname is EXACTLY one of ETSY_IMAGE_HOST_ALLOWLIST (plus any exact hostnames listed in
 *     the optional ETSY_IMAGE_HOST_ALLOWLIST environment variable, comma separated, read at call time);
 *   - every address the hostname resolves to is a public address (loopback, link-local, private,
 *     carrier-grade NAT, documentation, multicast and metadata ranges are rejected), checked after
 *     DNS resolution, and checked again on the connected socket. The connection itself is pinned to
 *     the vetted address, so a second DNS answer cannot redirect it (DNS rebinding);
 *   - the response is not a redirect (redirects are never followed), is 2xx, has a content-type that
 *     starts with image/, and the body stays under ETSY_IMAGE_MAX_BYTES (checked on the declared
 *     length and again while streaming);
 *   - the whole exchange finishes within ETSY_IMAGE_TIMEOUT_MS.
 * For res.cloudinary.com URLs the transform ETSY_CLOUDINARY_TRANSFORM is inserted right after
 * /upload/ exactly once, so format and size are normalized before Etsy sees the bytes.
 *
 * This file talks to photo hosts only. It never talks to Etsy (that is etsyHttp.ts's job) and
 * never logs a URL query string, header or body.
 *
 * UNVERIFIED (ADR-135 section 12): the real host mix in Item.photoUrls (T15), whether Etsy accepts
 * the normalized Cloudinary output and what its hard size, format and count limits are (T5).
 *
 * Import safety: no env reads, network or timers at module load. DNS and the HTTPS transport are
 * injectable through the deps argument; the defaults load node's dns / https lazily.
 */

/** Exact hostnames whose photos may be fetched. UNVERIFIED (T15): the actual host mix. */
export const ETSY_IMAGE_HOST_ALLOWLIST: readonly string[] = ['res.cloudinary.com', 'i.ebayimg.com'];
/** Largest photo accepted, in bytes (ADR-135 section 7 item 5). UNVERIFIED (T5): Etsy's own limit. */
export const ETSY_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
/** Whole-download timeout. */
export const ETSY_IMAGE_TIMEOUT_MS = 15_000;
/** Cloudinary transform inserted after /upload/. UNVERIFIED (T5): that Etsy accepts the output. */
export const ETSY_CLOUDINARY_TRANSFORM = 'f_jpg,q_90,w_2000,c_limit';
/** Hosts that receive the Cloudinary transform. */
export const ETSY_CLOUDINARY_HOSTS: readonly string[] = ['res.cloudinary.com'];
/** Longest URL we will even parse. */
export const ETSY_IMAGE_MAX_URL_LEN = 2048;

export type EtsyImageFetchErrorCode =
  | 'BAD_URL'
  | 'NOT_HTTPS'
  | 'CREDENTIALS'
  | 'BAD_PORT'
  | 'HOST_NOT_ALLOWED'
  | 'PRIVATE_ADDRESS'
  | 'DNS_FAILED'
  | 'REDIRECT'
  | 'HTTP_ERROR'
  | 'NOT_IMAGE'
  | 'TOO_LARGE'
  | 'TIMEOUT'
  | 'NETWORK';

export class EtsyImageFetchError extends Error {
  code: EtsyImageFetchErrorCode;
  status?: number;
  constructor(code: EtsyImageFetchErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'EtsyImageFetchError';
    this.code = code;
    this.status = status;
  }
}

/**
 * True for failures that may succeed on a retry (timeouts, network trouble, upstream 5xx).
 * Everything else (bad URL, wrong host, private address, redirect, not an image, too large, 4xx) is
 * a property of that photo and will fail the same way every time.
 */
export function isTransientEtsyImageError(err: unknown): boolean {
  if (!(err instanceof EtsyImageFetchError)) return false;
  if (err.code === 'TIMEOUT' || err.code === 'NETWORK' || err.code === 'DNS_FAILED') return true;
  if (err.code === 'HTTP_ERROR') return typeof err.status === 'number' && err.status >= 500;
  return false;
}

// ---------------------------------------------------------------------------------------------
// IP address classification
// ---------------------------------------------------------------------------------------------

function parseIPv4(ip: string): [number, number, number, number] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const parts = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  if (parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return parts as [number, number, number, number];
}

function isPublicIPv4(o: [number, number, number, number]): boolean {
  const [a, b, c] = o;
  if (a === 0) return false; // 0.0.0.0/8 "this network"
  if (a === 10) return false; // RFC1918
  if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
  if (a === 127) return false; // loopback
  if (a === 169 && b === 254) return false; // link-local, includes the cloud metadata address
  if (a === 172 && b >= 16 && b <= 31) return false; // RFC1918
  if (a === 192 && b === 0 && c === 0) return false; // IETF protocol assignments
  if (a === 192 && b === 0 && c === 2) return false; // documentation
  if (a === 192 && b === 88 && c === 99) return false; // 6to4 relay anycast
  if (a === 192 && b === 168) return false; // RFC1918
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a === 198 && b === 51 && c === 100) return false; // documentation
  if (a === 203 && b === 0 && c === 113) return false; // documentation
  if (a >= 224) return false; // multicast, reserved, broadcast
  return true;
}

function parseIPv6(input: string): number[] | null {
  let s = String(input).split('%')[0].toLowerCase();
  if (!s.includes(':')) return null;
  if (s.includes('.')) {
    const lastColon = s.lastIndexOf(':');
    const v4 = parseIPv4(s.slice(lastColon + 1));
    if (!v4) return null;
    const hi = ((v4[0] << 8) | v4[1]).toString(16);
    const lo = ((v4[2] << 8) | v4[3]).toString(16);
    s = `${s.slice(0, lastColon + 1)}${hi}:${lo}`;
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  let groups: string[];
  if (halves.length === 2) {
    const fill = 8 - head.length - tail.length;
    if (fill < 1) return null;
    groups = [...head, ...Array(fill).fill('0'), ...tail];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;
  const out: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    out.push(parseInt(g, 16));
  }
  return out;
}

function embeddedV4(hi: number, lo: number): [number, number, number, number] {
  return [(hi >> 8) & 255, hi & 255, (lo >> 8) & 255, lo & 255];
}

/**
 * True only for a routable public address. Anything that does not parse as an IPv4 or IPv6 address
 * is false (fail closed). IPv4-mapped and NAT64 IPv6 forms are judged by the IPv4 address inside.
 */
export function isPublicIpAddress(ip: string): boolean {
  if (typeof ip !== 'string') return false;
  const v4 = parseIPv4(ip.trim());
  if (v4) return isPublicIPv4(v4);
  const g = parseIPv6(ip.trim());
  if (!g) return false;
  if (g.every((x) => x === 0)) return false; // ::
  // ::ffff:a.b.c.d (IPv4-mapped)
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return isPublicIPv4(embeddedV4(g[6], g[7]));
  // ::a.b.c.d (deprecated IPv4-compatible) and ::1 loopback
  if (g.slice(0, 6).every((x) => x === 0)) return false;
  // 64:ff9b::/96 (NAT64): judged by the embedded IPv4 address
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return isPublicIPv4(embeddedV4(g[6], g[7]));
  // Only global unicast 2000::/3 can be public.
  if ((g[0] & 0xe000) !== 0x2000) return false;
  if (g[0] === 0x2001 && g[1] < 0x0200) return false; // 2001::/23 protocol assignments, Teredo
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false; // documentation
  if (g[0] === 0x2002) return false; // 6to4
  if (g[0] === 0x3fff && (g[1] & 0xf000) === 0) return false; // documentation
  return true;
}

// ---------------------------------------------------------------------------------------------
// URL validation (pure, no network)
// ---------------------------------------------------------------------------------------------

/** Exact extra hostnames from the optional ETSY_IMAGE_HOST_ALLOWLIST variable. Invalid entries are ignored. */
export function readEtsyImageHostAllowlist(env: Record<string, string | undefined> = process.env): string[] {
  const extra = String(env.ETSY_IMAGE_HOST_ALLOWLIST ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter((h) => /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(h) && parseIPv4(h) === null);
  return Array.from(new Set([...ETSY_IMAGE_HOST_ALLOWLIST, ...extra]));
}

/**
 * Parse and check a photo URL without touching the network. Throws EtsyImageFetchError. Returns the
 * parsed URL (not yet transformed).
 */
export function validateEtsyImageUrl(raw: unknown, allowlist: readonly string[] = ETSY_IMAGE_HOST_ALLOWLIST): URL {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > ETSY_IMAGE_MAX_URL_LEN) {
    throw new EtsyImageFetchError('BAD_URL', 'Photo URL is missing or too long');
  }
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new EtsyImageFetchError('BAD_URL', 'Photo URL could not be parsed');
  }
  if (url.protocol !== 'https:') throw new EtsyImageFetchError('NOT_HTTPS', 'Photo URL must use https');
  if (url.username || url.password) throw new EtsyImageFetchError('CREDENTIALS', 'Photo URL must not contain credentials');
  if (url.port !== '' && url.port !== '443') throw new EtsyImageFetchError('BAD_PORT', 'Photo URL must use the standard https port');
  const host = url.hostname.toLowerCase();
  if (!allowlist.includes(host)) throw new EtsyImageFetchError('HOST_NOT_ALLOWED', 'Photo host is not on the allowlist');
  return url;
}

/**
 * Insert ETSY_CLOUDINARY_TRANSFORM right after the first /upload/ of a Cloudinary URL, exactly once.
 * Other hosts, URLs with no /upload/ segment, and URLs that already carry the transform are returned
 * unchanged.
 */
export function applyEtsyCloudinaryTransform(url: URL): URL {
  const out = new URL(url.toString());
  if (!ETSY_CLOUDINARY_HOSTS.includes(out.hostname.toLowerCase())) return out;
  const marker = '/upload/';
  const idx = out.pathname.indexOf(marker);
  if (idx < 0) return out;
  const head = out.pathname.slice(0, idx + marker.length);
  const rest = out.pathname.slice(idx + marker.length);
  if (rest.startsWith(`${ETSY_CLOUDINARY_TRANSFORM}/`)) return out;
  out.pathname = `${head}${ETSY_CLOUDINARY_TRANSFORM}/${rest}`;
  return out;
}

// ---------------------------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------------------------

export interface EtsyImageTransportRequest {
  url: URL;
  /** The vetted public address to connect to (the hostname is only used for TLS and the Host header). */
  address: string;
  family: 4 | 6;
  timeoutMs: number;
  maxBytes: number;
}
export interface EtsyImageTransportResponse {
  status: number;
  headers: Record<string, string | undefined>;
  body: Buffer;
}
export type EtsyImageTransport = (req: EtsyImageTransportRequest) => Promise<EtsyImageTransportResponse>;
export type EtsyDnsLookup = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

export interface EtsyImageFetchDeps {
  env?: Record<string, string | undefined>;
  lookup?: EtsyDnsLookup;
  transport?: EtsyImageTransport;
  timeoutMs?: number;
  maxBytes?: number;
}

export interface FetchedEtsyImage {
  data: Buffer;
  /** Lower-cased media type without parameters, for example image/jpeg. */
  contentType: string;
  /** A safe generic filename, for example photo.jpg. */
  filename: string;
}

function defaultLookup(): EtsyDnsLookup {
  return async (hostname: string) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const dns = require('dns') as typeof import('dns');
    const found = await dns.promises.lookup(hostname, { all: true });
    return found.map((f) => ({ address: f.address, family: f.family }));
  };
}

/** Real HTTPS transport: connects to the pinned address, re-checks the connected socket, streams with a size cap. */
function defaultTransport(): EtsyImageTransport {
  return (req) =>
    new Promise<EtsyImageTransportResponse>((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const https = require('https') as typeof import('https');
      let settled = false;
      const done = (fn: () => void) => {
        if (settled) return;
        settled = true;
        fn();
      };
      const request = https.request(
        {
          protocol: 'https:',
          hostname: req.url.hostname,
          servername: req.url.hostname,
          port: 443,
          method: 'GET',
          path: `${req.url.pathname}${req.url.search}`,
          headers: { Accept: 'image/*', 'User-Agent': 'FindA.Sale-image-fetch', 'Accept-Encoding': 'identity' },
          // Pin the connection to the address we already vetted.
          lookup: ((_host: string, options: any, cb: any) => {
            if (options && options.all) cb(null, [{ address: req.address, family: req.family }]);
            else cb(null, req.address, req.family);
          }) as any,
        },
        (res) => {
          const headers: Record<string, string | undefined> = {};
          for (const [k, v] of Object.entries(res.headers)) headers[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : v;
          const declared = parseInt(headers['content-length'] ?? '', 10);
          const status = res.statusCode ?? 0;
          if ((status >= 300 && status < 400) || status < 200 || status >= 300) {
            // No body needed for a redirect or an error.
            res.resume();
            done(() => resolve({ status, headers, body: Buffer.alloc(0) }));
            return;
          }
          if (Number.isFinite(declared) && declared > req.maxBytes) {
            res.destroy();
            done(() => reject(new EtsyImageFetchError('TOO_LARGE', 'Photo is larger than the size limit')));
            return;
          }
          const chunks: Buffer[] = [];
          let total = 0;
          res.on('data', (chunk: Buffer) => {
            total += chunk.length;
            if (total > req.maxBytes) {
              res.destroy();
              done(() => reject(new EtsyImageFetchError('TOO_LARGE', 'Photo is larger than the size limit')));
              return;
            }
            chunks.push(chunk);
          });
          res.on('end', () => done(() => resolve({ status, headers, body: Buffer.concat(chunks) })));
          res.on('error', () => done(() => reject(new EtsyImageFetchError('NETWORK', 'Photo download failed'))));
        }
      );
      request.on('socket', (socket) => {
        socket.on('connect', () => {
          if (!isPublicIpAddress(String(socket.remoteAddress ?? ''))) {
            request.destroy();
            done(() => reject(new EtsyImageFetchError('PRIVATE_ADDRESS', 'Photo host resolved to a non-public address')));
          }
        });
      });
      request.setTimeout(req.timeoutMs, () => {
        request.destroy();
        done(() => reject(new EtsyImageFetchError('TIMEOUT', 'Photo download timed out')));
      });
      request.on('error', () => done(() => reject(new EtsyImageFetchError('NETWORK', 'Photo download failed'))));
      request.end();
    });
}

const EXTENSION_BY_TYPE: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/svg+xml': 'svg',
};

/** Download one item photo under every guard above. Throws EtsyImageFetchError. */
export async function fetchEtsyImage(rawUrl: string, deps: EtsyImageFetchDeps = {}): Promise<FetchedEtsyImage> {
  const env = deps.env ?? process.env;
  const maxBytes = deps.maxBytes ?? ETSY_IMAGE_MAX_BYTES;
  const timeoutMs = deps.timeoutMs ?? ETSY_IMAGE_TIMEOUT_MS;

  const validated = validateEtsyImageUrl(rawUrl, readEtsyImageHostAllowlist(env));
  const url = applyEtsyCloudinaryTransform(validated);

  const lookup = deps.lookup ?? defaultLookup();
  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookup(url.hostname);
  } catch {
    throw new EtsyImageFetchError('DNS_FAILED', 'Photo host could not be resolved');
  }
  if (!Array.isArray(addresses) || addresses.length === 0) throw new EtsyImageFetchError('DNS_FAILED', 'Photo host could not be resolved');
  // Reject when ANY answer is non-public: a mixed answer is how rebinding tricks start.
  if (addresses.some((a) => !isPublicIpAddress(a.address))) {
    throw new EtsyImageFetchError('PRIVATE_ADDRESS', 'Photo host resolved to a non-public address');
  }
  const chosen = addresses[0];

  const transport = deps.transport ?? defaultTransport();
  const res = await transport({ url, address: chosen.address, family: chosen.family === 6 ? 6 : 4, timeoutMs, maxBytes });

  if (res.status >= 300 && res.status < 400) throw new EtsyImageFetchError('REDIRECT', 'Photo host answered with a redirect', res.status);
  if (res.status < 200 || res.status >= 300) throw new EtsyImageFetchError('HTTP_ERROR', `Photo host answered HTTP ${res.status}`, res.status);

  const contentType = String(res.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
  if (!contentType.startsWith('image/')) throw new EtsyImageFetchError('NOT_IMAGE', 'Photo host did not return an image');

  const declared = parseInt(res.headers['content-length'] ?? '', 10);
  if ((Number.isFinite(declared) && declared > maxBytes) || res.body.length > maxBytes) {
    throw new EtsyImageFetchError('TOO_LARGE', 'Photo is larger than the size limit');
  }
  if (res.body.length === 0) throw new EtsyImageFetchError('NOT_IMAGE', 'Photo was empty');

  return { data: res.body, contentType, filename: `photo.${EXTENSION_BY_TYPE[contentType] ?? 'jpg'}` };
}
