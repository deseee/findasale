import { isSafeFetchUrl, assertSafeFetchUrl, isIpLiteralHost, SAFE_FETCH_AXIOS_OPTIONS } from '../safeFetchUrl';

const OLD = process.env.SAFE_FETCH_ALLOWED_HOSTS;
afterEach(() => {
  if (OLD === undefined) delete process.env.SAFE_FETCH_ALLOWED_HOSTS;
  else process.env.SAFE_FETCH_ALLOWED_HOSTS = OLD;
});

describe('isSafeFetchUrl', () => {
  it('accepts https Cloudinary delivery URLs', () => {
    expect(isSafeFetchUrl('https://res.cloudinary.com/demo/image/upload/v1/a.jpg')).toBe(true);
    expect(isSafeFetchUrl('https://res-1.cloudinary.com/demo/image/upload/a.jpg')).toBe(true);
  });

  it('rejects non-https, credentials, odd ports, look-alike hosts and junk', () => {
    expect(isSafeFetchUrl('http://res.cloudinary.com/demo/a.jpg')).toBe(false);
    expect(isSafeFetchUrl('https://user:pw@res.cloudinary.com/demo/a.jpg')).toBe(false);
    expect(isSafeFetchUrl('https://res.cloudinary.com:8443/demo/a.jpg')).toBe(false);
    expect(isSafeFetchUrl('https://res.cloudinary.com.evil.example/a.jpg')).toBe(false);
    expect(isSafeFetchUrl('https://evilres.cloudinary.com/a.jpg')).toBe(false);
    expect(isSafeFetchUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeFetchUrl('not a url')).toBe(false);
    expect(isSafeFetchUrl('')).toBe(false);
    expect(isSafeFetchUrl(undefined)).toBe(false);
    expect(isSafeFetchUrl(42)).toBe(false);
    expect(isSafeFetchUrl('https://res.cloudinary.com/' + 'a'.repeat(3000))).toBe(false);
  });

  it('rejects internal hosts and IP literals in every spelling', () => {
    for (const u of [
      'https://169.254.169.254/latest/meta-data',
      'https://127.0.0.1/x.jpg',
      'https://[::1]/x.jpg',
      'https://[::ffff:127.0.0.1]/x.jpg',
      'https://2130706433/x.jpg',
      'https://0x7f000001/x.jpg',
      'https://localhost/x.jpg',
      'https://internal.railway.internal/x.jpg',
    ]) {
      expect(isSafeFetchUrl(u)).toBe(false);
    }
  });

  it('honours SAFE_FETCH_ALLOWED_HOSTS (exact and *.suffix) but never for IP literals', () => {
    process.env.SAFE_FETCH_ALLOWED_HOSTS = 'images.example.com, *.cdn.example.org, 10.0.0.5';
    expect(isSafeFetchUrl('https://images.example.com/a.jpg')).toBe(true);
    expect(isSafeFetchUrl('https://eu.cdn.example.org/a.jpg')).toBe(true);
    expect(isSafeFetchUrl('https://cdn.example.org/a.jpg')).toBe(false); // suffix pattern needs a subdomain
    expect(isSafeFetchUrl('https://other.example.com/a.jpg')).toBe(false);
    expect(isSafeFetchUrl('https://10.0.0.5/a.jpg')).toBe(false);
  });
});

describe('helpers', () => {
  it('assertSafeFetchUrl returns the url or throws', () => {
    const ok = 'https://res.cloudinary.com/demo/a.jpg';
    expect(assertSafeFetchUrl(ok)).toBe(ok);
    expect(() => assertSafeFetchUrl('https://169.254.169.254/')).toThrow();
  });
  it('isIpLiteralHost flags IPv4 and IPv6 forms only', () => {
    expect(isIpLiteralHost('1.2.3.4')).toBe(true);
    expect(isIpLiteralHost('[::1]')).toBe(true);
    expect(isIpLiteralHost('res.cloudinary.com')).toBe(false);
  });
  it('axios options forbid redirects', () => {
    expect(SAFE_FETCH_AXIOS_OPTIONS.maxRedirects).toBe(0);
  });
});
