import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { payConsignorViaACH } from '../services/stripeConnectService';
import {
  sendConsignorPayout,
  sendConsignorStatement,
  sendConsignorPaymentRecorded,
  ConsignorEmailResult,
} from '../services/consignorEmailService';
import {
  LedgerError,
  METHOD_LABELS,
  Statement,
  approveRun,
  buildBatchCsv,
  buildStatement,
  cancelRun,
  createSettlementRun,
  getAnnualSummary,
  getPriorRuns,
  getSalesSummary,
  holdPayout,
  listPayoutEvents,
  loadBatchDetail,
  loadPayoutForWorkspace,
  loadUnsettled,
  markPayoutPaid,
  refreshDraftRun,
  releasePayout,
  requireReason,
  serializeBatch,
  serializeExcluded,
  serializePayout,
  serializeUnsettledConsignor,
  undoPayoutPaid,
  validateMarkPaidInput,
  voidPayout,
  writeEvent,
} from '../services/consignorLedgerService';

/**
 * Consignor settlement, organizer-settles model (2026-09-29). Replaces the #239 Phase 1
 * Stripe-simulation flow.
 *
 * FindA.Sale NEVER initiates, holds or routes consignor money. This module is a ledger,
 * statements and payment records: an organizer previews what is owed, creates a settlement run
 * (a DRAFT snapshot), refreshes it while it is a draft, approves it (a checkpoint only, no
 * payment rail is ever called), pays consignors outside FindA.Sale (cash, check, Square, bank
 * transfer, other) and records each payment with "mark paid".
 *
 * Distinct from settlementController.ts (single-client SaleSettlement / ClientPayout). The
 * word "settle" here means the organizer settling up with consignors.
 *
 * Every route: authenticated organizer (requireOrganizer in the router), TEAMS only (403
 * otherwise), owner-only in v1, and every record is reached through the caller's own
 * workspace id, so another workspace's ids are a 404, never a leak. All the ledger rules
 * (unsettled definition, double-pay guard, rounding, state machines) live in
 * services/consignorLedgerService.ts.
 */

type Ctx = { organizer: any; workspace: any; userId: string };

/** Resolve the authenticated organizer + their workspace (owner only, v1). */
async function getOrganizerWorkspace(userId: string): Promise<{ organizer: any; workspace: any } | null> {
  const organizer = await prisma.organizer.findUnique({ where: { userId } });
  if (!organizer) return null;
  const workspace = await prisma.organizerWorkspace.findFirst({
    where: { ownerId: organizer.id },
  });
  return workspace ? { organizer, workspace } : null;
}

/** Auth + organizer + TEAMS gate. Sends the error response itself and returns null on failure. */
async function resolveContext(req: AuthRequest, res: Response): Promise<Ctx | null> {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }
  const result = await getOrganizerWorkspace(req.user.id);
  if (!result) {
    res.status(404).json({ error: 'Organizer profile not found' });
    return null;
  }
  if (result.organizer.subscriptionTier !== 'TEAMS') {
    res.status(403).json({ error: 'TEAMS subscription required' });
    return null;
  }
  return { organizer: result.organizer, workspace: result.workspace, userId: req.user.id };
}

function handleError(res: Response, err: unknown, label: string) {
  if (err instanceof LedgerError) {
    return res.status(err.status).json({ error: err.message, code: err.code, ...err.extra });
  }
  console.error(`[${label}] Error:`, err);
  return res.status(500).json({ error: 'Something went wrong. Please try again.' });
}

function parseAsOf(raw: unknown): Date | null {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'string') throw new LedgerError(400, 'INVALID_AS_OF', 'asOf must be an ISO date string');
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw new LedgerError(400, 'INVALID_AS_OF', 'asOf is not a valid date');
  return d;
}

const truthy = (v: unknown) => v === true || v === 'true' || v === '1';

/**
 * Email one statement and, only if it actually went out, stamp statementSentAt / statementSentTo
 * and write a STATEMENT_SENT event. Exported for tests.
 */
