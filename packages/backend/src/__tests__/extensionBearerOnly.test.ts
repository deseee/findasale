/**
 * /api/extension CSRF carve-out (2026-09-30). index.ts skips CSRF for Bearer requests on this path; that is only safe if
 * the request is then authenticated by the Bearer token ALONE. middleware/auth.authenticate reads req.cookies.accessToken
 * FIRST, so extensionBearerOnly (mounted first on the extension router) drops the cookie on Bearer requests and refuses
 * cookie-only writes. Includes the real authenticate() with a mocked Prisma to prove a cookie session cannot be used
 * when a (junk) Bearer header is present. No network.
 */
import jwt from 'jsonwebtoken';

const mockFindUnique = jest.fn();
jest.mock('../lib/prisma', () => ({ prisma: { user: { findUnique: (...a: unknown[]) => mockFindUnique(...a) } } }));

import { extensionBearerOnly, hasBearerToken, isExtensionBearerRequest, isExtensionPath } from '../middleware/extensionBearerOnly';
import { authenticate } from '../middleware/auth';

const SECRET = 'test-secret';
const mkRes = () => {
  const res: any = { statusCode: 200, body: undefined };
  res.status = jest.fn((c: number) => { res.statusCode = c; return res; });
  res.json = jest.fn((b: any) => { res.body = b; return res; });
  return res;
};
const mkReq = (method: string, path: string, headers: Record<string, string> = {}, cookies: Record<string, string> = {}) =>
  ({ method, path, headers, cookies }) as any;
const tokenFor = (id: string) => jwt.sign({ id, tokenVersion: 0 }, SECRET, { algorithm: 'HS256' });

beforeEach(() => {
  process.env.JWT_SECRET = SECRET;
  mockFindUnique.mockReset();
  mockFindUnique.mockImplementation(async ({ where }: any) => ({ id: where.id, roles: ['ORGANIZER'], tokenVersion: 0, organizer: null, roleSubscriptions: [], suspendedAt: null }));
});

describe('predicates', () => {
  it('hasBearerToken needs "Bearer <token>"', () => {
    expect(hasBearerToken({ headers: { authorization: 'Bearer abc' } } as any)).toBe(true);
    expect(hasBearerToken({ headers: { authorization: 'Bearer ' } } as any)).toBe(false);
    expect(hasBearerToken({ headers: { authorization: 'Basic abc' } } as any)).toBe(false);
    expect(hasBearerToken({ headers: {} } as any)).toBe(false);
  });
  it('isExtensionPath matches the mount and its children only', () => {
    expect(isExtensionPath('/api/extension')).toBe(true);
    expect(isExtensionPath('/api/extension/items/1/listed')).toBe(true);
    expect(isExtensionPath('/api/extensionx')).toBe(false);
    expect(isExtensionPath('/api/other')).toBe(false);
  });
  it('the CSRF carve-out needs both the path and a Bearer token', () => {
    expect(isExtensionBearerRequest(mkReq('POST', '/api/extension/items/1/listed', { authorization: 'Bearer t' }))).toBe(true);
    expect(isExtensionBearerRequest(mkReq('POST', '/api/extension/items/1/listed'))).toBe(false);
    expect(isExtensionBearerRequest(mkReq('POST', '/api/items/1', { authorization: 'Bearer t' }))).toBe(false);
  });
});

describe('extensionBearerOnly', () => {
  it('refuses a state-changing request without a Bearer token (a cookie-only write never gets through)', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const res = mkRes();
      const next = jest.fn();
      extensionBearerOnly(mkReq(method, '/api/extension/items/1/listed', {}, { accessToken: tokenFor('victim') }), res, next);
      expect(res.statusCode).toBe(401);
      expect(res.body).toMatchObject({ code: 'BEARER_REQUIRED' });
      expect(next).not.toHaveBeenCalled();
    }
  });

  it('lets a cookie-authenticated GET through (the organizer\'s web page reads /sync-health with its cookie)', () => {
    const next = jest.fn();
    const req = mkReq('GET', '/api/extension/sync-health', {}, { accessToken: tokenFor('u1') });
    extensionBearerOnly(req, mkRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.cookies.accessToken).toBeDefined(); // no Bearer: nothing to override
  });

  it('with a Bearer token the session cookie is removed so it cannot be the credential', () => {
    const next = jest.fn();
    const req = mkReq('POST', '/api/extension/items/1/listed', { authorization: 'Bearer whatever' }, { accessToken: tokenFor('victim'), csrfToken: 'c' });
    extensionBearerOnly(req, mkRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.cookies.accessToken).toBeUndefined();
    expect(req.cookies.csrfToken).toBe('c'); // only the credential cookie is dropped
  });

  it('works when the request has no cookie jar at all', () => {
    const next = jest.fn();
    const req: any = { method: 'POST', path: '/api/extension/logs', headers: { authorization: 'Bearer t' } };
    expect(() => extensionBearerOnly(req, mkRes(), next)).not.toThrow();
    expect(next).toHaveBeenCalled();
  });
});

describe('with the real authenticate(): a victim\'s cookie session cannot ride a Bearer-header request', () => {
  const run = async (req: any) => {
    const res = mkRes();
    const next = jest.fn();
    await new Promise<void>((resolve) => {
      extensionBearerOnly(req, res, () => {
        Promise.resolve(authenticate(req, res, (() => { next(); resolve(); }) as any)).then(() => resolve());
      });
      if (res.status.mock.calls.length) resolve();
    });
    return { res, next };
  };

  it('a junk Bearer token plus the victim\'s cookie is a 401, not the victim\'s identity', async () => {
    const req = mkReq('POST', '/api/extension/items/1/listed', { authorization: 'Bearer junk' }, { accessToken: tokenFor('victim') });
    const { res, next } = await run(req);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(mockFindUnique).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'victim' } }));
  });

  it('a valid Bearer token authenticates as the token\'s own user even when a different cookie session is present', async () => {
    const req = mkReq('POST', '/api/extension/items/1/listed', { authorization: `Bearer ${tokenFor('ext-user')}` }, { accessToken: tokenFor('victim') });
    const { next } = await run(req);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user.id).toBe('ext-user');
  });

  it('a cookie-only POST is refused before authenticate ever runs', async () => {
    const req = mkReq('POST', '/api/extension/items/1/listed', {}, { accessToken: tokenFor('victim') });
    const { res, next } = await run(req);
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('BEARER_REQUIRED');
    expect(next).not.toHaveBeenCalled();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });
});

describe('wiring', () => {
  const fs = require('fs');
  const path = require('path');
  const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

  it('the extension router mounts extensionBearerOnly before every route', () => {
    const src = read('routes/extension.ts');
    const useAt = src.indexOf('router.use(extensionBearerOnly)');
    expect(useAt).toBeGreaterThan(-1);
    const firstRouteAt = src.search(/router\.(get|post|put|patch|delete)\(/);
    expect(useAt).toBeLessThan(firstRouteAt);
  });

  it('index.ts skips CSRF only through isExtensionBearerRequest (no more bare startsWith + header check)', () => {
    const src = read('index.ts');
    expect(src).toContain('isExtensionBearerRequest(req)');
    expect(src).not.toMatch(/req\.path\.startsWith\('\/api\/extension'\)\s*&&\s*hasBearer/);
  });
});
