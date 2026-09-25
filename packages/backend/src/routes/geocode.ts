import { Router } from 'express';
import { geocodeAddress, autocompleteAddress } from '../controllers/geocodeController';

const router = Router();

// GET /api/geocode/autocomplete?q=123+Main&countrycodes=us
// Backs AddressAutocomplete.tsx's live suggestion dropdown.
router.get('/autocomplete', autocompleteAddress);

// GET /api/geocode?address=123+Main+St&city=Grand+Rapids&state=MI&zip=49503
router.get('/', geocodeAddress);

export default router;
