/**
 * Card-aware re-analyze (reanalyzeService.reanalyzeItem with apply=true). NOT executed when written (jest cannot run on
 * the authoring device); CI is the first real run. No network, no database, no paid service: axios, the AI call and every
 * heavy collaborator are mocks, and the database is an in-memory fake (the card fake from cardAiTagging/cardRecordService
 * plus a one-row Item table).
 *
 * Covers:
 *   (1) a re-analyzed card item gets its card record and a condition suggestion, and conditionCode stays null
 *   (2) a seller-confirmed condition (and any organizer-set or locked field) is never overwritten or re-suggested
 *   (3) no generic conditionGrade is written for a card (the stored value is kept)
 *   (4) a non-card re-analyze is unchanged (generic grade written, no card record, catalogSuggestions untouched)
 *   (5) a stored cardSuggestion survives the catalogSuggestions write (object write, null clear, and no-card cases)
 *   (6) a failing card write never fails the re-analyze; a dry run writes no card
 */
const mockAxiosGet = jest.fn();
const mockAnalyzeItemImages = jest.fn();
const mockEnrichItem = jest.fn();
const mockPlanEnrichmentApply = jest.fn();
let mockDb: any;

jest.mock('axios', () => ({ __esModule: true, default: { get: (...a: unknown[]) => mockAxiosGet(...a) } }));
jest.mock('../lib/prisma', () => ({
  prisma: {
    item: {
      findUnique: (...a: unknown[]) => mockDb.item.findUnique(...a),
      update: (...a: unknown[]) => mockDb.item.update(...a),
    },
    itemCard: {
      findUnique: (...a: unknown[]) => mockDb.itemCard.findUnique(...a),
      create: (...a: unknown[]) => mockDb.itemCard.create(...a),
      update: (...a: unknown[]) => mockDb.itemCard.update(...a),
    },
  },
}));
jest.mock('../middleware/auth', () => ({}));
jest.mock('../services/cloudAIService', () => ({ analyzeItemImages: (...a: unknown[]) => mockAnalyzeItemImages(...a) }));
jest.mock('../services/productEnrichment', () => ({
  enrichItem: (...a: unknown[]) => mockEnrichItem(...a),
  planEnrichmentApply: (...a: unknown[]) => mockPlanEnrichmentApply(...a),
}));
jest.mock('../controllers/ebayController', () => ({ suggestEbayCategoryForTitle: jest.fn().mockResolvedValue(null) }));
jest.mock('../controllers/itemController', () => ({ syncListedItemFieldsToEbay: jest.fn() }));
jest.mock('../services/modelBakeoffService', () => ({
  runModelBakeoff: jest.fn(),
  runGroundedResolution: jest.fn(),
  runVisualResolution: jest.fn(),
}));
jest.mock('../services/groundedIdentityService', () => ({ resolveGroundedIdentityInline: jest.fn().mockResolvedValue(null) }));
jest.mock('../utils/ebayShippingClassifier', () => ({ classifyEbayShipping: jest.fn().mockReturnValue('STANDARD') }));

import { reanalyzeItem } from '../services/reanalyzeService';
import { normalizeAiCard, readCardConditionSuggestion } from '../services/cardAiSuggestion';
import { makeFakeCardDb } from './__fixtures__/fakeCardDb';

const CLOUD = 'https://res.cloudinary.com/demo/image/upload/v1/a.jpg';
const STORED_SUGGESTION = { conditionCode: 'LP', source: 'haiku', suggestedAt: '2026-10-01T00:00:00.000Z' };

function makeDb(itemOver: Record<string, unknown> = {}) {
  const db: any = makeFakeCardDb();
  const row: any = {
    id: 'item_1',
    title: 'Old title',
    description: null,
    category: null,
    condition: null,
    conditionGrade: 'C',
    price: 500,
    tags: [],
    photoUrls: [CLOUD],
    ebayCategoryId: null,
    ebayCategoryName: null,
    brand: null,
    color: null,
    mpn: null,
    upc: null,
    ean: null,
    isbn: null,
    ebayEpid: null,
    packageWeightOz: null,
    packageLengthIn: null,
    packageWidthIn: null,
    packageHeightIn: null,
    packageConfirmedByOrganizer: null,
    userEditedFields: [],
    ebayOfferId: null,
    catalogSuggestions: null,
    organizerId: 'org_1',
    sale: { id: 's1', organizerId: 'org_1' },
    ...itemOver,
  };
  db.itemRow = row;
  db.itemUpdates = [] as any[];
  db.item = {
    findUnique: async () => ({ ...row }),
    update: async ({ data }: any) => {
      db.itemUpdates.push(data);
      Object.assign(row, data);
      return { ...row };
    },
  };
  return db;
}