export async function dispatchStatement(
  db: any,
  p: { workspaceId: string; payoutId: string; actorUserId: string | null }
): Promise<ConsignorEmailResult & { statement: Statement }> {
  const statement = await buildStatement(db, { workspaceId: p.workspaceId, payoutId: p.payoutId });
  const result = await sendConsignorStatement({ statement, toEmail: statement.consignor.email });
  if (result.sent) {
    const now = new Date();
    await db.consignorPayout.update({
      where: { id: p.payoutId },
      data: { statementSentAt: now, statementSentTo: statement.consignor.email },
    });
    await writeEvent(db, {
      payoutId: p.payoutId,
      consignorId: statement.consignor.id,
      workspaceId: p.workspaceId,
      type: 'STATEMENT_SENT',
      actorUserId: p.actorUserId,
      reference: statement.reference,
      note: `Statement emailed to ${statement.consignor.email}`,
    });
  }
  return { ...result, statement };
}

// ── Preview ────────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/consignor-settlements/preview/:saleId
 * GET /api/consignor-settlements/preview?consignorId=&asOf=
 * Non-persisted: what is owed right now. Returns { mode, unsettled, priorRuns } plus scope,
 * excluded items and totals.
 */
export const previewConsignorSettlement = async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await resolveContext(req, res);
    if (!ctx) return;
    const { saleId } = req.params;
    const consignorId = typeof req.query.consignorId === 'string' ? req.query.consignorId : undefined;
    const asOf = parseAsOf(req.query.asOf);
    const acknowledgeLegacyOverlap = truthy(req.query.acknowledgeLegacyOverlap);

    let sale: any = null;
    if (saleId) {
      sale = await prisma.sale.findFirst({
        where: { id: saleId, organizerId: ctx.organizer.id },
        select: { id: true, title: true, status: true },
      });
      if (!sale) return res.status(404).json({ error: 'Sale not found' });
    } else if (consignorId) {
      const consignor = await prisma.consignor.findFirst({ where: { id: consignorId, workspaceId: ctx.workspace.id }, select: { id: true } });
      if (!consignor) return res.status(404).json({ error: 'Consignor not found' });
    } else {
      return res.status(400).json({ error: 'A saleId or a consignorId is required', code: 'SCOPE_REQUIRED' });
    }

    const unsettled = await loadUnsettled(prisma, {
      workspaceId: ctx.workspace.id,
      saleId: sale ? sale.id : undefined,
      consignorIds: !saleId && consignorId ? [consignorId] : undefined,
      asOf,
      acknowledgeLegacyOverlap,
    });
    const priorRuns = await getPriorRuns(prisma, {
      workspaceId: ctx.workspace.id,
      saleId: sale ? sale.id : undefined,
      consignorId: !saleId && consignorId ? consignorId : undefined,
    });

    const itemCount = unsettled.consignors.reduce((n, c) => n + c.lines.length, 0);
    const gross = unsettled.consignors.reduce((s, c) => s + Number(c.gross), 0);
    const share = unsettled.consignors.reduce((s, c) => s + Number(c.net), 0);

    return res.status(200).json({
      mode: 'ORGANIZER_SETTLES',
      saleId: sale ? sale.id : null,
      saleTitle: sale ? sale.title : null,
      saleStatus: sale ? sale.status : null,
      consignorId: !saleId && consignorId ? consignorId : null,
      asOf: asOf ? asOf.toISOString() : null,
      unsettled: unsettled.consignors.map(serializeUnsettledConsignor),
      excluded: unsettled.excluded.map(serializeExcluded),
      priorRuns,
      totals: {
        consignorCount: unsettled.consignors.length,
        itemCount,
        gross: gross.toFixed(2),
        consignorShare: share.toFixed(2),
      },
    });
  } catch (err) {
    return handleError(res, err, 'previewConsignorSettlement');
  }
};

/**
 * GET /api/consignor-settlements/sales-summary
 * [{ saleId, saleTitle, unsettledCount, unsettledAmount, heldCount }] for the My Sales card.
 * saleId null = consignment inventory. Returns a bare array.
 */
export const getConsignorSalesSummary = async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await resolveContext(req, res);
    if (!ctx) return;
    return res.status(200).json(await getSalesSummary(prisma, ctx.workspace.id));
  } catch (err) {
    return handleError(res, err, 'getConsignorSalesSummary');
  }
};

