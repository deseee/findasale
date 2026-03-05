import { Router } from 'express';
import { createReview, getSaleReviews, getOrganizerReviews } from '../controllers/reviewController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/', authenticate, createReview);               // POST /api/reviews
router.get('/sale/:saleId', getSaleReviews);                // GET  /api/reviews/sale/:saleId
router.get('/organizer/:organizerId', getOrganizerReviews); // GET  /api/reviews/organizer/:organizerId

export default router;
