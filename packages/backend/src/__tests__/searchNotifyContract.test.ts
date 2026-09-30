/**
 * POST /api/search/notify contract (search.tsx shows real outcomes from these).
 * 2026-09-29: double opt-in. An anonymous request is ALWAYS answered 200 pending_confirmation (no 409
 * oracle for opted-out or existing addresses); only a signed-in owner of the address gets 201 / exists /
 * rearmed / opted_out. Deeper flow coverage lives in notifyMeConfirmFlow.test.ts.
 */
const mockSN = { findMany: jest.fn(), create: jest.fn(), update: jest.fn() };
const mockUser = { findUnique: jest.fn() };
jest.mock('../lib/prisma', () => ({ prisma: { searchNotification: mockSN, user: mockUser } }));
jest.mock('../services/suppressionService', () => ({ isEmailDomainBlocked: (e: string) => e.endsWith('@finda.sale') }));
const mockSend = jest.fn();
jest.mock('../lib/transactionalEmailService', () => ({ transactionalEmailService: { emails: { send: (...a: any[]) => mockSend(...a) } } }));
const mockSessionUser = jest.fn();
jest.mock('../middleware/rateLimitShared', () => ({
  createRateLimitStore: () => ({ init: () => undefined, increment: async () => ({ totalHits: 1, resetTime: new Date() }) }),
  getVerifiedSessionUserId: (...a: any[]) => mockSessionUser(...a),
}));

import { notifyOnSearch } from '../controllers/searchNotificationController';

const run = async (body: any) => {
  const res: any = { statusCode: 0, body: undefined };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (b: any) => { res.body = b; return res; };
  await notifyOnSearch({ body } as any, res);
  for (let i = 0; i < 5; i++) await new Promise<void>((r) => setImmediate(r));
  return res;
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.JWT_SECRET = 'test-secret';
  mockSessionUser.mockReturnValue(null);
  mockUser.findUnique.mockResolvedValue(null);
  mockSend.mockResolvedValue({ sent: true });
  mockSN.findMany.mockResolvedValue([]);
  mockSN.create.mockResolvedValue({});
  mockSN.update.mockResolvedValue({});
});

it('rejects a bad email', async () => {
  const r = await run({ email: 'nope', query: 'lamp' });
  expect(r.statusCode).toBe(400);
  expect(r.body.success).toBe(false);
});

it('rejects our own finda.sale zone', async () => {
  expect((await run({ email: 'x@finda.sale', query: 'lamp' })).statusCode).toBe(400);
});

it('an anonymous new alert is stored unconfirmed and answered pending_confirmation (200, not 201)', async () => {
  const r = await run({ email: 'A@Gmail.com', query: ' Brass  Lamp ' });
  expect(r.statusCode).toBe(200);
  expect(r.body).toMatchObject({ success: true, status: 'pending_confirmation' });
  expect(mockSN.create).toHaveBeenCalledWith({ data: expect.objectContaining({ email: 'a@gmail.com', searchQuery: 'brass lamp', confirmedAt: null }) });
});

it('the signed-in owner of the address gets an immediate, honest 201 created', async () => {
  mockSessionUser.mockReturnValue('u1');
  mockUser.findUnique.mockResolvedValue({ email: 'a@gmail.com' });
  const r = await run({ email: 'A@Gmail.com', query: 'lamp' });
  expect(r.statusCode).toBe(201);
  expect(r.body.status).toBe('created');
});

it('re-arms a notified alert: the owner is told rearmed, an anonymous caller gets the generic pending answer', async () => {
  mockSN.findMany.mockResolvedValue([{ id: 'x', searchQuery: 'lamp', isActive: true, notifiedAt: new Date(), confirmedAt: new Date(), expiredAt: null }]);
  const anon = await run({ email: 'a@gmail.com', query: 'lamp' });
  expect(anon.statusCode).toBe(200);
  expect(anon.body.status).toBe('pending_confirmation');
  expect(mockSN.update).toHaveBeenCalled();

  mockSessionUser.mockReturnValue('u1');
  mockUser.findUnique.mockResolvedValue({ email: 'a@gmail.com' });
  const owner = await run({ email: 'a@gmail.com', query: 'lamp' });
  expect(owner.statusCode).toBe(200);
  expect(owner.body.status).toBe('rearmed');
});

it('never answers 409 OPTED_OUT to an anonymous caller: an opted-out address looks like any other', async () => {
  mockSN.findMany.mockResolvedValue([{ id: 'x', searchQuery: 'other', isActive: false, notifiedAt: null, confirmedAt: new Date(), expiredAt: null }]);
  const r = await run({ email: 'a@gmail.com', query: 'lamp' });
  expect(r.statusCode).toBe(200);
  expect(r.body.status).toBe('pending_confirmation');
  expect(r.body.code).toBeUndefined();
  expect(mockSN.create).not.toHaveBeenCalled();
  expect(mockSend).not.toHaveBeenCalled();
});

it('returns 500 with success:false when the database fails (never a fake success)', async () => {
  mockSN.findMany.mockRejectedValue(new Error('db'));
  const r = await run({ email: 'a@gmail.com', query: 'lamp' });
  expect(r.statusCode).toBe(500);
  expect(r.body.success).toBe(false);
});