// ── Runs ───────────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/consignor-settlements
 * Body: { saleId?, consignorIds?, asOf?, acknowledgeLegacyOverlap? }
 * Creates a DRAFT run (one payout per consignor, one line per item) in one transaction. No money
 * moves. Several runs per sale are allowed (later sold items join a later run); an item can only
 * ever be in one live payout, so a concurrent create returns 409 with the existing batch id.
 */
export const createConsignorSettlementBatch = async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await resolveContext(req, res);
    if (!ctx) return;
    const body = req.body || {};

    if (body.saleId !== undefined && body.saleId !== null && (typeof body.saleId !== 'string' || !body.saleId)) {
      return res.status(400).json({ error: 'saleId must be a sale id', code: 'INVALID_SALE_ID' });
    }
    let consignorIds: string[] | undefined;
    if (body.consignorIds !== undefined && body.consignorIds !== null) {
      if (!Array.isArray(body.consignorIds) || body.consignorIds.length > 500 || body.consignorIds.some((x: unknown) => typeof x !== 'string' || !x)) {
        return res.status(400).json({ error: 'consignorIds must be a list of consignor ids (500 at most)', code: 'INVALID_CONSIGNOR_IDS' });
      }
      consignorIds = Array.from(new Set<string>(body.consignorIds));
    }
    const asOf = parseAsOf(body.asOf);

    if (body.saleId) {
      const sale = await prisma.sale.findFirst({ where: { id: body.saleId, organizerId: ctx.organizer.id }, select: { id: true } });
      if (!sale) return res.status(404).json({ error: 'Sale not found' });
    }
    if (consignorIds && consignorIds.length) {
      const found = await prisma.consignor.findMany({ where: { id: { in: consignorIds }, workspaceId: ctx.workspace.id }, select: { id: true } });
      if (found.length !== consignorIds.length) return res.status(404).json({ error: 'Consignor not found' });
    }

    const { batch, excluded } = await createSettlementRun(prisma, {
      workspaceId: ctx.workspace.id,
      actorUserId: ctx.userId,
      saleId: body.saleId ?? undefined,
      consignorIds,
      asOf,
      acknowledgeLegacyOverlap: body.acknowledgeLegacyOverlap === true,
    });
    return res.status(201).json({ ...serializeBatch(batch), excluded: excluded.map(serializeExcluded) });
  } catch (err) {
    return handleError(res, err, 'createConsignorSettlementBatch');
  }
};

/** GET /api/consignor-settlements/:batchId (payouts include consignorId, per-item lines, payoutsByConsignorId). */
export const getConsignorSettlementBatch = async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await resolveContext(req, res);
    if (!ctx) return;
    const batch = await loadBatchDetail(prisma, ctx.workspace.id, req.params.batchId);
    return res.status(200).json(serializeBatch(batch));
  } catch (err) {
    return handleError(res, err, 'getConsignorSettlementBatch');
  }
};

/** POST /api/consignor-settlements/:batchId/refresh (DRAFT only). Returns the batch plus { diff }. */
export const refreshConsignorSettlementBatch = async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await resolveContext(req, res);
    if (!ctx) return;
    const { batch, diff } = await refreshDraftRun(prisma, {
      workspaceId: ctx.workspace.id,
      batchId: req.params.batchId,
      actorUserId: ctx.userId,
    });
    return res.status(200).json({ ...serializeBatch(batch), diff });
  } catch (err) {
    return handleError(res, err, 'refreshConsignorSettlementBatch');
  }
};

/**
 * POST /api/consignor-settlements/:batchId/approve
 * Body: { sendStatements?: boolean }  (opt-in; statements go only to consignors with an email
 * and only once each per approve retry).
 * DRAFT -> APPROVED. NEVER calls any payment rail and never calls payConsignorViaACH: approval is
 * an organizer checkpoint that unlocks recording payments.
 */
