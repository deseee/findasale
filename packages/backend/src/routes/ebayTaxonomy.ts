/**
 * ebayTaxonomy.ts — Phase C routes for taxonomy, catalog, and AI suggest
 */

import { Router } from 'express';
import { requireOrganizer } from '../middleware/auth';
import {
  getAspectsHandler,
  catalogSearchHandler,
  suggestIdentifiersHandler,
  suggestCategoriesHandler,
} from '../controllers/ebayTaxonomyController';

const router = Router();

// All endpoints require organizer auth
router.get('/taxonomy/aspects/:categoryId', requireOrganizer, getAspectsHandler);
router.get('/taxonomy/suggest', requireOrganizer, suggestCategoriesHandler);
router.get('/catalog/search', requireOrganizer, catalogSearchHandler);
router.post('/suggest/identifiers', requireOrganizer, suggestIdentifiersHandler);

export default router;
