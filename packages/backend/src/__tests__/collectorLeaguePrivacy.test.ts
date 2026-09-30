/**
 * GET /api/loyalty/collector-league (2026-09-29, data minimization): other members appear with an
 * opaque id and "First L." only; the viewer is flagged with isCurrentUser. No real ids, no full names.
 */
const mockUserFindMany = jest.fn();
jest.mock('../index', () => ({ prisma: { user: { findMany: (...a: any[]) => mockUserFindMany(...a) } } }));
jest.mock('../services/loyaltyService', () => ({
  getPassport: jest.fn(),
  getUnseenUnlocks: jest.fn(),
  markPassportSeen: jest.fn(),
}));

import { getCollectorLeague } from '../controllers/loyaltyController';
import { opaqueUserId } from '../utils/opaqueUserId';

function makeRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('getCollectorLeague', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret';
    mockUserFindMany.mockReset();
    mockUserFindMany.mockResolvedValue([
      { id: 'u-alice-real-id', name: 'Alice Anderson', explorerRank: 'SAGE', guildXp: 6000, huntPassActive: true, notificationPrefs: { showNameInGoingList: true } },
      { id: 'u-bob-real-id', name: 'Bob Brown', explorerRank: 'SCOUT', guildXp: 700, huntPassActive: true }, // did not opt in to a public name
      { id: 'u-eve-real-id', name: 'eve@example.com', explorerRank: 'SCOUT', guildXp: 600, huntPassActive: true, notificationPrefs: { showNameInGoingList: true } }, // account name is an email address
    ]);
  });

  it('returns opaque ids and First L. names, and never a real id or full name', async () => {
    const res = makeRes();
    await getCollectorLeague({ user: { id: 'u-bob-real-id' } } as any, res);
    const rows = res.json.mock.calls[0][0];
    const text = JSON.stringify(rows);
    expect(text).not.toContain('u-alice-real-id');
    expect(text).not.toContain('u-bob-real-id');
    expect(text).not.toContain('Alice Anderson');
    expect(text).not.toContain('Bob Brown');
    expect(rows[0]).toEqual({
      position: 1,
      id: opaqueUserId('u-alice-real-id'),
      name: 'Alice A.',
      explorerRank: 'SAGE',
      guildXp: 6000,
      huntPassActive: true,
      isCurrentUser: false,
    });
    expect(rows[1].isCurrentUser).toBe(true);
    expect(rows[1].name).toBe('Explorer'); // not opted in: no name at all
    expect(text).not.toContain('eve@example.com'); // an email-address name never surfaces, opted in or not
    expect(rows[2].name).toBe('Explorer');
  });

  it('flags nobody when the request has no user', async () => {
    const res = makeRes();
    await getCollectorLeague({} as any, res);
    expect(res.json.mock.calls[0][0].every((r: any) => r.isCurrentUser === false)).toBe(true);
  });
});
