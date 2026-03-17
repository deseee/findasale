import { prisma } from '../lib/prisma';

export interface CityHeat {
  label: string;
  saleCount: number;
  itemCount: number;
  totalEstimatedValue: number;
  trend: 'up' | 'stable' | 'down';
  lat: number;
  lng: number;
}

export interface CityHeatResponse {
  cities: CityHeat[];
  timestamp: string;
  cacheAge: number;
}

/**
 * Compute city heat index from published sales in past 30 days.
 * Groups by lat/lng rounded to 1 decimal place (~11km grid cells).
 * Returns top 10 cells with sale count, item count, estimated value, and trend.
 */
export const getCityHeatIndex = async (): Promise<CityHeat[]> => {
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const fourteenDaysAgo = new Date(now);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  // Fetch published sales with items in past 30 days
  const sales = await prisma.sale.findMany({
    where: {
      status: 'PUBLISHED',
      startDate: {
        gte: thirtyDaysAgo,
      },
      endDate: {
        gte: now, // hasn't ended yet
      },
    },
    select: {
      id: true,
      lat: true,
      lng: true,
      startDate: true,
      _count: { select: { items: true } },
    },
  });

  // Fetch item prices grouped by saleId
  const itemsByManySales = await prisma.sale.findMany({
    where: {
      status: 'PUBLISHED',
      startDate: {
        gte: thirtyDaysAgo,
      },
      endDate: {
        gte: now,
      },
    },
    select: {
      id: true,
      items: {
        select: { price: true },
        where: { price: { not: null } },
      },
    },
  });

  // Build map: saleId -> sum of item prices
  const saleValueMap = new Map<string, number>();
  for (const sale of itemsByManySales) {
    const totalValue = sale.items.reduce((sum, item) => sum + (item.price ?? 0), 0);
    saleValueMap.set(sale.id, totalValue);
  }

  // Group sales by cell: lat/lng rounded to 1 decimal
  interface CellData {
    lat: number;
    lng: number;
    salesThisWeek: string[];
    salesLastWeek: string[];
    totalValue: number;
    totalItems: number;
  }
  const cellMap = new Map<string, CellData>();

  for (const sale of sales) {
    const cellLat = Math.round(sale.lat * 10) / 10;
    const cellLng = Math.round(sale.lng * 10) / 10;
    const cellKey = `${cellLat},${cellLng}`;

    const isThisWeek = sale.startDate >= sevenDaysAgo;
    const isLastWeek = sale.startDate >= fourteenDaysAgo && sale.startDate < sevenDaysAgo;

    if (!cellMap.has(cellKey)) {
      cellMap.set(cellKey, {
        lat: cellLat,
        lng: cellLng,
        salesThisWeek: [],
        salesLastWeek: [],
        totalValue: 0,
        totalItems: sale._count.items,
      });
    }

    const cell = cellMap.get(cellKey)!;
    if (isThisWeek) cell.salesThisWeek.push(sale.id);
    if (isLastWeek) cell.salesLastWeek.push(sale.id);
    cell.totalValue += saleValueMap.get(sale.id) ?? 0;
    cell.totalItems += sale._count.items;
  }

  // Convert cells to CityHeat, compute trend, sort by sale count
  const cities: CityHeat[] = [];
  cellMap.forEach((cell) => {
    const thisWeekCount = cell.salesThisWeek.length;
    const lastWeekCount = cell.salesLastWeek.length;
    let trend: 'up' | 'stable' | 'down' = 'stable';
    if (thisWeekCount > lastWeekCount) trend = 'up';
    else if (thisWeekCount < lastWeekCount) trend = 'down';

    // Label derivation: hard-code Grand Rapids downtown for specific lat/lng ranges, else generic
    let label = 'Area';
    if (cell.lat >= 42.7 && cell.lat <= 42.8 && cell.lng >= -85.3 && cell.lng <= -85.2) {
      label = 'Downtown Grand Rapids';
    } else if (cell.lat >= 42.9 && cell.lat <= 43.0 && cell.lng >= -85.4 && cell.lng <= -85.3) {
      label = 'North Grand Rapids';
    } else if (cell.lat >= 42.6 && cell.lat <= 42.7 && cell.lng >= -85.3 && cell.lng <= -85.2) {
      label = 'South Grand Rapids';
    } else {
      label = `Area ${cell.lat.toFixed(1)}, ${cell.lng.toFixed(1)}`;
    }

    cities.push({
      label,
      saleCount: thisWeekCount,
      itemCount: cell.totalItems,
      totalEstimatedValue: cell.totalValue,
      trend,
      lat: cell.lat,
      lng: cell.lng,
    });
  });

  // Sort by sale count descending, return top 10
  return cities.sort((a, b) => b.saleCount - a.saleCount).slice(0, 10);
};

/**
 * In-memory cache for city heat index.
 * Key: "city-heat" (single cache entry)
 * Value: { cities, timestamp }
 */
interface CacheEntry {
  cities: CityHeat[];
  timestamp: Date;
}
let cityHeatCache: CacheEntry | null = null;

/**
 * Get cached or compute city heat index.
 * Cache TTL: 6 hours = 21600000ms
 */
export const getOrComputeCityHeatIndex = async (
  forceRefresh: boolean = false
): Promise<CityHeatResponse> => {
  const now = new Date();
  const cacheTTL = 6 * 60 * 60 * 1000; // 6 hours in ms

  // Check cache and TTL
  if (
    !forceRefresh &&
    cityHeatCache &&
    now.getTime() - cityHeatCache.timestamp.getTime() < cacheTTL
  ) {
    return {
      cities: cityHeatCache.cities,
      timestamp: cityHeatCache.timestamp.toISOString(),
      cacheAge: Math.floor((now.getTime() - cityHeatCache.timestamp.getTime()) / 1000), // seconds
    };
  }

  // Cache miss or force refresh: compute from DB
  const cities = await getCityHeatIndex();
  const timestamp = new Date();
  cityHeatCache = { cities, timestamp };

  return {
    cities,
    timestamp: timestamp.toISOString(),
    cacheAge: 0,
  };
};
