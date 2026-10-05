/**
 * TCGplayer round trip controller (ADR-137, roadmap #660). Mounted at /api/card-tcgplayer.
 *
 *   GET  /api/card-tcgplayer/:saleId/status            counts and the cards waiting to be sent to TCGplayer
 *   GET  /api/card-tcgplayer/:saleId/register-check    which of these items are also listed on TCGplayer (counter)
 *   POST /api/card-tcgplayer/:saleId/export            builds the TCGplayer upload CSV (JSON with the CSV text)
 *   POST /api/card-tcgplayer/:saleId/export/uploaded   the seller uploaded it: move the baseline
 *   POST /api/card-tcgplayer/:saleId/reconcile/preview multipart: shows what a TCGplayer export would change
 *   POST /api/card-tcgplayer/:saleId/reconcile/apply   multipart: the same file again, applies it
 *
 * Security: login as ORGANIZER; the sale must belong to the caller (the card intake's authorizeSale runs first and
 * answers 403 or 404 before any upload is accepted); the organizer is never read from the request. Both flags must be
 * on (CARD_CATALOG_ENABLED and CARD_TCGPLAYER_SYNC_ENABLED); otherwise the writing routes answer 404 and the two read
 * routes answer { enabled: false }. The upload is spooled to disk by the intake's upload middleware and ALWAYS deleted
 * here in a finally block. No TCGplayer account, login or API is involved: the seller moves files by hand.
 *
 * Handlers are built by createCardTcgplayerHandlers(deps) so tests can inject fakes. The default wiring (shared Prisma
 * client, real stock functions) is assembled in routes/cardTcgplayer.ts, so this file imports no Prisma code.
 */
import { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import { AuthRequest } from '../middleware/auth';
import { EnvLike, getIntakeConfig } from '../services/cardIntake/config';
import { isIntakeFileError } from '../services/cardIntake/parseSpreadsheet';
import { fileErrorToFailure } from '../services/cardIntake/intakeService';
import { API_MESSAGES, NOTES } from '../services/cardTcgplayer/messages';
import { isBulkLotsEnabled } from '../services/bulkLot/bulkLotConfig';
import { REGISTER_CHECK_MAX_ITEMS, isTcgplayerSyncEnabled } from '../services/cardTcgplayer/config';
import { ExportOptions } from '../services/cardTcgplayer/exportBuilder';
import { FirstSyncPolicy, ReconcileOptions } from '../services/cardTcgplayer/reconcileEngine';
import { isSyncFileError, parseTcgplayerFile } from '../services/cardTcgplayer/reconcileFile';
import {
  SyncDb,
  SyncDeps,
  applyReconcile,
  createExport,
  getStatus,
  hasPendingExport,
  markExportUploaded,
  previewReconcile,
  registerCheck,
} from '../services/cardTcgplayer/syncService';

export interface TcgplayerControllerDeps {
  db: SyncDb;
  syncDeps: SyncDeps;
  env: EnvLike;
}

/** The sale scope the card intake's authorizeSale puts on res.locals (cardIntakeController SALE_LOCAL). */
const SALE_LOCAL = 'cardIntakeSale';

interface SaleScope {
  id: string;
  organizerId: string;
}

type Failure = { status: number; code: string; message: string };

function sendFailure(res: Response, f: Failure): Response {
  return res.status(f.status).json({ success: false, error: f.message, code: f.code });
}

async function removeQuietly(filePath: string | undefined): Promise<void> {
  if (!filePath) return;
  try {
    await fs.promises.rm(filePath, { force: true });
  } catch {
    // Best effort: the intake's stale-file sweep removes anything left behind.
  }
}

function asBool(v: unknown): boolean | undefined | 'invalid' {
  if (v === undefined || v === null || v === '') return undefined;
  if (v === true || v === 'true' || v === '1') return true;
  if (v === false || v === 'false' || v === '0') return false;
  return 'invalid';
}

export function parseExportOptions(body: unknown): Partial<ExportOptions> | null {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const out: Partial<ExportOptions> = {};
  const includeNew = asBool(b.includeNew);
  const includePrices = asBool(b.includePrices);
  if (includeNew === 'invalid' || includePrices === 'invalid') return null;
  if (includeNew !== undefined) out.includeNew = includeNew;
  if (includePrices !== undefined) out.includePrices = includePrices;
  if (b.quantityColumn !== undefined && b.quantityColumn !== '') {
    if (b.quantityColumn !== 'ADD' && b.quantityColumn !== 'TOTAL') return null;
    out.quantityColumn = b.quantityColumn;
  }
  return out;
}

export interface ReconcileParams {
  /** undefined when the request did not answer. */
  lastExportUploaded: boolean | undefined;
  firstSync: FirstSyncPolicy;
}

export function parseReconcileParams(body: unknown): ReconcileParams | null {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const uploaded = asBool(b.lastExportUploaded);
  if (uploaded === 'invalid') return null;
  let firstSync: FirstSyncPolicy = 'FLAG_ONLY';
  if (b.firstSync !== undefined && b.firstSync !== '') {
    if (b.firstSync !== 'FLAG_ONLY' && b.firstSync !== 'ADOPT_TCGPLAYER') return null;
    firstSync = b.firstSync;
  }
  return { lastExportUploaded: uploaded, firstSync };
}

export function createCardTcgplayerHandlers(deps: TcgplayerControllerDeps) {
  const running = new Set<string>();

  function enabled(): boolean {
    return isTcgplayerSyncEnabled(deps.env);
  }

  /** For the routes that write or upload: with the flags off nothing is read and nothing is accepted. */
  function requireEnabled(_req: AuthRequest, res: Response, next: NextFunction) {
    if (!enabled()) return sendFailure(res, { status: 404, code: 'FEATURE_DISABLED', message: API_MESSAGES.FEATURE_DISABLED });
    return next();
  }

  function serverError(res: Response, err: unknown, what: string): Response {
    // Log the kind of failure only: never row contents or file text.
    console.error(`[cardTcgplayer] ${what} failed:`, (err as { name?: string })?.name ?? 'Error', (err as { code?: string })?.code ?? '');
    return sendFailure(res, { status: 500, code: 'SERVER_ERROR', message: API_MESSAGES.SERVER_ERROR });
  }

  function scopeOf(res: Response): SaleScope {
    return res.locals[SALE_LOCAL] as SaleScope;
  }

  /** With bulk lots on, every answer says that lots are left out of the TCGplayer round trip (ADR-136 Addendum C). */
  function lotsNote(): { bulkLotsNote?: string } {
    return isBulkLotsEnabled(deps.env) ? { bulkLotsNote: NOTES.BULK_LOTS_IGNORED } : {};
  }

  const status = async (_req: AuthRequest, res: Response) => {
    try {
      if (!enabled()) return res.json({ success: true, data: { enabled: false } });
      const data = await getStatus(deps.db, scopeOf(res).id);
      return res.json({ success: true, data: { enabled: true, ...data, ...lotsNote() } });
    } catch (err) {
      return serverError(res, err, 'status');
    }
  };

  const registerCheckHandler = async (req: AuthRequest, res: Response) => {
    try {
      if (!enabled()) return res.json({ success: true, data: { enabled: false, items: [] } });
      const raw = req.query.itemIds;
      const text = Array.isArray(raw) ? raw.join(',') : typeof raw === 'string' ? raw : '';
      const ids = text.split(',').map((s) => s.trim()).filter(Boolean);
      if (ids.length > REGISTER_CHECK_MAX_ITEMS * 2) return sendFailure(res, { status: 400, code: 'BAD_PARAMS', message: API_MESSAGES.BAD_PARAMS });
      const items = await registerCheck(deps.db, scopeOf(res).id, ids);
      return res.json({ success: true, data: { enabled: true, items } });
    } catch (err) {
      return serverError(res, err, 'register-check');
    }
  };

  const exportHandler = async (req: AuthRequest, res: Response) => {
    try {
      const options = parseExportOptions(req.body);
      if (!options) return sendFailure(res, { status: 400, code: 'BAD_PARAMS', message: API_MESSAGES.BAD_PARAMS });
      const scope = scopeOf(res);
      if (running.has(scope.id)) return sendFailure(res, { status: 409, code: 'ALREADY_RUNNING', message: API_MESSAGES.ALREADY_RUNNING });
      running.add(scope.id);
      try {
        const result = await createExport(deps.db, scope.id, options, deps.syncDeps.now());
        const plan = result.plan;
        return res.json({
          success: true,
          data: {
            fileName: result.fileName,
            rowCount: plan.rows.length,
            csv: plan.rows.length > 0 ? plan.csv : null,
            summary: plan.summary,
            skipped: result.skipped,
            ...lotsNote(),
          },
        });
      } finally {
        running.delete(scope.id);
      }
    } catch (err) {
      return serverError(res, err, 'export');
    }
  };

  const exportUploaded = async (_req: AuthRequest, res: Response) => {
    try {
      const scope = scopeOf(res);
      if (running.has(scope.id)) return sendFailure(res, { status: 409, code: 'ALREADY_RUNNING', message: API_MESSAGES.ALREADY_RUNNING });
      running.add(scope.id);
      try {
        const marked = await markExportUploaded(deps.db, scope.id, deps.syncDeps.now());
        if (marked === 0) return sendFailure(res, { status: 409, code: 'NO_PENDING_EXPORT', message: API_MESSAGES.NO_PENDING_EXPORT });
        return res.json({ success: true, data: { marked } });
      } finally {
        running.delete(scope.id);
      }
    } catch (err) {
      return serverError(res, err, 'export-uploaded');
    }
  };

  /** Shared by preview and apply: file, params, the upload answer rule and parsing. */
  async function prepare(req: AuthRequest, res: Response) {
    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file) {
      sendFailure(res, { status: 400, code: 'NO_FILE', message: API_MESSAGES.NO_FILE });
      return null;
    }
    const params = parseReconcileParams(req.body);
    if (!params) {
      sendFailure(res, { status: 400, code: 'BAD_PARAMS', message: API_MESSAGES.BAD_PARAMS });
      return null;
    }
    const scope = scopeOf(res);
    const waiting = await hasPendingExport(deps.db, scope.id);
    if (waiting && params.lastExportUploaded === undefined) {
      sendFailure(res, { status: 400, code: 'UPLOAD_ANSWER_REQUIRED', message: API_MESSAGES.UPLOAD_ANSWER_REQUIRED });
      return null;
    }
    const opts: ReconcileOptions = { lastExportUploaded: waiting ? params.lastExportUploaded === true : false, firstSync: params.firstSync };
    const parsed = await parseTcgplayerFile(file.path, getIntakeConfig(deps.env).maxRows);
    return { scope, opts, parsed, exportWaiting: waiting };
  }

  function handleFileError(res: Response, err: unknown): Response | null {
    if (isSyncFileError(err)) return sendFailure(res, { status: 400, code: err.code, message: API_MESSAGES.NOT_A_TCGPLAYER_FILE });
    if (isIntakeFileError(err)) {
      const f = fileErrorToFailure(err);
      return sendFailure(res, { status: f.status, code: f.code, message: f.message });
    }
    return null;
  }

  const reconcilePreview = async (req: AuthRequest, res: Response) => {
    const filePath = (req as Request & { file?: Express.Multer.File }).file?.path;
    try {
      const prepared = await prepare(req, res);
      if (!prepared) return undefined;
      const report = await previewReconcile(deps.db, prepared.scope.id, prepared.parsed, prepared.opts);
      return res.json({ success: true, data: { ...report, exportWaiting: prepared.exportWaiting, ...lotsNote() } });
    } catch (err) {
      return handleFileError(res, err) ?? serverError(res, err, 'reconcile-preview');
    } finally {
      await removeQuietly(filePath);
    }
  };

  const reconcileApply = async (req: AuthRequest, res: Response) => {
    const filePath = (req as Request & { file?: Express.Multer.File }).file?.path;
    let locked: string | null = null;
    try {
      const scope = scopeOf(res);
      const prepared = await prepare(req, res);
      if (!prepared) return undefined;
      if (running.has(scope.id)) return sendFailure(res, { status: 409, code: 'ALREADY_RUNNING', message: API_MESSAGES.ALREADY_RUNNING });
      running.add(scope.id);
      locked = scope.id;
      const report = await applyReconcile(deps.db, scope.id, prepared.parsed, prepared.opts, deps.syncDeps);
      return res.json({ success: true, data: { ...report, ...lotsNote() } });
    } catch (err) {
      return handleFileError(res, err) ?? serverError(res, err, 'reconcile-apply');
    } finally {
      if (locked) running.delete(locked);
      await removeQuietly(filePath);
    }
  };

  return { requireEnabled, status, registerCheck: registerCheckHandler, export: exportHandler, exportUploaded, reconcilePreview, reconcileApply };
}
