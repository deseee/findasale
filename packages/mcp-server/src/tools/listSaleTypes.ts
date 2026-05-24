import { MCPToolDefinition } from '../types';

export const listSaleTypesTool: MCPToolDefinition = {
  name: 'list_sale_types',
  annotations: {
    title: 'List Sale Types',
    readOnlyHint: true,
    openWorldHint: true,
  },
  description: 'Get available sale type definitions (Estate, Yard, Auction, Flea Market, Consignment).',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};
