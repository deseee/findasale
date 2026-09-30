/**
 * services/holdInvoiceSquareRelease: the shared "may this Square hold invoice be released?" gate
 * (money review P0-2, 2026-09-29). Square and the recorder are mocked; nothing calls Square.
 *
 * Contract under test:
 *   - a non-Square invoice is CLEAR untouched
 *   - paid at Square -> PAID (the caller records it, never releases), and the link is NOT deleted
 *   - unpaid -> the payment link is deleted, then the order is re-read; only then CLEAR
 *   - anything ambiguous -> RETRY (the caller must abort and leave the invoice PENDING)
 */

jest.mock('@sentry/node', () => ({ captureException: jest.fn(), captureMessage: jest.fn() }));

var mockGetOrder = jest.fn();
var mockDeleteLink = jest.fn();
jest.mock('../services/squareCheckoutLinkService', () => ({
  getSquareOrderPaymentStatus: (...args: any[]) => mockGetOrder(...args),
  deleteSquareCheckoutLink: (...args: any[]) => mockDeleteLink(...args),
}));
var mockMarkPaid = jest.fn();
jest.mock('../services/holdInvoicePaymentRecorder', () => ({
  markHoldInvoicePaid: (...args: any[]) => mockMarkPaid(...args),
}));

import { prepareSquareInvoiceForRelease, recordSquarePaidInvoiceFromGate } from '../services/holdInvoiceSquareRelease';

const inv = (over: any = {}) => ({
  id: 'inv-1',
  processor: 'SQUARE',
  squareOrderId: 'ord-1',
  squarePaymentLinkId: 'pl-1',
  squarePaymentId: null,
  ...over,
});
const run = (over: any = {}, organizerId: string | null = 'org-1') =>
  prepareSquareInvoiceForRelease({ invoice: inv(over), organizerId, context: 'test' });

const open = { ok: true, paid: false, state: 'OPEN', paymentId: null };
const paid = { ok: true, paid: true, state: 'COMPLETED', paymentId: 'pay-1' };
const canceled = { ok: true, paid: false, state: 'CANCELED', paymentId: null };

