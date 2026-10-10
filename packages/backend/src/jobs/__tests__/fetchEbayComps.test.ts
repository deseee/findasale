/**
 * fetchEbayCompsForItem organizer-set price guard (2026-10-10). "Organizer-set" means
 * userEditedFields includes 'price'; a non-null pipeline-written item.price must not block aiSuggestedPrice.
 * All collaborators are jest mocks. NOT EXECUTED when written; verified by CI.
 */
const mockItemFindUnique = jest.fn();
const mockItemUpdate = jest.fn();
const mockCompFindUnique = jest.fn();
const mockCompUpsert = jest.fn();
jest.mock('../../lib/prisma', () => ({
  prisma: {
    item: {
      findUnique: (...a: unknown[]) => mockItemFindUnique(...a),
      update: (...a: unknown[]) => mockItemUpdate(...a),
    },
    itemCompLookup: {
      findUnique: (...a: unknown[]) => mockCompFindUnique(...a),
      upsert: (...a: unknown[]) => mockCompUpsert(...a),
    },
  },
}));
const mockFetchEbayPriceComps = jest.fn();
jest.mock('../../controllers/ebayController', () => ({
  fetchEbayPriceComps: (...a: unknown[]) => mockFetchEbayPriceComps(...a),
}));
jest.mock('../../services/priceChartingService', () => ({
  searchPriceCharting: jest.fn().mockResolvedValue(null),
}));

import { fetchEbayCompsForItem } from '../fetchEbayComps';

const item = (over: Record<string, unknown> = {}) => ({
  id: 'it1',
  title: 'Sweet Maya LP',
  category: 'Music',
  conditionGrade: 'B',
  price: 11.99,
  aiSuggestedPrice: null,
  userEditedFields: [],
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockCompFindUnique.mockResolvedValue(null);
  mockCompUpsert.mockResolvedValue({});
  mockItemUpdate.mockResolvedValue({});
  mockFetchEbayPriceComps.mockResolvedValue({ count: 3, median: 40.99, listings: [], isMockData: false });
});

describe('fetchEbayCompsForItem organizer-set price guard', () => {
  it('selects userEditedFields when loading the item', async () => {
    mockItemFindUnique.mockResolvedValue(item());
    await fetchEbayCompsForItem('it1');
    expect((mockItemFindUnique.mock.calls[0][0] as any).select.userEditedFields).toBe(true);
  });

  it('updates aiSuggestedPrice when item.price is non-null but NOT organizer-set', async () => {
    mockItemFindUnique.mockResolvedValue(item({ price: 11.99, userEditedFields: [] }));
    await fetchEbayCompsForItem('it1');
    expect(mockItemUpdate).toHaveBeenCalledWith({ where: { id: 'it1' }, data: { aiSuggestedPrice: 40.99 } });
  });

  it('never writes item.price itself (D-005)', async () => {
    mockItemFindUnique.mockResolvedValue(item());
    await fetchEbayCompsForItem('it1');
    for (const call of mockItemUpdate.mock.calls) {
      expect((call[0] as any).data).not.toHaveProperty('price');
    }
  });

  it('does not update aiSuggestedPrice when userEditedFields includes price', async () => {
    mockItemFindUnique.mockResolvedValue(item({ userEditedFields: ['price'] }));
    await fetchEbayCompsForItem('it1');
    expect(mockItemUpdate).not.toHaveBeenCalled();
  });

  it('keeps the only-if-higher rule', async () => {
    mockItemFindUnique.mockResolvedValue(item({ aiSuggestedPrice: 55 }));
    await fetchEbayCompsForItem('it1');
    expect(mockItemUpdate).not.toHaveBeenCalled();
  });
});
