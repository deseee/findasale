/**
 * Shadow pricing (2026-10-11). NOT executed when written (jest cannot run on the authoring device); CI is the first
 * real run. No network, no database, no paid service: the pricing engine and Prisma are jest mocks.
 *
 * Covers:
 *   (1) non-audio item: suggestedPrice / priceSource stay the model guess, shadow fields are set (charm-rounded)
 *   (2) FLOOR / timeout / exception / non-positive leave the shadow fields undefined and never throw
 *   (3) audio path unchanged (engine can still win; no shadow fields)
 *   (4) one log line per non-audio item with the title truncated to 60 chars
 *   (5) shadowPricingStore: persist onto ItemCompLookup, DTO from a saved row, nothing written without a shadow price
 */
const mockEstimatePrice = jest.fn();
const mockIsAudio = jest.fn();
const mockUpsert = jest.fn();
const mockFindMany = jest.fn();

jest.mock('../lib/aiCostTracker', () => ({}));
jest.mock('../services/imageMatchService', () => ({}));
jest.mock('../services/ebayImageSearchService', () => ({}));
jest.mock('../services/pricingEngine', () => ({ estimatePrice: (...a: unknown[]) => mockEstimatePrice(...a) }));
jest.mock('../services/pricingEngine/adapters/discogs', () => ({ isAudioFormatMatch: (...a: unknown[]) => mockIsAudio(...a) }));
jest.mock('../lib/prisma', () => ({
  prisma: {
    itemCompLookup: {
      upsert: (...a: unknown[]) => mockUpsert(...a),
      findMany: (...a: unknown[]) => mockFindMany(...a),
    },
  },
}));

import { finalizePricing, AITagResult } from '../services/cloudAIService';
import {
  persistShadowPricing,
  shadowDtoFromCompRow,
  shadowFromAiResult,
  loadShadowPricingByItemId,
} from '../services/shadowPricingStore';

const tag = (over: Partial<AITagResult> = {}): AITagResult => ({
  title: 'Antique saloon doors',
  description: 'A pair of doors',
  category: 'Furniture',
  condition: 'USED',
  suggestedPrice: 85,
  tags: [],
  ...over,
});
const engineResult = (over: Record<string, unknown> = {}) => ({
  estimatedPrice: 12999, // cents
  priceRange: { low: 9000, high: 15000 },
  confidence: 'MEDIUM',
  tier: 2,
  compsFound: 7,
  ...over,
});

let logSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
  mockIsAudio.mockReturnValue(false);
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  jest.useRealTimers();
});

describe('(1) non-audio item: model guess stays the price, engine price is shadow only', () => {
  it('keeps suggestedPrice and priceSource ai-guess and records the shadow fields', async () => {
    mockEstimatePrice.mockResolvedValue(engineResult());
    const p = tag();
    await finalizePricing(p);
    expect(p.suggestedPrice).toBe(84.99); // model 85, charm-rounded, unchanged by the engine
    expect(p.priceSource).toBe('ai-guess');
    expect(p.priceEngineConfidence).toBeUndefined();
    expect(p.shadowEnginePrice).toBe(129.99);
    expect(p.shadowEngineConfidence).toBe('MEDIUM');
    expect(p.shadowEngineTier).toBe(2);
    expect(p.shadowEngineCompsFound).toBe(7);
  });

  it('calls the engine with the same request shape and no itemId / persist flag', async () => {
    mockEstimatePrice.mockResolvedValue(engineResult());
    await finalizePricing(tag({ brand: 'Acme', suggestedConditionGrade: 'B' }));
    expect(mockEstimatePrice).toHaveBeenCalledTimes(1);
    const req = mockEstimatePrice.mock.calls[0][0];
    expect(req).toEqual({
      title: 'Antique saloon doors',
      category: 'Furniture',
      condition: 'USED',
      conditionGrade: 'B',
      brand: 'Acme',
    });
    expect(req).not.toHaveProperty('itemId');
    expect(req).not.toHaveProperty('persist');
  });
});

