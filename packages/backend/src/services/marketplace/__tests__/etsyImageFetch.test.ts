/**
 * ADR-135 batch E-B3, acceptance 5: the SSRF-guarded photo fetcher. A table of URLs and responses
 * that must be rejected (http, metadata address, localhost, 10.x, host not on the allowlist, a
 * redirect, a body over 10 MB, text/html), the Cloudinary transform applied exactly once, and the
 * pinned-address behaviour. DNS and the HTTPS transport are injected fakes; nothing touches a network.
 * The default (real) transport is exercised only by the typecheck, not by these tests.
 */

import {
  EtsyImageFetchError,
  ETSY_CLOUDINARY_TRANSFORM,
  ETSY_IMAGE_HOST_ALLOWLIST,
  ETSY_IMAGE_MAX_BYTES,
  applyEtsyCloudinaryTransform,
  fetchEtsyImage,
  isPublicIpAddress,
  isTransientEtsyImageError,
  readEtsyImageHostAllowlist,
  validateEtsyImageUrl,
} from '../etsyImageFetch';
import type { EtsyDnsLookup, EtsyImageTransportRequest, EtsyImageTransportResponse } from '../etsyImageFetch';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const PUBLIC_LOOKUP: EtsyDnsLookup = async () => [{ address: '93.184.216.34', family: 4 }];

function okTransport(over: Partial<EtsyImageTransportResponse> = {}) {
  return jest.fn<Promise<EtsyImageTransportResponse>, [EtsyImageTransportRequest]>(async () => ({
    status: 200,
    headers: { 'content-type': 'image/jpeg' },
    body: JPEG,
    ...over,
  }));
}

async function rejection(promise: Promise<unknown>): Promise<EtsyImageFetchError> {
  try {
    await promise;
  } catch (e) {
    return e as EtsyImageFetchError;
  }
  throw new Error('expected the fetch to be rejected');
}

