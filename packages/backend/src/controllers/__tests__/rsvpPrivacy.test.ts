/**
 * RSVP attendee privacy + shopper name opt-in (2026-09-29).
 * NOT EXECUTED when written (jest cannot run on the authoring device); CI is the first real run.
 */
const mockSaleFindUnique = jest.fn();
const mockRsvpCount = jest.fn();
const mockRsvpFindMany = jest.fn();
const mockUserFindUnique = jest.fn();
const mockUserUpdate = jest.fn();
const mockMemberFindFirst = jest.fn();
const mockCheckPermission = jest.fn();

const mockPrisma = {
  sale: { findUnique: (...a: any[]) => mockSaleFindUnique(...a) },
  saleRSVP: {
    count: (...a: any[]) => mockRsvpCount(...a),
    findMany: (...a: any[]) => mockRsvpFindMany(...a),
    findUnique: jest.fn(),
  },
  user: { findUnique: (...a: any[]) => mockUserFindUnique(...a), update: (...a: any[]) => mockUserUpdate(...a) },
  workspaceMember: { findFirst: (...a: any[]) => mockMemberFindFirst(...a) },
  organizer: { findUnique: jest.fn().mockResolvedValue(null) },
};

jest.mock('../../index', () => ({ prisma: mockPrisma }));
jest.mock('../../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../../services/xpService', () => ({
  awardXp: jest.fn(),
  applyHuntPassMultiplier: jest.fn(),
  checkMonthlyXpCap: jest.fn(),
  XP_AWARDS: { RSVP: 1 },
}));
jest.mock('../../services/notificationService', () => ({ createNotification: jest.fn() }));
jest.mock('../../services/achievementService', () => ({ checkAndAward: jest.fn() }));
jest.mock('../../services/workspacePermissionService', () => ({
  checkPermission: (...a: any[]) => mockCheckPermission(...a),
}));

import { getRSVPAttendees, getMyRSVPStatus, setRSVPNameVisibility } from '../rsvpController';

const mkRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const rows = [
  { id: 'r1', user: { name: 'Jane Doe', notificationPrefs: { showNameInGoingList: true } } },
  { id: 'r2', user: { name: 'Bob Smith', notificationPrefs: null } },
  { id: 'r3', user: { name: 'Cara Lee', notificationPrefs: { showNameInGoingList: false } } },
  { id: 'r4', user: { name: 'Dan Wu', notificationPrefs: { showNameInGoingList: true, emailWeeklyDigest: false } } },
];

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  mockSaleFindUnique.mockResolvedValue({ id: 'sale_1', organizerId: 'org_1' });
  mockRsvpCount.mockResolvedValue(4);
  mockRsvpFindMany.mockResolvedValue(rows);
});
afterEach(() => jest.restoreAllMocks());

