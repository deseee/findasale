/**
 * workspaceController.addTeamSeat: the no-card 400 carries code NO_PAYMENT_METHOD (2026-10-12).
 * Mock pattern follows consignorMoneyTrail.test.ts.
 */
export {};

var mockPrisma: any = {
  organizer: { findUnique: jest.fn() },
};
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('@sentry/node', () => ({ captureException: jest.fn() }));
jest.mock('../lib/transactionalEmailService', () => ({ transactionalEmailService: {} }));
jest.mock('../services/squareBillingService', () => ({ chargeStoredCard: jest.fn(), prorateByRemainingDays: jest.fn() }));
jest.mock('../services/organizerBillingLedger', () => ({ claimBillingCharge: jest.fn(), completeBillingCharge: jest.fn(), failBillingCharge: jest.fn() }));
jest.mock('../services/notificationService', () => ({ createNotification: jest.fn() }));

function makeRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('workspaceController.addTeamSeat no payment method', () => {
  let ctl: any;
  beforeAll(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ctl = require('../controllers/workspaceController');
  });
  beforeEach(() => jest.clearAllMocks());

  it('returns 400 with code NO_PAYMENT_METHOD and the unchanged message when no card is on file', async () => {
    mockPrisma.organizer.findUnique.mockResolvedValue({
      subscriptionTier: 'TEAMS',
      isEnterpriseAccount: false,
      billingProcessor: null,
      squareCustomerId: null,
      squareCardId: null,
      billingCurrentPeriodEnd: null,
      workspace: { id: 'ws1' },
    });
    const res = makeRes();
    await ctl.addTeamSeat({ user: { id: 'u1', organizerProfile: { id: 'org1' } } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Add a payment method on your subscription page first, then try again.',
      code: 'NO_PAYMENT_METHOD',
    });
  });
});
