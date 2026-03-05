import { Router } from 'express';
import multer from 'multer';
import {
  getItemById,
  getItemsBySaleId,
  createItem,
  updateItem,
  deleteItem,
  placeBid,
  importItemsFromCSV,
  analyzeItemTags,
  addItemPhoto,
  removeItemPhoto,
  reorderItemPhotos,
} from '../controllers/itemController';
import { authenticate } from '../middleware/auth';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/:id', getItemById);
router.get('/', getItemsBySaleId);
router.post('/', authenticate, upload.array('images', 5), createItem);
router.put('/:id', authenticate, updateItem);
router.delete('/:id', authenticate, deleteItem);
router.post('/:id/bid', authenticate, placeBid);
router.post('/:id/analyze', authenticate, analyzeItemTags);

// Phase 16: Photo management
router.post('/:id/photos', authenticate, addItemPhoto);
router.delete('/:id/photos/:photoIndex', authenticate, removeItemPhoto);
router.patch('/:id/photos/reorder', authenticate, reorderItemPhotos);

// CSV import endpoint
router.post('/:saleId/import-items', authenticate, upload.single('csv'), importItemsFromCSV);

export default router;