describe('(2) FLOOR / timeout / exception leave the shadow fields undefined and never throw', () => {
  const noShadow = (p: AITagResult) => {
    expect(p.shadowEnginePrice).toBeUndefined();
    expect(p.shadowEngineConfidence).toBeUndefined();
    expect(p.shadowEngineTier).toBeUndefined();
    expect(p.shadowEngineCompsFound).toBeUndefined();
    expect(p.suggestedPrice).toBe(84.99);
    expect(p.priceSource).toBe('ai-guess');
  };

  it('FLOOR confidence', async () => {
    mockEstimatePrice.mockResolvedValue(engineResult({ confidence: 'FLOOR', estimatedPrice: 49 }));
    const p = tag();
    await expect(finalizePricing(p)).resolves.toBeUndefined();
    noShadow(p);
    expect(logSpy.mock.calls.map(c => String(c[0])).join('\n')).toContain('reason=FLOOR');
  });

  it('non-positive engine price', async () => {
    mockEstimatePrice.mockResolvedValue(engineResult({ estimatedPrice: 0 }));
    const p = tag();
    await finalizePricing(p);
    noShadow(p);
  });

  it('exception from the engine', async () => {
    mockEstimatePrice.mockRejectedValue(new Error('boom'));
    const p = tag();
    await expect(finalizePricing(p)).resolves.toBeUndefined();
    noShadow(p);
    expect(logSpy.mock.calls.map(c => String(c[0])).join('\n')).toContain('reason=exception');
  });

  it('synchronous throw from the engine', async () => {
    mockEstimatePrice.mockImplementation(() => {
      throw new Error('sync boom');
    });
    const p = tag();
    await expect(finalizePricing(p)).resolves.toBeUndefined();
    noShadow(p);
  });

  it('timeout after 6000ms', async () => {
    jest.useFakeTimers();
    mockEstimatePrice.mockReturnValue(new Promise(() => {})); // never settles
    const p = tag();
    const done = finalizePricing(p);
    jest.advanceTimersByTime(6000);
    await expect(done).resolves.toBeUndefined();
    noShadow(p);
    expect(logSpy.mock.calls.map(c => String(c[0])).join('\n')).toContain('reason=timeout');
  });
});

describe('(3) audio path is unchanged', () => {
  it('a comp-backed engine price still wins and no shadow fields are set', async () => {
    mockIsAudio.mockReturnValue(true);
    mockEstimatePrice.mockResolvedValue(engineResult({ estimatedPrice: 2500, tier: 1, compsFound: 5 }));
    const p = tag({ title: 'Sweet Maya LP', category: 'Music', suggestedPrice: 40 });
    await finalizePricing(p);
    expect(p.priceSource).toBe('engine');
    expect(p.suggestedPrice).toBe(24.99);
    expect(p.priceEngineConfidence).toBe('MEDIUM');
    expect(p.priceEngineTier).toBe(1);
    expect(p.shadowEnginePrice).toBeUndefined();
    expect(mockEstimatePrice).toHaveBeenCalledTimes(1);
  });

  it('an audio FLOOR keeps the model guess and sets no shadow fields', async () => {
    mockIsAudio.mockReturnValue(true);
    mockEstimatePrice.mockResolvedValue(engineResult({ confidence: 'FLOOR' }));
    const p = tag({ suggestedPrice: 40 });
    await finalizePricing(p);
    expect(p.priceSource).toBe('ai-guess');
    expect(p.shadowEnginePrice).toBeUndefined();
  });
});

describe('(4) shadow log line', () => {
  it('logs title (max 60 chars), aiGuess, enginePrice, confidence, tier, compsFound, reason', async () => {
    mockEstimatePrice.mockResolvedValue(engineResult());
    await finalizePricing(tag({ title: 'x'.repeat(80) }));
    const line = logSpy.mock.calls.map(c => String(c[0])).find(l => l.startsWith('[pricing] shadow engine:'));
    expect(line).toBeDefined();
    expect(line).toContain(`title="${'x'.repeat(60)}"`);
    expect(line).not.toContain('x'.repeat(61));
    expect(line).toContain('aiGuess=85');
    expect(line).toContain('enginePrice=129.99');
    expect(line).toContain('confidence=MEDIUM');
    expect(line).toContain('tier=2');
    expect(line).toContain('compsFound=7');
    expect(line).toContain('reason=ok');
  });

  it('is not logged for audio items', async () => {
    mockIsAudio.mockReturnValue(true);
    mockEstimatePrice.mockResolvedValue(engineResult());
    await finalizePricing(tag());
    expect(logSpy.mock.calls.some(c => String(c[0]).startsWith('[pricing] shadow engine:'))).toBe(false);
  });
});

