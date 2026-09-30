/**
 * SSRF guards for server-side fetches of stored / caller-supplied image URLs (2026-09-29).
 * Prisma, axios, fetch and every heavy collaborator are jest mocks; no network. NOT EXECUTED when written
 * (jest cannot run on the authoring machine).
 */
const mockAxiosGet = jest.fn();
const mockItemFindUnique = jest.fn();
const mockAnalyzeItemImages = jest.fn();

jest.mock('axios', () => ({ __esModule: true, default: { get: (...a: unknown[]) => mockAxiosGet(...a) } }));
jest.mock('../lib/prisma', () => ({
  prisma: { item: { findUnique: (...a: unknown[]) => mockItemFindUnique(...a), update: jest.fn() } },
}));
jest.mock('../middleware/auth', () => ({}));
jest.mock('../services/cloudAIService', () => ({ analyzeItemImages: (...a: unknown[]) => mockAnalyzeItemImages(...a) }));
jest.mock('../services/productEnrichment', () => ({ enrichItem: jest.fn(), planEnrichmentApply: jest.fn() }));
jest.mock('../controllers/ebayController', () => ({ suggestEbayCategoryForTitle: jest.fn() }));
jest.mock('../controllers/itemController', () => ({ syncListedItemFieldsToEbay: jest.fn() }));
jest.mock('../services/modelBakeoffService', () => ({
  runModelBakeoff: jest.fn(),
  runGroundedResolution: jest.fn(),
  runVisualResolution: jest.fn(),
}));
jest.mock('../services/groundedIdentityService', () => ({ resolveGroundedIdentityInline: jest.fn() }));
jest.mock('../utils/ebayShippingClassifier', () => ({ classifyEbayShipping: jest.fn() }));

import { reanalyzeItem } from '../services/reanalyzeService';
import { fetchImageBuffer } from '../controllers/brandKitPrintController';
import { imageProxy, isAllowedProxyTarget, fetchAllowlisted } from '../controllers/imageProxyController';
import { isSafeBrandAssetUrl, isSafeFetchUrl, appAssetHosts } from '../utils/safeFetchUrl';

const CLOUD = 'https://res.cloudinary.com/demo/image/upload/v1/a.jpg';

const ENV_KEYS = ['FRONTEND_URL', 'NEXT_PUBLIC_SITE_URL', 'BACKEND_URL', 'BRAND_ASSET_ALLOWED_HOSTS', 'SAFE_FETCH_ALLOWED_HOSTS', 'RAILWAY_PUBLIC_DOMAIN'];
const savedEnv: Record<string, string | undefined> = {};
beforeEach(() => {
  jest.clearAllMocks();
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  jest.restoreAllMocks();
});

describe('reanalyzeService image download guard', () => {
  const baseItem = (photoUrls: string[]) => ({
    id: 'i1',
    title: 't',
    description: null,
    category: null,
    condition: null,
    conditionGrade: null,
    price: 5,
    tags: [],
    photoUrls,
    userEditedFields: [],
    sale: { id: 's1', organizerId: 'o1' },
  });

  beforeEach(() => {
    mockAxiosGet.mockResolvedValue({ data: Buffer.from('img'), headers: { 'content-type': 'image/png' } });
    mockAnalyzeItemImages.mockResolvedValue(null); // ends the run right after downloads: AI_UNAVAILABLE
  });

  it('downloads only allowlisted https stored photos and never follows redirects', async () => {
    mockItemFindUnique.mockResolvedValue(
      baseItem([
        CLOUD,
        'https://169.254.169.254/latest/meta-data',
        'http://res.cloudinary.com/insecure.jpg',
        'https://internal.example/a.jpg',
        'https://localhost/admin.png',
      ]),
    );
    const out = await reanalyzeItem('i1', { apply: false });
    expect(out).toEqual({ ok: false, code: 'AI_UNAVAILABLE' });
    expect(mockAxiosGet).toHaveBeenCalledTimes(1);
    expect(mockAxiosGet.mock.calls[0][0]).toBe(CLOUD);
    expect(mockAxiosGet.mock.calls[0][1]).toEqual(expect.objectContaining({ maxRedirects: 0, responseType: 'arraybuffer' }));
  });

  it('returns PHOTO_DOWNLOAD_FAILED when every stored photo is blocked', async () => {
    mockItemFindUnique.mockResolvedValue(baseItem(['https://10.0.0.5/x.jpg', 'http://example.com/x.jpg']));
    const out = await reanalyzeItem('i1', { apply: false });
    expect(out).toEqual({ ok: false, code: 'PHOTO_DOWNLOAD_FAILED' });
    expect(mockAxiosGet).not.toHaveBeenCalled();
  });

  it('filters caller-supplied testImageUrls through the same guard', async () => {
    mockItemFindUnique.mockResolvedValue(baseItem(['https://res.cloudinary.com/demo/stored.jpg']));
    const out = await reanalyzeItem('i1', { apply: true, testImageUrls: [CLOUD, 'https://169.254.169.254/', 'http://res.cloudinary.com/x.jpg'] });
    expect(out).toEqual({ ok: false, code: 'AI_UNAVAILABLE' });
    expect(mockAxiosGet).toHaveBeenCalledTimes(1);
    expect(mockAxiosGet.mock.calls[0][0]).toBe(CLOUD);
  });

  it('does not fall back to stored photos when every requested test URL is blocked', async () => {
    mockItemFindUnique.mockResolvedValue(baseItem(['https://res.cloudinary.com/demo/stored.jpg']));
    const out = await reanalyzeItem('i1', { apply: true, testImageUrls: ['https://169.254.169.254/latest'] });
    expect(out).toEqual({ ok: false, code: 'PHOTO_DOWNLOAD_FAILED' });
    expect(mockAxiosGet).not.toHaveBeenCalled();
  });
});

