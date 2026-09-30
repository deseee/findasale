/**
 * imageProxy hardening (P2, 2026-09-29): image-only responses (no SVG/HTML relayed from our origin), a hard
 * body cap while streaming, nosniff, generic errors, and a per-IP budget. fetch and the limiter store are mocks.
 */
const mockIncrement = jest.fn();
jest.mock('../middleware/rateLimitShared', () => ({
  createRateLimitStore: () => ({ init: () => undefined, increment: (...a: any[]) => mockIncrement(...a) }),
}));

import { imageProxy, MAX_PROXY_BODY_BYTES, IMAGE_PROXY_MAX_PER_WINDOW } from '../controllers/imageProxyController';

const mkRes = () => {
  const res: any = { headers: {} as Record<string, string> };
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.set = jest.fn((k: string, v: string) => { res.headers[k] = v; return res; });
  res.send = jest.fn(() => res);
  return res;
};
const run = async (url: string, ip = '1.2.3.4') => {
  const res = mkRes();
  await imageProxy({ query: { url: encodeURIComponent(url) }, ip } as any, res);
  return res;
};
const URL_OK = 'https://i.ebayimg.com/images/a.jpg';
let fetchMock: jest.Mock;

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockIncrement.mockReset();
  mockIncrement.mockResolvedValue({ totalHits: 1, resetTime: new Date() });
  fetchMock = jest.fn();
  (global as any).fetch = fetchMock;
});

describe('imageProxy content-type policy', () => {
  it('relays a real image with nosniff and the upstream image type', async () => {
    fetchMock.mockResolvedValueOnce(new Response(Buffer.from('png-bytes'), { status: 200, headers: { 'content-type': 'image/png' } }));
    const res = await run(URL_OK);
    expect(res.send).toHaveBeenCalledTimes(1);
    expect(res.headers['Content-Type']).toBe('image/png');
    expect(res.headers['X-Content-Type-Options']).toBe('nosniff');
  });

  it('refuses SVG (can carry script), HTML, JSON and a missing content type with a 502 and relays nothing', async () => {
    for (const ct of ['image/svg+xml', 'image/svg+xml; charset=utf-8', 'text/html', 'application/json', 'application/javascript', '']) {
      fetchMock.mockResolvedValueOnce(new Response('<svg onload=alert(1)>', { status: 200, headers: ct ? { 'content-type': ct } : {} }));
      const res = await run(URL_OK);
      expect(res.status).toHaveBeenCalledWith(502);
      expect(res.send).not.toHaveBeenCalled();
    }
  });
});

describe('imageProxy size cap', () => {
  it('refuses a declared Content-Length over the cap without reading the body', async () => {
    fetchMock.mockResolvedValueOnce(new Response(Buffer.from('x'), { status: 200, headers: { 'content-type': 'image/jpeg', 'content-length': String(MAX_PROXY_BODY_BYTES + 1) } }));
    const res = await run(URL_OK);
    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.send).not.toHaveBeenCalled();
  });

  it('enforces the cap while streaming when Content-Length is absent or lies', async () => {
    const chunk = new Uint8Array(6 * 1024 * 1024);
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(chunk);
        controller.enqueue(chunk);
        controller.close();
      },
    });
    fetchMock.mockResolvedValueOnce(new Response(body, { status: 200, headers: { 'content-type': 'image/jpeg' } }));
    const res = await run(URL_OK);
    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.send).not.toHaveBeenCalled();
  });
});

describe('imageProxy error hygiene and budget', () => {
  it('does not echo the host or the allowlist on a 403', async () => {
    const res = await run('https://evil.example/x.png');
    expect(res.status).toHaveBeenCalledWith(403);
    const body = JSON.stringify(res.json.mock.calls[0][0]);
    expect(body).not.toMatch(/evil\.example/);
    expect(body).not.toMatch(/ebayimg|estatesales|liveauctioneers/);
  });

  it('does not echo internal error text on a 502', async () => {
    fetchMock.mockRejectedValueOnce(new Error('connect ECONNREFUSED 10.0.0.5:5432'));
    const res = await run(URL_OK);
    expect(res.status).toHaveBeenCalledWith(502);
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toMatch(/10\.0\.0\.5|ECONNREFUSED/);
  });

  it('429s an IP that is over its proxy budget and never fetches for it', async () => {
    mockIncrement.mockResolvedValue({ totalHits: IMAGE_PROXY_MAX_PER_WINDOW + 1, resetTime: new Date() });
    const res = await run(URL_OK);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keys the budget by client IP and fails open when the limiter store errors', async () => {
    fetchMock.mockResolvedValue(new Response(Buffer.from('ok'), { status: 200, headers: { 'content-type': 'image/webp' } }));
    await run(URL_OK, '9.9.9.9');
    expect(mockIncrement).toHaveBeenCalledWith('9.9.9.9');
    mockIncrement.mockRejectedValue(new Error('redis down'));
    const res = await run(URL_OK);
    expect(res.send).toHaveBeenCalled();
  });
});
