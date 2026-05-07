import { MCPToolDefinition } from '../types';

export const listSaleTypesTool: MCPToolDefinition = {
  name: 'list_sale_types',
  description: 'Get available sale type definitions (Estate, Yard, Auction, Flea Market, Consignment).',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};
