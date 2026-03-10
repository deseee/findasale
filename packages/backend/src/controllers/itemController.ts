import { Request, Response } from 'express';
import { parse } from 'csv-parse';
import { AuthRequest } from '../middleware/auth';
import { Readable } from 'stream';
import { prisma } from '../index';
import axios from 'axios';
import FormData from 'form-data';
import { z } from 'zod';
import { getIO } from '../lib/socket'; // V1: live bidding broadcast
import { fireWebhooks } from '../services/webhookService'; // X1
import { analyzeItemImage, isCloudAIAvailable } from '../services/cloudAIService'; // CB5
import { notifyPriceDropAlerts } from '../services/priceDropService'; // Price drop alerts

// U1: Fire-and-forget embedding helper — never throws, non-blocking
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const OLLAMA_EMBED_MODEL = 'nomic-embed-text';

function scheduleItemEmbedding(itemId: string, text: string): void {
  setImmediate(async () => {
    try {
      const embedRes = await axios.post(
        `${OLLAMA_URL}/api/embeddings`,
        { model: OLLAMA_EMBED_MODEL, prompt: text },
        { timeout: 10000 }
      );
      const vec: number[] | undefined = embedRes.data?.embedding;
      if (!Array.isArray(vec) || vec.length === 0) return;
      await prisma.item.update({ where: { id: itemId }, data: { embedding: vec } });
    } catch {
      // Ollama unavailable — embedding stays empty, search falls back to text
    }
  });
}

// H7: Zod schema for CSV row validation — prevents injection and malformed data
const csvRowSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title too long (max 200 chars)').trim(),
  description: z.string().max(2000, 'Description too long (max 2000 chars)').optional().default(''),
  price: z.string().optional(),
  auctionStartPrice: z.string().optional(),
  bidIncrement: z.string().optional(),
  auctionEndTime: z.string().optional(),
  status: z.enum(['AVAILABLE', 'SOLD', 'RESERVED', 'AUCTION_ENDED']).optional().default('AVAILABLE'),
  photoUrls: z.string().optional(),
  category: z.string().max(50).optional(),
  condition: z.string().max(50).optional(),
  // CD2 Phase 4: Reverse Auction
  reverseAuction: z.string().optional(),
  reverseDailyDrop: z.string().optional(),
  reverseFloorPrice: z.string().optional(),
  reverseStartDate: z.string().optional(),
});

// Helper function to convert string to number safely
const toNumber = (value: string | undefined | null): number | null => {
  if (!value) return null;
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
};

// Simulated image upload function - replace with your actual upload logic
const uploadImages = async (files: Express.Multer.File[]): Promise<string[]> => {
  // Example: upload to Cloudinary and return URLs
  // Replace with your own implementation
  return files.map(file => `https://example.com/uploads/${file.filename}`);
};

// Bulk import items from CSV
export const importItemsFromCSV = async (req: AuthRequest, res: Response) => {
  try {
    const { saleId } = req.params;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    if (!req.user || req.user.role !== 'ORGANIZER') {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }

    // Check if sale exists and belongs to organizer
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        organizer: {
          select: { userId: true }
        }
      }
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    if (sale.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'Access denied. Not your sale.' });
    }

    // Parse CSV
    const records: any[] = [];
    const parser = Readable.from(file.buffer).pipe(
      parse({
        columns: true,
        skip_empty_lines: true
      })
    );

    for await (const record of parser) {
      records.push(record);
    }

    // H7: Validate and sanitise each row with Zod before inserting
    const itemsToCreate: any[] = [];
    const rowErrors: { row: number; errors: string[] }[] = [];

    records.forEach((record, idx) => {
      const result = csvRowSchema.safeParse(record);
      if (!result.success) {
        rowErrors.push({
          row: idx + 2, // +2 for 1-indexed + header row
          errors: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
        });
      } else {
        const d = result.data;
        itemsToCreate.push({
          saleId,
          title: d.title,
          description: d.description || '',
          price: toNumber(d.price),
          auctionStartPrice: toNumber(d.auctionStartPrice),
          bidIncrement: toNumber(d.bidIncrement),
          auctionEndTime: d.auctionEndTime ? new Date(d.auctionEndTime) : null,
          status: d.status || 'AVAILABLE',
          category: d.category || null,
          condition: d.condition || null,
          photoUrls: d.photoUrls ? d.photoUrls.split(',').map((url: string) => url.trim()) : [],
          // CD2 Phase 4: Reverse Auction
          reverseAuction: d.reverseAuction === 'true' || d.reverseAuction === '1',
          reverseDailyDrop: d.reverseDailyDrop ? Math.round(parseFloat(d.reverseDailyDrop) * 100) : null,
          reverseFloorPrice: d.reverseFloorPrice ? Math.round(parseFloat(d.reverseFloorPrice) * 100) : null,
          reverseStartDate: d.reverseStartDate ? new Date(d.reverseStartDate) : null,
          embedding: [], // embedding default dropped in migration — must supply explicitly; Ollama will backfill async
        });
      }
    });

    if (itemsToCreate.length === 0) {
      return res.status(400).json({
        message: 'No valid rows found — all rows failed validation',
        errors: rowErrors,
      });
    }

    // Create items in database
    const createdItems = await prisma.item.createMany({
      data: itemsToCreate,
      skipDuplicates: false
    });

    res.json({
      message: `Successfully imported ${createdItems.count} items${rowErrors.length > 0 ? ` (${rowErrors.length} row(s) skipped due to validation errors)` : ''}`,
      itemCount: createdItems.count,
      ...(rowErrors.length > 0 ? { rowErrors } : {}),
    });
  } catch (error: any) {
    console.error('CSV import error:', error);
    res.status(500).json({ 
      message: 'Failed to import items from CSV', 
      error: error.message 
    });
  }
};

