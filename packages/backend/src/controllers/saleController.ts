import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import QRCode from 'qrcode';
import { handleFavoriteBadge } from './userController';

const prisma = new PrismaClient();

// Extend Express Request type to include user property
interface AuthRequest extends Request {
  user?: any;
}

// Updated datetime validation to accept ISO 8601 format with optional milliseconds and timezone
const iso8601DatetimeSchema = z.string().regex(
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/,
  'Invalid datetime format. Expected ISO 8601 format.'
);

// Validation schemas
const saleQuerySchema = z.object({
  city: z.string().optional(),
  zip: z.string().optional(),
  lat: z.string().optional(),
  lng: z.string().optional(),
  radius: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.string().optional().default('1'),
  limit: z.string().optional().default('10')
});

const saleCreateSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  startDate: iso8601DatetimeSchema,
  endDate: iso8601DatetimeSchema,
  address: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(2).max(2),
  zip: z.string().min(5).max(10),
  lat: z.number(),
  lng: z.number(),
  photoUrls: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  isAuctionSale: z.boolean().optional().default(false),
});

const saleUpdateSchema = saleCreateSchema.partial();

// Helper function to convert Decimal values to numbers recursively
const convertDecimalsToNumbers = (obj: any) => {
  if (!obj) return obj;
  
  const converted: any = {};
  for (const key in obj) {
    if (obj[key] && typeof obj[key] === 'object' && 'toNumber' in obj[key]) {
      // Convert Decimal to number
      converted[key] = obj[key].toNumber();
    } else if (Array.isArray(obj[key])) {
      // Recursively process arrays
      converted[key] = obj[key].map((item: any) => 
        typeof item === 'object' ? convertDecimalsToNumbers(item) : item
      );
    } else if (obj[key] && typeof obj[key] === 'object' && !(obj[key] instanceof Date)) {
      // Recursively process nested objects, but don't convert Date objects
      converted[key] = convertDecimalsToNumbers(obj[key]);
    } else {
      converted[key] = obj[key];
    }
  }
  return converted;
};

export const listSales = async (req: Request, res: Response) => {
  try {
    // Validate query parameters
    const query = saleQuerySchema.parse(req.query);
    
    // Parse pagination
    const page = parseInt(query.page);
    const limit = parseInt(query.limit);
    const skip = (page - 1) * limit;
    
    // Build where conditions — default to PUBLISHED only for public listing
    const where: any = {
      status: 'PUBLISHED',
    };

    if (query.city) {
      where.city = {
        contains: query.city,
        mode: 'insensitive'
      };
    }

    if (query.zip) {
      where.zip = query.zip;
    }

    if (query.startDate || query.endDate) {
      where.startDate = {};
      if (query.startDate) {
        where.startDate.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        where.startDate.lte = new Date(query.endDate);
      }
    }
    
    // Geospatial filtering (bounding box approach)
    if (query.lat && query.lng && query.radius) {
      const lat = parseFloat(query.lat);
      const lng = parseFloat(query.lng);
      const radius = parseFloat(query.radius); // in kilometers
      
      // Approximate degrees per kilometer
      const latDelta = radius / 111; // 1 degree latitude ≈ 111 km
      const lngDelta = radius / (111 * Math.cos(lat * Math.PI / 180)); // Adjust for longitude
      
      where.lat = {
        gte: lat - latDelta,
        lte: lat + latDelta
      };
      
      where.lng = {
        gte: lng - lngDelta,
        lte: lng + lngDelta
      };
    }
    
    // Fetch sales
    const sales = await prisma.sale.findMany({
      where,
      skip,
      take: limit,
      orderBy: {
        startDate: 'asc'
      },
      include: {
        organizer: {
          select: {
            id: true,
            businessName: true,
            phone: true
          }
        }
      }
    });
    
    // Convert Decimal values to numbers
    const convertedSales = sales.map(sale => convertDecimalsToNumbers(sale));
    
    // Get total count for pagination
    const total = await prisma.sale.count({ where });
    
    res.json({
      sales: convertedSales,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        message: 'Validation error', 
        errors: error.errors 
      });
    }
    console.error(error);
    res.status(500).json({ message: 'Server error while fetching sales' });
  }
};

