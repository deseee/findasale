/**
 * organizerEmailForwardingService.ts — unit tests.
 *
 * Focus: resolveOrganizerIdByForwardingToken's case-insensitive DB lookup. This is the
 * layer that actually backs the "case-insensitively" guarantee described in
 * gmailForwardingAutoConfirmService.test.ts -- that suite bypasses the real resolver via
 * an injected mock, so it never exercises the Prisma query shape itself. This file does.
 *
 * '../../lib/prisma' is mocked (same convention as the sibling Gmail-forwarding /
 * Facebook-sold-email test suites) so this never needs a real database connection.
 */

jest.mock('../../lib/prisma', () => ({
  prisma: {
    organizer: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

import { prisma } from '../../lib/prisma';
import { resolveOrganizerIdByForwardingToken } from '../organizerEmailForwardingService';

const findFirstMock = prisma.organizer.findFirst as jest.Mock;

describe('resolveOrganizerIdByForwardingToken', () => {
  beforeEach(() => {
    findFirstMock.mockReset();
  });

  it('returns null immediately for an empty token, without querying the DB', async () => {
    const result = await resolveOrganizerIdByForwardingToken('');

    expect(result).toBeNull();
    expect(findFirstMock).not.toHaveBeenCalled();
  });

  it('looks the token up case-insensitively', async () => {
    findFirstMock.mockResolvedValue({ id: 'organizer_42' });

    const result = await resolveOrganizerIdByForwardingToken('AbC123xyz_-TOKEN');

    expect(result).toBe('organizer_42');
    expect(findFirstMock).toHaveBeenCalledWith({
      where: { facebookSoldEmailToken: { equals: 'AbC123xyz_-TOKEN', mode: 'insensitive' } },
      select: { id: true },
    });
  });

  it('returns null (fails closed) when no organizer matches the token', async () => {
    findFirstMock.mockResolvedValue(null);

    const result = await resolveOrganizerIdByForwardingToken('unknown-token');

    expect(result).toBeNull();
  });
});
