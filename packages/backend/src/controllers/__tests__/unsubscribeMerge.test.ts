/**
 * unsubscribeController: 'all' merges instead of replacing; separate organizer digest opt-out (2026-09-29).
 * NOT EXECUTED when written (jest cannot run on the authoring device); CI is the first real run.
 */
const mockTokenFindUnique = jest.fn();
const mockTokenDelete = jest.fn();
const mockUserUpdate = jest.fn();
const mockUserFindUnique = jest.fn();
const mockProcessOptOut = jest.fn();
const mockClearOptOut = jest.fn();

jest.mock('../../lib/prisma', () => ({
  prisma: {
    unsubscribeToken: {
      findUnique: (...a: any[]) => mockTokenFindUnique(...a),
      delete: (...a: any[]) => mockTokenDelete(...a),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    user: {
      update: (...a: any[]) => mockUserUpdate(...a),
      findUnique: (...a: any[]) => mockUserFindUnique(...a),
    },
  },
}));
jest.mock('../../services/suppressionService', () => ({
  suppressionService: {
    processOptOut: (...a: any[]) => mockProcessOptOut(...a),
    clearOptOut: (...a: any[]) => mockClearOptOut(...a),
    isSuppressed: jest.fn(),
  },
}));

import { handleUnsubscribe, resubscribe } from '../unsubscribeController';

const mkRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const existingPrefs = {
  priceAlerts: false,
  showNameInGoingList: true,
  smsSomething: 'keep-me',
  emailWeeklyDigest: true,
  emailWeeklyOrganizerDigest: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('handleUnsubscribe', () => {
  it("'all' keeps every unrelated preference key and turns email prefs off", async () => {
    mockTokenFindUnique.mockResolvedValue({
      type: 'all',
      token: 't',
      user: { id: 'u1', email: 'a@b.com', notificationPrefs: existingPrefs },
    });
    const res = mkRes();
    await handleUnsubscribe({ query: { token: 't' } } as any, res);
    const saved = mockUserUpdate.mock.calls[0][0].data.notificationPrefs;
    expect(saved.showNameInGoingList).toBe(true);
    expect(saved.smsSomething).toBe('keep-me');
    expect(saved.emailWeeklyDigest).toBe(false);
    expect(saved.emailWeeklyOrganizerDigest).toBe(false);
    expect(saved.priceAlerts).toBe(false);
    expect(mockProcessOptOut).toHaveBeenCalledWith('a@b.com');
  });

  it("'all' works when the user has no stored prefs yet", async () => {
    mockTokenFindUnique.mockResolvedValue({ type: 'all', token: 't', user: { id: 'u1', email: 'a@b.com', notificationPrefs: null } });
    await handleUnsubscribe({ query: { token: 't' } } as any, mkRes());
    expect(mockUserUpdate.mock.calls[0][0].data.notificationPrefs.emailFlashDeals).toBe(false);
  });

  it("'organizerWeekly' flips only the organizer digest key, leaving the shopper weekly email alone", async () => {
    mockTokenFindUnique.mockResolvedValue({
      type: 'organizerWeekly',
      token: 't',
      user: { id: 'u1', email: 'a@b.com', notificationPrefs: { emailWeeklyDigest: true } },
    });
    const res = mkRes();
    await handleUnsubscribe({ query: { token: 't' } } as any, res);
    expect(mockUserUpdate.mock.calls[0][0].data.notificationPrefs).toEqual({
      emailWeeklyDigest: true,
      emailWeeklyOrganizerDigest: false,
    });
    expect(res.json.mock.calls[0][0].label).toBe('organizer weekly digest');
  });

  it("'weekly' still flips only the shopper weekly key", async () => {
    mockTokenFindUnique.mockResolvedValue({
      type: 'weekly',
      token: 't',
      user: { id: 'u1', email: 'a@b.com', notificationPrefs: { emailWeeklyOrganizerDigest: true } },
    });
    await handleUnsubscribe({ query: { token: 't' } } as any, mkRes());
    expect(mockUserUpdate.mock.calls[0][0].data.notificationPrefs).toEqual({
      emailWeeklyOrganizerDigest: true,
      emailWeeklyDigest: false,
    });
  });
});

describe('resubscribe', () => {
  it("'all' merges into existing prefs instead of replacing them", async () => {
    mockUserFindUnique.mockResolvedValue({ email: 'a@b.com', notificationPrefs: { showNameInGoingList: true, custom: 1 } });
    const res = mkRes();
    await resubscribe({ user: { id: 'u1' }, body: { type: 'all' } } as any, res);
    const saved = mockUserUpdate.mock.calls[0][0].data.notificationPrefs;
    expect(saved.showNameInGoingList).toBe(true);
    expect(saved.custom).toBe(1);
    expect(saved.emailWeeklyDigest).toBe(true);
    expect(saved.emailWeeklyOrganizerDigest).toBe(true);
    expect(mockClearOptOut).toHaveBeenCalledWith('a@b.com');
  });
});
