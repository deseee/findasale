/**
 * Consignor portal self-serve Square disconnect + data-removal request (2026-10-06):
 * services/consignorSquareConnectService.ts disconnectPortalSquare / requestPortalDataRemoval,
 * services/consignorSquareDisconnectService.ts, squareConnectService.revokeSquareAccessToken and
 * controllers/consignorPortalSquareController.ts.
 *
 * NOT EXECUTED when written (no jest in the build sandbox). Run
 * `pnpm --filter backend test consignorPortalDisconnect` before merging.
 *
 * Square SDK, Prisma, token crypto, the email service and global fetch (the Square revoke call) are
 * mocks: no network, no database, no email. The Prisma mock deliberately has NO ledger, payout or
 * item models, so any attempt to touch the money trail would throw and fail these tests.
 */
process.env.SQUARE_ENVIRONMENT = 'sandbox';
process.env.SQUARE_SANDBOX_APPLICATION_ID = 'sandbox-app-id';
process.env.SQUARE_SANDBOX_APPLICATION_SECRET = 'sandbox-app-secret';

jest.mock('square', () => ({
  SquareEnvironment: { Production: 'production', Sandbox: 'sandbox' },
  SquareClient: jest.fn().mockImplementation(() => ({ oAuth: {}, merchants: {}, bankAccounts: {} })),
}));
jest.mock('@sentry/node', () => ({ captureMessage: jest.fn(), captureException: jest.fn() }));
jest.mock('../services/notificationService', () => ({ createNotification: jest.fn() }));
jest.mock('../utils/tokenCrypto', () => ({
  encryptToken: jest.fn((v: string) => `enc:v1:${v}`),
  decryptToken: jest.fn((v: string) => v.replace(/^enc:v1:/, '')),
}));
jest.mock('../services/consignorEmailService', () => ({
  sendConsignorSquareConnectedNotice: jest.fn().mockResolvedValue({ sent: true }),
  sendOrganizerConsignorSquareConnectedNotice: jest.fn().mockResolvedValue({ sent: true }),
  sendConsignorSquareDisconnectedNotice: jest.fn().mockResolvedValue({ sent: true }),
  sendOrganizerConsignorSquareDisconnectedNotice: jest.fn().mockResolvedValue({ sent: true }),
  sendOrganizerConsignorDataRemovalRequest: jest.fn().mockResolvedValue({ sent: true }),
}));
jest.mock('../lib/prisma', () => ({
  prisma: {
    consignor: { findUnique: jest.fn(), updateMany: jest.fn(), count: jest.fn() },
    organizer: { count: jest.fn() },
    vendorBooth: { count: jest.fn() },
  },
}));

import { prisma } from '../lib/prisma';
import {
  disconnectPortalSquare,
  notifyPortalSquareDisconnected,
  PortalSquareError,
  requestPortalDataRemoval,
} from '../services/consignorSquareConnectService';
import { CONSIGNOR_SQUARE_CLEARED_FIELDS } from '../utils/consignorSquareStatus';
import {
  sendConsignorSquareDisconnectedNotice,
  sendOrganizerConsignorDataRemovalRequest,
  sendOrganizerConsignorSquareDisconnectedNotice,
} from '../services/consignorEmailService';
import {
  disconnectPortalSquare as disconnectHandler,
  requestPortalDataRemovalHandler,
} from '../controllers/consignorPortalSquareController';

const db: any = prisma;
const orgNotice = sendOrganizerConsignorSquareDisconnectedNotice as jest.Mock;
const consignorNotice = sendConsignorSquareDisconnectedNotice as jest.Mock;
const removalNotice = sendOrganizerConsignorDataRemovalRequest as jest.Mock;

const TOKEN_PLAIN = 'sq-access-plain';

function connectedRow(over: any = {}) {
  return {
    id: 'con1',
    name: 'Lucy',
    email: 'lucy@maplemail.net',
    squareAccountId: 'MERCH1',
    squareOnboarded: true,
    squareAccessTokenEncrypted: `enc:v1:${TOKEN_PLAIN}`,
    squareRefreshTokenEncrypted: 'enc:v1:sq-refresh-plain',
    squareTokenExpiresAt: new Date('2027-01-01T00:00:00Z'),
    squarePortalOAuthNonce: 'nonce-hash',
    payoutsFlaggedForReview: false,
    workspace: { name: 'Maple Lake', owner: { user: { email: 'owner@maplemail.net' } } },
    ...over,
  };
}

let row: any;
let fetchMock: jest.Mock;
let logged: string[];

beforeEach(() => {
  row = connectedRow();
  logged = [];
  const capture = (...a: any[]) => logged.push(a.map((x) => String(x?.message ?? x)).join(' '));
  jest.spyOn(console, 'log').mockImplementation(capture);
  jest.spyOn(console, 'warn').mockImplementation(capture);
  jest.spyOn(console, 'error').mockImplementation(capture);
  db.consignor.findUnique.mockReset().mockImplementation(async ({ where }: any) => {
    if (where.portalToken === 'tok1' || where.id === 'con1') return row;
    return null;
  });
  db.consignor.updateMany.mockReset().mockResolvedValue({ count: 1 });
  db.consignor.count.mockReset().mockResolvedValue(0);
  db.organizer.count.mockReset().mockResolvedValue(0);
  db.vendorBooth.count.mockReset().mockResolvedValue(0);
  orgNotice.mockClear();
  consignorNotice.mockClear();
  removalNotice.mockReset().mockResolvedValue({ sent: true });
  fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
  (global as any).fetch = fetchMock;
});

