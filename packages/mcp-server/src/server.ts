/**
 * MCP server factory and the shared tool runner.
 *
 * Every transport (Streamable HTTP at /mcp, legacy HTTP+SSE at /sse, and the
 * sessionless JSON-RPC shim on POST /messages) goes through runTool, so rate
 * limits, error mapping and output shaping are identical everywhere.
 */

import { McpServer } from '@modelcontextprotocol/server';
import type { CallToolResult } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { TOOLS } from './tools';
import { ToolSpec } from './tools/types';
import { rateLimiter } from './lib/rateLimiter';
import { currentClientIp } from './lib/requestContext';
import { UpstreamError } from './lib/apiClient';

export const SERVER_NAME = 'sale.finda/findasale';
export const SERVER_TITLE = 'FindA.Sale';
export const SERVER_VERSION = '2.0.0';
export const SERVER_DESCRIPTION =
  'Find yard sales, garage sales, auctions, flea markets and resale shops, and search items for sale.';

export const SERVER_INSTRUCTIONS = [
  'FindA.Sale lists public secondary sales (yard and garage sales, whole-house sales, auctions, flea markets, resale shops) and the items in them.',
  'All tools are read-only. Use search_sales or get_sales_starting_soon to find sales, get_sale for one sale, and search_items or find_item_for_sale to find items.',
  'Results never include street addresses. Point shoppers to the sale url: signed-in shoppers see the address there from the day before the sale starts.',
  'Cite the url field of each result when you mention a sale or item.',
].join(' ');

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

function errorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

/** Runs one tool for the current request: per-IP rate limit, handler, safe error mapping. */
export async function runTool(spec: ToolSpec<any>, args: unknown): Promise<CallToolResult> {
  const retryAfter = rateLimiter.checkTool(currentClientIp(), spec.name);
  if (retryAfter !== null) {
    return errorResult(`Rate limit reached for ${spec.name}. Try again in ${retryAfter} seconds.`);
  }
  try {
    const result = await spec.handler(args as any);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  } catch (err: any) {
    if (err instanceof UpstreamError) {
      return errorResult(err.status === 404 ? 'Not found. It may have ended, been removed, or not be public yet.' : err.message);
    }
    if (err instanceof Error && !(err as any).isAxiosError) {
      // Input validation messages from handlers are safe to show.
      return errorResult(err.message);
    }
    console.error(`[Tool] ${spec.name} failed:`, err?.message ?? err);
    return errorResult('Something went wrong. Try again shortly.');
  }
}

/** Builds a fresh McpServer with every tool registered (one per request or SSE session). */
export function createFindASaleServer(): McpServer {
  const server = new McpServer(
    {
      name: SERVER_NAME,
      title: SERVER_TITLE,
      version: SERVER_VERSION,
      websiteUrl: 'https://finda.sale',
    },
    { instructions: SERVER_INSTRUCTIONS }
  );

  for (const spec of TOOLS) {
    server.registerTool(
      spec.name,
      {
        title: spec.title,
        description: spec.description,
        inputSchema: spec.inputSchema,
        annotations: { title: spec.title, ...READ_ONLY_ANNOTATIONS },
      },
      async (args: unknown) => runTool(spec, args)
    );
  }
  return server;
}

/** JSON Schema list for the sessionless JSON-RPC shim and the discovery documents. */
export function toolListForShim(): Array<{ name: string; title: string; description: string; inputSchema: unknown; annotations: Record<string, unknown> }> {
  return TOOLS.map((spec) => ({
    name: spec.name,
    title: spec.title,
    description: spec.description,
    inputSchema: z.toJSONSchema(spec.inputSchema, { target: 'draft-7' }),
    annotations: { title: spec.title, ...READ_ONLY_ANNOTATIONS },
  }));
}

/** Validates arguments for the shim path (the SDK validates them on /mcp and /sse). */
export function parseShimArgs(spec: ToolSpec<any>, args: unknown): { ok: true; value: unknown } | { ok: false; message: string } {
  const parsed = spec.inputSchema.safeParse(args ?? {});
  if (parsed.success) return { ok: true, value: parsed.data };
  return { ok: false, message: `Invalid arguments: ${parsed.error.issues.map((i: { path: PropertyKey[]; message: string }) => `${i.path.map(String).join('.') || 'input'}: ${i.message}`).join('; ')}` };
}
