import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getMyWishlists,
  createWishlist,
  addToWishlist,
  removeFromWishlist,
  getPublicWishlist,
  generateShareLink,
} from '../controllers/wishlistController';

const router = Router();

// Public route — no auth required
router.get('/public/:slug', getPublicWishlist);

// Protected routes
router.use(authenticate);

router.get('/', getMyWishlists);
router.post('/', createWishlist);
router.post('/items', addToWishlist);
router.delete('/items/:wishlistItemId', removeFromWishlist);
router.post('/:id/share', generateShareLink);

export default router;
