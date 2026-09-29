/**
 * /api/markdown-cycles route gating (2026-09-29, Patrick D1/D3). NOT EXECUTED when written (jest
 * cannot run on the authoring device); CI is the first real run.
 *
 * GET list, DELETE and "turn OFF" (PUT with only isActive:false) work at any tier; POST and any
 * other PUT need PRO/TEAMS. requireTier is the real middleware; auth and the controller are stubbed.
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
jest.mock('../../controllers/markdownCycleController', () => {
  const ok = (_req: any, res: any) => res.status(200).json({ ok: true });
  return { listMarkdownCycles: ok, createMarkdownCycle: ok, updateMarkdownCycle: ok, deleteMarkdownCycle: ok };
});

import router from '../markdownCycles';

async function call(method: string, path: string, user: any, body?: any) {
  const app = express();
  app.use(express.json());
  app.use('/api/markdown-cycles', router);
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (user) headers['x-test-user'] = JSON.stringify(user);
    const res = await fetch(`http://127.0.0.1:${port}/api/markdown-cycles${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json: any = await res.json().catch(() => null);
    return { status: res.status, body: json };
  } finally {
    (server as any).closeAllConnections?.();
    server.close();
  }
}

const user = (tier: string | null, extra: any = {}) => ({ id: 'u1', organizerProfile: { id: 'o1', subscriptionTier: tier, ...extra } });

describe('/api/markdown-cycles gating', () => {
  it('SIMPLE can list and delete', async () => {
    expect((await call('GET', '/', user('SIMPLE'))).status).toBe(200);
    expect((await call('DELETE', '/c1', user('SIMPLE'))).status).toBe(200);
  });

  it('SIMPLE cannot create or change steps', async () => {
    const post = await call('POST', '/', user('SIMPLE'), { steps: [{ dayThreshold: 30, pctOff: 10 }] });
    expect(post.status).toBe(403);
    expect(post.body.code).toBe('TIER_REQUIRED');
    const put = await call('PUT', '/c1', user('SIMPLE'), { steps: [{ dayThreshold: 30, pctOff: 10 }] });
    expect(put.status).toBe(403);
  });

  it('SIMPLE can turn a cycle OFF but not ON', async () => {
    expect((await call('PUT', '/c1', user('SIMPLE'), { isActive: false })).status).toBe(200);
    expect((await call('PUT', '/c1', user('SIMPLE'), { isActive: true })).status).toBe(403);
    // isActive:false together with new steps is an edit, not a pure off switch.
    expect((await call('PUT', '/c1', user('SIMPLE'), { isActive: false, steps: [{ dayThreshold: 30, pctOff: 10 }] })).status).toBe(403);
  });

  it.each(['PRO', 'TEAMS'])('%s can do everything', async (tier) => {
    expect((await call('GET', '/', user(tier))).status).toBe(200);
    expect((await call('POST', '/', user(tier), { steps: [{ dayThreshold: 30, pctOff: 10 }] })).status).toBe(200);
    expect((await call('PUT', '/c1', user(tier), { isActive: true })).status).toBe(200);
    expect((await call('DELETE', '/c1', user(tier))).status).toBe(200);
  });

  it('PRO inside the grace window is NOT blocked (Patrick D2)', async () => {
    const graceUser = user('PRO', { graceEndAt: new Date(Date.now() + 3 * 86400000).toISOString() });
    expect((await call('POST', '/', graceUser, { steps: [{ dayThreshold: 30, pctOff: 10 }] })).status).toBe(200);
  });

  it('unauthenticated is 401 and a user without an organizer profile is 403 on PRO routes', async () => {
    expect((await call('GET', '/', null)).status).toBe(401);
    const noProfile = await call('POST', '/', { id: 'u2' }, { steps: [] });
    expect(noProfile.status).toBe(403);
    expect(noProfile.body.code).toBe('ORGANIZER_PROFILE_REQUIRED');
  });
});
