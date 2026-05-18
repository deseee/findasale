import { MCPToolDefinition } from '../types';

export const findItemForSaleTool: MCPToolDefinition = {
  name: 'find_item_for_sale',
  description:
    'Search for a specific item across all active sales. Use this when a user asks to find a particular object, furniture piece, collectible, or any item available for purchase at a sale.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'What the user is looking for, e.g. "vintage lamp", "oak dresser", "Hummel figurine"',
      },
      city: {
        type: 'string',
        description: 'Restrict search to items in sales located in this city',
      },
      maxPrice: {
        type: 'number',
        description: 'Maximum price in dollars (inclusive)',
      },
      minPrice: {
        type: 'number',
        description: 'Minimum price in dollars (inclusive)',
      },
    },
    required: ['query'],
  },
};
