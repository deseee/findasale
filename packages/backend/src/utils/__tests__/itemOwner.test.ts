/**
 * resolveItemOwnerOrganizer (item editor unification, Wave 1.0A, B1). NOT EXECUTED when written (jest cannot
 * run on the authoring device); CI is the first real run.
 *
 * Contract under test: DEFAULT DENY. Null means "not the owner". Database errors propagate (never an owner).
 */
const mockFindFirstOrganizer = jest.fn();

jest.mock('../../lib/prisma', () => ({
  prisma: { organizer: { findFirst: (...a: any[]) => mockFindFirstOrganizer(...a) } },
}));

import { resolveItemOwnerOrganizer } from '../itemOwner';

const USER = 'user_1';
const OTHER_USER = 'user_2';

const saleOrganizer = (userId: string) => ({
  id: 'org_sale',
  userId,
  subscriptionTier: 'PRO' as any,
  lat: 42.1,
  lng: -85.9,
});

const inventoryOrganizer = (userId: string) => ({
  id: 'org_inv',
  userId,
  subscriptionTier: 'SIMPLE' as any,
  lat: null as number | null,
  lng: null as number | null,
});

// Injectable stand-in client (the third argument), so most tests do not rely on the module mock.
const makeClient = () => ({ organizer: { findFirst: mockFindFirstOrganizer } }) as any;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('resolveItemOwnerOrganizer: sale items', () => {
  it('returns the sale organizer when its userId matches the caller', async () => {
    const item = { saleId: 'sale_1', organizerId: 'org_sale', sale: { organizer: saleOrganizer(USER) } };
    const result = await resolveItemOwnerOrganizer(item, USER, makeClient());
    expect(result).toEqual({
      id: 'org_sale',
      userId: USER,
      subscriptionTier: 'PRO',
      lat: 42.1,
      lng: -85.9,
    });
    expect(mockFindFirstOrganizer).not.toHaveBeenCalled();
  });

  it('denies (null) when the sale organizer belongs to someone else', async () => {
    const item = { saleId: 'sale_1', organizerId: 'org_sale', sale: { organizer: saleOrganizer(OTHER_USER) } };
    expect(await resolveItemOwnerOrganizer(item, USER, makeClient())).toBeNull();
  });

  it('does not fall back to an inventory lookup when the sale organizer is a different user', async () => {
    // Even if the caller happens to own item.organizerId, a sale item is governed by the sale's organizer.
    mockFindFirstOrganizer.mockResolvedValue(inventoryOrganizer(USER));
    const item = { saleId: 'sale_1', organizerId: 'org_inv', sale: { organizer: saleOrganizer(OTHER_USER) } };
    expect(await resolveItemOwnerOrganizer(item, USER, makeClient())).toBeNull();
    expect(mockFindFirstOrganizer).not.toHaveBeenCalled();
  });

  it('denies when the sale object is present but its organizer was not loaded', async () => {
    mockFindFirstOrganizer.mockResolvedValue(inventoryOrganizer(USER));
    const item = { saleId: 'sale_1', organizerId: 'org_inv', sale: {} };
    expect(await resolveItemOwnerOrganizer(item, USER, makeClient())).toBeNull();
    expect(mockFindFirstOrganizer).not.toHaveBeenCalled();
  });

  it('denies a sale-bound item whose sale was not loaded at all (never resolves through organizerId)', async () => {
    mockFindFirstOrganizer.mockResolvedValue(inventoryOrganizer(USER));
    const item = { saleId: 'sale_1', organizerId: 'org_inv' };
    expect(await resolveItemOwnerOrganizer(item, USER, makeClient())).toBeNull();
    expect(mockFindFirstOrganizer).not.toHaveBeenCalled();
  });

  it('normalizes missing lat/lng on the sale organizer to null', async () => {
    const organizer = { id: 'org_sale', userId: USER, subscriptionTier: 'SIMPLE' as any };
    const item = { saleId: 'sale_1', sale: { organizer } };
    const result = await resolveItemOwnerOrganizer(item, USER, makeClient());
    expect(result).toEqual({ id: 'org_sale', userId: USER, subscriptionTier: 'SIMPLE', lat: null, lng: null });
  });
});

