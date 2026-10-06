/**
 * Consignor invite resend limiter + consignors route table (2026-10-06):
 * middleware/rateLimiter.ts consignorInviteResendLimiter and consignorPortalSquareLimiter, and
 * routes/consignors.ts ordering and wiring.
 *
 * NOT EXECUTED when written (no jest in the build sandbox). Run
 * `pnpm --filter backend test consignorInviteRoutes` before merging.
 *
 * Mirrors consignorStatementResendLimiter.test.ts: the limiter is driven with a minimal fake req/res.
 * REDIS_URL is unset in tests, so the shared rate-limit store falls back to memory.
 */
jest.mock('../middleware/auth', () => ({
  authenticate: (_req: any, _res: any, next: any) => next(),
}));
jest.mock('../controllers/consignorController', () => {
  const names = [
    'listConsignors',
    'createConsignor',
    'getConsignor',
    'updateConsignor',
    'deleteConsignor',
    'runPayout',
    'getConsignorPortal',
    'acceptConsignorAgreement',
    'archiveConsignor',
    'unarchiveConsignor',
    'resendConsignorInvite',
  ];
  return Object.fromEntries(names.map((n) => [n, jest.fn()]));
});
jest.mock('../controllers/consignorPortalSquareController', () => {
  const names = ['getPortalSquare', 'startPortalSquare', 'completePortalSquare', 'refreshPortalSquare'];
  return Object.fromEntries(names.map((n) => [n, jest.fn()]));
});

import router from '../routes/consignors';
import { consignorInviteResendLimiter, consignorPortalSquareLimiter, consignorWriteLimiter } from '../middleware/rateLimiter';
import { resendConsignorInvite } from '../controllers/consignorController';

function fakeRes() {
  const listeners: Record<string, ((...a: any[]) => void)[]> = {};
  const res: any = {
    statusCode: 200,
    body: undefined,
    headers: {} as Record<string, any>,
    writableEnded: false,
    headersSent: false,
    on(ev: string, fn: (...a: any[]) => void) {
      (listeners[ev] ||= []).push(fn);
      return res;
    },
    once(ev: string, fn: (...a: any[]) => void) {
      return res.on(ev, fn);
    },
    removeListener() {
      return res;
    },
    emit(ev: string) {
      (listeners[ev] || []).forEach((fn) => fn());
    },
    setHeader(k: string, v: any) {
      res.headers[k] = v;
      return res;
    },
    getHeader(k: string) {
      return res.headers[k];
    },
    status(c: number) {
      res.statusCode = c;
      return res;
    },
    json(b: any) {
      res.body = b;
      res.writableEnded = true;
      res.emit('finish');
      return res;
    },
  };
  return res;
}

const tick = () => new Promise((r) => setImmediate(r));

async function hit(limiter: any, req: any, controllerStatus = 200): Promise<number | 'blocked'> {
  const res = fakeRes();
  let passed = false;
  await new Promise<void>((resolve) => {
    res.on('finish', () => resolve());
    limiter(req, res, () => {
      passed = true;
      resolve();
    });
  });
  if (!passed) {
    expect(res.statusCode).toBe(429);
    return 'blocked';
  }
  res.statusCode = controllerStatus;
  res.writableEnded = true;
  res.emit('finish');
  await tick();
  return controllerStatus;
}

const inviteReq = (userId: string, consignorId: string) => ({
  user: { id: userId },
  params: { id: consignorId },
  ip: '203.0.113.9',
  headers: {},
  method: 'POST',
  app: { get: () => undefined },
});

