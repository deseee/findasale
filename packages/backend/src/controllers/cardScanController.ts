/**
 * Card scan controller (ADR-138 section 9, batch B5). Mounted by batch B9 at /api/card-scan.
 *
 *   GET    /status                             is scanning usable (always answers, even with the switch off)
 *   POST   /sessions                           start a session
 *   GET    /sessions?saleId=                   resume list
 *   GET    /sessions/:id?afterSeq=&limit=      queue state (polled)
 *   POST   /sessions/:id/frames                one camera or upload frame (multipart field "frame")
 *   POST   /sessions/:id/entries               manual add (catalog pick or typed details)
 *   PATCH  /sessions/:id/entries/:entryId      one organizer decision
 *   POST   /sessions/:id/entries/bulk          the same action for up to 200 entries
 *   POST   /sessions/:id/commit                write the ready entries to stock (JSON answer)
 *   POST   /sessions/:id/discard               throw the queue away
 *
 * This file is thin on purpose: it checks who is calling, parses and validates the input, calls the scan
 * services (sessionService, commitBridge) and sends their answer. Nothing here computes identity, readiness or
 * a dedup key. Every answer uses the envelope { success: true, data } or { success: false, error, code, ...extra }
 * and every user-facing sentence comes from services/cardScan/messages.ts.
 *
 * Security: every handler needs a logged-in organizer with an Organizer row; the organizer id used for reads and
 * writes comes from that row, never from the request; sessions and entries are loaded with that id in the where
 * clause, so another organizer's id is a 404, never a 200. A frame is checked (size, image signature) and is
 * never written to disk or to any file store.
 *
 * Money: one recognized frame is one Smart tag. The tag is reserved and the platform scan cost pool is booked
 * inside the recognizer closure, which ingestFrame calls only after the early duplicate layers found nothing, so a
 * retried or repeated picture costs nothing. The tag is kept when the provider did paid work (a reading, or an
 * answer such as "no card in the picture") and refunded otherwise.
 *
 * The handlers are built by createCardScanHandlers(deps) so tests can inject fakes. The exported
 * cardScanHandlers are bound to the shared Prisma client, the card catalog, the recognition provider and
 * process.env, and every one of those is loaded when a request arrives, never when this file is imported.
 */
import { NextFunction, Request, Response } from 'express';
import crypto from 'crypto';
import multer from 'multer';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth';
import { CARD_GAMES, canonicalizeVocabValue } from '../constants/cardVocabulary';
import type { CardGame } from '../constants/cardVocabulary';
import { getScanConfig } from '../services/cardScan/config';
import type { ScanMode } from '../services/cardScan/config';
import { SCAN_STATUS_MESSAGES } from '../services/cardScan/messages';
import { commitSession } from '../services/cardScan/commitBridge';
import {
  addManualEntry,
  apiFail,
  bulkUpdate,
  createSession,
  discardSession,
  getDefaultScanDeps,
  getSession,
  ingestFrame,
  listSessions,
  loadSession,
  patchEntry,
  safeCatalogState,
} from '../services/cardScan/sessionService';
import type { FrameRecognition, ScanDeps, ScanFailure, ScanSessionRow } from '../services/cardScan/sessionService';
import type {
  CardRecognitionProvider,
  RecognitionOutcome,
  RecognitionStatus,
  ScanCostGuard,
  ScanReservation,
} from '../services/cardScan/recognition';

// ---------------------------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------------------------

export interface ScanOrganizer {
  id: string;
  subscriptionTier: string | null;
}

export interface CardScanControllerDeps {
  /** The scan service dependencies (database, catalog, environment, clock). */
  scan: ScanDeps;
  /** The Organizer row of a logged-in user, or null when the user has none. */
  getOrganizer(userId: string): Promise<ScanOrganizer | null>;
  /** The monthly Smart tag allowance (lib/aiTagsQuotaTracker). */
  tags: {
    reserve(organizerId: string, tier: string | null, units: number): Promise<{ ok: boolean }>;
    refund(organizerId: string, units: number): Promise<unknown>;
    /** Tags left this month, or null for an unlimited tier or when it cannot be read. */
    remaining(organizerId: string, tier: string | null): Promise<number | null>;
  };
  /** The recognition side (services/cardScan/recognition). Nothing here calls the network until recognize runs. */
  recognition: {
    getProvider(env: ScanDeps['env']): CardRecognitionProvider;
    getStatus(env: ScanDeps['env']): RecognitionStatus;
    getCostGuard(): ScanCostGuard;
    closeReservation(guard: ScanCostGuard, reservation: ScanReservation, outcome: RecognitionOutcome): Promise<unknown>;
    /** The cost booked before a frame is read; undefined lets the guard use its own default. */
    frameCostEstimateUsd(mode: ScanMode): number | undefined;
  };
}