export const getItemById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const authReq = req as AuthRequest;

    const item = await prisma.item.findUnique({
      where: { id },
      include: {
        sale: {
          select: {
            title: true,
            id: true,
            organizerId: true,
            status: true,
            organizer: {
              select: { userId: true }
            }
          }
        }
      }
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Organizer who owns the sale can always access their items (e.g. to edit/un-hide them)
    const isOwner = authReq.user?.id === item.sale.organizer.userId;

    // For everyone else, enforce public visibility rules
    if (!isOwner && (!item.isActive || item.sale.status !== 'PUBLISHED')) {
      return res.status(404).json({ message: 'Item not found' });
    }

    res.json(item);
  } catch (error) {
    console.error('Error fetching item:', error);
    res.status(500).json({ message: 'Server error while fetching item' });
  }
};

export const getItemsBySaleId = async (req: Request, res: Response) => {
  try {
    const { saleId } = req.query;
    const items = await prisma.item.findMany({
      where: { saleId: saleId as string },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    res.json(items);
  } catch (error) {
    console.error('Error fetching items:', error);
    res.status(500).json({ message: 'Server error while fetching items' });
  }
};

/**
 * Create a new item with image upload and optional AI tagging
 * Expects multipart/form-data with:
 * - saleId: string
 * - title: string
 * - description?: string
 * - price?: number
 * - auctionStartPrice?: number
 * - bidIncrement?: number
 * - auctionEndTime?: string (ISO date)
 * - status?: string (default 'AVAILABLE')
 * - category?: string
 * - condition?: string
 * - images: file(s) (field name 'images')
 */
export const createItem = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'ORGANIZER') {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }

    const { saleId, title, description, price, auctionStartPrice, auctionReservePrice, bidIncrement, auctionEndTime, status, category, condition, shippingAvailable, shippingPrice, reverseAuction, reverseDailyDrop, reverseFloorPrice, reverseStartDate, listingType, isAiTagged } = req.body;
    const files = req.files as Express.Multer.File[];

    // Check if sale exists and belongs to organizer
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        organizer: {
          select: { userId: true }
        }
      }
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    if (sale.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'Access denied. Not your sale.' });
    }

    // Resolve photo URLs: accept pre-uploaded URLs from body, or upload files now
    let photoUrls: string[] = [];
    if (files && files.length > 0) {
      photoUrls = await uploadImages(files);
    } else if (req.body.photoUrls) {
      photoUrls = Array.isArray(req.body.photoUrls) ? req.body.photoUrls : [req.body.photoUrls];
    }

    // CB5: Legacy standalone tagger removed. AI tagging is now done via
    // POST /upload/analyze-photo (cloudAIService: Google Vision + Claude Haiku).
    // Organizers review suggestions before saving — no silent pre-fill.
    const suggestedTags: string[] = [];

    // Create the item in database
    const item = await prisma.item.create({
      data: {
        saleId,
        title,
        description: description || '',
        price: price ? parseFloat(price) : null,
        auctionStartPrice: auctionStartPrice ? parseFloat(auctionStartPrice) : null,
        auctionReservePrice: auctionReservePrice ? parseFloat(auctionReservePrice) : null,
        bidIncrement: bidIncrement ? parseFloat(bidIncrement) : null,
        auctionEndTime: auctionEndTime ? new Date(auctionEndTime) : null,
        status: status || 'AVAILABLE',
        category: category || null,
        condition: condition || null,
        photoUrls,
        // W1: Shipping
        shippingAvailable: shippingAvailable === true || shippingAvailable === 'true',
        shippingPrice: shippingPrice ? parseFloat(shippingPrice) : null,
        // B1: Listing type — FIXED | AUCTION | REVERSE_AUCTION | LIVE_DROP | POS
        listingType: listingType || 'FIXED',
        // CD2 Phase 4: Reverse Auction — deprecated, maintained for backwards compat
        reverseAuction: reverseAuction === true || reverseAuction === 'true',
        reverseDailyDrop: reverseDailyDrop ? parseInt(reverseDailyDrop, 10) : null,
        reverseFloorPrice: reverseFloorPrice ? parseInt(reverseFloorPrice, 10) : null,
        reverseStartDate: reverseStartDate ? new Date(reverseStartDate) : null,
        // B2: AI tagging disclosure
        isAiTagged: isAiTagged === true || isAiTagged === 'true',
        // U1: satisfies NOT NULL constraint; scheduleItemEmbedding fills it async
        embedding: [],
      }
    });

    // Return item with suggested tags (could be used by frontend to pre-fill fields)
    res.status(201).json({
      ...item,
      suggestedTags, // optional
    });

    // U1: Queue embedding generation (non-blocking — after response sent)
    scheduleItemEmbedding(item.id, [title, description, category].filter(Boolean).join(' '));
  } catch (error) {
    console.error('Error creating item:', error);
    res.status(500).json({ message: 'Server error while creating item' });
  }
};

