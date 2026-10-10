/**
 * processRapidDraft comp-based price refinement (2026-10-10): engine prices are never overwritten, and
 * same-category SOLD comps only count when title-relevant. Every collaborator is a jest mock; no network,
 * no paid call. NOT EXECUTED when written (jest cannot run on the authoring machine); verified by CI.
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
const mockSuggestPrice = jest.fn();
jest.mock('../../services/cloudAIService', () => ({
  analyzeItemImage: (...a: unknown[]) => mockAnalyzeItemImage(...a),
  analyzeItemImages: jest.fn(),
  suggestPrice: (...a: unknown[]) => mockSuggestPrice(...a),
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

import { processRapidDraft } from '../processRapidDraft';

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
  updatedAt: new Date('2026-10-05T00:00:00Z'),
  sale: { id: 's1', organizer: { userId: 'u1' } },
  ...over,
});
const aiResult = (over: Record<string, unknown> = {}) => ({
  title: 'Sweet Maya LP',
  description: 'A record',
  category: 'Music',
  condition: 'USED',
  suggestedPrice: 40.99,
  tags: [],
  ...over,
});
const sold = (title: string, price: number) => ({ title, price, updatedAt: new Date('2026-10-01T00:00:00Z') });
const writtenPrice = () => (mockItemUpdateMany.mock.calls[0][0] as { data: { price?: number } }).data.price;

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
  mockAxiosGet.mockResolvedValue({ data: new Uint8Array([0xff, 0xd8, 0xff]) });
  mockSuggestPrice.mockResolvedValue({ suggested: 12.19 });
});

describe('processRapidDraft comp-based price refinement', () => {
  it('does not refine (or even query comps) when the pricing engine produced the price', async () => {
    mockAnalyzeItemImage.mockResolvedValue(aiResult({ priceSource: 'engine' }));
    mockItemFindMany.mockResolvedValue([sold('Sweet Maya LP', 21.99), sold('Sweet Maya Vinyl', 14.99)]);
    await processRapidDraft('it1');
    expect(mockSuggestPrice).not.toHaveBeenCalled();
    expect(writtenPrice()).toBe(40.99);
  });

  it('filters irrelevant same-category comps and keeps the existing price', async () => {
    mockAnalyzeItemImage.mockResolvedValue(aiResult({ priceSource: 'ai-guess' }));
    mockItemFindMany.mockResolvedValue([
      sold('Bruce Hornsby The Way It Is LP', 21.99),
      sold('Vinyl Record Album', 14.99),
      sold('Frank Sinatra 1965 LP', 11.99),
    ]);
    await processRapidDraft('it1');
    expect(mockSuggestPrice).not.toHaveBeenCalled();
    expect(writtenPrice()).toBe(40.99);
  });

  it('keeps the existing price when only one comp is relevant', async () => {
    mockAnalyzeItemImage.mockResolvedValue(aiResult({ priceSource: 'ai-guess' }));
    mockItemFindMany.mockResolvedValue([sold('Sweet Maya LP', 21.99), sold('Bruce Hornsby LP', 14.99)]);
    await processRapidDraft('it1');
    expect(mockSuggestPrice).not.toHaveBeenCalled();
    expect(writtenPrice()).toBe(40.99);
  });

  it('still refines from relevant comps and passes only the relevant ones to suggestPrice', async () => {
    mockAnalyzeItemImage.mockResolvedValue(aiResult({ priceSource: 'ai-guess', suggestedPrice: 5.99 }));
    mockItemFindMany.mockResolvedValue([
      sold('Sweet Maya LP', 21.99),
      sold('Bruce Hornsby LP', 14.99),
      sold('Sweet Maya Vinyl Record 1978', 11.99),
    ]);
    await processRapidDraft('it1');
    expect(mockSuggestPrice).toHaveBeenCalledTimes(1);
    const comps = mockSuggestPrice.mock.calls[0][3] as Array<{ title: string }>;
    expect(comps.map((c) => c.title)).toEqual(['Sweet Maya LP', 'Sweet Maya Vinyl Record 1978']);
    expect(writtenPrice()).toBe(12.19); // charmPricing is mocked as identity in this file
  });

  it('never writes the refined price over an organizer-edited price (userEditedFields gate unchanged)', async () => {
    mockItemFindUnique.mockResolvedValue(baseItem({ userEditedFields: ['price'], price: 99 }));
    mockAnalyzeItemImage.mockResolvedValue(aiResult({ priceSource: 'ai-guess', suggestedPrice: 5.99 }));
    mockItemFindMany.mockResolvedValue([sold('Sweet Maya LP', 21.99), sold('Sweet Maya Vinyl', 14.99)]);
    await processRapidDraft('it1');
    expect(writtenPrice()).toBe(99);
  });
});
