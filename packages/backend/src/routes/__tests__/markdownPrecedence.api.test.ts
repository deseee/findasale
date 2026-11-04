/**
 * GET/PUT /api/markdown-cycles/precedence (2026-11-04). Real route + requireTier + controller; auth and Prisma are
 * stubbed. The value is a server-side enum, the row is always the caller's own organizer, PUT needs PRO/TEAMS
 * except switching back to the default FIRST_WINS.
 */
import express from 'express';
import type { AddressInfo } from 'net';

const mockOrganizerFindUnique = jest.fn();
const mockPrecedenceFindUnique = jest.fn();
const mockPrecedenceUpsert = jest.fn();

jest.mock('../../middleware/auth', () => ({
  authenticate: (req: any, res: any, next: any) => {
    const raw = req.headers['x-test-user'];
    if (!raw) return res.status(401).json({ message: 'Authentication required' });
    req.user = JSON.parse(raw as string);
    next();
  },
}));
jest.mock('../../controllers/markdownCycleController', () => {
  const ok = (_req: any, res: any) => res.status(200).json({ cycleController: true });
  return { listMarkdownCycles: ok, createMarkdownCycle: ok, updateMarkdownCycle: ok, deleteMarkdownCycle: ok };
});
jest.mock('../../lib/prisma', () => ({
  prisma: {
    organizer: { findUnique: (...a: any[]) => mockOrganizerFindUnique(...a) },
    organizerMarkdownPrecedence: {
      findUnique: (...a: any[]) => mockPrecedenceFindUnique(...a),
      upsert: (...a: any[]) => mockPrecedenceUpsert(...a),
    },
  },
}));

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

const user = (tier: string | null) => ({ id: 'u1', organizerProfile: { id: 'o1', subscriptionTier: tier } });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  mockOrganizerFindUnique.mockImplementation(async (args: any) =>
    args.where.userId === 'u1' ? { id: 'o1', subscriptionTier: 'PRO' } : null
  );
  mockPrecedenceFindUnique.mockResolvedValue(null);
  mockPrecedenceUpsert.mockResolvedValue({});
});

afterEach(() => jest.restoreAllMocks());

describe('GET /api/markdown-cycles/precedence', () => {
  it('defaults to FIRST_WINS when no row exists, and is not routed to the cycle controller', async () => {
    const res = await call('GET', '/precedence', user('PRO'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      precedence: 'FIRST_WINS',
      effectivePrecedence: 'FIRST_WINS',
      options: ['FIRST_WINS', 'SALE_TIERS_WIN', 'CYCLES_WIN'],
      available: true,
    });
    expect(mockPrecedenceFindUnique.mock.calls[0][0].where).toEqual({ organizerId: 'o1' });
  });

  it('returns the stored choice; for a SIMPLE organizer the effective mode is FIRST_WINS', async () => {
    mockPrecedenceFindUnique.mockResolvedValue({ precedence: 'CYCLES_WIN' });
    mockOrganizerFindUnique.mockResolvedValue({ id: 'o1', subscriptionTier: 'SIMPLE' });
    const res = await call('GET', '/precedence', user('SIMPLE'));
    expect(res.status).toBe(200);
    expect(res.body.precedence).toBe('CYCLES_WIN');
    expect(res.body.effectivePrecedence).toBe('FIRST_WINS');
  });

  it('a missing table reads as the default with available=false', async () => {
    mockPrecedenceFindUnique.mockRejectedValue(Object.assign(new Error('missing'), { code: 'P2021' }));
    const res = await call('GET', '/precedence', user('PRO'));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ precedence: 'FIRST_WINS', available: false });
  });

  it('401 without auth, 403 without an organizer profile', async () => {
    expect((await call('GET', '/precedence', null)).status).toBe(401);
    expect((await call('GET', '/precedence', { id: 'u_shopper' })).status).toBe(403);
  });
});

describe('PUT /api/markdown-cycles/precedence', () => {
  it.each(['FIRST_WINS', 'SALE_TIERS_WIN', 'CYCLES_WIN'])('PRO can save %s for their own organizer only', async (value) => {
    const res = await call('PUT', '/precedence', user('PRO'), { precedence: value, organizerId: undefined });
    expect(res.status).toBe(200);
    expect(res.body.precedence).toBe(value);
    expect(mockPrecedenceUpsert).toHaveBeenCalledWith({
      where: { organizerId: 'o1' },
      create: { organizerId: 'o1', precedence: value },
      update: { precedence: value },
    });
  });

  it.each([
    [{}],
    [{ precedence: null }],
    [{ precedence: 'first_wins' }],
    [{ precedence: 'EVERYTHING_WINS' }],
    [{ precedence: 2 }],
    [{ precedence: ['CYCLES_WIN'] }],
  ])('rejects invalid body %p with 400 and writes nothing', async (body) => {
    const res = await call('PUT', '/precedence', user('PRO'), body);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/FIRST_WINS, SALE_TIERS_WIN, CYCLES_WIN/);
    expect(mockPrecedenceUpsert).not.toHaveBeenCalled();
  });

  it('rejects extra fields (no writing another organizer id)', async () => {
    const res = await call('PUT', '/precedence', user('TEAMS'), { precedence: 'CYCLES_WIN', organizerId: 'o_other' });
    expect(res.status).toBe(400);
    expect(mockPrecedenceUpsert).not.toHaveBeenCalled();
  });

  it('SIMPLE cannot choose a non-default mode (403 TIER_REQUIRED) but can switch back to FIRST_WINS', async () => {
    const blocked = await call('PUT', '/precedence', user('SIMPLE'), { precedence: 'CYCLES_WIN' });
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('TIER_REQUIRED');
    mockOrganizerFindUnique.mockResolvedValue({ id: 'o1', subscriptionTier: 'SIMPLE' });
    const back = await call('PUT', '/precedence', user('SIMPLE'), { precedence: 'FIRST_WINS' });
    expect(back.status).toBe(200);
    expect(mockPrecedenceUpsert).toHaveBeenCalledTimes(1);
  });

  it('a missing table is a 503, not a 500', async () => {
    mockPrecedenceUpsert.mockRejectedValue(Object.assign(new Error('missing'), { code: 'P2021' }));
    const res = await call('PUT', '/precedence', user('PRO'), { precedence: 'CYCLES_WIN' });
    expect(res.status).toBe(503);
  });

  it('PUT /:id for a real cycle still reaches the cycle controller', async () => {
    const res = await call('PUT', '/c1', user('PRO'), { isActive: true });
    expect(res.status).toBe(200);
    expect(res.body.cycleController).toBe(true);
  });
});