describe('brandKitPrintController.fetchImageBuffer (brandLogoUrl)', () => {
  beforeEach(() => {
    mockAxiosGet.mockResolvedValue({ data: Buffer.from('logo') });
  });

  it('fetches Cloudinary logos with redirects disabled and the pinned public-host agent', async () => {
    const buf = await fetchImageBuffer(CLOUD);
    expect(buf?.toString()).toBe('logo');
    expect(mockAxiosGet).toHaveBeenCalledWith(
      CLOUD,
      expect.objectContaining({ maxRedirects: 0, responseType: 'arraybuffer', proxy: false, httpsAgent: expect.anything() })
    );
  });

  it('refuses internal hosts, metadata endpoints, IP literals, http and odd schemes', async () => {
    for (const u of [
      'http://169.254.169.254/latest/meta-data',
      'https://169.254.169.254/latest/meta-data',
      'https://localhost/logo.png',
      'https://10.0.0.1/logo.png',
      'https://[::1]/logo.png',
      'https://[::ffff:169.254.169.254]/logo.png',
      'https://2130706433/logo.png',
      'https://intranet/logo.png',
      'https://metadata.google.internal/logo.png',
      'https://user:pw@logos.example.org/logo.png',
      'https://logos.example.org:8443/logo.png',
      'http://res.cloudinary.com/logo.png',
      'file:///etc/passwd',
    ]) {
      expect(await fetchImageBuffer(u)).toBeNull();
    }
    expect(mockAxiosGet).not.toHaveBeenCalled();
  });

  it('accepts any public https DNS host (organizer-hosted logos), no allowlist config needed', async () => {
    for (const u of [
      'https://finda.sale/uploads/logo.png',
      'https://random-host.example/logo.png',
      'https://a.cdn.example.com/l.png',
      'https://logos.example.org:443/l.png',
    ]) {
      expect((await fetchImageBuffer(u))?.toString()).toBe('logo');
    }
    expect(mockAxiosGet).toHaveBeenCalledTimes(4);
  });

  it('passes a pinned lookup so a public name that resolves to an internal address cannot connect', async () => {
    await fetchImageBuffer('https://logos.example.org/l.png');
    const opts = mockAxiosGet.mock.calls[0][1] as { httpsAgent: { options?: { lookup?: unknown } } };
    expect(typeof opts.httpsAgent.options?.lookup).toBe('function');
  });

  it('returns null (no throw) when the download fails', async () => {
    mockAxiosGet.mockRejectedValue(new Error('boom'));
    expect(await fetchImageBuffer(CLOUD)).toBeNull();
  });
});

describe('appAssetHosts / isSafeBrandAssetUrl', () => {
  it('derives hostnames from app URL envs and drops localhost / single-label / IP hosts', () => {
    process.env.FRONTEND_URL = 'https://finda.sale';
    process.env.BACKEND_URL = 'http://localhost:5000';
    process.env.NEXT_PUBLIC_SITE_URL = 'https://10.1.2.3';
    process.env.RAILWAY_PUBLIC_DOMAIN = 'api.finda.sale';
    process.env.BRAND_ASSET_ALLOWED_HOSTS = 'intranet, cdn.example.com';
    const hosts = appAssetHosts();
    expect(hosts).toEqual(expect.arrayContaining(['finda.sale', 'api.finda.sale', 'cdn.example.com']));
    expect(hosts).not.toContain('localhost');
    expect(hosts).not.toContain('10.1.2.3');
    expect(hosts).not.toContain('intranet');
  });

  it('never allows IP literals even if listed, and keeps the standard https rules', () => {
    process.env.BRAND_ASSET_ALLOWED_HOSTS = '10.0.0.5';
    expect(isSafeBrandAssetUrl('https://10.0.0.5/x.png')).toBe(false);
    process.env.FRONTEND_URL = 'https://finda.sale';
    expect(isSafeBrandAssetUrl('https://user:pw@finda.sale/x.png')).toBe(false);
    expect(isSafeBrandAssetUrl('https://finda.sale:8443/x.png')).toBe(false);
    expect(isSafeBrandAssetUrl('https://finda.sale/x.png')).toBe(true);
    // the default guard alone does not trust app hosts
    expect(isSafeFetchUrl('https://finda.sale/x.png')).toBe(false);
  });
});

