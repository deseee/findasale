import { MCPToolDefinition } from '../types';

export const listCategoriesTool: MCPToolDefinition = {
  name: 'list_categories',
  annotations: {
    title: 'List Categories',
    readOnlyHint: true,
    openWorldHint: true,
  },
  description: 'Get eBay product categories for item filtering and search refinement.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};