const ORGANIZER_LOCAL = 'cardScanOrganizer';
const SESSION_LOCAL = 'cardScanSession';

/** The multipart envelope around the picture (field names, boundaries) is small; this is the allowance on top of the picture cap. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;
const ID_PATTERN = /^[A-Za-z0-9._:-]{1,100}$/;

// ---------------------------------------------------------------------------------------------
// Input schemas (zod, strict: an unknown key is a 400)
// ---------------------------------------------------------------------------------------------

const shortText = (max: number) => z.string().max(max);

/** The card fields shared by the manual add and the patch. The services check the vocabularies and lengths. */
const entryFieldShape = {
  game: shortText(40).optional(),
  cardName: shortText(500).nullable().optional(),
  setCode: shortText(100).nullable().optional(),
  setName: shortText(500).nullable().optional(),
  collectorNumber: shortText(100).nullable().optional(),
  language: shortText(40).nullable().optional(),
  finish: shortText(40).nullable().optional(),
  conditionCode: shortText(40).nullable().optional(),
  grader: shortText(40).nullable().optional(),
  grade: shortText(40).nullable().optional(),
  certNumber: shortText(100).nullable().optional(),
  quantity: z.number().optional(),
  price: z.number().nullable().optional(),
};

const createSessionSchema = z
  .object({
    saleId: shortText(64),
    label: shortText(500).nullable().optional(),
    source: shortText(40).nullable().optional(),
    defaultGame: shortText(40).nullable().optional(),
    defaultConditionCode: shortText(40).nullable().optional(),
    defaultFinish: shortText(40).nullable().optional(),
  })
  .strict();

const manualEntrySchema = z
  .object({
    clientEntryId: shortText(100),
    printingId: shortText(100).nullable().optional(),
    ...entryFieldShape,
  })
  .strict();

const patchEntrySchema = z
  .object({
    printingId: shortText(100).nullable().optional(),
    acceptAsTyped: z.boolean().optional(),
    skip: z.boolean().optional(),
    countAsAnother: z.boolean().optional(),
    ifUpdatedAt: shortText(60).optional(),
    ...entryFieldShape,
  })
  .strict();

const bulkSchema = z
  .object({
    entryIds: z.array(shortText(100)).min(1).max(200),
    action: shortText(40),
    conditionCode: shortText(40).nullable().optional(),
    finish: shortText(40).nullable().optional(),
  })
  .strict();

const commitSchema = z
  .object({
    mode: shortText(40).nullable().optional(),
    force: z.boolean().optional(),
  })
  .strict();

/** Parses a JSON body against a strict schema. A missing body counts as an empty object. */
function parseBody<S extends z.ZodTypeAny>(schema: S, body: unknown): { ok: true; value: z.infer<S> } | { ok: false } {
  const parsed = schema.safeParse(body === undefined || body === null ? {} : body);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false };
}

/** A query value that is absent (undefined or blank), a whole number at or above `min`, or invalid (null). */
function parseQueryInt(raw: unknown, min: number): number | undefined | null {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (text === '') return undefined;
  if (!/^\d{1,9}$/.test(text)) return null;
  const n = Number(text);
  return n >= min ? n : null;
}

function optionalId(raw: unknown): string | null | undefined {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') return undefined;
  const text = raw.trim();
  if (text === '') return null;
  return ID_PATTERN.test(text) ? text : undefined;
}