describe('getRSVPAttendees', () => {
  it('signed-out visitors get the count and only opted-in shoppers as first name + last initial', async () => {
    const res = mkRes();
    await getRSVPAttendees({ params: { id: 'sale_1' } } as any, res);
    const payload = res.json.mock.calls[0][0];
    expect(payload.audience).toBe('public');
    expect(payload.count).toBe(4);
    expect(payload.attendees).toEqual([
      { id: 'r1', name: 'Jane D.' },
      { id: 'r4', name: 'Dan W.' },
    ]);
    expect(payload.anonymousCount).toBe(2);
    const json = JSON.stringify(payload);
    expect(json).not.toContain('Bob');
    expect(json).not.toContain('Cara');
    expect(json).not.toContain('Doe');
    expect(json).not.toMatch(/userId/);
  });

  it('a signed-in stranger (another shopper) gets the public view', async () => {
    const res = mkRes();
    await getRSVPAttendees({ params: { id: 'sale_1' }, user: { id: 'u_other', roles: ['SHOPPER'] } } as any, res);
    expect(res.json.mock.calls[0][0].audience).toBe('public');
    expect(mockMemberFindFirst).toHaveBeenCalled(); // checked for staff access, found none
  });

  it('the sale owner sees every name, keyed by RSVP id, never a user id', async () => {
    const res = mkRes();
    await getRSVPAttendees(
      { params: { id: 'sale_1' }, user: { id: 'u_owner', roles: ['ORGANIZER'], organizerProfile: { id: 'org_1' } } } as any,
      res
    );
    const payload = res.json.mock.calls[0][0];
    expect(payload.audience).toBe('organizer');
    expect(payload.attendees.map((a: any) => a.name)).toEqual(['Jane Doe', 'Bob Smith', 'Cara Lee', 'Dan Wu']);
    expect(payload.attendees[0]).toEqual({ id: 'r1', name: 'Jane Doe' });
    expect(payload.anonymousCount).toBe(0);
  });

  it('another organizer does not get names', async () => {
    const res = mkRes();
    await getRSVPAttendees(
      { params: { id: 'sale_1' }, user: { id: 'u_rival', roles: ['ORGANIZER'], organizerProfile: { id: 'org_999' } } } as any,
      res
    );
    expect(res.json.mock.calls[0][0].audience).toBe('public');
  });

  it('an admin gets names', async () => {
    const res = mkRes();
    await getRSVPAttendees({ params: { id: 'sale_1' }, user: { id: 'u_admin', roles: ['ADMIN'] } } as any, res);
    expect(res.json.mock.calls[0][0].audience).toBe('organizer');
  });

  it('workspace staff with broadcast_alerts on a TEAMS owner get names; without the permission they do not', async () => {
    const member = { workspaceId: 'ws_1', role: 'MEMBER', workspace: { owner: { subscriptionTier: 'TEAMS' } } };
    mockMemberFindFirst.mockResolvedValue(member);

    mockCheckPermission.mockResolvedValue(true);
    let res = mkRes();
    await getRSVPAttendees({ params: { id: 'sale_1' }, user: { id: 'u_staff', roles: [] } } as any, res);
    expect(res.json.mock.calls[0][0].audience).toBe('organizer');
    expect(mockCheckPermission).toHaveBeenCalledWith('ws_1', 'MEMBER', 'broadcast_alerts');

    mockCheckPermission.mockResolvedValue(false);
    res = mkRes();
    await getRSVPAttendees({ params: { id: 'sale_1' }, user: { id: 'u_staff', roles: [] } } as any, res);
    expect(res.json.mock.calls[0][0].audience).toBe('public');
  });

  it('staff of an owner who is no longer on TEAMS lose access', async () => {
    mockMemberFindFirst.mockResolvedValue({ workspaceId: 'ws_1', role: 'ADMIN', workspace: { owner: { subscriptionTier: 'PRO' } } });
    mockCheckPermission.mockResolvedValue(true);
    const res = mkRes();
    await getRSVPAttendees({ params: { id: 'sale_1' }, user: { id: 'u_staff', roles: [] } } as any, res);
    expect(res.json.mock.calls[0][0].audience).toBe('public');
  });

  it('404 for an unknown sale', async () => {
    mockSaleFindUnique.mockResolvedValue(null);
    const res = mkRes();
    await getRSVPAttendees({ params: { id: 'nope' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('zero RSVPs returns an empty list, not an error', async () => {
    mockRsvpCount.mockResolvedValue(0);
    mockRsvpFindMany.mockResolvedValue([]);
    const res = mkRes();
    await getRSVPAttendees({ params: { id: 'sale_1' } } as any, res);
    expect(res.json.mock.calls[0][0]).toMatchObject({ count: 0, attendees: [], anonymousCount: 0 });
  });
});

describe('getMyRSVPStatus', () => {
  it('reports the shopper\'s own name preference (default false)', async () => {
    (mockPrisma.saleRSVP.findUnique as jest.Mock).mockResolvedValue({ id: 'r1' });
    mockRsvpCount.mockResolvedValue(3);
    let res = mkRes();
    await getMyRSVPStatus({ params: { id: 'sale_1' }, user: { id: 'u1', notificationPrefs: { showNameInGoingList: true } } } as any, res);
    expect(res.json.mock.calls[0][0]).toEqual({ isGoing: true, count: 3, showName: true });
    res = mkRes();
    await getMyRSVPStatus({ params: { id: 'sale_1' }, user: { id: 'u1', notificationPrefs: null } } as any, res);
    expect(res.json.mock.calls[0][0].showName).toBe(false);
  });
});

describe('setRSVPNameVisibility', () => {
  it('merges the flag into existing prefs without touching other keys', async () => {
    mockUserFindUnique.mockResolvedValue({ notificationPrefs: { emailWeeklyOrganizerDigest: false, priceAlerts: false } });
    const res = mkRes();
    await setRSVPNameVisibility({ params: { id: 'sale_1' }, body: { show: true }, user: { id: 'u1' } } as any, res);
    expect(mockUserUpdate.mock.calls[0][0].data.notificationPrefs).toEqual({
      emailWeeklyOrganizerDigest: false,
      priceAlerts: false,
      showNameInGoingList: true,
    });
    expect(res.json).toHaveBeenCalledWith({ showName: true });
  });

  it('works when the user has no prefs yet, and can turn the flag back off', async () => {
    mockUserFindUnique.mockResolvedValue({ notificationPrefs: null });
    await setRSVPNameVisibility({ params: {}, body: { show: false }, user: { id: 'u1' } } as any, mkRes());
    expect(mockUserUpdate.mock.calls[0][0].data.notificationPrefs).toEqual({ showNameInGoingList: false });
  });

  it('rejects a non-boolean value and requires sign-in', async () => {
    let res = mkRes();
    await setRSVPNameVisibility({ params: {}, body: { show: 'yes' }, user: { id: 'u1' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    res = mkRes();
    await setRSVPNameVisibility({ params: {}, body: { show: true } } as any, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });
});
