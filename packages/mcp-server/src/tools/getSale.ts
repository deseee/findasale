import { MCPToolDefinition } from '../types';

export const getSaleTool: MCPToolDefinition = {
  name: 'get_sale',
  annotations: {
    title: 'Get Sale Details',
    readOnlyHint: true,
    openWorldHint: true,
  },
  description: 'Fetch full details for a specific sale including description, organizer info, and images.',
  inputSchema: {
    type: 'object',
    properties: {
      saleId: {
        type: 'string',
        description: 'The unique ID of the sale, e.g. "sale_12345"',
      },
    },
    required: ['saleId'],
  },
};
