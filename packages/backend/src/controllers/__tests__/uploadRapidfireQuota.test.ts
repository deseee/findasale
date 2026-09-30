/**
 * uploadRapidfire Smart-tag quota awareness (2026-09-29). Capture is never blocked by an exhausted quota;
 * the client is told so it can show the upgrade prompt. Prisma, Cloudinary and AI collaborators are mocks.
 * NOT EXECUTED when written (jest cannot run on the authoring machine).
 */
const mockSaleFindUnique = jest.fn();
const mockItemCreate = jest.fn();
jest.mock('../../lib/prisma', () => ({
  prisma: {
    sale: { findUnique: (...a: unknown[]) => mockSaleFindUnique(...a) },
    item: { create: (...a: unknown[]) => mockItemCreate(...a) },
    photo: { create: jest.fn().mockResolvedValue({}) },
    organizer: { findUnique: jest.fn() },
  },
}));
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
jest.mock('../../services/cloudAIService', () => ({ analyzeItemImage: jest.fn(), isCloudAIAvailable: () => false }));
jest.mock('../../services/imageMatchService', () => ({
  findCatalogMatches: jest.fn(), buildCatalogMatchContext: jest.fn(), isCatalogMatchEnabled: () => false,
}));
jest.mock('../../services/ebayImageSearchService', () => ({ getEbayImageMatch: jest.fn(), buildEbayMatchContext: jest.fn() }));
jest.mock('../../jobs/processRapidDraft', () => ({ enqueueProcessRapidDraft: jest.fn() }));
jest.mock('../../lib/cloudinaryBandwidthTracker', () => ({ trackCloudinaryServe: jest.fn() }));
jest.mock('axios', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
const mockCheckAiTagQuota = jest.fn();
jest.mock('../../lib/aiTagsQuotaTracker', () => ({
  ...jest.requireActual('../../lib/aiTagsQuotaTracker'),
  checkAiTagQuota: (...a: unknown[]) => mockCheckAiTagQuota(...a),
  incrementAiTagCount: jest.fn().mockResolvedValue(1),
}));

import { uploadRapidfire } from '../uploadController';

const mkRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};
const mkReq = (user: Record<string, unknown> = { id: 'u1', roles: ['ORGANIZER'] }) =>
  ({
    user,
    body: { saleId: 's1' },
    file: { buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]), mimetype: 'image/jpeg' },
  } as any);

beforeEach(() => {
  jest.useFakeTimers(); // resetRapidDraftDebounce arms a 4.5s timer
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockSaleFindUnique.mockResolvedValue({
    id: 's1',
    organizerId: 'org1',
    organizer: { id: 'org1', userId: 'u1', subscriptionTier: 'SIMPLE' },
  });
  mockItemCreate.mockResolvedValue({ id: 'item1' });
  mockCheckAiTagQuota.mockResolvedValue({ exceeded: false, used: 3, limit: 100, remaining: 97 });
});
afterEach(() => {
  jest.useRealTimers();
});

describe('uploadRapidfire quota awareness', () => {
  it('reports remaining quota on a normal capture', async () => {
    const res = mkRes();
    await uploadRapidfire(mkReq(), res);
    expect(res.status).toHaveBeenCalledWith(201);
    const body = res.json.mock.calls[0][0];
    expect(body.itemId).toBe('item1');
    expect(body.aiQuota).toEqual({ exceeded: false, remaining: 97, limit: 100 });
    expect(body.code).toBeUndefined();
    expect(mockCheckAiTagQuota).toHaveBeenCalledWith('org1', 'SIMPLE');
  });

  it('still creates the draft when the quota is exhausted, and says so', async () => {
    mockCheckAiTagQuota.mockResolvedValue({ exceeded: true, used: 100, limit: 100, remaining: 0 });
    const res = mkRes();
    await uploadRapidfire(mkReq(), res);
    expect(mockItemCreate).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(201);
    const body = res.json.mock.calls[0][0];
    expect(body.code).toBe('AI_QUOTA_EXCEEDED');
    expect(typeof body.message).toBe('string');
    expect(body.aiQuota.exceeded).toBe(true);
  });

  it('serialises an unlimited (Infinity) tier as null', async () => {
    mockCheckAiTagQuota.mockResolvedValue({ exceeded: false, used: 5, limit: Infinity, remaining: Infinity });
    const res = mkRes();
    await uploadRapidfire(mkReq(), res);
    expect(res.json.mock.calls[0][0].aiQuota).toEqual({ exceeded: false, remaining: null, limit: null });
  });

  it('uses Organizer.subscriptionTier as the truth: no lapse downgrade (decisions D1/D2)', async () => {
    mockSaleFindUnique.mockResolvedValue({
      id: 's1', organizerId: 'org1', organizer: { id: 'org1', userId: 'u1', subscriptionTier: 'PRO' },
    });
    await uploadRapidfire(mkReq({ id: 'u1', roles: ['ORGANIZER'], subscriptionLapsed: true }), mkRes());
    expect(mockCheckAiTagQuota).toHaveBeenCalledWith('org1', 'PRO');
  });

  it('does not block capture when the quota lookup fails', async () => {
    mockCheckAiTagQuota.mockRejectedValue(new Error('db down'));
    const res = mkRes();
    await uploadRapidfire(mkReq(), res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json.mock.calls[0][0].aiQuota).toBeUndefined();
  });

  it('still refuses a sale that is not the caller\'s', async () => {
    mockSaleFindUnique.mockResolvedValue({
      id: 's1', organizerId: 'org2', organizer: { id: 'org2', userId: 'someone-else', subscriptionTier: 'SIMPLE' },
    });
    const res = mkRes();
    await uploadRapidfire(mkReq(), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockCheckAiTagQuota).not.toHaveBeenCalled();
    expect(mockItemCreate).not.toHaveBeenCalled();
  });
});
