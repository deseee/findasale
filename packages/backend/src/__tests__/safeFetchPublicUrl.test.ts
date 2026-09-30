/**
 * safeFetchPublicUrl: public-host SSRF guard used for organizer-typed brand logo URLs (2026-09-29).
 * Pure functions plus injected resolvers; no network, no real DNS.
 */
import {
  isBlockedIp,
  isSafePublicUrlSyntax,
  isSafePublicFetchUrl,
  safePublicLookup,
  SAFE_PUBLIC_AXIOS_OPTIONS,
} from '../utils/safeFetchPublicUrl';

describe('isBlockedIp', () => {
  it('blocks loopback, private, link-local, metadata, CGNAT, multicast and reserved IPv4', () => {
    for (const ip of [
      '0.0.0.0', '10.1.2.3', '100.64.0.1', '127.0.0.1', '127.255.255.254', '169.254.169.254',
      '172.16.0.1', '172.31.255.255', '192.168.1.1', '192.0.2.5', '198.18.0.1', '224.0.0.1', '255.255.255.255',
    ]) {
      expect(isBlockedIp(ip)).toBe(true);
    }
  });

  it('allows ordinary public IPv4, including neighbors of blocked ranges', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '172.15.255.255', '172.32.0.1', '100.63.255.255', '100.128.0.1', '169.253.0.1', '203.0.114.1']) {
      expect(isBlockedIp(ip)).toBe(false);
    }
  });

  it('blocks IPv6 loopback, unspecified, ULA, link-local, multicast and documentation', () => {
    for (const ip of ['::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'fe80::1%eth0', 'ff02::1', '2001:db8::1', '2001::1', '[::1]']) {
      expect(isBlockedIp(ip)).toBe(true);
    }
  });

  it('judges IPv4-mapped, NAT64 and 6to4 IPv6 by the embedded IPv4', () => {
    expect(isBlockedIp('::ffff:169.254.169.254')).toBe(true);
    expect(isBlockedIp('::ffff:a9fe:a9fe')).toBe(true);
    expect(isBlockedIp('::ffff:127.0.0.1')).toBe(true);
    expect(isBlockedIp('::ffff:8.8.8.8')).toBe(false);
    expect(isBlockedIp('64:ff9b::7f00:1')).toBe(true);
    expect(isBlockedIp('64:ff9b::808:808')).toBe(false);
    expect(isBlockedIp('2002:a9fe:a9fe::1')).toBe(true);
    expect(isBlockedIp('2002:0808:0808::1')).toBe(false);
  });

  it('allows global unicast IPv6', () => {
    expect(isBlockedIp('2606:4700:4700::1111')).toBe(false);
    expect(isBlockedIp('2a00:1450:4001:81b::200e')).toBe(false);
  });

  it('fails closed on garbage', () => {
    for (const ip of ['', 'not-an-ip', '999.1.1.1', '1.2.3', '12345::']) {
      expect(isBlockedIp(ip)).toBe(true);
    }
  });
});

describe('isSafePublicUrlSyntax', () => {
  it('accepts https URLs on real DNS names, default or 443 port', () => {
    for (const u of [
      'https://logos.example.org/a.png',
      'https://res.cloudinary.com/demo/image/upload/a.jpg',
      'https://my-shop.example.co.uk:443/logo.svg?v=2',
      'https://xn--bcher-kva.example/logo.png',
    ]) {
      expect(isSafePublicUrlSyntax(u)).toBe(true);
    }
  });

  it('rejects http, other schemes, credentials and non-443 ports', () => {
    for (const u of [
      'http://logos.example.org/a.png',
      'ftp://logos.example.org/a.png',
      'file:///etc/passwd',
      'javascript:alert(1)',
      'https://user:pw@logos.example.org/a.png',
      'https://user@logos.example.org/a.png',
      'https://logos.example.org:8443/a.png',
      'https://logos.example.org:80/a.png',
    ]) {
      expect(isSafePublicUrlSyntax(u)).toBe(false);
    }
  });

  it('rejects IP literals in every spelling and internal-looking names', () => {
    for (const u of [
      'https://127.0.0.1/a.png',
      'https://169.254.169.254/latest/meta-data',
      'https://2130706433/a.png',
      'https://0x7f000001/a.png',
      'https://0177.0.0.1/a.png',
      'https://[::1]/a.png',
      'https://[::ffff:127.0.0.1]/a.png',
      'https://localhost/a.png',
      'https://localhost./a.png',
      'https://app.localhost/a.png',
      'https://printer.local/a.png',
      'https://metadata.google.internal/a.png',
      'https://intranet/a.png',
      'https://nas.home.arpa/a.png',
    ]) {
      expect(isSafePublicUrlSyntax(u)).toBe(false);
    }
  });

  it('rejects non-strings, empty and oversized input without throwing', () => {
    expect(isSafePublicUrlSyntax(undefined)).toBe(false);
    expect(isSafePublicUrlSyntax(null)).toBe(false);
    expect(isSafePublicUrlSyntax(42)).toBe(false);
    expect(isSafePublicUrlSyntax('')).toBe(false);
    expect(isSafePublicUrlSyntax('not a url')).toBe(false);
    expect(isSafePublicUrlSyntax('https://example.org/' + 'a'.repeat(3000))).toBe(false);
  });
});