/** The kind of image a buffer is, from its first bytes (the declared type is never trusted), or null. */
export function sniffImageType(buf: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (buf.length >= 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

function sendFailure(res: Response, f: Pick<ScanFailure, 'status' | 'code' | 'message' | 'extra'>): Response {
  return res.status(f.status).json({ success: false, error: f.message, code: f.code, ...(f.extra ?? {}) });
}

function sendOk(res: Response, data: unknown): Response {
  return res.status(200).json({ success: true, data });
}

// ---------------------------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------------------------

export function createCardScanHandlers(deps: CardScanControllerDeps) {
  /** Log the kind of failure only: never a picture, a card reading or a token. */
  function serverError(res: Response, err: unknown, what: string): Response {
    console.error(`[cardScan] ${what} failed:`, (err as { name?: string })?.name ?? 'Error', (err as { code?: string })?.code ?? '');
    return sendFailure(res, apiFail(500, 'SERVER_ERROR'));
  }

  const organizerOf = (res: Response): ScanOrganizer => res.locals[ORGANIZER_LOCAL] as ScanOrganizer;

  /** Loads the caller's Organizer row. Everything after this uses organizerOf(res).id as the owner. */
  async function resolveOrganizer(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (typeof userId !== 'string' || userId === '') return sendFailure(res, apiFail(403, 'UNAUTHORIZED'));
      const organizer = await deps.getOrganizer(userId);
      if (!organizer) return sendFailure(res, apiFail(403, 'UNAUTHORIZED'));
      res.locals[ORGANIZER_LOCAL] = organizer;
      return next();
    } catch (err) {
      return serverError(res, err, 'organizer lookup');
    }
  }

  // ---- status ----------------------------------------------------------------------------------

  const status = async (_req: AuthRequest, res: Response) => {
    try {
      const org = organizerOf(res);
      const env = deps.scan.env;
      const cfg = getScanConfig(env);
      let recognition: RecognitionStatus;
      try {
        recognition = deps.recognition.getStatus(env);
      } catch {
        recognition = { providerId: 'manual', mode: cfg.mode, providerReady: false };
      }
      const catalog = await safeCatalogState(deps.scan);
      let remaining: number | null = null;
      if (cfg.enabled) {
        try {
          remaining = await deps.tags.remaining(org.id, org.subscriptionTier);
        } catch {
          remaining = null;
        }
      }
      return sendOk(res, {
        scanEnabled: cfg.enabled,
        providerReady: cfg.enabled && recognition.providerReady,
        providerId: recognition.providerId,
        mode: recognition.mode,
        catalogReady: catalog.catalogReady,
        readyGames: catalog.readyGames,
        limits: { maxEntries: cfg.maxEntries, maxFrameBytes: cfg.maxFrameBytes, dupWindowMs: cfg.dupWindowMs },
        smartTags: { remaining },
      });
    } catch (err) {
      return serverError(res, err, 'status');
    }
  };

  // ---- sessions --------------------------------------------------------------------------------

  const sessionCreate = async (req: AuthRequest, res: Response) => {
    try {
      const body = parseBody(createSessionSchema, req.body);
      if (!body.ok) return sendFailure(res, apiFail(400, 'BAD_REQUEST'));
      const result = await createSession(deps.scan, { ...body.value, organizerId: organizerOf(res).id });
      if (!result.ok) return sendFailure(res, result);
      return sendOk(res, result.data);
    } catch (err) {
      return serverError(res, err, 'create session');
    }
  };

  const sessionList = async (req: AuthRequest, res: Response) => {
    try {
      const saleId = typeof req.query.saleId === 'string' ? req.query.saleId : '';
      const result = await listSessions(deps.scan, { organizerId: organizerOf(res).id, saleId });
      if (!result.ok) return sendFailure(res, result);
      return sendOk(res, result.data);
    } catch (err) {
      return serverError(res, err, 'list sessions');
    }
  };

  const sessionGet = async (req: AuthRequest, res: Response) => {
    try {
      const afterSeq = parseQueryInt(req.query.afterSeq, 0);
      const limit = parseQueryInt(req.query.limit, 1);
      if (afterSeq === null || limit === null) return sendFailure(res, apiFail(400, 'BAD_REQUEST'));
      const result = await getSession(deps.scan, { organizerId: organizerOf(res).id, sessionId: req.params.id, afterSeq, limit });
      if (!result.ok) return sendFailure(res, result);
      return sendOk(res, result.data);
    } catch (err) {
      return serverError(res, err, 'get session');
    }
  };

  const sessionDiscard = async (req: AuthRequest, res: Response) => {
    try {
      const result = await discardSession(deps.scan, { organizerId: organizerOf(res).id, sessionId: req.params.id });
      if (!result.ok) return sendFailure(res, result);
      return sendOk(res, result.data);
    } catch (err) {
      return serverError(res, err, 'discard session');
    }
  };

  // ---- entries ---------------------------------------------------------------------------------

  const entryAdd = async (req: AuthRequest, res: Response) => {
    try {
      const body = parseBody(manualEntrySchema, req.body);
      if (!body.ok) return sendFailure(res, apiFail(400, 'BAD_REQUEST'));
      const result = await addManualEntry(deps.scan, { ...body.value, organizerId: organizerOf(res).id, sessionId: req.params.id });
      if (!result.ok) return sendFailure(res, result);
      return sendOk(res, result.data);
    } catch (err) {
      return serverError(res, err, 'add entry');
    }
  };

  const entryPatch = async (req: AuthRequest, res: Response) => {
    try {
      const body = parseBody(patchEntrySchema, req.body);
      if (!body.ok) return sendFailure(res, apiFail(400, 'BAD_REQUEST'));
      const result = await patchEntry(deps.scan, {
        organizerId: organizerOf(res).id,
        sessionId: req.params.id,
        entryId: req.params.entryId,
        patch: body.value,
      });
      if (!result.ok) return sendFailure(res, result);
      return sendOk(res, result.data);
    } catch (err) {
      return serverError(res, err, 'patch entry');
    }
  };

  const entryBulk = async (req: AuthRequest, res: Response) => {
    try {
      const body = parseBody(bulkSchema, req.body);
      if (!body.ok) return sendFailure(res, apiFail(400, 'BAD_REQUEST'));
      const result = await bulkUpdate(deps.scan, { ...body.value, organizerId: organizerOf(res).id, sessionId: req.params.id });
      if (!result.ok) return sendFailure(res, result);
      return sendOk(res, result.data);
    } catch (err) {
      return serverError(res, err, 'bulk update');
    }
  };

  // ---- commit ----------------------------------------------------------------------------------

  const commit = async (req: AuthRequest, res: Response) => {
    // Node fires the response 'close' event after a normal finish too, so only an early close means the caller left.
    let cancelled = false;
    res.on('close', () => {
      if (!res.writableFinished) cancelled = true;
    });
    try {
      const body = parseBody(commitSchema, req.body);
      if (!body.ok) return sendFailure(res, apiFail(400, 'BAD_REQUEST'));
      const result = await commitSession(deps.scan, {
        organizerId: organizerOf(res).id,
        sessionId: req.params.id,
        mode: body.value.mode,
        force: body.value.force,
        shouldCancel: () => cancelled,
      });
      if (!result.ok) return sendFailure(res, result);
      return sendOk(res, result.data);
    } catch (err) {
      return serverError(res, err, 'commit');
    }
  };

  // ---- frames ----------------------------------------------------------------------------------

  /** The switch is checked before the upload is read. Manual add, edits and commit never pass through here. */
  function frameGate(_req: AuthRequest, res: Response, next: NextFunction) {
    if (!getScanConfig(deps.scan.env).enabled) {
      return sendFailure(res, { status: 503, code: 'SCAN_DISABLED', message: SCAN_STATUS_MESSAGES.DISABLED });
    }
    return next();
  }

  /** The session must be the caller's before any picture is read from the network. */
  async function frameSession(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const session = await loadSession(deps.scan, organizerOf(res).id, req.params.id);
      if (!session) return sendFailure(res, apiFail(404, 'SESSION_NOT_FOUND'));
      res.locals[SESSION_LOCAL] = session;
      return next();
    } catch (err) {
      return serverError(res, err, 'frame session');
    }
  }

  /** One picture in memory (never spooled to disk), one file, a size cap, small text fields. */
  function frameUpload(req: Request, res: Response, next: NextFunction) {
    const cfg = getScanConfig(deps.scan.env);
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > cfg.maxFrameBytes + MULTIPART_OVERHEAD_BYTES) {
      return sendFailure(res, apiFail(413, 'FRAME_TOO_LARGE'));
    }
    const handler = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: cfg.maxFrameBytes, files: 1, fields: 8, fieldSize: 1024, parts: 12 },
    }).single('frame');
    return handler(req, res, (err: unknown) => {
      if (!err) return next();
      if ((err as { code?: string })?.code === 'LIMIT_FILE_SIZE') return sendFailure(res, apiFail(413, 'FRAME_TOO_LARGE'));
      return sendFailure(res, apiFail(400, 'BAD_FRAME'));
    });
  }

  /**
   * The recognizer closure handed to ingestFrame. Order: Smart tag, platform scan cost pool, provider, close the
   * cost reservation, settle the tag. Nothing is reserved when the switch is off or no provider is ready.
   */
  async function recognizeFrame(org: ScanOrganizer, frame: { buffer: Buffer; mimeType: string }, game: CardGame): Promise<FrameRecognition> {
    const env = deps.scan.env;
    const cfg = getScanConfig(env);
    if (!cfg.enabled) return { ok: false, code: 'DISABLED', charged: false };
    const provider = deps.recognition.getProvider(env);
    if (!provider.isAvailable(env)) return { ok: false, code: 'DISABLED', charged: false };

    const tag = await deps.tags.reserve(org.id, org.subscriptionTier, 1);
    if (!tag.ok) return { ok: false, code: 'QUOTA_EXCEEDED', charged: false };

    const refundTag = async (): Promise<void> => {
      try {
        await deps.tags.refund(org.id, 1);
      } catch (err) {
        console.error('[cardScan] Smart tag refund failed:', (err as { name?: string })?.name ?? 'Error');
      }
    };

    const guard = deps.recognition.getCostGuard();
    let reservation: ScanReservation;
    try {
      const reserved = await guard.reserve({ estimatedCostUsd: deps.recognition.frameCostEstimateUsd(cfg.mode) });
      if (!reserved.ok) {
        await refundTag();
        return { ok: false, code: 'CAP_REACHED', charged: false };
      }
      reservation = reserved.reservation;
    } catch (err) {
      console.error('[cardScan] cost guard failed:', (err as { name?: string })?.name ?? 'Error');
      await refundTag();
      return { ok: false, code: 'PROVIDER_ERROR', charged: false };
    }

    let outcome: RecognitionOutcome;
    try {
      outcome = await provider.recognize(frame, { game });
    } catch {
      outcome = { ok: false, code: 'PROVIDER_ERROR', chargeable: false };
    }
    try {
      await deps.recognition.closeReservation(guard, reservation, outcome);
    } catch (err) {
      console.error('[cardScan] cost reservation close failed:', (err as { name?: string })?.name ?? 'Error');
    }

    const keepTag = outcome.ok ? true : outcome.chargeable;
    if (!keepTag) await refundTag();

    if (outcome.ok) return { ok: true, observation: outcome.observation, charged: true };
    const stopped = outcome.code === 'DISABLED' || outcome.code === 'CAP_REACHED';
    return { ok: false, code: outcome.code, charged: stopped ? false : outcome.chargeable };
  }

  const frame = async (req: AuthRequest, res: Response) => {
    try {
      const org = organizerOf(res);
      const session = res.locals[SESSION_LOCAL] as ScanSessionRow;
      const cfg = getScanConfig(deps.scan.env);
      const file = (req as Request & { file?: Express.Multer.File }).file;
      if (!file || !file.buffer || file.buffer.length === 0) return sendFailure(res, apiFail(400, 'BAD_FRAME'));
      if (file.buffer.length > cfg.maxFrameBytes) return sendFailure(res, apiFail(413, 'FRAME_TOO_LARGE'));
      const mimeType = sniffImageType(file.buffer);
      if (!mimeType) return sendFailure(res, apiFail(400, 'BAD_FRAME'));

      const fields = (req.body ?? {}) as Record<string, unknown>;
      const clientEntryId = optionalId(fields.clientEntryId);
      if (!clientEntryId) return sendFailure(res, apiFail(400, 'BAD_REQUEST'));
      const placementId = optionalId(fields.placementId);
      if (placementId === undefined) return sendFailure(res, apiFail(400, 'BAD_REQUEST'));

      let game: CardGame | undefined = canonicalizeVocabValue(CARD_GAMES, session.defaultGame);
      if (fields.gameHint !== undefined && fields.gameHint !== null && fields.gameHint !== '') {
        const hint = canonicalizeVocabValue(CARD_GAMES, fields.gameHint);
        if (!hint) return sendFailure(res, apiFail(400, 'BAD_REQUEST'));
        game = hint;
      }
      let source: 'PHOTO' | 'UPLOAD' = 'PHOTO';
      if (fields.source !== undefined && fields.source !== null && fields.source !== '') {
        const asked = typeof fields.source === 'string' ? fields.source.trim().toUpperCase() : '';
        if (asked !== 'PHOTO' && asked !== 'UPLOAD') return sendFailure(res, apiFail(400, 'BAD_REQUEST'));
        source = asked === 'UPLOAD' ? 'UPLOAD' : 'PHOTO';
      }

      const imageSha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');
      const result = await ingestFrame(
        deps.scan,
        { organizerId: org.id, sessionId: session.id, clientEntryId, placementId, imageSha256, source },
        () => recognizeFrame(org, { buffer: file.buffer, mimeType }, game ?? 'MTG')
      );
      if (!result.ok) return sendFailure(res, result);
      return sendOk(res, result.data);
    } catch (err) {
      return serverError(res, err, 'frame');
    }
  };

  return {
    resolveOrganizer,
    status,
    sessionCreate,
    sessionList,
    sessionGet,
    sessionDiscard,
    entryAdd,
    entryPatch,
    entryBulk,
    commit,
    frameGate,
    frameSession,
    frameUpload,
    frame,
  };
}