export const getMySales = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'ORGANIZER') {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }

    const organizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id }
    });

    if (!organizer) {
      return res.json({ sales: [] });
    }

    const sales = await prisma.sale.findMany({
      where: { organizerId: organizer.id },
      orderBy: { startDate: 'asc' },
      include: {
        organizer: {
          select: {
            userId: true,
            businessName: true,
            phone: true,
            address: true
          }
        },
        items: {
          select: { id: true, status: true }
        }
      },
      take: 50
    });

    res.json({ sales: sales.map(s => convertDecimalsToNumbers(s)) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error while fetching your sales' });
  }
};

export const getSale = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const sale = await prisma.sale.findUnique({
      where: { id },
      include: {
        organizer: {
          select: {
            id: true,
            userId: true,
            businessName: true,
            phone: true,
            address: true
          }
        },
        items: {
          select: {
            id: true,
            title: true,
            description: true,
            price: true,
            auctionStartPrice: true,
            currentBid: true,
            bidIncrement: true,
            status: true,
            photoUrls: true,
            auctionEndTime: true
          }
        }
      }
    });
    
    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }
    
    // Convert Decimal values to numbers (recursively handles nested items)
    const convertedSale = convertDecimalsToNumbers(sale);
    
    res.json(convertedSale);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error while fetching sale' });
  }
};

export const createSale = async (req: AuthRequest, res: Response) => {
  try {
    // Verify user is organizer or admin
    if (!req.user || (req.user.role !== 'ORGANIZER' && req.user.role !== 'ADMIN')) {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }
    
    // Validate request body
    const saleData = saleCreateSchema.parse(req.body);
    
    // For organizers, set organizerId to their profile
    let organizerId = req.user.organizerProfile?.id;
    if (!organizerId && req.user.role === 'ADMIN') {
      // Admin can create sale for any organizer (optional field)
      organizerId = req.body.organizerId;
    } else if (!organizerId && req.user.role === 'ORGANIZER') {
      // Get or auto-create organizer profile for this user
      let organizerProfile = await prisma.organizer.findUnique({
        where: { userId: req.user.id }
      });

      if (!organizerProfile) {
        organizerProfile = await prisma.organizer.create({
          data: {
            userId: req.user.id,
            businessName: req.user.name || 'My Business',
            phone: req.user.phone || '',
            address: '',
          }
        });
      }

      organizerId = organizerProfile.id;
    }
    
    const sale = await prisma.sale.create({
      data: {
        ...saleData,
        organizerId,
        status: 'DRAFT' // Default to draft
      }
    });
    
    // Convert Decimal values to numbers
    const convertedSale = convertDecimalsToNumbers(sale);
    
    res.status(201).json(convertedSale);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        message: 'Validation error', 
        errors: error.errors 
      });
    }
    console.error(error);
    res.status(500).json({ message: 'Server error while creating sale' });
  }
};

export const updateSale = async (req: AuthRequest, res: Response) => {
  try {
    // Verify user is organizer or admin
    if (!req.user || (req.user.role !== 'ORGANIZER' && req.user.role !== 'ADMIN')) {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }
    
    const { id } = req.params;
    
    // Validate request body
    const saleData = saleUpdateSchema.parse(req.body);
    
    // Check if sale exists and belongs to organizer (unless admin)
    const existingSale = await prisma.sale.findUnique({
      where: { id }
    });
    
    if (!existingSale) {
      return res.status(404).json({ message: 'Sale not found' });
    }
    
    if (req.user.role !== 'ADMIN') {
      const organizerProfile = await prisma.organizer.findUnique({
        where: { userId: req.user.id }
      });
      
      if (!organizerProfile || existingSale.organizerId !== organizerProfile.id) {
        return res.status(403).json({ message: 'Access denied. You can only update your own sales.' });
      }
    }
    
    const sale = await prisma.sale.update({
      where: { id },
      data: saleData
    });
    
    // Convert Decimal values to numbers
    const convertedSale = convertDecimalsToNumbers(sale);
    
    res.json(convertedSale);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        message: 'Validation error', 
        errors: error.errors 
      });
    }
    console.error(error);
    res.status(500).json({ message: 'Server error while updating sale' });
  }
};

