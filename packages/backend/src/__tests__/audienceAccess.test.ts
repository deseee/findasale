/**
 * utils/audienceAccess (2026-09-29): the sale's own organizer must be recognised even behind
 * optionalAuthenticate, which (unlike authenticate) does not attach organizerProfile.
 */
const mockOrganizerFindUnique = jest.fn();
const mockMemberFindFirst = jest.fn();
const mockCheckPermission = jest.fn();
jest.mock('../lib/prisma', () => ({
  prisma: {
    organizer: { findUnique: (...a: any[]) => mockOrganizerFindUnique(...a) },
    workspaceMember: { findFirst: (...a: any[]) => mockMemberFindFirst(...a) },
  },
}));
jest.mock('../services/workspacePermissionService', () => ({ checkPermission: (...a: any[]) => mockCheckPermission(...a) }));
jest.mock('../utils/workspacePermissions', () => ({ WORKSPACE_PERMISSIONS: { BROADCAST_ALERTS: 'broadcast_alerts' } }));

import { resolveAudienceAccess } from '../utils/audienceAccess';

beforeEach(() => {
  mockOrganizerFindUnique.mockReset();
  mockMemberFindFirst.mockReset();
  mockCheckPermission.mockReset();
  mockMemberFindFirst.mockResolvedValue(null);
});

describe('resolveAudienceAccess', () => {
  it('denies an anonymous request', async () => {
    await expect(resolveAudienceAccess({} as any, 'org1')).resolves.toEqual({ allowed: false, via: null });
  });

  it('allows an admin', async () => {
    const r = await resolveAudienceAccess({ user: { id: 'a', roles: ['ADMIN'] } } as any, 'org1');
    expect(r).toEqual({ allowed: true, via: 'ADMIN' });
  });

  it('allows the owner when authenticate attached organizerProfile (no lookup needed)', async () => {
    const r = await resolveAudienceAccess({ user: { id: 'u1', roles: ['ORGANIZER'], organizerProfile: { id: 'org1' } } } as any, 'org1');
    expect(r).toEqual({ allowed: true, via: 'OWNER' });
    expect(mockOrganizerFindUnique).not.toHaveBeenCalled();
  });

  it('allows the owner behind optionalAuthenticate by looking the organizer up by userId', async () => {
    mockOrganizerFindUnique.mockResolvedValue({ id: 'org1' });
    const r = await resolveAudienceAccess({ user: { id: 'u1', roles: ['ORGANIZER'] } } as any, 'org1');
    expect(r).toEqual({ allowed: true, via: 'OWNER' });
    expect(mockOrganizerFindUnique).toHaveBeenCalledWith({ where: { userId: 'u1' }, select: { id: true } });
  });

  it('does not treat a DIFFERENT organizer as the owner', async () => {
    mockOrganizerFindUnique.mockResolvedValue({ id: 'someone-else' });
    const r = await resolveAudienceAccess({ user: { id: 'u2', roles: ['ORGANIZER'] } } as any, 'org1');
    expect(r).toEqual({ allowed: false, via: null });
  });

  it('a plain shopper with no organizer row is denied', async () => {
    mockOrganizerFindUnique.mockResolvedValue(null);
    const r = await resolveAudienceAccess({ user: { id: 'u3', roles: ['USER'] } } as any, 'org1');
    expect(r).toEqual({ allowed: false, via: null });
  });

  it('allows accepted TEAMS staff with the broadcast permission', async () => {
    mockOrganizerFindUnique.mockResolvedValue(null);
    mockMemberFindFirst.mockResolvedValue({ workspaceId: 'w1', role: 'MEMBER', workspace: { owner: { subscriptionTier: 'TEAMS' } } });
    mockCheckPermission.mockResolvedValue(true);
    const r = await resolveAudienceAccess({ user: { id: 'u4', roles: ['USER'] } } as any, 'org1');
    expect(r).toEqual({ allowed: true, via: 'STAFF' });
  });

  it('denies staff when the workspace owner is no longer on TEAMS', async () => {
    mockOrganizerFindUnique.mockResolvedValue(null);
    mockMemberFindFirst.mockResolvedValue({ workspaceId: 'w1', role: 'MEMBER', workspace: { owner: { subscriptionTier: 'PRO' } } });
    const r = await resolveAudienceAccess({ user: { id: 'u4', roles: ['USER'] } } as any, 'org1');
    expect(r).toEqual({ allowed: false, via: null });
  });

  it('denies (fails closed) when the lookup throws', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockOrganizerFindUnique.mockRejectedValue(new Error('db down'));
    const r = await resolveAudienceAccess({ user: { id: 'u1', roles: ['ORGANIZER'] } } as any, 'org1');
    expect(r).toEqual({ allowed: false, via: null });
  });
});
