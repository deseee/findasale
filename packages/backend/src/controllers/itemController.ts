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
            id: true,
            organizerId: true,
            status: true
          }
        }
      }
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // For public-facing access, verify item is active and sale is published
    if (!item.isActive || item.sale.status !== 'PUBLISHED') {
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
        // For public-facing access, only return active items
        isActive: true,
        status: 'AVAILABLE',
        sale: { status: 'PUBLISHED' }
      },
      include: { sale: { select: { status: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    res.json(items);
  } catch (error) {
    console.error('Error fetching items:', error);
    res.status(500).json({ message: 'Server error while fetching items' });
  }
};