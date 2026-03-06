import { Request, Response } from 'express';
import { z } from 'zod';
import QRCode from 'qrcode';
import { handleFavoriteBadge } from './userController';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { notifyFollowersOfNewSale } from '../services/followerNotificationService';
import { syncOrganizerTier } from '../services/tierService';
import { notifyMatchedBuyers } from '../services/buyerMatchService';

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
  neighborhood: z.string().optional(), // U2
});

const saleUpdateSchema = saleCreateSchema.partial();

// Helper function to convert Decimal values to numbers recursively
const convertDecimalsToNumbers = (obj: any) => {
  if (!obj) return obj;
  
  const converted: any = {};
  for (const key in obj) {
    if (obj[key] && typeof obj[key] === 'object' && 'toNumber' in obj[key]) {
      converted[key] = obj[key].toNumber();
    } else if (Array.isArray(obj[key])) {
      converted[key] = obj[key].map((item: any) => 
        typeof item === 'object' ? convertDecimalsToNumbers(item) : item
      );
    } else if (obj[key] && typeof obj[key] === 'object' && !(obj[key] instanceof Date)) {
      converted[key] = convertDecimalsToNumbers(obj[key]);
    } else {
      converted[key] = obj[key];
    }
  }
  return converted;
};

export const listSales = async (req: Request, res: Response) => {
  try {
    const query = saleQuerySchema.parse(req.query);
    
    const page = parseInt(query.page);
    const limit = parseInt(query.limit);
    const skip = (page - 1) * limit;
    
    const where: any = {
      status: 'PUBLISHED',
    };

    if (query.city) {
      where.city = { contains: query.city, mode: 'insensitive' };
    }

    if (query.zip) {
      where.zip = query.zip;
    }

    if (query.startDate || query.endDate) {
      where.startDate = {};
      if (query.startDate) where.startDate.gte = new Date(query.startDate);
      if (query.endDate) where.startDate.lte = new Date(query.endDate);
    }
    
    if (query.lat && query.lng && query.radius) {
      const lat = parseFloat(query.lat);
      const lng = parseFloat(query.lng);
      const radius = parseFloat(query.radius);
      const latDelta = radius / 111;
      const lngDelta = radius / (111 * Math.cos(lat * Math.PI / 180));
      where.lat = { gte: lat - latDelta, lte: lat + latDelta };
      where.lng = { gte: lng - lngDelta, lte: lng + lngDelta };
    }
    
    const [sales, total] = await Promise.all([
      prisma.sale.findMany({
        where,
        skip,
        take: limit,
        orderBy: { startDate: 'asc' },
        include: {
          organizer: {
            select: { id: true, businessName: true, phone: true, reputationTier: true }
          },
          _count: { select: { favorites: true } },
        }
      }),
      prisma.sale.count({ where }),
    ]);

    const convertedSales = sales.map((sale: any) => {
      const { _count, ...rest } = convertDecimalsToNumbers(sale);
      return { ...rest, favoriteCount: _count?.favorites ?? 0 };
    });
    
    res.json({
      sales: convertedSales,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: error.errors });
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

    const organizer = await prisma.organizer.findUnique({ where: { userId: req.user.id } });
    if (!organizer) return res.json({ sales: [] });

    const sales = await prisma.sale.findMany({
      where: { organizerId: organizer.id },
      orderBy: { startDate: 'asc' },
      include: {
        organizer: { select: { userId: true, businessName: true, phone: true, address: true } },
        items: { select: { id: true, status: true } }
      },
      take: 50
    });

    res.json({ sales: sales.map((s: any) => convertDecimalsToNumbers(s)) });
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
            id: true, userId: true, businessName: true, phone: true, address: true,
            user: { select: { userBadges: { include: { badge: true } } } }
          }
        },
        items: {
          select: {
            id: true, title: true, description: true, price: true,
            auctionStartPrice: true, currentBid: true, bidIncrement: true,
            status: true, photoUrls: true, auctionEndTime: true, category: true, condition: true
          }
        }
      }
    });
    
    if (!sale) return res.status(404).json({ message: 'Sale not found' });

    const reviews = await prisma.review.findMany({
      where: { sale: { organizerId: sale.organizerId } },
      select: { rating: true }
    });
    const avgRating = reviews.length > 0
      ? Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) * 10) / 10
      : 0;

    const organizer = sale.organizer as any;
    const badges = organizer.user?.userBadges?.map((ub: any) => ({
      id: ub.badge.id, name: ub.badge.name, description: ub.badge.description,
      iconUrl: ub.badge.iconUrl, awardedAt: ub.awardedAt,
    })) || [];

    const convertedSale = convertDecimalsToNumbers({
      ...sale,
      organizer: {
        id: organizer.id, userId: organizer.userId, businessName: organizer.businessName,
        phone: organizer.phone, address: organizer.address, badges, avgRating,
        reviewCount: reviews.length,
      },
    });

    res.json(convertedSale);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error while fetching sale' });
  }
};

