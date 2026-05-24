import { MCPToolDefinition } from '../types';

export const getSalesStartingSoonTool: MCPToolDefinition = {
  name: 'get_sales_starting_soon',
  annotations: {
    title: 'Get Sales Starting Soon',
    readOnlyHint: true,
    openWorldHint: true,
  },
  description:
    'Returns upcoming sales starting within the next 7 days (or a custom number of days). Use this when a user wants to plan ahead, find weekend sales, or ask what sales are coming up.',
  inputSchema: {
    type: 'object',
    properties: {
      city: {
        type: 'string',
        description: 'Filter by city name, e.g. "Chicago"',
      },
      saleType: {
        type: 'string',
        description:
          'Filter by sale type: ESTATE, YARD, AUCTION, FLEA_MARKET, CONSIGNMENT',
      },
      daysAhead: {
        type: 'integer',
        description: 'How many days ahead to look (default 7, max 14)',
      },
    },
  },
};
