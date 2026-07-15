import { Router } from 'express';
import { authenticate, requireOrganizer } from '../middleware/auth';
import { getExtensionItems, markItemListed, markItemRemoved } from '../controllers/extensionController';

// Endpoints for the FindA.Sale Marketplace Autofill browser extension (ADR-084).
// Auth is via Bearer token (the organizer's accessToken, read from the finda.sale
// cookie by the extension background worker). CORS for /api/extension is opened in
// index.ts (Bearer-only, no credentials) so the chrome-extension origin is allowed.
const router = Router();

router.get('/items', authenticate, requireOrganizer, getExtensionItems);
router.post('/items/:id/listed', authenticate, requireOrganizer, markItemListed);
router.post('/items/:id/removed', authenticate, requireOrganizer, markItemRemoved);

export default router;
