import { Router } from 'express';
import { toggleItemFavorite, getItemFavoriteStatus, getUserFavorites, toggleSaleFavorite, getSaleFavoriteStatus } from '../controllers/favoriteController';
import { authenticate } from '../middleware/auth';

const router = Router();

// GET /api/favorites?category=X — list all favorited items (T3)
router.get('/', authenticate, getUserFavorites);

router.post('/item/:id', authenticate, toggleItemFavorite);
router.get('/item/:id', authenticate, getItemFavoriteStatus);

router.post('/sale/:id', authenticate, toggleSaleFavorite);
router.get('/sale/:id', authenticate, getSaleFavoriteStatus);

export default router;
