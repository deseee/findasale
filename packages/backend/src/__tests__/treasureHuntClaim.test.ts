/**
 * Daily Treasure Hunt claim (2026-09-29): matching, server validation, idempotency, XP award.
 * Prisma and xpService are mocked, so this needs no database.
 *
 * NOT EXECUTED at authoring time (jest could not be run in the authoring environment).
 */

jest.mock('axios', () => ({ __esModule: true, default: { post: jest.fn() } }));
jest.mock('../lib/aiCostTracker', () => ({
  isAICostCeilingExceeded: jest.fn(),
  trackAITokens: jest.fn(),
  estimateTokensForRequest: jest.fn(),
  recordApiUsage: jest.fn(),
  ANTHROPIC_COST_PER_M_TOKENS: {},
  recordAnthropicUsageOrEstimate: jest.fn(),
  isAIDailyCallCapAvailable: jest.fn(),
  trackAICall: jest.fn(),
}));
jest.mock('../lib/anthropicError', () => ({
  isAnthropicCreditError: jest.fn(() => false),
  alertAnthropicCreditExhausted: jest.fn(),
}));
jest.mock('../services/xpService', () => ({
  awardXp: jest.fn(),
  computeTreasureHuntScanXp: jest.fn(),
}));
jest.mock('../lib/prisma', () => ({
  prisma: {
    treasureHunt: { findUnique: jest.fn(), upsert: jest.fn() },
    treasureHuntFind: { findUnique: jest.fn(), create: jest.fn() },
    item: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
  },
}));

import { prisma } from '../lib/prisma';
import { awardXp, computeTreasureHuntScanXp } from '../services/xpService';
import {
  checkIfItemMatchesHunt,
  claimDailyHunt,
  getHuntItemStatus,
} from '../services/treasureHuntService';

const db = prisma as any;
const xp = { awardXp: awardXp as jest.Mock, compute: computeTreasureHuntScanXp as jest.Mock };

const hunt = {
  id: 7,
  date: '2026-09-29',
  clue: 'Something that hums a tune when wound.',
  category: 'collectibles',
  keywords: ['music box', 'art', 'vintage paperback'],
  pointReward: 3,
};

const liveItem = (over: any = {}) => ({
  id: 'item-1',
  title: 'Vintage music box, walnut',
  category: 'Collectibles',
  status: 'AVAILABLE',
  isActive: true,
  draftStatus: 'PUBLISHED',
  saleId: 'sale-1',
  sale: { id: 'sale-1', status: 'PUBLISHED', organizer: { userId: 'organizer-user' } },
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  db.treasureHunt.findUnique.mockResolvedValue(hunt);
  db.treasureHuntFind.findUnique.mockResolvedValue(null);
  db.treasureHuntFind.create.mockResolvedValue({ id: 1 });
  db.item.findUnique.mockResolvedValue(liveItem());
  db.user.findUnique.mockResolvedValue({ explorerRank: 'SCOUT' });
  xp.compute.mockResolvedValue(3);
  xp.awardXp.mockResolvedValue({ xpAwarded: 3, newXp: 503, newRank: 'SCOUT', rankIncreased: false });
});

describe('checkIfItemMatchesHunt', () => {
  it('matches on word starts and phrases, case-insensitively', () => {
    expect(checkIfItemMatchesHunt({ title: 'Vintage MUSIC BOX', category: null }, hunt)).toBe(true);
    expect(checkIfItemMatchesHunt({ title: 'Vintage paperback novels lot', category: null }, hunt)).toBe(true);
    expect(checkIfItemMatchesHunt({ title: 'Oil painting', category: 'Art' }, { keywords: ['paint'] })).toBe(true);
  });

  it('does not match a keyword buried inside another word (art in cart/party)', () => {
    expect(checkIfItemMatchesHunt({ title: 'Garden cart', category: 'Tools' }, { keywords: ['art'] })).toBe(false);
    expect(checkIfItemMatchesHunt({ title: 'Party supplies', category: null }, { keywords: ['art'] })).toBe(false);
  });

  it('handles regex metacharacters in keywords safely', () => {
    expect(checkIfItemMatchesHunt({ title: 'Tools (assorted)', category: null }, { keywords: ['(assorted'] })).toBe(true);
    expect(() => checkIfItemMatchesHunt({ title: 'x', category: null }, { keywords: ['[', '*', '\\'] })).not.toThrow();
  });
});

