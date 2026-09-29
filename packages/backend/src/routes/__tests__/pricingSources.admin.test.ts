/**
 * PATCH /api/pricing/sources/:sourceId is admin-only (2026-09-29 security fix). NOT EXECUTED when
 * written (jest cannot run on the authoring device); CI is the first real run.
 */
import express from 'express';
import type { AddressInfo } from 'net';

jest.mock('../../middleware/auth', () => {
  const authenticate = (req: any, res: any, next: any) => {
    const raw = req.headers['x-test-user'];
    if (!raw) return res.status(401).json({ message: 'Authentication required' });
    req.user = JSON.parse(raw as string);
    next();
  };
  const requireOrganizer = (req: any, res: any, next: any) => {
    const ok = req.user?.roles?.includes('ORGANIZER') || req.user?.roles?.includes('ADMIN');
    if (!ok) return res.status(403).json({ message: 'Organizer access required.' });
    next();
  };
  const requireAdmin = (req: any, res: any, next: any) => {
    if (!req.user?.roles?.includes('ADMIN')) return res.status(403).json({ message: 'Admin access required.' });
    next();
  };
  return { authenticate, requireOrganizer, requireAdmin };
});
jest.mock('../../controllers/pricingController', () => {
  const ok = (_req: any, res: any) => res.status(200).json({ ok: true });
  return { estimatePriceController: ok, listSourcesController: ok, updateSourceController: ok };
});

import router from '../pricing';

async function call(method: string, path: string, user: any) {
  const app = express();
  app.use(express.json());
  app.use('/api/pricing', router);
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (user) headers['x-test-user'] = JSON.stringify(user);
    const res = await fetch(`http://127.0.0.1:${port}/api/pricing${path}`, {
      method,
      headers,
      body: method === 'GET' ? undefined : JSON.stringify({ enabled: false }),
    });
    return res.status;
  } finally {
    (server as any).closeAllConnections?.();
    server.close();
  }
}

describe('/api/pricing/sources', () => {
  it('an organizer can still read sources and estimate', async () => {
    expect(await call('GET', '/sources', { id: 'u1', roles: ['ORGANIZER'] })).toBe(200);
    expect(await call('POST', '/estimate', { id: 'u1', roles: ['ORGANIZER'] })).toBe(200);
  });

  it('an organizer can NOT toggle a global pricing source', async () => {
    expect(await call('PATCH', '/sources/discogs', { id: 'u1', roles: ['ORGANIZER'] })).toBe(403);
  });

  it('an admin can', async () => {
    expect(await call('PATCH', '/sources/discogs', { id: 'a1', roles: ['ADMIN'] })).toBe(200);
  });

  it('unauthenticated is 401', async () => {
    expect(await call('PATCH', '/sources/discogs', null)).toBe(401);
  });
});
