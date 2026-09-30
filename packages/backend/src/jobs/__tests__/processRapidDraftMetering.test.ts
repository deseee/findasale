/**
 * processRapidDraft Smart-tag metering + SSRF guard (2026-09-29). Every collaborator is a jest mock; no
 * network, no paid call. NOT EXECUTED when written (jest cannot run on the authoring machine).
 */
const mockItemFindUnique = jest.fn();
const mockItemUpdate = jest.fn();
const mockItemUpdateMany = jest.fn();
const mockItemFindMany = jest.fn();
const mockOrganizerFindUnique = jest.fn();
jest.mock('../../lib/prisma', () => ({
  prisma: {
    item: {
      findUnique: (...a: unknown[]) => mockItemFindUnique(...a),
      update: (...a: unknown[]) => mockItemUpdate(...a),
      updateMany: (...a: unknown[]) => mockItemUpdateMany(...a),
      findMany: (...a: unknown[]) => mockItemFindMany(...a),
    },
    organizer: { findUnique: (...a: unknown[]) => mockOrganizerFindUnique(...a) },
    photo: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
  },
}));
jest.mock('@prisma/client', () => ({ Prisma: { JsonNull: null } }));

const mockAnalyzeItemImage = jest.fn();
jest.mock('../../services/cloudAIService', () => ({
  analyzeItemImage: (...a: unknown[]) => mockAnalyzeItemImage(...a),
  analyzeItemImages: jest.fn(),
  suggestPrice: jest.fn(),
}));
jest.mock('../../utils/charmPricing', () => ({ applyCharmPricing: (n: number) => n }));
const mockCheckAITagLimit = jest.fn();
jest.mock('../../lib/tierEnforcement', () => ({ checkAITagLimit: (...a: unknown[]) => mockCheckAITagLimit(...a) }));
jest.mock('../../services/descriptionMerger', () => ({ composeDescription: () => ({ description: 'merged' }) }));
jest.mock('../../services/ebayTaxonomyService', () => ({ suggestCategories: jest.fn().mockResolvedValue([]) }));
jest.mock('../../controllers/ebayController', () => ({
  getEbayAccessToken: jest.fn().mockResolvedValue(null),
  computeEffectivePackageWeight: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../services/serverBarcodeDecoder', () => ({ decodeBarcodeFromImage: jest.fn().mockResolvedValue(null) }));
jest.mock('../../services/ebayCatalogLookup', () => ({ lookupByBarcode: jest.fn().mockResolvedValue(null) }));
jest.mock('../../services/productEnrichment', () => ({
  enrichItem: jest.fn().mockResolvedValue({ merged: {} }),
  planEnrichmentApply: jest.fn(() => ({ apply: {}, suggestion: undefined })),
}));
jest.mock('../../services/groundedIdentityService', () => ({ runGroundedIdentityAsync: jest.fn() }));
jest.mock('../../lib/anthropicError', () => ({
  isAnthropicCreditError: () => false,
  alertAnthropicCreditExhausted: jest.fn(),
}));
jest.mock('../../services/marketplace/recordIdentity', () => ({ mergeAiRecordIdentity: () => null }));
jest.mock('../../utils/ebayShippingClassifier', () => ({ classifyEbayShipping: () => 'UNKNOWN' }));
const mockAxiosGet = jest.fn();
jest.mock('axios', () => ({ __esModule: true, default: { get: (...a: unknown[]) => mockAxiosGet(...a), post: jest.fn() } }));
const mockCheckAiTagQuota = jest.fn();
const mockReserveAiTags = jest.fn();
const mockRefundAiTags = jest.fn();
const mockIncrementAiTagCount = jest.fn();
jest.mock('../../lib/aiTagsQuotaTracker', () => ({
  checkAiTagQuota: (...a: unknown[]) => mockCheckAiTagQuota(...a),
  reserveAiTags: (...a: unknown[]) => mockReserveAiTags(...a),
  refundAiTags: (...a: unknown[]) => mockRefundAiTags(...a),
  incrementAiTagCount: (...a: unknown[]) => mockIncrementAiTagCount(...a),
}));

import { processRapidDraft, enqueueProcessRapidDraft, getRapidDraftQueueStats, RAPID_DRAFT_CONCURRENCY } from '../processRapidDraft';

const GOOD_URL = 'https://res.cloudinary.com/demo/image/upload/v1/a.jpg';
const baseItem = (over: Record<string, unknown> = {}) => ({
  id: 'it1',
  draftStatus: 'DRAFT',
  photoUrls: [GOOD_URL],
  userEditedFields: [],
  title: 'Untitled Item',
  description: null,
  category: null,
  condition: null,
  price: null,
  brand: null,
  aiErrorLog: [],
  updatedAt: new Date('2026-09-29T00:00:00Z'),
  sale: { id: 's1', organizer: { userId: 'u1' } },
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockItemFindUnique.mockResolvedValue(baseItem());
  mockItemUpdate.mockResolvedValue({});
  mockItemUpdateMany.mockResolvedValue({ count: 1 });
  mockItemFindMany.mockResolvedValue([]);
  mockOrganizerFindUnique.mockResolvedValue({ id: 'org1', subscriptionTier: 'SIMPLE' });
  mockCheckAITagLimit.mockResolvedValue({ isOverLimit: false, tagCount: 1, limit: 100 });
  mockCheckAiTagQuota.mockResolvedValue({ exceeded: false, used: 1, limit: 100, remaining: 99 });
  mockReserveAiTags.mockResolvedValue({ ok: true, reserved: 1, used: 2, limit: 100, remaining: 98 });
  mockRefundAiTags.mockResolvedValue(undefined);
  mockIncrementAiTagCount.mockResolvedValue(2);
  mockAxiosGet.mockResolvedValue({ data: new Uint8Array([0xff, 0xd8, 0xff]) });
  mockAnalyzeItemImage.mockResolvedValue({
    title: 'Brass lamp',
    description: 'A lamp',
    category: 'Lighting',
    condition: 'USED',
    suggestedPrice: 12,
    tags: [],
  });
});

describe('processRapidDraft Smart-tag metering', () => {
  it('reserves one Smart tag atomically before the paid call and keeps it after a successful analysis', async () => {
    await processRapidDraft('it1');
    expect(mockReserveAiTags).toHaveBeenCalledTimes(1);
    expect(mockReserveAiTags).toHaveBeenCalledWith('org1', 'SIMPLE', 1);
    expect(mockAnalyzeItemImage).toHaveBeenCalledTimes(1);
    expect(mockRefundAiTags).not.toHaveBeenCalled();
    // No post-hoc increment any more: the reservation IS the count.
    expect(mockIncrementAiTagCount).not.toHaveBeenCalled();
    expect(mockReserveAiTags.mock.invocationCallOrder[0]).toBeLessThan(mockAnalyzeItemImage.mock.invocationCallOrder[0]);
  });

  it('uses Organizer.subscriptionTier as the truth (a PRO organizer is reserved as PRO)', async () => {
    mockOrganizerFindUnique.mockResolvedValue({ id: 'org1', subscriptionTier: 'PRO' });
    await processRapidDraft('it1');
    expect(mockReserveAiTags).toHaveBeenCalledWith('org1', 'PRO', 1);
  });

  it('skips the paid call when the atomic reservation is refused (parallel jobs cannot overspend)', async () => {
    mockReserveAiTags.mockResolvedValue({ ok: false, reserved: 0, used: 100, limit: 100, remaining: 0, exceeded: true });
    await processRapidDraft('it1');
    expect(mockAnalyzeItemImage).not.toHaveBeenCalled();
    expect(mockItemUpdate).toHaveBeenCalledWith({ where: { id: 'it1' }, data: { draftStatus: 'PENDING_REVIEW' } });
  });

  it('fails closed when the reservation itself errors: no unmetered paid call', async () => {
    mockReserveAiTags.mockRejectedValue(new Error('db down'));
    await processRapidDraft('it1');
    expect(mockAnalyzeItemImage).not.toHaveBeenCalled();
    expect(mockItemUpdate).toHaveBeenCalledWith({ where: { id: 'it1' }, data: { draftStatus: 'PENDING_REVIEW' } });
  });

  it('fails closed when no organizer can be resolved', async () => {
    mockOrganizerFindUnique.mockResolvedValue(null);
    await processRapidDraft('it1');
    expect(mockReserveAiTags).not.toHaveBeenCalled();
    expect(mockAnalyzeItemImage).not.toHaveBeenCalled();
  });

  it('skips the paid call and advances to PENDING_REVIEW when the shared quota is exhausted', async () => {
    mockCheckAiTagQuota.mockResolvedValue({ exceeded: true, used: 100, limit: 100, remaining: 0 });
    await processRapidDraft('it1');
    expect(mockAnalyzeItemImage).not.toHaveBeenCalled();
    expect(mockAxiosGet).not.toHaveBeenCalled();
    expect(mockReserveAiTags).not.toHaveBeenCalled();
    expect(mockItemUpdate).toHaveBeenCalledWith({ where: { id: 'it1' }, data: { draftStatus: 'PENDING_REVIEW' } });
  });

  it('refunds the reserved tag when the analysis produced nothing', async () => {
    mockAnalyzeItemImage.mockResolvedValue(null);
    await processRapidDraft('it1');
    expect(mockRefundAiTags).toHaveBeenCalledTimes(1);
    expect(mockRefundAiTags).toHaveBeenCalledWith('org1', 1);
    expect(mockIncrementAiTagCount).not.toHaveBeenCalled();
  });

  it('a quota lookup error does not stall the item (analysis still runs)', async () => {
    mockCheckAiTagQuota.mockRejectedValue(new Error('db down'));
    await processRapidDraft('it1');
    expect(mockAnalyzeItemImage).toHaveBeenCalledTimes(1);
  });

  it('still honours the existing item-count limit first', async () => {
    mockCheckAITagLimit.mockResolvedValue({ isOverLimit: true, tagCount: 100, limit: 100 });
    await processRapidDraft('it1');
    expect(mockCheckAiTagQuota).not.toHaveBeenCalled();
    expect(mockAnalyzeItemImage).not.toHaveBeenCalled();
  });
});

describe('processRapidDraft SSRF guard on stored photoUrls', () => {
  it('never fetches an internal or non-allowlisted URL and falls back to manual review', async () => {
    mockItemFindUnique.mockResolvedValue(baseItem({ photoUrls: ['https://169.254.169.254/latest/meta-data', 'http://res.cloudinary.com/a.jpg'] }));
    await processRapidDraft('it1');
    expect(mockAxiosGet).not.toHaveBeenCalled();
    expect(mockAnalyzeItemImage).not.toHaveBeenCalled();
    expect(mockItemUpdate).toHaveBeenCalledWith({ where: { id: 'it1' }, data: { draftStatus: 'PENDING_REVIEW' } });
  });

  it('fetches an allowed URL with redirects disabled', async () => {
    await processRapidDraft('it1');
    expect(mockAxiosGet).toHaveBeenCalledTimes(1);
    expect((mockAxiosGet.mock.calls[0][1] as any).maxRedirects).toBe(0);
  });
});

describe('enqueueProcessRapidDraft bounded queue', () => {
  const tick = () => new Promise<void>((r) => setImmediate(r));

  it('runs at most RAPID_DRAFT_CONCURRENCY jobs at once and drains the rest, deduping repeated ids', async () => {
    expect(RAPID_DRAFT_CONCURRENCY).toBe(3);
    const gates: Array<() => void> = [];
    let running = 0;
    let peak = 0;
    mockItemFindUnique.mockImplementation(async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise<void>((resolve) => gates.push(resolve));
      running -= 1;
      return null; // "not found": the job ends immediately after the gate opens
    });

    ['a', 'b', 'c', 'd', 'e', 'f'].forEach((id) => enqueueProcessRapidDraft(id));
    enqueueProcessRapidDraft('a'); // duplicate while queued or running: ignored
    await tick();
    await tick();
    expect(getRapidDraftQueueStats()).toEqual({ queued: 3, active: 3 });
    expect(mockItemFindUnique).toHaveBeenCalledTimes(3);

    // Open gates until the queue drains.
    for (let i = 0; i < 20 && (getRapidDraftQueueStats().queued > 0 || getRapidDraftQueueStats().active > 0); i++) {
      while (gates.length) gates.shift()!();
      await tick();
      await tick();
    }
    expect(peak).toBe(3);
    expect(mockItemFindUnique).toHaveBeenCalledTimes(6);
    expect(getRapidDraftQueueStats()).toEqual({ queued: 0, active: 0 });
  });
});
