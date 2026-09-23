/**
 * ebayTaxonomy.ts — Phase C routes for taxonomy, catalog, and AI suggest
 */

import { Router } from 'express';
import { authenticate, requireOrganizer } from '../middleware/auth';
import {
  getAspectsHandler,
  catalogSearchHandler,
  suggestIdentifiersHandler,
  suggestCategoriesHandler,
  getListingDebugInfo,
  getInventoryItemDebugInfo,
} from '../controllers/ebayTaxonomyController';

const router = Router();

// All endpoints require organizer auth
router.get('/taxonomy/aspects/:categoryId', authenticate, requireOrganizer, getAspectsHandler);
// Diagnostic-only, read-only, organizer-scoped (2026-09-22 -- see handler doc comment).
router.get('/listing-debug/:itemId', authenticate, requireOrganizer, getListingDebugInfo);
// Diagnostic-only, read-only, organizer-scoped, Inventory-API/offer-based items (2026-09-23 -- see handler doc comment).
router.get('/inventory-debug/:itemId', authenticate, requireOrganizer, getInventoryItemDebugInfo);
router.get('/taxonomy/suggest', authenticate, requireOrganizer, suggestCategoriesHandler);
router.get('/catalog/search', authenticate, requireOrganizer, catalogSearchHandler);
router.post('/suggest/identifiers', authenticate, requireOrganizer, suggestIdentifiersHandler);

export default router;
