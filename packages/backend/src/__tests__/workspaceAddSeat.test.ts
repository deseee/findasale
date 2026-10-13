/**
 * workspaceController.addTeamSeat: the paid seat is actually granted (2026-10-12).
 * Regression: createWorkspace creates no WorkspaceSettings row, so the old exact-match
 * updateMany matched 0 rows, the card was charged and the seat was never granted while the
 * response claimed success. Mock pattern follows workspaceAddSeatNoCard.test.ts.
 */
export {};

var mockPrisma: any = {
  organizer: { findUnique: jest.fn() },
  workspaceSettings: { findUnique: jest.fn(), createMany: jest.fn(), updateMany: jest.fn() },
  organizerBillingCharge: { findFirst: jest.fn() },
};
var mockSentry: any = { captureException: jest.fn(), captureMessage: jest.fn() };
var mockCharge: any = jest.fn();
var mockClaim: any = jest.fn();
var mockComplete: any = jest.fn();
var mockFail: any = jest.fn();
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('@sentry/node', () => mockSentry);
jest.mock('../lib/transactionalEmailService', () => ({ transactionalEmailService: {} }));
jest.mock('../services/squareBillingService', () => ({
  chargeStoredCard: (...a: any[]) => mockCharge(...a),
  computeSeatQuote: () => ({ amountCents: 1333, renewsOn: '2026-11-01T00:00:00.000Z', monthlyCents: 2000 }),
  friendlyChargeFailureMessage: (code?: string) => `friendly:${code ?? 'none'}`,
}));
jest.mock('../services/organizerBillingLedger', () => ({
  claimBillingCharge: (...a: any[]) => mockClaim(...a),
  completeBillingCharge: (...a: any[]) => mockComplete(...a),
  failBillingCharge: (...a: any[]) => mockFail(...a),
}));
jest.mock('../services/notificationService', () => ({ createNotification: jest.fn() }));

function makeRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}
const req: any = { user: { id: 'u1', organizerProfile: { id: 'org1' } } };

