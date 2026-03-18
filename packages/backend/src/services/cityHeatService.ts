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
 * Groups by city name from the Sale record.
 * Returns top 10 cities with sale count, item count, estimated value, and trend.
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
      city: true,
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

  // Group sales by city
  interface CityData {
    latitudes: number[];
    longitudes: number[];
    salesThisWeek: string[];
    salesLastWeek: string[];
    totalValue: number;
    totalItems: number;
  }
  const cityMap = new Map<string, CityData>();

  for (const sale of sales) {
    const cityKey = sale.city;

    const isThisWeek = sale.startDate >= sevenDaysAgo;
    const isLastWeek = sale.startDate >= fourteenDaysAgo && sale.startDate < sevenDaysAgo;

    if (!cityMap.has(cityKey)) {
      cityMap.set(cityKey, {
        latitudes: [],
        longitudes: [],
        salesThisWeek: [],
        salesLastWeek: [],
        totalValue: 0,
        totalItems: 0,
      });
    }

    const city = cityMap.get(cityKey)!;
    city.latitudes.push(sale.lat);
    city.longitudes.push(sale.lng);
    if (isThisWeek) city.salesThisWeek.push(sale.id);
    if (isLastWeek) city.salesLastWeek.push(sale.id);
    city.totalValue += saleValueMap.get(sale.id) ?? 0;
    city.totalItems += sale._count.items;
  }

  // Convert cities to CityHeat, compute trend, sort by sale count
  const cities: CityHeat[] = [];
  cityMap.forEach((city, cityName) => {
    const thisWeekCount = city.salesThisWeek.length;
    const lastWeekCount = city.salesLastWeek.length;
    let trend: 'up' | 'stable' | 'down' = 'stable';
    if (thisWeekCount > lastWeekCount) trend = 'up';
    else if (thisWeekCount < lastWeekCount) trend = 'down';

    // Average lat/lng for map placement
    const avgLat = city.latitudes.length > 0
      ? city.latitudes.reduce((a, b) => a + b, 0) / city.latitudes.length
      : 0;
    const avgLng = city.longitudes.length > 0
      ? city.longitudes.reduce((a, b) => a + b, 0) / city.longitudes.length
      : 0;

    cities.push({
      label: cityName,
      saleCount: thisWeekCount,
      itemCount: city.totalItems,
      totalEstimatedValue: city.totalValue,
      trend,
      lat: avgLat,
      lng: avgLng,
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
