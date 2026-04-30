import { Router } from 'express';
import { authenticate, AuthRequest, requireAdmin } from '../middleware/auth';
import { requireTier } from '../middleware/requireTier';
import {
  requestVerification,
  getVerificationStatus,
  adminApproveVerification,
  adminRejectVerification,
  getPendingOrganizers,
  searchGooglePlaces,
  previewGooglePlace,
  confirmGoogleVerification,
  searchGooglePlacesNext,
  searchYelpBusinesses,
  previewYelpBusiness,
  confirmYelpVerification
} from '../controllers/verificationController';

const router = Router();

// POST /api/verification/request — organizer requests verification
// Requires: auth
router.post('/request', authenticate, requestVerification);

// GET /api/verification/status — organizer checks their status
// Requires: auth
router.get('/status', authenticate, getVerificationStatus);

// GET /api/verification/google/search — search Google Places by business name
// Requires: auth
router.get('/google/search', authenticate, searchGooglePlaces);

// GET /api/verification/google/search/next — get next page of Google Places results
// Requires: auth
router.get('/google/search/next', authenticate, searchGooglePlacesNext);

// GET /api/verification/google/preview — preview Google Place details
// Requires: auth
router.get('/google/preview', authenticate, previewGooglePlace);

// POST /api/verification/google/confirm — confirm Google verification and auto-fill
// Requires: auth
router.post('/google/confirm', authenticate, confirmGoogleVerification);

// GET /api/verification/yelp/search — search Yelp businesses
// Requires: auth
router.get('/yelp/search', authenticate, searchYelpBusinesses);

// GET /api/verification/yelp/preview — preview Yelp business details
// Requires: auth
router.get('/yelp/preview', authenticate, previewYelpBusiness);

// POST /api/verification/yelp/confirm — confirm Yelp verification and auto-fill
// Requires: auth
router.post('/yelp/confirm', authenticate, confirmYelpVerification);

// GET /api/verification/admin/pending — admin gets pending verification requests
// Requires: auth + admin
router.get('/admin/pending', authenticate, requireAdmin, getPendingOrganizers);

// POST /api/verification/admin/:organizerId/approve — admin approves verification
router.post('/admin/:organizerId/approve', authenticate, requireAdmin, adminApproveVerification);

// POST /api/verification/admin/:organizerId/reject — admin rejects verification
router.post('/admin/:organizerId/reject', authenticate, requireAdmin, adminRejectVerification);

export default router;