export const createSale = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || (req.user.role !== 'ORGANIZER' && req.user.role !== 'ADMIN')) {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }
    
    const saleData = saleCreateSchema.parse(req.body);
    
    let organizerId = req.user.organizerProfile?.id;
    if (!organizerId && req.user.role === 'ADMIN') {
      organizerId = req.body.organizerId;
    } else if (!organizerId && req.user.role === 'ORGANIZER') {
      let organizerProfile = await prisma.organizer.findUnique({ where: { userId: req.user.id } });
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
      data: { ...saleData, organizerId, status: 'DRAFT' }
    });
    
    res.status(201).json(convertDecimalsToNumbers(sale));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: error.errors });
    }
    console.error(error);
    res.status(500).json({ message: 'Server error while creating sale' });
  }
};

export const updateSale = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || (req.user.role !== 'ORGANIZER' && req.user.role !== 'ADMIN')) {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }
    
    const { id } = req.params;
    const saleData = saleUpdateSchema.parse(req.body);
    
    const existingSale = await prisma.sale.findUnique({ where: { id } });
    if (!existingSale) return res.status(404).json({ message: 'Sale not found' });
    
    if (req.user.role !== 'ADMIN') {
      const organizerProfile = await prisma.organizer.findUnique({ where: { userId: req.user.id } });
      if (!organizerProfile || existingSale.organizerId !== organizerProfile.id) {
        return res.status(403).json({ message: 'Access denied. You can only update your own sales.' });
      }
    }
    
    const sale = await prisma.sale.update({ where: { id }, data: saleData });
    res.json(convertDecimalsToNumbers(sale));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: error.errors });
    }
    console.error(error);
    res.status(500).json({ message: 'Server error while updating sale' });
  }
};

export const deleteSale = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || (req.user.role !== 'ORGANIZER' && req.user.role !== 'ADMIN')) {
      return res.status(403).json({ message: 'Access denied. Organizer/Admin access required.' });
    }
    
    const { id } = req.params;
    const existingSale = await prisma.sale.findUnique({ where: { id } });
    if (!existingSale) return res.status(404).json({ message: 'Sale not found' });
    
    if (req.user.role !== 'ADMIN') {
      const organizerProfile = await prisma.organizer.findUnique({ where: { userId: req.user.id } });
      if (!organizerProfile || existingSale.organizerId !== organizerProfile.id) {
        return res.status(403).json({ message: 'Access denied. You can only delete your own sales.' });
      }
    }
    
    await prisma.item.deleteMany({ where: { saleId: id } });
    await prisma.sale.delete({ where: { id } });
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
          { title: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
          { tags: { hasSome: [q] } }
        ]
      },
      include: { organizer: { select: { businessName: true } } },
      take: 20
    });
    
    res.json(sales.map((sale: any) => convertDecimalsToNumbers(sale)));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error while searching sales' });
  }
};

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
    if (!existingSale) return res.status(404).json({ message: 'Sale not found' });

    if (req.user.role !== 'ADMIN') {
      const organizerProfile = await prisma.organizer.findUnique({ where: { userId: req.user.id } });
      if (!organizerProfile || existingSale.organizerId !== organizerProfile.id) {
        return res.status(403).json({ message: 'Access denied. You can only update your own sales.' });
      }
    }

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

    if (status === 'PUBLISHED' && existingSale.status === 'DRAFT') {
      notifyFollowersOfNewSale(updated).catch(() => {});
      notifyMatchedBuyers(updated.id).catch((err) => {
        console.error('[buyerMatch] Failed to notify matched buyers:', err);
      });
    }

    // Phase 31: When sale is marked ENDED, recalculate organizer's tier
    if (status === 'ENDED') {
      syncOrganizerTier(updated.organizerId).catch((err) => {
        console.error('[tierService] Failed to sync tier for organizer:', updated.organizerId, err);
      });
    }

    res.json(convertDecimalsToNumbers(updated));
  } catch (error) {
    console.error('Error updating sale status:', error);
    res.status(500).json({ message: 'Server error while updating sale status' });
  }
};