export type CardScanHandlers = ReturnType<typeof createCardScanHandlers>;

// ---------------------------------------------------------------------------------------------
// Default wiring (shared Prisma client, card catalog, recognition provider, process.env)
// ---------------------------------------------------------------------------------------------

function quotaTracker(): typeof import('../lib/aiTagsQuotaTracker') {
  // Lazy: the tracker builds on the shared Prisma client, which must not be constructed just by importing this file.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../lib/aiTagsQuotaTracker') as typeof import('../lib/aiTagsQuotaTracker');
}

function recognitionModule(): typeof import('../services/cardScan/recognition') {
  // Lazy: loads the provider registry (HTTP client, cost tracker) only when a request needs it.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../services/cardScan/recognition') as typeof import('../services/cardScan/recognition');
}

function defaultDeps(): CardScanControllerDeps {
  return {
    scan: getDefaultScanDeps(),
    getOrganizer: async (userId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { prisma } = require('../lib/prisma') as typeof import('../lib/prisma');
      const row = await prisma.organizer.findUnique({ where: { userId }, select: { id: true, subscriptionTier: true } });
      return row ? { id: row.id, subscriptionTier: typeof row.subscriptionTier === 'string' ? row.subscriptionTier : null } : null;
    },
    tags: {
      reserve: async (organizerId, tier, units) => {
        const q = quotaTracker();
        return q.reserveAiTags(organizerId, q.normalizeTier(tier), units);
      },
      refund: async (organizerId, units) => quotaTracker().refundAiTags(organizerId, units),
      remaining: async (organizerId, tier) => {
        const q = quotaTracker();
        const state = await q.getCachedAiTagQuotaForDisplay(organizerId, q.normalizeTier(tier));
        return Number.isFinite(state.remaining) ? state.remaining : null;
      },
    },
    recognition: {
      getProvider: (env) => recognitionModule().getRecognitionProvider(env),
      getStatus: (env) => recognitionModule().getRecognitionStatus(env),
      getCostGuard: () => recognitionModule().getScanCostGuard(),
      closeReservation: (guard, reservation, outcome) => recognitionModule().closeReservation(guard, reservation, outcome),
      frameCostEstimateUsd: (mode) => {
        const r = recognitionModule();
        return mode === 'OCR_PLUS_HAIKU' ? r.DEFAULT_OCR_FRAME_COST_ESTIMATE_USD : r.DEFAULT_FRAME_COST_ESTIMATE_USD;
      },
    },
  };
}

