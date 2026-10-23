import * as z from 'zod/v4';
import { defineTool } from './types';
import { handleSearchItems } from '../handlers';

export const searchItemsTool = defineTool({
  name: 'search_items',
  title: 'Search Items',
  description:
    'Search items listed for sale across current public FindA.Sale sales by keyword, with optional category, condition, price range and city filters. Returns item title, price, condition, photos and links to the item and its sale.',
  inputSchema: z.object({
    query: z.string().min(1).max(100).describe('Keywords, e.g. "brass lamp" or "oak dresser"'),
    category: z.string().max(100).optional().describe('Category name from list_categories, e.g. "Furniture"'),
    city: z.string().max(80).optional().describe('Only items in sales in this city'),
    priceMin: z.number().min(0).optional().describe('Minimum price in US dollars'),
    priceMax: z.number().min(0).optional().describe('Maximum price in US dollars'),
    condition: z.string().max(40).optional().describe('Condition filter, e.g. "NEW", "LIKE_NEW", "USED"'),
    limit: z.number().int().min(1).max(50).optional().describe('Max results (default 20, max 50)'),
    sortBy: z.enum(['relevance', 'newest', 'price_asc', 'price_desc']).optional().describe('Sort order (default relevance)'),
  }),
  handler: handleSearchItems,
});
