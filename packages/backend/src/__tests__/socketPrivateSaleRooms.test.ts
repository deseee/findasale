/**
 * lib/socket canJoinPrivateSaleRoom (2026-10-13 security): JOIN_BRIEFING (team task data) and
 * JOIN_SALE_STATUS (revenue) used to let any socket, including anonymous ones, join. Only the sale's
 * organizer, its accepted workspace staff or an admin may join; stale / suspended tokens are refused.
 */
const mockUserFindUnique = jest.fn();
const mockSaleFindUnique = jest.fn();
const mockOrganizerFindUnique = jest.fn();
const mockMemberFindFirst = jest.fn();
jest.mock('../lib/prisma', () => ({
  prisma: {
    user: { findUnique: (...a: any[]) => mockUserFindUnique(...a) },
    sale: { findUnique: (...a: any[]) => mockSaleFindUnique(...a) },
    organizer: { findUnique: (...a: any[]) => mockOrganizerFindUnique(...a) },
    workspaceMember: { findFirst: (...a: any[]) => mockMemberFindFirst(...a) },
  },
}));

import { canJoinPrivateSaleRoom } from '../lib/socket';

const baseUser = { id: 'u1', role: 'USER', roles: ['USER'], tokenVersion: 0, suspendedAt: null, deletedAt: null };

beforeEach(() => {
  jest.clearAllMocks();
  mockSaleFindUnique.mockResolvedValue({ organizerId: 'org1' });
  mockUserFindUnique.mockResolvedValue(baseUser);
  mockOrganizerFindUnique.mockResolvedValue(null);
  mockMemberFindFirst.mockResolvedValue(null);
});

describe('canJoinPrivateSaleRoom', () => {
  it('refuses an anonymous socket without touching the DB', async () => {
    await expect(canJoinPrivateSaleRoom({}, 's1')).resolves.toBe(false);
    expect(mockUserFindUnique).not.toHaveBeenCalled();
  });

  it('refuses a signed-in shopper with no tie to the sale', async () => {
    await expect(canJoinPrivateSaleRoom({ userId: 'u1', tokenVersion: 0 }, 's1')).resolves.toBe(false);
  });

  it('admits the owning organizer', async () => {
    mockOrganizerFindUnique.mockResolvedValue({ id: 'org1' });
    await expect(canJoinPrivateSaleRoom({ userId: 'u1', tokenVersion: 0 }, 's1')).resolves.toBe(true);
  });

  it('admits accepted workspace staff of the owner', async () => {
    mockMemberFindFirst.mockResolvedValue({ id: 'm1' });
    await expect(canJoinPrivateSaleRoom({ userId: 'u1', tokenVersion: 0 }, 's1')).resolves.toBe(true);
  });

  it('admits an admin (roles read from the DB, not the token)', async () => {
    mockUserFindUnique.mockResolvedValue({ ...baseUser, roles: ['USER', 'ADMIN'] });
    await expect(canJoinPrivateSaleRoom({ userId: 'u1', tokenVersion: 0 }, 's1')).resolves.toBe(true);
  });

  it('refuses a revoked token (tokenVersion mismatch) even for the owner', async () => {
    mockUserFindUnique.mockResolvedValue({ ...baseUser, tokenVersion: 3 });
    mockOrganizerFindUnique.mockResolvedValue({ id: 'org1' });
    await expect(canJoinPrivateSaleRoom({ userId: 'u1', tokenVersion: 2 }, 's1')).resolves.toBe(false);
  });

  it('refuses a suspended account and an unknown sale', async () => {
    mockUserFindUnique.mockResolvedValue({ ...baseUser, suspendedAt: new Date() });
    await expect(canJoinPrivateSaleRoom({ userId: 'u1', tokenVersion: 0 }, 's1')).resolves.toBe(false);
    mockUserFindUnique.mockResolvedValue(baseUser);
    mockSaleFindUnique.mockResolvedValue(null);
    await expect(canJoinPrivateSaleRoom({ userId: 'u1', tokenVersion: 0 }, 'nope')).resolves.toBe(false);
  });
});
