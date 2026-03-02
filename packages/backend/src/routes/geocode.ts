import { Router } from 'express';
import { geocodeAddress } from '../controllers/geocodeController';

const router = Router();

// GET /api/geocode?address=123+Main+St&city=Grand+Rapids&state=MI&zip=49503
router.get('/', geocodeAddress);

export default router;
