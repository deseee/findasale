import * as z from 'zod/v4';
import { defineTool } from './types';
import { handleListCities } from '../handlers';

export const listCitiesTool = defineTool({
  name: 'list_cities',
  title: 'List Cities',
  description: 'List cities with current public sales on FindA.Sale, busiest first, with active sale counts and a browse link for each city. Filter by state to narrow the list.',
  inputSchema: z.object({
    state: z.string().min(2).max(3).optional().describe('State or province code, e.g. "MI" or "ON"'),
    limit: z.number().int().min(1).max(500).optional().describe('Max cities to return (default 100, max 500)'),
  }),
  handler: handleListCities,
});
