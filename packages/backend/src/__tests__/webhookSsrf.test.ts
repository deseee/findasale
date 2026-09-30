/**
 * Outbound webhook SSRF (P2, 2026-09-29): a webhook URL is validated at create, update AND delivery; delivery
 * pins the connection to public addresses, never follows redirects and never logs the query string.
 * Prisma, axios and DNS are mocks; nothing is sent.
 */
const mockWebhook = { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn() };
jest.mock('../lib/prisma', () => ({ prisma: { webhook: mockWebhook } }));
const mockAxiosPost = jest.fn();
jest.mock('axios', () => ({ __esModule: true, default: { post: (...a: any[]) => mockAxiosPost(...a) } }));
const mockPublicPreflight = jest.fn();
jest.mock('../utils/safeFetchPublicUrl', () => ({
  ...jest.requireActual('../utils/safeFetchPublicUrl'),
  isSafePublicFetchUrl: (...a: any[]) => mockPublicPreflight(...a),
}));

import { fireWebhooks } from '../services/webhookService';
import { createWebhook, updateWebhook } from '../controllers/webhookController';
import { isSafeWebhookUrl, webhookLogHost } from '../utils/webhookUrl';

const ENV = process.env.NODE_ENV;
const mkRes = () => {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};
beforeEach(() => {
  jest.clearAllMocks();
  process.env.NODE_ENV = 'production';
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockPublicPreflight.mockResolvedValue(true);
  mockAxiosPost.mockResolvedValue({ status: 200 });
  mockWebhook.count.mockResolvedValue(0);
  mockWebhook.create.mockImplementation(async ({ data }: any) => ({ id: 'h1', ...data }));
  mockWebhook.update.mockImplementation(async ({ data }: any) => ({ id: 'h1', secret: 'abcdef123456', ...data }));
  mockWebhook.findUnique.mockResolvedValue({ id: 'h1', userId: 'u1', secret: 'abcdef123456' });
});
afterAll(() => {
  process.env.NODE_ENV = ENV;
});

const BAD_URLS = [
  'https://169.254.169.254/latest/meta-data',
  'https://127.0.0.1/hook',
  'https://[::1]/hook',
  'https://0x7f.0.0.1/hook',
  'https://2130706433/hook',
  'https://localhost/hook',
  'https://db.internal/hook',
  'https://printer.local/hook',
  'https://intranet/hook',
  'https://user:pw@hooks.example.com/hook',
  'https://hooks.example.com:8443/hook',
  'http://hooks.example.com/hook', // plain http is refused in production
  'ftp://hooks.example.com/hook',
  'javascript:alert(1)',
  'not a url',
  '',
];

describe('isSafeWebhookUrl', () => {
  it('accepts a public https URL and refuses internal / malformed / credentialed ones (production)', () => {
    expect(isSafeWebhookUrl('https://hooks.example.com/path?x=1')).toBe(true);
    for (const u of BAD_URLS) expect(isSafeWebhookUrl(u)).toBe(false);
    expect(isSafeWebhookUrl(undefined)).toBe(false);
    expect(isSafeWebhookUrl({ toString: () => 'https://hooks.example.com' })).toBe(false);
  });

  it('allows plain http only outside production, and still refuses internal hosts there', () => {
    process.env.NODE_ENV = 'development';
    expect(isSafeWebhookUrl('http://hooks.example.com/x')).toBe(true);
    expect(isSafeWebhookUrl('http://localhost:3000/x')).toBe(false);
    expect(isSafeWebhookUrl('http://169.254.169.254/x')).toBe(false);
  });

  it('logs the host only, never the path or query', () => {
    expect(webhookLogHost('https://hooks.example.com/a/b?token=SECRET')).toBe('hooks.example.com');
    expect(webhookLogHost('garbage')).toBe('invalid-url');
  });
});

