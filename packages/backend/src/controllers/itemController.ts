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
import { pushEvent } from '../services/liveFeedService'; // Feature #70: Live Sale Feed
import { PUBLIC_ITEM_FILTER } from '../helpers/itemQueries'; // Phase 1B: Rapidfire Mode public item filtering
import { computeHealthScore, HealthResult } from '../utils/listingHealthScore'; // Sprint 1: Listing Health Score
import { invalidateCommandCenterCache } from '../services/commandCenterService'; // P2-3: Cache invalidation
import { checkSaleOverLimit } from '../lib/tierEnforcement'; // Feature #75: Tier lapse enforcement
import { getClientIp } from '../utils/getClientIp'; // Platform Safety #94: Same-IP Bidder Detection
import { createNotification } from '../services/notificationService'; // P0: Bid notifications
import { closeAuction } from '../services/auctionService'; // Auction close flow
import { resetRapidDraftDebounce } from './uploadController'; // Rapidfire Mode: AI analysis debounce

// Feature #5: Item listing/transaction types (inlined from shared package)
enum ListingType {
  FIXED = 'FIXED',
  AUCTION = 'AUCTION',
  REVERSE_AUCTION = 'REVERSE_AUCTION',
  LIVE_DROP = 'LIVE_DROP',
  POS = 'POS',
}
const VALID_LISTING_TYPES = Object.values(ListingType) as string[];

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

