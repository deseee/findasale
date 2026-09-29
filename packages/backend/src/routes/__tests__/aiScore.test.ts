/**
 * /api/ai-score host and redirect hardening (2026-09-29). NOT EXECUTED when written (jest cannot
 * run on the authoring device); CI is the first real run. global.fetch is stubbed for the page
 * fetch; the local test requests use the real fetch captured before stubbing.
 */
import express from 'express';
import type { AddressInfo } from 'net';
import router from '../aiScore';

const realFetch = global.fetch;

async function getScore(target: string) {
  const app = express();
  app.use('/api', router);
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await realFetch(`http://127.0.0.1:${port}/api/ai-score?url=${encodeURIComponent(target)}`);
    const body: any = await res.json();
    return { status: res.status, body };
  } finally {
    (server as any).closeAllConnections?.();
    server.close();
  }
}

const html = '<html><head><title>x</title></head><body><h1>Hi</h1></body></html>';
const okResponse = () => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => html });
const redirectResponse = (location: string) => ({
  ok: false,
  status: 302,
  headers: { get: (k: string) => (k.toLowerCase() === 'location' ? location : null) },
  text: async () => '',
});

let fetchStub: jest.Mock;
beforeEach(() => {
  fetchStub = jest.fn();
  (global as any).fetch = fetchStub;
});
afterEach(() => {
  (global as any).fetch = realFetch;
});

describe('/api/ai-score host check', () => {
  it.each([
    'https://evilfinda.sale/page',
    'https://finda.sale.evil.com/page',
    'https://notfinda.sale/',
    'https://finda.sale@evil.com/',
    'http://finda.sale/page',
    'https://finda.sale:8443/page',
    'https://user:pw@finda.sale/page',
  ])('rejects %s without fetching', async (target) => {
    const r = await getScore(target);
    expect(r.status).toBe(400);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it.each(['https://finda.sale/sales/abc', 'https://www.finda.sale/sales/abc', 'https://FINDA.SALE/x'])(
    'accepts legitimate %s',
    async (target) => {
      fetchStub.mockResolvedValue(okResponse());
      const r = await getScore(target);
      expect(r.status).toBe(200);
      expect(r.body.score).toBeGreaterThan(0);
      expect(fetchStub).toHaveBeenCalledTimes(1);
      expect(fetchStub.mock.calls[0][1].redirect).toBe('manual');
    },
  );
});

describe('/api/ai-score redirects', () => {
  it('follows a redirect that stays on finda.sale', async () => {
    fetchStub.mockResolvedValueOnce(redirectResponse('/sales/final')).mockResolvedValueOnce(okResponse());
    const r = await getScore('https://finda.sale/sales/start');
    expect(r.status).toBe(200);
    expect(r.body.score).toBeGreaterThan(0);
    expect(fetchStub).toHaveBeenCalledTimes(2);
    expect(String(fetchStub.mock.calls[1][0])).toBe('https://finda.sale/sales/final');
  });

  it('refuses a redirect to another host and never fetches it', async () => {
    fetchStub.mockResolvedValueOnce(redirectResponse('https://evil.example.com/steal'));
    const r = await getScore('https://finda.sale/sales/start');
    expect(r.status).toBe(200);
    expect(r.body.score).toBe(0);
    expect(r.body.error).toMatch(/outside finda\.sale/);
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  it('refuses a redirect to a look-alike host', async () => {
    fetchStub.mockResolvedValueOnce(redirectResponse('https://evilfinda.sale/'));
    const r = await getScore('https://finda.sale/');
    expect(r.body.error).toMatch(/outside finda\.sale/);
  });

  it('stops after too many redirects', async () => {
    fetchStub.mockResolvedValue(redirectResponse('/loop'));
    const r = await getScore('https://finda.sale/');
    expect(r.body.error).toMatch(/Too many redirects/);
  });
});
