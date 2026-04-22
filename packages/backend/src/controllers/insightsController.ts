import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

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

// ---------------------------------------------------------------------------
// GET /api/insights/organizer/sale/:saleId
// Per-sale analytics: item breakdown, revenue, shopper engagement, pickup slots.
// ---------------------------------------------------------------------------
export const getPerSaleAnalytics = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole =
      req.user?.roles?.includes('ORGANIZER') ||
      req.user?.role === 'ORGANIZER' ||
      req.user?.roles?.includes('ADMIN') ||
      req.user?.role === 'ADMIN'; // ADMIN users have organizer access (matches requireOrganizer middleware)
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }

    const { saleId } = req.params;
    if (!saleId) {
      return res.status(400).json({ message: 'saleId is required' });
    }

    // Verify the sale belongs to this organizer
    const organizer = await prisma.organizer.findUnique({ where: { userId: req.user.id } });
    if (!organizer) {
      return res.status(404).json({ message: 'Organizer profile not found' });
    }

    const sale = await prisma.sale.findFirst({
      where: { id: saleId, organizerId: organizer.id },
      select: { id: true, title: true },
    });
    if (!sale) {
      return res.status(404).json({ message: 'Sale not found or access denied' });
    }

    // Item counts by status
    const items = await prisma.item.findMany({
      where: { saleId },
      select: {
        id: true,
        title: true,
        price: true,
        status: true,
        favorites: { select: { id: true } },
      },
    });

    const itemsSold = items.filter(i => i.status === 'SOLD').length;
    const itemsAvailable = items.filter(i => i.status === 'AVAILABLE').length;
    const itemsOnHold = items.filter(i => i.status === 'RESERVED' || i.status === 'AUCTION_ENDED').length;

    // Revenue from PAID purchases for this sale
    const purchases = await prisma.purchase.findMany({
      where: { saleId, status: 'PAID' },
      select: { amount: true, createdAt: true },
    });
    const totalRevenue = purchases.reduce((sum, p) => sum + p.amount, 0);
    const purchaseCount = purchases.length;

    // Top items by favorite count (top 10)
    const topItems = items
      .map(i => ({
        id: i.id,
        title: i.title,
        price: i.price ? Number(i.price) : 0,
        status: i.status,
        favoriteCount: i.favorites.length,
      }))
      .sort((a, b) => b.favoriteCount - a.favoriteCount)
      .slice(0, 10);

    // Shopper engagement
    const [wishlistCount, waitlistCount, uniqueVisitors] = await Promise.all([
      prisma.favorite.count({ where: { saleId } }),
      prisma.saleWaitlist.count({ where: { saleId } }),
      prisma.saleSubscriber.count({ where: { saleId } }),
    ]);

    // Pickup appointments with booking count
    const pickupSlots = await prisma.pickupSlot.findMany({
      where: { saleId },
      include: { bookings: { select: { id: true } } },
      orderBy: { startsAt: 'asc' },
    });
    const pickupAppointments = pickupSlots.map(slot => ({
      startsAt: slot.startsAt.toISOString(),
      endsAt: slot.endsAt.toISOString(),
      capacity: slot.capacity,
      booked: slot.bookings.length,
    }));

    // Revenue timeline: group purchases by calendar date
    const revenueByDate: Record<string, number> = {};
    for (const p of purchases) {
      const date = p.createdAt.toISOString().slice(0, 10); // YYYY-MM-DD
      revenueByDate[date] = (revenueByDate[date] ?? 0) + p.amount;
    }
    const revenueTimeline = Object.entries(revenueByDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, revenue]) => ({ date, revenue }));

    return res.json({
      saleId: sale.id,
      saleName: sale.title,
      itemsSold,
      itemsAvailable,
      itemsOnHold,
      totalItems: items.length,
      totalRevenue,
      purchaseCount,
      topItems,
      uniqueVisitors,
      wishlistCount,
      waitlistCount,
      pickupAppointments,
      revenueTimeline,
    });
  } catch (error) {
    console.error('[insightsController] getPerSaleAnalytics error:', error);
    return res.status(500).json({ message: 'Server error while fetching sale analytics' });
  }
};

