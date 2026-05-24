import { MCPToolDefinition } from '../types';

export const listCitiesTool: MCPToolDefinition = {
  name: 'list_cities',
  annotations: {
    title: 'List Cities',
    readOnlyHint: true,
    openWorldHint: true,
  },
  description: 'Get all active cities with sale counts and links to browse sales by location.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};
