import { prisma } from '../lib/prisma';

export interface HeatmapTile {
  lat: number;
  lng: number;
  radius: number;
  saleDensity: number;
  saleDensityCategory: string;
  color: string;
  salesInRadius: string[];
}

export interface HeatmapResponse {
  tiles: HeatmapTile[];
  legend: Record<
    string,
    { color: string; label: string }
  >;
  timestamp: string;
  cacheAge: number;
}

// Color mapping: tier 1-5 based on sales count
const getTierFromCount = (
  count: number
): { tier: number; category: string; color: string } => {
  if (count <= 2) return { tier: 1, category: 'very-low', color: '#fff3e0' };
  if (count <= 5) return { tier: 2, category: 'low', color: '#ffb74d' };
  if (count <= 10) return { tier: 3, category: 'medium', color: '#f57c00' };
  if (count <= 20) return { tier: 4, category: 'high', color: '#e64a19' };
  return { tier: 5, category: 'very-high', color: '#d32f2f' };
};

/**
 * Compute heatmap tiles from Sales table
 * Groups sales into ~1.5km grid cells (lat/lng rounded to 2 decimals)
 * Returns array of tiles with density, color, and sales within each cell
 */
export const computeHeatmapTiles = async (
  daysWindow: number = 7
): Promise<HeatmapTile[]> => {
  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() - daysWindow);

  // Fetch PUBLISHED, ACTIVE sales within next 14 days with lat/lng set
  const sales = await prisma.sale.findMany({
    where: {
      status: 'PUBLISHED',
      startDate: {
        lte: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000), // within next 14 days
      },
      endDate: {
        gte: now, // hasn't ended yet
      },
    },
    select: { id: true, lat: true, lng: true },
  });

  // Group sales into grid cells (lat/lng rounded to 2 decimals ≈ 1.1km)
  const cellMap = new Map<string, { lat: number; lng: number; ids: string[] }>();

  for (const sale of sales) {
    // Skip sales without coordinates
    if (sale.lat === null || sale.lng === null) continue;

    const cellLat = Math.round(sale.lat * 100) / 100;
    const cellLng = Math.round(sale.lng * 100) / 100;
    const cellKey = `${cellLat},${cellLng}`;

    if (!cellMap.has(cellKey)) {
      cellMap.set(cellKey, { lat: cellLat, lng: cellLng, ids: [] });
    }
    cellMap.get(cellKey)!.ids.push(sale.id);
  }

  // Convert cells to tiles with color tiers
  const tiles: HeatmapTile[] = [];
  cellMap.forEach((cell) => {
    const tierInfo = getTierFromCount(cell.ids.length);
    tiles.push({
      lat: cell.lat,
      lng: cell.lng,
      radius: 0.5, // roughly 0.5km radius for Leaflet circle marker
      saleDensity: cell.ids.length,
      saleDensityCategory: tierInfo.category,
      color: tierInfo.color,
      salesInRadius: cell.ids,
    });
  });

  return tiles;
};

/**
 * Build legend for heatmap display (client-side)
 */
export const buildHeatmapLegend = (): Record<
  string,
  { color: string; label: string }
> => {
  return {
    '1-2': { color: '#fff3e0', label: 'Very Low (1–2)' },
    '3-5': { color: '#ffb74d', label: 'Low (3–5)' },
    '6-10': { color: '#f57c00', label: 'Medium (6–10)' },
    '11-20': { color: '#e64a19', label: 'High (11–20)' },
    '21+': { color: '#d32f2f', label: 'Very High (21+)' },
  };
};

/**
 * In-memory cache for heatmap tiles
 * Key: date string (YYYY-MM-DD)
 * Value: { tiles, timestamp }
 */
let heatmapCache: Record<
  string,
  { tiles: HeatmapTile[]; timestamp: Date }
> = {};

/**
 * Get cached or compute heatmap tiles
 * Cache TTL: 6 hours per spec
 */
export const getOrComputeHeatmapTiles = async (
  daysWindow: number = 7,
  forceRefresh: boolean = false
): Promise<HeatmapResponse> => {
  const now = new Date();
  const dateKey = now.toISOString().split('T')[0]; // YYYY-MM-DD

  // Check cache and TTL (6 hours = 21600000ms)
  const cacheTTL = 6 * 60 * 60 * 1000;
  if (
    !forceRefresh &&
    heatmapCache[dateKey] &&
    now.getTime() - heatmapCache[dateKey].timestamp.getTime() < cacheTTL
  ) {
    const cached = heatmapCache[dateKey];
    return {
      tiles: cached.tiles,
      legend: buildHeatmapLegend(),
      timestamp: cached.timestamp.toISOString(),
      cacheAge: Math.floor(
        (now.getTime() - cached.timestamp.getTime()) / 1000
      ), // seconds
    };
  }

  // Cache miss or force refresh: compute from DB
  const tiles = await computeHeatmapTiles(daysWindow);
  const timestamp = new Date();

  heatmapCache[dateKey] = { tiles, timestamp };

  return {
    tiles,
    legend: buildHeatmapLegend(),
    timestamp: timestamp.toISOString(),
    cacheAge: 0,
  };
};
