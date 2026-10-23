import * as z from 'zod/v4';

/** One read-only MCP tool: schema, metadata and handler in one place. */
export interface ToolSpec<S extends z.ZodObject = z.ZodObject> {
  name: string;
  title: string;
  description: string;
  inputSchema: S;
  handler: (args: z.infer<S>) => Promise<unknown> | unknown;
}

export function defineTool<S extends z.ZodObject>(spec: ToolSpec<S>): ToolSpec<S> {
  return spec;
}

export const saleTypeEnum = z.enum(['ESTATE', 'YARD', 'AUCTION', 'FLEA_MARKET', 'RETAIL', 'DORM_DASH']);

export const SALE_TYPE_HELP =
  'Sale type code: ESTATE (whole-house sale), YARD (yard or garage sale), AUCTION, FLEA_MARKET, RETAIL (shop or storefront, incl. consignment), DORM_DASH (dorm move-out).';

export const idSchema = (what: string) =>
  z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, `${what} id`).describe(`The FindA.Sale ${what} id, as returned by a search tool`);
