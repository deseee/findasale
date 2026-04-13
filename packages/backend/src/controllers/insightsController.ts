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

export const getOrganizerInsights = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
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
          totalRevenue += item.price;
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
      ? itemsWithPrice.reduce((sum, item) => sum + (item.price || 0), 0) / itemsWithPrice.length
      : 0;

    // Get top 5 items by price (as proxy for popular/valuable items)
    // If viewCount existed on Item, we'd sort by that instead
    const topItems = allItems
      .filter((item) => item.price != null)
      .sort((a, b) => (b.price || 0) - (a.price || 0))
      .slice(0, 5)
      .map((item) => ({
        id: item.id,
        title: item.title,
        price: item.price,
        category: item.category || 'uncategorized',
        status: item.status,
      }));

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
