/**
 * Discovery documents served by the MCP server (and mirrored as static files on
 * finda.sale under packages/frontend/public/.well-known/).
 *
 * - Server Card (MCP extension SEP-2127): GET /mcp/server-card,
 *   media type application/mcp-server-card+json.
 * - AI Catalog: GET /.well-known/ai-catalog.json, links the Server Card.
 * - /.well-known/mcp.json: informal manifest kept for crawlers that already read it.
 */

import { SERVER_DESCRIPTION, SERVER_NAME, SERVER_TITLE, SERVER_VERSION, toolListForShim } from '../server';

export const PUBLIC_ORIGIN = (process.env.MCP_PUBLIC_ORIGIN || 'https://mcp.finda.sale').replace(/\/+$/, '');

/** Protocol revisions this server answers (2026-07-28 natively; 2025 revisions via the SDK's stateless fallback and the SSE transport). */
export const SUPPORTED_PROTOCOL_VERSIONS = ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

export function serverCard(): Record<string, unknown> {
  return {
    $schema: 'https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json',
    name: SERVER_NAME,
    title: SERVER_TITLE,
    version: SERVER_VERSION,
    description: SERVER_DESCRIPTION,
    websiteUrl: 'https://finda.sale',
    icons: [{ src: 'https://finda.sale/icons/icon-192x192.png', mimeType: 'image/png', sizes: ['192x192'] }],
    remotes: [
      { type: 'streamable-http', url: `${PUBLIC_ORIGIN}/mcp`, supportedProtocolVersions: SUPPORTED_PROTOCOL_VERSIONS },
      { type: 'sse', url: `${PUBLIC_ORIGIN}/sse`, supportedProtocolVersions: ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'] },
    ],
  };
}

export function aiCatalog(): Record<string, unknown> {
  return {
    specVersion: '1.0',
    entries: [
      {
        identifier: 'urn:air:finda.sale:mcp:findasale',
        type: 'application/mcp-server-card+json',
        url: `${PUBLIC_ORIGIN}/mcp/server-card`,
      },
    ],
  };
}

export function mcpManifest(): Record<string, unknown> {
  return {
    name: SERVER_TITLE,
    registryName: SERVER_NAME,
    version: SERVER_VERSION,
    description: SERVER_DESCRIPTION,
    // Same key the v1 manifest used, now pointing at the current transport.
    server: { url: `${PUBLIC_ORIGIN}/mcp`, transport: 'streamable-http', status: 'active' },
    endpoints: [
      { transport: 'streamable-http', url: `${PUBLIC_ORIGIN}/mcp`, recommended: true },
      { transport: 'sse', url: `${PUBLIC_ORIGIN}/sse`, messages: `${PUBLIC_ORIGIN}/messages`, deprecated: true },
    ],
    serverCard: `${PUBLIC_ORIGIN}/mcp/server-card`,
    authentication: 'none',
    readOnly: true,
    tools: toolListForShim().map((t) => ({ name: t.name, title: t.title, description: t.description })),
    privacy: 'Read-only public listings. Street addresses, organizer contact details and unpublished or early-access items are never returned.',
    rateLimits: 'Per IP: 120 requests per minute overall, 10 to 40 calls per minute per tool.',
    contact: 'support@finda.sale',
    docs: 'https://finda.sale/llms.txt',
  };
}
