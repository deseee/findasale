/**
 * Consignor money trail (2026-10-06): delete guard, archive, workspace delete guard, job filters.
 * NOT EXECUTED when written (jest cannot run on the authoring device); CI is the first real run.
 */
export {};

var mockPrisma: any = {
  organizer: { findUnique: jest.fn() },
  organizerWorkspace: { findFirst: jest.fn(), findUnique: jest.fn(), delete: jest.fn() },
  consignor: { findFirst: jest.fn(), delete: jest.fn(), update: jest.fn() },
  item: { count: jest.fn(), findMany: jest.fn() },
  purchase: { count: jest.fn() },
  consignorPayout: { count: jest.fn() },
  consignorPayoutItem: { count: jest.fn() },
};
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
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

const teamsReq = (extra: any = {}) => ({ user: { id: 'u1' }, params: { id: 'con1' }, query: {}, body: {}, ...extra });

function setZeroTrail() {
  mockPrisma.item.count.mockResolvedValue(0);
  mockPrisma.purchase.count.mockResolvedValue(0);
  mockPrisma.consignorPayout.count.mockResolvedValue(0);
  mockPrisma.consignorPayoutItem.count.mockResolvedValue(0);
}

describe('consignorController delete and archive', () => {
  let ctl: any;
  beforeAll(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ctl = require('../controllers/consignorController');
  });
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.organizer.findUnique.mockResolvedValue({ id: 'org1', subscriptionTier: 'TEAMS' });
    mockPrisma.organizerWorkspace.findFirst.mockResolvedValue({ id: 'ws1' });
    mockPrisma.consignor.findFirst.mockResolvedValue({ id: 'con1', archivedAt: null });
    mockPrisma.consignor.delete.mockResolvedValue({});
    mockPrisma.consignor.update.mockImplementation(async ({ data }: any) => ({ id: 'con1', archivedAt: data.archivedAt }));
    setZeroTrail();
  });

  it('deletes a consignor with no money trail (204)', async () => {
    const res = makeRes();
    await ctl.deleteConsignor(teamsReq(), res);
    expect(mockPrisma.consignor.delete).toHaveBeenCalledWith({ where: { id: 'con1' } });
    expect(res.status).toHaveBeenCalledWith(204);
  });

  it.each([
    ['sold or tag items', () => mockPrisma.item.count.mockResolvedValue(2)],
    ['purchases', () => mockPrisma.purchase.count.mockResolvedValue(1)],
    ['payouts', () => mockPrisma.consignorPayout.count.mockResolvedValue(1)],
    ['payout lines', () => mockPrisma.consignorPayoutItem.count.mockResolvedValue(3)],
  ])('refuses delete with 409 when the consignor has %s', async (_n, arrange) => {
    arrange();
    const res = makeRes();
    await ctl.deleteConsignor(teamsReq(), res);
    expect(mockPrisma.consignor.delete).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'CONSIGNOR_HAS_MONEY_TRAIL', canArchive: true }));
  });

  it('the sold-item count includes minted tag items', async () => {
    await ctl.deleteConsignor(teamsReq(), makeRes());
    expect(mockPrisma.item.count.mock.calls[0][0].where).toEqual({
      consignorId: 'con1',
      OR: [{ status: 'SOLD' }, { listingType: 'CONSIGNOR_TAG' }],
    });
  });

  it('delete is 404 for a consignor in another workspace and 403 without TEAMS', async () => {
    mockPrisma.consignor.findFirst.mockResolvedValue(null);
    const r1 = makeRes();
    await ctl.deleteConsignor(teamsReq(), r1);
    expect(r1.status).toHaveBeenCalledWith(404);
    expect(mockPrisma.consignor.findFirst.mock.calls[0][0].where).toEqual({ id: 'con1', workspaceId: 'ws1' });

    mockPrisma.organizer.findUnique.mockResolvedValue({ id: 'org1', subscriptionTier: 'PRO' });
    const r2 = makeRes();
    await ctl.deleteConsignor(teamsReq(), r2);
    expect(r2.status).toHaveBeenCalledWith(403);
  });

  it('delete without a user is 401', async () => {
    const res = makeRes();
    await ctl.deleteConsignor({ params: { id: 'con1' } }, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('archive sets archivedAt; a second archive is an idempotent 200 with no write', async () => {
    const res = makeRes();
    await ctl.archiveConsignor(teamsReq(), res);
    expect(mockPrisma.consignor.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.consignor.update.mock.calls[0][0].data.archivedAt).toBeInstanceOf(Date);

    mockPrisma.consignor.findFirst.mockResolvedValue({ id: 'con1', archivedAt: new Date() });
    mockPrisma.consignor.update.mockClear();
    const res2 = makeRes();
    await ctl.archiveConsignor(teamsReq(), res2);
    expect(mockPrisma.consignor.update).not.toHaveBeenCalled();
    expect(res2.status).toHaveBeenCalledWith(200);
  });

  it('unarchive clears archivedAt', async () => {
    mockPrisma.consignor.findFirst.mockResolvedValue({ id: 'con1', archivedAt: new Date() });
    await ctl.unarchiveConsignor(teamsReq(), makeRes());
    expect(mockPrisma.consignor.update.mock.calls[0][0].data).toEqual({ archivedAt: null });
  });

  it('archive is 404 for a foreign-workspace consignor', async () => {
    mockPrisma.consignor.findFirst.mockResolvedValue(null);
    const res = makeRes();
    await ctl.archiveConsignor(teamsReq(), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockPrisma.consignor.update).not.toHaveBeenCalled();
  });
});

describe('workspaceController.deleteWorkspace money-trail guard', () => {
  let ctl: any;
  beforeAll(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ctl = require('../controllers/workspaceController');
  });
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.organizerWorkspace.findUnique.mockResolvedValue({ ownerId: 'org1' });
    mockPrisma.organizerWorkspace.delete.mockResolvedValue({});
    setZeroTrail();
  });
  const req = () => ({ user: { id: 'u1', organizerProfile: { id: 'org1' } }, params: { workspaceId: 'ws1' } });

  it('deletes an empty workspace', async () => {
    const res = makeRes();
    await ctl.deleteWorkspace(req(), res);
    expect(mockPrisma.organizerWorkspace.delete).toHaveBeenCalled();
  });

  it('refuses with 409 when a consignor has sold items', async () => {
    mockPrisma.item.count.mockResolvedValue(1);
    const res = makeRes();
    await ctl.deleteWorkspace(req(), res);
    expect(mockPrisma.organizerWorkspace.delete).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'WORKSPACE_HAS_MONEY_TRAIL' }));
  });

  it('refuses with 409 when payouts exist, and still 403s a non-owner first', async () => {
    mockPrisma.consignorPayout.count.mockResolvedValue(1);
    const res = makeRes();
    await ctl.deleteWorkspace(req(), res);
    expect(res.status).toHaveBeenCalledWith(409);

    const res2 = makeRes();
    await ctl.deleteWorkspace({ user: { id: 'u2', organizerProfile: { id: 'other' } }, params: { workspaceId: 'ws1' } }, res2);
    expect(res2.status).toHaveBeenCalledWith(403);
  });
});

describe('consignment jobs ignore minted tag items', () => {
  let job: any;
  beforeAll(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    job = require('../jobs/consignmentUnclaimedItemsJob');
  });
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.item.findMany.mockResolvedValue([]);
  });

  it('processUnclaimedConsignmentItems excludes CONSIGNOR_TAG', async () => {
    await job.processUnclaimedConsignmentItems();
    const wheres = mockPrisma.item.findMany.mock.calls.map((c: any[]) => c[0].where);
    expect(wheres.length).toBeGreaterThan(0);
    for (const w of wheres) expect(w.listingType).toEqual({ not: 'CONSIGNOR_TAG' });
  });

  it('processRelistCapExceededItems excludes CONSIGNOR_TAG', async () => {
    await job.processRelistCapExceededItems();
    const wheres = mockPrisma.item.findMany.mock.calls.map((c: any[]) => c[0].where);
    expect(wheres.length).toBeGreaterThan(0);
    for (const w of wheres) expect(w.listingType).toEqual({ not: 'CONSIGNOR_TAG' });
  });
});
