/**
 * Statement resend rate limit (organizer-settles model, 2026-09-29): routes/consignorSettlement.ts
 * consignorStatementResendLimiter. Three successful sends per payout per organizer per 24 hours; a
 * 4th is 429 STATEMENT_RATE_LIMITED. Failed sends (422 NO_EMAIL / SUPPRESSED / BLOCKED_DOMAIN, 502
 * ERROR) do not count because the limiter uses skipFailedRequests.
 *
 * NOT EXECUTED when written (no jest in the build sandbox). Run
 * `pnpm --filter backend test consignorStatementResendLimiter` before merging.
 *
 * The limiter is driven directly with a minimal fake req/res. The fake res implements on/emit so
 * express-rate-limit can register its 'finish' and 'close' listeners; a test "finishes" a request by
 * setting the status the controller would have sent and emitting 'finish'.
 */
jest.mock('../middleware/auth', () => ({
  authenticate: (_req: any, _res: any, next: any) => next(),
  requireOrganizer: (_req: any, _res: any, next: any) => next(),
}));
jest.mock('../controllers/consignorSettlementController', () => {
  const names = [
    'previewConsignorSettlement',
    'getConsignorSalesSummary',
    'getConsignorAnnualSummary',
    'createConsignorSettlementBatch',
    'getConsignorSettlementBatch',
    'refreshConsignorSettlementBatch',
    'approveConsignorSettlementBatch',
    'cancelConsignorSettlementBatch',
    'exportConsignorSettlementCsv',
    'markConsignorPayoutPaid',
    'undoConsignorPayoutPaid',
    'holdConsignorPayout',
    'releaseConsignorPayout',
    'voidConsignorPayout',
    'sendConsignorPayoutStatement',
    'getConsignorPayoutStatement',
    'getConsignorPayoutStatementPdf',
    'getConsignorPayoutEvents',
  ];
  return Object.fromEntries(names.map((n) => [n, jest.fn()]));
});

import router, { consignorStatementResendLimiter } from '../routes/consignorSettlement';

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

/**
 * One request through the limiter. Returns 'blocked' (429 from the limiter) or the status the
 * "controller" answered with.
 */
async function hit(userId: string, payoutId: string, controllerStatus = 200): Promise<number | 'blocked'> {
  const req: any = { user: { id: userId }, params: { id: payoutId }, ip: '203.0.113.9', headers: {}, method: 'POST', app: { get: () => undefined } };
  const res = fakeRes();
  let passed = false;
  // Resolve on whichever comes first: the limiter calling next() (allowed) or answering 429 (blocked).
  await new Promise<void>((resolve) => {
    res.on('finish', () => resolve());
    (consignorStatementResendLimiter as any)(req, res, () => {
      passed = true;
      resolve();
    });
  });
  if (!passed) {
    expect(res.statusCode).toBe(429);
    expect(res.body.code).toBe('STATEMENT_RATE_LIMITED');
    return 'blocked';
  }
  res.statusCode = controllerStatus;
  res.writableEnded = true;
  res.emit('finish');
  await tick();
  return controllerStatus;
}

