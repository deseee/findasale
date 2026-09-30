/**
 * Follow is the canonical follow table (2026-09-29). Not executed in the authoring environment.
 */
const mockFollow = {
  upsert: jest.fn(),
  deleteMany: jest.fn(),
  findMany: jest.fn(),
  findUnique: jest.fn(),
  createMany: jest.fn(),
};
const mockSmart = {
  deleteMany: jest.fn(),
  findMany: jest.fn(),
  findUnique: jest.fn(),
};
const mockOrganizerFind = jest.fn();
const mockSend = jest.fn();

jest.mock('../lib/prisma', () => ({
  prisma: { follow: mockFollow, smartFollow: mockSmart, organizer: { findUnique: (...a: any[]) => mockOrganizerFind(...a) } },
}));
jest.mock('../utils/webpush', () => ({ sendPushNotification: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../lib/emailService', () => ({ emailService: { emails: { send: (...a: any[]) => mockSend(...a) } } }));
jest.mock('../services/suppressionService', () => ({
  suppressionService: { isSuppressed: jest.fn().mockResolvedValue(false) },
}));
jest.mock('../controllers/unsubscribeController', () => ({
  buildUnsubscribeLinks: jest.fn().mockResolvedValue({ webUrl: 'https://x/u', listUnsubscribeHeader: '<mailto:u@x>' }),
}));

import * as svc from '../services/smartFollowService';

beforeEach(() => {
  jest.clearAllMocks();
  mockSmart.findMany.mockResolvedValue([]);
  mockFollow.findMany.mockResolvedValue([]);
});

describe('smartFollowService reads/writes Follow', () => {
  it('getUserFollows copies legacy rows into Follow then lists Follow', async () => {
    mockSmart.findMany.mockResolvedValue([
      { organizerId: 'o1', notifyEmail: true, notifyPush: false, createdAt: new Date('2026-01-01') },
    ]);
    mockFollow.createMany.mockResolvedValue({ count: 1 });
    mockFollow.findMany.mockResolvedValue([{ id: 'f1', organizerId: 'o1', organizer: { id: 'o1', businessName: 'A', profilePhoto: null } }]);
    const rows = await svc.getUserFollows('u1');
    expect(mockFollow.createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
    expect(mockFollow.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'u1' } }));
    expect(rows).toHaveLength(1);
  });

  it('getUserFollows still returns Follow rows when the legacy sync throws', async () => {
    mockSmart.findMany.mockRejectedValue(new Error('boom'));
    mockFollow.findMany.mockResolvedValue([{ id: 'f1' }]);
    await expect(svc.getUserFollows('u1')).resolves.toEqual([{ id: 'f1' }]);
  });

  it('createFollow upserts on Follow (idempotent)', async () => {
    mockFollow.upsert.mockResolvedValue({ id: 'f1' });
    await svc.createFollow('u1', 'o1');
    expect(mockFollow.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { userId_organizerId: { userId: 'u1', organizerId: 'o1' } } }));
  });

  it('removeFollow deletes from both tables so a legacy row cannot keep notifying', async () => {
    await svc.removeFollow('u1', 'o1');
    expect(mockFollow.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1', organizerId: 'o1' } });
    expect(mockSmart.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1', organizerId: 'o1' } });
  });

  it('getFollowStatus is true for a legacy-only row', async () => {
    mockFollow.findUnique.mockResolvedValue(null);
    mockSmart.findUnique.mockResolvedValue({ id: 's1' });
    await expect(svc.getFollowStatus('u1', 'o1')).resolves.toBe(true);
  });
});

describe('checkFollowsForNewSale dedupe', () => {
  const sale: any = { id: 's1', title: 'T', address: 'a', city: 'c', state: 'MI', startDate: new Date(), organizerId: 'o1' };
  const follower = (id: string) => ({ notifyEmail: true, notifyPush: false, user: { id, email: `${id}@gmail.com`, pushSubscriptions: [] } });

  it('emails only legacy-only followers; users who also have a Follow row are left to followerNotificationService', async () => {
    mockOrganizerFind.mockResolvedValue({ businessName: 'Org', smartFollowers: [follower('both'), follower('legacyOnly')] });
    mockFollow.findMany.mockResolvedValue([{ userId: 'both' }]);
    await svc.checkFollowsForNewSale(sale);
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0].to).toBe('legacyOnly@gmail.com');
  });

  it('sends nothing when every SmartFollow user is also in Follow', async () => {
    mockOrganizerFind.mockResolvedValue({ businessName: 'Org', smartFollowers: [follower('both')] });
    mockFollow.findMany.mockResolvedValue([{ userId: 'both' }]);
    await svc.checkFollowsForNewSale(sale);
    expect(mockSend).not.toHaveBeenCalled();
  });
});
