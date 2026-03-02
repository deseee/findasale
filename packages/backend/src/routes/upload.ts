import { Router } from 'express';
import { upload, uploadSalePhotos, uploadItemPhoto, analyzePhotoWithAI } from '../controllers/uploadController';
import { authenticate } from '../middleware/auth';

const router = Router();

// All upload routes require authentication
router.use(authenticate);

// POST /api/upload/sale-photos — up to 20 images
router.post('/sale-photos', upload.array('photos', 20), uploadSalePhotos);

// POST /api/upload/item-photo — single image
router.post('/item-photo', upload.single('photo'), uploadItemPhoto);

// POST /api/upload/analyze-photo — send image to qwen3-vl:4b, returns { title, description, category, condition, suggestedPrice }
router.post('/analyze-photo', upload.single('photo'), analyzePhotoWithAI);

export default router;
