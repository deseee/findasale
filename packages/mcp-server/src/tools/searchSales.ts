import * as z from 'zod/v4';
import { defineTool, saleTypeEnum, SALE_TYPE_HELP } from './types';
import { handleSearchSales } from '../handlers';

export const searchSalesTool = defineTool({
  name: 'search_sales',
  title: 'Search Sales',
  description:
    'Find current public sales (yard and garage sales, whole-house sales, auctions, flea markets, shops) by keyword, city, ZIP, map point, date range or sale type. Returns sale summaries with approximate location and a link to each sale page. Street addresses are never included.',
  inputSchema: z.object({
    query: z.string().max(100).optional().describe('Keywords to match in the sale title or description, e.g. "mid-century" or "tools"'),
    city: z.string().max(80).optional().describe('City name, e.g. "Grand Rapids"'),
    zip: z.string().regex(/^\d{5}$/).optional().describe('5-digit US ZIP code'),
    lat: z.number().min(-90).max(90).optional().describe('Latitude for a radius search (use with lng)'),
    lng: z.number().min(-180).max(180).optional().describe('Longitude for a radius search (use with lat)'),
    radiusKm: z.number().min(1).max(200).optional().describe('Radius in kilometers for lat/lng search (default 25)'),
    startDate: z.string().max(30).optional().describe('Only sales starting on or after this date (YYYY-MM-DD)'),
    endDate: z.string().max(30).optional().describe('Only sales starting on or before this date (YYYY-MM-DD)'),
    saleType: z.array(saleTypeEnum).max(6).optional().describe(SALE_TYPE_HELP),
    limit: z.number().int().min(1).max(50).optional().describe('Max results (default 20, max 50)'),
    minConfidence: z.number().min(0).max(1).optional().describe('Minimum listing confidence 0 to 1. 0.7 = organizer-verified, 0.4 = corroborated by a third party.'),
  }),
  handler: handleSearchSales,
});
