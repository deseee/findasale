/**
 * safeFetchPublicUrl.ts -- SSRF guard, "public host" mode (2026-09-29).
 *
 * Companion to safeFetchUrl.ts. That file is a strict HOST ALLOWLIST (Cloudinary plus configured
 * hosts) and stays the right guard for photo URLs we store or import. It is the wrong tool for
 * organizer-typed brand logo URLs (Organizer.brandLogoUrl): an organizer may legitimately host a
 * logo on their own website or any image host, and an allowlist would silently break real logos.
 *
 * DECISION: brand logos use THIS mode. Any public DNS https host is allowed, and the request is
 * refused when it could reach an internal network. Layers:
 *   1. Syntax (isSafePublicUrlSyntax): https only, no credentials, port 443 only, hostname must be a
 *      real DNS name (never an IP literal in any spelling, never localhost / .local / .internal /
 *      single-label names).
 *   2. Address (isBlockedIp): loopback, private (RFC 1918), link-local (169.254.0.0/16 including the
 *      cloud metadata address), CGNAT, multicast, reserved and documentation ranges, and the IPv6
 *      equivalents (::1, fc00::/7, fe80::/10, IPv4-mapped / NAT64 / 6to4 forms of a blocked IPv4).
 *   3. Connection-time pinning (safePublicLookup + SAFE_PUBLIC_AXIOS_OPTIONS): the address check runs
 *      inside the socket's own DNS lookup, so the address that is validated is the address that is
 *      connected to. A pre-flight DNS check alone can be beaten by DNS rebinding (a name that answers
 *      with a public IP first and 169.254.169.254 second); pinning closes that.
 *   4. No redirects (maxRedirects: 0), no env proxy (proxy: false, so a proxy cannot resolve the
 *      name behind our back), bounded size and time.
 *
 * Callers must treat a refusal as "skip the image": every check here returns false or null, and the
 * lookup fails the socket with an error the caller's existing try/catch already handles.
 */

import dns from 'dns';
import http from 'http';
import https from 'https';
import net from 'net';
import { isIpLiteralHost, SAFE_FETCH_AXIOS_OPTIONS } from './safeFetchUrl';

const MAX_URL_LENGTH = 2048;

/** Name suffixes / labels that are internal by convention, whatever DNS says. */
const INTERNAL_SUFFIXES = ['.localhost', '.local', '.internal', '.localdomain', '.lan', '.home.arpa', '.intranet', '.corp'];

// ---------------------------------------------------------------------------------------------
// IP classification
// ---------------------------------------------------------------------------------------------

function ipv4ToInt(ip: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

/** [network, prefix length] pairs that are never public unicast. */
const BLOCKED_V4: Array<[string, number]> = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // RFC 1918
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, includes 169.254.169.254 metadata
  ['172.16.0.0', 12], // RFC 1918
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.88.99.0', 24], // deprecated 6to4 relay
  ['192.168.0.0', 16], // RFC 1918
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, includes 255.255.255.255
];

function isBlockedIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return true; // unparseable: fail closed
  return BLOCKED_V4.some(([net_, prefix]) => {
    const base = ipv4ToInt(net_) as number;
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return ((n & mask) >>> 0) === ((base & mask) >>> 0);
  });
}

/** Expand an IPv6 literal to 8 numeric hextets, or null when it is malformed. */
function expandIpv6(input: string): number[] | null {
  let ip = input.replace(/^\[|\]$/g, '');
  const zone = ip.indexOf('%');
  if (zone !== -1) ip = ip.slice(0, zone);
  // Embedded dotted IPv4 tail (::ffff:1.2.3.4) becomes two hextets.
  const tail = /^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip);
  if (tail) {
    const v4 = ipv4ToInt(tail[2]);
    if (v4 === null) return null;
    ip = tail[1] + ((v4 >>> 16) & 0xffff).toString(16) + ':' + (v4 & 0xffff).toString(16);
  }
  const halves = ip.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
  const all = halves.length === 2 ? [...head, ...Array(missing).fill('0'), ...rest] : head;
  if (all.length !== 8) return null;
  const out: number[] = [];
  for (const h of all) {
    if (!/^[0-9a-f]{1,4}$/i.test(h)) return null;
    out.push(parseInt(h, 16));
  }
  return out;
}

function v4FromHextets(hi: number, lo: number): string {
  return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
}

