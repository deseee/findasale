/**
 * Consignor settlement controllers (organizer-settles model, 2026-09-29): HTTP-level behavior of
 * controllers/consignorSettlementController.ts and the runPayout / listConsignors /
 * getConsignorPortal changes in controllers/consignorController.ts.
 *
 * NOT EXECUTED when written (no jest or tsc in the build sandbox). Run
 * `pnpm --filter backend test consignorSettlementController` before merging.
 *
 * Runs against the in-memory fake in __fixtures__/fakeLedgerDb.ts. Emails, the legacy Stripe rail
 * and the agreement renderer are jest mocks: no real transaction, email or network call is made.
 * The headline assertions: TEAMS gate on every handler, foreign ids are 404, approving a run
 * never touches payConsignorViaACH or the legacy payout email, and a consignor is only emailed
 * when the organizer opted in AND the email actually went out.
 */
jest.mock('../lib/prisma', () => {
  const { createFakeDb } = require('./__fixtures__/fakeLedgerDb');
  return { prisma: createFakeDb() };
});
jest.mock('../services/stripeConnectService', () => ({ payConsignorViaACH: jest.fn() }));
jest.mock('../services/consignorEmailService', () => ({
  sendConsignorPayout: jest.fn(),
  sendConsignorStatement: jest.fn(),
  sendConsignorPaymentRecorded: jest.fn(),
}));
jest.mock('../services/consignorAgreementService', () => ({ renderConsignorAgreementForConsignor: jest.fn() }));

import { prisma } from '../lib/prisma';
import * as ledger from '../services/consignorLedgerService';
import * as settle from '../controllers/consignorSettlementController';
import * as consignorCtl from '../controllers/consignorController';
import { payConsignorViaACH } from '../services/stripeConnectService';
import { sendConsignorPayout, sendConsignorStatement, sendConsignorPaymentRecorded } from '../services/consignorEmailService';
import { renderConsignorAgreementForConsignor } from '../services/consignorAgreementService';

const db: any = prisma;
const fake = db.__fake;
const D = fake.D;

const mStatement = sendConsignorStatement as jest.Mock;
const mRecorded = sendConsignorPaymentRecorded as jest.Mock;
const mLegacyEmail = sendConsignorPayout as jest.Mock;
const mAch = payConsignorViaACH as jest.Mock;

let ws: { userId: string; organizerId: string; workspaceId: string };
let sale: any;

function mockRes() {
  const res: any = { statusCode: 200, headers: {} as Record<string, any>, body: undefined, sent: undefined };
  res.status = (c: number) => {
    res.statusCode = c;
    return res;
  };
  res.json = (b: any) => {
    res.body = b;
    return res;
  };
  res.send = (b: any) => {
    res.sent = b;
    return res;
  };
  res.end = (b?: any) => {
    res.sent = b;
    return res;
  };
  res.setHeader = (k: string, v: any) => {
    res.headers[k] = v;
    return res;
  };
  return res;
}

async function call(handler: any, over: any = {}, userId: string | null = ws.userId) {
  const res = mockRes();
  const req: any = { user: userId ? { id: userId } : undefined, params: {}, query: {}, body: {}, ...over };
  await handler(req, res);
  return res;
}

const paidAtIso = () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
const payoutsOf = (batchId: string) => fake.store.consignorPayout.filter((p: any) => p.settlementBatchId === batchId);
const eventsOf = (payoutId: string, type?: string) =>
  fake.store.consignorPayoutEvent.filter((e: any) => e.payoutId === payoutId && (!type || e.type === type));

/** Seed `n` consignors (emails c1@example.com ...) each with items at $20 and $30 and create a DRAFT run for the sale. */
async function seedRun(n = 1) {
  const consignors: any[] = [];
  for (let i = 1; i <= n; i++) {
    const c = fake.seedConsignor(ws.workspaceId, { name: `Consignor ${i}`, email: `c${i}@example.com` });
    consignors.push(c);
    fake.seedItem(c.id, { price: 20, title: `Lamp ${i}`, saleId: sale.id });
    fake.seedItem(c.id, { price: 30, title: `Chair ${i}`, saleId: sale.id });
  }
  const { batch } = await ledger.createSettlementRun(db, { workspaceId: ws.workspaceId, actorUserId: ws.userId, saleId: sale.id });
  return { batch, consignors };
}

async function seedApprovedRun(n = 1) {
  const run = await seedRun(n);
  await ledger.approveRun(db, { workspaceId: ws.workspaceId, batchId: run.batch.id, actorUserId: ws.userId });
  return run;
}