describe('imageProxyController redirect handling', () => {
  const mkRes = () => {
    const res: any = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    res.set = jest.fn(() => res);
    res.send = jest.fn(() => res);
    return res;
  };
  const run = async (url: string) => {
    const res = mkRes();
    await imageProxy({ query: { url: encodeURIComponent(url) } } as any, res);
    return res;
  };
  const okImage = () => new Response(Buffer.from('png-bytes'), { status: 200, headers: { 'content-type': 'image/png' } });
  const redirect = (location: string, status = 302) => new Response(null, { status, headers: { location } });
  let fetchMock: jest.Mock;
  beforeEach(() => {
    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
  });

  it('serves an allowlisted image and asks fetch NOT to follow redirects itself', async () => {
    fetchMock.mockResolvedValueOnce(okImage());
    const res = await run('https://i.ebayimg.com/images/a.jpg');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toEqual(expect.objectContaining({ redirect: 'manual' }));
    expect(res.send).toHaveBeenCalled();
    expect(res.set).toHaveBeenCalledWith('Content-Type', 'image/png');
  });

  it('refuses a redirect from an allowlisted host to an internal address', async () => {
    fetchMock.mockResolvedValueOnce(redirect('http://169.254.169.254/latest/meta-data'));
    const res = await run('https://i.ebayimg.com/images/a.jpg');
    expect(fetchMock).toHaveBeenCalledTimes(1); // the internal target is never requested
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).not.toHaveBeenCalled();
  });

  it('refuses a redirect to a non-allowlisted public host', async () => {
    fetchMock.mockResolvedValueOnce(redirect('https://evil.example/x.png'));
    const res = await run('https://i.ebayimg.com/images/a.jpg');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('follows a redirect that stays on the allowlist (relative and absolute) and re-validates every hop', async () => {
    fetchMock
      .mockResolvedValueOnce(redirect('/images/b.jpg', 301))
      .mockResolvedValueOnce(redirect('https://thumbs.ebaystatic.com/c.jpg', 307))
      .mockResolvedValueOnce(okImage());
    const res = await run('https://i.ebayimg.com/images/a.jpg');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toBe('https://i.ebayimg.com/images/b.jpg');
    expect(fetchMock.mock.calls[2][0]).toBe('https://thumbs.ebaystatic.com/c.jpg');
    expect(res.send).toHaveBeenCalled();
  });

  it('gives up after too many redirects', async () => {
    fetchMock.mockImplementation(async () => redirect('https://i.ebayimg.com/loop.jpg'));
    const res = await run('https://i.ebayimg.com/images/a.jpg');
    expect(res.status).toHaveBeenCalledWith(403);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it('rejects non-allowlisted hosts, credentials, odd schemes and junk before any fetch', async () => {
    expect((await run('https://evil.example/x.png')).status).toHaveBeenCalledWith(403);
    expect((await run('http://169.254.169.254/x')).status).toHaveBeenCalledWith(403);
    expect((await run('https://user:pw@i.ebayimg.com/x.png')).status).toHaveBeenCalledWith(403);
    expect((await run('file:///etc/passwd')).status).toHaveBeenCalledWith(403);
    expect((await run('https://i.ebayimg.com.evil.example/x.png')).status).toHaveBeenCalledWith(403);
    expect((await run('not a url')).status).toHaveBeenCalledWith(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('isAllowedProxyTarget and fetchAllowlisted agree on the allowlist', async () => {
    expect(isAllowedProxyTarget(new URL('https://i.ebayimg.com/a.jpg'))).toBe(true);
    expect(isAllowedProxyTarget(new URL('https://cdn.tlstatic.com/a.jpg'))).toBe(true); // subdomain of allowlisted domain
    expect(isAllowedProxyTarget(new URL('ftp://i.ebayimg.com/a.jpg'))).toBe(false);
    fetchMock.mockResolvedValueOnce(redirect('https://evil.example/x'));
    const out = await fetchAllowlisted(new URL('https://i.ebayimg.com/a.jpg'), {});
    expect(out).toEqual({ blocked: true, reason: 'redirect target not allowed' });
  });
});