afterEach(() => {
  jest.restoreAllMocks();
});

const flush = () => new Promise((r) => setImmediate(r));

describe('disconnectPortalSquare', () => {
  it('unknown portal token: 404 PORTAL_NOT_FOUND, nothing revoked or written', async () => {
    await expect(disconnectPortalSquare('nope')).rejects.toMatchObject({ status: 404, code: 'PORTAL_NOT_FOUND' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.consignor.updateMany).not.toHaveBeenCalled();
  });

  it.each([[undefined], [null], [''], [42], ['x'.repeat(129)]])('implausible token %p is a 404', async (t) => {
    await expect(disconnectPortalSquare(t as any)).rejects.toBeInstanceOf(PortalSquareError);
    expect(db.consignor.updateMany).not.toHaveBeenCalled();
  });

  it('revokes at Square with the application secret, clears every Square field and the nonce, returns NOT_CONNECTED', async () => {
    const result = await disconnectPortalSquare('tok1');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://connect.squareupsandbox.com/oauth2/revoke');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Client sandbox-app-secret');
    expect(JSON.parse(init.body)).toEqual({ client_id: 'sandbox-app-id', access_token: TOKEN_PLAIN });

    expect(db.consignor.updateMany).toHaveBeenCalledTimes(1);
    const arg = db.consignor.updateMany.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 'con1', squareAccountId: 'MERCH1' });
    expect(arg.data).toEqual(CONSIGNOR_SQUARE_CLEARED_FIELDS);
    expect(arg.data.squarePortalOAuthNonce).toBeNull(); // in-flight OAuth start invalidated
    expect(arg.data.squareAccessTokenEncrypted).toBeNull();
    expect(arg.data.squareRefreshTokenEncrypted).toBeNull();
    expect(arg.data.squareAccountId).toBeNull();
    expect(arg.data.squareOnboarded).toBe(false);

    expect(result).toEqual({ status: 'NOT_CONNECTED', canConnect: true, payoutsFlaggedForReview: false, disconnected: true });
    expect(JSON.stringify(result)).not.toContain(TOKEN_PLAIN);
    expect(JSON.stringify(result)).not.toContain('MERCH1');
  });

  it('emails the organizer and the consignor, without blocking the response', async () => {
    await disconnectPortalSquare('tok1');
    await flush();
    expect(orgNotice).toHaveBeenCalledTimes(1);
    expect(orgNotice.mock.calls[0][0]).toMatchObject({
      organizerEmail: 'owner@maplemail.net',
      organizerName: 'Maple Lake',
      consignorName: 'Lucy',
    });
    expect(consignorNotice).toHaveBeenCalledTimes(1);
    expect(consignorNotice.mock.calls[0][0]).toMatchObject({ consignorEmail: 'lucy@maplemail.net', organizerName: 'Maple Lake' });
  });

  it('Square refusing the revoke is non-fatal: logged, still cleared locally and the organizer still told', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    const result = await disconnectPortalSquare('tok1');
    expect(result.disconnected).toBe(true);
    expect(db.consignor.updateMany).toHaveBeenCalledTimes(1);
    expect(logged.some((l) => l.includes('revoke'))).toBe(true);
    await flush();
    expect(orgNotice).toHaveBeenCalledTimes(1);
  });

  it('a network error on the revoke is non-fatal too', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    const result = await disconnectPortalSquare('tok1');
    expect(result.disconnected).toBe(true);
    expect(db.consignor.updateMany).toHaveBeenCalledTimes(1);
  });

  it('never logs token material', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 });
    await disconnectPortalSquare('tok1');
    for (const line of logged) {
      expect(line).not.toContain(TOKEN_PLAIN);
      expect(line).not.toContain('sq-refresh-plain');
      expect(line).not.toContain('sandbox-app-secret');
    }
  });

  it('same Square merchant still connected on another row: no revoke at Square (it would revoke theirs), still cleared here', async () => {
    db.consignor.count.mockResolvedValue(1);
    const result = await disconnectPortalSquare('tok1');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.disconnected).toBe(true);
    expect(db.consignor.updateMany).toHaveBeenCalledTimes(1);
    expect(db.consignor.count.mock.calls[0][0].where).toMatchObject({ squareAccountId: 'MERCH1', id: { not: 'con1' } });
  });

  it('same merchant held by an organizer or a booth also skips the revoke', async () => {
    db.organizer.count.mockResolvedValue(1);
    await disconnectPortalSquare('tok1');
    expect(fetchMock).not.toHaveBeenCalled();
    db.organizer.count.mockResolvedValue(0);
    db.vendorBooth.count.mockResolvedValue(1);
    await disconnectPortalSquare('tok1');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a failed shared-merchant lookup fails safe: no revoke, still cleared', async () => {
    db.consignor.count.mockRejectedValue(new Error('db down'));
    const result = await disconnectPortalSquare('tok1');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.disconnected).toBe(true);
  });

  it('idempotent: already disconnected is a 200 with disconnected=false, no revoke, no write, no email', async () => {
    row = connectedRow({
      squareAccountId: null,
      squareOnboarded: false,
      squareAccessTokenEncrypted: null,
      squareRefreshTokenEncrypted: null,
      squareTokenExpiresAt: null,
      squarePortalOAuthNonce: null,
    });
    const result = await disconnectPortalSquare('tok1');
    expect(result).toEqual({ status: 'NOT_CONNECTED', canConnect: true, payoutsFlaggedForReview: false, disconnected: false });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.consignor.updateMany).not.toHaveBeenCalled();
    await flush();
    expect(orgNotice).not.toHaveBeenCalled();
    expect(consignorNotice).not.toHaveBeenCalled();
  });

  it('a concurrent disconnect that already cleared the row sends no duplicate notices', async () => {
    db.consignor.updateMany.mockResolvedValue({ count: 0 });
    const result = await disconnectPortalSquare('tok1');
    expect(result.disconnected).toBe(false);
    await flush();
    expect(orgNotice).not.toHaveBeenCalled();
  });

  it('NEEDS_ACTIVATION (account saved, not active) can also be disconnected', async () => {
    row = connectedRow({ squareOnboarded: false });
    const result = await disconnectPortalSquare('tok1');
    expect(result.disconnected).toBe(true);
    expect(db.consignor.updateMany).toHaveBeenCalledTimes(1);
  });

  it('keeps payout-review flag visible in the returned status (flag itself is never cleared)', async () => {
    row = connectedRow({ payoutsFlaggedForReview: true });
    const result = await disconnectPortalSquare('tok1');
    expect(result.payoutsFlaggedForReview).toBe(true);
    expect(db.consignor.updateMany.mock.calls[0][0].data).not.toHaveProperty('payoutsFlaggedForReview');
  });

  it('notify helper never throws when the consignor row is gone', async () => {
    await expect(notifyPortalSquareDisconnected('missing')).resolves.toBeUndefined();
    expect(orgNotice).not.toHaveBeenCalled();
  });
});