export const getOrganizerInsights = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole =
      req.user?.roles?.includes('ORGANIZER') ||
      req.user?.role === 'ORGANIZER' ||
      req.user?.roles?.includes('ADMIN') ||
      req.user?.role === 'ADMIN'; // ADMIN users have organizer access (matches requireOrganizer middleware)
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }

    // Find organizer profile for this user
    const organizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id },
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer profile not found' });
    }

    // Optional: filter to a single sale if saleId query param provided
    const saleIdFilter = req.query.saleId as string | undefined;

    // Fetch sales for this organizer (optionally filtered)
    const sales = await prisma.sale.findMany({
      where: {
        organizerId: organizer.id,
        ...(saleIdFilter ? { id: saleIdFilter } : {}),
      },
      include: {
        items: {
          select: {
            id: true,
            title: true,
            price: true,
            status: true,
            category: true,
          },
        },
      },
    });

    // Also fetch the full sales list (id + title) for the frontend dropdown
    const salesList = await prisma.sale.findMany({
      where: { organizerId: organizer.id },
      select: { id: true, title: true, status: true },
      orderBy: { createdAt: 'desc' },
    });

    // Calculate total sales metrics
    const totalSalesCount = sales.length;
    const activeSalesCount = sales.filter((s) => s.status === 'PUBLISHED').length;

    // Aggregate item metrics
    let totalItems = 0;
    let totalItemsSold = 0;
    let totalItemsAvailable = 0;
    let totalRevenue = 0;
    const categoryMap: Record<string, number> = {};
    const statusMap: Record<string, number> = {};
    const allItems: any[] = [];

    for (const sale of sales) {
      totalItems += sale.items.length;

      for (const item of sale.items) {
        allItems.push(item);

        // Count by status
        statusMap[item.status] = (statusMap[item.status] || 0) + 1;

        if (item.status === 'SOLD' && item.price) {
          totalItemsSold += 1;
          // Convert Decimal to number before addition
          const price = typeof item.price === 'object' && 'toNumber' in item.price
            ? item.price.toNumber()
            : Number(item.price);
          totalRevenue += price;
        }

        if (item.status === 'AVAILABLE') {
          totalItemsAvailable += 1;
        }

        // Count by category
        const category = item.category || 'uncategorized';
        categoryMap[category] = (categoryMap[category] || 0) + 1;
      }
    }

    // Calculate average item price
    const itemsWithPrice = allItems.filter((item) => item.price != null);
    const avgItemPrice = itemsWithPrice.length > 0
      ? itemsWithPrice.reduce((sum, item) => {
          const price = typeof item.price === 'object' && 'toNumber' in item.price
            ? item.price.toNumber()
            : Number(item.price);
          return sum + (price || 0);
        }, 0) / itemsWithPrice.length
      : 0;

    // Get top 5 items by price (as proxy for popular/valuable items)
    // If viewCount existed on Item, we'd sort by that instead
    const topItems = allItems
      .filter((item) => item.price != null)
      .sort((a, b) => {
        const priceA = typeof a.price === 'object' && 'toNumber' in a.price
          ? a.price.toNumber()
          : Number(a.price || 0);
        const priceB = typeof b.price === 'object' && 'toNumber' in b.price
          ? b.price.toNumber()
          : Number(b.price || 0);
        return priceB - priceA;
      })
      .slice(0, 5)
      .map((item) => {
        const price = typeof item.price === 'object' && 'toNumber' in item.price
          ? item.price.toNumber()
          : Number(item.price);
        return {
          id: item.id,
          title: item.title,
          price,
          category: item.category || 'uncategorized',
          status: item.status,
        };
      });

    // Build category breakdown (count per category)
    const categoryBreakdown = Object.entries(categoryMap)
      .map(([category, count]) => ({
        category,
        count,
      }))
      .sort((a, b) => b.count - a.count);

    // Build status breakdown
    const statusBreakdown = Object.entries(statusMap).map(([status, count]) => ({
      status,
      count,
    }));

    // Calculate conversion rate
    const conversionRate = totalItems > 0 ? (totalItemsSold / totalItems) * 100 : 0;

    res.json(
      convertDecimalsToNumbers({
        totalSalesCount,
        activeSalesCount,
        totalItems,
        totalItemsSold,
        totalItemsAvailable,
        avgItemPrice,
        totalRevenue,
        conversionRate: Math.round(conversionRate * 10) / 10, // Round to 1 decimal place
        topItems,
        categoryBreakdown,
        statusBreakdown,
        salesList, // for frontend dropdown — always the full list regardless of saleId filter
      })
    );
  } catch (error) {
    console.error('Error fetching organizer insights:', error);
    res.status(500).json({ message: 'Server error while fetching insights' });
  }
};