export const approveConsignorSettlementBatch = async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await resolveContext(req, res);
    if (!ctx) return;
    const { batchId } = req.params;
    const sendStatements = req.body?.sendStatements === true;

    const outcome = await approveRun(prisma, { workspaceId: ctx.workspace.id, batchId, actorUserId: ctx.userId });

    const statements: { payoutId: string; consignorId: string; consignorName: string | null; sent: boolean; reason?: string }[] = [];
    if (sendStatements) {
      const detail = await loadBatchDetail(prisma, ctx.workspace.id, batchId);
      for (const payout of detail.payouts) {
        if (payout.status !== 'PENDING' || payout.statementSentAt) continue;
        const r = await dispatchStatement(prisma, { workspaceId: ctx.workspace.id, payoutId: payout.id, actorUserId: ctx.userId });
        statements.push({ payoutId: payout.id, consignorId: payout.consignorId, consignorName: payout.consignor?.name ?? null, sent: r.sent, ...(r.reason ? { reason: r.reason } : {}) });
      }
    }

    const batch = await loadBatchDetail(prisma, ctx.workspace.id, batchId);
    return res.status(200).json({ ...serializeBatch(batch), noop: outcome.noop, statements });
  } catch (err) {
    return handleError(res, err, 'approveConsignorSettlementBatch');
  }
};

/** POST /api/consignor-settlements/:batchId/cancel  Body: { reason }. Blocked if any payout is PAID. */
export const cancelConsignorSettlementBatch = async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await resolveContext(req, res);
    if (!ctx) return;
    const reason = requireReason(req.body?.reason);
    const outcome = await cancelRun(prisma, { workspaceId: ctx.workspace.id, batchId: req.params.batchId, actorUserId: ctx.userId, reason });
    const batch = await loadBatchDetail(prisma, ctx.workspace.id, req.params.batchId);
    return res.status(200).json({ ...serializeBatch(batch), noop: outcome.noop });
  } catch (err) {
    return handleError(res, err, 'cancelConsignorSettlementBatch');
  }
};

// ── Payout actions ─────────────────────────────────────────────────────────────────────────

/**
 * POST /api/consignor-settlements/payouts/:id/mark-paid
 * Body: { method, paidAt, reference?, note?, notifyConsignor? }
 * Records that the organizer paid this payout in full (amount is always the payout total).
 * Idempotent: same body again is a 200 no-op; a different body is a 409.
 */
export const markConsignorPayoutPaid = async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await resolveContext(req, res);
    if (!ctx) return;
    const input = validateMarkPaidInput(req.body || {});
    const outcome = await markPayoutPaid(prisma, {
      workspaceId: ctx.workspace.id,
      payoutId: req.params.id,
      actorUserId: ctx.userId,
      input,
      amount: req.body?.amount,
    });

    let notification: { requested: boolean; sent?: boolean; reason?: string } = { requested: input.notifyConsignor };
    if (input.notifyConsignor && !outcome.noop) {
      try {
        const statement = await buildStatement(prisma, { workspaceId: ctx.workspace.id, payoutId: req.params.id });
        const r = await sendConsignorPaymentRecorded({
          consignorName: statement.consignor.name,
          consignorEmail: statement.consignor.email,
          organizerName: statement.organizerName,
          periodLabel: statement.periodLabel,
          amount: statement.totals.consignorShare ?? '0.00',
          method: input.method,
          methodLabel: METHOD_LABELS[input.method],
          paidAt: input.paidAt,
          reference: statement.reference,
          paymentReference: input.reference,
        });
        notification = { requested: true, sent: r.sent, ...(r.reason ? { reason: r.reason } : {}) };
      } catch (err) {
        console.warn('[markConsignorPayoutPaid] notification failed:', err);
        notification = { requested: true, sent: false, reason: 'ERROR' };
      }
    }
    return res.status(200).json({ payout: serializePayout(outcome.payout), noop: outcome.noop, notification });
  } catch (err) {
    return handleError(res, err, 'markConsignorPayoutPaid');
  }
};

/** POST /api/consignor-settlements/payouts/:id/undo-paid  Body: { reason }. PAID -> PENDING, audited. */
export const undoConsignorPayoutPaid = async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await resolveContext(req, res);
    if (!ctx) return;
    const reason = requireReason(req.body?.reason);
    const out = await undoPayoutPaid(prisma, { workspaceId: ctx.workspace.id, payoutId: req.params.id, actorUserId: ctx.userId, reason });
    return res.status(200).json({ payout: serializePayout(out.payout), noop: out.noop });
  } catch (err) {
    return handleError(res, err, 'undoConsignorPayoutPaid');
  }
};

