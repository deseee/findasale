import { Router } from 'express';
import { getCompaniesByCity, getCompanyCitySlugs } from '../controllers/companyDirectoryController';

// #567: Hire-intent company directory routes (public, SEO)
const router = Router();

router.get('/city-slugs', getCompanyCitySlugs);
router.get('/by-city/:citySlug', getCompaniesByCity);

export default router;