describe('createWebhook / updateWebhook validate the URL', () => {
  it('create: 400 for every unsafe URL and no row is written', async () => {
    for (const url of BAD_URLS) {
      const res = mkRes();
      await createWebhook({ user: { id: 'u1' }, body: { url, events: ['item.sold'] } } as any, res);
      expect(res.status).toHaveBeenCalledWith(400);
    }
    expect(mockWebhook.create).not.toHaveBeenCalled();
  });

  it('create: 201 for a public https URL, stored trimmed', async () => {
    const res = mkRes();
    await createWebhook({ user: { id: 'u1' }, body: { url: '  https://hooks.example.com/in  ', events: ['item.sold', 'item.published'] } } as any, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockWebhook.create.mock.calls[0][0].data.url).toBe('https://hooks.example.com/in');
  });

  it('update: an unsafe URL is refused; a safe one is accepted; omitting url leaves it alone', async () => {
    const bad = mkRes();
    await updateWebhook({ user: { id: 'u1' }, params: { id: 'h1' }, body: { url: 'https://10.0.0.1/x' } } as any, bad);
    expect(bad.status).toHaveBeenCalledWith(400);
    expect(mockWebhook.update).not.toHaveBeenCalled();

    const ok = mkRes();
    await updateWebhook({ user: { id: 'u1' }, params: { id: 'h1' }, body: { url: 'https://hooks.example.com/y' } } as any, ok);
    expect(mockWebhook.update.mock.calls[0][0].data.url).toBe('https://hooks.example.com/y');

    mockWebhook.update.mockClear();
    const only = mkRes();
    await updateWebhook({ user: { id: 'u1' }, params: { id: 'h1' }, body: { isActive: false } } as any, only);
    expect(mockWebhook.update.mock.calls[0][0].data).toEqual({ isActive: false });
  });
});

describe('fireWebhooks delivery', () => {
  const hook = (url: string) => ({ id: 'h1', url, secret: 'sekret' });

  it('delivers to a safe URL with a signature, no redirects, no env proxy and a pinned agent', async () => {
    mockWebhook.findMany.mockResolvedValue([hook('https://hooks.example.com/in')]);
    await fireWebhooks('u1', 'item.sold', { id: 'i1' });
    expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    const [url, body, cfg] = mockAxiosPost.mock.calls[0];
    expect(url).toBe('https://hooks.example.com/in');
    expect(typeof body).toBe('string');
    expect(cfg.maxRedirects).toBe(0);
    expect(cfg.proxy).toBe(false);
    expect(cfg.httpsAgent).toBeTruthy();
    expect(cfg.headers['X-FindASale-Signature']).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(cfg.timeout).toBe(8000);
  });

  it('never calls a stored URL that is unsafe (e.g. saved before the guard existed)', async () => {
    mockWebhook.findMany.mockResolvedValue(BAD_URLS.filter(Boolean).map((u, i) => ({ id: `h${i}`, url: u, secret: 's' })));
    await fireWebhooks('u1', 'item.sold', {});
    expect(mockAxiosPost).not.toHaveBeenCalled();
    expect(mockPublicPreflight).not.toHaveBeenCalled();
  });

  it('never calls a URL whose DNS resolves to a non-public address', async () => {
    mockPublicPreflight.mockResolvedValue(false);
    mockWebhook.findMany.mockResolvedValue([hook('https://rebind.example.com/in')]);
    await fireWebhooks('u1', 'item.sold', {});
    expect(mockAxiosPost).not.toHaveBeenCalled();
  });

  it('one bad hook does not stop the others, and a failure log never contains the query string', async () => {
    const errSpy = console.error as unknown as jest.Mock;
    mockWebhook.findMany.mockResolvedValue([hook('https://a.example.com/x?token=SECRETVALUE'), hook('https://b.example.com/y')]);
    mockAxiosPost.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ status: 200 });
    await fireWebhooks('u1', 'item.sold', {});
    expect(mockAxiosPost).toHaveBeenCalledTimes(2);
    const logged = errSpy.mock.calls.map((c: any[]) => c.join(' ')).join('\n');
    expect(logged).toContain('a.example.com');
    expect(logged).not.toContain('SECRETVALUE');
  });

  it('a hook query failure is non-fatal', async () => {
    mockWebhook.findMany.mockRejectedValue(new Error('db down'));
    await expect(fireWebhooks('u1', 'item.sold', {})).resolves.toBeUndefined();
  });
});
