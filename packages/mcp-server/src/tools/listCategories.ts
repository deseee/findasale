import * as z from 'zod/v4';
import { defineTool } from './types';
import { handleListCategories } from '../handlers';

export const listCategoriesTool = defineTool({
  name: 'list_categories',
  title: 'List Categories',
  description: 'List item categories that currently have items for sale, with item counts. Use a name from this list as the category filter in search_items.',
  inputSchema: z.object({}),
  handler: handleListCategories,
});
