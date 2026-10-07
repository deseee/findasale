/**
 * Archiving a consignor removes their Square connection but keeps the money trail (2026-10-06):
 * controllers/consignorController.ts setConsignorArchived (archive / unarchive).
 *
 * NOT EXECUTED when written (no jest in the build sandbox). Run
 * `pnpm --filter backend test consignorArchiveSquarePurge` before merging.
 *
 * The Square revoke service is a mock (no network). The Prisma mock only exposes organizer,
 * workspace and consignor.findFirst/update, so any ledger, payout or item write would throw and fail
 * these tests.
 */
export {};

var mockPrisma: any = {
  organizer: { findUnique: jest.fn() },
  organizerWorkspace: { findFirst: jest.fn() },
  consignor: { findFirst: jest.fn(), update: jest.fn() },
};
var mockRevoke: any = jest.fn();
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../services/consignorSquareDisconnectService', () => ({ revokeConsignorSquareConnection: mockRevoke }));
jest.mock('@sentry/node', () => ({ captureException: jest.fn() }));
jest.mock('../lib/transactionalEmailService', () => ({ transactionalEmailService: {} }));
jest.mock('../services/consignorEmailService', () => ({}));
jest.mock('../services/consignorAgreementService', () => ({}));
jest.mock('node-cron', () => ({ __esModule: true, default: { schedule: jest.fn() } }));
jest.mock('../services/notificationService', () => ({ createNotification: jest.fn() }));
jest.mock('../utils/cronGuard', () => ({ cronGuard: jest.fn((_n: string, fn: any) => fn) }));

function makeRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
}

const req = () => ({ user: { id: 'u1' }, params: { id: 'con1' }, query: {}, body: {} });

const CLEARED = {
  squareAccountId: null,
  squareOnboarded: false,
  squareAccessTokenEncrypted: null,
  squareRefreshTokenEncrypted: null,
  squareTokenExpiresAt: null,
  squarePortalOAuthNonce: null,
};

const connected = (over: any = {}) => ({
  id: 'con1',
  archivedAt: null,
  squareAccountId: 'MERCH1',
  squareOnboarded: true,
  squareAccessTokenEncrypted: 'enc:v1:abc',
  squareRefreshTokenEncrypted: 'enc:v1:def',
  squarePortalOAuthNonce: null,
  ...over,
});

describe('archive removes the Square connection, keeps the records', () => {
  let ctl: any;
  beforeAll(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ctl = require('../controllers/consignorController');
  });
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.organizer.findUnique.mockResolvedValue({ id: 'org1', subscriptionTier: 'TEAMS' });
    mockPrisma.organizerWorkspace.findFirst.mockResolvedValue({ id: 'ws1' });
    mockPrisma.consignor.findFirst.mockResolvedValue(connected());
    mockPrisma.consignor.update.mockImplementation(async ({ data }: any) => ({ id: 'con1', archivedAt: data.archivedAt }));
    mockRevoke.mockResolvedValue({ revoked: true, skippedSharedMerchant: false });
  });

  it('archiving a connected consignor revokes at Square, nulls every Square field in the same write, and flags it for the UI', async () => {
    const res = makeRes();
    await ctl.archiveConsignor(req(), res);

    expect(mockRevoke).toHaveBeenCalledTimes(1);
    expect(mockRevoke.mock.calls[0][0]).toMatchObject({ id: 'con1', squareAccountId: 'MERCH1' });
    expect(mockPrisma.consignor.update).toHaveBeenCalledTimes(1);
    const data = mockPrisma.consignor.update.mock.calls[0][0].data;
    expect(data.archivedAt).toBeInstanceOf(Date);
    expect(data).toMatchObject(CLEARED);
    // Nothing but the consignor row is written (the mock has no ledger or payout models).
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.squareConnectionRemoved).toBe(true);
    expect(body.archivedAt).toBeInstanceOf(Date);
    expect(JSON.stringify(body)).not.toContain('enc:v1');
  });

  it('a Square revoke that fails or is skipped does not block the archive; tokens are still cleared', async () => {
    mockRevoke.mockResolvedValue({ revoked: false, skippedSharedMerchant: false });
    const res = makeRes();
    await ctl.archiveConsignor(req(), res);
    expect(mockPrisma.consignor.update.mock.calls[0][0].data).toMatchObject(CLEARED);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('even a revoke helper that unexpectedly throws is the only failure path: it is caught as a 500, never a half-archive', async () => {
    mockRevoke.mockRejectedValue(new Error('boom'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = makeRes();
    await ctl.archiveConsignor(req(), res);
    expect(mockPrisma.consignor.update).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('archiving a consignor with no Square connection does not call Square and writes only archivedAt', async () => {
    mockPrisma.consignor.findFirst.mockResolvedValue(
      connected({ squareAccountId: null, squareOnboarded: false, squareAccessTokenEncrypted: null, squareRefreshTokenEncrypted: null })
    );
    const res = makeRes();
    await ctl.archiveConsignor(req(), res);
    expect(mockRevoke).not.toHaveBeenCalled();
    const data = mockPrisma.consignor.update.mock.calls[0][0].data;
    expect(Object.keys(data)).toEqual(['archivedAt']);
    expect(res.json.mock.calls[0][0]).not.toHaveProperty('squareConnectionRemoved');
  });

  it('archive is still idempotent when already archived and disconnected: no write, no revoke', async () => {
    mockPrisma.consignor.findFirst.mockResolvedValue(
      connected({ archivedAt: new Date(), squareAccountId: null, squareOnboarded: false, squareAccessTokenEncrypted: null, squareRefreshTokenEncrypted: null })
    );
    const res = makeRes();
    await ctl.archiveConsignor(req(), res);
    expect(mockPrisma.consignor.update).not.toHaveBeenCalled();
    expect(mockRevoke).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('an already-archived consignor who reconnected Square is purged on the next archive, keeping the original archivedAt', async () => {
    const earlier = new Date('2026-10-01T00:00:00Z');
    mockPrisma.consignor.findFirst.mockResolvedValue(connected({ archivedAt: earlier }));
    const res = makeRes();
    await ctl.archiveConsignor(req(), res);
    expect(mockRevoke).toHaveBeenCalledTimes(1);
    const data = mockPrisma.consignor.update.mock.calls[0][0].data;
    expect(data.archivedAt).toBe(earlier);
    expect(data).toMatchObject(CLEARED);
  });

  it('unarchive only clears archivedAt: no revoke, nothing reconnected (the consignor reconnects from their portal)', async () => {
    mockPrisma.consignor.findFirst.mockResolvedValue(
      connected({ archivedAt: new Date(), squareAccountId: null, squareOnboarded: false, squareAccessTokenEncrypted: null, squareRefreshTokenEncrypted: null })
    );
    await ctl.unarchiveConsignor(req(), makeRes());
    expect(mockRevoke).not.toHaveBeenCalled();
    expect(mockPrisma.consignor.update.mock.calls[0][0].data).toEqual({ archivedAt: null });
  });

  it('foreign-workspace consignor: 404, no revoke, no write', async () => {
    mockPrisma.consignor.findFirst.mockResolvedValue(null);
    const res = makeRes();
    await ctl.archiveConsignor(req(), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockRevoke).not.toHaveBeenCalled();
    expect(mockPrisma.consignor.update).not.toHaveBeenCalled();
  });
});
