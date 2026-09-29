/**
 * requireTier + tierAccess (2026-09-29, Patrick D2). NOT EXECUTED when written (jest cannot run
 * on the authoring device); CI is the first real run.
 */
import { requireTier } from '../requireTier';
import { organizerHasTier, normalizeTier, isPaidTier } from '../../utils/tierAccess';

type Tier = 'SIMPLE' | 'PRO' | 'TEAMS';

function run(minTier: Tier, user: any) {
  const req: any = { user };
  const res: any = {
    statusCode: 200,
    body: undefined as any,
    status(code: number) { this.statusCode = code; return this; },
    json(b: any) { this.body = b; return this; },
  };
  const next = jest.fn();
  const done = requireTier(minTier)(req, res, next);
  return { res, next, done };
}

const withTier = (subscriptionTier: any, extra: any = {}) => ({ organizerProfile: { subscriptionTier, ...extra } });

describe('tierAccess', () => {
  it('normalizes null/unknown to SIMPLE', () => {
    expect(normalizeTier(null)).toBe('SIMPLE');
    expect(normalizeTier(undefined)).toBe('SIMPLE');
    expect(normalizeTier('ENTERPRISE')).toBe('SIMPLE');
    expect(normalizeTier('PRO')).toBe('PRO');
  });

  it('compares by rank', () => {
    expect(organizerHasTier('SIMPLE', 'SIMPLE')).toBe(true);
    expect(organizerHasTier('SIMPLE', 'PRO')).toBe(false);
    expect(organizerHasTier('PRO', 'PRO')).toBe(true);
    expect(organizerHasTier('PRO', 'TEAMS')).toBe(false);
    expect(organizerHasTier('TEAMS', 'PRO')).toBe(true);
    expect(organizerHasTier(null, 'PRO')).toBe(false);
    expect(organizerHasTier(null, 'SIMPLE')).toBe(true);
  });

  it('isPaidTier is true only for PRO and TEAMS', () => {
    expect(isPaidTier('SIMPLE')).toBe(false);
    expect(isPaidTier(null)).toBe(false);
    expect(isPaidTier('PRO')).toBe(true);
    expect(isPaidTier('TEAMS')).toBe(true);
  });
});

describe('requireTier', () => {
  const matrix: Array<[Tier, Tier, boolean]> = [
    ['SIMPLE', 'SIMPLE', true],
    ['SIMPLE', 'PRO', false],
    ['SIMPLE', 'TEAMS', false],
    ['PRO', 'SIMPLE', true],
    ['PRO', 'PRO', true],
    ['PRO', 'TEAMS', false],
    ['TEAMS', 'SIMPLE', true],
    ['TEAMS', 'PRO', true],
    ['TEAMS', 'TEAMS', true],
  ];

  it.each(matrix)('organizer %s vs required %s -> allowed=%s', async (have, need, allowed) => {
    const { res, next, done } = run(need, withTier(have));
    await done;
    if (allowed) {
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.statusCode).toBe(200);
    } else {
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('TIER_REQUIRED');
      expect(res.body.requiredTier).toBe(need);
      expect(res.body.currentTier).toBe(have);
    }
  });

  it('treats a null tier as SIMPLE', async () => {
    const simple = run('SIMPLE', withTier(null));
    await simple.done;
    expect(simple.next).toHaveBeenCalled();

    const pro = run('PRO', withTier(null));
    await pro.done;
    expect(pro.next).not.toHaveBeenCalled();
    expect(pro.res.body.currentTier).toBe('SIMPLE');
  });

  it('does NOT block PRO/TEAMS features during the grace window (Patrick D2)', async () => {
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const pro = run('PRO', withTier('PRO', { graceEndAt: future, graceTierBefore: 'PRO' }));
    await pro.done;
    expect(pro.next).toHaveBeenCalledTimes(1);
    expect(pro.res.body).toBeUndefined();

    const teams = run('TEAMS', withTier('TEAMS', { graceEndAt: future, graceTierBefore: 'TEAMS' }));
    await teams.done;
    expect(teams.next).toHaveBeenCalledTimes(1);
  });

  it('never returns the removed GRACE_PERIOD_RESTRICTION code', async () => {
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const { res, done } = run('PRO', withTier('SIMPLE', { graceEndAt: future }));
    await done;
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('TIER_REQUIRED');
    expect(res.body.inGracePeriod).toBe(true);
  });

  it('returns 403 (not 401) with a clear code when there is no organizer profile', async () => {
    const noProfile = run('PRO', { id: 'u1' });
    await noProfile.done;
    expect(noProfile.next).not.toHaveBeenCalled();
    expect(noProfile.res.statusCode).toBe(403);
    expect(noProfile.res.body.code).toBe('ORGANIZER_PROFILE_REQUIRED');

    const noUser = run('SIMPLE', undefined);
    await noUser.done;
    expect(noUser.res.statusCode).toBe(403);
    expect(noUser.res.body.code).toBe('ORGANIZER_PROFILE_REQUIRED');
  });
});
