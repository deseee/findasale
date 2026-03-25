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
import {
  listHaulPosts,
  createHaulPost,
  getSaleHaulPosts,
  addReaction,
  removeReaction,
} from '../controllers/haulPostController';

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

// Haul post routes (Feature #88)
router.get('/haul-posts', listHaulPosts);  // public trending feed
router.post('/haul-posts', authenticate, createHaulPost);  // auth required
router.get('/sales/:saleId/haul-posts', getSaleHaulPosts);  // public
router.post('/:photoId/reactions', authenticate, addReaction);  // auth required
router.delete('/:photoId/reactions', authenticate, removeReaction);  // auth required

export default router;
