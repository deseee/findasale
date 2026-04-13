import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getMyWishlists,
  createWishlist,
  addToWishlist,
  removeFromWishlist,
  getPublicWishlist,
  generateShareLink,
  toggleWishlistPublic,
} from '../controllers/wishlistController';

const router = Router();

// Public route — no auth required
router.get('/share/:slug', getPublicWishlist);

// Protected routes
router.use(authenticate);

router.get('/', getMyWishlists);
router.post('/', createWishlist);
router.post('/items', addToWishlist);
router.delete('/items/:wishlistItemId', removeFromWishlist);
router.post('/:id/share', generateShareLink);
router.patch('/:id/visibility', toggleWishlistPublic);

export default router;
