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
import { getSingleItemLabel } from '../controllers/labelController'; // W2

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

// W2: Label PDF
router.get('/:id/label', authenticate, getSingleItemLabel);

// CD2 Phase 3: AI Price suggestions
router.post('/ai/price-suggest', authenticate, async (req, res) => {
  try {
    const { title, category, condition } = req.body;

    if (!title || !category || !condition) {
      return res.status(400).json({
        error: 'title, category, and condition are required',
      });
    }

    // Import here to avoid circular dependencies
    const { suggestPrice } = await import('../services/cloudAIService');
    const suggestion = await suggestPrice(title, category, condition);

    res.json(suggestion);
  } catch (error) {
    console.error('Price suggestion error:', error);
    res.status(500).json({
      error: 'Failed to generate price suggestion',
      low: 1,
      high: 50,
      suggested: 10,
      reasoning: 'Manual pricing recommended',
    });
  }
});

export default router;
