import { MCPToolDefinition } from '../types';

export const searchItemsTool: MCPToolDefinition = {
  name: 'search_items',
  annotations: {
    title: 'Search Items',
    readOnlyHint: true,
    openWorldHint: true,
  },
  description: 'Search for items across all active sales by keyword, category, price, or location.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Keyword search: "vintage lamp", "leather sofa", etc.',
      },
      category: {
        type: 'string',
        description: 'eBay category: Furniture, Collectibles, Vintage, Art, Jewelry, etc.',
      },
      city: {
        type: 'string',
        description: 'Restrict to sales in a specific city',
      },
      priceMin: {
        type: 'number',
        description: 'Minimum price (inclusive)',
      },
      priceMax: {
        type: 'number',
        description: 'Maximum price (inclusive)',
      },
      condition: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by condition: New, Like New, Good, Fair',
      },
      limit: {
        type: 'integer',
        description: 'Max results to return (default 20, max 50)',
      },
      sortBy: {
        type: 'string',
        description: 'Sort order: relevance, price_asc, price_desc, newest (default: relevance)',
      },
    },
    required: ['query'],
  },
};