export const updateItem = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'ORGANIZER') {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }

    const { id } = req.params;
    const { title, description, price, quantity, auctionStartPrice, auctionReservePrice, bidIncrement, auctionEndTime, status, photoUrls, category, condition, shippingAvailable, shippingPrice, reverseAuction, reverseDailyDrop, reverseFloorPrice, reverseStartDate, listingType, isAiTagged } = req.body;

    // Check if item exists and belongs to organizer's sale
    const item = await prisma.item.findUnique({
      where: { id },
      include: { sale: { include: { organizer: { select: { userId: true } } } } }
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    if (item.sale.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'Access denied. Not your item.' });
    }

    const previousItem = item; // Store previous status for change detection
    const updatedItem = await prisma.item.update({
      where: { id },
      data: {
        title,
        description: description || '',
        price: price !== undefined ? (price ? parseFloat(price) : null) : undefined,
        quantity: quantity !== undefined ? (quantity ? parseInt(quantity, 10) : undefined) : undefined,
        auctionStartPrice: auctionStartPrice !== undefined ? (auctionStartPrice ? parseFloat(auctionStartPrice) : null) : undefined,
        auctionReservePrice: auctionReservePrice !== undefined ? (auctionReservePrice ? parseFloat(auctionReservePrice) : null) : undefined,
        bidIncrement: bidIncrement !== undefined ? (bidIncrement ? parseFloat(bidIncrement) : null) : undefined,
        auctionEndTime: auctionEndTime ? new Date(auctionEndTime) : null,
        status,
        category: category !== undefined ? (category || null) : undefined,
        condition: condition !== undefined ? (condition || null) : undefined,
        photoUrls: photoUrls || undefined,
        // W1: Shipping
        ...(shippingAvailable !== undefined && { shippingAvailable: shippingAvailable === true || shippingAvailable === 'true' }),
        ...(shippingPrice !== undefined && { shippingPrice: shippingPrice ? parseFloat(shippingPrice) : null }),
        // B1: Listing type — FIXED | AUCTION | REVERSE_AUCTION | LIVE_DROP | POS
        ...(listingType !== undefined && { listingType }),
        // CD2 Phase 4: Reverse Auction — deprecated, maintained for backwards compat
        ...(reverseAuction !== undefined && { reverseAuction: reverseAuction === true || reverseAuction === 'true' }),
        ...(reverseDailyDrop !== undefined && { reverseDailyDrop: reverseDailyDrop ? parseInt(reverseDailyDrop, 10) : null }),
        ...(reverseFloorPrice !== undefined && { reverseFloorPrice: reverseFloorPrice ? parseInt(reverseFloorPrice, 10) : null }),
        ...(reverseStartDate !== undefined && { reverseStartDate: reverseStartDate ? new Date(reverseStartDate) : null }),
        // B2: AI tagging disclosure
        ...(isAiTagged !== undefined && { isAiTagged: isAiTagged === true || isAiTagged === 'true' }),
      }
    });

    res.json(updatedItem);

    // Feature: Item Waitlist — notify waitlist when item becomes available
    if (status === 'AVAILABLE' && previousItem.status !== 'AVAILABLE') {
      const { notifyWaitlist } = require('../controllers/waitlistController');
      setImmediate(() =>
        notifyWaitlist(id).catch((err: unknown) => console.error('[waitlist] Failed to notify waitlist:', err))
      );
    }

    // Price Drop Alerts — notify users who favorited this item if price dropped
    if (price !== undefined) {
      const oldPrice = previousItem.price;
      const newPrice = updatedItem.price;
      setImmediate(() =>
        notifyPriceDropAlerts(id, oldPrice, newPrice).catch((err: unknown) =>
          console.error('[priceDrop] Failed to send alerts:', (err as Error).message)
        )
      );
    }

    // U1: Re-embed when searchable fields change
    if (title || description || category) {
      scheduleItemEmbedding(id, [
        title ?? updatedItem.title,
        description ?? updatedItem.description,
        category ?? updatedItem.category,
      ].filter(Boolean).join(' '));
    }
  } catch (error) {
    console.error('Error updating item:', error);
    res.status(500).json({ message: 'Server error while updating item' });
  }
};

