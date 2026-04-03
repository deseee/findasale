import { Router } from 'express';
import { createReview, getSaleReviews, getOrganizerReviews, getOrganizerAllReviews, getMyOrganizerReviews, respondToReview } from '../controllers/reviewController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/', authenticate, createReview);                     // POST /api/reviews
router.get('/sale/:saleId', getSaleReviews);                      // GET  /api/reviews/sale/:saleId
router.get('/organizer/me', authenticate, getMyOrganizerReviews); // GET  /api/reviews/organizer/me (uses JWT, no param)
router.get('/organizer/:organizerId/all', authenticate, getOrganizerAllReviews); // GET  /api/reviews/organizer/:organizerId/all (auth)
router.get('/organizer/:organizerId', getOrganizerReviews);       // GET  /api/reviews/organizer/:organizerId (public)
router.patch('/:reviewId/respond', authenticate, respondToReview); // PATCH /api/reviews/:reviewId/respond

export default router;
