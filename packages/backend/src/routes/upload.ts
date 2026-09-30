import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { upload, uploadSalePhotos, uploadItemPhoto, analyzePhotoWithAI, rapidBatchUpload, uploadRapidfire } from '../controllers/uploadController';
import { batchAnalyzeImages } from '../controllers/batchAnalyzeController';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/adminAuth';
import { uploadLimiter, aiAnalyzeLimiter } from '../middleware/rateLimiter';
import { createRateLimitStore } from '../middleware/rateLimitShared';
import {
  requireOrganizerRole,
  organizerAiGate,
  multerArrayCapped,
  multerSingleFriendly,
  validateBatchImageUrls,
  MAX_RAPID_BATCH_FILES,
} from '../middleware/aiUploadGate';
import { recordAIFeedback, getAIFeedbackStats, isAIFeedbackField, isAIFeedbackAction, AI_FEEDBACK_FIELDS } from '../services/cloudAIService';

const router = Router();

// All upload routes require authentication
router.use(authenticate);

// Tight per-account burst limiter for the multi-photo paid AI route (rapid-batch): each call can
// fan out to Vision + Haiku + eBay image search per photo. Keyed by user id (authenticate runs first).
const rapidBatchLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 6, // 6 calls x MAX_RAPID_BATCH_FILES photos per 10 minutes per account
  keyGenerator: (req: Request) => (req as any).user?.id ?? req.ip ?? '0.0.0.0',
  validate: false,
  message: { message: 'Too many batch uploads. Please wait a few minutes and try again.' },
  standardHeaders: false,
  legacyHeaders: false,
  store: createRateLimitStore('rl:rapidBatch:'),
});

// Rapidfire capture limiters (2026-09-29). /rapidfire creates an Item + a Cloudinary upload + a queued
// paid AI job per call, but had no limiter at all (the job's comment claimed it was rate limited).
// Keyed by account id (authenticate runs first). Sized for a real capture session (a person shooting
// roughly one photo every 4 seconds), not for the generic 100/hour uploadLimiter, which would cut a
// house-sized capture session off after 100 photos; the job queue (processRapidDraft: concurrency 3)
// and the atomic Smart-tag reservation bound the paid spend independently.
const rapidfireKey = (req: Request) => (req as any).user?.id ?? req.ip ?? '0.0.0.0';
const rapidfireBurstLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 150, // ~1 photo / 4s sustained
  keyGenerator: rapidfireKey,
  validate: false,
  message: { message: 'You are capturing very fast. Please pause a moment and try again.' },
  standardHeaders: false,
  legacyHeaders: false,
  store: createRateLimitStore('rl:rapidfireBurst:'),
});
const rapidfireHourlyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 600,
  keyGenerator: rapidfireKey,
  validate: false,
  message: { message: 'Hourly capture limit reached. Please try again later.' },
  standardHeaders: false,
  legacyHeaders: false,
  store: createRateLimitStore('rl:rapidfireHourly:'),
});

// POST /api/upload/sale-photos — up to 20 images
router.post('/sale-photos', uploadLimiter, upload.array('photos', 20), uploadSalePhotos);

// POST /api/upload/item-photo — single image
router.post('/item-photo', uploadLimiter, upload.single('photo'), uploadItemPhoto);

// POST /api/upload/analyze-photo — send image to qwen3-vl:4b, returns { title, description, category, condition, suggestedPrice }
// Paid AI spend: organizer role (before body parsing) -> rate limit -> multer -> ownership (saleId, if sent) + monthly Smart-tag quota.
router.post('/analyze-photo', requireOrganizerRole, aiAnalyzeLimiter, multerSingleFriendly(upload, 'photo'), organizerAiGate(), analyzePhotoWithAI);

// POST /api/upload/rapid-batch — Phase 14: upload + AI in one call (up to MAX_RAPID_BATCH_FILES images)
// Same layering as analyze-photo; the quota check needs one Smart tag per photo in the call.
router.post(
  '/rapid-batch',
  requireOrganizerRole,
  uploadLimiter,
  rapidBatchLimiter,
  multerArrayCapped(upload, 'photos', MAX_RAPID_BATCH_FILES),
  organizerAiGate({ units: (req: Request) => (Array.isArray(req.files) ? req.files.length : 1) }),
  rapidBatchUpload
);

// POST /api/upload/rapidfire — Phase 2A: single image, create DRAFT item, queue background AI
// Multer error handler inline: catches LIMIT_UNEXPECTED_FILE (wrong field name from stale clients)
// and returns a clean 400 instead of bubbling to Sentry as an unhandled exception.
// All current frontend call sites send field name 'image' — this guards against stale cached bundles.
router.post(
  '/rapidfire',
  requireOrganizerRole, // before multer: a shopper account never streams image buffers into memory
  rapidfireBurstLimiter,
  rapidfireHourlyLimiter,
  (req: Request, res: Response, next: NextFunction) => {
    upload.single('image')(req, res, (err: any) => {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_UNEXPECTED_FILE') {
        res.status(400).json({ message: `Unexpected upload field "${err.field}". Expected field name: "image".` });
        return;
      }
      next(err);
    });
  },
  uploadRapidfire
);

// POST /api/upload/batch-analyze — CD2 Phase 2: AI analysis for pre-uploaded Cloudinary URLs (5-20 images)
// Organizer role + saleId ownership (the controller creates Items on that sale) + quota check + SSRF guard
// (the controller downloads every imageUrl server-side, so only our own Cloudinary URLs are accepted).
router.post(
  '/batch-analyze',
  requireOrganizerRole,
  aiAnalyzeLimiter,
  validateBatchImageUrls,
  // One Smart tag is counted per analyzed photo (batchAnalyzeController), so the pre-check needs one per URL.
  organizerAiGate({ requireSaleId: true, units: (req: Request) => (Array.isArray(req.body?.imageUrls) ? req.body.imageUrls.length : 1) }),
  batchAnalyzeImages
);

// CB4: POST /api/upload/ai-feedback — record organizer accept/dismiss/edit on AI suggestion fields
// field and action are allowlisted (400 otherwise): user-controlled keys must never reach the stats store.
router.post('/ai-feedback', (req, res) => {
  const { field, action } = (req.body ?? {}) as { field?: unknown; action?: unknown };
  if (!isAIFeedbackField(field) || !isAIFeedbackAction(action)) {
    res.status(400).json({ error: `field (${AI_FEEDBACK_FIELDS.join('|')}) and action (accepted|dismissed|edited) required` });
    return;
  }
  const recorded = recordAIFeedback(field, action);
  res.json({ ok: recorded });
});

// CB4: GET /api/upload/ai-feedback-stats — diagnostic: acceptance rates per field (admin use)
// C3: authenticate is already applied via router.use above; requireAdmin restricts to ADMIN role only
router.get('/ai-feedback-stats', requireAdmin, (req, res) => {
  res.json(getAIFeedbackStats());
});

export default router;
