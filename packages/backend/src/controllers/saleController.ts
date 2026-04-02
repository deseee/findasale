import { Request, Response } from 'express';
import { z } from 'zod';
import QRCode from 'qrcode';
import { handleFavoriteBadge } from './userController';
import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import { createNotification } from '../lib/notificationService';
import { notifyFollowersOfNewSale } from '../services/followerNotificationService';
import { syncOrganizerTier } from '../services/tierService';
import { notifyMatchedBuyers } from '../services/buyerMatchService';
import { markSalePublished } from '../services/mailerliteService';
import { generateSaleDescription, isAnthropicAvailable } from '../services/cloudAIService';
import { PUBLIC_ITEM_FILTER } from '../helpers/itemQueries'; // Phase 1B: Rapidfire Mode public item filtering
import { invalidateCommandCenterCache } from '../services/commandCenterService'; // P2-3: Cache invalidation
import { notifyNearbyFavorites } from '../services/rippleService'; // Phase 5: #51 Sale Ripples
import { getIO } from '../lib/socket'; // V1: Socket.io instance
import { checkAlertsForNewSale } from '../services/wishlistAlertService'; // Feature #32: Wishlist Alerts
import { checkFollowsForNewSale } from '../services/smartFollowService'; // Feature #32: Smart Follow
import { checkPassportMatchForNewSale } from '../services/collectorPassportService'; // Feature #45: Collector Passport
import { awardXp, XP_AWARDS } from '../services/xpService'; // Explorer's Guild XP awards

// Feature #5: Sale type categories (inlined from shared package)
enum SaleType {
  ESTATE = 'ESTATE',
  YARD = 'YARD',
  AUCTION = 'AUCTION',
  FLEA_MARKET = 'FLEA_MARKET',
  CONSIGNMENT = 'CONSIGNMENT',
  CHARITY = 'CHARITY',
  BUSINESS_CORPORATE = 'BUSINESS_CORPORATE',
}

