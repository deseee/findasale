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
} from '../controllers/ebayTaxonomyController';

const router = Router();

// All endpoints require organizer auth
router.get('/taxonomy/aspects/:categoryId', authenticate, requireOrganizer, getAspectsHandler);
router.get('/taxonomy/suggest', authenticate, requireOrganizer, suggestCategoriesHandler);
router.get('/catalog/search', authenticate, requireOrganizer, catalogSearchHandler);
router.post('/suggest/identifiers', authenticate, requireOrganizer, suggestIdentifiersHandler);

export default router;
