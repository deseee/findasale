/**
 * discountRuleController (2026-09-29): every endpoint gates on Organizer.subscriptionTier (the paid
 * plan) via organizerHasTier, NOT Organizer.tier (the BRONZE/SILVER/GOLD reward tier).
 */
const mockPrisma: any = {
  organizer: { findUnique: jest.fn(), findFirst: jest.fn() },
  organizerWorkspace: { findFirst: jest.fn() },
  discountRule: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  sale: { findUnique: jest.fn() },
};
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));

import {
  listDiscountRules,
  createDiscountRule,
  updateDiscountRule,
  deleteDiscountRule,
} from '../controllers/discountRuleController';

function makeRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}
const authed = (extra: any = {}) => ({
  user: { id: 'u1', organizerProfile: { id: 'org1' } },
  body: { tagColor: 'red', label: '20% off', discountPercent: 20 },
  params: { id: 'r1' },
  query: {},
  ...extra,
});

function reset(o: any) {
  Object.values(o).forEach((v: any) => (typeof v === 'function' ? v.mockReset() : reset(v)));
}
beforeEach(() => {
  reset(mockPrisma);
  mockPrisma.organizerWorkspace.findFirst.mockResolvedValue({ id: 'w1' });
  mockPrisma.discountRule.findFirst.mockResolvedValue({ id: 'r1' });
  mockPrisma.discountRule.findMany.mockResolvedValue([{ id: 'r1' }]);
  mockPrisma.discountRule.create.mockResolvedValue({ id: 'r2' });
  mockPrisma.discountRule.update.mockResolvedValue({ id: 'r1' });
  mockPrisma.discountRule.delete.mockResolvedValue({});
  mockPrisma.organizer.findFirst.mockResolvedValue({ id: 'org1' });
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

// GOLD is a REWARD tier (Organizer.tier); the plan is subscriptionTier. Simulate a TEAMS-paying organizer
// whose reward tier is not "TEAMS" (it never is), and a GOLD-reward SIMPLE organizer.
const teamsOrganizer = { subscriptionTier: 'TEAMS', tier: 'BRONZE' };
const goldSimpleOrganizer = { subscriptionTier: 'SIMPLE', tier: 'GOLD' };

describe('paying TEAMS organizer (reward tier BRONZE) is allowed', () => {
  beforeEach(() => mockPrisma.organizer.findUnique.mockResolvedValue(teamsOrganizer));

  it('list', async () => {
    const res = makeRes();
    await listDiscountRules(authed() as any, res);
    expect(res.json).toHaveBeenCalledWith([{ id: 'r1' }]);
  });
  it('create', async () => {
    const res = makeRes();
    await createDiscountRule(authed() as any, res);
    expect(res.status).toHaveBeenCalledWith(201);
  });
  it('update', async () => {
    const res = makeRes();
    await updateDiscountRule(authed({ body: { label: 'x' } }) as any, res);
    expect(mockPrisma.discountRule.update).toHaveBeenCalled();
  });
  it('delete', async () => {
    const res = makeRes();
    await deleteDiscountRule(authed() as any, res);
    expect(mockPrisma.discountRule.delete).toHaveBeenCalledWith({ where: { id: 'r1' } });
  });
  it('the query selects subscriptionTier, not tier', async () => {
    await createDiscountRule(authed() as any, makeRes());
    expect(mockPrisma.organizer.findUnique).toHaveBeenCalledWith({ where: { id: 'org1' }, select: { subscriptionTier: true } });
  });
});

describe('SIMPLE organizer with a GOLD reward tier is blocked', () => {
  beforeEach(() => mockPrisma.organizer.findUnique.mockResolvedValue(goldSimpleOrganizer));

  it('list returns an empty array', async () => {
    const res = makeRes();
    await listDiscountRules(authed() as any, res);
    expect(res.json).toHaveBeenCalledWith([]);
    expect(mockPrisma.discountRule.findMany).not.toHaveBeenCalled();
  });
  it('create / update / delete are 403', async () => {
    for (const fn of [createDiscountRule, updateDiscountRule, deleteDiscountRule]) {
      const res = makeRes();
      await fn(authed() as any, res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ message: 'TEAMS subscription required' });
    }
    expect(mockPrisma.discountRule.create).not.toHaveBeenCalled();
    expect(mockPrisma.discountRule.update).not.toHaveBeenCalled();
    expect(mockPrisma.discountRule.delete).not.toHaveBeenCalled();
  });
});

describe('PRO organizer is blocked (TEAMS only)', () => {
  it('create is 403', async () => {
    mockPrisma.organizer.findUnique.mockResolvedValue({ subscriptionTier: 'PRO' });
    const res = makeRes();
    await createDiscountRule(authed() as any, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