export const deleteItem = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'ORGANIZER') {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }

    const { id } = req.params;

    // Check if item exists and belongs to organizer's sale
    const item = await prisma.item.findUnique({
      where: { id },
      include: { sale: { include: { organizer: { select: { userId: true } } } } }
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    if (item.sale.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'Access denied. Not your item.' });
    }

    await prisma.item.delete({
      where: { id }
    });

    res.json({ message: 'Item deleted successfully' });
  } catch (error) {
    console.error('Error deleting item:', error);
    res.status(500).json({ message: 'Server error while deleting item' });
  }
};

/**
 * Analyze an existing item's photos with the AI tagger.
 * Downloads the first photo URL and sends it to the tagger service.
 * Returns { suggestedTags: string[] } — non-fatal if tagger is unavailable.
 */
export const analyzeItemTags = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'ORGANIZER') {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }

    const { id } = req.params;

    const item = await prisma.item.findUnique({
      where: { id },
      include: { sale: { include: { organizer: { select: { userId: true } } } } }
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    if (item.sale.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'Access denied. Not your item.' });
    }

    const firstPhotoUrl = item.photoUrls?.[0];
    if (!firstPhotoUrl) {
      return res.json({ suggestedTags: [] });
    }

    // CB5: Replaced legacy standalone tagger with cloudAIService (Google Vision + Claude Haiku).
    let suggestedTags: string[] = [];
    if (isCloudAIAvailable()) {
      try {
        const imageResponse = await axios.get(firstPhotoUrl, {
          responseType: 'arraybuffer',
          timeout: 10000,
        });
        const imageBuffer = Buffer.from(imageResponse.data);
        const aiResult = await analyzeItemImage(imageBuffer, 'image/jpeg');
        if (aiResult?.tags) {
          suggestedTags = aiResult.tags;
        }
      } catch (err: any) {
        console.warn(`[cloudAI/analyze] error for item "${id}": ${err.message} — returning empty tags`);
      }
    }

    res.json({ suggestedTags });
  } catch (error) {
    console.error('Error analyzing item tags:', error);
    res.status(500).json({ message: 'Server error while analyzing tags' });
  }
};

// -- Phase 16: Advanced photo pipeline

// Helper: fetch item and verify organizer ownership
const getItemForOrganizer = async (id: string, userId: string) => {
  const item = await prisma.item.findUnique({
    where: { id },
    include: { sale: { include: { organizer: { select: { userId: true } } } } },
  });
  if (!item) return null;
  if (item.sale.organizer.userId !== userId) return null;
  return item;
};

/**
 * POST /api/items/:id/photos
 * Body: { url: string } — a Cloudinary URL already uploaded via /api/upload/item-photo
 * Appends the URL to item.photoUrls. Returns { photoUrls }.
 */
