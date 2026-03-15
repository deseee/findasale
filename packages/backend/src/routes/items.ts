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
  getItemDraftStatus,
  getDraftItemsBySaleId,
  publishItem,
} from '../controllers/itemController';
import { authenticate, optionalAuthenticate, AuthRequest } from '../middleware/auth';
import { getSingleItemLabel } from '../controllers/labelController'; // W2
import { searchItemsHandler, getItemCategoriesHandler } from '../controllers/searchController'; // Sprint 4a

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Sprint 4a: FTS search endpoints — MUST be declared before /:id to avoid param capture
router.get('/search', searchItemsHandler);           // GET /api/items/search?q=...
router.get('/categories', getItemCategoriesHandler); // GET /api/items/categories

// Phase 2B: Rapidfire Mode — Organizer-only draft items for review page
// Must be before /:id to prevent 'drafts' being captured as an item ID
router.get('/drafts', authenticate, getDraftItemsBySaleId); // GET /api/items/drafts?saleId=...

// Phase 2B: Rapidfire Mode draft status polling + publish endpoints
// Declared before /:id to prevent param capture
router.get('/:itemId/draft-status', authenticate, getItemDraftStatus);
router.post('/:itemId/publish', authenticate, publishItem);

// Phase 1: Batch Operations Toolkit — Status-safe validation + dry-run + tags operation
// Declared before /:id to prevent 'bulk' being captured as an item ID.
// Frontend (add-items.tsx) uses this for delete / status / category / price_adjust / isActive / price / tags.
// All operations verify organizer ownership + status-safe constraints before mutating.
router.post('/bulk', authenticate, async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    if (!authReq.user || authReq.user.role !== 'ORGANIZER') {
      return res.status(403).json({ message: 'Organizer access required.' });
    }

    const { itemIds, operation, value, dryRun } = req.body as {
      itemIds?: string[];
      operation?: string;
      value?: unknown;
      dryRun?: boolean;
    };

    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ message: 'itemIds (non-empty array) is required.' });
    }
    if (!operation) {
      return res.status(400).json({ message: 'operation is required.' });
    }

    const { prisma } = await import('../index');

    // Verify every item belongs to a sale owned by the requesting organizer.
    // Fetching all fields needed for status-safe validation.
    const items = await prisma.item.findMany({
      where: { id: { in: itemIds } },
      select: {
        id: true,
        status: true,
        price: true,
        tags: true,
        photoUrls: true,
        sale: { select: { organizer: { select: { userId: true } } } },
      },
    });

    const unauthorised = items.filter(
      (i) => i.sale.organizer.userId !== authReq.user!.id
    );
    if (unauthorised.length > 0) {
      return res.status(403).json({ message: 'One or more items do not belong to your sales.' });
    }

    // Status-safe operation matrix — per spec
    const statusSafeMatrix: Record<string, string[]> = {
      delete: ['AVAILABLE', 'DRAFT'],
      status: ['AVAILABLE', 'DRAFT', 'PENDING_REVIEW', 'PUBLISHED'],
      category: ['AVAILABLE', 'DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'SOLD', 'RESERVED'],
      price: ['AVAILABLE', 'DRAFT', 'PENDING_REVIEW', 'PUBLISHED'],
      price_adjust: ['AVAILABLE', 'DRAFT', 'PENDING_REVIEW', 'PUBLISHED'],
      isActive: ['AVAILABLE', 'DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'SOLD', 'RESERVED'],
      backgroundRemoved: ['AVAILABLE', 'DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'SOLD', 'RESERVED'],
      draftStatus: ['AVAILABLE', 'DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'SOLD', 'RESERVED'],
      tags: ['AVAILABLE', 'DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'SOLD', 'RESERVED'],
    };

    const safeStatuses = statusSafeMatrix[operation];
    const errors: Array<{ itemId: string; reason: string }> = [];
    const confirmedIds: string[] = [];
    const oldValues: Record<string, any> = {};
    const newValues: Record<string, any> = {};

    // Validate status-safe operations
    if (safeStatuses) {
      for (const item of items) {
        if (!safeStatuses.includes(item.status)) {
          errors.push({
            itemId: item.id,
            reason: `Status is ${item.status} — ${operation} only allowed on ${safeStatuses.join('/')} items`,
          });
        } else {
          confirmedIds.push(item.id);
        }
      }
    } else {
      confirmedIds.push(...items.map((i) => i.id));
    }

    // If validation errors exist, return them
    if (errors.length > 0) {
      return res.status(400).json({
        message: `Cannot ${operation} ${errors.length} item(s) — status constraints violated`,
        count: errors.length,
        errors,
      });
    }

    const confirmedItems = items.filter((i) => confirmedIds.includes(i.id));

    // Dry-run mode: query without mutating
    if (dryRun) {
      switch (operation) {
        case 'delete': {
          return res.json({
            message: 'Dry run — no changes applied',
            count: confirmedIds.length,
            affectedIds: confirmedIds,
            wouldChange: true,
            operation: 'delete',
          });
        }

        case 'status': {
          const allowed = ['AVAILABLE', 'SOLD', 'RESERVED'];
          if (!value || !allowed.includes(value as string)) {
            return res.status(400).json({ message: `status value must be one of: ${allowed.join(', ')}` });
          }
          for (const item of confirmedItems) {
            oldValues[item.id] = item.status;
            newValues[item.id] = value as string;
          }
          return res.json({
            message: 'Dry run — no changes applied',
            count: confirmedIds.length,
            affectedIds: confirmedIds,
            wouldChange: true,
            operation: 'status',
            oldValues,
            newValues,
          });
        }

        case 'category': {
          if (typeof value !== 'string' || !value.trim()) {
            return res.status(400).json({ message: 'category value must be a non-empty string.' });
          }
          for (const item of confirmedItems) {
            oldValues[item.id] = item.status; // dry-run shows what field would change
            newValues[item.id] = value as string;
          }
          return res.json({
            message: 'Dry run — no changes applied',
            count: confirmedIds.length,
            affectedIds: confirmedIds,
            wouldChange: true,
            operation: 'category',
            oldValues,
            newValues,
          });
        }

        case 'price_adjust': {
          const pct = typeof value === 'number' ? value : parseFloat(value as string);
          if (isNaN(pct) || pct === 0) {
            return res.status(400).json({ message: 'price_adjust value must be a non-zero number (percent).' });
          }
          const multiplier = 1 + pct / 100;
          for (const item of confirmedItems) {
            if (item.price !== null) {
              oldValues[item.id] = item.price;
              newValues[item.id] = Math.max(0, parseFloat((item.price * multiplier).toFixed(2)));
            }
          }
          return res.json({
            message: 'Dry run — no changes applied',
            count: confirmedIds.length,
            affectedIds: confirmedIds,
            wouldChange: Object.keys(oldValues).length > 0,
            operation: 'price_adjust',
            oldValues,
            newValues,
          });
        }

        case 'price': {
          const price = typeof value === 'number' ? value : parseFloat(value as string);
          if (isNaN(price) || price < 0) {
            return res.status(400).json({ message: 'price value must be a non-negative number.' });
          }
          for (const item of confirmedItems) {
            oldValues[item.id] = item.price;
            newValues[item.id] = Math.max(0, parseFloat(price.toFixed(2)));
          }
          return res.json({
            message: 'Dry run — no changes applied',
            count: confirmedIds.length,
            affectedIds: confirmedIds,
            wouldChange: true,
            operation: 'price',
            oldValues,
            newValues,
          });
        }

        case 'isActive': {
          const isActive = typeof value === 'boolean' ? value : value === 'true' || value === true;
          for (const item of confirmedItems) {
            oldValues[item.id] = false; // assume was hidden
            newValues[item.id] = isActive;
          }
          return res.json({
            message: 'Dry run — no changes applied',
            count: confirmedIds.length,
            affectedIds: confirmedIds,
            wouldChange: true,
            operation: 'isActive',
            oldValues,
            newValues,
          });
        }

        case 'backgroundRemoved': {
          const bgRemoved = typeof value === 'boolean' ? value : value === 'true' || value === true;
          for (const item of confirmedItems) {
            oldValues[item.id] = false;
            newValues[item.id] = bgRemoved;
          }
          return res.json({
            message: 'Dry run — no changes applied',
            count: confirmedIds.length,
            affectedIds: confirmedIds,
            wouldChange: true,
            operation: 'backgroundRemoved',
            oldValues,
            newValues,
          });
        }

        case 'draftStatus': {
          const allowed = ['DRAFT', 'PENDING_REVIEW', 'PUBLISHED'];
          if (!value || !allowed.includes(value as string)) {
            return res.status(400).json({ message: `draftStatus value must be one of: ${allowed.join(', ')}` });
          }
          return res.json({
            message: 'Dry run — no changes applied',
            count: confirmedIds.length,
            affectedIds: confirmedIds,
            wouldChange: true,
            operation: 'draftStatus',
          });
        }

        case 'tags': {
          if (!value || typeof value !== 'object' || !('action' in value) || !('tags' in value)) {
            return res.status(400).json({ message: 'tags operation requires { action: "add"|"remove", tags: string[] }' });
          }
          const { action, tags: tagList } = value as { action: string; tags: string[] };
          if (!Array.isArray(tagList) || !['add', 'remove'].includes(action)) {
            return res.status(400).json({ message: 'Invalid tags operation — action must be "add" or "remove"' });
          }
          return res.json({
            message: 'Dry run — no changes applied',
            count: confirmedIds.length,
            affectedIds: confirmedIds,
            wouldChange: true,
            operation: 'tags',
            details: { action, tagsCount: tagList.length },
          });
        }

        default:
          return res.status(400).json({ message: `Unknown operation: ${operation}` });
      }
    }

    // Actual mutations
    switch (operation) {
      case 'delete':
        await prisma.item.deleteMany({ where: { id: { in: confirmedIds } } });
        return res.json({
          message: `Deleted ${confirmedIds.length} item(s).`,
          count: confirmedIds.length,
          affectedIds: confirmedIds,
          operation: 'delete',
        });

      case 'status': {
        const allowed = ['AVAILABLE', 'SOLD', 'RESERVED'];
        if (!value || !allowed.includes(value as string)) {
          return res.status(400).json({ message: `status value must be one of: ${allowed.join(', ')}` });
        }
        for (const item of confirmedItems) {
          oldValues[item.id] = item.status;
          newValues[item.id] = value as string;
        }
        await prisma.item.updateMany({
          where: { id: { in: confirmedIds } },
          data: { status: value as string },
        });
        return res.json({
          message: `Updated status to ${value} for ${confirmedIds.length} item(s).`,
          count: confirmedIds.length,
          affectedIds: confirmedIds,
          operation: 'status',
          oldValues,
          newValues,
        });
      }

      case 'category': {
        if (typeof value !== 'string' || !value.trim()) {
          return res.status(400).json({ message: 'category value must be a non-empty string.' });
        }
        await prisma.item.updateMany({
          where: { id: { in: confirmedIds } },
          data: { category: (value as string).trim() },
        });
        return res.json({
          message: `Updated category for ${confirmedIds.length} item(s).`,
          count: confirmedIds.length,
          affectedIds: confirmedIds,
          operation: 'category',
        });
      }

      case 'price_adjust': {
        const pct = typeof value === 'number' ? value : parseFloat(value as string);
        if (isNaN(pct) || pct === 0) {
          return res.status(400).json({ message: 'price_adjust value must be a non-zero number (percent).' });
        }
        const multiplier = 1 + pct / 100;

        const updates = confirmedItems
          .filter((i) => i.price !== null)
          .map((i) => {
            const newPrice = Math.max(0, parseFloat((i.price! * multiplier).toFixed(2)));
            oldValues[i.id] = i.price;
            newValues[i.id] = newPrice;
            return prisma.item.update({
              where: { id: i.id },
              data: { price: newPrice },
            });
          });
        await Promise.all(updates);
        return res.json({
          message: `Adjusted prices for ${updates.length} item(s) by ${pct}%.`,
          count: updates.length,
          affectedIds: updates.map((_, i) => confirmedItems.filter((it) => it.price !== null)[i].id),
          operation: 'price_adjust',
          oldValues,
          newValues,
        });
      }

      case 'isActive': {
        const isActive = typeof value === 'boolean' ? value : value === 'true' || value === true;
        await prisma.item.updateMany({
          where: { id: { in: confirmedIds } },
          data: { isActive },
        });
        const action = isActive ? 'activated' : 'hidden';
        return res.json({
          message: `${action.charAt(0).toUpperCase() + action.slice(1)} ${confirmedIds.length} item(s).`,
          count: confirmedIds.length,
          affectedIds: confirmedIds,
          operation: 'isActive',
        });
      }

      case 'price': {
        const price = typeof value === 'number' ? value : parseFloat(value as string);
        if (isNaN(price) || price < 0) {
          return res.status(400).json({ message: 'price value must be a non-negative number.' });
        }
        const finalPrice = Math.max(0, parseFloat(price.toFixed(2)));
        for (const item of confirmedItems) {
          oldValues[item.id] = item.price;
          newValues[item.id] = finalPrice;
        }
        await prisma.item.updateMany({
          where: { id: { in: confirmedIds } },
          data: { price: finalPrice },
        });
        return res.json({
          message: `Updated price to $${finalPrice.toFixed(2)} for ${confirmedIds.length} item(s).`,
          count: confirmedIds.length,
          affectedIds: confirmedIds,
          operation: 'price',
          oldValues,
          newValues,
        });
      }

      case 'backgroundRemoved': {
        const bgRemoved = typeof value === 'boolean' ? value : value === 'true' || value === true;
        await prisma.item.updateMany({
          where: { id: { in: confirmedIds } },
          data: { backgroundRemoved: bgRemoved },
        });
        const action = bgRemoved ? 'applied background removal to' : 'removed background removal from';
        return res.json({
          message: `${action} ${confirmedIds.length} item(s).`,
          count: confirmedIds.length,
          affectedIds: confirmedIds,
          operation: 'backgroundRemoved',
        });
      }

      case 'draftStatus': {
        const allowed = ['DRAFT', 'PENDING_REVIEW', 'PUBLISHED'];
        if (!value || !allowed.includes(value as string)) {
          return res.status(400).json({ message: `draftStatus value must be one of: ${allowed.join(', ')}` });
        }
        await prisma.item.updateMany({
          where: { id: { in: confirmedIds } },
          data: { draftStatus: value as string },
        });
        return res.json({
          message: `Updated draftStatus to ${value} for ${confirmedIds.length} item(s).`,
          count: confirmedIds.length,
          affectedIds: confirmedIds,
          operation: 'draftStatus',
        });
      }

      case 'tags': {
        // Phase 1: Bulk tag operations (add/remove)
        if (!value || typeof value !== 'object' || !('action' in value) || !('tags' in value)) {
          return res.status(400).json({ message: 'tags operation requires { action: "add"|"remove", tags: string[] }' });
        }
        const { action, tags: tagList } = value as { action: string; tags: string[] };
        if (!Array.isArray(tagList) || !['add', 'remove'].includes(action)) {
          return res.status(400).json({ message: 'Invalid tags operation — action must be "add" or "remove"' });
        }

        // Curated tags constant (mirrors tagController)
        const CURATED_TAGS = [
          'mid-century-modern', 'art-deco', 'victorian', 'craftsman', 'industrial',
          'farmhouse', 'bohemian', 'danish-modern', 'scandinavian', 'atomic-age',
          'hollywood-regency', 'arts-and-crafts', 'colonial', 'transitional', 'contemporary',
          'walnut', 'oak', 'teak', 'brass', 'cast-iron',
          'wicker', 'leather', 'ceramic', 'glass', 'chrome',
          'hand-painted', 'signed', 'original', 'limited-edition', 'first-edition',
          'handmade', 'restored', 'vintage-1950s', 'vintage-1960s', 'vintage-1970s',
          'collectible', 'antique', 'sterling-silver', 'costume-jewelry', 'fine-art',
          'folk-art', 'architectural-salvage', 'garden-decor', 'holiday-decor', 'musical',
        ];

        const invalidTags = tagList.filter((t) => !CURATED_TAGS.includes(t.toLowerCase()));
        if (invalidTags.length > 0) {
          return res.status(400).json({
            message: `Invalid tag(s): ${invalidTags.join(', ')} — use only curated tags`,
          });
        }

        // Normalize tags to lowercase
        const normalizedTags = tagList.map((t) => t.toLowerCase());

        // Apply tags operation
        for (const item of confirmedItems) {
          let updatedTags = [...item.tags];
          if (action === 'add') {
            for (const tag of normalizedTags) {
              if (!updatedTags.includes(tag)) {
                updatedTags.push(tag);
              }
            }
          } else {
            // remove
            updatedTags = updatedTags.filter((t) => !normalizedTags.includes(t));
          }
          oldValues[item.id] = item.tags;
          newValues[item.id] = updatedTags;
          await prisma.item.update({
            where: { id: item.id },
            data: { tags: updatedTags },
          });
        }

        return res.json({
          message: `${action === 'add' ? 'Added' : 'Removed'} tags for ${confirmedIds.length} item(s).`,
          count: confirmedIds.length,
          affectedIds: confirmedIds,
          operation: 'tags',
          oldValues,
          newValues,
        });
      }

      default:
        return res.status(400).json({ message: `Unknown operation: ${operation}` });
    }
  } catch (error) {
    console.error('Bulk item operation error:', error);
    res.status(500).json({ message: 'Server error during bulk operation.' });
  }
});

// Phase 2: Batch Photos API — add/remove photos across multiple items
router.post('/bulk/photos', authenticate, async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    if (!authReq.user || authReq.user.role !== 'ORGANIZER') {
      return res.status(403).json({ message: 'Organizer access required.' });
    }

    const { itemIds, operation, photoUrls, dryRun } = req.body as {
      itemIds?: string[];
      operation?: string;
      photoUrls?: string[];
      dryRun?: boolean;
    };

    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ message: 'itemIds (non-empty array) is required.' });
    }
    if (!operation) {
      return res.status(400).json({ message: 'operation is required.' });
    }
    if (!photoUrls || !Array.isArray(photoUrls) || photoUrls.length === 0) {
      return res.status(400).json({ message: 'photoUrls (non-empty array) is required.' });
    }

    // Phase 2 constraints per spec
    if (itemIds.length > 50) {
      return res.status(400).json({ message: 'Max 50 items per request.' });
    }
    if (photoUrls.length > 5) {
      return res.status(400).json({ message: 'Max 5 photos per request.' });
    }

    if (!['add', 'remove'].includes(operation)) {
      return res.status(400).json({ message: 'operation must be "add" or "remove".' });
    }

    const { prisma } = await import('../index');

    // Verify ownership
    const items = await prisma.item.findMany({
      where: { id: { in: itemIds } },
      select: {
        id: true,
        photoUrls: true,
        sale: { select: { organizer: { select: { userId: true } } } },
      },
    });

    const unauthorised = items.filter(
      (i) => i.sale.organizer.userId !== authReq.user!.id
    );
    if (unauthorised.length > 0) {
      return res.status(403).json({ message: 'One or more items do not belong to your sales.' });
    }

    // Dry-run mode
    if (dryRun) {
      return res.json({
        message: 'Dry run — no changes applied',
        count: items.length,
        affectedIds: items.map((i) => i.id),
        wouldChange: true,
        operation,
        photosCount: photoUrls.length,
      });
    }

    // Apply mutations
    const confirmedIds: string[] = [];

    if (operation === 'add') {
      for (const item of items) {
        // Check max 5 photos per item constraint
        const currentCount = item.photoUrls.length;
        const newPhotos = photoUrls.filter((url) => !item.photoUrls.includes(url));

        if (currentCount + newPhotos.length > 5) {
          continue; // Skip items that would exceed 5 photos
        }

        if (newPhotos.length > 0) {
          await prisma.item.update({
            where: { id: item.id },
            data: {
              photoUrls: [...item.photoUrls, ...newPhotos],
            },
          });
          confirmedIds.push(item.id);
        }
      }
      return res.json({
        message: `Added photo(s) to ${confirmedIds.length} item(s)`,
        count: confirmedIds.length,
        affectedIds: confirmedIds,
        operation: 'add',
      });
    } else {
      // remove
      for (const item of items) {
        const filtered = item.photoUrls.filter((url) => !photoUrls.includes(url));
        if (filtered.length !== item.photoUrls.length) {
          // At least one URL was removed
          await prisma.item.update({
            where: { id: item.id },
            data: {
              photoUrls: filtered,
            },
          });
          confirmedIds.push(item.id);
        }
      }
      return res.json({
        message: `Removed photo(s) from ${confirmedIds.length} item(s)`,
        count: confirmedIds.length,
        affectedIds: confirmedIds,
        operation: 'remove',
      });
    }
  } catch (error) {
    console.error('Bulk photos operation error:', error);
    res.status(500).json({ message: 'Server error during bulk photos operation.' });
  }
});

router.get('/:id', optionalAuthenticate, getItemById);
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