// Feature #57: Helper to assign item rarity based on price
// Auto-assignment tiers: price >= 500 → LEGENDARY, >= 200 → ULTRA_RARE, >= 75 → RARE, >= 25 → UNCOMMON, else → COMMON
const assignRarity = (price: number | undefined | null): string => {
  if (!price || price < 25) return 'COMMON';
  if (price >= 500) return 'LEGENDARY';
  if (price >= 200) return 'ULTRA_RARE';
  if (price >= 75) return 'RARE';
  return 'UNCOMMON';
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

    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
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
        conditionGrade: true,
        tags: true,
        qrEmbedEnabled: true,
        rarity: true,
        createdAt: true,
        updatedAt: true,
        // embedding intentionally excluded — crashes serialization
        sale: {
          select: {
            title: true,
            id: true,
            organizerId: true,
            status: true,
            organizer: {
              select: { userId: true, businessName: true }
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

    // For everyone else, enforce public visibility rules: must be active.
    // Allow NULL draftStatus (legacy/seeded items pre-Rapidfire) and PUBLISHED items.
    // Only explicitly DRAFT items are blocked (Rapidfire items being AI-analyzed by organizer).
    // Note: sale.status check removed (getSale endpoint doesn't enforce it either)
    if (!isOwner && (!item.isActive || item.draftStatus === 'DRAFT')) {
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
    // Try to get user from AuthRequest (optional — public endpoint)
    const user = (req as any).user;

    // Check if user has active Hunt Pass
    const hasHuntPass = user?.huntPassActive && user?.huntPassExpiry && user.huntPassExpiry > new Date();

    // Hunt Pass Feature: Exclude LEGENDARY items with active early access for non-Hunt-Pass users
    const filterWhere: any = {
      saleId: saleId as string,
      ...PUBLIC_ITEM_FILTER,
    };

    if (!hasHuntPass) {
      // Non-Hunt-Pass users: exclude items that have earlyAccessUntil set and not yet passed
      filterWhere.OR = [
        { earlyAccessUntil: null },
        { earlyAccessUntil: { lte: new Date() } },
      ];
    }

    const items = await prisma.item.findMany({
      where: filterWhere,
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
        rarity: true,
        draftStatus: true,
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
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }

    const { saleId, title, description, price, auctionStartPrice, auctionReservePrice, bidIncrement, auctionEndTime, status, category, condition, shippingAvailable, shippingPrice, reverseAuction, reverseDailyDrop, reverseFloorPrice, reverseStartDate, listingType, isAiTagged, rarity, aiConfidence } = req.body;
    const files = req.files as Express.Multer.File[];

    // #102: Validate price >= 0
    if (price !== undefined && price !== null) {
      const parsedPrice = parseFloat(price);
      if (isNaN(parsedPrice) || parsedPrice < 0) {
        return res.status(400).json({ message: 'Price must be a non-negative number.' });
      }
    }

    // #102: Validate auction prices >= 0
    if (auctionStartPrice !== undefined && auctionStartPrice !== null) {
      const parsedPrice = parseFloat(auctionStartPrice);
      if (isNaN(parsedPrice) || parsedPrice < 0) {
        return res.status(400).json({ message: 'Auction start price must be a non-negative number.' });
      }
    }

    if (auctionReservePrice !== undefined && auctionReservePrice !== null) {
      const parsedPrice = parseFloat(auctionReservePrice);
      if (isNaN(parsedPrice) || parsedPrice < 0) {
        return res.status(400).json({ message: 'Auction reserve price must be a non-negative number.' });
      }
    }

    // Feature #5: Validate listing type if provided
    if (listingType !== undefined && !VALID_LISTING_TYPES.includes(listingType)) {
      return res.status(400).json({
        message: `Invalid listing type "${listingType}". Must be one of: ${VALID_LISTING_TYPES.join(', ')}`
      });
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

    // Feature #75: Check tier limits if organizer is in SIMPLE tier
    const organizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id },
      select: { subscriptionTier: true }
    });

    if (organizer?.subscriptionTier === 'SIMPLE') {
      const saleLimit = await checkSaleOverLimit(saleId, organizer.subscriptionTier);
      if (saleLimit.isOverLimit) {
        return res.status(403).json({
          message: `Your subscription has lapsed. You have ${saleLimit.itemCount} items (limit: ${saleLimit.limit}). Upgrade to add more items.`,
          code: 'TIER_LIMIT_EXCEEDED'
        });
      }
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

    // Feature #57: Validate and assign rarity
    let assignedRarity = rarity;
    if (!assignedRarity) {
      // Auto-assign rarity based on price if not provided
      const parsedPrice = price ? parseFloat(price) : null;
      assignedRarity = assignRarity(parsedPrice);
    } else if (!['COMMON', 'UNCOMMON', 'RARE', 'ULTRA_RARE', 'LEGENDARY'].includes(assignedRarity)) {
      return res.status(400).json({
        message: `Invalid rarity "${assignedRarity}". Must be one of: COMMON, UNCOMMON, RARE, ULTRA_RARE, LEGENDARY`
      });
    }

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
        rarity: assignedRarity,
        photoUrls,
        // W1: Shipping
        shippingAvailable: shippingAvailable === true || shippingAvailable === 'true',
        shippingPrice: shippingPrice ? parseFloat(shippingPrice) : null,
        // B1: Listing type — Feature #5: Default to FIXED if not provided; already validated above
        listingType: listingType || 'FIXED',
        // CD2 Phase 4: Reverse Auction — deprecated, maintained for backwards compat
        reverseAuction: reverseAuction === true || reverseAuction === 'true',
        reverseDailyDrop: reverseDailyDrop ? parseInt(reverseDailyDrop, 10) : null,
        reverseFloorPrice: reverseFloorPrice ? parseInt(reverseFloorPrice, 10) : null,
        reverseStartDate: reverseStartDate ? new Date(reverseStartDate) : null,
        // B2: AI tagging disclosure
        isAiTagged: isAiTagged === true || isAiTagged === 'true',
        // CD2 Phase 2: AI confidence score from batch upload (0.0–1.0); defaults to 0.5
        aiConfidence: aiConfidence ? parseFloat(aiConfidence) : 0.5,
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

    // P2-3: Invalidate command center cache after item creation
    invalidateCommandCenterCache(req.user.organizer!.id).catch((err) =>
      console.warn('Failed to invalidate command center cache:', err)
    );

    // U1: Queue embedding generation (non-blocking — after response sent)
    scheduleItemEmbedding(item.id, [title, description, category].filter(Boolean).join(' '));
  } catch (error) {
    console.error('Error creating item:', error);
    res.status(500).json({ message: 'Server error while creating item' });
  }
};

export const updateItem = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }

    const { id } = req.params;
    const { title, description, price, auctionStartPrice, auctionReservePrice, bidIncrement, auctionEndTime, status, category, condition, conditionGrade, shippingAvailable, shippingPrice, reverseAuction, reverseDailyDrop, reverseFloorPrice, reverseStartDate, listingType, isAiTagged, rarity, qrEmbedEnabled, tags, backgroundRemoved, draftStatus } = req.body;

    // #102: Validate price >= 0
    if (price !== undefined && price !== null) {
      const parsedPrice = parseFloat(price);
      if (isNaN(parsedPrice) || parsedPrice < 0) {
        return res.status(400).json({ message: 'Price must be a non-negative number.' });
      }
    }

    // #102: Validate auction prices >= 0
    if (auctionStartPrice !== undefined && auctionStartPrice !== null) {
      const parsedPrice = parseFloat(auctionStartPrice);
      if (isNaN(parsedPrice) || parsedPrice < 0) {
        return res.status(400).json({ message: 'Auction start price must be a non-negative number.' });
      }
    }

    if (auctionReservePrice !== undefined && auctionReservePrice !== null) {
      const parsedPrice = parseFloat(auctionReservePrice);
      if (isNaN(parsedPrice) || parsedPrice < 0) {
        return res.status(400).json({ message: 'Auction reserve price must be a non-negative number.' });
      }
    }

    // Feature #5: Validate listing type if provided
    if (listingType !== undefined && !VALID_LISTING_TYPES.includes(listingType)) {
      return res.status(400).json({
        message: `Invalid listing type "${listingType}". Must be one of: ${VALID_LISTING_TYPES.join(', ')}`
      });
    }

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

    // Feature #57: Handle rarity — auto-reassign if price changes and no explicit rarity provided
    if (rarity !== undefined) {
      if (!['COMMON', 'UNCOMMON', 'RARE', 'ULTRA_RARE', 'LEGENDARY'].includes(rarity)) {
        return res.status(400).json({
          message: `Invalid rarity "${rarity}". Must be one of: COMMON, UNCOMMON, RARE, ULTRA_RARE, LEGENDARY`
        });
      }
      updateData.rarity = rarity;
    } else if (price !== undefined) {
      // Auto-reassign rarity if price changes and no explicit rarity provided
      const newPrice = price ? parseFloat(price) : null;
      updateData.rarity = assignRarity(newPrice);
    }
    if (auctionStartPrice !== undefined) updateData.auctionStartPrice = auctionStartPrice ? parseFloat(auctionStartPrice) : null;
    if (auctionReservePrice !== undefined) updateData.auctionReservePrice = auctionReservePrice ? parseFloat(auctionReservePrice) : null;
    if (bidIncrement !== undefined) updateData.bidIncrement = bidIncrement ? parseFloat(bidIncrement) : null;
    if (auctionEndTime !== undefined) updateData.auctionEndTime = auctionEndTime ? new Date(auctionEndTime) : null;
    if (status !== undefined) updateData.status = status;
    if (category !== undefined) updateData.category = category || null;
    if (condition !== undefined) updateData.condition = condition || null;
    if (conditionGrade !== undefined) updateData.conditionGrade = conditionGrade || null; // #145: Persist condition grade
    if (tags !== undefined) updateData.tags = tags; // #145: Persist tags from review page
    if (backgroundRemoved !== undefined) updateData.backgroundRemoved = backgroundRemoved === true || backgroundRemoved === 'true'; // #145: Persist background removal state
    if (shippingAvailable !== undefined) updateData.shippingAvailable = shippingAvailable === true || shippingAvailable === 'true';
    if (shippingPrice !== undefined) updateData.shippingPrice = shippingPrice ? parseFloat(shippingPrice) : null;
    if (reverseAuction !== undefined) updateData.reverseAuction = reverseAuction === true || reverseAuction === 'true';
    if (reverseDailyDrop !== undefined) updateData.reverseDailyDrop = reverseDailyDrop ? parseInt(reverseDailyDrop, 10) : null;
    if (reverseFloorPrice !== undefined) updateData.reverseFloorPrice = reverseFloorPrice ? parseInt(reverseFloorPrice, 10) : null;
    if (reverseStartDate !== undefined) updateData.reverseStartDate = reverseStartDate ? new Date(reverseStartDate) : null;
    if (listingType !== undefined) updateData.listingType = listingType;
    if (isAiTagged !== undefined) updateData.isAiTagged = isAiTagged === true || isAiTagged === 'true';
    if (qrEmbedEnabled !== undefined) updateData.qrEmbedEnabled = qrEmbedEnabled === true || qrEmbedEnabled === 'true';
    if (draftStatus !== undefined) updateData.draftStatus = draftStatus; // Allow publish/unpublish via generic update

    const updatedItem = await prisma.item.update({
      where: { id },
      data: updateData
    });

    // Feature #70: Emit price drop event if price was reduced
    if (price !== undefined && item.price && updateData.price !== undefined && updateData.price < item.price) {
      try {
        const io = getIO();
        pushEvent(io, item.saleId, {
          type: 'PRICE_DROP',
          itemTitle: updatedItem.title,
          amount: updateData.price || undefined,
          saleId: item.saleId,
          timestamp: new Date(),
        });
      } catch (err) {
        console.warn('[liveFeed] Failed to emit price drop event:', err);
      }
    }

    res.json(updatedItem);

    // P2-3: Invalidate command center cache after item update
    invalidateCommandCenterCache(req.user.organizer!.id).catch((err) =>
      console.warn('Failed to invalidate command center cache:', err)
    );
  } catch (error) {
    console.error('Error updating item:', error);
    res.status(500).json({ message: 'Server error while updating item' });
  }
};

