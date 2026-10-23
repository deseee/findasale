import * as z from 'zod/v4';
import { defineTool } from './types';
import { handleListSaleTypes } from '../handlers';

export const listSaleTypesTool = defineTool({
  name: 'list_sale_types',
  title: 'List Sale Types',
  description: 'List the sale type codes FindA.Sale uses (yard sale, whole-house sale, auction, flea market, shop, dorm move-out) with a short description of each.',
  inputSchema: z.object({}),
  handler: handleListSaleTypes,
});
