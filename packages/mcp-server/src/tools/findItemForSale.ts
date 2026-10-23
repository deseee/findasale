import * as z from 'zod/v4';
import { defineTool } from './types';
import { handleFindItemForSale } from '../handlers';

export const findItemForSaleTool = defineTool({
  name: 'find_item_for_sale',
  title: 'Find Item For Sale',
  description:
    'Find a specific thing someone wants to buy (furniture, a collectible, a tool) across current public sales, optionally in one city and price range. Returns up to 10 matches with links to cite.',
  inputSchema: z.object({
    query: z.string().min(1).max(100).describe('What the shopper is looking for, e.g. "Hummel figurine" or "oak dresser"'),
    city: z.string().max(80).optional().describe('Only items in sales in this city'),
    minPrice: z.number().min(0).optional().describe('Minimum price in US dollars'),
    maxPrice: z.number().min(0).optional().describe('Maximum price in US dollars'),
  }),
  handler: handleFindItemForSale,
});
