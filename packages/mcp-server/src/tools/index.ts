import { ToolSpec } from './types';
import { searchSalesTool } from './searchSales';
import { getSaleTool } from './getSale';
import { searchItemsTool } from './searchItems';
import { getItemTool } from './getItem';
import { listCitiesTool } from './listCities';
import { listSaleTypesTool } from './listSaleTypes';
import { listCategoriesTool } from './listCategories';
import { getTrendingSalesTool } from './getTrendingSales';
import { getSalesStartingSoonTool } from './getSalesStartingSoon';
import { findItemForSaleTool } from './findItemForSale';

/** All tools exposed by the server. Every tool is read-only public discovery. */
export const TOOLS: ToolSpec<any>[] = [
  searchSalesTool,
  getSaleTool,
  searchItemsTool,
  getItemTool,
  listCitiesTool,
  listSaleTypesTool,
  listCategoriesTool,
  getTrendingSalesTool,
  getSalesStartingSoonTool,
  findItemForSaleTool,
];
