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
 */

import { Request, Response } from 'express';
import { ingestFootage } from '../services/video/footageIngestService';

export async function handleFootageIngest(req: Request, res: Response): Promise<void> {
  try {
    // req.body is already JSON-parsed by the global express.json() middleware
    // (or undefined/{} for a bodiless ping). Pass through for event-key logging.
    const result = await ingestFootage(req.body);
    res.status(200).json({
      ok: true,
      assetsCreated: result.assetsCreated,
      batchId: result.batchId,
      r2ObjectCount: result.r2ObjectCount,
      triggeredByKeys: result.triggeredByKeys,
    });
  } catch (err: any) {
    console.error('[footage-ingest] Ingest failed:', err?.message || err);
    res.status(500).json({ ok: false, error: err?.message || 'Footage ingest failed' });
  }
}
