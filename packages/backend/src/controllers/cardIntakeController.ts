/**
 * Card intake controller (ADR-134 #642, batch B4). Mounted by batch B9 at /api/card-intake.
 *
 *   GET  /api/card-intake/formats           importer list, modes, limits (static, no sale needed)
 *   POST /api/card-intake/:saleId/preview   multipart; nothing is written; JSON { success, data }
 *   POST /api/card-intake/:saleId/confirm   multipart; the same file again; application/x-ndjson progress stream
 *
 * Security: login as ORGANIZER; the sale must belong to the caller (403 for another organizer's sale, 404
 * when it does not exist) BEFORE any upload is accepted; the organizer id written on items comes from the
 * sale row, never from the request; the upload is spooled to a temp file (never held in memory), capped in
 * size, type-checked, and ALWAYS deleted in a finally block (success, failure and cancel).
 *
 * The handlers are built by createCardIntakeHandlers(deps) so tests can inject fakes; the exported
 * handlers are bound to the shared Prisma client, the card catalog and process.env.
 */
import { NextFunction, Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import multer from 'multer';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { loadCatalogState, resolveRefs } from '../services/cardCatalog/cardCatalogLookup';
import { ALLOWED_UPLOAD_EXTENSIONS, ALLOWED_UPLOAD_MIME_TYPES } from '../services/cardIntake/uploadRules';
import { EnvLike, STALE_TEMP_FILE_MS, getIntakeConfig } from '../services/cardIntake/config';
import {
  ApiFailure,
  ConfirmDone,
  IntakeDeps,
  IntakeParams,
  executeConfirm,
  fileErrorToFailure,
  isApiFailure,
  parseIntakeParams,
  prepareConfirm,
  runPreview,
} from '../services/cardIntake/intakeService';
import { isIntakeFileError } from '../services/cardIntake/parseSpreadsheet';
import { API_MESSAGES, FORMAT_HINTS, MODE_LABELS, PRICE_SOURCE_LABELS, SOURCE_FIELD_LABELS } from '../services/cardIntake/messages';
import { IMPORTERS } from '../services/cardIntake/importers';
import { INTAKE_MODES, PRICE_SOURCES, SOURCE_FIELDS } from '../services/cardIntake/types';

export interface IntakeControllerDeps extends IntakeDeps {
  db: IntakeDeps['db'] & { sale: { findUnique(args: any): Promise<any> } };
  /** Directory for upload temp files. */
  tmpDir: string;
}

interface SaleScope {
  id: string;
  organizerId: string;
}

const SALE_LOCAL = 'cardIntakeSale';

class UploadRejected extends Error {
  constructor(readonly status: number, readonly code: keyof typeof API_MESSAGES) {
    super(code);
  }
}

function sendFailure(res: Response, f: ApiFailure): Response {
  return res.status(f.status).json({ success: false, error: f.message, code: f.code, ...(f.extra ?? {}) });
}

function isOrganizer(req: AuthRequest): boolean {
  return !!req.user && (!!req.user.roles?.includes('ORGANIZER') || req.user.role === 'ORGANIZER' || !!req.user.roles?.includes('ADMIN') || req.user.role === 'ADMIN');
}

async function removeQuietly(filePath: string | undefined): Promise<void> {
  if (!filePath) return;
  try {
    await fs.promises.rm(filePath, { force: true });
  } catch {
    // Best effort: the stale-file sweep removes anything left behind.
  }
}

/** Deletes leftover upload files older than an hour (a crash between upload and cleanup). */
export async function sweepStaleTempFiles(dir: string, olderThanMs: number = STALE_TEMP_FILE_MS, now: number = Date.now()): Promise<number> {
  let removed = 0;
  try {
    for (const name of await fs.promises.readdir(dir)) {
      if (!name.endsWith('.upload')) continue;
      const full = path.join(dir, name);
      try {
        const stat = await fs.promises.stat(full);
        if (stat.isFile() && now - stat.mtimeMs > olderThanMs) {
          await fs.promises.rm(full, { force: true });
          removed += 1;
        }
      } catch {
        // ignore a file that vanished
      }
    }
  } catch {
    // directory does not exist yet
  }
  return removed;
}

export function createCardIntakeHandlers(deps: IntakeControllerDeps) {
  /** 403/404 before any upload is accepted. The organizer id comes from the sale row. */
  async function authorizeSale(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!isOrganizer(req)) return sendFailure(res, { ok: false, status: 403, code: 'FORBIDDEN', message: API_MESSAGES.UNAUTHORIZED });
      const saleId = req.params.saleId;
      if (typeof saleId !== 'string' || saleId.length === 0 || saleId.length > 64) {
        return sendFailure(res, { ok: false, status: 404, code: 'SALE_NOT_FOUND', message: API_MESSAGES.SALE_NOT_FOUND });
      }
      const sale = await deps.db.sale.findUnique({
        where: { id: saleId },
        select: { id: true, organizerId: true, organizer: { select: { userId: true } } },
      });
      if (!sale) return sendFailure(res, { ok: false, status: 404, code: 'SALE_NOT_FOUND', message: API_MESSAGES.SALE_NOT_FOUND });
      if (sale.organizer?.userId !== req.user.id) {
        return sendFailure(res, { ok: false, status: 403, code: 'NOT_YOUR_SALE', message: API_MESSAGES.NOT_YOUR_SALE });
      }
      const scope: SaleScope = { id: sale.id, organizerId: sale.organizerId };
      res.locals[SALE_LOCAL] = scope;
      return next();
    } catch (err) {
      return serverError(res, err, 'authorize');
    }
  }

  /** Disk-spooled single-file upload with a size cap and a file type check. Never memory storage. */
  function upload(req: Request, res: Response, next: NextFunction) {
    const cfg = getIntakeConfig(deps.env);
    fs.promises
      .mkdir(deps.tmpDir, { recursive: true })
      .then(() => sweepStaleTempFiles(deps.tmpDir))
      .then(() => {
        const handler = multer({
          storage: multer.diskStorage({
            destination: (_req, _file, cb) => cb(null, deps.tmpDir),
            filename: (_req, _file, cb) => cb(null, `${crypto.randomBytes(16).toString('hex')}.upload`),
          }),
          limits: { fileSize: cfg.maxFileBytes, files: 1, fields: 20, fieldSize: 8 * 1024 * 1024, parts: 30 },
          fileFilter: (_req, file, cb) => {
            const ext = path.extname(file.originalname || '').toLowerCase();
            const mimeOk = ALLOWED_UPLOAD_MIME_TYPES.includes((file.mimetype || '').toLowerCase());
            if (!ALLOWED_UPLOAD_EXTENSIONS.includes(ext) || !mimeOk) {
              cb(new UploadRejected(400, 'UNSUPPORTED_FILE_TYPE'));
              return;
            }
            cb(null, true);
          },
        }).single('file');
        handler(req, res, (err: unknown) => {
          if (!err) return next();
          if (err instanceof UploadRejected) return sendFailure(res, { ok: false, status: err.status, code: err.code, message: API_MESSAGES[err.code] });
          const code = (err as { code?: string })?.code;
          if (code === 'LIMIT_FILE_SIZE') return sendFailure(res, { ok: false, status: 413, code: 'FILE_TOO_LARGE', message: API_MESSAGES.FILE_TOO_LARGE });
          return sendFailure(res, { ok: false, status: 400, code: 'UPLOAD_FAILED', message: API_MESSAGES.UPLOAD_FAILED });
        });
      })
      .catch((err) => serverError(res, err, 'upload'));
  }

  function serverError(res: Response, err: unknown, what: string): Response {
    // Log the kind of failure only: never row contents, tokens or file text.
    console.error(`[cardIntake] ${what} failed:`, (err as { name?: string })?.name ?? 'Error', (err as { code?: string })?.code ?? '');
    return sendFailure(res, { ok: false, status: 500, code: 'SERVER_ERROR', message: API_MESSAGES.SERVER_ERROR });
  }

  const formats = (_req: AuthRequest, res: Response) => {
    const cfg = getIntakeConfig(deps.env);
    return res.json({
      success: true,
      data: {
        importers: IMPORTERS.map((i) => ({ id: i.id, label: i.label, hint: FORMAT_HINTS[i.id] })),
        modes: INTAKE_MODES.map((value) => ({ value, label: MODE_LABELS[value] })),
        priceSources: PRICE_SOURCES.map((value) => ({ value, label: PRICE_SOURCE_LABELS[value] })),
        fields: SOURCE_FIELDS.map((value) => ({ value, label: SOURCE_FIELD_LABELS[value] })),
        limits: { maxRows: cfg.maxRows, maxFileMb: Math.round(cfg.maxFileBytes / (1024 * 1024)) },
      },
    });
  };

  const preview = async (req: AuthRequest, res: Response) => {
    const filePath = (req as Request & { file?: Express.Multer.File }).file?.path;
    try {
      const file = (req as Request & { file?: Express.Multer.File }).file;
      if (!file) return sendFailure(res, { ok: false, status: 400, code: 'NO_FILE', message: API_MESSAGES.NO_FILE });
      const cfg = getIntakeConfig(deps.env);
      const params = parseIntakeParams(req.body ?? {}, 'preview', cfg);
      if (isApiFailure(params)) return sendFailure(res, params);
      const scope = res.locals[SALE_LOCAL] as SaleScope;
      const result = await runPreview(deps, {
        filePath: file.path,
        fileName: typeof file.originalname === 'string' ? file.originalname.slice(0, 200) : null,
        saleId: scope.id,
        organizerId: scope.organizerId,
        params,
      });
      if (isApiFailure(result)) return sendFailure(res, result);
      return res.json({ success: true, data: result.data });
    } catch (err) {
      if (isIntakeFileError(err)) return sendFailure(res, fileErrorToFailure(err));
      return serverError(res, err, 'preview');
    } finally {
      await removeQuietly(filePath);
    }
  };

  const confirm = async (req: AuthRequest, res: Response) => {
    const file = (req as Request & { file?: Express.Multer.File }).file;
    const filePath = file?.path;
    let streaming = false;
    // Node 16+ fires req 'close' when the request body ends, so the disconnect signal is the RESPONSE closing early.
    let cancelled = false;
    res.on('close', () => {
      if (!res.writableFinished) cancelled = true;
    });
    try {
      if (!file) return sendFailure(res, { ok: false, status: 400, code: 'NO_FILE', message: API_MESSAGES.NO_FILE });
      const cfg = getIntakeConfig(deps.env);
      const params: IntakeParams | ApiFailure = parseIntakeParams(req.body ?? {}, 'confirm', cfg);
      if (isApiFailure(params)) return sendFailure(res, params);
      const scope = res.locals[SALE_LOCAL] as SaleScope;
      const prepared = await prepareConfirm(deps, {
        filePath: file.path,
        fileName: typeof file.originalname === 'string' ? file.originalname.slice(0, 200) : null,
        saleId: scope.id,
        organizerId: scope.organizerId,
        params,
      });
      if (isApiFailure(prepared)) return sendFailure(res, prepared);

      streaming = true;
      res.status(200);
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('X-Accel-Buffering', 'no');
      if (typeof res.flushHeaders === 'function') res.flushHeaders();

      const emit = async (event: object): Promise<void> => {
        if (cancelled || res.writableEnded || res.destroyed) return;
        const ok = res.write(`${JSON.stringify(event)}\n`);
        const flush = (res as unknown as { flush?: () => void }).flush;
        if (typeof flush === 'function') flush.call(res);
        if (!ok) {
          await new Promise<void>((resolve) => {
            const done = () => {
              res.off('drain', done);
              res.off('close', done);
              resolve();
            };
            res.once('drain', done);
            res.once('close', done);
          });
        }
      };

      const done: ConfirmDone = await executeConfirm(deps, prepared, { emit, shouldCancel: () => cancelled });
      await emit(done);
      return void res.end();
    } catch (err) {
      if (!streaming) {
        if (isIntakeFileError(err)) return sendFailure(res, fileErrorToFailure(err));
        return serverError(res, err, 'confirm');
      }
      console.error('[cardIntake] confirm failed:', (err as { name?: string })?.name ?? 'Error', (err as { code?: string })?.code ?? '');
      if (!cancelled && !res.writableEnded && !res.destroyed) {
        res.write(`${JSON.stringify({ type: 'fatal', code: 'SERVER_ERROR', message: API_MESSAGES.SERVER_ERROR })}\n`);
        res.end();
      }
      return undefined;
    } finally {
      await removeQuietly(filePath);
    }
  };

  return { authorizeSale, upload, formats, preview, confirm };
}

