import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getCommissionTiers,
  replaceCommissionTiers,
  createCommissionTier,
  updateCommissionTier,
  deleteCommissionTier,
  resetCommissionTiers,
} from '../controllers/commissionTierController';

/**
 * ADR-096 follow-up: CRUD for a workspace's consignor commission ladder.
 *
 * Every route below is authenticated. There is no public/optionalAuthenticate
 * route on this router by design — commission rates are a money path and are
 * never readable by an anonymous caller.
 */
const router = Router();

router.use(authenticate);

// Read the caller's own ladder
router.get('/', getCommissionTiers);

// Replace the whole ladder (also the reorder path — order is derived from minPrice)
router.put('/', replaceCommissionTiers);

// Restore the starting four-band ladder
router.post('/reset', resetCommissionTiers);

// Add one band
router.post('/', createCommissionTier);

// Update one band
router.put('/:id', updateCommissionTier);

// Remove one band
router.delete('/:id', deleteCommissionTier);

export default router;