function isBlockedIpv6(ip: string): boolean {
  const h = expandIpv6(ip);
  if (!h) return true; // unparseable: fail closed
  const firstSixZero = h.slice(0, 6).every((x) => x === 0);
  // ::, ::1 and the deprecated IPv4-compatible ::a.b.c.d form
  if (firstSixZero) return true;
  // IPv4-mapped ::ffff:a.b.c.d -> judge the embedded IPv4
  if (h.slice(0, 5).every((x) => x === 0) && h[5] === 0xffff) return isBlockedIpv4(v4FromHextets(h[6], h[7]));
  // NAT64 well-known prefix 64:ff9b::/96 -> judge the embedded IPv4; the local-use /48 is blocked
  if (h[0] === 0x64 && h[1] === 0xff9b) {
    if (h.slice(2, 6).every((x) => x === 0)) return isBlockedIpv4(v4FromHextets(h[6], h[7]));
    return true;
  }
  // 6to4 2002::/16 embeds an IPv4 in hextets 1-2
  if (h[0] === 0x2002) return isBlockedIpv4(v4FromHextets(h[1], h[2]));
  // Only global unicast 2000::/3 is public; everything else (fc00::/7, fe80::/10, ff00::/8, 100::/64 ...) is not
  if (h[0] < 0x2000 || h[0] > 0x3fff) return true;
  if (h[0] === 0x2001 && h[1] === 0) return true; // Teredo 2001::/32
  if (h[0] === 0x2001 && h[1] === 0x0db8) return true; // documentation 2001:db8::/32
  if (h[0] === 0x2001 && h[1] >= 0x0010 && h[1] <= 0x002f) return true; // ORCHID and other IETF special-purpose blocks
  if (h[0] === 0x3fff && h[1] <= 0x0fff) return true; // documentation 3fff::/20
  return false;
}

/** True when `ip` is anything other than a public unicast address. Unparseable input counts as blocked. */
export function isBlockedIp(ip: string): boolean {
  const version = net.isIP(ip.replace(/^\[|\]$/g, '').split('%')[0]);
  if (version === 4) return isBlockedIpv4(ip);
  if (version === 6) return isBlockedIpv6(ip);
  return true;
}

// ---------------------------------------------------------------------------------------------
// URL syntax
// ---------------------------------------------------------------------------------------------

/**
 * True for an https URL whose host is a real DNS name (no IP literal, no internal-looking name),
 * with no credentials and no non-443 port. No DNS is performed; connection-time pinning does that.
 * Never throws.
 */
export function isSafePublicUrlSyntax(raw: unknown): boolean {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_URL_LENGTH) return false;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  if (u.username || u.password) return false;
  if (u.port && u.port !== '443') return false;
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (!host || isIpLiteralHost(host)) return false;
  if (!host.includes('.')) return false; // single-label names resolve via search domains / hosts files
  if (host === 'localhost' || INTERNAL_SUFFIXES.some((s) => host.endsWith(s))) return false;
  return true;
}

// ---------------------------------------------------------------------------------------------
// DNS: connection-time pinning and an optional pre-flight
// ---------------------------------------------------------------------------------------------

export type DnsLookupAll = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

const defaultLookupAll: DnsLookupAll = (hostname) => dns.promises.lookup(hostname, { all: true, verbatim: true });

/**
 * Pre-flight check: the URL is syntactically safe AND every address its host resolves to is public.
 * Returns false on any DNS error. `lookupAll` is injectable for tests. Never throws.
 */
export async function isSafePublicFetchUrl(raw: unknown, lookupAll: DnsLookupAll = defaultLookupAll): Promise<boolean> {
  if (!isSafePublicUrlSyntax(raw)) return false;
  try {
    const host = new URL(raw as string).hostname.replace(/\.$/, '');
    const addrs = await lookupAll(host);
    return addrs.length > 0 && addrs.every((a) => !isBlockedIp(a.address));
  } catch {
    return false;
  }
}

/**
 * dns.lookup replacement for http(s).Agent: resolves, then refuses the socket when ANY resolved
 * address is non-public. Because the socket connects to what this returns, validation cannot be
 * bypassed by a second, different DNS answer (DNS rebinding).
 */
export function safePublicLookup(
  hostname: string,
  options: dns.LookupOptions | number | undefined,
  callback: (err: NodeJS.ErrnoException | null, address?: string | dns.LookupAddress[], family?: number) => void,
  resolver: (host: string, cb: (err: NodeJS.ErrnoException | null, addrs: dns.LookupAddress[]) => void) => void = (host, cb) =>
    dns.lookup(host, { all: true, verbatim: true }, cb as any)
): void {
  const wantAll = typeof options === 'object' && options !== null && options.all === true;
  resolver(hostname, (err, addrs) => {
    if (err) return callback(err);
    if (!addrs || addrs.length === 0) {
      const e: NodeJS.ErrnoException = new Error(`No address for ${hostname}`);
      e.code = 'ENOTFOUND';
      return callback(e);
    }
    const bad = addrs.find((a) => isBlockedIp(a.address));
    if (bad) {
      const e: NodeJS.ErrnoException = new Error('Blocked: host resolves to a non-public address');
      e.code = 'ERR_SSRF_BLOCKED_ADDRESS';
      return callback(e);
    }
    if (wantAll) return callback(null, addrs);
    return callback(null, addrs[0].address, addrs[0].family);
  });
}

const publicHttpsAgent = new https.Agent({ lookup: safePublicLookup as any });
const publicHttpAgent = new http.Agent({ lookup: safePublicLookup as any });

/**
 * Axios options for the public-host mode: SAFE_FETCH_AXIOS_OPTIONS (no redirects, size and time
 * bounds) plus the pinning agents. proxy:false so an env proxy cannot bypass the pinned lookup.
 */
export const SAFE_PUBLIC_AXIOS_OPTIONS = {
  ...SAFE_FETCH_AXIOS_OPTIONS,
  proxy: false as const,
  httpAgent: publicHttpAgent,
  httpsAgent: publicHttpsAgent,
};
