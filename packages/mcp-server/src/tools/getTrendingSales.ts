import { MCPToolDefinition } from '../types';

export const getTrendingSalesTool: MCPToolDefinition = {
  name: 'get_trending_sales',
  description:
    'Returns currently active sales with the most recent activity — new items added, high shopper interest. Use this when a user asks what sales are popular, hot, or happening now.',
  inputSchema: {
    type: 'object',
    properties: {
      city: {
        type: 'string',
        description: 'Filter by city name, e.g. "Grand Rapids"',
      },
      saleType: {
        type: 'string',
        description:
          'Filter by sale type: ESTATE, YARD, AUCTION, FLEA_MARKET, CONSIGNMENT',
      },
      limit: {
        type: 'integer',
        description: 'Max results to return (default 10, max 25)',
      },
    },
  },
};
