/**
 * routes/video.ts — ADR-080 §3. Public-facing video-pipeline ingest surface.
 *
 * POST /api/video/footage-ingest
 *   The event-driven ingest trigger (Stage 1b). Called by Patrick's PC uploader
 *   as an authenticated "check now" ping after it syncs clips to the R2
 *   raw-footage bucket; also accepts a Cloudflare R2 object-create
 *   event-notification body as a future drop-in (see footageIngestService).
 *
 * AUTH (AUTHZ-ON-EVERY-ENDPOINT): shared-secret, mirroring the internal-route
 * pattern in routes/internal.ts (requireSecret). Secret lives in env var
 * FOOTAGE_INGEST_SECRET. Accepted either as the custom `x-ingest-secret` header
 * (canonical, matches routes/internal.ts's x-internal-secret style) OR as an
 * `Authorization: Bearer <secret>` header (convenience for the PC uploader).
 * No secret / wrong secret -> 401. This endpoint is NOT session/cookie auth'd —
 * it is a machine-to-machine trigger.
 */

import express from 'express';
import { handleFootageIngest } from '../controllers/footageIngestController';

const router = express.Router();

const requireIngestSecret = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void => {
  const expected = process.env.FOOTAGE_INGEST_SECRET;

  // Fail closed: if the secret is not configured on the server, reject rather
  // than allowing unauthenticated access.
  if (!expected) {
    console.error('[footage-ingest] FOOTAGE_INGEST_SECRET is not set — rejecting request');
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const headerSecret = req.headers['x-ingest-secret'];
  const authHeader = req.headers['authorization'];
  const bearer =
    typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length).trim()
      : undefined;

  const provided = typeof headerSecret === 'string' ? headerSecret : bearer;

  if (!provided || provided !== expected) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
};

// POST /api/video/footage-ingest — authenticated ingest ping / R2 event sink.
router.post('/footage-ingest', requireIngestSecret, handleFootageIngest);

export default router;
