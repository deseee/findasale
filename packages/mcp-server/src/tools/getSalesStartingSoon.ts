import * as z from 'zod/v4';
import { defineTool, saleTypeEnum, SALE_TYPE_HELP } from './types';
import { handleGetSalesStartingSoon } from '../handlers';

export const getSalesStartingSoonTool = defineTool({
  name: 'get_sales_starting_soon',
  title: 'Get Sales Starting Soon',
  description: 'List public sales starting in the next few days (default 7, max 14). Good for "what sales are this weekend near X" questions.',
  inputSchema: z.object({
    city: z.string().max(80).optional().describe('City name, e.g. "Chicago"'),
    saleType: saleTypeEnum.optional().describe(SALE_TYPE_HELP),
    daysAhead: z.number().int().min(1).max(14).optional().describe('How many days ahead to look (default 7, max 14)'),
  }),
  handler: handleGetSalesStartingSoon,
});