describe('getHuntItemStatus', () => {
  it('ELIGIBLE for a matching live item and never leaks the keywords', async () => {
    const res = await getHuntItemStatus('item-1', 'shopper-1');
    expect(res.state).toBe('ELIGIBLE');
    expect(res.huntId).toBe(7);
    expect(JSON.stringify(res)).not.toContain('music box');
    expect((res as any).keywords).toBeUndefined();
  });

  it('NOT_A_MATCH for a different item (UI shows nothing)', async () => {
    db.item.findUnique.mockResolvedValue(liveItem({ title: 'Garden cart', category: 'Tools' }));
    expect((await getHuntItemStatus('item-1', 'shopper-1')).state).toBe('NOT_A_MATCH');
  });

  it('UNAVAILABLE when the sale is not published or the item is inactive', async () => {
    db.item.findUnique.mockResolvedValue(liveItem({ sale: { id: 's', status: 'ENDED', organizer: { userId: 'o' } } }));
    expect((await getHuntItemStatus('item-1', 'shopper-1')).state).toBe('UNAVAILABLE');
    db.item.findUnique.mockResolvedValue(liveItem({ isActive: false }));
    expect((await getHuntItemStatus('item-1', 'shopper-1')).state).toBe('UNAVAILABLE');
  });

  it('OWN_ITEM for the sale\'s organizer, ALREADY_FOUND after a claim, anonymous stays ELIGIBLE', async () => {
    expect((await getHuntItemStatus('item-1', 'organizer-user')).state).toBe('OWN_ITEM');
    db.treasureHuntFind.findUnique.mockResolvedValue({ id: 1 });
    expect((await getHuntItemStatus('item-1', 'shopper-1')).state).toBe('ALREADY_FOUND');
    expect((await getHuntItemStatus('item-1', undefined)).state).toBe('ELIGIBLE');
  });

  it('NOT_FOUND for an unknown item', async () => {
    db.item.findUnique.mockResolvedValue(null);
    expect((await getHuntItemStatus('nope', 'shopper-1')).state).toBe('NOT_FOUND');
  });
});

describe('claimDailyHunt', () => {
  it('CLAIMED: records the find and awards XP (rank + Hunt Pass math, pre-multiplied)', async () => {
    const res = await claimDailyHunt('shopper-1', 'item-1', 7);
    expect(res.state).toBe('CLAIMED');
    expect(res.xpEarned).toBe(3);
    expect(res.guildXp).toBe(503);
    expect(db.treasureHuntFind.create).toHaveBeenCalledTimes(1);
    expect(db.treasureHuntFind.create.mock.calls[0][0].data).toMatchObject({ userId: 'shopper-1', huntId: 7, itemId: 'item-1' });
    expect(xp.compute).toHaveBeenCalledWith('shopper-1', 'SCOUT');
    expect(xp.awardXp).toHaveBeenCalledTimes(1);
    const [uid, type, amount, ctx] = xp.awardXp.mock.calls[0];
    expect([uid, type, amount]).toEqual(['shopper-1', 'TREASURE_HUNT_DAILY', 3]);
    expect(ctx).toMatchObject({ itemId: 'item-1', saleId: 'sale-1', preMultipliedHuntPassXp: true });
  });

  it('idempotent: a repeat claim awards nothing', async () => {
    db.treasureHuntFind.findUnique.mockResolvedValue({ id: 1 });
    const res = await claimDailyHunt('shopper-1', 'item-1', 7);
    expect(res.state).toBe('ALREADY_FOUND');
    expect(db.treasureHuntFind.create).not.toHaveBeenCalled();
    expect(xp.awardXp).not.toHaveBeenCalled();
  });

  it('concurrent double-claim (unique violation) resolves to ALREADY_FOUND with no XP', async () => {
    db.treasureHuntFind.create.mockRejectedValue({ code: 'P2002' });
    const res = await claimDailyHunt('shopper-1', 'item-1', 7);
    expect(res.state).toBe('ALREADY_FOUND');
    expect(xp.awardXp).not.toHaveBeenCalled();
  });

  it('HUNT_EXPIRED when the client holds a previous day\'s hunt id', async () => {
    const res = await claimDailyHunt('shopper-1', 'item-1', 6);
    expect(res.state).toBe('HUNT_EXPIRED');
    expect(db.treasureHuntFind.create).not.toHaveBeenCalled();
  });

  it('rejects a non-matching item, a dead item, the organizer\'s own sale, and an unknown item', async () => {
    db.item.findUnique.mockResolvedValue(liveItem({ title: 'Garden cart', category: 'Tools' }));
    expect((await claimDailyHunt('shopper-1', 'item-1')).state).toBe('NOT_A_MATCH');

    db.item.findUnique.mockResolvedValue(liveItem({ draftStatus: 'DRAFT' }));
    expect((await claimDailyHunt('shopper-1', 'item-1')).state).toBe('UNAVAILABLE');

    db.item.findUnique.mockResolvedValue(liveItem());
    expect((await claimDailyHunt('organizer-user', 'item-1')).state).toBe('OWN_ITEM');

    db.item.findUnique.mockResolvedValue(null);
    expect((await claimDailyHunt('shopper-1', 'nope')).state).toBe('NOT_FOUND');

    expect(db.treasureHuntFind.create).not.toHaveBeenCalled();
    expect(xp.awardXp).not.toHaveBeenCalled();
  });

  it('an XP failure does not turn a valid claim into an error (find stays recorded)', async () => {
    xp.awardXp.mockRejectedValue(new Error('xp down'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await claimDailyHunt('shopper-1', 'item-1', 7);
    spy.mockRestore();
    expect(res.state).toBe('CLAIMED');
    expect(res.xpEarned).toBe(0);
  });

  it('a fraud-suspect user (awardXp returns null) still records the find but earns 0', async () => {
    xp.awardXp.mockResolvedValue(null);
    const res = await claimDailyHunt('shopper-1', 'item-1', 7);
    expect(res.state).toBe('CLAIMED');
    expect(res.xpEarned).toBe(0);
  });
});
