/**
 * Organizer follow removal and businessName hygiene (2026-09-29).
 */
const mockFollowDeleteMany = jest.fn();
const mockSmartDeleteMany = jest.fn();
const mockTransaction = jest.fn();
jest.mock('../lib/prisma', () => ({
  prisma: {
    follow: { deleteMany: (...a: any[]) => mockFollowDeleteMany(...a) },
    smartFollow: { deleteMany: (...a: any[]) => mockSmartDeleteMany(...a) },
    $transaction: (...a: any[]) => mockTransaction(...a),
  },
}));

import { unfollowOrganizerEverywhere } from '../services/organizerFollowService';
import { normalizeBusinessName, validateBusinessName, BUSINESS_NAME_MAX_LENGTH } from '../utils/businessName';

beforeEach(() => {
  mockFollowDeleteMany.mockReset();
  mockSmartDeleteMany.mockReset();
  mockTransaction.mockReset();
  mockFollowDeleteMany.mockReturnValue('follow-op');
  mockSmartDeleteMany.mockReturnValue('smart-op');
  mockTransaction.mockResolvedValue([{ count: 1 }, { count: 1 }]);
});

describe('unfollowOrganizerEverywhere', () => {
  it('deletes the Follow AND the legacy SmartFollow row for the pair in ONE transaction', async () => {
    await unfollowOrganizerEverywhere('u1', 'o1');
    expect(mockFollowDeleteMany).toHaveBeenCalledWith({ where: { userId: 'u1', organizerId: 'o1' } });
    expect(mockSmartDeleteMany).toHaveBeenCalledWith({ where: { userId: 'u1', organizerId: 'o1' } });
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockTransaction).toHaveBeenCalledWith(['follow-op', 'smart-op']);
  });

  it('propagates a transaction failure (nothing is half-removed)', async () => {
    mockTransaction.mockRejectedValue(new Error('tx failed'));
    await expect(unfollowOrganizerEverywhere('u1', 'o1')).rejects.toThrow('tx failed');
  });
});

describe('businessName hygiene', () => {
  it('strips CR, LF, tab, U+2028, U+2029 and U+0085 and collapses whitespace', () => {
    expect(normalizeBusinessName('Acme\r\nEstates\u2028Co\u2029\u0085  LLC\t')).toBe('Acme Estates Co LLC');
    expect(normalizeBusinessName('  Oak   Street\u0000Sales  ')).toBe('Oak Street Sales');
  });

  it('rejects a name that is empty after trimming and control-character stripping', () => {
    expect(validateBusinessName('   ')).toEqual({ ok: false, message: 'Business name is required' });
    expect(validateBusinessName('\r\n\u2028\u0085')).toEqual({ ok: false, message: 'Business name is required' });
    expect(validateBusinessName('')).toEqual({ ok: false, message: 'Business name is required' });
  });

  it('rejects more than 120 characters and accepts exactly 120', () => {
    expect(validateBusinessName('a'.repeat(BUSINESS_NAME_MAX_LENGTH))).toEqual({ ok: true, value: 'a'.repeat(120) });
    const tooLong = validateBusinessName('a'.repeat(121));
    expect(tooLong.ok).toBe(false);
  });

  it('rejects non-strings and absurdly long input', () => {
    expect(validateBusinessName(42).ok).toBe(false);
    expect(validateBusinessName('a'.repeat(1001)).ok).toBe(false);
  });

  it('keeps normal names intact', () => {
    expect(validateBusinessName("Mary's Estate & Antique Sales")).toEqual({ ok: true, value: "Mary's Estate & Antique Sales" });
  });
});
