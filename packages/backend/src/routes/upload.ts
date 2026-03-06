import { Router } from 'express';
import { upload, uploadSalePhotos, uploadItemPhoto, analyzePhotoWithAI, rapidBatchUpload } from '../controllers/uploadController';
import { batchAnalyzeImages } from '../controllers/batchAnalyzeController';
import { authenticate } from '../middleware/auth';
import { recordAIFeedback, getAIFeedbackStats } from '../services/cloudAIService';

const router = Router();

// All upload routes require authentication
router.use(authenticate);

// POST /api/upload/sale-photos — up to 20 images
router.post('/sale-photos', upload.array('photos', 20), uploadSalePhotos);

// POST /api/upload/item-photo — single image
router.post('/item-photo', upload.single('photo'), uploadItemPhoto);

// POST /api/upload/analyze-photo — send image to qwen3-vl:4b, returns { title, description, category, condition, suggestedPrice }
router.post('/analyze-photo', upload.single('photo'), analyzePhotoWithAI);

// POST /api/upload/rapid-batch — Phase 14: upload + AI in one call (up to 20 images)
router.post('/rapid-batch', upload.array('photos', 20), rapidBatchUpload);

// POST /api/upload/batch-analyze — CD2 Phase 2: AI analysis for pre-uploaded Cloudinary URLs (5-20 images)
router.post('/batch-analyze', batchAnalyzeImages);

// CB4: POST /api/upload/ai-feedback — record organizer accept/dismiss/edit on AI suggestion fields
router.post('/ai-feedback', (req, res) => {
  const { field, action } = req.body as { field?: string; action?: string };
  const validActions = ['accepted', 'dismissed', 'edited'];
  if (!field || !validActions.includes(action ?? '')) {
    res.status(400).json({ error: 'field and action (accepted|dismissed|edited) required' });
    return;
  }
  recordAIFeedback(field, action as 'accepted' | 'dismissed' | 'edited');
  res.json({ ok: true });
});

// CB4: GET /api/upload/ai-feedback-stats — diagnostic: acceptance rates per field (admin use)
router.get('/ai-feedback-stats', (req, res) => {
  res.json(getAIFeedbackStats());
});

export default router;
