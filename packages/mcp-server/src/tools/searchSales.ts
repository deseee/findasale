import { MCPToolDefinition } from '../types';

export const searchSalesTool: MCPToolDefinition = {
  name: 'search_sales',
  description:
    'Search for active estate sales, yard sales, auctions, flea markets, and consignment sales by city, location, or date.',
  inputSchema: {
    type: 'object',
    properties: {
      city: {
        type: 'string',
        description: 'City name, e.g. "Grand Rapids"',
      },
      lat: {
        type: 'number',
        description: 'Latitude for radius search',
      },
      lng: {
        type: 'number',
        description: 'Longitude for radius search',
      },
      radiusKm: {
        type: 'number',
        description: 'Search radius in kilometers (default 25)',
      },
      startDate: {
        type: 'string',
        description: 'ISO date for sales starting on or after this date (e.g., "2026-05-10")',
      },
      endDate: {
        type: 'string',
        description: 'ISO date for sales ending on or before this date (e.g., "2026-05-15")',
      },
      saleType: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by sale type: ESTATE, YARD, AUCTION, FLEA_MARKET, CONSIGNMENT',
      },
      status: {
        type: 'string',
        description: 'Filter by status: ACTIVE, UPCOMING, COMPLETED (default: ACTIVE)',
      },
      query: {
        type: 'string',
        description: 'Keyword search in sale name/description',
      },
      limit: {
        type: 'integer',
        description: 'Max results to return (default 20, max 50)',
      },
      sortBy: {
        type: 'string',
        description: 'Sort order: relevance, startDate, distance (default: relevance)',
      },
    },
  },
};
