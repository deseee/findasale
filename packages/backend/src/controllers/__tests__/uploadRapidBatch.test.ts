/**
 * rapid-batch (P1, 2026-09-29): the paid analysis is AWAITED and the tags come back in the response;
 * only photos that produced tags stay charged, everything else is refunded through gate.settle().
 * Prisma, Cloudinary and the AI providers are mocks; no network, no paid call.
 */
jest.mock('../../lib/prisma', () => ({ prisma: { sale: { findUnique: jest.fn() }, item: { create: jest.fn() }, organizer: { findUnique: jest.fn() } } }));
jest.mock('cloudinary', () => ({
  v2: {
    config: jest.fn(),
    uploader: {
      upload_stream: (_opts: unknown, cb: (e: unknown, r: unknown) => void) => ({
        end: () => cb(null, { secure_url: 'https://res.cloudinary.com/demo/image/upload/v1/a.jpg' }),
      }),
    },
  },
}));
const mockAnalyzeItemImage = jest.fn();
jest.mock('../../services/cloudAIService', () => ({
  analyzeItemImage: (...a: unknown[]) => mockAnalyzeItemImage(...a),
  isCloudAIAvailable: () => true,
}));
jest.mock('../../services/imageMatchService', () => ({ findCatalogMatches: jest.fn(), buildCatalogMatchContext: jest.fn(), isCatalogMatchEnabled: () => false }));
jest.mock('../../services/ebayImageSearchService', () => ({ getEbayImageMatch: jest.fn(), buildEbayMatchContext: jest.fn() }));
jest.mock('../../jobs/processRapidDraft', () => ({ enqueueProcessRapidDraft: jest.fn() }));
jest.mock('../../lib/cloudinaryBandwidthTracker', () => ({ trackCloudinaryServe: jest.fn() }));
const mockAxiosPost = jest.fn();
jest.mock('axios', () => ({ __esModule: true, default: { get: jest.fn(), post: (...a: unknown[]) => mockAxiosPost(...a) } }));
jest.mock('../../lib/aiTagsQuotaTracker', () => ({
  ...jest.requireActual('../../lib/aiTagsQuotaTracker'),
  checkAiTagQuota: jest.fn(),
  reserveAiTags: jest.fn(),
  refundAiTags: jest.fn(),
}));

import { rapidBatchUpload } from '../uploadController';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const BAD = Buffer.from('not an image at all');
const file = (buffer: Buffer = JPEG) => ({ buffer, mimetype: 'image/jpeg' });

const mkRes = (withGate = true) => {
  const settle = jest.fn().mockResolvedValue(undefined);
  const res: any = { locals: withGate ? { aiGate: { organizerId: 'org1', tier: 'SIMPLE', saleId: null, reserved: 3, settle } } : {} };
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return { res, settle };
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  mockAnalyzeItemImage.mockResolvedValue({ title: 'Brass lamp', description: 'A lamp', category: 'Lighting', condition: 'USED', suggestedPrice: 12, tags: ['brass'] });
  mockAxiosPost.mockRejectedValue(new Error('ollama down'));
});

describe('rapidBatchUpload', () => {
  it('fails closed (403) when mounted without the organizer AI gate', async () => {
    const { res } = mkRes(false);
    await rapidBatchUpload({ files: [file()] } as any, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockAnalyzeItemImage).not.toHaveBeenCalled();
  });

  it('awaits the analysis and returns the tags in the same response', async () => {
    const { res, settle } = mkRes();
    await rapidBatchUpload({ files: [file(), file(), file()] } as any, res);
    expect(res.json).toHaveBeenCalledTimes(1);
    const body = res.json.mock.calls[0][0];
    expect(body.smartTagsUsed).toBe(3);
    expect(body.results).toHaveLength(3);
    for (const r of body.results) {
      expect(r.ai).toMatchObject({ title: 'Brass lamp' });
      expect(r.aiStatus).toBe('ok');
      expect(r.cloudinaryUrl).toContain('res.cloudinary.com');
    }
    expect(mockAnalyzeItemImage).toHaveBeenCalledTimes(3);
    expect(settle).toHaveBeenCalledWith(3);
  });

  it('bounds analysis concurrency at 3 photos at a time', async () => {
    let running = 0;
    let peak = 0;
    mockAnalyzeItemImage.mockImplementation(async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((r) => setImmediate(r));
      running -= 1;
      return { title: 't' };
    });
    const { res } = mkRes();
    await rapidBatchUpload({ files: Array.from({ length: 8 }, () => file()) } as any, res);
    expect(peak).toBeLessThanOrEqual(3);
    expect(res.json.mock.calls[0][0].smartTagsUsed).toBe(8);
  });

  it('refunds photos whose analysis produced nothing (providers down) and reports them as unavailable', async () => {
    mockAnalyzeItemImage.mockResolvedValue(null);
    const { res, settle } = mkRes();
    await rapidBatchUpload({ files: [file(), file()] } as any, res);
    const body = res.json.mock.calls[0][0];
    expect(body.smartTagsUsed).toBe(0);
    expect(body.results.map((r: any) => r.aiStatus)).toEqual(['unavailable', 'unavailable']);
    expect(body.results.every((r: any) => r.ai === null && r.cloudinaryUrl)).toBe(true);
    expect(settle).toHaveBeenCalledWith(0);
  });

  it('a photo that fails to upload is not analyzed and not charged; the others still are', async () => {
    const { res, settle } = mkRes();
    await rapidBatchUpload({ files: [file(), file(BAD), file()] } as any, res);
    const body = res.json.mock.calls[0][0];
    expect(body.results[1]).toMatchObject({ index: 1, cloudinaryUrl: null, ai: null, aiStatus: 'skipped' });
    expect(body.results[1].error).toMatch(/magic bytes/i);
    expect(mockAnalyzeItemImage).toHaveBeenCalledTimes(2);
    expect(body.smartTagsUsed).toBe(2);
    expect(settle).toHaveBeenCalledWith(2);
  });

  it('a cloud AI throw falls back to the next provider without failing the request', async () => {
    mockAnalyzeItemImage.mockRejectedValue(new Error('anthropic 400'));
    mockAxiosPost.mockResolvedValue({ data: { response: '{"title":"Fallback lamp","description":"d","category":"Other","condition":"USED","suggestedPrice":5}' } });
    const { res } = mkRes();
    await rapidBatchUpload({ files: [file()] } as any, res);
    const body = res.json.mock.calls[0][0];
    expect(body.results[0].ai).toMatchObject({ title: 'Fallback lamp' });
    expect(body.smartTagsUsed).toBe(1);
  });

  it('rejects empty and oversize batches before spending anything', async () => {
    const empty = mkRes();
    await rapidBatchUpload({ files: [] } as any, empty.res);
    expect(empty.res.status).toHaveBeenCalledWith(400);
    const big = mkRes();
    await rapidBatchUpload({ files: Array.from({ length: 11 }, () => file()) } as any, big.res);
    expect(big.res.status).toHaveBeenCalledWith(400);
    expect(mockAnalyzeItemImage).not.toHaveBeenCalled();
  });
});