export const addItemPhoto = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'ORGANIZER') {
      return res.status(403).json({ message: 'Access denied' });
    }
    const { id } = req.params;
    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ message: 'url is required' });
    }
    const item = await getItemForOrganizer(id, req.user.id);
    if (!item) return res.status(404).json({ message: 'Item not found or access denied' });

    const updated = await prisma.item.update({
      where: { id },
      data: { photoUrls: [...item.photoUrls, url] },
    });
    res.json({ photoUrls: updated.photoUrls });
  } catch (error) {
    console.error('addItemPhoto error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * DELETE /api/items/:id/photos/:photoIndex
 * Removes the photo at the given 0-based index. Returns { photoUrls }.
 */
export const removeItemPhoto = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'ORGANIZER') {
      return res.status(403).json({ message: 'Access denied' });
    }
    const { id, photoIndex } = req.params;
    const idx = parseInt(photoIndex, 10);
    if (isNaN(idx)) return res.status(400).json({ message: 'Invalid photoIndex' });

    const item = await getItemForOrganizer(id, req.user.id);
    if (!item) return res.status(404).json({ message: 'Item not found or access denied' });
    if (idx < 0 || idx >= item.photoUrls.length) {
      return res.status(400).json({ message: 'Photo index out of range' });
    }

    const newUrls = item.photoUrls.filter((_, i) => i !== idx);
    const updated = await prisma.item.update({
      where: { id },
      data: { photoUrls: newUrls },
    });
    res.json({ photoUrls: updated.photoUrls });
  } catch (error) {
    console.error('removeItemPhoto error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * PATCH /api/items/:id/photos/reorder
 * Body: { photoUrls: string[] } — same URLs in a new order.
 * Validates that no new URLs are injected. Returns { photoUrls }.
 */
export const reorderItemPhotos = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'ORGANIZER') {
      return res.status(403).json({ message: 'Access denied' });
    }
    const { id } = req.params;
    const { photoUrls } = req.body;
    if (!Array.isArray(photoUrls)) {
      return res.status(400).json({ message: 'photoUrls must be an array' });
    }

    const item = await getItemForOrganizer(id, req.user.id);
    if (!item) return res.status(404).json({ message: 'Item not found or access denied' });

    // Ensure the new array contains exactly the same URLs (no injection)
    const existing = new Set(item.photoUrls);
    const allValid = photoUrls.every((u: any) => typeof u === 'string' && existing.has(u));
    if (!allValid || photoUrls.length !== item.photoUrls.length) {
      return res.status(400).json({ message: 'Invalid photoUrls — can only reorder existing photos' });
    }

    const updated = await prisma.item.update({
      where: { id },
      data: { photoUrls },
    });
    res.json({ photoUrls: updated.photoUrls });
  } catch (error) {
    console.error('reorderItemPhotos error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// -- End Phase 16 --

export const bulkUpdateItems = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'ORGANIZER') {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }

    const { itemIds, operation, value } = req.body;

    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ message: 'itemIds must be a non-empty array' });
    }

    if (!['delete', 'status', 'category', 'price_adjust'].includes(operation)) {
      return res.status(400).json({ message: 'Invalid operation' });
    }

    // Fetch all items to verify organizer ownership
    const items = await prisma.item.findMany({
      where: { id: { in: itemIds } },
      include: { sale: { include: { organizer: { select: { userId: true } } } } }
    });

    // Verify all items belong to the authenticated organizer
    const ownedItems = items.filter(item => item.sale.organizer.userId === req.user!.id);

    if (ownedItems.length === 0) {
      return res.status(403).json({ message: 'You do not own any of these items' });
    }

    let updated = 0;
    let failed = itemIds.length - ownedItems.length;

    try {
      if (operation === 'delete') {
        const result = await prisma.item.deleteMany({
          where: { id: { in: ownedItems.map(i => i.id) } }
        });
        updated = result.count;
      } else if (operation === 'status') {
        if (!['AVAILABLE', 'SOLD', 'ON_HOLD'].includes(value)) {
          return res.status(400).json({ message: 'Invalid status value' });
        }
        const result = await prisma.item.updateMany({
          where: { id: { in: ownedItems.map(i => i.id) } },
          data: { status: value }
        });
        updated = result.count;
      } else if (operation === 'category') {
        if (!value || typeof value !== 'string' || value.length > 50) {
          return res.status(400).json({ message: 'Invalid category value' });
        }
        const result = await prisma.item.updateMany({
          where: { id: { in: ownedItems.map(i => i.id) } },
          data: { category: value }
        });
        updated = result.count;
      } else if (operation === 'price_adjust') {
        const percentChange = parseFloat(value);
        if (isNaN(percentChange)) {
          return res.status(400).json({ message: 'Invalid price adjustment value' });
        }

        // Update each item with price adjustment, ensuring no item goes below $1
        for (const item of ownedItems) {
          if (item.price && item.price > 0) {
            const newPrice = Math.max(1, item.price * (1 + percentChange / 100));
            await prisma.item.update({
              where: { id: item.id },
              data: { price: newPrice }
            });
            updated++;
          } else if (!item.price && item.auctionStartPrice && item.auctionStartPrice > 0) {
            // For auction items, adjust the auction start price
            const newPrice = Math.max(1, item.auctionStartPrice * (1 + percentChange / 100));
            await prisma.item.update({
              where: { id: item.id },
              data: { auctionStartPrice: newPrice }
            });
            updated++;
          }
        }
      }
    } catch (error) {
      console.error('Error performing bulk operation:', error);
      return res.status(500).json({ message: 'Error performing bulk operation' });
    }

    res.json({ updated, failed });
  } catch (error) {
    console.error('Error in bulkUpdateItems:', error);
    res.status(500).json({ message: 'Server error while processing bulk operation' });
  }
};

