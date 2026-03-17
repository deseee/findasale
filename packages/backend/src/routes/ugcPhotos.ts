import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  submitPhoto,
  getApprovedPhotosForSale,
  getApprovedPhotosForItem,
  getMyPhotos,
  likePhoto,
  unlikePhoto,
  moderatePhoto,
  getPendingPhotosForOrganizer,
} from '../controllers/ugcPhotoController';

const router = Router();

// Public routes
router.get('/sale/:saleId', getApprovedPhotosForSale);
router.get('/item/:itemId', getApprovedPhotosForItem);

// Authenticated routes
router.post('/', authenticate, submitPhoto);
router.get('/my', authenticate, getMyPhotos);
router.post('/:photoId/like', authenticate, likePhoto);
router.delete('/:photoId/like', authenticate, unlikePhoto);

// Organizer routes (authenticated)
router.patch('/:photoId/moderate', authenticate, moderatePhoto);
router.get('/moderation/pending', authenticate, getPendingPhotosForOrganizer);

export default router;