export const deleteItem = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
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

    // P2-3: Invalidate command center cache after item deletion
    invalidateCommandCenterCache(req.user.organizer!.id).catch((err) =>
      console.warn('Failed to invalidate command center cache:', err)
    );
  } catch (error) {
    console.error('Error deleting item:', error);
    res.status(500).json({ message: 'Server error while deleting item' });
  }
};

export const getBids = async (req: AuthRequest, res: Response) => {
  try {
    const itemId = req.params.id;
    const bids = await prisma.bid.findMany({
      where: { itemId },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, name: true } } },
    });
    res.json(bids.map(b => ({
      id: b.id,
      bidAmount: b.amount,
      timestamp: b.createdAt,
      bidder: { id: b.user.id, name: b.user.name },
    })));
  } catch (error) {
    console.error('Error fetching bids:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const placeBid = async (req: AuthRequest, res: Response) => {
  try {
    const itemId = req.params.itemId || req.params.id;
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

    // Create the bid (store amount in dollars)
    const bid = await prisma.bid.create({
      data: {
        itemId,
        userId: req.user.id,
        amount: bidAmount
      }
    });

    // Platform Safety #94: Track IP for same-IP bidder detection
    const clientIp = getClientIp(req);
    if (clientIp !== 'unknown') {
      prisma.bidIpRecord.create({
        data: {
          bidId: bid.id,
          userId: req.user.id,
          ipAddress: clientIp
        }
      }).catch(err => console.warn('[placeBid] Failed to record bid IP:', err));
    }

    // Update item's current bid (in dollars)
    await prisma.item.update({
      where: { id: itemId },
      data: { currentBid: bidAmount }
    });

    // V1: Broadcast live bid update via Socket.io
    const io = getIO();
    if (io) {
      io.to(`item-${itemId}`).emit('bidPlaced', {
        itemId,
        bidAmount: bidAmount,
        bidderId: req.user.id,
        bidTime: new Date(),
      });
    }

    // Fire webhooks for bid placed
    fireWebhooks(item.sale.organizer.userId, 'bid.placed', {
      itemId: item.id,
      saleId: item.saleId,
      bidAmount: bidAmount,
      bidderId: req.user.id,
    }).catch(err => console.error('Webhook fire error:', err));

    // Wire bid-placed notifications (P0 fix)
    // Notify bidder: "Your bid of $[amount] was placed on [item name]"
    createNotification(
      req.user.id,
      'BID_PLACED',
      'Bid Placed',
      `Your bid of $${bidAmount.toFixed(2)} was placed on ${item.title}`,
      `/items/${itemId}`,
      'OPERATIONAL'
    ).catch(err => console.warn('[placeBid] Failed to create bidder notification:', err));

    // Notify organizer: "New bid of $[amount] on [item name]"
    createNotification(
      item.sale.organizer.userId,
      'NEW_BID',
      'New Bid Received',
      `New bid of $${bidAmount.toFixed(2)} on ${item.title}`,
      `/items/${itemId}`,
      'OPERATIONAL'
    ).catch(err => console.warn('[placeBid] Failed to create organizer notification:', err));

    res.status(201).json(bid);
  } catch (error) {
    console.error('Error placing bid:', error);
    res.status(500).json({ message: 'Server error while placing bid' });
  }
};

export const analyzeItemTags = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
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
    const hasOrganizerAccess = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerAccess) {
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
    // If item is in DRAFT status, reset the AI analysis debounce timer to give user
    // more time to add additional photos via the "+" button (multi-angle grouping)
    if (item.draftStatus === 'DRAFT') {
      resetRapidDraftDebounce(id);
    }
    res.json({ photoUrls: updated.photoUrls });
  } catch (error) {
    console.error('addItemPhoto error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const removeItemPhoto = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerAccess = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerAccess) {
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
    const hasOrganizerAccess = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerAccess) {
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
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
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

    // B2 blocker: reject if already published or in an unexpected state
    if (item.draftStatus !== 'PENDING_REVIEW' && item.draftStatus !== 'DRAFT') {
      return res.status(400).json({
        message: item.draftStatus === 'PUBLISHED'
          ? 'Item is already published.'
          : 'Item not ready — AI analysis still in progress.'
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

    // Hunt Pass Feature: Set 6-hour early access embargo for LEGENDARY items
    // Fetch full item to check rarity
    const fullItem = await prisma.item.findUnique({
      where: { id: itemId },
      select: { rarity: true, createdAt: true }
    });

    if (fullItem && fullItem.rarity === 'LEGENDARY') {
      const now = new Date();
      const sixHoursLater = new Date(now.getTime() + 6 * 60 * 60 * 1000); // 6 hours in ms
      updateData.earlyAccessUntil = sixHoursLater;
    }

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

    // P2-3: Invalidate command center cache after item publish (status change)
    invalidateCommandCenterCache(req.user.organizer!.id).catch((err) =>
      console.warn('Failed to invalidate command center cache:', err)
    );
  } catch (error) {
    console.error('Error publishing item:', error);
    res.status(500).json({ message: 'Server error while publishing item' });
  }
};

// Sprint 1: Listing Health Score + getDraftItemsBySaleId with health computation
// Used by the review-before-publish page. Requires organizer ownership of the sale.
export const getDraftItemsBySaleId = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerAccess = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerAccess) {
      return res.status(403).json({ message: 'Organizer access required' });
    }

    const { saleId, page = '1', limit = '20' } = req.query;

    if (!saleId) {
      return res.status(400).json({ message: 'saleId is required' });
    }

    // Verify organizer owns the sale
    const sale = await prisma.sale.findUnique({
      where: { id: saleId as string },
      include: { organizer: { select: { userId: true } } },
    });

    if (!sale || sale.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not your sale' });
    }

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20));

    const items = await prisma.item.findMany({
      where: {
        saleId: saleId as string,
        draftStatus: { in: ['DRAFT', 'PENDING_REVIEW'] },
      },
      select: {
        id: true,
        saleId: true,
        title: true,
        description: true,
        category: true,
        condition: true,
        conditionGrade: true, // #64
        price: true,
        photoUrls: true,
        draftStatus: true,
        aiErrorLog: true,
        optimisticLockVersion: true,
        // Camera Workflow v2: Add new fields for publishing page
        aiConfidence: true,
        isAiTagged: true,
        backgroundRemoved: true,
        faceDetected: true,
        autoEnhanced: true,
        createdAt: true,
        updatedAt: true,
        // Sprint 1: Listing Health Score + AI tag suggestions
        tags: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
    });

    // Sprint 1: Compute health score for each item
    const itemsWithHealth = items.map(item => ({
      ...item,
      healthScore: computeHealthScore({
        photoUrls: item.photoUrls,
        title: item.title,
        description: item.description,
        tags: item.tags,
        price: item.price,
        conditionGrade: item.conditionGrade, // #64
      }),
    }));

    res.json(itemsWithHealth);
  } catch (error) {
    console.error('Error fetching draft items:', error);
    res.status(500).json({ message: 'Server error while fetching draft items' });
  }
};

