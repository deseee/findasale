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
import { authenticate, AuthRequest } from '../middleware/auth';
import { getSingleItemLabel } from '../controllers/labelController'; // W2
import { searchItemsHandler, getItemCategoriesHandler } from '../controllers/searchController'; // Sprint 4a

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Sprint 4a: FTS search endpoints — MUST be declared before /:id to avoid param capture
router.get('/search', searchItemsHandler);           // GET /api/items/search?q=...
router.get('/categories', getItemCategoriesHandler); // GET /api/items/categories

// Bulk operations — declared before /:id to prevent 'bulk' being captured as an item ID.
// Frontend (add-items.tsx) uses this for delete / status / category / price_adjust.
// All operations verify organizer ownership before mutating.
router.post('/bulk', authenticate, async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    if (!authReq.user || authReq.user.role !== 'ORGANIZER') {
      return res.status(403).json({ message: 'Organizer access required.' });
    }

    const { itemIds, operation, value } = req.body as {
      itemIds?: string[];
      operation?: string;
      value?: unknown;
    };

    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ message: 'itemIds (non-empty array) is required.' });
    }
    if (!operation) {
      return res.status(400).json({ message: 'operation is required.' });
    }

    const { prisma } = await import('../index');

    // Verify every item belongs to a sale owned by the requesting organizer.
    // Fetching minimal fields — we only need the ownership chain.
    const items = await prisma.item.findMany({
      where: { id: { in: itemIds } },
      select: {
        id: true,
        price: true,
        sale: { select: { organizer: { select: { userId: true } } } },
      },
    });

    const unauthorised = items.filter(
      (i) => i.sale.organizer.userId !== authReq.user!.id
    );
    if (unauthorised.length > 0) {
      return res.status(403).json({ message: 'One or more items do not belong to your sales.' });
    }

    const confirmedIds = items.map((i) => i.id);

    switch (operation) {
      case 'delete':
        await prisma.item.deleteMany({ where: { id: { in: confirmedIds } } });
        return res.json({ message: `Deleted ${confirmedIds.length} item(s).`, count: confirmedIds.length });

      case 'status': {
        const allowed = ['AVAILABLE', 'SOLD', 'RESERVED'];
        if (!value || !allowed.includes(value as string)) {
          return res.status(400).json({ message: `status value must be one of: ${allowed.join(', ')}` });
        }
        await prisma.item.updateMany({
          where: { id: { in: confirmedIds } },
          data: { status: value as string },
        });
        return res.json({ message: `Updated status to ${value} for ${confirmedIds.length} item(s).` });
      }

      case 'category': {
        if (typeof value !== 'string' || !value.trim()) {
          return res.status(400).json({ message: 'category value must be a non-empty string.' });
        }
        await prisma.item.updateMany({
          where: { id: { in: confirmedIds } },
          data: { category: (value as string).trim() },
        });
        return res.json({ message: `Updated category for ${confirmedIds.length} item(s).` });
      }

      case 'price_adjust': {
        // value is a percent change (e.g. -10 = 10% off, 20 = 20% increase).
        const pct = typeof value === 'number' ? value : parseFloat(value as string);
        if (isNaN(pct) || pct === 0) {
          return res.status(400).json({ message: 'price_adjust value must be a non-zero number (percent).' });
        }
        const multiplier = 1 + pct / 100;

        // Apply adjustment per item — Prisma doesn't support multiply-in-place.
        // Null prices are left untouched (item may be auction-only).
        const updates = items
          .filter((i) => i.price !== null)
          .map((i) =>
            prisma.item.update({
              where: { id: i.id },
              data: { price: Math.max(0, parseFloat((i.price! * multiplier).toFixed(2))) },
            })
          );
        await Promise.all(updates);
        return res.json({ message: `Adjusted prices for ${updates.length} item(s) by ${pct}%.` });
      }

      default:
        return res.status(400).json({ message: `Unknown operation: ${operation}` });
    }
  } catch (error) {
    console.error('Bulk item operation error:', error);
    res.status(500).json({ message: 'Server error during bulk operation.' });
  }
});

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

    // Fetch up to 5 recently sold items in the same category for comparable pricing
    const { prisma } = await import('../index');
    const recentComps = await prisma.item.findMany({
      where: {
        category: { equals: category, mode: 'insensitive' },
        status: 'SOLD',
        price: { not: null, gt: 0 },
      },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: { title: true, price: true, updatedAt: true },
    });

    const compData = recentComps.map(c => ({
      title: c.title,
      price: c.price!,
      soldAt: c.updatedAt.toISOString().split('T')[0],
    }));

    // Import here to avoid circular dependencies
    const { suggestPrice } = await import('../services/cloudAIService');
    const suggestion = await suggestPrice(title, category, condition, compData);

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
