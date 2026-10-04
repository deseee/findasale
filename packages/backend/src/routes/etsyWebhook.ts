import { Router } from 'express';
import { etsyWebhookHandler } from '../controllers/etsyWebhookController';

// ADR-135 batch E-B4. Public Etsy webhook receiver, mounted by the wiring batch at /api/etsy/webhook.
//
// NO authenticate, NO requireOrganizer and NO per-route kill switch on purpose: Etsy calls this
// endpoint server to server, the handler verifies the webhook signature itself, and when
// ETSY_CONNECTOR_ENABLED is not 'true' the handler answers 200 and ignores the call (the poll in
// jobs/etsySoldSyncCron.ts recovers anything missed). Other Etsy routers share the /api/etsy prefix, so
// mount this router (and its express.raw body parser) BEFORE them; see the WIRING notes in the batch report.
//
// The body must arrive as a raw Buffer: the signature covers the exact bytes Etsy sent, so index.ts
// registers app.use('/api/etsy/webhook', express.raw({ type: '*/*' })) ahead of the global JSON parser.
// The global CSRF check also has to exempt this exact path (middleware/csrf.ts, CSRF_EXEMPT_EXACT_PATHS).
const router = Router();

router.post('/', etsyWebhookHandler);

export default router;