// Feature #78: Inspiration Gallery — top items by AI confidence from published sales
export const getInspirationItems = async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 48, 100);

    const items = await prisma.item.findMany({
      where: {
        status: 'AVAILABLE',
        // draftStatus filter disabled — legacy/seeded items have NULL draftStatus
        // Re-enable when Rapidfire Mode launches: draftStatus: 'PUBLISHED',
        ...PUBLIC_ITEM_FILTER,
        photoUrls: { isEmpty: false },
        sale: {
          status: 'PUBLISHED',
        },
      },
      select: {
        id: true,
        title: true,
        photoUrls: true,
        price: true,
        aiConfidence: true,
        category: true,
        sale: {
          select: {
            id: true,
            title: true,
            organizer: {
              select: { businessName: true },
            },
          },
        },
      },
      orderBy: { aiConfidence: 'desc' },
      take: limit,
    });

    res.json({ items });
  } catch (err) {
    console.error('GET /api/items/inspiration error:', err);
    res.status(500).json({ message: 'Failed to fetch inspiration items.' });
  }
};

// Feature #85: Treasure Hunt QR — Generate QR code for item
export const getQrCode = async (req: Request, res: Response): Promise<void> => {
  try {
    const { itemId } = req.params;
    if (!itemId) {
      res.status(400).json({ message: 'itemId is required.' });
      return;
    }

    // Verify item exists
    const item = await prisma.item.findUnique({
      where: { id: itemId },
    });

    if (!item) {
      res.status(404).json({ message: 'Item not found.' });
      return;
    }

    // Generate QR code pointing to item page
    const qrContent = `https://finda.sale/items/${itemId}`;

    const QRCode = await import('qrcode');
    const qrImageBuffer = await QRCode.toBuffer(qrContent, {
      errorCorrectionLevel: 'H',
      width: 300,
      margin: 2,
    });

    res.set('Content-Type', 'image/png');
    res.set('Content-Length', String(qrImageBuffer.length));
    res.send(qrImageBuffer);
  } catch (error) {
    console.error('QR code generation error:', error);
    res.status(500).json({ message: 'Failed to generate QR code.' });
  }
};