describe('isSafePublicFetchUrl (pre-flight with injected DNS)', () => {
  const answer = (...addrs: string[]) => async () => addrs.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));

  it('accepts a name that resolves only to public addresses', async () => {
    expect(await isSafePublicFetchUrl('https://logos.example.org/a.png', answer('93.184.216.34', '2606:2800:220:1::1'))).toBe(true);
  });

  it('rejects when ANY resolved address is internal (mixed answers, rebinding-style)', async () => {
    expect(await isSafePublicFetchUrl('https://logos.example.org/a.png', answer('93.184.216.34', '169.254.169.254'))).toBe(false);
    expect(await isSafePublicFetchUrl('https://logos.example.org/a.png', answer('10.0.0.5'))).toBe(false);
    expect(await isSafePublicFetchUrl('https://logos.example.org/a.png', answer('::1'))).toBe(false);
  });

  it('rejects on DNS failure, empty answers and syntax failures without resolving', async () => {
    const boom = async () => { throw new Error('ENOTFOUND'); };
    expect(await isSafePublicFetchUrl('https://logos.example.org/a.png', boom)).toBe(false);
    expect(await isSafePublicFetchUrl('https://logos.example.org/a.png', answer())).toBe(false);
    const spy = jest.fn(answer('8.8.8.8'));
    expect(await isSafePublicFetchUrl('http://logos.example.org/a.png', spy)).toBe(false);
    expect(await isSafePublicFetchUrl('https://127.0.0.1/a.png', spy)).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('safePublicLookup (connection-time pinning)', () => {
  const resolverOf = (addrs: Array<{ address: string; family: number }>, err: NodeJS.ErrnoException | null = null) =>
    (_host: string, cb: (e: NodeJS.ErrnoException | null, a: any[]) => void) => cb(err, addrs);

  it('returns the first address in single mode and all addresses in all mode when every address is public', () => {
    const addrs = [{ address: '93.184.216.34', family: 4 }, { address: '2606:2800:220:1::1', family: 6 }];
    const single = jest.fn();
    safePublicLookup('logos.example.org', {}, single, resolverOf(addrs));
    expect(single).toHaveBeenCalledWith(null, '93.184.216.34', 4);
    const many = jest.fn();
    safePublicLookup('logos.example.org', { all: true }, many, resolverOf(addrs));
    expect(many).toHaveBeenCalledWith(null, addrs);
  });

  it('fails the socket with ERR_SSRF_BLOCKED_ADDRESS when any address is internal', () => {
    const cb = jest.fn();
    safePublicLookup('logos.example.org', { all: true }, cb, resolverOf([{ address: '8.8.8.8', family: 4 }, { address: '169.254.169.254', family: 4 }]));
    const err = cb.mock.calls[0][0] as NodeJS.ErrnoException;
    expect(err.code).toBe('ERR_SSRF_BLOCKED_ADDRESS');
  });

  it('passes resolver errors through and errors on empty answers', () => {
    const e = Object.assign(new Error('nope'), { code: 'ENOTFOUND' }) as NodeJS.ErrnoException;
    const cb1 = jest.fn();
    safePublicLookup('x.example.org', {}, cb1, resolverOf([], e));
    expect(cb1.mock.calls[0][0]).toBe(e);
    const cb2 = jest.fn();
    safePublicLookup('x.example.org', {}, cb2, resolverOf([]));
    expect((cb2.mock.calls[0][0] as NodeJS.ErrnoException).code).toBe('ENOTFOUND');
  });
});

describe('SAFE_PUBLIC_AXIOS_OPTIONS', () => {
  it('disables redirects and env proxies, bounds the download, and pins the lookup on both agents', () => {
    expect(SAFE_PUBLIC_AXIOS_OPTIONS.maxRedirects).toBe(0);
    expect(SAFE_PUBLIC_AXIOS_OPTIONS.proxy).toBe(false);
    expect(SAFE_PUBLIC_AXIOS_OPTIONS.maxContentLength).toBeLessThanOrEqual(25 * 1024 * 1024);
    expect(SAFE_PUBLIC_AXIOS_OPTIONS.timeout).toBeGreaterThan(0);
    expect((SAFE_PUBLIC_AXIOS_OPTIONS.httpsAgent as any).options.lookup).toBe(safePublicLookup);
    expect((SAFE_PUBLIC_AXIOS_OPTIONS.httpAgent as any).options.lookup).toBe(safePublicLookup);
  });
});