/** POST /api/consignor-settlements/payouts/:id/hold  Body: { reason }. PENDING -> ON_HOLD. */
export const holdConsignorPayout = async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await resolveContext(req, res);
    if (!ctx) return;
    const reason = requireReason(req.body?.reason);
    const out = await holdPayout(prisma, { workspaceId: ctx.workspace.id, payoutId: req.params.id, actorUserId: ctx.userId, reason });
    return res.status(200).json({ payout: serializePayout(out.payout), noop: out.noop });
  } catch (err) {
    return handleError(res, err, 'holdConsignorPayout');
  }
};

/** POST /api/consignor-settlements/payouts/:id/release. ON_HOLD -> PENDING. */
export const releaseConsignorPayout = async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await resolveContext(req, res);
    if (!ctx) return;
    const out = await releasePayout(prisma, { workspaceId: ctx.workspace.id, payoutId: req.params.id, actorUserId: ctx.userId });
    return res.status(200).json({ payout: serializePayout(out.payout), noop: out.noop });
  } catch (err) {
    return handleError(res, err, 'releaseConsignorPayout');
  }
};

/** POST /api/consignor-settlements/payouts/:id/void  Body: { reason }. Unpaid payout -> VOID, items become unsettled again. */
export const voidConsignorPayout = async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await resolveContext(req, res);
    if (!ctx) return;
    const reason = requireReason(req.body?.reason);
    const out = await voidPayout(prisma, { workspaceId: ctx.workspace.id, payoutId: req.params.id, actorUserId: ctx.userId, reason });
    return res.status(200).json({ payout: serializePayout(out.payout), noop: out.noop });
  } catch (err) {
    return handleError(res, err, 'voidConsignorPayout');
  }
};

/**
 * POST /api/consignor-settlements/payouts/:id/send-statement
 * Emails the statement to the consignor (rate limited to 3 per 24h per payout in the router).
 * 200 { sent: true, statementSentAt, statementSentTo } or 422 { sent: false, reason } where reason
 * is NO_EMAIL | SUPPRESSED | BLOCKED_DOMAIN (ERROR is a 502). Failures do not count toward the limit.
 */
export const sendConsignorPayoutStatement = async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await resolveContext(req, res);
    if (!ctx) return;
    const payout = await loadPayoutForWorkspace(prisma, ctx.workspace.id, req.params.id);
    if (['VOID', 'SIMULATED', 'FAILED'].includes(payout.status)) {
      return res.status(409).json({ error: 'A voided payout has no statement to send.', code: 'INVALID_STATE' });
    }
    if (payout.settlementBatch && payout.settlementBatch.status === 'DRAFT') {
      return res.status(409).json({ error: 'Approve the run before sending statements.', code: 'BATCH_NOT_APPROVED' });
    }
    const r = await dispatchStatement(prisma, { workspaceId: ctx.workspace.id, payoutId: payout.id, actorUserId: ctx.userId });
    if (r.sent) {
      const fresh = await prisma.consignorPayout.findUnique({ where: { id: payout.id }, select: { statementSentAt: true, statementSentTo: true } });
      return res.status(200).json({
        sent: true,
        statementSentAt: fresh?.statementSentAt ? new Date(fresh.statementSentAt).toISOString() : null,
        statementSentTo: fresh?.statementSentTo ?? null,
      });
    }
    return res.status(r.reason === 'ERROR' ? 502 : 422).json({ sent: false, reason: r.reason });
  } catch (err) {
    return handleError(res, err, 'sendConsignorPayoutStatement');
  }
};

/** GET /api/consignor-settlements/payouts/:id/statement (JSON). */
export const getConsignorPayoutStatement = async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await resolveContext(req, res);
    if (!ctx) return;
    const statement = await buildStatement(prisma, { workspaceId: ctx.workspace.id, payoutId: req.params.id });
    return res.status(200).json(statement);
  } catch (err) {
    return handleError(res, err, 'getConsignorPayoutStatement');
  }
};

/** GET /api/consignor-settlements/payouts/:id/events (append-only audit trail, newest first). */
export const getConsignorPayoutEvents = async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await resolveContext(req, res);
    if (!ctx) return;
    const events = await listPayoutEvents(prisma, ctx.workspace.id, req.params.id);
    return res.status(200).json({ events });
  } catch (err) {
    return handleError(res, err, 'getConsignorPayoutEvents');
  }
};

