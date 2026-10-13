/**
 * ADR-139 recruit channel guards: kill switch, daily cap, health / auto-pause, per-lead guards.
 * Prisma, suppression, notifications and MX are jest mocks. No network, no paid API, no DB.
 */

const mockPrisma: any = {
  featureFlag: { findUnique: jest.fn(), updateMany: jest.fn() },
  recruitChannelEvent: { create: jest.fn(), findFirst: jest.fn() },
  recruitSend: { count: jest.fn() },
  recruitQuotaLog: { findUnique: jest.fn() },
  user: { findMany: jest.fn(), findFirst: jest.fn() },
  organizer: { findUnique: jest.fn() },
  directoryClaimEmail: { findFirst: jest.fn() },
  $queryRaw: jest.fn(),
};
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));

const mockIsSuppressed = jest.fn();
jest.mock('../services/suppressionService', () => ({
  suppressionService: { isSuppressed: (...a: unknown[]) => mockIsSuppressed(...a) },
}));

const mockCreateNotification = jest.fn();
jest.mock('../services/notificationService', () => ({
  createNotification: (...a: unknown[]) => mockCreateNotification(...a),
}));

const mockMx = jest.fn();
jest.mock('../lib/mxValidator', () => ({ domainCanReceiveMail: (...a: unknown[]) => mockMx(...a) }));

import { getRecruitConfig, effectiveDailyCap } from '../services/recruit/recruitConfig';
import {
  autoPause,
  decideHealth,
  evaluateHealth,
  evaluateLeadGuards,
  getKillSwitchState,
  inSendWindow,
  reserveQuotaSlot,
} from '../services/recruit/recruitGuards';

const BASE_ENV = {
  RECRUIT_SEND_ENABLED: 'true',
  RECRUIT_TRANSPORT: 'resend_optin',
} as NodeJS.ProcessEnv;

beforeEach(() => {
  jest.clearAllMocks();
  mockIsSuppressed.mockResolvedValue(false);
  mockMx.mockResolvedValue({ ok: true });
  mockPrisma.user.findFirst.mockResolvedValue(null);
  mockPrisma.organizer.findUnique.mockResolvedValue(null);
  mockPrisma.directoryClaimEmail.findFirst.mockResolvedValue(null);
});

describe('kill switch', () => {
  it('is open only when env, flag and transport are all on', async () => {
    mockPrisma.featureFlag.findUnique.mockResolvedValue({ enabled: true });
    expect((await getKillSwitchState(getRecruitConfig(BASE_ENV))).open).toBe(true);
  });

  it('env off alone blocks', async () => {
    mockPrisma.featureFlag.findUnique.mockResolvedValue({ enabled: true });
    const s = await getKillSwitchState(getRecruitConfig({ ...BASE_ENV, RECRUIT_SEND_ENABLED: undefined }));
    expect(s.open).toBe(false);
  });

  it('flag off alone blocks', async () => {
    mockPrisma.featureFlag.findUnique.mockResolvedValue({ enabled: false });
    expect((await getKillSwitchState(getRecruitConfig(BASE_ENV))).open).toBe(false);
  });

  it('a missing FeatureFlag row blocks', async () => {
    mockPrisma.featureFlag.findUnique.mockResolvedValue(null);
    expect((await getKillSwitchState(getRecruitConfig(BASE_ENV))).open).toBe(false);
  });

  it('transport none (the default) alone blocks', async () => {
    mockPrisma.featureFlag.findUnique.mockResolvedValue({ enabled: true });
    expect((await getKillSwitchState(getRecruitConfig({ ...BASE_ENV, RECRUIT_TRANSPORT: undefined }))).open).toBe(false);
  });
});

