/**
 * GET /api/ugc-photos/item/:itemId (2026-10-13 security): 404 unless the item is publicly visible and
 * not inside an early-access window for the viewer; the owning organizer / staff / admin always see it.
 */
const mockItemFindUnique = jest.fn();
const mockPhotoFindMany = jest.fn();
const mockOrganizerFindUnique = jest.fn();
const mockMemberFindFirst = jest.fn();
jest.mock('../lib/prisma', () => ({
  prisma: {
    item: { findUnique: (...a: any[]) => mockItemFindUnique(...a) },
    uGCPhoto: { findMany: (...a: any[]) => mockPhotoFindMany(...a) },
    organizer: { findUnique: (...a: any[]) => mockOrganizerFindUnique(...a) },
    workspaceMember: { findFirst: (...a: any[]) => mockMemberFindFirst(...a) },
  },
}));
jest.mock('../middleware/auth', () => ({}));

import { getApprovedPhotosForItem } from '../controllers/ugcPhotoController';

function mockRes() {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

const publicItem = {
  id: 'i1',
  organizerId: 'org1',
  isActive: true,
  status: 'AVAILABLE',
  draftStatus: 'PUBLISHED',
  listingType: 'FIXED',
  deletedAt: null,
  rarity: 'COMMON',
  createdAt: new Date('2026-01-01'),
  earlyAccessUntil: null,
  isLegendary: false,
  legendaryVisibleAt: null,
  sale: { status: 'PUBLISHED', organizerId: 'org1', deletedAt: null },
};
const photos = [{ id: 'p1', status: 'APPROVED' }];

beforeEach(() => {
  jest.clearAllMocks();
  mockPhotoFindMany.mockResolvedValue(photos);
  mockOrganizerFindUnique.mockResolvedValue(null);
  mockMemberFindFirst.mockResolvedValue(null);
});

async function call(item: any, user?: any) {
  mockItemFindUnique.mockResolvedValue(item);
  const res = mockRes();
  await getApprovedPhotosForItem({ params: { itemId: 'i1' }, user } as any, res);
  return res;
}

const future = () => new Date(Date.now() + 3600_000);

describe('getApprovedPhotosForItem gate', () => {
  it('returns photos for a public item to an anonymous viewer', async () => {
    const res = await call(publicItem);
    expect(res.json).toHaveBeenCalledWith(photos);
  });

  it('404 for an unknown item', async () => {
    const res = await call(null);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockPhotoFindMany).not.toHaveBeenCalled();
  });

  it('404 for an item still in its early-access window (anonymous)', async () => {
    const res = await call({ ...publicItem, earlyAccessUntil: future() });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockPhotoFindMany).not.toHaveBeenCalled();
  });

  it('a Hunt Pass viewer sees an early-access item', async () => {
    const res = await call({ ...publicItem, earlyAccessUntil: future() }, { id: 'hp', roles: ['USER'], huntPassActive: true, huntPassExpiry: future() });
    expect(res.json).toHaveBeenCalledWith(photos);
  });

  it('404 for a draft item, a hidden item and an item in a DRAFT sale', async () => {
    for (const item of [
      { ...publicItem, draftStatus: 'DRAFT' },
      { ...publicItem, isActive: false },
      { ...publicItem, sale: { ...publicItem.sale, status: 'DRAFT' } },
      { ...publicItem, deletedAt: new Date() },
    ]) {
      const res = await call(item);
      expect(res.status).toHaveBeenCalledWith(404);
    }
    expect(mockPhotoFindMany).not.toHaveBeenCalled();
  });

  it('the owning organizer sees photos on their embargoed item', async () => {
    const res = await call({ ...publicItem, earlyAccessUntil: future() }, { id: 'o', roles: ['ORGANIZER'], organizerProfile: { id: 'org1' } });
    expect(res.json).toHaveBeenCalledWith(photos);
  });

  it('an admin sees photos on a draft item', async () => {
    const res = await call({ ...publicItem, draftStatus: 'DRAFT' }, { id: 'a', roles: ['ADMIN'] });
    expect(res.json).toHaveBeenCalledWith(photos);
  });
});
