import { Router } from 'express';
import { getPopularTags, getItemsByTag } from '../controllers/tagController';

const router = Router();

// GET /api/tags/popular — top tags by item count (public, for SEO/sitemap)
router.get('/popular', getPopularTags);

// GET /api/tags/:slug/items — published items for a tag (public, for SEO pages)
router.get('/:slug/items', getItemsByTag);

export default router;
