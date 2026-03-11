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
import { PUBLIC_ITEM_FILTER } from '../helpers/itemQueries'; // Phase 1B: Rapidfire Mode public item filtering

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
          draftStatus: 'PUBLISHED', // Phase 1A: CSV-imported items are deliberate organizer actions — publish immediately
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

    // Use select instead of include to avoid querying columns that may not
    // exist in production yet (tags) or that crash serialization (embedding).
    const item = await prisma.item.findUnique({
      where: { id },
      select: {
        id: true,
        saleId: true,
        title: true,
        sku: true,
        description: true,
        price: true,
        auctionStartPrice: true,
        auctionReservePrice: true,
        bidIncrement: true,
        auctionEndTime: true,
        currentBid: true,
        status: true,
        category: true,
        condition: true,
        photoUrls: true,
        shippingAvailable: true,
        shippingPrice: true,
        listingType: true,
        isAiTagged: true,
        isActive: true,
        isLiveDrop: true,
        liveDropAt: true,
        reverseAuction: true,
        reverseDailyDrop: true,
        reverseFloorPrice: true,
        reverseStartDate: true,
        draftStatus: true,
        createdAt: true,
        updatedAt: true,
        // embedding & tags intentionally excluded — see getItemsBySaleId comment
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

    // For everyone else, enforce public visibility rules: must be PUBLISHED + active + in published sale
    if (!isOwner && (!item.isActive || item.sale.status !== 'PUBLISHED' || item.draftStatus !== 'PUBLISHED')) {
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
      where: {
        saleId: saleId as string,
        ...PUBLIC_ITEM_FILTER,
      },
      select: {
        id: true,
        saleId: true,
        title: true,
        description: true,
        price: true,
        auctionStartPrice: true,
        auctionReservePrice: true,
        bidIncrement: true,
        auctionEndTime: true,
        status: true,
        category: true,
        condition: true,
        photoUrls: true,
        shippingAvailable: true,
        shippingPrice: true,
        listingType: true,
        isAiTagged: true,
        isActive: true,
        isLiveDrop: true,
        liveDropAt: true,
        reverseAuction: true,
        reverseDailyDrop: true,
        reverseFloorPrice: true,
        reverseStartDate: true,
        createdAt: true,
        updatedAt: true,
        // Exclude embedding (binary) and tags (may not exist in prod yet) for lighter response
      }
    });
    res.json(items);
  } catch (error) {
    console.error('Error fetching items by sale ID:', error);
    res.status(500).json({ message: 'Server error while fetching items' });
  }
};

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
        // Phase 1A: regular item creation is a deliberate organizer action — publish immediately
        // (Only Rapidfire/uploadRapidfire creates DRAFT items intentionally)
        draftStatus: 'PUBLISHED',
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
    const { title, description, price, auctionStartPrice, auctionReservePrice, bidIncrement, auctionEndTime, status, category, condition, shippingAvailable, shippingPrice, reverseAuction, reverseDailyDrop, reverseFloorPrice, reverseStartDate, listingType, isAiTagged } = req.body;

    // Fetch item to verify ownership
    const item = await prisma.item.findUnique({
      where: { id },
      include: { sale: { include: { organizer: { select: { userId: true } } } } }
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    if (item.sale.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'Access denied. Not your sale.' });
    }

    // Build update object
    const updateData: any = {};

    // Only update fields that are explicitly provided
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (price !== undefined) updateData.price = price ? parseFloat(price) : null;
    if (auctionStartPrice !== undefined) updateData.auctionStartPrice = auctionStartPrice ? parseFloat(auctionStartPrice) : null;
    if (auctionReservePrice !== undefined) updateData.auctionReservePrice = auctionReservePrice ? parseFloat(auctionReservePrice) : null;
    if (bidIncrement !== undefined) updateData.bidIncrement = bidIncrement ? parseFloat(bidIncrement) : null;
    if (auctionEndTime !== undefined) updateData.auctionEndTime = auctionEndTime ? new Date(auctionEndTime) : null;
    if (status !== undefined) updateData.status = status;
    if (category !== undefined) updateData.category = category || null;
    if (condition !== undefined) updateData.condition = condition || null;
    if (shippingAvailable !== undefined) updateData.shippingAvailable = shippingAvailable === true || shippingAvailable === 'true';
    if (shippingPrice !== undefined) updateData.shippingPrice = shippingPrice ? parseFloat(shippingPrice) : null;
    if (reverseAuction !== undefined) updateData.reverseAuction = reverseAuction === true || reverseAuction === 'true';
    if (reverseDailyDrop !== undefined) updateData.reverseDailyDrop = reverseDailyDrop ? parseInt(reverseDailyDrop, 10) : null;
    if (reverseFloorPrice !== undefined) updateData.reverseFloorPrice = reverseFloorPrice ? parseInt(reverseFloorPrice, 10) : null;
    if (reverseStartDate !== undefined) updateData.reverseStartDate = reverseStartDate ? new Date(reverseStartDate) : null;
    if (listingType !== undefined) updateData.listingType = listingType;
    if (isAiTagged !== undefined) updateData.isAiTagged = isAiTagged === true || isAiTagged === 'true';

    const updatedItem = await prisma.item.update({
      where: { id },
      data: updateData
    });

    res.json(updatedItem);
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

    // Fetch item to verify ownership
    const item = await prisma.item.findUnique({
      where: { id },
      include: { sale: { include: { organizer: { select: { userId: true } } } } }
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    if (item.sale.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'Access denied. Not your sale.' });
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

export const placeBid = async (req: AuthRequest, res: Response) => {
  try {
    const { itemId } = req.params;
    const { bidAmount } = req.body;

    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Fetch item with current bid and organizer
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: {
        sale: { include: { organizer: { select: { userId: true } } } },
        bids: { orderBy: { amount: 'desc' }, take: 1 }
      }
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Prevent self-bidding
    if (item.sale.organizer.userId === req.user.id) {
      return res.status(403).json({ message: 'You cannot bid on your own items' });
    }

    // Validate bid amount
    if (!bidAmount || bidAmount <= 0) {
      return res.status(400).json({ message: 'Invalid bid amount' });
    }

    const currentHighBid = item.bids.length > 0 ? item.bids[0].amount : item.auctionStartPrice || 0;
    const minimumBid = currentHighBid + (item.bidIncrement || 1);

    if (bidAmount < minimumBid) {
      return res.status(400).json({
        message: `Bid amount must be at least $${minimumBid.toFixed(2)}`,
        minimumBid,
        currentBid: currentHighBid
      });
    }

    // Check auction end time
    if (item.auctionEndTime && new Date(item.auctionEndTime) < new Date()) {
      return res.status(400).json({ message: 'Auction has ended' });
    }

    // Create the bid
    const bid = await prisma.bid.create({
      data: {
        itemId,
        userId: req.user.id,
        amount: bidAmount
      }
    });

    // Update item's current bid
    await prisma.item.update({
      where: { id: itemId },
      data: { currentBid: bidAmount }
    });

    // V1: Broadcast live bid update via Socket.io
    const io = getIO();
    if (io) {
      io.to(`item-${itemId}`).emit('bidPlaced', {
        itemId,
        bidAmount,
        bidderId: req.user.id,
        bidTime: new Date(),
      });
    }

    // Fire webhooks for bid placed
    fireWebhooks(item.sale.organizer.userId, 'bid.placed', {
      itemId: item.id,
      saleId: item.saleId,
      bidAmount,
      bidderId: req.user.id,
    }).catch(err => console.error('Webhook fire error:', err));

    // Notify organizer + previous highest bidder
    if (
      item.sale.organizer.userId &&
      item.bids.length > 0
    ) {
      const previousHighestBidderId = item.bids[0].userId;
      console.log(
        `[placeBid] Item ${itemId}: Notifying organizer ${item.sale.organizer.userId} and prev bidder ${previousHighestBidderId}` +
        ` of new bid $${bidAmount} by ${req.user.id}`
      );
    }

    res.status(201).json(bid);
  } catch (error) {
    console.error('Error placing bid:', error);
    res.status(500).json({ message: 'Server error while placing bid' });
  }
};

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

// Phase 16: Photo management

const getItemForOrganizer = async (id: string, userId: string) => {
  const item = await prisma.item.findUnique({
    where: { id },
    include: { sale: { include: { organizer: { select: { userId: true } } } } },
  });
  if (!item) return null;
  if (item.sale.organizer.userId !== userId) return null;
  return item;
};

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
    const updated = await prisma.item.update({
      where: { id },
      data: { photoUrls: item.photoUrls.filter((_, i) => i !== idx) },
    });
    res.json({ photoUrls: updated.photoUrls });
  } catch (error) {
    console.error('removeItemPhoto error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

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

// Phase 2B: Rapidfire Mode — Draft status polling endpoint
export const getItemDraftStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { itemId } = req.params;

    // Fetch item with minimal fields — lightweight poll response
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        saleId: true,
        draftStatus: true,
        aiErrorLog: true,
        title: true,
        photoUrls: true,
        sale: {
          select: {
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

    // Auth: only the organizer who owns the sale can poll this item's draft status
    const isOwner = req.user?.id === item.sale.organizer.userId;
    if (!isOwner) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Return lightweight draft status response
    res.json({
      itemId: item.id,
      draftStatus: item.draftStatus,
      aiErrorLog: item.aiErrorLog,
      title: item.title,
      thumbnailUrl: item.photoUrls && item.photoUrls.length > 0 ? item.photoUrls[0] : null
    });
  } catch (error) {
    console.error('Error fetching draft status:', error);
    res.status(500).json({ message: 'Server error while fetching draft status' });
  }
};

// Phase 2B: Rapidfire Mode — Publish endpoint with optimistic lock and draftStatus gate
export const publishItem = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'ORGANIZER') {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }

    const { itemId } = req.params;
    const { title, price, category, condition, optimisticLockVersion } = req.body;

    // Fetch current item state
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        saleId: true,
        draftStatus: true,
        optimisticLockVersion: true,
        sale: {
          select: {
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

    // Auth: only the organizer who owns the sale can publish items
    if (item.sale.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'Access denied. Not your sale.' });
    }

    // B2 blocker: reject if draftStatus is not PENDING_REVIEW (AI analysis not complete)
    if (item.draftStatus !== 'PENDING_REVIEW') {
      return res.status(400).json({
        message: 'Item not ready — AI analysis still in progress.'
      });
    }

    // B5 blocker: optimistic lock check — prevent concurrent edits
    if (optimisticLockVersion !== undefined && optimisticLockVersion !== item.optimisticLockVersion) {
      return res.status(409).json({
        message: 'Item was updated. Refresh and try again.'
      });
    }

    // Prepare update data with optional organizer edits
    const updateData: any = {
      draftStatus: 'PUBLISHED',
      optimisticLockVersion: (item.optimisticLockVersion ?? 0) + 1
    };

    // Apply optional organizer edits from request body
    if (title !== undefined) updateData.title = title;
    if (price !== undefined) updateData.price = price !== null ? parseFloat(price) : null;
    if (category !== undefined) updateData.category = category;
    if (condition !== undefined) updateData.condition = condition;

    // Update item with new state
    const updatedItem = await prisma.item.update({
      where: { id: itemId },
      data: updateData,
      select: {
        id: true,
        saleId: true,
        title: true,
        description: true,
        price: true,
        category: true,
        condition: true,
        draftStatus: true,
        optimisticLockVersion: true,
        photoUrls: true,
        status: true,
        updatedAt: true
      }
    });

    // Fire webhooks for published item (X1: Zapier integration)
    fireWebhooks(req.user.id, 'item.published', {
      itemId: updatedItem.id,
      saleId: updatedItem.saleId,
      title: updatedItem.title,
      status: updatedItem.draftStatus
    }).catch(err => console.error('Webhook fire error:', err));

    res.json(updatedItem);
  } catch (error) {
    console.error('Error publishing item:', error);
    res.status(500).json({ message: 'Server error while publishing item' });
  }
};
