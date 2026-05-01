import { Router } from 'express';
import {
  getCityPageData,
  listCities,
  syncCityData,
  getTopFinds,
} from '../controllers/citiesController';

const router = Router();

/**
 * Public endpoints for city pages
 */
router.get('/:slug/top-finds', getTopFinds); // ADR-074: Metro Sync top finds
router.get('/:slug/data', getCityPageData);
router.get('/', listCities);

/**
 * Admin-only endpoints (Phase 2)
 */
// router.post('/sync', authenticateAdmin, syncCityData);

export default router;
