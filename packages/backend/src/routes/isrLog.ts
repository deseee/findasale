import { Router } from 'express';
import { logIsrWrite } from '../controllers/internalIsrLogController';

// ADR-2026-09-16-isr-regeneration-logging. Secret-gated internal endpoint
// called only by our own frontend's server-side getStaticProps code -- not
// public API surface. Mounted alongside (not instead of) the existing
// ADR-076 internal router at the same /api/internal prefix -- sub-paths
// don't collide, Express dispatches each mounted router in order.
const router = Router();

router.post('/isr-log', logIsrWrite);

export default router;
