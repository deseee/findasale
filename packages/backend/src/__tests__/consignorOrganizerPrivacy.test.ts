/**
 * Organizer-side consignor privacy and consent (2026-10-06):
 *   - POST /api/consignors (createConsignor) requires permissionToEmail === true (400 otherwise);
 *   - no organizer response carries linkedExistingUser or userId (toOrganizerConsignorView, create,
 *     intake approve);
 *   - createConsignorCore (shared with intake Approve and any internal creator) does NOT require the
 *     attestation.
 *
 * NOT EXECUTED when written (no jest in the build sandbox). Run
 * `pnpm --filter backend test consignorOrganizerPrivacy` before merging.
 */
import * as fs from 'fs';
import * as path from 'path';

var mockTx: any = {
  consignor: { create: jest.fn() },
  item: { create: jest.fn() },
};
var mockPrisma: any = {
  organizer: { findUnique: jest.fn() },
  organizerWorkspace: { findFirst: jest.fn() },
  consignor: { findUnique: jest.fn(), create: jest.fn() },
  sale: { findFirst: jest.fn() },
  $transaction: jest.fn(),
};
var mockFindLinkable: any = jest.fn();
var mockSendInvite: any = jest.fn();
var mockMarkdown: any = jest.fn();
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('@sentry/node', () => ({ captureException: jest.fn() }));
jest.mock('../lib/transactionalEmailService', () => ({ transactionalEmailService: {} }));
jest.mock('../services/consignorEmailService', () => ({}));
jest.mock('../services/consignorAgreementService', () => ({}));
jest.mock('node-cron', () => ({ __esModule: true, default: { schedule: jest.fn() } }));
jest.mock('../services/notificationService', () => ({ createNotification: jest.fn() }));
jest.mock('../utils/cronGuard', () => ({ cronGuard: jest.fn((_n: string, fn: any) => fn) }));
jest.mock('../services/consignorInviteService', () => ({
  findLinkableUserId: mockFindLinkable,
  sendWelcomeInviteNonBlocking: mockSendInvite,
  sendWelcomeInviteForConsignor: jest.fn(),
}));
jest.mock('../services/commissionCalcService', () => ({
  seedDefaultCommissionTiers: jest.fn(),
  getConsignorMarkdownPolicyNotice: mockMarkdown,
}));

function makeRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
}

const storedRow = {
  id: 'c1',
  workspaceId: 'ws1',
  name: 'Lucy',
  email: 'lucy@maplemail.net',
  phone: null,
  commissionRate: '60.00',
  portalToken: 'tok_portal_1',
  userId: 'user9',
  squareAccountId: 'MERCH1',
  squareOnboarded: true,
  squareAccessTokenEncrypted: 'enc:v1:abc',
  squareRefreshTokenEncrypted: 'enc:v1:def',
  squarePortalOAuthNonce: 'nonce',
  items: [],
  payouts: [],
};

const body = (over: any = {}) => ({ name: 'Lucy', email: 'lucy@maplemail.net', commissionRate: 60, ...over });
const makeReq = (b: any) => ({ user: { id: 'u1' }, params: {}, query: {}, body: b });

