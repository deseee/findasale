/**
 * requestTimeout (Feature #108) -- which paths skip the global 30 s guard. ADR-134 B4: the two card-intake routes
 * that parse a spreadsheet / write one item per row skip it (index.ts gives them requestTimeout(180000) at the
 * route registration). Everything else, including look-alike paths and other card-intake routes, keeps the guard.
 */
import { requestTimeout } from '../requestTimeout';

function run(path: string, timeoutMs = 30000) {
  const listeners: Record<string, Array<() => void>> = {};
  const res: any = {
    headersSent: false,
    statusCode: 200,
    body: undefined,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; this.headersSent = true; return this; },
    on(evt: string, cb: () => void) { (listeners[evt] ||= []).push(cb); return this; },
  };
  const next = jest.fn();
  requestTimeout(timeoutMs)({ path } as any, res, next);
  return { res, next, listeners };
}

describe('requestTimeout skip list', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const skipped = [
    '/',
    '/api/health',
    '/api/internal/anything',
    '/api/upload/batch-analyze',
    '/api/items/abc123/reanalyze',
    '/api/card-intake/sale_1/preview',
    '/api/card-intake/sale_1/confirm',
  ];
  for (const path of skipped) {
    it(`does not arm the 30 s timer for ${path}`, () => {
      const { res, next } = run(path);
      expect(next).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(120000);
      expect(res.headersSent).toBe(false);
      expect(res.statusCode).toBe(200);
    });
  }

  const guarded = [
    '/api/card-intake/sale_1/formats',
    '/api/card-intake/formats',
    '/api/card-intake/sale_1/preview/extra',
    '/api/card-intake/sale_1/other/preview',
    '/api/card-intake//preview',
    '/api/card-intake/preview',
    '/api/card-intake/a/b/confirm',
    '/api/cards/search',
    '/api/item-cards/abc',
    '/api/items/abc/reanalyze/extra',
    '/api/etsy/connect',
    '/api/etsy/webhook',
  ];
  for (const path of guarded) {
    it(`still answers 503 after the timeout for ${path}`, () => {
      const { res, next } = run(path);
      expect(next).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(30001);
      expect(res.statusCode).toBe(503);
      expect(res.body).toMatchObject({ error: 'Request timeout' });
    });
  }

  it('the skip is path-based: a route-level requestTimeout(180000) on a skipped path does not arm a timer either (same as reanalyze)', () => {
    for (const path of ['/api/card-intake/sale_1/preview', '/api/card-intake/sale_1/confirm', '/api/items/x/reanalyze']) {
      const { res, next } = run(path, 180000);
      expect(next).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(400000);
      expect(res.headersSent).toBe(false);
    }
  });
});