export const trackQrScan = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.sale.updateMany({
      where: { id },
      data: { qrScanCount: { increment: 1 } },
    });
    res.status(204).end();
  } catch (error) {
    console.error('Error tracking QR scan:', error);
    res.status(204).end();
  }
};

export const generateQRCode = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || (req.user.role !== 'ORGANIZER' && req.user.role !== 'ADMIN')) {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }

    const { id } = req.params;
    const existingSale = await prisma.sale.findUnique({ where: { id } });
    if (!existingSale) return res.status(404).json({ message: 'Sale not found' });
    
    if (req.user.role !== 'ADMIN') {
      const organizerProfile = await prisma.organizer.findUnique({ where: { userId: req.user.id } });
      if (!organizerProfile || existingSale.organizerId !== organizerProfile.id) {
        return res.status(403).json({ message: 'Access denied. You can only generate QR codes for your own sales.' });
      }
    }
    
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const saleUrl = `${frontendUrl}/sales/${id}?utm_source=qr`;
    const qrCodeSvg = await QRCode.toString(saleUrl, { type: 'svg' });
    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(qrCodeSvg);
  } catch (error) {
    console.error('Error generating QR code:', error);
    res.status(500).json({ message: 'Server error while generating QR code' });
  }
};

export const generateIcal = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const sale = await prisma.sale.findUnique({
      where: { id },
      include: { organizer: { select: { businessName: true } } },
    });

    if (!sale) return res.status(404).json({ message: 'Sale not found' });
    if (!sale.startDate || !sale.endDate) {
      return res.status(400).json({ message: 'Sale is missing required start or end date' });
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const saleUrl = `${frontendUrl}/sales/${id}`;
    const now = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';
    const toIcalDate = (d: Date) => d.toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';
    const esc = (s: string) =>
      (s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

    const location = `${sale.address}\\, ${sale.city}\\, ${sale.state} ${sale.zip}`;
    const description = esc(sale.description || '') + (sale.description ? '\\n\\n' : '') + `View items online: ${saleUrl}`;

    const ical = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FindA.Sale//FindA.Sale//EN',
      'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
      `UID:sale-${id}@finda.sale`, `DTSTAMP:${now}`,
      `DTSTART:${toIcalDate(new Date(sale.startDate))}`,
      `DTEND:${toIcalDate(new Date(sale.endDate))}`,
      `SUMMARY:${esc(sale.title)}`, `DESCRIPTION:${description}`,
      `LOCATION:${location}`, `URL:${saleUrl}`,
      `ORGANIZER;CN=${esc(sale.organizer.businessName)}:MAILTO:noreply@finda.sale`,
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="sale-${id}.ics"`);
    res.send(ical);
  } catch (error) {
    console.error('Error generating iCal:', error);
    res.status(500).json({ message: 'Server error while generating calendar file' });
  }
};

/**
 * GET /api/sales/neighborhood/:slug
 * U2: Returns upcoming/active published sales tagged with this neighborhood slug.
 * Public — used by SEO landing pages at /neighborhoods/[slug].
 */
export const getSalesByNeighborhood = async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const now = new Date();

    const sales = await (prisma as any).sale.findMany({
      where: {
        neighborhood: slug,
        status: 'PUBLISHED',
        endDate: { gte: now },
      },
      select: {
        id: true, title: true, description: true, startDate: true, endDate: true,
        address: true, city: true, state: true, zip: true, lat: true, lng: true,
        neighborhood: true, photoUrls: true, tags: true,
        organizer: { select: { businessName: true, avgRating: true } },
        _count: { select: { items: true } },
      },
      orderBy: { startDate: 'asc' },
      take: 50,
    });

    res.json({ neighborhood: slug, sales, total: sales.length });
  } catch (error) {
    console.error('Error fetching neighborhood sales:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const cloneSale = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || (req.user.role !== 'ORGANIZER' && req.user.role !== 'ADMIN')) {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }

    const { id } = req.params;

    // Fetch the source sale
    const sourceSale = await prisma.sale.findUnique({ where: { id } });
    if (!sourceSale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    // Verify ownership (unless admin)
    if (req.user.role !== 'ADMIN') {
      const organizerProfile = await prisma.organizer.findUnique({ where: { userId: req.user.id } });
      if (!organizerProfile || sourceSale.organizerId !== organizerProfile.id) {
        return res.status(403).json({ message: 'Access denied. You can only clone your own sales.' });
      }
    }

    // Create a new sale with cloned data
    const clonedSale = await prisma.sale.create({
      data: {
        title: `Copy of ${sourceSale.title}`,
        description: sourceSale.description,
        address: sourceSale.address,
        city: sourceSale.city,
        state: sourceSale.state,
        zip: sourceSale.zip,
        lat: sourceSale.lat,
        lng: sourceSale.lng,
        neighborhood: sourceSale.neighborhood,
        photoUrls: sourceSale.photoUrls,
        tags: sourceSale.tags,
        isAuctionSale: sourceSale.isAuctionSale,
        status: 'DRAFT',
        startDate: new Date(), // Organizer will fill in dates
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Default: 7 days from now
        organizerId: sourceSale.organizerId,
      },
    });

    res.status(201).json(convertDecimalsToNumbers(clonedSale));
  } catch (error) {
    console.error('Error cloning sale:', error);
    res.status(500).json({ message: 'Server error while cloning sale' });
  }
};

/**
 * GET /api/sales/:id/activity
 *
 * Real-time activity feed for a sale showing:
 * - Recent item favorites (last 10)
 * - Recent purchases (last 10)
 * - Current viewing count (estimated based on sale ID hash)
 *
 * Returns: { activities: Activity[], viewCount: number }
 */
export const getSaleActivity = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      res.status(400).json({ message: 'Sale ID is required' });
      return;
    }

    // Query for recent favorites on items in this sale
    const recentFavorites = await prisma.favorite.findMany({
      where: {
        item: {
          saleId: id,
        },
      },
      include: {
        user: { select: { name: true } },
        item: { select: { title: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    // Query for recent purchases in this sale
    const recentPurchases = await prisma.purchase.findMany({
      where: {
        saleId: id,
      },
      include: {
        user: { select: { name: true } },
        item: { select: { title: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    // Build activities array
    const activities = [
      ...recentFavorites.map((fav) => ({
        id: fav.id,
        type: 'save' as const,
        message: `${fav.user.name || 'Someone'} just saved ${fav.item?.title || 'an item'}`,
        timestamp: fav.createdAt.toISOString(),
      })),
      ...recentPurchases.map((purch) => ({
        id: purch.id,
        type: 'purchase' as const,
        message: `${purch.user.name || 'Someone'} just bought ${purch.item?.title || 'an item'}`,
        timestamp: purch.createdAt.toISOString(),
      })),
    ];

    // Sort by timestamp descending and take top 20
    activities.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // Estimate viewing count using a simple hash-based seeded random
    // This gives consistent per-sale numbers without database overhead
    const hash = id.split('').reduce((acc, char) => {
      return ((acc << 5) - acc) + char.charCodeAt(0);
    }, 0);
    const viewCount = (Math.abs(hash) % 15) + 1; // Random number 1-15 per sale ID

    res.json({
      activities: activities.slice(0, 20),
      viewCount,
    });
  } catch (error) {
    console.error('Error fetching sale activity:', error);
    res.status(500).json({ message: 'Server error loading activity feed' });
  }
};
