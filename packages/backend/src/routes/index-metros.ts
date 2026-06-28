import { Router } from 'express';
import { getMetroIndex } from '../controllers/indexController';

// Weekend Sale Index — public aggregation for the /sale-index backlink/PR asset.
// Named index-metros.ts to avoid colliding with src/index.ts.
const router = Router();

// GET /api/index/metros — public, no auth (heavily cached, read-only aggregate).
router.get('/metros', getMetroIndex);

export default router;