describe('validateEtsyImageUrl (pure, no network)', () => {
  const cases: Array<[string, string, string]> = [
    ['http: URL', 'http://res.cloudinary.com/demo/image/upload/a.jpg', 'NOT_HTTPS'],
    ['cloud metadata address', 'https://169.254.169.254/latest/meta-data/', 'HOST_NOT_ALLOWED'],
    ['localhost', 'https://localhost/a.jpg', 'HOST_NOT_ALLOWED'],
    ['loopback literal', 'https://127.0.0.1/a.jpg', 'HOST_NOT_ALLOWED'],
    ['10.x literal', 'https://10.0.0.5/a.jpg', 'HOST_NOT_ALLOWED'],
    ['IPv6 literal', 'https://[::1]/a.jpg', 'HOST_NOT_ALLOWED'],
    ['host not on the allowlist', 'https://evil.example.com/a.jpg', 'HOST_NOT_ALLOWED'],
    ['look-alike suffix host', 'https://res.cloudinary.com.evil.com/a.jpg', 'HOST_NOT_ALLOWED'],
    ['look-alike prefix host', 'https://evilres.cloudinary.com/a.jpg', 'HOST_NOT_ALLOWED'],
    ['trailing dot host', 'https://res.cloudinary.com./demo/image/upload/a.jpg', 'HOST_NOT_ALLOWED'],
    ['credentials in the URL', 'https://user:pw@res.cloudinary.com/demo/image/upload/a.jpg', 'CREDENTIALS'],
    ['username only', 'https://user@res.cloudinary.com/demo/image/upload/a.jpg', 'CREDENTIALS'],
    ['non-standard port', 'https://res.cloudinary.com:8443/demo/image/upload/a.jpg', 'BAD_PORT'],
    ['file: URL', 'file:///etc/passwd', 'NOT_HTTPS'],
    ['not a URL', 'not a url', 'BAD_URL'],
    ['empty string', '   ', 'BAD_URL'],
  ];
  it.each(cases)('rejects %s', (_label, url, code) => {
    let err: any;
    try {
      validateEtsyImageUrl(url);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(EtsyImageFetchError);
    expect(err.code).toBe(code);
  });

  it('rejects non-strings and over-long URLs', () => {
    expect(() => validateEtsyImageUrl(undefined)).toThrow(EtsyImageFetchError);
    expect(() => validateEtsyImageUrl(42)).toThrow(EtsyImageFetchError);
    expect(() => validateEtsyImageUrl(`https://res.cloudinary.com/${'a'.repeat(3000)}`)).toThrow(EtsyImageFetchError);
  });

  it('accepts the allowlisted hosts on https, port 443 or none, any host case', () => {
    expect(validateEtsyImageUrl('https://res.cloudinary.com/demo/image/upload/a.jpg').hostname).toBe('res.cloudinary.com');
    expect(validateEtsyImageUrl('https://RES.Cloudinary.com:443/demo/image/upload/a.jpg').hostname).toBe('res.cloudinary.com');
    expect(validateEtsyImageUrl('https://i.ebayimg.com/images/g/abc/s-l1600.jpg').hostname).toBe('i.ebayimg.com');
  });
});

describe('host allowlist', () => {
  it('starts with exactly the two ADR hosts', () => {
    expect([...ETSY_IMAGE_HOST_ALLOWLIST]).toEqual(['res.cloudinary.com', 'i.ebayimg.com']);
  });

  it('adds only well-formed exact hostnames from the optional env variable', () => {
    const list = readEtsyImageHostAllowlist({ ETSY_IMAGE_HOST_ALLOWLIST: ' Photos.Example.org , 10.0.0.1, localhost, *.evil.com, bad host, ok.example.net ' });
    expect(list).toEqual(['res.cloudinary.com', 'i.ebayimg.com', 'photos.example.org', 'ok.example.net']);
  });

  it('lets a fetch through for an env-added host and still blocks everything else', async () => {
    const transport = okTransport();
    const deps = { env: { ETSY_IMAGE_HOST_ALLOWLIST: 'photos.example.org' }, lookup: PUBLIC_LOOKUP, transport };
    await expect(fetchEtsyImage('https://photos.example.org/a.jpg', deps)).resolves.toBeDefined();
    const err = await rejection(fetchEtsyImage('https://other.example.org/a.jpg', deps));
    expect(err.code).toBe('HOST_NOT_ALLOWED');
  });
});

describe('isPublicIpAddress', () => {
  const publicOnes = ['93.184.216.34', '8.8.8.8', '1.1.1.1', '172.32.0.1', '172.15.255.255', '2606:2800:220:1:248:1893:25c8:1946', '2a00:1450:4001:81b::200e', '::ffff:8.8.8.8'];
  const nonPublic = [
    '127.0.0.1', '127.255.255.255', '10.0.0.1', '10.255.255.255', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254',
    '100.64.0.1', '100.127.255.255', '0.0.0.0', '224.0.0.1', '255.255.255.255', '192.0.2.5', '198.51.100.7', '203.0.113.9', '198.18.0.1',
    '::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', '::ffff:10.0.0.1', '::ffff:127.0.0.1', '::ffff:169.254.169.254', '64:ff9b::a00:1',
    '2001:db8::1', '2002:c000:204::1', 'ff02::1', '::127.0.0.1', 'not an ip', '', '999.1.1.1', '1.2.3',
  ];
  it.each(publicOnes)('treats %s as public', (ip) => expect(isPublicIpAddress(ip)).toBe(true));
  it.each(nonPublic)('treats %p as not public', (ip) => expect(isPublicIpAddress(ip)).toBe(false));
  it('is false for non-strings', () => {
    expect(isPublicIpAddress(undefined as any)).toBe(false);
    expect(isPublicIpAddress(null as any)).toBe(false);
  });
});

describe('Cloudinary transform', () => {
  const base = 'https://res.cloudinary.com/demo/image/upload/v1699/folder/pic.jpg';

  it('inserts f_jpg,q_90,w_2000,c_limit right after /upload/', () => {
    expect(ETSY_CLOUDINARY_TRANSFORM).toBe('f_jpg,q_90,w_2000,c_limit');
    expect(applyEtsyCloudinaryTransform(new URL(base)).toString()).toBe(
      'https://res.cloudinary.com/demo/image/upload/f_jpg,q_90,w_2000,c_limit/v1699/folder/pic.jpg'
    );
  });

  it('applies the transform exactly once, even when applied twice', () => {
    const once = applyEtsyCloudinaryTransform(new URL(base));
    const twice = applyEtsyCloudinaryTransform(once);
    expect(twice.toString()).toBe(once.toString());
    expect(twice.pathname.split(ETSY_CLOUDINARY_TRANSFORM).length - 1).toBe(1);
  });

  it('only changes the path after the first /upload/', () => {
    const tricky = new URL('https://res.cloudinary.com/demo/image/upload/v1/upload/pic.jpg');
    expect(applyEtsyCloudinaryTransform(tricky).pathname).toBe('/demo/image/upload/f_jpg,q_90,w_2000,c_limit/v1/upload/pic.jpg');
  });

  it('leaves other hosts and URLs without /upload/ alone', () => {
    const ebay = new URL('https://i.ebayimg.com/images/g/abc/s-l1600.jpg');
    expect(applyEtsyCloudinaryTransform(ebay).toString()).toBe(ebay.toString());
    const noUpload = new URL('https://res.cloudinary.com/demo/image/fetch/pic.jpg');
    expect(applyEtsyCloudinaryTransform(noUpload).toString()).toBe(noUpload.toString());
  });

  it('reaches the transport transformed once and the original URL object is not mutated', async () => {
    const transport = okTransport();
    await fetchEtsyImage(base, { lookup: PUBLIC_LOOKUP, transport });
    const sent = transport.mock.calls[0][0];
    expect(sent.url.toString()).toBe('https://res.cloudinary.com/demo/image/upload/f_jpg,q_90,w_2000,c_limit/v1699/folder/pic.jpg');
    expect(sent.url.pathname.split(ETSY_CLOUDINARY_TRANSFORM).length - 1).toBe(1);
  });
});

describe('fetchEtsyImage guards', () => {
  const good = 'https://res.cloudinary.com/demo/image/upload/v1/pic.jpg';

  it('returns the bytes, a lower-cased media type and a generic filename on success', async () => {
    const transport = okTransport({ headers: { 'content-type': 'Image/JPEG; charset=binary' } });
    const out = await fetchEtsyImage(good, { lookup: PUBLIC_LOOKUP, transport });
    expect(out.data.equals(JPEG)).toBe(true);
    expect(out.contentType).toBe('image/jpeg');
    expect(out.filename).toBe('photo.jpg');
  });

  it('uses a matching extension for png and a safe default for odd image types', async () => {
    const png = await fetchEtsyImage(good, { lookup: PUBLIC_LOOKUP, transport: okTransport({ headers: { 'content-type': 'image/png' } }) });
    expect(png.filename).toBe('photo.png');
    const odd = await fetchEtsyImage(good, { lookup: PUBLIC_LOOKUP, transport: okTransport({ headers: { 'content-type': 'image/x-weird' } }) });
    expect(odd.filename).toBe('photo.jpg');
  });

  it('rejects a bad URL before any DNS or network work', async () => {
    const lookup = jest.fn(PUBLIC_LOOKUP);
    const transport = okTransport();
    for (const url of ['http://res.cloudinary.com/demo/image/upload/a.jpg', 'https://169.254.169.254/x', 'https://localhost/x', 'https://10.1.2.3/x', 'https://evil.example.com/x']) {
      await rejection(fetchEtsyImage(url, { lookup, transport }));
    }
    expect(lookup).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
  });

  it.each([
    ['loopback', [{ address: '127.0.0.1', family: 4 }]],
    ['link-local metadata', [{ address: '169.254.169.254', family: 4 }]],
    ['RFC1918 10.x', [{ address: '10.0.0.8', family: 4 }]],
    ['RFC1918 192.168.x', [{ address: '192.168.0.8', family: 4 }]],
    ['IPv6 loopback', [{ address: '::1', family: 6 }]],
    ['IPv4-mapped private', [{ address: '::ffff:10.0.0.1', family: 6 }]],
    ['public answer mixed with a private one', [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.8', family: 4 }]],
  ])('rejects an allowlisted host that resolves to %s, and never connects', async (_label, answer) => {
    const transport = okTransport();
    const err = await rejection(fetchEtsyImage(good, { lookup: async () => answer as any, transport }));
    expect(err.code).toBe('PRIVATE_ADDRESS');
    expect(transport).not.toHaveBeenCalled();
  });

  it('reports DNS failures and empty answers as DNS_FAILED (transient)', async () => {
    const t1 = await rejection(fetchEtsyImage(good, { lookup: async () => { throw new Error('ENOTFOUND'); }, transport: okTransport() }));
    expect(t1.code).toBe('DNS_FAILED');
    const t2 = await rejection(fetchEtsyImage(good, { lookup: async () => [], transport: okTransport() }));
    expect(t2.code).toBe('DNS_FAILED');
    expect(isTransientEtsyImageError(t1)).toBe(true);
  });

  it('connects to the vetted address and passes the hostname separately (no second DNS answer is used)', async () => {
    const transport = okTransport();
    await fetchEtsyImage(good, { lookup: async () => [{ address: '93.184.216.34', family: 4 }, { address: '93.184.216.35', family: 4 }], transport });
    const sent = transport.mock.calls[0][0];
    expect(sent.address).toBe('93.184.216.34');
    expect(sent.family).toBe(4);
    expect(sent.url.hostname).toBe('res.cloudinary.com');
    expect(sent.timeoutMs).toBe(15000);
    expect(sent.maxBytes).toBe(ETSY_IMAGE_MAX_BYTES);
  });

  it.each([301, 302, 303, 307, 308])('rejects a %i redirect and does not follow it', async (status) => {
    const transport = okTransport({ status, headers: { location: 'http://169.254.169.254/latest/meta-data/' }, body: Buffer.alloc(0) });
    const err = await rejection(fetchEtsyImage(good, { lookup: PUBLIC_LOOKUP, transport }));
    expect(err.code).toBe('REDIRECT');
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('rejects a body over 10 MB (actual size) and a declared length over 10 MB', async () => {
    expect(ETSY_IMAGE_MAX_BYTES).toBe(10 * 1024 * 1024);
    const big = okTransport({ body: Buffer.alloc(ETSY_IMAGE_MAX_BYTES + 1) });
    expect((await rejection(fetchEtsyImage(good, { lookup: PUBLIC_LOOKUP, transport: big }))).code).toBe('TOO_LARGE');
    const declared = okTransport({ headers: { 'content-type': 'image/jpeg', 'content-length': String(ETSY_IMAGE_MAX_BYTES + 1) } });
    expect((await rejection(fetchEtsyImage(good, { lookup: PUBLIC_LOOKUP, transport: declared }))).code).toBe('TOO_LARGE');
    const exactly = okTransport({ body: Buffer.alloc(ETSY_IMAGE_MAX_BYTES, 1) });
    await expect(fetchEtsyImage(good, { lookup: PUBLIC_LOOKUP, transport: exactly })).resolves.toBeDefined();
  });

  it.each([['text/html'], ['application/json'], ['application/octet-stream'], ['']])('rejects content-type %p', async (type) => {
    const err = await rejection(fetchEtsyImage(good, { lookup: PUBLIC_LOOKUP, transport: okTransport({ headers: { 'content-type': type } }) }));
    expect(err.code).toBe('NOT_IMAGE');
  });

  it('rejects a missing content-type and an empty body', async () => {
    const none = await rejection(fetchEtsyImage(good, { lookup: PUBLIC_LOOKUP, transport: okTransport({ headers: {} }) }));
    expect(none.code).toBe('NOT_IMAGE');
    const empty = await rejection(fetchEtsyImage(good, { lookup: PUBLIC_LOOKUP, transport: okTransport({ body: Buffer.alloc(0) }) }));
    expect(empty.code).toBe('NOT_IMAGE');
  });

  it('classifies HTTP errors: 4xx is permanent, 5xx is transient', async () => {
    const e404 = await rejection(fetchEtsyImage(good, { lookup: PUBLIC_LOOKUP, transport: okTransport({ status: 404 }) }));
    expect(e404.code).toBe('HTTP_ERROR');
    expect(isTransientEtsyImageError(e404)).toBe(false);
    const e503 = await rejection(fetchEtsyImage(good, { lookup: PUBLIC_LOOKUP, transport: okTransport({ status: 503 }) }));
    expect(isTransientEtsyImageError(e503)).toBe(true);
  });

  it('passes transport timeouts and network errors through as transient errors', async () => {
    const timeout = jest.fn(async () => { throw new EtsyImageFetchError('TIMEOUT', 'Photo download timed out'); });
    const err = await rejection(fetchEtsyImage(good, { lookup: PUBLIC_LOOKUP, transport: timeout as any }));
    expect(err.code).toBe('TIMEOUT');
    expect(isTransientEtsyImageError(err)).toBe(true);
    expect(isTransientEtsyImageError(new Error('x'))).toBe(false);
    expect(isTransientEtsyImageError(new EtsyImageFetchError('NOT_IMAGE', 'x'))).toBe(false);
  });

  it('honors injected size and timeout limits', async () => {
    const transport = okTransport();
    await fetchEtsyImage(good, { lookup: PUBLIC_LOOKUP, transport, maxBytes: 1234, timeoutMs: 99 });
    expect(transport.mock.calls[0][0]).toMatchObject({ maxBytes: 1234, timeoutMs: 99 });
    const err = await rejection(fetchEtsyImage(good, { lookup: PUBLIC_LOOKUP, transport: okTransport({ body: Buffer.alloc(2000) }), maxBytes: 1234 }));
    expect(err.code).toBe('TOO_LARGE');
  });
});
