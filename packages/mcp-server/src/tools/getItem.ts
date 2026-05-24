import { MCPToolDefinition } from '../types';

export const getItemTool: MCPToolDefinition = {
  name: 'get_item',
  annotations: {
    title: 'Get Item Details',
    readOnlyHint: true,
    openWorldHint: true,
  },
  description: 'Fetch full details for a specific item including description, images, sale info, and organizer details.',
  inputSchema: {
    type: 'object',
    properties: {
      itemId: {
        type: 'string',
        description: 'The unique ID of the item',
      },
    },
    required: ['itemId'],
  },
};
