import * as z from 'zod/v4';
import { defineTool, saleTypeEnum, SALE_TYPE_HELP } from './types';
import { handleGetTrendingSales } from '../handlers';

export const getTrendingSalesTool = defineTool({
  name: 'get_trending_sales',
  title: 'Get Trending Sales',
  description: 'List current public sales with the most shopper interest and recent activity, optionally in one city or of one sale type.',
  inputSchema: z.object({
    city: z.string().max(80).optional().describe('City name, e.g. "Grand Rapids"'),
    saleType: saleTypeEnum.optional().describe(SALE_TYPE_HELP),
    limit: z.number().int().min(1).max(25).optional().describe('Max results (default 10, max 25)'),
  }),
  handler: handleGetTrendingSales,
});