describe('consignorStatementResendLimiter', () => {
  it('allows three successful sends per payout and blocks the fourth with 429 STATEMENT_RATE_LIMITED', async () => {
    const pid = 'payout_limit_success';
    expect(await hit('u1', pid)).toBe(200);
    expect(await hit('u1', pid)).toBe(200);
    expect(await hit('u1', pid)).toBe(200);
    expect(await hit('u1', pid)).toBe('blocked');
    expect(await hit('u1', pid)).toBe('blocked');
  });

  it('keys per payout: another payout for the same organizer still has its full quota', async () => {
    for (let i = 0; i < 3; i++) await hit('u1', 'payout_key_a');
    expect(await hit('u1', 'payout_key_a')).toBe('blocked');
    expect(await hit('u1', 'payout_key_b')).toBe(200);
  });

  it('keys per organizer: another account cannot burn or share this quota', async () => {
    for (let i = 0; i < 3; i++) await hit('u1', 'payout_key_c');
    expect(await hit('u1', 'payout_key_c')).toBe('blocked');
    expect(await hit('u2', 'payout_key_c')).toBe(200);
  });

  it.each([[422], [502], [409]])('a request that answers %i does not use up the quota', async (failStatus) => {
    const pid = `payout_fail_${failStatus}`;
    for (let i = 0; i < 6; i++) expect(await hit('u1', pid, failStatus)).toBe(failStatus);
    expect(await hit('u1', pid)).toBe(200);
    expect(await hit('u1', pid)).toBe(200);
    expect(await hit('u1', pid)).toBe(200);
    expect(await hit('u1', pid)).toBe('blocked');
  });

  it('mixed traffic: two successes and many failures still leave one send available', async () => {
    const pid = 'payout_mixed';
    await hit('u1', pid);
    await hit('u1', pid, 422);
    await hit('u1', pid);
    await hit('u1', pid, 502);
    await hit('u1', pid, 422);
    expect(await hit('u1', pid)).toBe(200);
    expect(await hit('u1', pid)).toBe('blocked');
  });
});

describe('route table', () => {
  const routes: { path: string; methods: string[] }[] = (router as any).stack
    .filter((l: any) => l.route)
    .map((l: any) => ({ path: l.route.path, methods: Object.keys(l.route.methods) }));
  const idx = (path: string, method: string) => routes.findIndex((r) => r.path === path && r.methods.includes(method));

  it('every fixed path is registered before the /:batchId routes so "payouts" is never read as a batch id', () => {
    const firstBatchRoute = Math.min(idx('/:batchId', 'get'), idx('/:batchId/export.csv', 'get'), idx('/:batchId/approve', 'post'));
    expect(firstBatchRoute).toBeGreaterThan(-1);
    for (const [path, method] of [
      ['/preview/:saleId', 'get'],
      ['/preview', 'get'],
      ['/sales-summary', 'get'],
      ['/annual-summary', 'get'],
      ['/payouts/:id/mark-paid', 'post'],
      ['/payouts/:id/undo-paid', 'post'],
      ['/payouts/:id/hold', 'post'],
      ['/payouts/:id/release', 'post'],
      ['/payouts/:id/void', 'post'],
      ['/payouts/:id/send-statement', 'post'],
      ['/payouts/:id/statement', 'get'],
      ['/payouts/:id/statement.pdf', 'get'],
      ['/payouts/:id/events', 'get'],
    ]) {
      const i = idx(path, method);
      expect(i).toBeGreaterThan(-1);
      expect(i).toBeLessThan(firstBatchRoute);
    }
  });

  it('exposes the full contract and no route for the legacy Stripe approve or onboarding', () => {
    for (const [path, method] of [
      ['/', 'post'],
      ['/:batchId', 'get'],
      ['/:batchId/refresh', 'post'],
      ['/:batchId/approve', 'post'],
      ['/:batchId/cancel', 'post'],
      ['/:batchId/export.csv', 'get'],
    ]) {
      expect(idx(path, method)).toBeGreaterThan(-1);
    }
    expect(routes.some((r) => /stripe|onboard|transfer/i.test(r.path))).toBe(false);
  });

  it('the send-statement route is the only one behind the resend limiter', () => {
    const layer = (router as any).stack.find((l: any) => l.route && l.route.path === '/payouts/:id/send-statement');
    expect(layer.route.stack.some((s: any) => s.handle === consignorStatementResendLimiter)).toBe(true);
    const others = (router as any).stack.filter((l: any) => l.route && l.route.path !== '/payouts/:id/send-statement');
    expect(others.some((l: any) => l.route.stack.some((s: any) => s.handle === consignorStatementResendLimiter))).toBe(false);
  });
});
