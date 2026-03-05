import { Request, Response } from 'express';
import { parse } from 'csv-parse';
import { AuthRequest } from '../middleware/auth';
import { Readable } from 'stream';
import { prisma } from '../index';
import axios from 'axios';
import FormData from 'form-data';
import { z } from 'zod';

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

// Other existing controller functions...
export const getItemById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const item = await prisma.item.findUnique({
      where: { id },
      include: {
        sale: {
          select: {
            title: true,
            id: true
          }
        }
      }
    });

    if (!item) {
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

    const { saleId, title, description, price, auctionStartPrice, bidIncrement, auctionEndTime, status, category, condition } = req.body;
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

    // Call AI tagger for the first image to get suggested tags (optional, non-fatal)
    let suggestedTags: string[] = [];
    const taggerUrl = process.env.TAGGER_URL;
    const taggerApiKey = process.env.TAGGER_API_KEY || 'change-this-in-production';
    if (taggerUrl && files && files.length > 0) {
      const imageName = files[0].originalname;
      const taggerStart = Date.now();
      const attemptTag = async (): Promise<string[]> => {
        const formData = new FormData();
        formData.append('image', files[0].buffer, { filename: imageName });
        formData.append('threshold', '0.35');
        const response = await axios.post(`${taggerUrl}/api/tag`, formData, {
          headers: {
            ...formData.getHeaders(),
            'X-API-Key': taggerApiKey,
          },
          timeout: 5000,
        });
        return response.data?.tags?.map((t: any) => t.tag) ?? [];
      };

      try {
        suggestedTags = await attemptTag();
        const elapsed = Date.now() - taggerStart;
        console.log(`[tagger] tagged "${imageName}" in ${elapsed}ms — ${suggestedTags.length} tags`);
      } catch (firstError: any) {
        const isTimeout = firstError.code === 'ECONNABORTED' || firstError.message?.includes('timeout');
        const isDown = firstError.code === 'ECONNREFUSED' || firstError.code === 'ENOTFOUND';

        if (isTimeout) {
          // Retry once on timeout
          console.warn(`[tagger] timeout tagging "${imageName}", retrying once…`);
          try {
            suggestedTags = await attemptTag();
            const elapsed = Date.now() - taggerStart;
            console.log(`[tagger] retry succeeded for "${imageName}" in ${elapsed}ms`);
          } catch (retryError: any) {
            console.warn(`[tagger] retry also timed out for "${imageName}" — continuing without tags`);
          }
        } else if (isDown) {
          console.warn(`[tagger] service unreachable (${taggerUrl}) — continuing without tags`);
        } else {
          console.warn(`[tagger] unexpected error tagging "${imageName}": ${firstError.message} — continuing without tags`);
        }
      }
    }

    // Create the item in database
    const item = await prisma.item.create({
      data: {
        saleId,
        title,
        description: description || '',
        price: price ? parseFloat(price) : null,
        auctionStartPrice: auctionStartPrice ? parseFloat(auctionStartPrice) : null,
        bidIncrement: bidIncrement ? parseFloat(bidIncrement) : null,
        auctionEndTime: auctionEndTime ? new Date(auctionEndTime) : null,
        status: status || 'AVAILABLE',
        category: category || null,
        condition: condition || null,
        photoUrls,
      }
    });

    // Return item with suggested tags (could be used by frontend to pre-fill fields)
    res.status(201).json({
      ...item,
      suggestedTags, // optional
    });
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
    const { title, description, price, auctionStartPrice, bidIncrement, auctionEndTime, status, photoUrls, category, condition } = req.body;

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

    const updatedItem = await prisma.item.update({
      where: { id },
      data: {
        title,
        description: description || '',
        price: price !== undefined ? (price ? parseFloat(price) : null) : undefined,
        auctionStartPrice: auctionStartPrice !== undefined ? (auctionStartPrice ? parseFloat(auctionStartPrice) : null) : undefined,
        bidIncrement: bidIncrement !== undefined ? (bidIncrement ? parseFloat(bidIncrement) : null) : undefined,
        auctionEndTime: auctionEndTime ? new Date(auctionEndTime) : null,
        status,
        category: category !== undefined ? (category || null) : undefined,
        condition: condition !== undefined ? (condition || null) : undefined,
        photoUrls: photoUrls || undefined
      }
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

    const taggerUrl = process.env.TAGGER_URL;
    const taggerApiKey = process.env.TAGGER_API_KEY || 'change-this-in-production';

    if (!taggerUrl) {
      return res.json({ suggestedTags: [] });
    }

    // Download the photo from its URL then send to tagger
    let suggestedTags: string[] = [];
    try {
      const imageResponse = await axios.get(firstPhotoUrl, {
        responseType: 'arraybuffer',
        timeout: 8000,
      });

      const imageBuffer = Buffer.from(imageResponse.data);
      const filename = firstPhotoUrl.split('/').pop()?.split('?')[0] || 'photo.jpg';

      const formData = new FormData();
      formData.append('image', imageBuffer, { filename });
      formData.append('threshold', '0.35');

      const taggerStart = Date.now();
      const taggerResponse = await axios.post(`${taggerUrl}/api/tag`, formData, {
        headers: {
          ...formData.getHeaders(),
          'X-API-Key': taggerApiKey,
        },
        timeout: 5000,
      });

      suggestedTags = taggerResponse.data?.tags?.map((t: any) => t.tag) ?? [];
      console.log(`[tagger/analyze] tagged item "${id}" in ${Date.now() - taggerStart}ms — ${suggestedTags.length} tags`);
    } catch (err: any) {
      const isDown = err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND';
      if (isDown) {
        console.warn(`[tagger/analyze] service unreachable — returning empty tags`);
      } else {
        console.warn(`[tagger/analyze] error for item "${id}": ${err.message}`);
      }
    }

    res.json({ suggestedTags });
  } catch (error) {
    console.error('Error analyzing item tags:', error);
    res.status(500).json({ message: 'Server error while analyzing tags' });
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

    res.status(201).json(bid);
  } catch (error) {
    console.error('Error placing bid:', error);
    res.status(500).json({ message: 'Server error while placing bid' });
  }
};
