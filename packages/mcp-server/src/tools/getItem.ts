import * as z from 'zod/v4';
import { defineTool, idSchema } from './types';
import { handleGetItem } from '../handlers';

export const getItemTool = defineTool({
  name: 'get_item',
  title: 'Get Item Details',
  description: 'Get one publicly listed item: title, description, price, condition, photos, and the sale it belongs to (title, city, dates, link).',
  inputSchema: z.object({ itemId: idSchema('item') }),
  handler: handleGetItem,
});