describe('requestPortalDataRemoval', () => {
  it('emails the organizer and returns requested; deletes and records nothing', async () => {
    const result = await requestPortalDataRemoval('tok1');
    expect(result).toEqual({ requested: true });
    expect(removalNotice).toHaveBeenCalledTimes(1);
    expect(removalNotice.mock.calls[0][0]).toMatchObject({
      organizerEmail: 'owner@maplemail.net',
      organizerName: 'Maple Lake',
      consignorName: 'Lucy',
      consignorEmail: 'lucy@maplemail.net',
    });
    expect(db.consignor.updateMany).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('unknown token: 404 and no email', async () => {
    await expect(requestPortalDataRemoval('nope')).rejects.toMatchObject({ status: 404, code: 'PORTAL_NOT_FOUND' });
    expect(removalNotice).not.toHaveBeenCalled();
  });

  it('organizer could not be emailed: 503 REQUEST_NOT_SENT, so the consignor is not told it worked', async () => {
    removalNotice.mockResolvedValue({ sent: false, reason: 'NO_EMAIL' });
    await expect(requestPortalDataRemoval('tok1')).rejects.toMatchObject({ status: 503, code: 'REQUEST_NOT_SENT' });
  });
});

describe('portal controller handlers', () => {
  const makeRes = () => {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  it('disconnect: 200 with the new status; reads only the token from the URL', async () => {
    const res = makeRes();
    await disconnectHandler({ params: { token: 'tok1' }, body: { squareAccountId: 'evil', userId: 'x' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0]).toMatchObject({ status: 'NOT_CONNECTED', disconnected: true });
  });

  it('disconnect: unknown token maps to 404 { error, code }', async () => {
    const res = makeRes();
    await disconnectHandler({ params: { token: 'nope' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Portal not found', code: 'PORTAL_NOT_FOUND' });
  });

  it('data removal: 202 { requested: true }', async () => {
    const res = makeRes();
    await requestPortalDataRemovalHandler({ params: { token: 'tok1' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith({ requested: true });
  });

  it('data removal: undeliverable maps to 503 with the REQUEST_NOT_SENT code', async () => {
    removalNotice.mockResolvedValue({ sent: false, reason: 'ERROR' });
    const res = makeRes();
    await requestPortalDataRemovalHandler({ params: { token: 'tok1' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json.mock.calls[0][0].code).toBe('REQUEST_NOT_SENT');
  });

  it('unexpected errors become a generic 500 without leaking details', async () => {
    db.consignor.findUnique.mockRejectedValue(new Error('secret db detail'));
    const res = makeRes();
    await disconnectHandler({ params: { token: 'tok1' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('secret db detail');
  });
});