describe('(5) shadowPricingStore', () => {
  const shadow = { shadowEnginePrice: 129.99, shadowEngineConfidence: 'MEDIUM', shadowEngineTier: 2, shadowEngineCompsFound: 7 };

  it('shadowFromAiResult is null without a positive shadow price', () => {
    expect(shadowFromAiResult({}, 84.99)).toBeNull();
    expect(shadowFromAiResult({ shadowEnginePrice: 0 }, 84.99)).toBeNull();
    expect(shadowFromAiResult(undefined, 84.99)).toBeNull();
  });

  it('persists onto ItemCompLookup (cents, multiSource) and never touches the item', async () => {
    mockUpsert.mockResolvedValue({});
    await persistShadowPricing('it1', 84.99, shadow);
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const arg = mockUpsert.mock.calls[0][0];
    expect(arg.where).toEqual({ itemId: 'it1' });
    expect(arg.create.itemId).toBe('it1');
    expect(arg.create.estimatedPrice).toBe(BigInt(12999));
    expect(arg.create.source).toBe('multiSource');
    expect(arg.create.priceConfidence).toBe('MEDIUM');
    expect(arg.create.tierUsed).toBe(2);
    expect(arg.create.compsFound).toBe(7);
    expect(arg.create.pricingResultJson).toMatchObject({ shadowEngine: true, smartPrice: 84.99, enginePrice: 129.99 });
    // the fetchEbayComps 7-day cache keys on fetchedAt: it must stay unset
    expect(arg.create).not.toHaveProperty('fetchedAt');
    expect(arg.update).not.toHaveProperty('fetchedAt');
  });

  it('writes nothing when there is no shadow price', async () => {
    await persistShadowPricing('it1', 84.99, {});
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('never throws when the database write fails', async () => {
    mockUpsert.mockRejectedValue(new Error('db down'));
    await expect(persistShadowPricing('it1', 84.99, shadow)).resolves.toBeUndefined();
  });

  it('builds the two-number DTO from a saved row, hiding FLOOR and empty rows', () => {
    const row = {
      estimatedPrice: BigInt(12999),
      priceConfidence: 'MEDIUM',
      compsFound: 7,
      pricingResultJson: { shadowEngine: true, smartPrice: 84.99 },
    };
    expect(shadowDtoFromCompRow(row)).toEqual({ smartPrice: 84.99, marketPrice: 129.99, marketConfidence: 'MEDIUM', compsFound: 7 });
    expect(shadowDtoFromCompRow({ ...row, pricingResultJson: { priceRange: {} } })).toMatchObject({ smartPrice: null, marketPrice: 129.99 });
    expect(shadowDtoFromCompRow({ ...row, priceConfidence: 'FLOOR' })).toBeNull();
    expect(shadowDtoFromCompRow({ ...row, estimatedPrice: null })).toBeNull();
    expect(shadowDtoFromCompRow(null)).toBeNull();
  });

  it('loads a page in ONE query and returns an empty map on error', async () => {
    mockFindMany.mockResolvedValue([
      { itemId: 'a', estimatedPrice: BigInt(12999), priceConfidence: 'LOW', compsFound: 3, pricingResultJson: { shadowEngine: true, smartPrice: 84.99 } },
      { itemId: 'b', estimatedPrice: BigInt(49), priceConfidence: 'FLOOR', compsFound: 0, pricingResultJson: null },
    ]);
    const map = await loadShadowPricingByItemId(['a', 'b']);
    expect(mockFindMany).toHaveBeenCalledTimes(1);
    expect([...map.keys()]).toEqual(['a']);
    mockFindMany.mockRejectedValue(new Error('no table'));
    expect((await loadShadowPricingByItemId(['a'])).size).toBe(0);
  });
});