export const exportItems = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'ORGANIZER') {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }

    const { saleId } = req.params;

    // Check if sale exists and belongs to organizer
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        organizer: {
          select: { userId: true }
        }
      }
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    if (sale.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'Access denied. Not your sale.' });
    }

    // Fetch all items for this sale
    const items = await prisma.item.findMany({
      where: { saleId },
      orderBy: { createdAt: 'desc' }
    });

    // Generate CSV
    const csvHeaders = ['Title', 'Category', 'Condition', 'Price', 'Status', 'Tags'];
    const csvRows = items.map(item => [
      `"${(item.title || '').replace(/"/g, '""')}"`,
      `"${(item.category || '').replace(/"/g, '""')}"`,
      `"${(item.condition || '').replace(/"/g, '""')}"`,
      item.price ? item.price.toFixed(2) : '',
      item.status || '',
      ''
    ]);

    const csv = [csvHeaders, ...csvRows].map(row => row.join(',')).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="items-${saleId}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('Error exporting items:', error);
    res.status(500).json({ message: 'Server error while exporting items' });
  }
};

export const placeBid = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { id } = req.params;
    const { amount } = req.body;

    // Validate bid amount
    const bidAmount = parseFloat(amount);
    if (isNaN(bidAmount) || bidAmount <= 0) {
      return res.status(400).json({ message: 'Invalid bid amount' });
    }

    // Check if item exists and is part of an auction
    const item = await prisma.item.findUnique({
      where: { id },
      include: { sale: { include: { organizer: { select: { userId: true } } } } },
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    if (!item.auctionStartPrice) {
      return res.status(400).json({ message: 'Item is not part of an auction' });
    }

    // Check if auction has ended
    if (item.auctionEndTime && new Date() > item.auctionEndTime) {
      return res.status(400).json({ message: 'Auction has ended' });
    }

    // Check if bid meets minimum requirement
    let minBid;
    if (item.currentBid) {
      minBid = Number(item.currentBid) + (Number(item.bidIncrement) || 1);
    } else {
      minBid = Number(item.auctionStartPrice);
    }

    if (bidAmount < minBid) {
      return res.status(400).json({
        message: `Bid must be at least $${minBid.toFixed(2)}`
      });
    }

    // Create bid record
    const bid = await prisma.bid.create({
      data: {
        itemId: id,
        userId: req.user.id,
        amount: bidAmount
      }
    });

    // Update item's current bid
    await prisma.item.update({
      where: { id },
      data: { currentBid: bidAmount }
    });

    // V1: Broadcast live bid update to all clients viewing this item
    try {
      getIO().to(`item:${id}`).emit('bid:update', {
        itemId: id,
        currentBid: bidAmount,
      });
    } catch {
      // Socket not initialized (e.g. test environment) — non-fatal
    }

    // X1: Fire webhooks (non-blocking)
    const organizerUserId = (item as any).sale?.organizer?.userId;
    if (organizerUserId) {
      setImmediate(() =>
        fireWebhooks(organizerUserId, 'bid.placed', {
          itemId: id,
          itemTitle: item.title,
          bidAmount,
          bidderId: req.user.id,
        })
      );
    }

    res.status(201).json(bid);
  } catch (error) {
    console.error('Error placing bid:', error);
    res.status(500).json({ message: 'Server error while placing bid' });
  }
};
