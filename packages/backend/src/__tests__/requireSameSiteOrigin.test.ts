/**
 * requireSameSiteOrigin (2026-09-30): Origin / Referer allowlist for the CSRF-exempt cookie POSTs /auth/refresh and
 * /auth/logout. Also checks the two routes are wired to it and that the extension Bearer carve-out is untouched.
 */
import fs from 'fs';
import path from 'path';
import { requireSameSiteOrigin, isAllowedWebOrigin } from '../middleware/requireSameSiteOrigin';
import { isCsrfExemptPath } from '../middleware/csrf';
import { isExtensionBearerRequest } from '../middleware/extensionBearerOnly';

const run = (headers: Record<string, string>) => {
  const req: any = { headers };
  const res: any = { statusCode: 200, body: undefined };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (b: unknown) => { res.body = b; return res; };
  const next = jest.fn();
  requireSameSiteOrigin(req, res, next);
  return { res, next };
};

describe('requireSameSiteOrigin', () => {
  const saved = process.env.ALLOWED_ORIGINS;
  beforeEach(() => { process.env.ALLOWED_ORIGINS = 'http://localhost:3000,https://staging.example.test'; });
  afterAll(() => { if (saved === undefined) delete process.env.ALLOWED_ORIGINS; else process.env.ALLOWED_ORIGINS = saved; });

  it('allows the production site, www, api and configured origins', () => {
    for (const origin of ['https://finda.sale', 'https://www.finda.sale', 'https://api.finda.sale', 'http://localhost:3000', 'https://staging.example.test']) {
      expect(run({ origin }).next).toHaveBeenCalled();
    }
  });

  it('allows the project Vercel previews only', () => {
    expect(isAllowedWebOrigin('https://findasale-git-feature-x.vercel.app')).toBe(true);
    expect(isAllowedWebOrigin('https://evil.vercel.app')).toBe(false);
  });

  it('refuses a foreign or same-site-but-unlisted origin with 403 ORIGIN_NOT_ALLOWED', () => {
    for (const origin of ['https://evil.example', 'https://evil.finda.sale', 'https://finda.sale.evil.example', 'null']) {
      const { res, next } = run({ origin });
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('ORIGIN_NOT_ALLOWED');
    }
  });

  it('falls back to the Referer when Origin is absent', () => {
    expect(run({ referer: 'https://finda.sale/organizer/dashboard' }).next).toHaveBeenCalled();
    const bad = run({ referer: 'https://evil.example/page' });
    expect(bad.next).not.toHaveBeenCalled();
    expect(bad.res.statusCode).toBe(403);
  });

  it('allows a request with neither header (non-browser client)', () => {
    expect(run({}).next).toHaveBeenCalled();
  });

  it('the extension origin is allowed only with the X-Refresh-Token header and no session cookie', () => {
    const ext = 'chrome-extension://abcdefghijklmnop';
    expect(run({ origin: ext, 'x-refresh-token': 'tok' }).next).toHaveBeenCalled();
    expect(run({ origin: ext }).res.statusCode).toBe(403); // no header: nothing to authenticate with but a cookie
    expect(run({ origin: ext, 'x-refresh-token': 'tok', cookie: 'refreshToken=abc' }).res.statusCode).toBe(403);
  });
});

describe('wiring', () => {
  const routes = fs.readFileSync(path.join(__dirname, '../routes/auth.ts'), 'utf8');
  it('POST /logout and POST /refresh run the origin check before their handlers', () => {
    expect(routes).toMatch(/router\.post\('\/logout', requireSameSiteOrigin,/);
    expect(routes).toMatch(/router\.post\('\/refresh', requireSameSiteOrigin,/);
  });

  it('both paths stay on the CSRF double-submit exemption (the origin check is what covers them)', () => {
    expect(isCsrfExemptPath('/api/auth/refresh')).toBe(true);
    expect(isCsrfExemptPath('/api/auth/logout')).toBe(true);
    // Sibling authenticated auth mutations are NOT exempt.
    expect(isCsrfExemptPath('/api/auth/change-password')).toBe(false);
  });

  it('the extension Bearer carve-out for /api/extension is unchanged', () => {
    expect(isExtensionBearerRequest({ path: '/api/extension/items', headers: { authorization: 'Bearer x' } } as any)).toBe(true);
    expect(isExtensionBearerRequest({ path: '/api/auth/refresh', headers: { authorization: 'Bearer x' } } as any)).toBe(false);
  });
});
