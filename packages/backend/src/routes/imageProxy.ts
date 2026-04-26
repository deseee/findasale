import express from 'express';
import { imageProxy } from '../controllers/imageProxyController';

const router = express.Router();

router.get('/image-proxy', imageProxy);

export default router;