/** Render a statement as a PDF buffer with pdfkit (already a backend dependency, used by brandKitPrintController and donationController). */
export async function renderStatementPdf(st: Statement): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const PDFDocument = require('pdfkit');
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 48 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const usd = (v: string | null) => `$${Number(v ?? 0).toFixed(2)}`;
    const date = (v: string | null) => (v ? new Date(v).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '');
    const cols = { item: 48, sold: 252, price: 322, rate: 424, share: 476 };

    const header = () => {
      doc.font('Helvetica-Bold').fontSize(9);
      const y = doc.y;
      doc.text('Item', cols.item, y, { width: 200 });
      doc.text('Sold', cols.sold, y, { width: 66 });
      doc.text('Price', cols.price, y, { width: 96 });
      doc.text('Rate', cols.rate, y, { width: 48 });
      doc.text('Your share', cols.share, y, { width: 88, align: 'right' });
      doc.moveTo(48, y + 13).lineTo(564, y + 13).strokeColor('#999999').stroke();
      doc.y = y + 18;
    };

    doc.font('Helvetica-Bold').fontSize(18).text(st.organizerName, 48, 48);
    doc.font('Helvetica').fontSize(12).text('Consignment statement');
    doc.moveDown(0.5);
    doc.fontSize(10);
    doc.text(`Consignor: ${st.consignor.name}`);
    doc.text(`Period: ${st.periodLabel}`);
    doc.text(`Reference: ${st.reference}`);
    doc.text(`Status: ${st.statusLabel}`);
    doc.moveDown(1);

    if (st.lines.length) {
      header();
      for (const l of st.lines) {
        if (doc.y > 700) {
          doc.addPage();
          header();
        }
        const y = doc.y;
        doc.font('Helvetica').fontSize(9);
        doc.text(l.title, cols.item, y, { width: 198, height: 12, ellipsis: true });
        doc.text(date(l.soldAt), cols.sold, y, { width: 66 });
        doc.text(l.markedDown && l.priceBeforeMarkdown ? `${usd(l.listPrice)} (was ${usd(l.priceBeforeMarkdown)})` : usd(l.listPrice), cols.price, y, { width: 100 });
        doc.text(`${Number(l.ratePct ?? 0).toFixed(2)}%`, cols.rate, y, { width: 48 });
        doc.text(usd(l.consignorShare), cols.share, y, { width: 88, align: 'right' });
        doc.y = y + 16;
      }
    } else {
      doc.font('Helvetica').fontSize(10).text('This is an earlier record without item detail.');
    }

    if (doc.y > 660) doc.addPage();
    doc.moveDown(1);
    doc.font('Helvetica-Bold').fontSize(10);
    doc.text(`Items: ${st.totals.itemCount}    Total sales: ${usd(st.totals.gross)}`, 48);
    doc.fontSize(13).text(`Your share: ${usd(st.totals.consignorShare)}`, 48);
    doc.moveDown(1);
    doc.font('Helvetica').fontSize(8).fillColor('#555555').text(st.footer, 48, doc.y, { width: 516 });
    doc.end();
  });
}

/**
 * GET /api/consignor-settlements/payouts/:id/statement.pdf
 * If pdfkit cannot be loaded or rendering fails, returns the JSON statement instead (header
 * X-Statement-Format: json-fallback) and the frontend falls back to its print view.
 */
export const getConsignorPayoutStatementPdf = async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await resolveContext(req, res);
    if (!ctx) return;
    const statement = await buildStatement(prisma, { workspaceId: ctx.workspace.id, payoutId: req.params.id });
    let pdf: Buffer;
    try {
      pdf = await renderStatementPdf(statement);
    } catch (pdfErr) {
      console.warn('[getConsignorPayoutStatementPdf] pdfkit unavailable, returning JSON fallback:', pdfErr);
      res.setHeader('X-Statement-Format', 'json-fallback');
      return res.status(200).json(statement);
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="statement-${statement.reference}.pdf"`);
    res.setHeader('Content-Length', String(pdf.length));
    return res.status(200).end(pdf);
  } catch (err) {
    return handleError(res, err, 'getConsignorPayoutStatementPdf');
  }
};

/** GET /api/consignor-settlements/:batchId/export.csv (formula-injection neutralized). */
export const exportConsignorSettlementCsv = async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await resolveContext(req, res);
    if (!ctx) return;
    const batch = await loadBatchDetail(prisma, ctx.workspace.id, req.params.batchId);
    const csv = buildBatchCsv(batch);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="consignor-settlement-run-${Number(batch.runNumber ?? 1)}.csv"`);
    return res.status(200).send('﻿' + csv);
  } catch (err) {
    return handleError(res, err, 'exportConsignorSettlementCsv');
  }
};

