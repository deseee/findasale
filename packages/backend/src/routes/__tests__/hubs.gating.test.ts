/**
 * /api/organizer/hubs route gating (2026-09-29, resolved decision "Hubs backend gate"). NOT
 * EXECUTED when written (jest cannot run on the authoring device); CI is the first real run.
 *
 * Governing decision: claude_docs/decisions-log.md, S436 (2026-04-10): "Locked decisions:
 * (1) Tier = TEAMS." Creating, editing, reopening and scheduling a market need TEAMS. Reading
 * your own hubs and CLOSING a market work at any tier (a downgraded owner must be able to switch
 * a live market off). Public discovery stays public. requireTier is the real middleware; auth
 * and the controller are stubbed.
 */
import express from 'express';
import type { AddressInfo } from 'net';

jest.mock('../../middleware/auth', () => ({
  authenticate: (req: any, res: any, next: any) => {
    const raw = req.headers['x-test-user'];
    if (!raw) return res.status(401).json({ message: 'Authentication required' });
    req.user = JSON.parse(raw as string);
    next();
  },
}));
jest.mock('../../controllers/hubController', () => {
  const ok = (_req: any, res: any) => res.status(200).json({ ok: true });
  return {
    discoverHubs: ok,
    getHub: ok,
    createHub: ok,
    updateHub: ok,
    deleteHub: ok,
    reopenHub: ok,
    listMyHubs: ok,
    getMyHub: ok,
    setHubEvent: ok,
  };
});

import router from '../hubs';

async function call(method: string, path: string, user: any, body?: any) {
  const app = express();
  app.use(express.json());
  // hubs.ts declares full /api/... paths, so it is mounted at the root.
  app.use(router);
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (user) headers['x-test-user'] = JSON.stringify(user);
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers,
      // fetch rejects a body on GET/HEAD, and the table-driven cases pass one uniformly.
      body: body === undefined || method === 'GET' || method === 'HEAD' ? undefined : JSON.stringify(body),
    });
    const json: any = await res.json().catch(() => null);
    return { status: res.status, body: json };
  } finally {
    (server as any).closeAllConnections?.();
    server.close();
  }
}

const user = (tier: string | null, extra: any = {}) => ({
  id: 'u1',
  organizerProfile: { id: 'o1', subscriptionTier: tier, ...extra },
});

const WRITES: Array<[string, string]> = [
  ['POST', '/api/organizer/hubs'],
  ['PUT', '/api/organizer/hubs/h1'],
  ['POST', '/api/organizer/hubs/h1/reopen'],
  ['PATCH', '/api/organizer/hubs/h1/event'],
];

describe('/api/organizer/hubs gating', () => {
  it.each(WRITES)('SIMPLE cannot %s %s (403 TIER_REQUIRED, TEAMS)', async (method, path) => {
    const r = await call(method, path, user('SIMPLE'), {});
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('TIER_REQUIRED');
    expect(r.body.requiredTier).toBe('TEAMS');
    expect(r.body.currentTier).toBe('SIMPLE');
  });

  it.each(WRITES)('PRO cannot %s %s (Market Hubs are TEAMS, not PRO)', async (method, path) => {
    const r = await call(method, path, user('PRO'), {});
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('TIER_REQUIRED');
    expect(r.body.requiredTier).toBe('TEAMS');
    expect(r.body.currentTier).toBe('PRO');
  });

  it.each(WRITES)('TEAMS can %s %s', async (method, path) => {
    expect((await call(method, path, user('TEAMS'), {})).status).toBe(200);
  });

  it('a null or unknown tier is treated as SIMPLE', async () => {
    expect((await call('POST', '/api/organizer/hubs', user(null), {})).status).toBe(403);
    expect((await call('POST', '/api/organizer/hubs', user('ENTERPRISE'), {})).status).toBe(403);
  });

  it('every tier can read its own hubs', async () => {
    for (const tier of ['SIMPLE', 'PRO', 'TEAMS']) {
      expect((await call('GET', '/api/organizer/hubs', user(tier))).status).toBe(200);
      expect((await call('GET', '/api/organizer/hubs/h1', user(tier))).status).toBe(200);
    }
  });

  it('every tier can CLOSE a market (a downgraded owner is never trapped with a live market)', async () => {
    for (const tier of ['SIMPLE', 'PRO', 'TEAMS']) {
      expect((await call('DELETE', '/api/organizer/hubs/h1', user(tier))).status).toBe(200);
    }
  });

  it('public discovery needs no login and no tier', async () => {
    expect((await call('GET', '/api/hubs', null)).status).toBe(200);
    expect((await call('GET', '/api/hubs/some-slug', null)).status).toBe(200);
  });

  it('unauthenticated organizer calls get 401 before any tier check', async () => {
    expect((await call('POST', '/api/organizer/hubs', null, {})).status).toBe(401);
    expect((await call('DELETE', '/api/organizer/hubs/h1', null)).status).toBe(401);
  });

  it('a logged-in user with no organizer profile gets 403 ORGANIZER_PROFILE_REQUIRED, not 401', async () => {
    const r = await call('POST', '/api/organizer/hubs', { id: 'u2' }, {});
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('ORGANIZER_PROFILE_REQUIRED');
  });

  it('TEAMS inside the grace window is not blocked (Patrick D2: tier column is the only check)', async () => {
    const graceUser = user('TEAMS', { graceEndAt: new Date(Date.now() + 3 * 86400000).toISOString() });
    expect((await call('POST', '/api/organizer/hubs', graceUser, {})).status).toBe(200);
  });
});