describe('resolveItemOwnerOrganizer: inventory items (saleId null)', () => {
  it('looks the organizer up by id AND userId and returns it for the owner', async () => {
    mockFindFirstOrganizer.mockResolvedValue(inventoryOrganizer(USER));
    const item = { saleId: null, organizerId: 'org_inv', sale: null };
    const result = await resolveItemOwnerOrganizer(item, USER, makeClient());
    expect(result).toEqual({ id: 'org_inv', userId: USER, subscriptionTier: 'SIMPLE', lat: null, lng: null });
    expect(mockFindFirstOrganizer).toHaveBeenCalledTimes(1);
    const args = mockFindFirstOrganizer.mock.calls[0][0];
    // The where clause must carry BOTH the organizer id and the caller's userId (never id alone).
    expect(args.where).toEqual({ id: 'org_inv', userId: USER });
    expect(args.select).toEqual({ id: true, userId: true, subscriptionTier: true, lat: true, lng: true });
  });

  it('denies when another organizer owns the item (lookup by id + caller userId finds nothing)', async () => {
    mockFindFirstOrganizer.mockResolvedValue(null);
    const item = { saleId: null, organizerId: 'org_inv', sale: null };
    expect(await resolveItemOwnerOrganizer(item, OTHER_USER, makeClient())).toBeNull();
    expect(mockFindFirstOrganizer.mock.calls[0][0].where).toEqual({ id: 'org_inv', userId: OTHER_USER });
  });

  it('denies if the lookup ever returns a row whose userId is not the caller (defense in depth)', async () => {
    mockFindFirstOrganizer.mockResolvedValue(inventoryOrganizer(OTHER_USER));
    const item = { saleId: null, organizerId: 'org_inv' };
    expect(await resolveItemOwnerOrganizer(item, USER, makeClient())).toBeNull();
  });

  it('treats an undefined saleId and sale as an inventory item', async () => {
    mockFindFirstOrganizer.mockResolvedValue(inventoryOrganizer(USER));
    const result = await resolveItemOwnerOrganizer({ organizerId: 'org_inv' }, USER, makeClient());
    expect(result?.id).toBe('org_inv');
  });

  it('denies with no lookup when organizerId is null', async () => {
    const item = { saleId: null, organizerId: null, sale: null };
    expect(await resolveItemOwnerOrganizer(item, USER, makeClient())).toBeNull();
    expect(mockFindFirstOrganizer).not.toHaveBeenCalled();
  });

  it('denies with no lookup when organizerId is an empty string', async () => {
    expect(await resolveItemOwnerOrganizer({ saleId: null, organizerId: '' }, USER, makeClient())).toBeNull();
    expect(mockFindFirstOrganizer).not.toHaveBeenCalled();
  });

  it('null sale with a mismatched userId is denied', async () => {
    mockFindFirstOrganizer.mockResolvedValue(null);
    const item = { saleId: null, organizerId: 'org_inv', sale: null };
    expect(await resolveItemOwnerOrganizer(item, 'user_stranger', makeClient())).toBeNull();
  });
});

describe('resolveItemOwnerOrganizer: default deny and input guards', () => {
  it.each([undefined, null, ''])('denies with no lookup when userId is %p', async (badUserId: string | null | undefined) => {
    const inventoryItem = { saleId: null, organizerId: 'org_inv' };
    const saleItem = { saleId: 'sale_1', sale: { organizer: saleOrganizer(USER) } };
    expect(await resolveItemOwnerOrganizer(inventoryItem, badUserId as any, makeClient())).toBeNull();
    expect(await resolveItemOwnerOrganizer(saleItem, badUserId as any, makeClient())).toBeNull();
    expect(mockFindFirstOrganizer).not.toHaveBeenCalled();
  });

  it('denies a sale organizer row that has an empty userId even when the caller userId is empty', async () => {
    const saleItem = { saleId: 'sale_1', sale: { organizer: saleOrganizer('') } };
    expect(await resolveItemOwnerOrganizer(saleItem, '', makeClient())).toBeNull();
  });

  it('denies a null or undefined item', async () => {
    expect(await resolveItemOwnerOrganizer(null, USER, makeClient())).toBeNull();
    expect(await resolveItemOwnerOrganizer(undefined, USER, makeClient())).toBeNull();
    expect(mockFindFirstOrganizer).not.toHaveBeenCalled();
  });
});

describe('resolveItemOwnerOrganizer: database errors', () => {
  it('propagates a lookup failure (the caller answers 500) and never returns an owner', async () => {
    mockFindFirstOrganizer.mockRejectedValue(new Error('db down'));
    const item = { saleId: null, organizerId: 'org_inv' };
    await expect(resolveItemOwnerOrganizer(item, USER, makeClient())).rejects.toThrow('db down');
  });
});

describe('resolveItemOwnerOrganizer: default prisma client', () => {
  it('uses the shared prisma client when none is injected', async () => {
    mockFindFirstOrganizer.mockResolvedValue(inventoryOrganizer(USER));
    const result = await resolveItemOwnerOrganizer({ saleId: null, organizerId: 'org_inv' }, USER);
    expect(result?.id).toBe('org_inv');
    expect(mockFindFirstOrganizer).toHaveBeenCalledTimes(1);
  });
});

