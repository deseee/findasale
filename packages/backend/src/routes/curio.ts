import express from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth';
import { curioRateLimiter } from '../middleware/curioRateLimiter';
import { curioCostGate } from '../middleware/curioCostGate';
import { submitScan, dealCheck, listFinds, deleteFind, convertScanToListing } from '../controllers/curioController';

const router = express.Router();

// Mirrors items.ts's uploadImages multer config (same MIME whitelist + 25MB limit) --
// see claude_docs/feature-notes/curio-api-adr-2026-07-17.md API Contract (a).
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const uploadCurioPhotos = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 3 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed. Accepted: ${ALLOWED_IMAGE_TYPES.join(', ')}`));
    }
  },
});

// POST /api/curio/scan -- submit 1-3 photos, get AI identification + a value estimate.
// authenticate (login required, no anonymous tier) -> curioRateLimiter (burst guard) ->
// curioCostGate (CURIO_DAILY_SCAN_CAP / CURIO_GLOBAL_DAILY_SCAN_CAP pre-flight).
router.post('/scan', authenticate, curioRateLimiter, curioCostGate, uploadCurioPhotos.array('photos', 3), submitScan);

// POST /api/curio/deal-check -- extension-provided, client-extracted listing data; comps-only
// verdict. authenticate + curioRateLimiter only -- does not consume the Curio scan-cost pool
// (no Vision/Haiku call, see curioController.ts dealCheck doc comment).
router.post('/deal-check', authenticate, curioRateLimiter, dealCheck);

// GET /api/curio/finds?cursor=&limit=20 -- paginated Finds collection, owner-scoped.
router.get('/finds', authenticate, listFinds);

// DELETE /api/curio/finds/:scanId -- soft delete, owner-only (403 on cross-account attempt).
router.delete('/finds/:scanId', authenticate, deleteFind);

// POST /api/curio/scan/:scanId/convert -- convert a scan into a DRAFT Item, auto-provisioning
// an Organizer if the user doesn't have one yet (ADR Decision #6).
router.post('/scan/:scanId/convert', authenticate, convertScanToListing);

export default router;