// Updated datetime validation to accept ISO 8601 format with optional milliseconds and timezone,
// or plain YYYY-MM-DD date strings (coerced to midnight UTC)
const iso8601DatetimeSchema = z.string()
  .regex(
    /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/,
    'Invalid datetime format. Expected ISO 8601 format or YYYY-MM-DD.'
  )
  .transform((val) => {
    // If it's a plain date (YYYY-MM-DD), convert to ISO datetime at midnight UTC
    if (!/T/.test(val)) {
      return `${val}T00:00:00Z`;
    }
    return val;
  });

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
  lat: z.number().optional(),
  lng: z.number().optional(),
  photoUrls: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  isAuctionSale: z.boolean().optional().default(false), // Deprecated: use saleType instead
  // B1: Sale type — Feature #5: Strict validation for enum consistency
  // Allow all 7 sale type options from frontend
  saleType: z.enum(['ESTATE', 'YARD', 'AUCTION', 'FLEA_MARKET', 'CONSIGNMENT', 'CHARITY', 'BUSINESS_CORPORATE'], {
    errorMap: () => ({ message: 'Invalid sale type. Must be one of: ESTATE, YARD, AUCTION, FLEA_MARKET, CONSIGNMENT, CHARITY, BUSINESS_CORPORATE' })
  }).optional().default(SaleType.ESTATE),
  neighborhood: z.string().optional(), // U2
  // Feature 35: Front Door Locator
  entranceLat: z.number().optional(),
  entranceLng: z.number().optional(),
  entranceNote: z.string().max(150).optional(),
  // Feature #84: Day-of Approach Notes
  notes: z.string().optional(),
  // Feature #85: Treasure Hunt QR
  treasureHuntEnabled: z.boolean().optional(),
  treasureHuntCompletionBadge: z.boolean().optional(),
  holdsEnabled: z.boolean().optional(),  // Feature #121: allow organizer to disable holds per-sale
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
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }

    const organizer = await prisma.organizer.findUnique({ where: { userId: req.user.id } });
    if (!organizer) return res.json({ sales: [] });

    const sales = await prisma.sale.findMany({
      where: { organizerId: organizer.id },
      orderBy: { startDate: 'asc' },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        startDate: true,
        endDate: true,
        address: true,
        city: true,
        state: true,
        zip: true,
        photoUrls: true,
        tags: true,
        saleType: true,
        createdAt: true,
        updatedAt: true,
        organizerId: true,
        lat: true,
        lng: true,
        qrScanCount: true,
        endingSoonNotified: true,
        entranceLat: true,
        entranceLng: true,
        entranceNote: true,
        notes: true,
        treasureHuntEnabled: true,
        treasureHuntCompletionBadge: true,
        holdsEnabled: true,
        isAuctionSale: true,
        organizer: { select: { userId: true, businessName: true, phone: true, address: true } },
        items: { select: { id: true, title: true, price: true, status: true } },
        _count: { select: { items: true } }
      },
      take: 50
    });

    // Fetch active hold counts per sale
    const saleIds = sales.map(s => s.id);
    const holdCountsMap = new Map<string, number>();

    if (saleIds.length > 0) {
      const holdCounts = await prisma.itemReservation.groupBy({
        by: ['itemId'],
        where: {
          item: {
            saleId: { in: saleIds }
          },
          status: { in: ['PENDING', 'CONFIRMED'] }
        }
      });

      // Map holds to sales by joining on items
      const itemToSaleMap = new Map<string, string>();
      sales.forEach(sale => {
        sale.items.forEach(item => {
          itemToSaleMap.set(item.id, sale.id);
        });
      });

      holdCounts.forEach(holdCount => {
        const saleId = itemToSaleMap.get(holdCount.itemId);
        if (saleId) {
          holdCountsMap.set(saleId, (holdCountsMap.get(saleId) ?? 0) + 1);
        }
      });
    }

    // Enrich sales with stats
    const enrichedSales = sales.map((s: any) => ({
      ...s,
      stats: {
        itemCount: s._count.items,
        holdCount: holdCountsMap.get(s.id) ?? 0,
        visitorCount: s.qrScanCount
      }
    }));

    res.json({ sales: enrichedSales.map((s: any) => convertDecimalsToNumbers(s)) });
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
          where: PUBLIC_ITEM_FILTER,
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
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    const isAdmin = req.user?.role === 'ADMIN';
    if (!req.user || (!hasOrganizerRole && !isAdmin)) {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }

    const saleData = saleCreateSchema.parse(req.body);

    let organizerId = req.user.organizerProfile?.id;
    if (!organizerId && isAdmin) {
      organizerId = req.body.organizerId;
    } else if (!organizerId && hasOrganizerRole) {
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
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    const isAdmin = req.user?.role === 'ADMIN';
    if (!req.user || (!hasOrganizerRole && !isAdmin)) {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }

    const { id } = req.params;
    const saleData = saleUpdateSchema.parse(req.body);

    const existingSale = await prisma.sale.findUnique({ where: { id } });
    if (!existingSale) return res.status(404).json({ message: 'Sale not found' });

    if (!isAdmin) {
      const organizerProfile = await prisma.organizer.findUnique({ where: { userId: req.user.id } });
      if (!organizerProfile || existingSale.organizerId !== organizerProfile.id) {
        return res.status(403).json({ message: 'Access denied. You can only update your own sales.' });
      }
    }
    
    // P1 Bug 3: Validate entrance pin is within ~2.8 miles of sale address
    if (saleData.entranceLat !== undefined && saleData.entranceLng !== undefined) {
      if (existingSale.lat && existingSale.lng) {
        const distance = Math.hypot(
          (saleData.entranceLat as number) - existingSale.lat,
          (saleData.entranceLng as number) - existingSale.lng
        );
        if (distance > 0.05) {
          return res.status(400).json({
            message: 'Entrance pin is too far from the sale address. Please place it within ~2.8 miles.'
          });
        }
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
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    const isAdmin = req.user?.role === 'ADMIN';
    if (!req.user || (!hasOrganizerRole && !isAdmin)) {
      return res.status(403).json({ message: 'Access denied. Organizer/Admin access required.' });
    }

    const { id } = req.params;
    const existingSale = await prisma.sale.findUnique({ where: { id } });
    if (!existingSale) return res.status(404).json({ message: 'Sale not found' });

    if (!isAdmin) {
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
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    const isAdmin = req.user?.role === 'ADMIN';
    if (!req.user || (!hasOrganizerRole && !isAdmin)) {
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

    if (!isAdmin) {
      const organizerProfile = await prisma.organizer.findUnique({ where: { userId: req.user.id } });
      if (!organizerProfile || existingSale.organizerId !== organizerProfile.id) {
        return res.status(403).json({ message: 'Access denied. You can only update your own sales.' });
      }
    }

    const transitions: Record<string, string[]> = {
      DRAFT: ['PUBLISHED'],
      PUBLISHED: ['ENDED'],
      ENDED: ['PUBLISHED'],
    };
    const allowed = transitions[existingSale.status] || [];
    if (!allowed.includes(status)) {
      return res.status(400).json({
        message: `Cannot transition from ${existingSale.status} to ${status}.`,
      });
    }

    const updated = await prisma.sale.update({ where: { id }, data: { status } });

    if (status === 'PUBLISHED' && existingSale.status === 'DRAFT') {
      // Notify organizer that sale is now live
      prisma.organizer.findUnique({ where: { id: updated.organizerId }, select: { userId: true } }).then((org) => {
        if (org?.userId) {
          createNotification({
            userId: org.userId,
            type: 'sale_published',
            title: 'Sale is now live',
            body: `Your sale "${updated.title}" is now live and visible to shoppers`,
            link: `/organizer/sales/${updated.id}`,
            channel: 'OPERATIONAL',
          }).catch(() => {});

          // Award XP for publishing a sale
          awardXp(org.userId, 'SALE_PUBLISHED', XP_AWARDS.REFERRAL_SIGNUP, { saleId: updated.id }).catch(err =>
            console.error('[XP] Failed to award XP for sale published:', err)
          );
        }
      }).catch(() => {});

      notifyFollowersOfNewSale(updated).catch(() => {});
      notifyMatchedBuyers(updated.id).catch((err) => {
        console.error('[buyerMatch] Failed to notify matched buyers:', err);
      });

      // Phase 5: #51 Sale Ripples — notify nearby favorites
      notifyNearbyFavorites(updated.id, getIO()).catch((err) => {
        console.error('[rippleService] Failed to notify nearby favorites:', err);
      });

      // Feature #32: Check wishlist alerts and smart follows
      checkAlertsForNewSale(updated.id).catch(console.error);
      checkFollowsForNewSale(updated).catch(console.error);

      // Feature #45: Check collector passports for matching items
      checkPassportMatchForNewSale(updated.id).catch(console.error);

      // MailerLite: set sale_published custom field so onboarding automation exits
      prisma.organizer.findUnique({
        where: { id: updated.organizerId },
        include: { user: { select: { email: true } } },
      }).then((org) => {
        if (org?.user?.email) {
          markSalePublished(org.user.email).catch((err) => {
            console.error('[mailerlite] markSalePublished failed:', err);
          });
        }
      }).catch(() => {});
    }

    // Phase 31: When sale is marked ENDED, recalculate organizer's tier
    if (status === 'ENDED') {
      syncOrganizerTier(updated.organizerId).catch((err) => {
        console.error('[tierService] Failed to sync tier for organizer:', updated.organizerId, err);
      });
    }

    res.json(convertDecimalsToNumbers(updated));

    // P2-3: Invalidate command center cache after sale status change
    invalidateCommandCenterCache(updated.organizerId).catch((err) =>
      console.warn('Failed to invalidate command center cache:', err)
    );
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
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    const isAdmin = req.user?.role === 'ADMIN';
    if (!req.user || (!hasOrganizerRole && !isAdmin)) {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }

    const { id } = req.params;
    const existingSale = await prisma.sale.findUnique({ where: { id } });
    if (!existingSale) return res.status(404).json({ message: 'Sale not found' });

    if (!isAdmin) {
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

export const getSalesByCity = async (req: Request, res: Response) => {
  try {
    const { city } = req.params;
    const { page = '1', limit = '12' } = req.query;

    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 12;
    const skip = (pageNum - 1) * limitNum;

    // Decode city slug and convert hyphens to spaces for matching
    const citySlug = decodeURIComponent(city as string).replace(/-/g, ' ');

    const now = new Date();
    const sales = await prisma.sale.findMany({
      where: {
        status: 'PUBLISHED',
        endDate: { gte: now },
        city: { contains: citySlug, mode: 'insensitive' }
      },
      skip,
      take: limitNum,
      select: {
        id: true, title: true, description: true, startDate: true, endDate: true,
        address: true, city: true, state: true, zip: true, lat: true, lng: true,
        photoUrls: true, tags: true,
        organizer: { select: { businessName: true, avgRating: true } },
        _count: { select: { items: true } },
      },
      orderBy: { startDate: 'asc' },
    });

    const total = await prisma.sale.count({
      where: {
        status: 'PUBLISHED',
        endDate: { gte: now },
        city: { contains: citySlug, mode: 'insensitive' }
      }
    });

    res.json({ sales: sales.map(convertDecimalsToNumbers), total, page: pageNum, totalPages: Math.ceil(total / limitNum) });
  } catch (error) {
    console.error('Error fetching city sales:', error);
    res.status(500).json({ message: 'Server error while fetching city sales' });
  }
};

export const cloneSale = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    const isAdmin = req.user?.role === 'ADMIN';
    if (!req.user || (!hasOrganizerRole && !isAdmin)) {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }

    const { id } = req.params;

    // Fetch the source sale
    const sourceSale = await prisma.sale.findUnique({ where: { id } });
    if (!sourceSale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    // Verify ownership (unless admin)
    if (!isAdmin) {
      const organizerProfile = await prisma.organizer.findUnique({ where: { userId: req.user.id } });
      if (!organizerProfile || sourceSale.organizerId !== organizerProfile.id) {
        return res.status(403).json({ message: 'Access denied. You can only clone your own sales.' });
      }
    }

    // Create a new sale with cloned data
    // Feature #5: Preserve saleType during clone (not isAuctionSale which is deprecated)
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
        saleType: sourceSale.saleType,
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
        message: `${purch.user?.name || 'Someone'} just bought ${purch.item?.title || 'an item'}`,
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

// ── AI Sale Description Generator ─────────────────────────────────────────────

export const generateSaleDescriptionHandler = async (req: AuthRequest, res: Response): Promise<void> => {
  const { title, tags, city, isAuctionSale, startDate, endDate } = req.body as {
    title?: string;
    tags?: string[];
    city?: string;
    isAuctionSale?: boolean;
    startDate?: string;
    endDate?: string;
  };

  if (!title || typeof title !== 'string' || title.trim() === '') {
    res.status(400).json({ message: 'title is required' });
    return;
  }

  if (title.trim().length > 300) {
    res.status(400).json({ message: 'title must be 300 characters or fewer' });
    return;
  }

  if (!isAnthropicAvailable()) {
    res.status(503).json({ message: 'AI description service unavailable' });
    return;
  }

  try {
    const description = await generateSaleDescription({
      title: title.trim(),
      tags: Array.isArray(tags) ? tags : [],
      city: typeof city === 'string' ? city : undefined,
      isAuctionSale: typeof isAuctionSale === 'boolean' ? isAuctionSale : false,
      startDate: typeof startDate === 'string' ? startDate : undefined,
      endDate: typeof endDate === 'string' ? endDate : undefined,
    });

    if (!description) {
      res.status(503).json({ message: 'AI description service unavailable' });
      return;
    }

    res.json({ description });
  } catch (error) {
    console.error('Error generating sale description:', error);
    res.status(500).json({ message: 'Failed to generate description' });
  }
};

/**
 * Feature #14: Get real-time sale status (items sold, holds, remaining, revenue)
 * GET /api/sales/:id/status
 * Public endpoint (no auth required)
 */
export const getSaleStatus = async (req: Request, res: Response) => {
  try {
    const { id: saleId } = req.params;
    if (!saleId) {
      return res.status(400).json({ message: 'saleId is required' });
    }

    const { getSaleStatus: getSaleStatusService } = await import('../services/saleStatusService');
    const status = await getSaleStatusService(saleId);
    res.json(status);
  } catch (error: any) {
    console.error('[sale-status] Error:', error);
    if (error.message?.includes('not found')) {
      return res.status(404).json({ message: 'Sale not found' });
    }
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Get cities with active sales and item counts
 * GET /api/sales/cities
 * Public endpoint (no auth required)
 * Returns: [{ city: string, count: number }, ...] sorted by count DESC, then alphabetically
 */
export const getCities = async (req: Request, res: Response) => {
  try {
    const now = new Date();

    // #105: SQL Injection hardening - use Prisma.sql for parameterized queries
    const cityData = await prisma.$queryRaw<{ city: string; state: string; count: bigint; lastSaleDate: Date | null }[]>(
      Prisma.sql`
        SELECT city, state, COUNT(*) as count, MAX("endDate") as "lastSaleDate"
        FROM "Sale"
        WHERE status IN ('PUBLISHED', 'ACTIVE')
          AND "endDate" >= ${now}
          AND city IS NOT NULL
          AND TRIM(city) != ''
        GROUP BY city, state
        ORDER BY count DESC, city ASC
      `
    );

    const response = cityData.map(item => ({
      city: item.city,
      state: item.state,
      activeSales: Number(item.count),
      totalSales: Number(item.count),
      lastSaleDate: item.lastSaleDate ? item.lastSaleDate.toISOString() : undefined,
    }));

    res.json({ cities: response });
  } catch (error: any) {
    console.error('[cities] Error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Feature #91: Auto-Markdown (Smart Clearance)
export const updateMarkdownConfig = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    const isAdmin = req.user?.role === 'ADMIN';
    if (!req.user || (!hasOrganizerRole && !isAdmin)) {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }

    const { id: saleId } = req.params;
    const { markdownEnabled, markdownFloor } = req.body;

    // Validate inputs
    if (typeof markdownEnabled !== 'boolean') {
      return res.status(400).json({ message: 'markdownEnabled must be a boolean' });
    }
    if (markdownFloor !== undefined && markdownFloor !== null && typeof markdownFloor !== 'number') {
      return res.status(400).json({ message: 'markdownFloor must be a number' });
    }
    if (markdownFloor !== undefined && markdownFloor !== null && markdownFloor < 0) {
      return res.status(400).json({ message: 'markdownFloor cannot be negative' });
    }

    const existingSale = await prisma.sale.findUnique({ where: { id: saleId } });
    if (!existingSale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    if (!isAdmin) {
      const organizerProfile = await prisma.organizer.findUnique({ where: { userId: req.user.id } });
      if (!organizerProfile || existingSale.organizerId !== organizerProfile.id) {
        return res.status(403).json({ message: 'Access denied. You can only update your own sales.' });
      }
    }

    const sale = await prisma.sale.update({
      where: { id: saleId },
      data: {
        markdownEnabled,
        markdownFloor: markdownFloor || null,
      },
    });

    res.json(convertDecimalsToNumbers(sale));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error while updating markdown config' });
  }
};

export const getMarkdownConfig = async (req: AuthRequest, res: Response) => {
  try {
    const { id: saleId } = req.params;

    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: {
        id: true,
        markdownEnabled: true,
        markdownFloor: true,
      },
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    res.json(convertDecimalsToNumbers(sale));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error while fetching markdown config' });
  }
};

// #120: Sale Cancellation Audit
export const cancelSale = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    const isAdmin = req.user?.role === 'ADMIN';
    if (!req.user || (!hasOrganizerRole && !isAdmin)) {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }

    const { id } = req.params;
    const { cancellationReason } = req.body;

    const existingSale = await prisma.sale.findUnique({
      where: { id },
      include: {
        organizer: { select: { userId: true } },
        items: { select: { id: true, status: true } }
      }
    });

    if (!existingSale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    if (!isAdmin) {
      if (existingSale.organizer.userId !== req.user.id) {
        return res.status(403).json({ message: 'Access denied. You can only cancel your own sales.' });
      }
    }

    // Only allow cancellation of DRAFT or PUBLISHED sales
    if (!['DRAFT', 'PUBLISHED'].includes(existingSale.status)) {
      return res.status(400).json({
        message: `Cannot cancel sale with status ${existingSale.status}. Only DRAFT or PUBLISHED sales can be cancelled.`
      });
    }

    // #120: Store cancellation reason and mark as cancelled
    const reason = cancellationReason || 'NOT_PROVIDED';
    const cancelled = await prisma.sale.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancellationReason: reason
      }
    });

    // #120: Audit alert — if created < 2h ago and has 100+ items on hold
    if (existingSale.status === 'PUBLISHED') {
      const minutesSinceCreation = (new Date().getTime() - existingSale.createdAt.getTime()) / (1000 * 60);
      const itemsOnHold = existingSale.items.filter((i: any) => i.status === 'RESERVED').length;

      if (minutesSinceCreation < 120 && itemsOnHold >= 100) {
        console.warn(`[audit] Sale cancelled shortly after publication: saleId=${id}, reason=${reason}, holds=${itemsOnHold}`);
      }
    }

    // Notify organizer
    createNotification({
      userId: existingSale.organizer.userId,
      type: 'sale_cancelled',
      title: 'Sale cancelled',
      body: `Your sale "${existingSale.title}" has been cancelled.`,
      link: `/organizer/sales/${id}`,
      channel: 'OPERATIONAL'
    }).catch(() => {});

    res.json(cancelled);
  } catch (error) {
    console.error('Cancel sale error:', error);
    res.status(500).json({ message: 'Server error while cancelling sale' });
  }
};

/**
 * Phase 2a: Record a visit to a sale and award 10 XP (daily cap enforced)
 * POST /api/sales/:id/visit
 */
export const recordVisit = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id: saleId } = req.params;
    const userId = req.user?.id;

    if (!saleId || !userId) {
      res.status(400).json({ message: 'saleId and authentication required.' });
      return;
    }

    // Verify sale exists
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
    });

    if (!sale) {
      res.status(404).json({ message: 'Sale not found.' });
      return;
    }

    // Check if user already recorded a visit to this sale today (prevent duplicate visits)
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const alreadyVisitedToday = await prisma.pointsTransaction.findFirst({
      where: {
        userId,
        type: 'VISIT',
        saleId,
        createdAt: {
          gte: today,
        },
      },
    });

    if (alreadyVisitedToday) {
      res.status(200).json({
        message: 'Sale already visited today.',
        guildXp: (await prisma.user.findUnique({ where: { id: userId }, select: { guildXp: true } }))?.guildXp,
      });
      return;
    }

    // Award 10 XP for visit
    const { awardXp } = await import('../services/xpService');
    const xpResult = await awardXp(userId, 'VISIT', 10, { saleId, description: `Visited sale: ${sale.title}` });

    if (!xpResult) {
      res.status(500).json({ message: 'Failed to award XP.' });
      return;
    }

    // Update user's lastVisitDate if field exists
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { lastVisitDate: new Date() },
      });
    } catch {
      // Field may not exist, continue
    }

    res.json({
      message: 'Visit recorded. XP awarded!',
      guildXp: xpResult.newXp,
      explorerRank: xpResult.newRank,
    });
  } catch (error) {
    console.error('Record visit error:', error);
    res.status(500).json({ message: 'Server error while recording visit' });
  }
};
