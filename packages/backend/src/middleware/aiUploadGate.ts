/**
 * aiUploadGate.ts -- authorization + quota gate for the paid Smart-tagging upload endpoints
 * (POST /api/upload/analyze-photo, /rapid-batch, /batch-analyze).
 *
 * These endpoints spend real money per call (Google Vision + Claude Haiku + eBay image search),
 * so "authenticated" is not enough. Industry-standard layering for a paid endpoint:
 *
 *   authenticate -> role (ORGANIZER) -> tight per-account rate limiter -> body parsing (multer)
 *   -> ownership (saleId belongs to this organizer) -> per-account monthly quota -> handler
 *
 * The role check runs BEFORE multer so a shopper account never gets to stream image buffers into
 * memory. Ownership + quota run AFTER multer because multipart fields (saleId) are only parsed then.
 *
 * Quota semantics (2026-09-29 hardening): ATOMIC reserve-then-refund. The gate reserves the call's
 * Smart tags up front with one conditional UPDATE (lib/aiTagsQuotaTracker.reserveAiTags), so N parallel
 * requests can never collectively spend more than the monthly limit. The handler settles with
 * gate.settle(used): the unused part of the reservation is refunded (failure, skipped photos, no
 * result). If the response finishes without settle() being called the whole reservation is refunded.
 *
 * Tier policy (decisions D1/D2): Organizer.subscriptionTier is the entitlement truth. A PRO/TEAMS
 * entitlement continues until the subscription actually ends and the tier flips, so there is no
 * lapse-flag downgrade here.
 */

import { Request, Response, NextFunction, RequestHandler } from 'express';
import multer from 'multer';
import { prisma } from '../lib/prisma';
import { AuthRequest } from './auth';
import { reserveAiTags, refundAiTags, incrementAiTagCount, normalizeTier } from '../lib/aiTagsQuotaTracker';
import type { SubscriptionTier } from '../constants/tierLimits';

/** Max photos accepted by one POST /upload/rapid-batch call. */
export const MAX_RAPID_BATCH_FILES = 10;
/** Max Cloudinary URLs accepted by one POST /upload/batch-analyze call (matches the controller). */
export const MAX_BATCH_ANALYZE_IMAGES = 20;

export interface AiGateContext {
  organizerId: string;
  tier: SubscriptionTier;
  saleId: string | null;
  /** Smart tags atomically reserved for this call by the gate. */
  reserved: number;
  /**
   * Keep `used` of the reserved tags and refund the rest. Idempotent (first call wins) and never
   * throws. Handlers call it exactly once with the number of tags actually spent.
   */
  settle: (used: number) => Promise<void>;
}

/** Read the context the gate attached; undefined means the route was mounted without the gate. */
export function getAiGate(res: Response): AiGateContext | undefined {
  return (res.locals as { aiGate?: AiGateContext } | undefined)?.aiGate;
}

/** Cheap role check, safe to run before body parsing. */
export const requireOrganizerRole: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const user = (req as AuthRequest).user;
  const isOrganizer = !!user && (user.roles?.includes('ORGANIZER') || user.role === 'ORGANIZER');
  if (!isOrganizer) {
    res.status(403).json({ message: 'Organizer access required for Smart tagging.', code: 'ORGANIZER_REQUIRED' });
    return;
  }
  next();
};

const finiteOrNull = (n: number): number | null => (Number.isFinite(n) ? n : null);

/**
 * Organizer.subscriptionTier is the single source of truth (decisions D1/D2: PRO/TEAMS entitlement
 * continues until the subscription actually ends; no lapse-flag downgrade). The second parameter is
 * accepted only so older call sites keep compiling and is intentionally ignored.
 */
export function resolveTier(rawTier: unknown, _ignoredLapseFlag?: boolean): SubscriptionTier {
  return normalizeTier(rawTier);
}

export interface OrganizerAiGateOptions {
  /** Reject the request when no saleId is supplied (batch-analyze creates items, so it needs one). */
  requireSaleId?: boolean;
  /** Smart tags this call will consume (default 1). The call is refused when fewer remain. */
  units?: (req: Request) => number;
}

/**
 * Loads the organizer, verifies sale ownership when a saleId is present, and enforces the monthly
 * Smart-tag quota. Attaches res.locals.aiGate for the handler. Fails closed on any lookup error.
 */
