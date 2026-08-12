/**
 * footageIngestController.ts — ADR-080 §3. HTTP entrypoint for the event-driven
 * footage ingest (Stage 1b). Thin controller: authenticates via the route-level
 * requireIngestSecret middleware, then delegates all logic to
 * services/video/footageIngestService.ingestFootage().
 *
 * Body handling: the request body MAY be a Cloudflare R2 object-create
 * event-notification (future R2-native drop-in) OR empty / a bare "check now"
 * ping from Patrick's PC uploader. Either way the service reconciles the full R2
 * listing (R2 is the source of truth), so the body is passed through only for
 * observability. A malformed/empty body is never an error here.
 *
 * 2026-08-12 (auto-fix, Sentry FINDASALE-NODEJS-76): gotcha - requestTimeout
 * middleware (30s) applies to this route (not in its skip-list). ingestFootage()
 * can exceed 30s on large batches (sequential per-asset writes). If the timeout
 * fires first and sends a 503, this handler must not also try to send - guarded
 * with res.headersSent below.
 */

import { Request, Response } from 'express';
import { ingestFootage } from '../services/video/footageIngestService';

export async function handleFootageIngest(req: Request, res: Response): Promise<void> {
  try {
    // req.body is already JSON-parsed by the global express.json() middleware
    // (or undefined/{} for a bodyless ping). Pass through for event-key logging.
    const result = await ingestFootage(req.body);
    // requestTimeout middleware may have already sent a 503 while we were
    // still awaiting ingestFootage() on a large batch - don't double-send.
    if (res.headersSent) return;
    res.status(200).json({
      ok: true,
      assetsCreated: result.assetsCreated,
      batchId: result.batchId,
      r2ObjectCount: result.r2ObjectCount,
      triggeredByKeys: result.triggeredByKeys,
    });
  } catch (err: any) {
    console.error('[footage-ingest] Ingest failed:', err?.message || err);
    if (res.headersSent) return;
    res.status(500).json({ ok: false, error: err?.message || 'Footage ingest failed' });
  }
}