describe('daily cap', () => {
  it('clamps to 25 unless the plan is pro, and to 1..100', () => {
    expect(effectiveDailyCap(undefined, undefined)).toBe(25);
    expect(effectiveDailyCap('80', 'free')).toBe(25);
    expect(effectiveDailyCap('80', 'pro')).toBe(80);
    expect(effectiveDailyCap('500', 'pro')).toBe(100);
    expect(effectiveDailyCap('0', 'pro')).toBe(1);
  });

  // Fake that mirrors the SQL's conditional upsert, to prove the cap value is wired through.
  function installFakeQuota(start: number) {
    let count = start;
    mockPrisma.$queryRaw.mockImplementation(async (_strings: unknown, _date: string, cap: number) => {
      if (count === 0) { count = 1; return [{ count }]; }
      if (count < cap) { count += 1; return [{ count }]; }
      return [];
    });
  }

  it('refuses the 26th increment', async () => {
    installFakeQuota(25);
    expect(await reserveQuotaSlot(25)).toBe(false);
  });

  it('two concurrent increments at 24 produce exactly one success', async () => {
    installFakeQuota(24);
    const results = await Promise.all([reserveQuotaSlot(25), reserveQuotaSlot(25)]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});

describe('health / auto-pause', () => {
  const cfg = getRecruitConfig({} as NodeJS.ProcessEnv);

  it('1 hard bounce in 20 sends (5%) pauses', () => {
    expect(decideHealth({ sent: 20, hardBounces: 1, complaints: 0 }, cfg).shouldPause).toBe(true);
  });

  it('0 of 19 does not pause', () => {
    expect(decideHealth({ sent: 19, hardBounces: 0, complaints: 0 }, cfg).shouldPause).toBe(false);
  });

  it('1 hard bounce below the minimum sample does not pause', () => {
    expect(decideHealth({ sent: 5, hardBounces: 1, complaints: 0 }, cfg).shouldPause).toBe(false);
  });

  it('2 hard bounces pause with no minimum sample', () => {
    expect(decideHealth({ sent: 3, hardBounces: 2, complaints: 0 }, cfg).shouldPause).toBe(true);
  });

  it('any complaint pauses', () => {
    expect(decideHealth({ sent: 1, hardBounces: 0, complaints: 1 }, cfg).shouldPause).toBe(true);
  });

  it('counts confirmation sends (excludes only admin test sends) in the window', async () => {
    mockPrisma.recruitSend.count.mockResolvedValue(0);
    await evaluateHealth(cfg);
    const sentWhere = mockPrisma.recruitSend.count.mock.calls[0][0].where;
    expect(sentWhere.kind).toEqual({ not: 'TEST' });
  });

  it('pausing flips the flag off, writes AUTO_PAUSED and notifies admins in-app and by email', async () => {
    mockPrisma.featureFlag.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.user.findMany.mockResolvedValue([{ id: 'admin1' }, { id: 'admin2' }]);
    const health = decideHealth({ sent: 2, hardBounces: 2, complaints: 0 }, cfg);
    await autoPause(health);
    expect(mockPrisma.featureFlag.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { enabled: false, updatedBy: 'system:auto-pause' } })
    );
    expect(mockPrisma.recruitChannelEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'AUTO_PAUSED' }) })
    );
    expect(mockCreateNotification).toHaveBeenCalledTimes(2);
    // sendEmail flag (7th argument) is true
    expect(mockCreateNotification.mock.calls[0][6]).toBe(true);
  });

  it('an already-paused channel does not alert again', async () => {
    mockPrisma.featureFlag.updateMany.mockResolvedValue({ count: 0 });
    await autoPause(decideHealth({ sent: 1, hardBounces: 0, complaints: 1 }, cfg));
    expect(mockPrisma.recruitChannelEvent.create).not.toHaveBeenCalled();
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });
});

describe('per-lead guards', () => {
  const cfg = getRecruitConfig(BASE_ENV);
  const consented = { id: 'l1', email: 'a@example.com', consentAt: new Date(), organizerId: null };

  it('resend_optin + no consent = no_consent', async () => {
    const r = await evaluateLeadGuards({ ...consented, consentAt: null }, cfg);
    expect(r).toEqual({ ok: false, skipReason: 'no_consent' });
  });

  it('gmail_dedicated is never approved', async () => {
    const r = await evaluateLeadGuards(consented, getRecruitConfig({ ...BASE_ENV, RECRUIT_TRANSPORT: 'gmail_dedicated' }));
    expect(r).toEqual({ ok: false, skipReason: 'transport_not_approved' });
  });

  it('an address that already belongs to an organizer is skipped and marked converted', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: 'u9', role: 'USER', roles: ['USER', 'ORGANIZER'] });
    const r = await evaluateLeadGuards(consented, cfg);
    expect(r).toEqual({ ok: false, skipReason: 'already_organizer', convertedUserId: 'u9' });
  });

  it('a shopper-only account does not block', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: 'u9', role: 'USER', roles: ['USER'] });
    expect(await evaluateLeadGuards(consented, cfg)).toEqual({ ok: true });
  });

  it('suppressed address', async () => {
    mockIsSuppressed.mockResolvedValue(true);
    expect(await evaluateLeadGuards(consented, cfg)).toEqual({ ok: false, skipReason: 'suppressed' });
  });

  it('claimed organizer', async () => {
    mockPrisma.organizer.findUnique.mockResolvedValue({ isClaimed: true, suppressOutreach: false, claimStatus: 'CLAIMED' });
    expect(await evaluateLeadGuards({ ...consented, organizerId: 'o1' }, cfg)).toEqual({ ok: false, skipReason: 'organizer_state' });
  });

  it('prior DirectoryClaimEmail.sentAt blocks a lead without consent', async () => {
    mockPrisma.directoryClaimEmail.findFirst.mockResolvedValue({ id: 'd1' });
    const r = await evaluateLeadGuards({ ...consented, consentAt: null }, getRecruitConfig({ ...BASE_ENV, RECRUIT_TRANSPORT: 'none' }));
    expect(r).toEqual({ ok: false, skipReason: 'contacted_by_other_channel' });
  });

  it('a consented lead is not blocked by a prior cold email (they opted in themselves)', async () => {
    mockPrisma.directoryClaimEmail.findFirst.mockResolvedValue({ id: 'd1' });
    expect(await evaluateLeadGuards(consented, cfg)).toEqual({ ok: true });
  });

  it('no MX', async () => {
    mockMx.mockResolvedValue({ ok: false, reason: 'NO_MX' });
    expect(await evaluateLeadGuards(consented, cfg)).toEqual({ ok: false, skipReason: 'no_mx' });
  });
});

describe('send window', () => {
  it('is 14:00-22:00 UTC Monday to Friday', () => {
    expect(inSendWindow(new Date('2026-10-14T15:00:00Z'))).toBe(true); // Wednesday
    expect(inSendWindow(new Date('2026-10-14T13:59:00Z'))).toBe(false);
    expect(inSendWindow(new Date('2026-10-14T22:00:00Z'))).toBe(false);
    expect(inSendWindow(new Date('2026-10-17T15:00:00Z'))).toBe(false); // Saturday
  });
});