export function organizerAiGate(options: OrganizerAiGateOptions = {}): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthRequest;
      const userId = authReq.user?.id;
      if (!userId) {
        res.status(401).json({ message: 'Authentication required.' });
        return;
      }

      const organizer = await prisma.organizer.findUnique({
        where: { userId },
        select: { id: true, subscriptionTier: true },
      });
      if (!organizer) {
        res.status(403).json({ message: 'Organizer profile not found.', code: 'ORGANIZER_REQUIRED' });
        return;
      }

      const rawSaleId = req.body?.saleId ?? req.query?.saleId;
      if (rawSaleId !== undefined && rawSaleId !== null && typeof rawSaleId !== 'string') {
        res.status(400).json({ message: 'saleId must be a string.' });
        return;
      }
      const saleId = typeof rawSaleId === 'string' && rawSaleId.trim() ? rawSaleId.trim() : null;
      if (!saleId && options.requireSaleId) {
        res.status(400).json({ message: 'saleId is required.' });
        return;
      }

      if (saleId) {
        const sale = await prisma.sale.findUnique({ where: { id: saleId }, select: { organizerId: true } });
        if (!sale) {
          res.status(404).json({ message: 'Sale not found.' });
          return;
        }
        if (sale.organizerId !== organizer.id) {
          res.status(403).json({ message: 'Access denied. Not your sale.' });
          return;
        }
      }

      const tier = resolveTier(organizer.subscriptionTier);
      const rawUnits = options.units ? options.units(req) : 1;
      const units = Number.isFinite(rawUnits) ? Math.max(1, Math.floor(rawUnits)) : 1;

      // ATOMIC reservation: check-and-spend in one conditional UPDATE (no check-then-increment race).
      const reservation = await reserveAiTags(organizer.id, tier, units);
      if (!reservation.ok) {
        const used = reservation.used ?? 0;
        const remaining = reservation.remaining ?? 0;
        res.status(429).json({
          code: 'AI_QUOTA_EXCEEDED',
          message: reservation.exceeded
            ? `Monthly Smart tagging limit reached for ${tier} tier. Upgrade to continue.`
            : `This upload needs ${units} Smart tags but only ${finiteOrNull(remaining)} remain this month on the ${tier} tier. Upload fewer photos or upgrade.`,
          usedThisMonth: used,
          limit: finiteOrNull(reservation.limit),
          remaining: finiteOrNull(remaining),
        });
        return;
      }

      let settled = false;
      const settle = async (used: number): Promise<void> => {
        if (settled) return;
        settled = true;
        const keep = Number.isFinite(used) ? Math.min(units, Math.max(0, Math.floor(used))) : 0;
        const refund = units - keep;
        if (refund <= 0) return;
        try {
          await refundAiTags(organizer.id, refund);
        } catch (err: unknown) {
          console.warn('[aiUploadGate] refundAiTags failed:', err instanceof Error ? err.message : err);
        }
      };
      // Safety net: a response that completed without the handler settling means no paid work was
      // recorded, so hand the whole reservation back. (Deliberately 'finish', not 'close': a client
      // that disconnects mid-analysis must not get its still-running paid work refunded.)
      if (typeof (res as { once?: unknown }).once === 'function') {
        res.once('finish', () => {
          void settle(0);
        });
      }

      (res.locals as { aiGate?: AiGateContext }).aiGate = { organizerId: organizer.id, tier, saleId, reserved: units, settle };
      next();
    } catch (err) {
      console.error('[aiUploadGate] gate check failed:', err);
      res.status(500).json({ message: 'Could not verify Smart tagging access. Please try again.' });
    }
  };
}

/**
 * Legacy post-hoc counter for routes that do not use the reservation gate. Paid upload routes should
 * call getAiGate(res).settle(used) instead. Best-effort: never throws into the request.
 */
export function recordAiUsage(organizerId: string, count: number): void {
  if (!organizerId || !(count > 0)) return;
  incrementAiTagCount(organizerId, count).catch((err: unknown) => {
    console.warn('[aiUploadGate] incrementAiTagCount failed:', err instanceof Error ? err.message : err);
  });
}

// ── Multer wrappers: clean 4xx instead of a bubbled 500 for the common client mistakes ──────────

type MulterHandler = (req: Request, res: Response, cb: (err?: unknown) => void) => void;

function wrapMulter(handler: MulterHandler, field: string, max: number | null): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, (err?: unknown) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          res.status(400).json({
            message: max
              ? `Too many files or wrong field name. Send at most ${max} photos in field "${field}".`
              : `Unexpected upload field "${err.field}". Expected field name: "${field}".`,
          });
        } else if (err.code === 'LIMIT_FILE_SIZE') {
          res.status(413).json({ message: 'Each photo must be 10MB or smaller.' });
        } else {
          res.status(400).json({ message: err.message });
        }
        return;
      }
      if (err) {
        next(err);
        return;
      }
      next();
    });
  };
}

export const multerArrayCapped = (upload: multer.Multer, field: string, max: number): RequestHandler =>
  wrapMulter(upload.array(field, max) as unknown as MulterHandler, field, max);

export const multerSingleFriendly = (upload: multer.Multer, field: string): RequestHandler =>
  wrapMulter(upload.single(field) as unknown as MulterHandler, field, null);

// ── batch-analyze: only our own Cloudinary URLs may be fetched server-side (SSRF guard) ─────────

const CLOUDINARY_HOST = /^res(-\d+)?\.cloudinary\.com$/i;

/** True only for https URLs on Cloudinary's delivery host (and our own cloud, when configured). */
export function isAllowedImageUrl(raw: unknown): boolean {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) return false;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  if (u.username || u.password) return false;
  if (u.port && u.port !== '443') return false;
  if (!CLOUDINARY_HOST.test(u.hostname)) return false;
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  if (cloud && !u.pathname.startsWith(`/${cloud}/`)) return false;
  return true;
}

/**
 * batchAnalyzeImages downloads every imageUrl server-side with axios, so an arbitrary URL is an
 * SSRF vector (internal hosts, cloud metadata). Reject anything that is not our Cloudinary.
 * Non-array bodies fall through so the controller keeps returning its own 400.
 */
export const validateBatchImageUrls: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const urls = req.body?.imageUrls;
  if (!Array.isArray(urls)) {
    next();
    return;
  }
  if (urls.length > MAX_BATCH_ANALYZE_IMAGES) {
    res.status(400).json({ message: `Maximum ${MAX_BATCH_ANALYZE_IMAGES} images allowed per batch` });
    return;
  }
  const badIndex = urls.findIndex((u: unknown) => !isAllowedImageUrl(u));
  if (badIndex !== -1) {
    res.status(400).json({ message: `imageUrls[${badIndex}] must be an https Cloudinary image URL from a FindA.Sale upload.` });
    return;
  }
  next();
};