beforeEach(() => {
  for (const t of Object.keys(fake.store)) fake.store[t] = [];
  mStatement.mockReset().mockResolvedValue({ sent: true });
  mRecorded.mockReset().mockResolvedValue({ sent: true });
  mLegacyEmail.mockReset().mockResolvedValue(undefined);
  mAch.mockReset();
  (renderConsignorAgreementForConsignor as jest.Mock).mockReset().mockResolvedValue(null);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  ws = fake.seedWorkspace();
  sale = fake.seedSale(ws.organizerId, 'Spring Sale');
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('access control on every settlement handler', () => {
  const all: [string, any, any][] = [
    ['preview', settle.previewConsignorSettlement, { params: { saleId: 'x' } }],
    ['sales-summary', settle.getConsignorSalesSummary, {}],
    ['annual-summary', settle.getConsignorAnnualSummary, {}],
    ['create', settle.createConsignorSettlementBatch, { body: {} }],
    ['get batch', settle.getConsignorSettlementBatch, { params: { batchId: 'x' } }],
    ['refresh', settle.refreshConsignorSettlementBatch, { params: { batchId: 'x' } }],
    ['approve', settle.approveConsignorSettlementBatch, { params: { batchId: 'x' }, body: { sendStatements: true } }],
    ['cancel', settle.cancelConsignorSettlementBatch, { params: { batchId: 'x' }, body: { reason: 'r' } }],
    ['csv', settle.exportConsignorSettlementCsv, { params: { batchId: 'x' } }],
    ['mark-paid', settle.markConsignorPayoutPaid, { params: { id: 'x' }, body: { method: 'CASH', notifyConsignor: true } }],
    ['undo-paid', settle.undoConsignorPayoutPaid, { params: { id: 'x' }, body: { reason: 'r' } }],
    ['hold', settle.holdConsignorPayout, { params: { id: 'x' }, body: { reason: 'r' } }],
    ['release', settle.releaseConsignorPayout, { params: { id: 'x' } }],
    ['void', settle.voidConsignorPayout, { params: { id: 'x' }, body: { reason: 'r' } }],
    ['send-statement', settle.sendConsignorPayoutStatement, { params: { id: 'x' } }],
    ['statement', settle.getConsignorPayoutStatement, { params: { id: 'x' } }],
    ['statement pdf', settle.getConsignorPayoutStatementPdf, { params: { id: 'x' } }],
    ['events', settle.getConsignorPayoutEvents, { params: { id: 'x' } }],
  ];

  it.each(all)('%s: a non-TEAMS organizer gets 403 and nothing is written or sent', async (_name, handler, over) => {
    const free = fake.seedWorkspace({ tier: 'FREE', userId: 'user_free' });
    const res = await call(handler, over, free.userId);
    expect(res.statusCode).toBe(403);
    expect(fake.store.consignorSettlementBatch).toHaveLength(0);
    expect(fake.store.consignorPayout).toHaveLength(0);
    expect(mStatement).not.toHaveBeenCalled();
    expect(mRecorded).not.toHaveBeenCalled();
  });

  it.each(all)('%s: an unauthenticated request gets 401', async (_name, handler, over) => {
    const res = await call(handler, over, null);
    expect(res.statusCode).toBe(401);
  });

  it.each(all)('%s: a user with no organizer profile gets 404', async (_name, handler, over) => {
    const res = await call(handler, over, 'user_nobody');
    expect(res.statusCode).toBe(404);
  });
});

describe('cross-workspace ids are 404 and never leak', () => {
  it('batch handlers 404 for a batch that belongs to another workspace, and change nothing', async () => {
    const { batch } = await seedRun();
    const other = fake.seedWorkspace({ userId: 'user_2' });
    const as = other.userId;
    const bp = { params: { batchId: batch.id } };
    expect((await call(settle.getConsignorSettlementBatch, bp, as)).statusCode).toBe(404);
    expect((await call(settle.refreshConsignorSettlementBatch, bp, as)).statusCode).toBe(404);
    expect((await call(settle.approveConsignorSettlementBatch, { ...bp, body: { sendStatements: true } }, as)).statusCode).toBe(404);
    expect((await call(settle.cancelConsignorSettlementBatch, { ...bp, body: { reason: 'x' } }, as)).statusCode).toBe(404);
    expect((await call(settle.exportConsignorSettlementCsv, bp, as)).statusCode).toBe(404);
    expect(fake.store.consignorSettlementBatch[0].status).toBe('DRAFT');
    expect(mStatement).not.toHaveBeenCalled();
  });

  it('payout handlers 404 for a payout that belongs to another workspace', async () => {
    const { batch } = await seedApprovedRun();
    const pid = payoutsOf(batch.id)[0].id;
    const other = fake.seedWorkspace({ userId: 'user_2' });
    const as = other.userId;
    const pp = { params: { id: pid } };
    expect((await call(settle.markConsignorPayoutPaid, { ...pp, body: { method: 'CASH', notifyConsignor: true } }, as)).statusCode).toBe(404);
    expect((await call(settle.undoConsignorPayoutPaid, { ...pp, body: { reason: 'x' } }, as)).statusCode).toBe(404);
    expect((await call(settle.holdConsignorPayout, { ...pp, body: { reason: 'x' } }, as)).statusCode).toBe(404);
    expect((await call(settle.releaseConsignorPayout, pp, as)).statusCode).toBe(404);
    expect((await call(settle.voidConsignorPayout, { ...pp, body: { reason: 'x' } }, as)).statusCode).toBe(404);
    expect((await call(settle.sendConsignorPayoutStatement, pp, as)).statusCode).toBe(404);
    expect((await call(settle.getConsignorPayoutStatement, pp, as)).statusCode).toBe(404);
    expect((await call(settle.getConsignorPayoutStatementPdf, pp, as)).statusCode).toBe(404);
    expect((await call(settle.getConsignorPayoutEvents, pp, as)).statusCode).toBe(404);
    expect(fake.store.consignorPayout.find((p: any) => p.id === pid).status).toBe('PENDING');
    expect(mStatement).not.toHaveBeenCalled();
    expect(mRecorded).not.toHaveBeenCalled();
  });

  it('create and preview 404 for another organizer\'s sale or another workspace\'s consignor', async () => {
    const other = fake.seedWorkspace({ userId: 'user_2' });
    const foreignSale = fake.seedSale(other.organizerId, 'Not yours');
    const foreignConsignor = fake.seedConsignor(other.workspaceId, {});
    expect((await call(settle.createConsignorSettlementBatch, { body: { saleId: foreignSale.id } })).statusCode).toBe(404);
    expect((await call(settle.createConsignorSettlementBatch, { body: { consignorIds: [foreignConsignor.id] } })).statusCode).toBe(404);
    expect((await call(settle.previewConsignorSettlement, { params: { saleId: foreignSale.id } })).statusCode).toBe(404);
    expect((await call(settle.previewConsignorSettlement, { query: { consignorId: foreignConsignor.id } })).statusCode).toBe(404);
    expect(fake.store.consignorSettlementBatch).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('preview, create, get, refresh, cancel', () => {
  it('preview requires a scope, validates asOf, and returns the ledger with totals', async () => {
    expect((await call(settle.previewConsignorSettlement, {})).body.code).toBe('SCOPE_REQUIRED');
    expect((await call(settle.previewConsignorSettlement, { params: { saleId: sale.id }, query: { asOf: 'garbage' } })).body.code).toBe('INVALID_AS_OF');
    const c = fake.seedConsignor(ws.workspaceId, {});
    fake.seedItem(c.id, { price: 20, saleId: sale.id });
    fake.seedItem(c.id, { price: 30, saleId: sale.id });
    const res = await call(settle.previewConsignorSettlement, { params: { saleId: sale.id } });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ mode: 'ORGANIZER_SETTLES', saleId: sale.id, saleTitle: 'Spring Sale', totals: { consignorCount: 1, itemCount: 2, gross: '50.00', consignorShare: '25.00' } });
    expect(res.body.unsettled).toHaveLength(1);
    expect(Array.isArray(res.body.priorRuns)).toBe(true);
    expect(fake.store.consignorSettlementBatch).toHaveLength(0); // preview persists nothing
  });

  it('create returns 201 with the serialized DRAFT batch, per-item lines and an excluded list', async () => {
    const c = fake.seedConsignor(ws.workspaceId, { name: 'Pat' });
    fake.seedItem(c.id, { price: 20, saleId: sale.id });
    const refunded = fake.seedItem(c.id, { price: 40, saleId: sale.id });
    fake.seedPurchase(refunded.id, { status: 'REFUNDED' });
    const res = await call(settle.createConsignorSettlementBatch, { body: { saleId: sale.id } });
    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({ status: 'DRAFT', runNumber: 1 });
    expect(res.body.payouts).toHaveLength(1);
    expect(res.body.payouts[0].items).toHaveLength(1);
    expect(res.body.excluded).toHaveLength(1);
    expect(res.body.excluded[0].reason).toBe('REFUNDED');
    expect(mStatement).not.toHaveBeenCalled(); // creating a run never emails
  });

  it('create validates its body and answers 400 NOTHING_TO_SETTLE when nothing is owed', async () => {
    expect((await call(settle.createConsignorSettlementBatch, { body: { saleId: 5 } })).body.code).toBe('INVALID_SALE_ID');
    expect((await call(settle.createConsignorSettlementBatch, { body: { consignorIds: 'nope' } })).body.code).toBe('INVALID_CONSIGNOR_IDS');
    expect((await call(settle.createConsignorSettlementBatch, { body: { consignorIds: [1] } })).body.code).toBe('INVALID_CONSIGNOR_IDS');
    expect((await call(settle.createConsignorSettlementBatch, { body: { asOf: 'nope' } })).body.code).toBe('INVALID_AS_OF');
    const res = await call(settle.createConsignorSettlementBatch, { body: { saleId: sale.id } });
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('NOTHING_TO_SETTLE');
    expect(Array.isArray(res.body.excluded)).toBe(true);
  });

  it('a second create over items already in a live run creates nothing (400 NOTHING_TO_SETTLE); a concurrent race is 409 ALREADY_SETTLED with the batch id', async () => {
    const { batch } = await seedRun();
    const res = await call(settle.createConsignorSettlementBatch, { body: { saleId: sale.id } });
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('NOTHING_TO_SETTLE');
    expect(fake.store.consignorSettlementBatch).toHaveLength(1);

    // race: two creates over fresh items at the same moment
    const c = fake.seedConsignor(ws.workspaceId, { name: 'Racer' });
    fake.seedItem(c.id, { price: 20, saleId: sale.id });
    const [r1, r2] = await Promise.all([
      call(settle.createConsignorSettlementBatch, { body: { saleId: sale.id } }),
      call(settle.createConsignorSettlementBatch, { body: { saleId: sale.id } }),
    ]);
    const statuses = [r1.statusCode, r2.statusCode].sort();
    expect(statuses[0]).toBe(201);
    expect([400, 409]).toContain(statuses[1]);
    const loser = r1.statusCode === 201 ? r2 : r1;
    expect(['NOTHING_TO_SETTLE', 'ALREADY_SETTLED']).toContain(loser.body.code);
    expect(fake.store.consignorSettlementBatch).toHaveLength(2); // first run + exactly one new run
    expect(batch.id).toBeTruthy();
  });

  it('get returns payoutsByConsignorId and per-item lines', async () => {
    const { batch, consignors } = await seedRun(2);
    const res = await call(settle.getConsignorSettlementBatch, { params: { batchId: batch.id } });
    expect(res.statusCode).toBe(200);
    expect(Object.keys(res.body.payoutsByConsignorId).sort()).toEqual(consignors.map((c: any) => c.id).sort());
    expect(res.body.payouts.every((p: any) => p.items.length === 2 && p.consignorId)).toBe(true);
  });

  it('refresh returns the batch plus a diff, and is blocked once approved', async () => {
    const { batch, consignors } = await seedRun();
    fake.seedItem(consignors[0].id, { price: 10, saleId: sale.id });
    const res = await call(settle.refreshConsignorSettlementBatch, { params: { batchId: batch.id } });
    expect(res.statusCode).toBe(200);
    expect(res.body.diff).toBeDefined();
    expect(res.body.payouts[0].items).toHaveLength(3);
    await call(settle.approveConsignorSettlementBatch, { params: { batchId: batch.id }, body: {} });
    const blocked = await call(settle.refreshConsignorSettlementBatch, { params: { batchId: batch.id } });
    expect(blocked.statusCode).toBe(409);
  });

  it('cancel needs a reason, blocks when a payout is paid, and otherwise frees the items', async () => {
    const { batch } = await seedApprovedRun();
    expect((await call(settle.cancelConsignorSettlementBatch, { params: { batchId: batch.id }, body: {} })).body.code).toBe('REASON_REQUIRED');
    const ok = await call(settle.cancelConsignorSettlementBatch, { params: { batchId: batch.id }, body: { reason: 'Redo it' } });
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toMatchObject({ status: 'CANCELLED', noop: false });
    expect((await call(settle.cancelConsignorSettlementBatch, { params: { batchId: batch.id }, body: { reason: 'Redo it' } })).body.noop).toBe(true);
    expect((await ledger.loadUnsettled(db, { workspaceId: ws.workspaceId })).consignors).toHaveLength(1);
  });

  it('cancel of a run with a paid payout is a 409 HAS_PAID_PAYOUTS', async () => {
    const { batch } = await seedApprovedRun();
    const pid = payoutsOf(batch.id)[0].id;
    await call(settle.markConsignorPayoutPaid, { params: { id: pid }, body: { method: 'CASH', paidAt: paidAtIso() } });
    const res = await call(settle.cancelConsignorSettlementBatch, { params: { batchId: batch.id }, body: { reason: 'Oops' } });
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('HAS_PAID_PAYOUTS');
  });

  it('annual summary validates the year', async () => {
    expect((await call(settle.getConsignorAnnualSummary, { query: { year: 'abc' } })).body.code).toBe('INVALID_YEAR');
    expect((await call(settle.getConsignorAnnualSummary, { query: { year: '1999' } })).statusCode).toBe(400);
    const ok = await call(settle.getConsignorAnnualSummary, { query: { year: '2026' } });
    expect(ok.statusCode).toBe(200);
    expect(ok.body.year).toBe(2026);
  });

  it('sales summary returns a bare array', async () => {
    const c = fake.seedConsignor(ws.workspaceId, {});
    fake.seedItem(c.id, { price: 20, saleId: sale.id });
    const res = await call(settle.getConsignorSalesSummary, {});
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toMatchObject({ saleId: sale.id, unsettledCount: 1, unsettledAmount: '10.00', heldCount: 0 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('approve never moves money and emails only on opt-in', () => {
  it('approve without sendStatements: APPROVED, no email of any kind, no Stripe transfer', async () => {
    const { batch } = await seedRun(2);
    const res = await call(settle.approveConsignorSettlementBatch, { params: { batchId: batch.id }, body: {} });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ status: 'APPROVED', noop: false, statements: [] });
    expect(mAch).not.toHaveBeenCalled();
    expect(mLegacyEmail).not.toHaveBeenCalled();
    expect(mStatement).not.toHaveBeenCalled();
    expect(mRecorded).not.toHaveBeenCalled();
    expect(payoutsOf(batch.id).every((p: any) => p.status === 'PENDING' && !p.statementSentAt)).toBe(true);
  });

  it('a truthy string is not an opt-in: only the boolean true sends statements', async () => {
    const { batch } = await seedRun();
    await call(settle.approveConsignorSettlementBatch, { params: { batchId: batch.id }, body: { sendStatements: 'true' } });
    expect(mStatement).not.toHaveBeenCalled();
  });

  it('approve is idempotent: a second approve is a noop', async () => {
    const { batch } = await seedRun();
    await call(settle.approveConsignorSettlementBatch, { params: { batchId: batch.id }, body: {} });
    const again = await call(settle.approveConsignorSettlementBatch, { params: { batchId: batch.id }, body: {} });
    expect(again.statusCode).toBe(200);
    expect(again.body.noop).toBe(true);
    expect(fake.store.consignorPayoutEvent.filter((e: any) => e.type === 'APPROVED')).toHaveLength(payoutsOf(batch.id).length);
  });

  it('with sendStatements: statementSentAt is stamped only where the email went out, and retries skip sent ones', async () => {
    mStatement.mockImplementation(async ({ toEmail }: any) => (toEmail === 'c1@example.com' ? { sent: true } : { sent: false, reason: 'SUPPRESSED' }));
    const { batch, consignors } = await seedRun(2);
    const res = await call(settle.approveConsignorSettlementBatch, { params: { batchId: batch.id }, body: { sendStatements: true } });
    expect(res.statusCode).toBe(200);
    expect(mStatement).toHaveBeenCalledTimes(2);
    expect(res.body.statements).toHaveLength(2);
    const byId = new Map(res.body.statements.map((s: any) => [s.consignorId, s]));
    expect(byId.get(consignors[0].id)).toMatchObject({ sent: true });
    expect(byId.get(consignors[1].id)).toMatchObject({ sent: false, reason: 'SUPPRESSED' });

    const p1 = payoutsOf(batch.id).find((p: any) => p.consignorId === consignors[0].id);
    const p2 = payoutsOf(batch.id).find((p: any) => p.consignorId === consignors[1].id);
    expect(p1.statementSentAt).toBeInstanceOf(Date);
    expect(p1.statementSentTo).toBe('c1@example.com');
    expect(p2.statementSentAt ?? null).toBeNull();
    expect(eventsOf(p1.id, 'STATEMENT_SENT')).toHaveLength(1);
    expect(eventsOf(p2.id, 'STATEMENT_SENT')).toHaveLength(0);

    await call(settle.approveConsignorSettlementBatch, { params: { batchId: batch.id }, body: { sendStatements: true } });
    expect(mStatement).toHaveBeenCalledTimes(3); // only consignor 2 was retried
    expect(eventsOf(p1.id, 'STATEMENT_SENT')).toHaveLength(1);
  });

  it('the legacy Stripe approve is not reachable through any exported route handler', async () => {
    const { batch } = await seedRun();
    await call(settle.approveConsignorSettlementBatch, { params: { batchId: batch.id }, body: { sendStatements: true } });
    expect(mAch).not.toHaveBeenCalled();
    expect(typeof settle.legacyStripeApproveConsignorSettlementBatch).toBe('function'); // kept, not removed
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('mark-paid, undo, hold, release, void handlers', () => {
  it('mark-paid: 200 with { payout, noop, notification } and no email unless notifyConsignor is true', async () => {
    const { batch } = await seedApprovedRun();
    const pid = payoutsOf(batch.id)[0].id;
    const res = await call(settle.markConsignorPayoutPaid, { params: { id: pid }, body: { method: 'CHECK', paidAt: paidAtIso(), reference: '1042' } });
    expect(res.statusCode).toBe(200);
    expect(res.body.noop).toBe(false);
    expect(res.body.notification).toEqual({ requested: false });
    expect(res.body.payout).toMatchObject({ id: pid, status: 'PAID', method: 'CHECK', paidReference: '1042', netPayout: '25.00', paidAmount: '25.00' });
    expect(mRecorded).not.toHaveBeenCalled();
    expect(mAch).not.toHaveBeenCalled();
  });

  it('mark-paid with notifyConsignor true sends one payment-recorded email with the real period and amount', async () => {
    const { batch } = await seedApprovedRun();
    const pid = payoutsOf(batch.id)[0].id;
    const res = await call(settle.markConsignorPayoutPaid, { params: { id: pid }, body: { method: 'CASH', paidAt: paidAtIso(), notifyConsignor: true } });
    expect(res.body.notification).toEqual({ requested: true, sent: true });
    expect(mRecorded).toHaveBeenCalledTimes(1);
    expect(mRecorded.mock.calls[0][0]).toMatchObject({
      consignorEmail: 'c1@example.com',
      organizerName: 'Maple Estate Co',
      periodLabel: 'Spring Sale',
      amount: '25.00',
      method: 'CASH',
      methodLabel: 'Cash',
      reference: pid.slice(-8).toUpperCase(),
    });
    expect(mLegacyEmail).not.toHaveBeenCalled();
  });

  it('an idempotent retry does not email again', async () => {
    const { batch } = await seedApprovedRun();
    const pid = payoutsOf(batch.id)[0].id;
    const body = { method: 'CASH', paidAt: paidAtIso(), notifyConsignor: true };
    await call(settle.markConsignorPayoutPaid, { params: { id: pid }, body });
    const again = await call(settle.markConsignorPayoutPaid, { params: { id: pid }, body });
    expect(again.statusCode).toBe(200);
    expect(again.body.noop).toBe(true);
    expect(mRecorded).toHaveBeenCalledTimes(1);
  });

  it('a failing or refused email never fails the recorded payment', async () => {
    const { batch } = await seedApprovedRun(2);
    const [a, b] = payoutsOf(batch.id);
    mRecorded.mockRejectedValueOnce(new Error('resend down'));
    const r1 = await call(settle.markConsignorPayoutPaid, { params: { id: a.id }, body: { method: 'CASH', paidAt: paidAtIso(), notifyConsignor: true } });
    expect(r1.statusCode).toBe(200);
    expect(r1.body.notification).toEqual({ requested: true, sent: false, reason: 'ERROR' });
    expect(r1.body.payout.status).toBe('PAID');
    mRecorded.mockResolvedValueOnce({ sent: false, reason: 'SUPPRESSED' });
    const r2 = await call(settle.markConsignorPayoutPaid, { params: { id: b.id }, body: { method: 'CASH', paidAt: paidAtIso(), notifyConsignor: true } });
    expect(r2.body.notification).toEqual({ requested: true, sent: false, reason: 'SUPPRESSED' });
    expect(r2.body.payout.status).toBe('PAID');
  });

  it('mark-paid validation errors are 400 with a code; a different retry body is 409; DRAFT is 409', async () => {
    const draft = await seedRun();
    const dPid = payoutsOf(draft.batch.id)[0].id;
    expect((await call(settle.markConsignorPayoutPaid, { params: { id: dPid }, body: { method: 'CASH' } })).body.code).toBe('BATCH_NOT_APPROVED');
    await ledger.approveRun(db, { workspaceId: ws.workspaceId, batchId: draft.batch.id, actorUserId: ws.userId });
    const bad = await call(settle.markConsignorPayoutPaid, { params: { id: dPid }, body: { method: 'VENMO' } });
    expect(bad.statusCode).toBe(400);
    expect(bad.body.code).toBe('INVALID_METHOD');
    expect((await call(settle.markConsignorPayoutPaid, { params: { id: dPid }, body: { method: 'CASH', amount: 5 } })).body.code).toBe('AMOUNT_MISMATCH');
    expect((await call(settle.markConsignorPayoutPaid, { params: { id: dPid }, body: { method: 'CHECK', reference: '123456789012' } })).body.code).toBe('REFERENCE_LOOKS_SENSITIVE');
    await call(settle.markConsignorPayoutPaid, { params: { id: dPid }, body: { method: 'CASH', paidAt: '2026-09-01T00:00:00Z' } });
    const diff = await call(settle.markConsignorPayoutPaid, { params: { id: dPid }, body: { method: 'CHECK', paidAt: '2026-09-01T00:00:00Z', reference: '9' } });
    expect(diff.statusCode).toBe(409);
    expect(diff.body.code).toBe('ALREADY_PAID');
  });

  it('undo-paid, hold and void require a reason; release does not', async () => {
    const { batch } = await seedApprovedRun();
    const pid = payoutsOf(batch.id)[0].id;
    expect((await call(settle.holdConsignorPayout, { params: { id: pid }, body: {} })).body.code).toBe('REASON_REQUIRED');
    expect((await call(settle.undoConsignorPayoutPaid, { params: { id: pid }, body: { reason: '  ' } })).body.code).toBe('REASON_REQUIRED');
    expect((await call(settle.voidConsignorPayout, { params: { id: pid }, body: {} })).body.code).toBe('REASON_REQUIRED');
    const held = await call(settle.holdConsignorPayout, { params: { id: pid }, body: { reason: 'Waiting on W-9' } });
    expect(held.body.payout).toMatchObject({ status: 'ON_HOLD', holdReason: 'Waiting on W-9' });
    const rel = await call(settle.releaseConsignorPayout, { params: { id: pid } });
    expect(rel.body.payout.status).toBe('PENDING');
  });

  it('undo-paid returns the payout to PENDING; void frees the items', async () => {
    const { batch } = await seedApprovedRun(2);
    const [a, b] = payoutsOf(batch.id);
    await call(settle.markConsignorPayoutPaid, { params: { id: a.id }, body: { method: 'CASH', paidAt: paidAtIso() } });
    const undone = await call(settle.undoConsignorPayoutPaid, { params: { id: a.id }, body: { reason: 'Wrong person' } });
    expect(undone.body.payout).toMatchObject({ status: 'PENDING', paidAmount: null });
    const voided = await call(settle.voidConsignorPayout, { params: { id: b.id }, body: { reason: 'Dropped' } });
    expect(voided.body.payout).toMatchObject({ status: 'VOID', voidReason: 'Dropped' });
    expect((await ledger.loadUnsettled(db, { workspaceId: ws.workspaceId })).consignors).toHaveLength(1);
  });

  it('events route returns the audit trail, and the statement route returns the statement JSON', async () => {
    const { batch } = await seedApprovedRun();
    const pid = payoutsOf(batch.id)[0].id;
    await call(settle.holdConsignorPayout, { params: { id: pid }, body: { reason: 'x' } });
    const ev = await call(settle.getConsignorPayoutEvents, { params: { id: pid } });
    expect(ev.statusCode).toBe(200);
    expect(ev.body.events.map((e: any) => e.type)).toContain('HELD');
    const st = await call(settle.getConsignorPayoutStatement, { params: { id: pid } });
    expect(st.statusCode).toBe(200);
    expect(st.body).toMatchObject({ reference: pid.slice(-8).toUpperCase(), periodLabel: 'Spring Sale', footer: ledger.STATEMENT_FOOTER });
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('send-statement handler', () => {
  it('refuses a DRAFT run and a voided payout', async () => {
    const draft = await seedRun();
    const dPid = payoutsOf(draft.batch.id)[0].id;
    const r1 = await call(settle.sendConsignorPayoutStatement, { params: { id: dPid } });
    expect(r1.statusCode).toBe(409);
    expect(r1.body.code).toBe('BATCH_NOT_APPROVED');
    await ledger.approveRun(db, { workspaceId: ws.workspaceId, batchId: draft.batch.id, actorUserId: ws.userId });
    await ledger.voidPayout(db, { workspaceId: ws.workspaceId, payoutId: dPid, actorUserId: ws.userId, reason: 'x' });
    const r2 = await call(settle.sendConsignorPayoutStatement, { params: { id: dPid } });
    expect(r2.statusCode).toBe(409);
    expect(r2.body.code).toBe('INVALID_STATE');
    expect(mStatement).not.toHaveBeenCalled();
  });

  it('200 with statementSentAt and statementSentTo when the email went out, and an audit event', async () => {
    const { batch } = await seedApprovedRun();
    const pid = payoutsOf(batch.id)[0].id;
    const res = await call(settle.sendConsignorPayoutStatement, { params: { id: pid } });
    expect(res.statusCode).toBe(200);
    expect(res.body.sent).toBe(true);
    expect(res.body.statementSentTo).toBe('c1@example.com');
    expect(typeof res.body.statementSentAt).toBe('string');
    expect(eventsOf(pid, 'STATEMENT_SENT')).toHaveLength(1);
  });

  it.each([
    ['NO_EMAIL', 422],
    ['SUPPRESSED', 422],
    ['BLOCKED_DOMAIN', 422],
    ['ERROR', 502],
  ])('%s maps to HTTP %i, reports { sent:false, reason } and never stamps statementSentAt', async (reason, status) => {
    mStatement.mockResolvedValue({ sent: false, reason });
    const { batch } = await seedApprovedRun();
    const pid = payoutsOf(batch.id)[0].id;
    const res = await call(settle.sendConsignorPayoutStatement, { params: { id: pid } });
    expect(res.statusCode).toBe(status);
    expect(res.body).toEqual({ sent: false, reason });
    expect(fake.store.consignorPayout.find((p: any) => p.id === pid).statementSentAt ?? null).toBeNull();
    expect(eventsOf(pid, 'STATEMENT_SENT')).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('csv and pdf exports', () => {
  it('csv: text/csv attachment with a BOM, header row and the run number in the file name', async () => {
    const { batch } = await seedApprovedRun();
    const res = await call(settle.exportConsignorSettlementCsv, { params: { batchId: batch.id } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['Content-Disposition']).toContain('consignor-settlement-run-1.csv');
    expect(String(res.sent).charCodeAt(0)).toBe(0xfeff);
    expect(String(res.sent)).toContain(ledger.CSV_HEADERS.join(','));
    expect(String(res.sent)).toContain('Lamp 1');
  });

  it('pdf: returns application/pdf bytes, or the JSON statement with a fallback header when pdfkit is unavailable', async () => {
    const { batch } = await seedApprovedRun();
    const pid = payoutsOf(batch.id)[0].id;
    const res = await call(settle.getConsignorPayoutStatementPdf, { params: { id: pid } });
    expect(res.statusCode).toBe(200);
    if (res.headers['X-Statement-Format'] === 'json-fallback') {
      expect(res.body.reference).toBe(pid.slice(-8).toUpperCase());
    } else {
      expect(res.headers['Content-Type']).toBe('application/pdf');
      expect(res.headers['Content-Disposition']).toContain(`statement-${pid.slice(-8).toUpperCase()}.pdf`);
      expect(Buffer.isBuffer(res.sent)).toBe(true);
      expect((res.sent as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('runPayout (POST /api/consignors/:id/payout) through the ledger', () => {
  const seedOwed = (over: any = {}) => {
    const c = fake.seedConsignor(ws.workspaceId, { name: 'Pat Maker', email: 'pat@example.com', ...over });
    fake.seedItem(c.id, { price: 20, saleId: sale.id });
    fake.seedItem(c.id, { price: 30, saleId: sale.id });
    return c;
  };
  const pay = (id: string, body: any, userId: string | null = ws.userId) => call(consignorCtl.runPayout, { params: { id }, body }, userId);

  it('records a paid payout with lines: 201, ledger shape, notification.requested false, no email, no Stripe', async () => {
    const c = seedOwed();
    const res = await pay(c.id, { method: 'CASH', paidAt: paidAtIso() });
    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({ status: 'PAID', method: 'CASH', netPayout: '25.00', paidAmount: '25.00', consignorId: c.id, itemCount: 2 });
    expect(res.body.notification).toEqual({ requested: false });
    expect(Array.isArray(res.body.excluded)).toBe(true);
    expect(mRecorded).not.toHaveBeenCalled();
    expect(mLegacyEmail).not.toHaveBeenCalled();
    expect(mAch).not.toHaveBeenCalled();
    expect(fake.store.consignorPayoutItem).toHaveLength(2);
  });

  it('maps the legacy VENMO method onto OTHER with a note, and ACH onto BANK_TRANSFER', async () => {
    const a = seedOwed();
    const r1 = await pay(a.id, { method: 'VENMO', notes: 'thanks', paidAt: paidAtIso() });
    expect(r1.statusCode).toBe(201);
    expect(r1.body.method).toBe('OTHER');
    expect(r1.body.notes).toContain('Paid via Venmo');
    expect(r1.body.notes).toContain('thanks');
    const b = seedOwed({ name: 'Bo', email: 'bo@example.com' });
    const r2 = await pay(b.id, { method: 'ACH', paidAt: paidAtIso() });
    expect(r2.body.method).toBe('BANK_TRANSFER');
  });

  it('a second call for the same consignor is a 409 NOTHING_OWED (never a second payout)', async () => {
    const c = seedOwed();
    await pay(c.id, { method: 'CASH' });
    const again = await pay(c.id, { method: 'CASH' });
    expect(again.statusCode).toBe(409);
    expect(again.body.code).toBe('NOTHING_OWED');
    expect(fake.store.consignorPayout).toHaveLength(1);
  });

  it('items already in a draft run cannot be paid directly', async () => {
    const { consignors } = await seedRun();
    const res = await pay(consignors[0].id, { method: 'CASH' });
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('NOTHING_OWED');
  });

  it('emails only when notifyConsignor is true, with the real sale name and a "recorded" email, never the legacy payout email', async () => {
    const c = seedOwed();
    const res = await pay(c.id, { method: 'CHECK', reference: '1042', saleId: sale.id, notifyConsignor: true, paidAt: paidAtIso() });
    expect(res.statusCode).toBe(201);
    expect(res.body.notification).toEqual({ requested: true, sent: true });
    expect(mRecorded).toHaveBeenCalledTimes(1);
    const arg = mRecorded.mock.calls[0][0];
    expect(arg).toMatchObject({ consignorEmail: 'pat@example.com', organizerName: 'Maple Estate Co', periodLabel: 'Spring Sale', amount: '25.00', method: 'CHECK', methodLabel: 'Check', paymentReference: '1042' });
    expect(JSON.stringify(arg)).not.toMatch(/Payout received/i);
    expect(mLegacyEmail).not.toHaveBeenCalled();
  });

  it('a failed email still returns 201 with notification.sent false', async () => {
    const c = seedOwed();
    mRecorded.mockRejectedValueOnce(new Error('boom'));
    const res = await pay(c.id, { method: 'CASH', notifyConsignor: true });
    expect(res.statusCode).toBe(201);
    expect(res.body.notification).toEqual({ requested: true, sent: false, reason: 'ERROR' });
  });

  it('validation and access: 400 without method, 400 for an unknown method, 403 non-TEAMS, 404 foreign consignor or sale', async () => {
    const c = seedOwed();
    expect((await pay(c.id, {})).statusCode).toBe(400);
    const bad = await pay(c.id, { method: 'BITCOIN' });
    expect(bad.statusCode).toBe(400);
    expect(bad.body.code).toBe('INVALID_METHOD');
    expect((await pay(c.id, { method: 'CASH', paidAt: 'nope' })).body.code).toBe('INVALID_PAID_AT');

    const free = fake.seedWorkspace({ tier: 'FREE', userId: 'user_free' });
    expect((await pay(c.id, { method: 'CASH' }, free.userId)).statusCode).toBe(403);

    const other = fake.seedWorkspace({ userId: 'user_2' });
    expect((await pay(c.id, { method: 'CASH' }, other.userId)).statusCode).toBe(404);
    const foreignSale = fake.seedSale(other.organizerId, 'Elsewhere');
    expect((await pay(c.id, { method: 'CASH', saleId: foreignSale.id })).statusCode).toBe(404);
    expect((await pay(c.id, { method: 'CASH' }, null)).statusCode).toBe(401);
    expect(fake.store.consignorPayout).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('listConsignors ledger fields', () => {
  it('returns owedAmount, owedItemCount and owedHeldItemCount from the ledger and normalizes legacy payout statuses', async () => {
    const c = fake.seedConsignor(ws.workspaceId, { name: 'Pat' });
    fake.seedItem(c.id, { price: 20, saleId: sale.id });
    fake.seedItem(c.id, { price: 30, saleId: sale.id });
    const refunded = fake.seedItem(c.id, { price: 40, saleId: sale.id });
    fake.seedPurchase(refunded.id, { status: 'REFUNDED' });
    // a second consignor that only has legacy payout rows (no lines)
    const legacy = fake.seedConsignor(ws.workspaceId, { name: 'Legacy Larry' });
    for (const [id, status] of [['old_manual', 'MANUAL_CASH_CHECK'], ['old_done', 'COMPLETED'], ['old_sim', 'SIMULATED']]) {
      fake.store.consignorPayout.push({ id, consignorId: legacy.id, status, totalSales: D(10), commissionAmount: D(5), netPayout: D(5), settlementBatchId: null, createdAt: new Date() });
    }
    const res = await call(consignorCtl.listConsignors, {});
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(2);
    const pat = res.body.find((r: any) => r.id === c.id);
    expect(pat).toMatchObject({ owedAmount: '25.00', owedItemCount: 2, owedHeldItemCount: 1 });
    const row = res.body.find((r: any) => r.id === legacy.id);
    expect(row).toMatchObject({ owedAmount: '0.00', owedItemCount: 0 });
    const status = (id: string) => row.payouts.find((p: any) => p.id === id);
    expect(status('old_manual')).toMatchObject({ status: 'PENDING', rawStatus: 'MANUAL_CASH_CHECK', netPayout: '5' });
    expect(status('old_done')).toMatchObject({ status: 'PAID', rawStatus: 'COMPLETED' });
    expect(status('old_sim')).toMatchObject({ status: 'VOID', rawStatus: 'SIMULATED' });
  });

  it('a consignor with everything settled shows owedAmount 0.00', async () => {
    const { consignors } = await seedApprovedRun();
    const res = await call(consignorCtl.listConsignors, {});
    expect(res.body.find((r: any) => r.id === consignors[0].id)).toMatchObject({ owedAmount: '0.00', owedItemCount: 0, owedHeldItemCount: 0 });
  });

  it('fails open: if the owed calculation throws, the list still loads with null owed fields', async () => {
    fake.seedConsignor(ws.workspaceId, { name: 'Pat' });
    jest.spyOn(ledger, 'getOwedByConsignor').mockRejectedValueOnce(new Error('ledger down'));
    const res = await call(consignorCtl.listConsignors, {});
    expect(res.statusCode).toBe(200);
    expect(res.body[0]).toMatchObject({ owedAmount: null, owedItemCount: null, owedHeldItemCount: null });
  });

  it('is workspace-scoped and TEAMS-gated', async () => {
    const other = fake.seedWorkspace({ userId: 'user_2' });
    const theirs = fake.seedConsignor(other.workspaceId, { name: 'Theirs' });
    fake.seedItem(theirs.id, { price: 100 });
    fake.seedConsignor(ws.workspaceId, { name: 'Mine' });
    const res = await call(consignorCtl.listConsignors, {});
    expect(res.body.map((r: any) => r.name)).toEqual(['Mine']);
    const free = fake.seedWorkspace({ tier: 'FREE', userId: 'user_free' });
    expect((await call(consignorCtl.listConsignors, {}, free.userId)).statusCode).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('getConsignorPortal payout visibility', () => {
  const portal = (token: string | undefined) => call(consignorCtl.getConsignorPortal, { params: token === undefined ? {} : { token } }, null);

  function seedPortalData() {
    const c = fake.seedConsignor(ws.workspaceId, { name: 'Pat', email: 'pat@example.com', portalToken: 'tok_abc' });
    const mkBatch = (id: string, status: string) => {
      fake.store.consignorSettlementBatch.push({ id, workspaceId: ws.workspaceId, saleId: sale.id, status, runNumber: 1 });
      return id;
    };
    const draft = mkBatch('b_draft', 'DRAFT');
    const approved = mkBatch('b_approved', 'APPROVED');
    const partial = mkBatch('b_partial', 'PARTIALLY_PAID');
    let n = 0;
    const mkPayout = (id: string, status: string, batchId: string | null, extra: any = {}) => {
      fake.store.consignorPayout.push({
        id,
        consignorId: c.id,
        settlementBatchId: batchId,
        saleId: sale.id,
        status,
        totalSales: D(50),
        commissionAmount: D(25),
        netPayout: D(25),
        method: null,
        paidAt: null,
        paidReference: null,
        notes: 'internal note',
        holdReason: 'internal hold reason',
        createdAt: new Date(Date.UTC(2026, 8, 1) + ++n * 1000),
        ...extra,
      });
      return id;
    };
    const ids = {
      draft: mkPayout('po_draft', 'PENDING', draft),
      approved: mkPayout('po_approved', 'PENDING', approved),
      partial: mkPayout('po_partial', 'PENDING', partial),
      hold: mkPayout('po_hold', 'ON_HOLD', approved),
      void: mkPayout('po_void', 'VOID', approved),
      sim: mkPayout('po_sim', 'SIMULATED', null),
      paid: mkPayout('po_paid', 'PAID', approved, { method: 'CHECK', paidAt: new Date('2026-09-10T00:00:00Z'), paidReference: '1042' }),
      done: mkPayout('po_done', 'COMPLETED', null, { saleId: null, method: 'VENMO', paidAt: new Date('2026-01-05T00:00:00Z') }),
      manual: mkPayout('po_manual', 'MANUAL_CASH_CHECK', null),
      standalonePending: mkPayout('po_standalone', 'PENDING', null),
    };
    fake.store.consignorPayoutItem.push({
      id: 'line_1',
      payoutId: ids.approved,
      consignorId: c.id,
      itemId: 'item_x',
      titleSnapshot: 'Lamp',
      soldAt: new Date('2026-09-02T00:00:00Z'),
      listPrice: D(20),
      priceBeforeMarkdown: D(30),
      collectedAmount: D(20),
      ratePct: D(50),
      consignorShare: D(10),
      organizerShare: D(10),
      activeItemKey: 'item_x',
    });
    return { c, ids };
  }

  it('shows only APPROVED-run pending payouts and PAID payouts, never draft, hold, void, simulated or standalone-legacy rows', async () => {
    const { ids } = seedPortalData();
    const res = await portal('tok_abc');
    expect(res.statusCode).toBe(200);
    const shown = res.body.payouts.map((p: any) => p.id).sort();
    expect(shown).toEqual([ids.approved, ids.partial, ids.paid, ids.done].sort());
    for (const hidden of [ids.draft, ids.hold, ids.void, ids.sim, ids.manual, ids.standalonePending]) {
      expect(shown).not.toContain(hidden);
    }
  });

  it('labels, statement lines, footer, and no internal fields', async () => {
    const { ids } = seedPortalData();
    const res = await portal('tok_abc');
    const by = (id: string) => res.body.payouts.find((p: any) => p.id === id);
    expect(by(ids.approved)).toMatchObject({ status: 'PENDING', statusLabel: 'Approved, payment pending', periodLabel: 'Spring Sale', netPayout: '25.00', footer: ledger.STATEMENT_FOOTER });
    expect(by(ids.paid)).toMatchObject({ status: 'PAID', statusLabel: 'Paid', method: 'CHECK', paidReference: '1042' });
    expect(by(ids.done)).toMatchObject({ status: 'PAID', periodLabel: 'Consigned items' });
    expect(by(ids.approved).lines).toEqual([
      { title: 'Lamp', soldAt: new Date('2026-09-02T00:00:00Z'), listPrice: '20.00', priceBeforeMarkdown: '30.00', markedDown: true, ratePct: '50.00', consignorShare: '10.00' },
    ]);
    const json = JSON.stringify(res.body);
    for (const secret of ['organizerShare', 'collectedAmount', 'internal note', 'internal hold reason', 'holdReason', 'activeItemKey']) {
      expect(json).not.toContain(secret);
    }
    expect(json).not.toContain('\u2014');
  });

  it('newest payout first, 404 for an unknown token, 400 without one', async () => {
    seedPortalData();
    const res = await portal('tok_abc');
    const times = res.body.payouts.map((p: any) => new Date(p.createdAt).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    expect((await portal('tok_nope')).statusCode).toBe(404);
    expect((await portal(undefined)).statusCode).toBe(400);
  });

  it('a payout returns to hidden the moment the organizer voids it', async () => {
    const { ids } = seedPortalData();
    fake.store.consignorPayout.find((p: any) => p.id === ids.approved).status = 'VOID';
    const res = await portal('tok_abc');
    expect(res.body.payouts.map((p: any) => p.id)).not.toContain(ids.approved);
  });
});
