import { Router } from 'express';
import { toggleItemFavorite, getItemFavoriteStatus, getUserFavorites } from '../controllers/favoriteController';
import { authenticate } from '../middleware/auth';

const router = Router();

// GET /api/favorites?category=X — list all favorited items (T3)
router.get('/', authenticate, getUserFavorites);

router.post('/item/:id', authenticate, toggleItemFavorite);
router.get('/item/:id', authenticate, getItemFavoriteStatus);

export default router;