/** Built on first use so importing this module reads no environment and opens no connection. */
let defaultHandlers: CardScanHandlers | null = null;
function handlers(): CardScanHandlers {
  if (!defaultHandlers) defaultHandlers = createCardScanHandlers(defaultDeps());
  return defaultHandlers;
}

export const cardScanHandlers: CardScanHandlers = {
  resolveOrganizer: (req, res, next) => handlers().resolveOrganizer(req, res, next),
  status: (req, res) => handlers().status(req, res),
  sessionCreate: (req, res) => handlers().sessionCreate(req, res),
  sessionList: (req, res) => handlers().sessionList(req, res),
  sessionGet: (req, res) => handlers().sessionGet(req, res),
  sessionDiscard: (req, res) => handlers().sessionDiscard(req, res),
  entryAdd: (req, res) => handlers().entryAdd(req, res),
  entryPatch: (req, res) => handlers().entryPatch(req, res),
  entryBulk: (req, res) => handlers().entryBulk(req, res),
  commit: (req, res) => handlers().commit(req, res),
  frameGate: (req, res, next) => handlers().frameGate(req, res, next),
  frameSession: (req, res, next) => handlers().frameSession(req, res, next),
  frameUpload: (req, res, next) => handlers().frameUpload(req, res, next),
  frame: (req, res) => handlers().frame(req, res),
};
