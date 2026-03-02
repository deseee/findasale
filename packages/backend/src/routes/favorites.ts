import { Router } from 'express';
import { toggleItemFavorite, getItemFavoriteStatus } from '../controllers/favoriteController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/item/:id', authenticate, toggleItemFavorite);
router.get('/item/:id', authenticate, getItemFavoriteStatus);

export default router;
