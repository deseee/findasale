import { Router } from 'express';
import {
  listSales,
  getMySales,
  getSale,
  createSale,
  updateSale,
  updateSaleStatus,
  deleteSale,
  searchSales,
  generateQRCode
} from '../controllers/saleController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Public routes
router.get('/', listSales);
router.get('/search', searchSales);

// /mine must be registered before /:id so Express doesn't treat "mine" as an ID
router.get('/mine', authenticate, getMySales);

router.get('/:id', getSale);
router.post('/', authenticate, createSale);
router.put('/:id', authenticate, updateSale);
router.patch('/:id/status', authenticate, updateSaleStatus);
router.delete('/:id', authenticate, deleteSale);
router.post('/:id/generate-qr', authenticate, generateQRCode);

export default router;
