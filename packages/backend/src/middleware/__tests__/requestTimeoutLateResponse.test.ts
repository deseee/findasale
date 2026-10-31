/**
 * Sentry FINDASALE-NODEJS-91 (GET /api/sales/city-slugs) and FINDASALE-NODEJS-93 (GET /api/extension/paused-marketplaces):
 * "Cannot set headers after they are sent to the client". Both events carry response status 503: the global
 * requestTimeout answered first, then the still-running handler called res.json(). In city-slugs the throw went to the
 * catch block, whose res.status(500).json() threw again and left an unhandled rejection.
 *
 * These tests run a real Express app on a real socket. After the timeout answers 503, every later response call from
 * the handler must be a silent no-op: no throw, the client still gets the 503, and fast requests are untouched.
 */
import express from 'express';
import type { AddressInfo } from 'net';
import http from 'http';
import { requestTimeout, suppressLateResponse } from '../requestTimeout';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('requestTimeout late-response suppression (FINDASALE-NODEJS-91 / -93)', () => {
  let server: http.Server;
  let base: string;
  const handlerErrors: unknown[] = [];
  const finished: Record<string, Promise<void>> = {};
  const resolvers: Record<string, () => void> = {};
  const track = (key: string) => { finished[key] = new Promise<void>((r) => { resolvers[key] = r; }); };
  let warnSpy: jest.SpyInstance;

  beforeAll(async () => {
    const app = express();
    app.use(requestTimeout(80));

    // Shape of getPausedMarketplaces: await a slow query, then res.json with no try/catch.
    app.get('/api/slow-plain', async (_req, res) => {
      try {
        await sleep(250);
        res.json({ ok: true });
        res.status(200).set('X-Late', '1').json({ again: true });
      } catch (e) { handlerErrors.push(e); }
      resolvers['plain']();
    });

    // Shape of city-slugs: res.json in try, res.status(500).json in catch.
    app.get('/api/slow-catch', async (_req, res) => {
      let caught: unknown;
      try {
        await sleep(250);
        res.json({ slugs: [], total: 0 });
      } catch (err) {
        caught = err;
        try { res.status(500).json({ error: 'Failed to fetch city slugs' }); } catch (e2) { handlerErrors.push(e2); }
      }
      if (caught) handlerErrors.push(caught);
      resolvers['catch']();
    });

    app.get('/api/slow-misc', async (_req, res) => {
      try {
        await sleep(250);
        res.sendStatus(204);
        res.redirect('/elsewhere');
        res.setHeader('X-Late', '1');
        res.send('late');
      } catch (e) { handlerErrors.push(e); }
      resolvers['misc']();
    });

    app.get('/api/fast', (_req, res) => { res.status(201).set('X-Fast', 'yes').json({ fast: true }); });

    await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', () => r()); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => { await new Promise<void>((r) => server.close(() => r())); });
  beforeEach(() => { handlerErrors.length = 0; warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {}); });
  afterEach(() => warnSpy.mockRestore());

  it('a handler with no try/catch that answers after the timeout does not throw; the client gets the 503', async () => {
    track('plain');
    const r = await fetch(`${base}/api/slow-plain`);
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ error: 'Request timeout' });
    await finished['plain'];
    expect(handlerErrors).toEqual([]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain('GET /api/slow-plain');
  });

  it('the city-slugs shape (json in try, 500 in catch) never reaches the catch and never throws', async () => {
    track('catch');
    const r = await fetch(`${base}/api/slow-catch`);
    expect(r.status).toBe(503);
    await finished['catch'];
    expect(handlerErrors).toEqual([]);
  });

  it('sendStatus, redirect, setHeader and send after the timeout are no-ops too', async () => {
    track('misc');
    const r = await fetch(`${base}/api/slow-misc`, { redirect: 'manual' });
    expect(r.status).toBe(503);
    expect(r.headers.get('x-late')).toBeNull();
    await finished['misc'];
    expect(handlerErrors).toEqual([]);
  });

  it('a request that answers before the timeout is untouched (status, headers, body, no warning)', async () => {
    const r = await fetch(`${base}/api/fast`);
    expect(r.status).toBe(201);
    expect(r.headers.get('x-fast')).toBe('yes');
    expect(await r.json()).toEqual({ fast: true });
    await sleep(150); // past the 80 ms timeout: the timer was cleared on finish
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('suppressLateResponse marks the request timed out, keeps chaining working, and warns once', () => {
    const req: any = { method: 'GET', originalUrl: '/x' };
    const res: any = { status() { throw new Error('should be replaced'); }, json() { throw new Error('should be replaced'); } };
    suppressLateResponse(req, res);
    expect(req.timedout).toBe(true);
    expect(res.status(500).json({ a: 1 })).toBe(res);
    res.send('x'); res.setHeader('A', 'b');
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