describe('workspaceController.addTeamSeat grants the seat', () => {
  let ctl: any;
  beforeAll(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ctl = require('../controllers/workspaceController');
  });
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.organizer.findUnique.mockResolvedValue({
      subscriptionTier: 'TEAMS',
      isEnterpriseAccount: false,
      billingProcessor: 'square',
      squareCustomerId: 'cust1',
      squareCardId: 'card1',
      billingCurrentPeriodEnd: new Date(Date.now() + 20 * 86400000),
      workspace: { id: 'ws1' },
    });
    mockClaim.mockResolvedValue({ state: 'claimed', id: 'chg1' });
    mockCharge.mockResolvedValue({ ok: true, paymentId: 'pay1', status: 'COMPLETED' });
    mockComplete.mockResolvedValue(undefined);
    mockFail.mockResolvedValue(true);
    mockPrisma.organizerBillingCharge.findFirst.mockResolvedValue(null);
  });

  it('no settings row: creates it at the target cap, charges once, and the response matches the DB', async () => {
    mockPrisma.workspaceSettings.findUnique
      .mockResolvedValueOnce(null) // initial read
      .mockResolvedValueOnce({ maxMembers: 6 }); // final read after create
    mockPrisma.workspaceSettings.createMany.mockResolvedValue({ count: 1 });
    const res = makeRes();
    await ctl.addTeamSeat(req, res);
    expect(mockCharge).toHaveBeenCalledTimes(1);
    expect(mockPrisma.workspaceSettings.createMany).toHaveBeenCalledWith({
      data: [{ workspaceId: 'ws1', maxMembers: 6, templateUsed: 'SOLO' }],
      skipDuplicates: true,
    });
    expect(mockPrisma.workspaceSettings.updateMany).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, seatAdded: true, maxMembers: 6 }));
    expect(mockSentry.captureMessage).not.toHaveBeenCalled();
  });

  it('existing row at the base cap: increments with a conditional update', async () => {
    mockPrisma.workspaceSettings.findUnique
      .mockResolvedValueOnce({ maxMembers: 5 })
      .mockResolvedValueOnce({ maxMembers: 6 });
    mockPrisma.workspaceSettings.updateMany.mockResolvedValue({ count: 1 });
    const res = makeRes();
    await ctl.addTeamSeat(req, res);
    expect(mockPrisma.workspaceSettings.createMany).not.toHaveBeenCalled();
    expect(mockPrisma.workspaceSettings.updateMany).toHaveBeenCalledWith({
      where: { workspaceId: 'ws1', maxMembers: { lte: 5 } },
      data: { maxMembers: 6 },
    });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, maxMembers: 6 }));
  });

  it('retry after a completed charge re-applies the seat without charging again', async () => {
    mockClaim.mockResolvedValue({ state: 'already_completed', id: 'chg1', paymentId: 'pay1', tier: 'TEAMS', amountCents: 1333, kind: 'SEAT_ADD' });
    mockPrisma.workspaceSettings.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ maxMembers: 6 });
    mockPrisma.workspaceSettings.createMany.mockResolvedValue({ count: 1 });
    const res = makeRes();
    await ctl.addTeamSeat(req, res);
    expect(mockCharge).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, maxMembers: 6 }));
  });

  it('a concurrent request already granted the seat: no double-grant, no error', async () => {
    mockPrisma.workspaceSettings.findUnique
      .mockResolvedValueOnce({ maxMembers: 5 })
      .mockResolvedValueOnce({ maxMembers: 6 }) // latest check after the 0-row update
      .mockResolvedValueOnce({ maxMembers: 6 }); // final read
    mockPrisma.workspaceSettings.updateMany.mockResolvedValue({ count: 0 });
    const res = makeRes();
    await ctl.addTeamSeat(req, res);
    expect(res.status).not.toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, maxMembers: 6 }));
    expect(mockSentry.captureMessage).not.toHaveBeenCalled();
  });

  it('charge completed but the seat could not be granted: alerts and returns 500, never success', async () => {
    mockPrisma.workspaceSettings.findUnique
      .mockResolvedValueOnce({ maxMembers: 5 })
      .mockResolvedValueOnce({ maxMembers: 5 }); // still not granted
    mockPrisma.workspaceSettings.updateMany.mockResolvedValue({ count: 0 });
    const res = makeRes();
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await ctl.addTeamSeat(req, res);
    errSpy.mockRestore();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'SEAT_NOT_APPLIED' }));
    expect(mockSentry.captureMessage).toHaveBeenCalledWith(
      'add-seat: payment completed but seat not granted',
      expect.objectContaining({ level: 'error' })
    );
  });

  it('failed charge: user sees the mapped message, raw Square wording goes to Sentry and the ledger only', async () => {
    mockPrisma.workspaceSettings.findUnique.mockResolvedValue({ maxMembers: 5 });
    mockCharge.mockResolvedValue({ ok: false, message: 'Did not find matching card', code: 'NOT_FOUND' });
    const res = makeRes();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await ctl.addTeamSeat(req, res);
    warnSpy.mockRestore();
    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.message).toBe('friendly:NOT_FOUND');
    expect(JSON.stringify(body)).not.toMatch(/matching card/i);
    expect(mockFail).toHaveBeenCalledWith('chg1', 'Did not find matching card');
    expect(mockSentry.captureMessage).toHaveBeenCalledWith(
      'add-seat: stored-card charge failed',
      expect.objectContaining({ extra: expect.objectContaining({ rawMessage: 'Did not find matching card' }) })
    );
    expect(mockPrisma.workspaceSettings.updateMany).not.toHaveBeenCalled();
  });

  it('seat price changed since the quote: 409 SEAT_PRICE_CHANGED with the new quote and NO charge', async () => {
    mockPrisma.workspaceSettings.findUnique.mockResolvedValue({ maxMembers: 5 });
    const res = makeRes();
    await ctl.addTeamSeat({ ...req, body: { expectedAmountCents: 1000 } }, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'SEAT_PRICE_CHANGED', amountCents: 1333, monthlyCents: 2000 }));
    expect(mockClaim).not.toHaveBeenCalled();
    expect(mockCharge).not.toHaveBeenCalled();
    expect(mockPrisma.workspaceSettings.updateMany).not.toHaveBeenCalled();
  });

  it('expected amount matches the server amount: charges exactly once', async () => {
    mockPrisma.workspaceSettings.findUnique.mockResolvedValueOnce({ maxMembers: 5 }).mockResolvedValueOnce({ maxMembers: 6 });
    mockPrisma.workspaceSettings.updateMany.mockResolvedValue({ count: 1 });
    const res = makeRes();
    await ctl.addTeamSeat({ ...req, body: { expectedAmountCents: 1333 } }, res);
    expect(mockCharge).toHaveBeenCalledTimes(1);
    expect(mockCharge).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 1333 }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, maxMembers: 6 }));
  });

  it('a completed charge for this target seat under a different period key (period roll): applies it, no new charge, reconcile alert', async () => {
    mockPrisma.organizerBillingCharge.findFirst.mockResolvedValue({ id: 'old1', periodKey: 'seat:org1:6:2026-10-01T00:00:00.000Z' });
    mockPrisma.workspaceSettings.findUnique.mockResolvedValueOnce({ maxMembers: 5 }).mockResolvedValueOnce({ maxMembers: 6 });
    mockPrisma.workspaceSettings.updateMany.mockResolvedValue({ count: 1 });
    const res = makeRes();
    await ctl.addTeamSeat(req, res);
    // only a charge from the last 15 minutes counts, never a long window
    const where = mockPrisma.organizerBillingCharge.findFirst.mock.calls[0][0].where;
    expect(where.OR).toBeUndefined();
    expect(where.createdAt.gte.getTime()).toBeGreaterThan(Date.now() - 16 * 60 * 1000);
    expect(mockClaim).not.toHaveBeenCalled();
    expect(mockCharge).not.toHaveBeenCalled();
    expect(mockPrisma.workspaceSettings.updateMany).toHaveBeenCalled();
    expect(mockSentry.captureMessage).toHaveBeenCalledWith(
      'add-seat: reconciled an existing completed seat charge (no new charge)',
      expect.objectContaining({ level: 'warning' })
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, maxMembers: 6 }));
  });

  it('getSeatQuote returns amount, renewal date and monthly price', async () => {
    const res = makeRes();
    await ctl.getSeatQuote(req, res);
    expect(res.json).toHaveBeenCalledWith({ amountCents: 1333, renewsOn: '2026-11-01T00:00:00.000Z', monthlyCents: 2000 });
  });
});