const aiResult = (over: Record<string, unknown> = {}) => ({
  title: 'Lightning Bolt Magic Card',
  description: 'A Magic card.',
  category: 'Collectibles',
  condition: 'USED',
  confidence: 0.9,
  tags: ['mtg'],
  suggestedConditionGrade: 'A',
  ...over,
});

const cardResult = (over: Record<string, unknown> = {}) =>
  normalizeAiCard({ game: 'MTG', cardName: 'Lightning Bolt', setCode: 'LEA', collectorNumber: '161', suggestedCardCondition: 'NM', ...over })!;

const existingCard = (over: Record<string, unknown> = {}) => ({
  id: 'card_x',
  itemId: 'item_1',
  organizerId: 'org_1',
  game: 'MTG',
  productType: 'SINGLE',
  cardName: 'Island',
  setName: 'Alpha',
  setCode: 'lea',
  collectorNumber: '1',
  language: 'en',
  finish: 'NONFOIL',
  conditionCode: null,
  grader: null,
  grade: null,
  certNumber: null,
  lockedFields: [],
  dedupKey: 'old',
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockDb = makeDb();
  mockAxiosGet.mockResolvedValue({ data: Buffer.from('img'), headers: { 'content-type': 'image/png' } });
  mockEnrichItem.mockResolvedValue({ merged: {} });
  mockPlanEnrichmentApply.mockReturnValue({ apply: {}, suggestion: undefined });
});

describe('(1) a re-analyzed card item gets a card record and a suggestion, never a condition', () => {
  it('creates the ItemCard (identity only) and stores the suggestion; conditionCode, grader, grade stay null', async () => {
    mockAnalyzeItemImages.mockResolvedValue(aiResult({ card: cardResult() }));
    const out: any = await reanalyzeItem('item_1', { apply: true });
    expect(out.ok).toBe(true);
    expect(mockDb.calls.cardCreate).toBe(1);
    const card = mockDb.cards.get('item_1');
    expect(card).toMatchObject({
      itemId: 'item_1',
      organizerId: 'org_1',
      game: 'MTG',
      cardName: 'Lightning Bolt',
      setCode: 'lea',
      collectorNumber: '161',
      conditionCode: null,
      grader: null,
      grade: null,
      certNumber: null,
      lockedFields: [],
    });
    expect(mockDb.itemRow.catalogSuggestions.cardSuggestion).toMatchObject({ conditionCode: 'NM', source: 'haiku' });
  });

  it('a slab read becomes a suggestion only, and the enrichment suggestion written in the same pass is kept next to it', async () => {
    mockPlanEnrichmentApply.mockReturnValue({ apply: {}, suggestion: { source: 'ebayCatalog', fields: {} } });
    mockAnalyzeItemImages.mockResolvedValue(
      aiResult({ card: normalizeAiCard({ game: 'POKEMON', cardName: 'Charizard', grader: 'PSA', grade: '9', certNumber: '777' })! }),
    );
    await reanalyzeItem('item_1', { apply: true });
    const card = mockDb.cards.get('item_1');
    expect(card.grader).toBeNull();
    expect(card.grade).toBeNull();
    expect(card.certNumber).toBeNull();
    expect(mockDb.itemRow.catalogSuggestions.source).toBe('ebayCatalog');
    expect(readCardConditionSuggestion(mockDb.itemRow.catalogSuggestions)).toMatchObject({ grader: 'PSA', grade: '9', certNumber: '777' });
  });

  it('falls back to the sale organizer when the item has no organizerId of its own', async () => {
    mockDb = makeDb({ organizerId: null });
    mockAnalyzeItemImages.mockResolvedValue(aiResult({ card: cardResult() }));
    await reanalyzeItem('item_1', { apply: true });
    expect(mockDb.cards.get('item_1').organizerId).toBe('org_1');
  });
});

