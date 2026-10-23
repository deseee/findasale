# FindA.Sale MCP Server

Public, read-only Model Context Protocol server for finding sales and items on FindA.Sale.
Built on the official TypeScript MCP SDK v2 (`@modelcontextprotocol/server` 2.3.x, MCP spec 2026-07-28).

Production: `https://mcp.finda.sale` (Railway service `findasale`, project keen-wisdom, root directory `packages/mcp-server`, `Dockerfile.production`, auto-deploys on pushes to `main` that touch `packages/mcp-server/**`).

## Endpoints

| Path | Purpose |
|------|---------|
| `POST /mcp` | Streamable HTTP transport, stateless. Serves 2026-07-28 clients and 2025-era clients (stateless fallback). `GET`/`DELETE` answer 405. |
| `GET /sse` + `POST /messages?sessionId=…` | Legacy HTTP+SSE transport (deprecated in the spec, kept for existing clients) via `@modelcontextprotocol/server-legacy/sse`. |
| `POST /messages` (no `sessionId`) | Sessionless JSON-RPC shim kept from v1: `initialize`, `ping`, `tools/list`, `tools/call`. |
| `GET /mcp/server-card` | MCP Server Card (`application/mcp-server-card+json`). Alias: `/.well-known/mcp/server-card.json`. |
| `GET /.well-known/ai-catalog.json` | AI Catalog linking the Server Card. |
| `GET /.well-known/mcp.json` | Informal manifest (also mirrored at `finda.sale/.well-known/mcp.json`). |
| `GET /health` | Railway health check. |

## Tools

All ten tools are read-only (`readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`).
Schemas live next to each tool in `src/tools/*.ts` (zod v4); handlers in `src/handlers.ts`.

`search_sales`, `get_sale`, `search_items`, `get_item`, `list_cities`, `list_sale_types`,
`list_categories`, `get_trending_sales`, `get_sales_starting_soon`, `find_item_for_sale`.

## Privacy and safety rules

- The backend is always called anonymously (no auth header is ever sent or forwarded), so its
  public-viewer rules apply: DRAFT/CANCELLED/deleted sales 404, early-access and Legendary items
  stay embargoed, street addresses are withheld.
- Every response is rebuilt from an allow-list in `src/lib/publicShape.ts`. Street address,
  entrance pin, approach notes, organizer phone/address/user id, payment processor ids and scrape
  metadata are never returned. Coordinates are rounded to 2 decimals (about 1 km).
- Backend errors are mapped to short generic messages.

## Rate limits and caching

- Per IP: 120 MCP HTTP requests per minute (`RATE_LIMIT_MAX_REQUESTS`), plus per-tool limits
  (10 to 40 per minute) in `src/lib/rateLimiter.ts`.
- Legacy SSE: at most 10 open sessions per IP and 300 total; sessions close after 1 hour.
- Backend GET responses are cached in memory (60 s for searches, 10 min for cities/categories,
  30 min for sale summaries used by city-filtered item search).

## Configuration

See `.env.example`: `BACKEND_URL`, `PORT` (3003), `MCP_PUBLIC_ORIGIN`, `RATE_LIMIT_MAX_REQUESTS`, `NODE_ENV`.

## Local run

```bash
npm install
npm run build
BACKEND_URL=https://api.finda.sale PORT=3003 npm start
```

Try it with the MCP Inspector (`npx @modelcontextprotocol/inspector`) against `http://localhost:3003/mcp`.

## Registry

Official MCP Registry name: `sale.finda/findasale` (DNS-authenticated namespace for finda.sale).
Submission steps: `claude_docs/operations/mcp-registry-submission-2026-10-23.md`.