// Feature #85: Treasure Hunt QR — Record QR scan and award badge + XP
export const recordQrScan = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { itemId } = req.params;
    const userId = req.user?.id;

    if (!itemId || !userId) {
      res.status(400).json({ message: 'itemId and authentication required.' });
      return;
    }

    // Verify item exists
    const item = await prisma.item.findUnique({
      where: { id: itemId },
    });

    if (!item) {
      res.status(404).json({ message: 'Item not found.' });
      return;
    }

    // Import awardXp here to avoid circular dependency
    const { awardXp, XP_AWARDS } = await import('../services/xpService');

    // Award 25 XP for scanning item
    const xpResult = await awardXp(userId, 'ITEM_SCANNED', 25, { itemId });

    // Find or create "Item Scout" badge
    let badge = await prisma.badge.findUnique({
      where: { name: 'Item Scout' },
    });

    if (!badge) {
      // Create badge if it doesn't exist
      badge = await prisma.badge.create({
        data: {
          name: 'Item Scout',
          description: 'Scanned an item\'s QR code',
          criteria: { type: 'qr_scan' },
        },
      });
    }

    // Award badge to user (upsert to avoid duplicates)
    const existingBadge = await prisma.userBadge.findUnique({
      where: {
        userId_badgeId: { userId, badgeId: badge.id },
      },
    });

    if (!existingBadge) {
      await prisma.userBadge.create({
        data: {
          userId,
          badgeId: badge.id,
        },
      });
    }

    // Fetch updated user profile
    const updatedUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        guildXp: true,
        explorerRank: true,
        userBadges: {
          include: { badge: true },
        },
      },
    });

    res.json({
      message: 'QR scan recorded successfully.',
      xpAwarded: xpResult?.xpAwarded || 0,
      newRank: updatedUser?.explorerRank,
      totalXp: updatedUser?.guildXp,
      badgeAwarded: !existingBadge ? badge.name : null,
    });
  } catch (error) {
    console.error('QR scan recording error:', error);
    res.status(500).json({ message: 'Failed to record QR scan.' });
  }
};

// Organizer: Close an auction manually
export const closeAuctionEndpoint = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }

    const { itemId } = req.params;

    // Verify ownership
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: { sale: { include: { organizer: { select: { userId: true } } } } }
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    if (item.sale.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'Access denied. Not your sale.' });
    }

    if (item.listingType !== 'AUCTION') {
      return res.status(400).json({ message: 'Item is not an auction' });
    }

    if (item.auctionClosed) {
      return res.status(400).json({ message: 'Auction already closed' });
    }

    // Call the shared close logic
    await closeAuction(itemId);

    res.json({ message: 'Auction closed successfully' });
  } catch (error) {
    console.error('Close auction error:', error);
    res.status(500).json({ message: 'Failed to close auction' });
  }
};
