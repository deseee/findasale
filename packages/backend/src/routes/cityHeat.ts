import { Router } from 'express';
import { getCityHeat } from '../controllers/cityHeatController';

const router = Router();

router.get('/', getCityHeat);

export default router;