/** GET /api/consignor-settlements/annual-summary?year=YYYY (paid payouts by date paid, per consignor). */
export const getConsignorAnnualSummary = async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await resolveContext(req, res);
    if (!ctx) return;
    const currentYear = new Date().getUTCFullYear();
    const raw = req.query.year;
    const year = raw === undefined || raw === '' ? currentYear : Number(raw);
    if (!Number.isInteger(year) || year < 2000 || year > currentYear + 1) {
      return res.status(400).json({ error: 'year must be a four digit year', code: 'INVALID_YEAR' });
    }
    return res.status(200).json(await getAnnualSummary(prisma, ctx.workspace.id, year));
  } catch (err) {
    return handleError(res, err, 'getConsignorAnnualSummary');
  }
};

// ─────────────────────────────────────────────────────────────────────────────────────────
// LEGACY (not routed). Kept in place, never called by the organizer-settles flow.
// ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * Legacy LIVE-TRANSFERS gate. Real money movement only happened when the env flag
 *   STRIPE_CONNECT_LIVE_TRANSFERS === 'true'
 * Stripe is closed and the new flow never reads this flag. Left in place, unused.
 */
export const liveTransfersEnabled = (): boolean =>
  process.env.STRIPE_CONNECT_LIVE_TRANSFERS === 'true';

/**
 * DEPRECATED, NOT ROUTED (2026-09-29). The pre-ledger Stripe approve handler, kept in place per Patrick's
 * BUILD OR WIRE, NEVER STRIP rule. The live approve route now calls approveConsignorSettlementBatch above,
 * which never touches a payment rail. Nothing in the new flow calls this function or payConsignorViaACH.
 * Original description follows.
 *
 * POST /api/consignor-settlements/:batchId/approve (legacy)
 * Transition DRAFT|PARTIAL|PROCESSING -> APPROVED and process per-consignor payouts.
 *
 * - LIVE flag OFF (default): each ACH payout is SIMULATED (no money moves); batch -> COMPLETED.
 * - LIVE flag ON: loop consignors, call payConsignorViaACH per consignor. Per-consignor
 *   failures isolated (that payout -> FAILED + failureReason); already-COMPLETED payouts
 *   are skipped on re-run; manual CASH/CHECK payouts untouched. Batch ends COMPLETED if all
 *   money-moving payouts succeeded, else PARTIAL.
 */
