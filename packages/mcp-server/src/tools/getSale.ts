import * as z from 'zod/v4';
import { defineTool, idSchema } from './types';
import { handleGetSale } from '../handlers';

export const getSaleTool = defineTool({
  name: 'get_sale',
  title: 'Get Sale Details',
  description:
    'Get one public sale: dates, city, approximate location, description, photos, organizer name and rating, and up to 25 available items. Street addresses are never included; the sale page shows them to signed-in shoppers from the day before the sale.',
  inputSchema: z.object({ saleId: idSchema('sale') }),
  handler: handleGetSale,
});