describe('(2) seller-confirmed and organizer-set card fields are never overwritten or re-suggested', () => {
  it('keeps a confirmed condition and stores no new suggestion', async () => {
    mockDb.cards.set('item_1', existingCard({ conditionCode: 'HP', lockedFields: ['conditionCode'] }));
    mockAnalyzeItemImages.mockResolvedValue(aiResult({ card: cardResult({ suggestedCardCondition: 'NM' }) }));
    const out: any = await reanalyzeItem('item_1', { apply: true });
    expect(out.ok).toBe(true);
    expect(mockDb.cards.get('item_1').conditionCode).toBe('HP');
    expect(mockDb.calls.cardUpdate).toBe(0);
    expect(readCardConditionSuggestion(mockDb.itemRow.catalogSuggestions)).toBeNull();
  });

  it('keeps a confirmed slab grade and never re-suggests over it', async () => {
    mockDb.cards.set('item_1', existingCard({ grader: 'PSA', grade: '8', lockedFields: ['grader', 'grade'] }));
    mockAnalyzeItemImages.mockResolvedValue(aiResult({ card: normalizeAiCard({ game: 'MTG', grader: 'BGS', grade: '9.5' })! }));
    await reanalyzeItem('item_1', { apply: true });
    const card = mockDb.cards.get('item_1');
    expect(card.grader).toBe('PSA');
    expect(card.grade).toBe('8');
    expect(readCardConditionSuggestion(mockDb.itemRow.catalogSuggestions)).toBeNull();
  });

  it('never overwrites an organizer-typed or locked identity field and never changes lockedFields', async () => {
    mockDb.cards.set(
      'item_1',
      existingCard({ cardName: 'Black Lotus', setName: null, setCode: null, collectorNumber: null, lockedFields: ['cardName', 'setName'] }),
    );
    mockAnalyzeItemImages.mockResolvedValue(aiResult({ card: cardResult({ setName: 'Limited Edition Alpha' }) }));
    await reanalyzeItem('item_1', { apply: true });
    const card = mockDb.cards.get('item_1');
    expect(card.cardName).toBe('Black Lotus');
    expect(card.setName).toBeNull(); // locked and empty: the organizer cleared it on purpose
    expect(card.setCode).toBe('lea'); // empty and unlocked: filled
    expect(card.lockedFields).toEqual(['cardName', 'setName']);
    expect(card.conditionCode).toBeNull();
  });
});

describe('(3) no generic conditionGrade is written for a card', () => {
  it('keeps the stored grade even if the result still carries one, and reports the stored grade back', async () => {
    mockAnalyzeItemImages.mockResolvedValue(aiResult({ card: cardResult(), suggestedConditionGrade: 'A' }));
    const out: any = await reanalyzeItem('item_1', { apply: true });
    expect(out.appliedData.conditionGrade).toBeUndefined();
    expect(mockDb.itemUpdates[0]).not.toHaveProperty('conditionGrade');
    expect(mockDb.itemRow.conditionGrade).toBe('C');
    expect(out.after.conditionGrade).toBe('C');
  });

  it('still writes the other tagging fields for a card', async () => {
    mockAnalyzeItemImages.mockResolvedValue(aiResult({ card: cardResult() }));
    await reanalyzeItem('item_1', { apply: true });
    expect(mockDb.itemRow.title).toBe('Lightning Bolt Magic Card');
    expect(mockDb.itemRow.isAiTagged).toBe(true);
  });
});

describe('(4) a non-card re-analyze is unchanged', () => {
  it('writes the generic grade, creates no card record, and leaves catalogSuggestions alone', async () => {
    mockAnalyzeItemImages.mockResolvedValue(aiResult({ title: 'Cast iron skillet', category: 'Kitchenware' }));
    const out: any = await reanalyzeItem('item_1', { apply: true });
    expect(out.ok).toBe(true);
    expect(mockDb.itemRow.conditionGrade).toBe('A');
    expect(out.after.conditionGrade).toBe('A');
    expect(mockDb.calls.cardCreate).toBe(0);
    expect(mockDb.cards.size).toBe(0);
    expect(mockDb.itemUpdates).toHaveLength(1);
    expect(mockDb.itemUpdates[0]).not.toHaveProperty('catalogSuggestions');
    expect(mockDb.itemRow.catalogSuggestions).toBeNull();
  });

  it('writes a plain enrichment suggestion as before when no cardSuggestion is stored', async () => {
    mockPlanEnrichmentApply.mockReturnValue({ apply: {}, suggestion: { source: 'ebayCatalog', fields: {} } });
    mockAnalyzeItemImages.mockResolvedValue(aiResult());
    await reanalyzeItem('item_1', { apply: true });
    expect(mockDb.itemRow.catalogSuggestions).toEqual({ source: 'ebayCatalog', fields: {} });
  });

  it('a null (clear) write still clears the suggestion when no cardSuggestion is stored', async () => {
    mockDb = makeDb({ catalogSuggestions: { source: 'stale', fields: {} } });
    mockPlanEnrichmentApply.mockReturnValue({ apply: {}, suggestion: null });
    mockAnalyzeItemImages.mockResolvedValue(aiResult());
    await reanalyzeItem('item_1', { apply: true });
    expect(mockDb.itemRow.catalogSuggestions).toBeNull();
  });
});