// ---------------------------------------------------------------------------------------------
// Default wiring (shared Prisma client, card catalog, process.env)
// ---------------------------------------------------------------------------------------------

async function defaultDbSizeBytes(): Promise<number | null> {
  try {
    const rows = (await (prisma as any).$queryRawUnsafe('SELECT pg_database_size(current_database())::float8 AS bytes')) as Array<{ bytes: unknown }>;
    const n = Number(rows?.[0]?.bytes);
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}

/** Built lazily so importing this module does not read the environment. */
let defaultHandlers: ReturnType<typeof createCardIntakeHandlers> | null = null;
function handlers() {
  if (!defaultHandlers) {
    defaultHandlers = createCardIntakeHandlers({
      db: prisma as unknown as IntakeControllerDeps['db'],
      resolve: (refs) => resolveRefs(refs),
      getCatalogState: () => loadCatalogState(),
      getDbSizeBytes: defaultDbSizeBytes,
      get env(): EnvLike {
        return process.env;
      },
      tmpDir: path.join(os.tmpdir(), 'findasale-card-intake'),
    });
  }
  return defaultHandlers;
}

export const cardIntakeHandlers = {
  authorizeSale: (req: AuthRequest, res: Response, next: NextFunction) => handlers().authorizeSale(req, res, next),
  upload: (req: Request, res: Response, next: NextFunction) => handlers().upload(req, res, next),
  formats: (req: AuthRequest, res: Response) => handlers().formats(req, res),
  preview: (req: AuthRequest, res: Response) => handlers().preview(req, res),
  confirm: (req: AuthRequest, res: Response) => handlers().confirm(req, res),
};
