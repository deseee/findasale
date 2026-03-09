import { Request, Response } from 'express';
import axios from 'axios';
import { prisma } from '../lib/prisma';

const OSRM_URL = process.env.OSRM_API_URL || 'https://router.project-osrm.org';
const MAX_SALES = 5;
const MIN_SALES = 2;

interface SaleRow {
  id: string;
  title: string;
  address: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
}

function buildGoogleMapsUrl(sales: SaleRow[]): string {
  if (sales.length === 0) return 'https://www.google.com/maps';
  const encode = (s: SaleRow) => encodeURIComponent(`${s.address}, ${s.city}, ${s.state}`);
  if (sales.length === 1) return `https://www.google.com/maps/search/?api=1&query=${encode(sales[0])}`;
  const origin = encode(sales[0]);
  const destination = encode(sales[sales.length - 1]);
  const wayps = sales.slice(1, -1).map(encode).join('|');
  let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;
  if (wayps) url += `&waypoints=${wayps}`;
  return url;
}

export const planRoute = async (req: Request, res: Response): Promise<void> => {
  try {
    const { saleIds, startCoord } = req.body as {
      saleIds: string[];
      startCoord?: { lat: number; lng: number };
    };

    if (!Array.isArray(saleIds) || saleIds.length < MIN_SALES || saleIds.length > MAX_SALES) {
      res.status(400).json({
        error: `Select between ${MIN_SALES} and ${MAX_SALES} sales to plan a route.`,
        code: 'INVALID_INPUT',
      });
      return;
    }

    // Preserve user-selected order for routing
    const sales = await prisma.sale.findMany({
      where: {
        id: { in: saleIds },
        status: 'PUBLISHED',
      },
      select: { id: true, title: true, address: true, city: true, state: true, lat: true, lng: true },
    });

    // Re-order to match user's saleIds order
    const salesMap = new Map(sales.map((s) => [s.id, s]));
    const orderedSales: SaleRow[] = saleIds
      .map((id) => salesMap.get(id))
      .filter((s): s is SaleRow => !!s && typeof s.lat === 'number' && typeof s.lng === 'number');

    if (orderedSales.length < MIN_SALES) {
      res.status(400).json({
        error: 'Not enough published sales with location data. Try selecting different sales.',
        code: 'SALES_NOT_FOUND',
      });
      return;
    }

    // Optionally prepend startCoord as a virtual waypoint for distance calc
    const coordSales = startCoord
      ? [{ id: '__start__', title: 'Your Location', address: '', city: '', state: '', lat: startCoord.lat, lng: startCoord.lng }, ...orderedSales]
      : orderedSales;

    // OSRM uses lng,lat (longitude first)
    const coords = coordSales.map((s) => `${s.lng},${s.lat}`).join(';');
    const osrmUrl = `${OSRM_URL}/route/v1/driving/${coords}?overview=false&steps=false`;

    let routeData: { code: string; routes?: { distance: number; duration: number }[] };
    try {
      const osrmRes = await axios.get(osrmUrl, { timeout: 8000 });
      routeData = osrmRes.data;
    } catch {
      res.status(503).json({
        error: 'Route planning is temporarily unavailable. Open in Google Maps to plan manually.',
        code: 'ROUTE_SERVICE_UNAVAILABLE',
        fallbackUrl: buildGoogleMapsUrl(orderedSales),
      });
      return;
    }

    if (routeData.code !== 'Ok' || !routeData.routes?.length) {
      res.status(400).json({
        error: 'Unable to calculate a route. Try fewer sales or sales in the same area.',
        code: 'ROUTE_NOT_FOUND',
        fallbackUrl: buildGoogleMapsUrl(orderedSales),
      });
      return;
    }

    const route = routeData.routes[0];
    const totalDistanceMi = Math.round((route.distance / 1609.34) * 10) / 10;
    const totalDurationMin = Math.round(route.duration / 60);

    const waypoints = orderedSales.map((s, idx) => ({
      saleId: s.id,
      order: idx + 1,
      lat: s.lat,
      lng: s.lng,
      title: s.title,
      address: `${s.address}, ${s.city}, ${s.state}`,
    }));

    res.json({
      waypoints,
      summary: { totalDistanceMi, totalDurationMin },
      googleMapsUrl: buildGoogleMapsUrl(orderedSales),
    });
  } catch (err) {
    console.error('[routeController] planRoute error:', err);
    res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
  }
};