beforeEach(() => {
  jest.clearAllMocks();
  mockGetOrder.mockReset();
  mockDeleteLink.mockReset();
  mockMarkPaid.mockReset();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('prepareSquareInvoiceForRelease', () => {
  it('a Stripe (or unknown) invoice is CLEAR and Square is never called', async () => {
    const gate = await run({ processor: 'STRIPE' });
    expect(gate.outcome).toBe('CLEAR');
    expect(mockGetOrder).not.toHaveBeenCalled();
    expect(mockDeleteLink).not.toHaveBeenCalled();
  });

  it('an invoice that already carries a Square payment id is PAID without asking Square', async () => {
    const gate = await run({ squarePaymentId: 'pay-9' });
    expect(gate).toMatchObject({ outcome: 'PAID', paymentId: 'pay-9' });
    expect(mockDeleteLink).not.toHaveBeenCalled();
  });

  it('an order that is already COMPLETED is PAID and the link is NOT deleted', async () => {
    mockGetOrder.mockResolvedValueOnce(paid);
    const gate = await run();
    expect(gate).toMatchObject({ outcome: 'PAID', paymentId: 'pay-1' });
    expect(mockDeleteLink).not.toHaveBeenCalled();
  });

  it('an open order: deletes the link, re-reads, then CLEAR (delete happens BEFORE the caller may flip status)', async () => {
    mockGetOrder.mockResolvedValueOnce(open).mockResolvedValueOnce(canceled);
    mockDeleteLink.mockResolvedValue({ ok: true, cancelledOrderId: 'ord-1' });
    const gate = await run();
    expect(gate.outcome).toBe('CLEAR');
    expect(mockDeleteLink).toHaveBeenCalledWith({ organizerId: 'org-1', paymentLinkId: 'pl-1' });
    expect(mockGetOrder).toHaveBeenCalledTimes(2);
  });

  it('a payment that lands while the link is being cancelled is caught by the re-read: PAID', async () => {
    mockGetOrder.mockResolvedValueOnce(open).mockResolvedValueOnce(paid);
    mockDeleteLink.mockResolvedValue({ ok: true, cancelledOrderId: null });
    const gate = await run();
    expect(gate).toMatchObject({ outcome: 'PAID', paymentId: 'pay-1' });
  });

  it('a link Square says is already gone (NOT_FOUND) counts as cancelled', async () => {
    mockGetOrder.mockResolvedValueOnce(open).mockResolvedValueOnce(canceled);
    mockDeleteLink.mockResolvedValue({ ok: false, code: 'NOT_FOUND', message: 'x' });
    expect((await run()).outcome).toBe('CLEAR');
  });

  it('a cancel Square refuses with any other code is RETRY', async () => {
    mockGetOrder.mockResolvedValueOnce(open);
    mockDeleteLink.mockResolvedValue({ ok: false, code: 'INTERNAL_SERVER_ERROR', message: 'x' });
    const gate = await run();
    expect(gate.outcome).toBe('RETRY');
  });

  it('a delete that throws is RETRY', async () => {
    mockGetOrder.mockResolvedValueOnce(open);
    mockDeleteLink.mockRejectedValue(new Error('network'));
    expect((await run()).outcome).toBe('RETRY');
  });

  it('an unreadable order (Square down, token error) is RETRY and nothing is deleted', async () => {
    mockGetOrder.mockResolvedValueOnce({ ok: false, code: 'UNAUTHORIZED', message: 'x' });
    expect((await run()).outcome).toBe('RETRY');
    expect(mockDeleteLink).not.toHaveBeenCalled();
  });

  it('a getSquareOrderPaymentStatus that throws is RETRY', async () => {
    mockGetOrder.mockRejectedValueOnce(new Error('onboarding incomplete'));
    expect((await run()).outcome).toBe('RETRY');
  });

  it('the link is deleted but the order is STILL open: not trusted, RETRY', async () => {
    mockGetOrder.mockResolvedValueOnce(open).mockResolvedValueOnce(open);
    mockDeleteLink.mockResolvedValue({ ok: true, cancelledOrderId: null });
    expect((await run()).outcome).toBe('RETRY');
  });

  it('the re-read fails after a delete: trust it only when Square reported the cancelled order', async () => {
    mockGetOrder.mockResolvedValueOnce(open).mockResolvedValueOnce({ ok: false, code: 'X', message: 'x' });
    mockDeleteLink.mockResolvedValue({ ok: true, cancelledOrderId: 'ord-1' });
    expect((await run()).outcome).toBe('CLEAR');
    mockGetOrder.mockReset();
    mockGetOrder.mockResolvedValueOnce(open).mockResolvedValueOnce({ ok: false, code: 'X', message: 'x' });
    mockDeleteLink.mockResolvedValue({ ok: true, cancelledOrderId: null });
    expect((await run()).outcome).toBe('RETRY');
  });

  it('an order already CANCELED is CLEAR without another delete', async () => {
    mockGetOrder.mockResolvedValueOnce(canceled);
    expect((await run()).outcome).toBe('CLEAR');
    expect(mockDeleteLink).not.toHaveBeenCalled();
  });

  it('no organizer id to resolve the Square account from is RETRY', async () => {
    expect((await run({}, null)).outcome).toBe('RETRY');
  });

  it('a legacy Square row with neither order nor link id has nothing to ask: CLEAR', async () => {
    const gate = await run({ squareOrderId: null, squarePaymentLinkId: null });
    expect(gate.outcome).toBe('CLEAR');
    expect(mockGetOrder).not.toHaveBeenCalled();
  });

  it('an open order with no link id to cancel is never released blind: RETRY', async () => {
    mockGetOrder.mockResolvedValueOnce(open);
    expect((await run({ squarePaymentLinkId: null })).outcome).toBe('RETRY');
  });
});

describe('recordSquarePaidInvoiceFromGate', () => {
  it('records through the shared recorder as a Square reconcile', async () => {
    mockMarkPaid.mockResolvedValue({ recorded: true, alreadyPaid: false });
    const ok = await recordSquarePaidInvoiceFromGate('inv-1', { outcome: 'PAID', paymentId: 'pay-1', detail: 'd' }, 'ctx');
    expect(ok).toBe(true);
    expect(mockMarkPaid).toHaveBeenCalledWith('inv-1', { processor: 'SQUARE', externalPaymentId: 'pay-1' }, { source: 'reconcile' });
  });

  it('an already-paid invoice counts as recorded', async () => {
    mockMarkPaid.mockResolvedValue({ recorded: false, alreadyPaid: true });
    expect(await recordSquarePaidInvoiceFromGate('inv-1', { outcome: 'PAID', paymentId: 'pay-1', detail: 'd' }, 'ctx')).toBe(true);
  });

  it('never throws: a recorder failure returns false and reports to Sentry', async () => {
    mockMarkPaid.mockRejectedValue(new Error('db down'));
    const Sentry = jest.requireMock('@sentry/node');
    expect(await recordSquarePaidInvoiceFromGate('inv-1', { outcome: 'PAID', paymentId: 'pay-1', detail: 'd' }, 'ctx')).toBe(false);
    expect(Sentry.captureException).toHaveBeenCalled();
  });

  it('a paid order with no payment id is still recorded but raised loudly', async () => {
    mockMarkPaid.mockResolvedValue({ recorded: true, alreadyPaid: false });
    const Sentry = jest.requireMock('@sentry/node');
    await recordSquarePaidInvoiceFromGate('inv-1', { outcome: 'PAID', paymentId: null, detail: 'd' }, 'ctx');
    expect(Sentry.captureMessage).toHaveBeenCalled();
  });
});