export const deleteSale = async (req: AuthRequest, res: Response) => {
  try {
    // Verify user is organizer or admin
    if (!req.user || (req.user.role !== 'ORGANIZER' && req.user.role !== 'ADMIN')) {
      return res.status(403).json({ message: 'Access denied. Organizer/Admin access required.' });
    }
    
    const { id } = req.params;
    
    // Check if sale exists and belongs to organizer (unless admin)
    const existingSale = await prisma.sale.findUnique({
      where: { id }
    });
    
    if (!existingSale) {
      return res.status(404).json({ message: 'Sale not found' });
    }
    
    if (req.user.role !== 'ADMIN') {
      const organizerProfile = await prisma.organizer.findUnique({
        where: { userId: req.user.id }
      });
      
      if (!organizerProfile || existingSale.organizerId !== organizerProfile.id) {
        return res.status(403).json({ message: 'Access denied. You can only delete your own sales.' });
      }
    }
    
    // Delete related items first (cascade delete)
    await prisma.item.deleteMany({
      where: { saleId: id }
    });
    
    // Delete the sale
    await prisma.sale.delete({
      where: { id }
    });
    
    res.json({ message: 'Sale deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error while deleting sale' });
  }
};

export const searchSales = async (req: Request, res: Response) => {
  try {
    const { q } = req.query;
    
    if (!q || typeof q !== 'string') {
      return res.status(400).json({ message: 'Search query is required' });
    }
    
    const sales = await prisma.sale.findMany({
      where: {
        OR: [
          {
            title: {
              contains: q,
              mode: 'insensitive'
            }
          },
          {
            description: {
              contains: q,
              mode: 'insensitive'
            }
          },
          {
            tags: {
              hasSome: [q]
            }
          }
        ]
      },
      include: {
        organizer: {
          select: {
            businessName: true
          }
        }
      },
      take: 20
    });
    
    // Convert Decimal values to numbers
    const convertedSales = sales.map(sale => convertDecimalsToNumbers(sale));
    
    res.json(convertedSales);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error while searching sales' });
  }
};

// Update sale status: DRAFT → PUBLISHED → ENDED (owner-gated)
export const updateSaleStatus = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || (req.user.role !== 'ORGANIZER' && req.user.role !== 'ADMIN')) {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }

    const { id } = req.params;
    const { status } = req.body;

    const allowedStatuses = ['PUBLISHED', 'ENDED'];
    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({ message: `Invalid status. Must be one of: ${allowedStatuses.join(', ')}` });
    }

    const existingSale = await prisma.sale.findUnique({ where: { id } });
    if (!existingSale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    // Check ownership unless admin
    if (req.user.role !== 'ADMIN') {
      const organizerProfile = await prisma.organizer.findUnique({ where: { userId: req.user.id } });
      if (!organizerProfile || existingSale.organizerId !== organizerProfile.id) {
        return res.status(403).json({ message: 'Access denied. You can only update your own sales.' });
      }
    }

    // Enforce valid transitions
    const transitions: Record<string, string[]> = {
      DRAFT: ['PUBLISHED'],
      PUBLISHED: ['ENDED'],
      ENDED: [],
    };
    const allowed = transitions[existingSale.status] || [];
    if (!allowed.includes(status)) {
      return res.status(400).json({
        message: `Cannot transition from ${existingSale.status} to ${status}.`,
      });
    }

    const updated = await prisma.sale.update({ where: { id }, data: { status } });
    res.json(convertDecimalsToNumbers(updated));
  } catch (error) {
    console.error('Error updating sale status:', error);
    res.status(500).json({ message: 'Server error while updating sale status' });
  }
};

// Generate QR code for sale
export const generateQRCode = async (req: AuthRequest, res: Response) => {
  try {
    // Verify user is organizer or admin
    if (!req.user || (req.user.role !== 'ORGANIZER' && req.user.role !== 'ADMIN')) {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }

    const { id } = req.params;
    
    // Check if sale exists and belongs to organizer (unless admin)
    const existingSale = await prisma.sale.findUnique({
      where: { id }
    });
    
    if (!existingSale) {
      return res.status(404).json({ message: 'Sale not found' });
    }
    
    if (req.user.role !== 'ADMIN') {
      const organizerProfile = await prisma.organizer.findUnique({
        where: { userId: req.user.id }
      });
      
      if (!organizerProfile || existingSale.organizerId !== organizerProfile.id) {
        return res.status(403).json({ message: 'Access denied. You can only generate QR codes for your own sales.' });
      }
    }
    
    // Generate QR code with UTM tracking
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const saleUrl = `${frontendUrl}/sales/${id}?utm_source=qr`;
    
    // Generate QR code as SVG
    const qrCodeSvg = await QRCode.toString(saleUrl, { type: 'svg' });
    
    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(qrCodeSvg);
  } catch (error) {
    console.error('Error generating QR code:', error);
    res.status(500).json({ message: 'Server error while generating QR code' });
  }
};