describe('consignorInviteResendLimiter', () => {
  it('allows three successful sends per consignor and blocks the fourth', async () => {
    for (let i = 0; i < 3; i++) expect(await hit(consignorInviteResendLimiter, inviteReq('u1', 'c_a'))).toBe(200);
    expect(await hit(consignorInviteResendLimiter, inviteReq('u1', 'c_a'))).toBe('blocked');
  });

  it('keys per consignor and per organizer', async () => {
    for (let i = 0; i < 3; i++) await hit(consignorInviteResendLimiter, inviteReq('u1', 'c_b'));
    expect(await hit(consignorInviteResendLimiter, inviteReq('u1', 'c_b'))).toBe('blocked');
    expect(await hit(consignorInviteResendLimiter, inviteReq('u1', 'c_c'))).toBe(200);
    expect(await hit(consignorInviteResendLimiter, inviteReq('u2', 'c_b'))).toBe(200);
  });

  it.each([[422], [502]])('a %i (nothing sent) does not use up the quota', async (failStatus) => {
    const cid = `c_fail_${failStatus}`;
    for (let i = 0; i < 6; i++) expect(await hit(consignorInviteResendLimiter, inviteReq('u1', cid), failStatus)).toBe(failStatus);
    for (let i = 0; i < 3; i++) expect(await hit(consignorInviteResendLimiter, inviteReq('u1', cid))).toBe(200);
    expect(await hit(consignorInviteResendLimiter, inviteReq('u1', cid))).toBe('blocked');
  });
});

describe('consignorPortalSquareLimiter', () => {
  it('caps anonymous portal Square traffic per IP at 20 per window', async () => {
    const req = { params: { token: 'tok' }, ip: '198.51.100.7', headers: {}, method: 'POST', app: { get: () => undefined } };
    for (let i = 0; i < 20; i++) expect(await hit(consignorPortalSquareLimiter, req)).toBe(200);
    expect(await hit(consignorPortalSquareLimiter, req)).toBe('blocked');
    expect(await hit(consignorPortalSquareLimiter, { ...req, ip: '198.51.100.8' })).toBe(200);
  });
});

describe('route table', () => {
  const stack: any[] = (router as any).stack;
  const routes = stack
    .map((l: any, i: number) => ({ i, path: l.route?.path, methods: l.route ? Object.keys(l.route.methods) : [], layer: l }))
    .filter((r) => r.path);
  const idx = (path: string, method: string) => {
    const r = routes.find((x) => x.path === path && x.methods.includes(method));
    return r ? r.i : -1;
  };
  const authIdx = stack.findIndex((l: any) => !l.route && l.name !== 'router');

  it('public portal Square routes are registered before authentication and behind the portal limiter', () => {
    for (const [path, method] of [
      ['/portal/:token/square', 'get'],
      ['/portal/:token/square/start', 'post'],
      ['/portal/:token/square/callback', 'post'],
      ['/portal/:token/square/refresh', 'post'],
    ]) {
      const i = idx(path, method);
      expect(i).toBeGreaterThan(-1);
      expect(i).toBeLessThan(authIdx);
      const layer = stack[i];
      expect(layer.route.stack.some((s: any) => s.handle === consignorPortalSquareLimiter)).toBe(true);
    }
  });

  it('create and edit (which report the existing-account boolean) are behind the write limiter', () => {
    for (const [path, method] of [['/', 'post'], ['/:id', 'put']]) {
      const i = idx(path, method);
      expect(i).toBeGreaterThan(authIdx);
      expect(stack[i].route.stack.some((s: any) => s.handle === consignorWriteLimiter)).toBe(true);
    }
  });

  it('send-invite is authenticated (after router.use(authenticate)) and behind the resend limiter only', () => {
    const i = idx('/:id/send-invite', 'post');
    expect(i).toBeGreaterThan(authIdx);
    const handles = stack[i].route.stack.map((s: any) => s.handle);
    expect(handles).toContain(consignorInviteResendLimiter);
    expect(handles).toContain(resendConsignorInvite);
    const others = routes.filter((r) => r.path !== '/:id/send-invite');
    expect(others.some((r) => r.layer.route.stack.some((s: any) => s.handle === consignorInviteResendLimiter))).toBe(false);
  });
});