describe('(5) a stored cardSuggestion survives the catalogSuggestions write', () => {
  it('adds the enrichment suggestion without dropping cardSuggestion (non-card result)', async () => {
    mockDb = makeDb({ catalogSuggestions: { source: 'old', fields: {}, cardSuggestion: STORED_SUGGESTION } });
    mockPlanEnrichmentApply.mockReturnValue({ apply: {}, suggestion: { source: 'ebayCatalog', fields: {} } });
    mockAnalyzeItemImages.mockResolvedValue(aiResult());
    await reanalyzeItem('item_1', { apply: true });
    expect(mockDb.itemRow.catalogSuggestions.source).toBe('ebayCatalog');
    expect(mockDb.itemRow.catalogSuggestions.cardSuggestion).toEqual(STORED_SUGGESTION);
  });

  it('a null (clear) write clears the stale enrichment suggestion but keeps cardSuggestion', async () => {
    mockDb = makeDb({ catalogSuggestions: { source: 'old', fields: {}, cardSuggestion: STORED_SUGGESTION } });
    mockPlanEnrichmentApply.mockReturnValue({ apply: {}, suggestion: null });
    mockAnalyzeItemImages.mockResolvedValue(aiResult());
    await reanalyzeItem('item_1', { apply: true });
    expect(mockDb.itemRow.catalogSuggestions).toEqual({ cardSuggestion: STORED_SUGGESTION });
  });

  it('keeps cardSuggestion when the card result offers no new condition suggestion', async () => {
    mockDb = makeDb({ catalogSuggestions: { cardSuggestion: STORED_SUGGESTION } });
    mockPlanEnrichmentApply.mockReturnValue({ apply: {}, suggestion: { source: 'ebayCatalog', fields: {} } });
    mockAnalyzeItemImages.mockResolvedValue(aiResult({ card: normalizeAiCard({ game: 'MTG', cardName: 'Island' })! }));
    await reanalyzeItem('item_1', { apply: true });
    expect(mockDb.itemRow.catalogSuggestions.source).toBe('ebayCatalog');
    expect(mockDb.itemRow.catalogSuggestions.cardSuggestion).toEqual(STORED_SUGGESTION);
  });

  it('a fresh card suggestion replaces the stored one (still not a confirmed condition)', async () => {
    mockDb = makeDb({ catalogSuggestions: { cardSuggestion: STORED_SUGGESTION } });
    mockAnalyzeItemImages.mockResolvedValue(aiResult({ card: cardResult({ suggestedCardCondition: 'MP' }) }));
    await reanalyzeItem('item_1', { apply: true });
    expect(readCardConditionSuggestion(mockDb.itemRow.catalogSuggestions)).toMatchObject({ conditionCode: 'MP' });
    expect(mockDb.cards.get('item_1').conditionCode).toBeNull();
  });

  it('drops a junk stored cardSuggestion instead of carrying it forward', async () => {
    mockDb = makeDb({ catalogSuggestions: { cardSuggestion: { conditionCode: 'MINT', source: 'haiku' } } });
    mockPlanEnrichmentApply.mockReturnValue({ apply: {}, suggestion: { source: 'ebayCatalog', fields: {} } });
    mockAnalyzeItemImages.mockResolvedValue(aiResult());
    await reanalyzeItem('item_1', { apply: true });
    expect(mockDb.itemRow.catalogSuggestions).toEqual({ source: 'ebayCatalog', fields: {} });
  });
});

describe('(6) a card problem never fails the re-analyze, and a dry run writes no card', () => {
  it('returns ok and still applies the item fields when the card write throws', async () => {
    mockDb.itemCard.findUnique = async () => {
      throw new Error('db down');
    };
    mockAnalyzeItemImages.mockResolvedValue(aiResult({ card: cardResult() }));
    const out: any = await reanalyzeItem('item_1', { apply: true });
    expect(out.ok).toBe(true);
    expect(out.applied).toBe(true);
    expect(mockDb.itemRow.title).toBe('Lightning Bolt Magic Card');
  });

  it('apply=false writes nothing, including no card record or suggestion', async () => {
    mockAnalyzeItemImages.mockResolvedValue(aiResult({ card: cardResult() }));
    const out: any = await reanalyzeItem('item_1', { apply: false });
    expect(out.ok).toBe(true);
    expect(out.applied).toBe(false);
    expect(mockDb.itemUpdates).toHaveLength(0);
    expect(mockDb.calls.cardCreate).toBe(0);
    expect(mockDb.cards.size).toBe(0);
  });
});
