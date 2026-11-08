/**
 * createFinixTransfer has the restricted-item gate built in (2026-11-06): no caller can reach Finix for a blocked item.
 * Finix's HTTP client is mocked; the assertion is that it is never even obtained on a block.
 */
const mockPost = jest.fn();
const mockGetFinixClient = jest.fn(() => ({ post: mockPost, get: jest.fn() }));
jest.mock('../../finixConnectService', () => ({ getFinixClient: () => mockGetFinixClient() }));
const mockAssert = jest.fn();
jest.mock('../cardPaymentGate', () => ({
  ...jest.requireActual('../cardPaymentGate'),
  assertCardAllowedForItems: (...a: any[]) => mockAssert(...a),
}));
const mockOrgFind = jest.fn();
jest.mock('../../../lib/prisma', () => ({ prisma: { organizer: { findFirst: (...a: any[]) => mockOrgFind(...a) } } }));

import { createFinixTransfer } from '../../finixPaymentService';
import { decideCardSplit } from '../cardPaymentGate';

const base = { merchantId: 'MU1', source: 'PI1', amountCents: 5000, organizerId: 'org-1' };

beforeEach(() => {
  mockPost.mockReset();
  mockGetFinixClient.mockClear();
  mockAssert.mockReset();
  mockOrgFind.mockReset();
  mockOrgFind.mockResolvedValue({ id: 'org-1' });
});

it('refuses when the Finix merchant is not the named organizer\'s (no organizer/merchant mix-and-match)', async () => {
  mockOrgFind.mockResolvedValue(null);
  const r = await createFinixTransfer({ ...base, lines: [{ itemId: 'lamp', amountCents: 5000 }] });
  expect(r.ok === false && r.code).toBe('CARD_GATE_MERCHANT_MISMATCH');
  expect(mockOrgFind.mock.calls[0][0].where).toEqual({ id: 'org-1', finixMerchantId: 'MU1' });
  expect(mockAssert).not.toHaveBeenCalled();
  expect(mockPost).not.toHaveBeenCalled();
});

it('refuses with no Finix call when any line is restricted, and passes FINIX as the processor', async () => {
  mockAssert.mockImplementation(async (processor: string, lines: any[], organizerId: string) =>
    decideCardSplit({ processor, organizerId, organizerCardSuspended: false, lines, classes: new Map([['ring', { cls: 'JEWELRY', reason: null }]]) }),
  );
  const r = await createFinixTransfer({ ...base, lines: [{ itemId: 'ring', amountCents: 5000 }] });
  expect(r.ok).toBe(false);
  expect(r.ok === false && r.code).toBe('CARD_PAYMENT_BLOCKED');
  expect(r.ok === false && r.cardGate?.split.blockedItems[0].restrictedClass).toBe('JEWELRY');
  expect(mockAssert.mock.calls[0][0]).toBe('FINIX');
  expect(mockGetFinixClient).not.toHaveBeenCalled();
  expect(mockPost).not.toHaveBeenCalled();
});

it('requires item lines, and lines that sum to the transfer amount (no hiding a blocked item behind a small line)', async () => {
  const noLines = await createFinixTransfer({ ...base, lines: [] });
  expect(noLines.ok === false && noLines.code).toBe('CARD_GATE_LINES_REQUIRED');
  const short = await createFinixTransfer({ ...base, lines: [{ itemId: 'lamp', amountCents: 100 }] });
  expect(short.ok === false && short.code).toBe('CARD_GATE_LINES_MISMATCH');
  expect(mockAssert).not.toHaveBeenCalled();
  expect(mockPost).not.toHaveBeenCalled();
});

it('allowed lines reach Finix unchanged', async () => {
  mockAssert.mockImplementation(async (processor: string, lines: any[], organizerId: string) =>
    decideCardSplit({ processor, organizerId, organizerCardSuspended: false, lines, classes: new Map([['lamp', { cls: 'NONE', reason: null }]]) }),
  );
  mockPost.mockResolvedValue({ data: { id: 'TR1', state: 'SUCCEEDED' } });
  const r = await createFinixTransfer({ ...base, lines: [{ itemId: 'lamp', amountCents: 5000 }] });
  expect(r.ok).toBe(true);
  expect(mockPost).toHaveBeenCalledWith('/transfers', expect.objectContaining({ merchant: 'MU1', amount: 5000 }));
  expect(JSON.stringify(mockPost.mock.calls[0][1])).not.toContain('lines');
});
