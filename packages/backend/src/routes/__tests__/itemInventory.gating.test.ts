/**
 * /api/item-inventory route gating (2026-09-29, resolved decision "Inventory tier"). NOT EXECUTED
 * when written (jest cannot run on the authoring device); CI is the first real run.
 *
 * Governing decision: claude_docs/strategy/roadmap.md row #25 "Organizer Persistent Inventory
 * (eBay Sync)", Tier PRO. The whole router is PRO; the frontend nav entry, page TierGate and the
 * public comparison table now agree. requireTier is the real middleware; auth and the controller
 * are stubbed.
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
jest.mock('../../controllers/itemInventoryController', () => {
  const ok = (_req: any, res: any) => res.status(200).json({ ok: true });
  return {
    addItemToInventory: ok,
    removeItemFromInventory: ok,
    pullItemFromInventory: ok,
    listInventoryItems: ok,
    getItemPriceHistory: ok,
    getItemPricingAdvice: ok,
  };
});

import router from '../itemInventory';

async function call(method: string, path: string, user: any, body?: any) {
  const app = express();
  app.use(express.json());
  app.use('/api/item-inventory', router);
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (user) headers['x-test-user'] = JSON.stringify(user);
    const res = await fetch(`http://127.0.0.1:${port}/api/item-inventory${path}`, {
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

const user = (tier: string | null) => ({ id: 'u1', organizerProfile: { id: 'o1', subscriptionTier: tier } });

const ALL: Array<[string, string]> = [
  ['GET', '/'],
  ['POST', '/add'],
  ['DELETE', '/i1'],
  ['POST', '/i1/pull'],
  ['GET', '/i1/price-history'],
  ['GET', '/i1/pricing-advice'],
];

describe('/api/item-inventory gating', () => {
  it.each(ALL)('SIMPLE cannot %s %s (403 TIER_REQUIRED, PRO)', async (method, path) => {
    const r = await call(method, path, user('SIMPLE'), {});
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('TIER_REQUIRED');
    expect(r.body.requiredTier).toBe('PRO');
    expect(r.body.currentTier).toBe('SIMPLE');
  });

  it.each(ALL)('PRO can %s %s', async (method, path) => {
    expect((await call(method, path, user('PRO'), {})).status).toBe(200);
  });

  it.each(ALL)('TEAMS can %s %s', async (method, path) => {
    expect((await call(method, path, user('TEAMS'), {})).status).toBe(200);
  });

  it('a null tier is treated as SIMPLE', async () => {
    expect((await call('GET', '/', user(null))).status).toBe(403);
  });

  it('unauthenticated callers get 401', async () => {
    expect((await call('GET', '/', null)).status).toBe(401);
  });
});