describe('createConsignor permission attestation', () => {
  let ctl: any;
  beforeAll(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ctl = require('../controllers/consignorController');
  });
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockPrisma.organizer.findUnique.mockResolvedValue({ id: 'org1', subscriptionTier: 'TEAMS' });
    mockPrisma.organizerWorkspace.findFirst.mockResolvedValue({ id: 'ws1' });
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockTx));
    mockTx.consignor.create.mockResolvedValue({ ...storedRow });
    mockPrisma.consignor.findUnique.mockResolvedValue({ ...storedRow });
    mockFindLinkable.mockResolvedValue('user9');
    mockSendInvite.mockResolvedValue({ sent: true });
    mockMarkdown.mockResolvedValue({ configured: false, summary: 'No automatic markdown schedule is currently set up for this organizer.' });
  });
  afterEach(() => jest.restoreAllMocks());

  it.each([[undefined], [false], ['true'], [1], [null]])('permissionToEmail=%p is a 400 before any lookup or write', async (v) => {
    const res = makeRes();
    await ctl.createConsignor(makeReq(body({ permissionToEmail: v })), res);
    expect(res.status).toHaveBeenCalledWith(400);
    const payload = res.json.mock.calls[0][0];
    expect(payload.error).toContain('permission to email');
    expect(payload.code).toBe('PERMISSION_TO_EMAIL_REQUIRED');
    expect(mockPrisma.organizer.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockSendInvite).not.toHaveBeenCalled();
  });

  it('permissionToEmail=true creates the consignor (201) and sends the invite', async () => {
    const res = makeRes();
    await ctl.createConsignor(makeReq(body({ permissionToEmail: true })), res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockTx.consignor.create).toHaveBeenCalledTimes(1);
    expect(mockSendInvite).toHaveBeenCalledWith('c1');
  });

  it('the attestation flag is not stored on the consignor row', async () => {
    await ctl.createConsignor(makeReq(body({ permissionToEmail: true })), makeRes());
    expect(mockTx.consignor.create.mock.calls[0][0].data).not.toHaveProperty('permissionToEmail');
  });

  it('create response has no linkedExistingUser and no userId, but the link itself is stored', async () => {
    const res = makeRes();
    await ctl.createConsignor(makeReq(body({ permissionToEmail: true })), res);
    const payload = res.json.mock.calls[0][0];
    expect(payload).not.toHaveProperty('linkedExistingUser');
    expect(payload).not.toHaveProperty('userId');
    expect(payload).not.toHaveProperty('squareAccessTokenEncrypted');
    expect(payload).not.toHaveProperty('squareRefreshTokenEncrypted');
    expect(payload).not.toHaveProperty('squarePortalOAuthNonce');
    expect(payload.squareStatus).toBe('ACTIVE');
    expect(mockTx.consignor.create.mock.calls[0][0].data.userId).toBe('user9'); // userId link is kept
  });
});

describe('createConsignorCore (shared with intake Approve and internal creators)', () => {
  let ctl: any;
  beforeAll(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ctl = require('../controllers/consignorController');
  });
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindLinkable.mockResolvedValue('user9');
    mockTx.consignor.create.mockResolvedValue({ ...storedRow });
  });

  it('does not need or look at permissionToEmail, and keeps the account link', async () => {
    const created = await ctl.createConsignorCore(
      { workspaceId: 'ws1', name: 'Lucy', email: 'lucy@maplemail.net', commissionRate: 60 },
      mockTx
    );
    expect(mockTx.consignor.create).toHaveBeenCalledTimes(1);
    expect(mockTx.consignor.create.mock.calls[0][0].data.userId).toBe('user9');
    expect(created.id).toBe('c1');
    expect(created).not.toHaveProperty('linkedExistingUser');
  });
});

describe('toOrganizerConsignorView', () => {
  let ctl: any;
  beforeAll(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ctl = require('../controllers/consignorController');
  });

  it('strips userId and internal Square fields and adds no account-link flag', () => {
    const view = ctl.toOrganizerConsignorView({ ...storedRow });
    expect(view).not.toHaveProperty('userId');
    expect(view).not.toHaveProperty('linkedExistingUser');
    expect(view).not.toHaveProperty('squareAccessTokenEncrypted');
    expect(view).not.toHaveProperty('squareRefreshTokenEncrypted');
    expect(view).not.toHaveProperty('squarePortalOAuthNonce');
    expect(view.squareStatus).toBe('ACTIVE');
    expect(view.name).toBe('Lucy');
  });

  it('a row with no link also carries no flag (so absence tells an organizer nothing either)', () => {
    const view = ctl.toOrganizerConsignorView({ ...storedRow, userId: null });
    expect(view).not.toHaveProperty('linkedExistingUser');
  });
});

describe('source contracts', () => {
  const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

  it('neither organizer controller returns linkedExistingUser any more', () => {
    expect(read('controllers/consignorController.ts')).not.toMatch(/linkedExistingUser\s*[:,}]/);
    expect(read('controllers/consignorIntakeController.ts')).not.toContain('linkedExistingUser');
  });

  it('the intake Approve path does not require the permission attestation', () => {
    expect(read('controllers/consignorIntakeController.ts')).not.toContain('permissionToEmail');
  });

  it('the consignor welcome email keeps its own existing-account sentence', () => {
    expect(read('services/consignorEmailService.ts')).toContain('We found an existing FindA.Sale account with this email address');
  });
});