export const legacyStripeApproveConsignorSettlementBatch = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const { batchId } = req.params;

    const result = await getOrganizerWorkspace(req.user.id);
    if (!result) return res.status(404).json({ error: 'Organizer profile not found' });
    const { organizer, workspace } = result;
    if (organizer.subscriptionTier !== 'TEAMS') {
      return res.status(403).json({ error: 'TEAMS subscription required' });
    }

    const batch = await prisma.consignorSettlementBatch.findFirst({
      where: { id: batchId, workspaceId: workspace.id },
      include: { payouts: { include: { consignor: true } } },
    });
    if (!batch) return res.status(404).json({ error: 'Settlement batch not found' });
    if (!['DRAFT', 'APPROVED', 'PARTIAL', 'PROCESSING'].includes(batch.status)) {
      return res
        .status(409)
        .json({ error: `Batch in status ${batch.status} cannot be approved` });
    }

    await prisma.consignorSettlementBatch.update({
      where: { id: batch.id },
      data: { status: 'PROCESSING', approvedAt: batch.approvedAt ?? new Date() },
    });

    const live = liveTransfersEnabled();
    let anyFailure = false;

    for (const payout of batch.payouts) {
      // Atomic claim-before-act (mirrors posStrandedSaleReconcileCron.ts's guarded-flip
      // pattern and vendorBoothCartController.ts's transferHubOwnerShareForLeg claim --
      // confirmed gap, ADR-090 §2): the old code read payout.status and acted on it in a
      // separate step -- a race window a concurrent approve call (double-click, retry)
      // could slip through and double-process the same payout. This conditional
      // updateMany only proceeds if nothing else has already claimed or finished this
      // payout. PROCESSING is a transitional in-flight status (same term already used by
      // ConsignorSettlementBatch.status above) -- every branch below replaces it with a
      // real terminal status (MANUAL_CASH_CHECK / SIMULATED / COMPLETED / FAILED) before
      // this loop iteration ends, so it never becomes a resting state under normal
      // execution.
      const claimed = await prisma.consignorPayout.updateMany({
        where: {
          id: payout.id,
          status: { notIn: ['COMPLETED', 'MANUAL_CASH_CHECK', 'PROCESSING'] },
        },
        data: { status: 'PROCESSING' },
      });
      if (claimed.count === 0) {
        // Already completed, already manual, or claimed by a concurrent approve call
        // for this same payout -- skip, do not double-process.
        continue;
      }

      const consignor = payout.consignor;
      const amountCents = Math.round(Number(payout.netPayout) * 100);

      // Defensive: a payout that lost onboarding becomes a manual flag, not a hard fail.
      if (!consignor.stripeOnboarded || !consignor.stripeAccountId) {
        await prisma.consignorPayout.update({
          where: { id: payout.id },
          data: { status: 'MANUAL_CASH_CHECK', method: null },
        });
        continue;
      }

      if (!live) {
        // TEST MODE: simulate the transfer - record intent, move no money.
        await prisma.consignorPayout.update({
          where: { id: payout.id },
          data: {
            status: 'SIMULATED',
            method: 'ACH',
            notes: payout.notes
              ? `${payout.notes} | simulated (live transfers OFF)`
              : 'Simulated payout (live transfers OFF)',
          },
        });
        continue;
      }

      // LIVE MODE: real Stripe transfer, isolated per consignor.
      try {
        const transfer = await payConsignorViaACH(
          consignor.stripeAccountId,
          amountCents,
          `Settlement ${batch.id} payout for ${consignor.name}`,
          organizer.stripeConnectAccountId || undefined,
          undefined,
          // Stable idempotency key keyed on the payout row itself (not the batch id --
          // a payout can be re-approved individually after a partial prior batch
          // attempt, so the payout is the correct stable unit here): a retry can never
          // create a second real Stripe transfer for this same payout.
          `consignor-payout-${payout.id}`
        );
        await prisma.consignorPayout.update({
          where: { id: payout.id },
          data: {
            status: 'COMPLETED',
            method: 'ACH',
            stripeTransferId: transfer.transferId,
            paidAt: new Date(),
            failureReason: null,
          },
        });

        if (consignor.email) {
          sendConsignorPayout({
            consignorName: consignor.name,
            consignorEmail: consignor.email,
            payoutAmount: Number(payout.netPayout),
            saleName: 'your sale',
            organizerName: workspace.name || 'your organizer',
            method: 'ACH',
          }).catch((err) =>
            console.warn('[consignor-settlement-email] Payout email failed:', err)
          );
        }
      } catch (err: any) {
        anyFailure = true;
        await prisma.consignorPayout.update({
          where: { id: payout.id },
          data: {
            status: 'FAILED',
            failureReason: err?.message?.slice(0, 500) || 'Stripe transfer failed',
          },
        });
      }
    }

    const finalStatus = anyFailure ? 'PARTIAL' : 'COMPLETED';
    const updated = await prisma.consignorSettlementBatch.update({
      where: { id: batch.id },
      data: { status: finalStatus, approvedAt: batch.approvedAt ?? new Date() },
      include: {
        payouts: {
          include: {
            consignor: { select: { name: true, email: true, stripeOnboarded: true } },
          },
        },
      },
    });

    return res.status(200).json({
      ...serializeBatch(updated),
      liveTransfersEnabled: live,
      message: live
        ? anyFailure
          ? 'Settlement processed with some failures. See per-consignor status.'
          : 'Settlement processed. ACH transfers issued.'
        : 'Settlement approved in test mode. Transfers simulated: no money moved (live transfers OFF).',
    });
  } catch (error) {
    console.error('[approveConsignorSettlementBatch] Error:', error);
    return res.status(500).json({ error: 'Failed to approve settlement batch' });
  }
};
