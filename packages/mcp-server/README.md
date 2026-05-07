# FindA.Sale MCP Server

An Express-based Model Context Protocol (MCP) server that exposes FindA.Sale marketplace data to AI agents and LLMs.

## Overview

The MCP server provides a structured, read-only interface to FindA.Sale data, enabling AI agents to:
- Discover sales by location, date, type, and keywords
- Search for items across active sales
- Retrieve detailed information about specific sales and items
- Browse available cities and sale types
- Filter items by category, price, and condition

## Quick Start

### Development

```bash
# Install dependencies
npm install

# Start dev server (with auto-reload)
npm run dev

# Open http://localhost:3003/health to verify
```

### Production

```bash
# Build TypeScript
npm run build

# Start server
npm start

# Or use Docker
docker build -f Dockerfile.production -t findasale-mcp .
docker run -e BACKEND_URL=https://api.finda.sale -p 3003:3003 findasale-mcp
```

## Configuration

Create a `.env` file (copy from `.env.example`):

```env
BACKEND_URL=https://api.finda.sale
PORT=3003
NODE_ENV=production
```

| Variable | Default | Description |
|----------|---------|-------------|
| `BACKEND_URL` | `http://localhost:3001` | FindA.Sale backend API URL |
| `PORT` | `3003` | Server port |
| `NODE_ENV` | `development` | Environment (development, production) |

## API Endpoints

### Health Check
```
GET /health
```

Returns server status and metrics.

### MCP SSE Connection
```
GET /sse
```

Opens a persistent Server-Sent Events (SSE) connection for receiving MCP messages.

### Tool Invocation
```
POST /messages
```

Invoke MCP tools. Request body is a JSON-RPC 2.0 message:

```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "method": "tools/call",
  "params": {
    "name": "search_sales",
    "arguments": {
      "city": "Grand Rapids",
      "limit": 10
    }
  }
}
```

## Tools (Phase 1 MVP)

### `search_sales`
Search for sales by city, location, date range, type, or keywords.

**Input:**
```typescript
{
  city?: string           // "Grand Rapids"
  lat?: number            // Latitude for radius search
  lng?: number            // Longitude for radius search
  radiusKm?: number       // Radius in km (default 25)
  startDate?: string      // ISO date "2026-05-10"
  endDate?: string        // ISO date "2026-05-15"
  saleType?: string[]     // ["ESTATE", "YARD", "AUCTION", "FLEA_MARKET", "CONSIGNMENT"]
  status?: string         // "ACTIVE", "UPCOMING", "COMPLETED"
  query?: string          // Keyword search
  limit?: number          // Max 50 (default 20)
  sortBy?: string         // "relevance", "startDate", "distance"
}
```

**Rate Limit:** 10 req/min

---

### `get_sale`
Get full details for a specific sale.

**Input:**
```typescript
{
  saleId: string  // Required
}
```

**Rate Limit:** 30 req/min

---

### `search_items`
Search for items across all active sales.

**Input:**
```typescript
{
  query: string                // Required: "vintage lamp"
  category?: string            // "Furniture", "Collectibles", etc.
  city?: string                // Filter by city
  priceMin?: number            // Min price
  priceMax?: number            // Max price
  condition?: string[]         // ["New", "Like New", "Good", "Fair"]
  limit?: number               // Max 50 (default 20)
  sortBy?: string              // "relevance", "price_asc", "price_desc", "newest"
}
```

**Rate Limit:** 15 req/min

---

### `get_item`
Get full details for a specific item.

**Input:**
```typescript
{
  itemId: string  // Required
}
```

**Rate Limit:** 30 req/min

---

### `list_cities`
Get all active cities with sale counts.

**Input:** (none)

**Rate Limit:** 5 req/min

---

### `list_sale_types`
Get available sale type definitions.

**Input:** (none)

**Rate Limit:** Unlimited

---

### `list_categories`
Get eBay product categories for filtering.

**Input:** (none)

**Rate Limit:** Unlimited

## Rate Limiting

Rate limits are enforced per IP per tool, using a rolling 1-minute window:

| Tool | Limit |
|------|-------|
| `search_sales` | 10 req/min |
| `search_items` | 15 req/min |
| `get_sale` | 30 req/min |
| `get_item` | 30 req/min |
| `list_cities` | 5 req/min |
| `list_sale_types` | Unlimited |
| `list_categories` | Unlimited |

When limit is exceeded, the server returns HTTP 429 with `Retry-After` header.

## Response Format

All MCP responses follow JSON-RPC 2.0 format:

**Success:**
```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"sales\": [...], \"total\": 42, \"page\": 1}"
      }
    ]
  }
}
```

**Error:**
```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "error": {
    "code": -32001,
    "message": "Rate limit exceeded for search_sales. Reset in 45s"
  }
}
```

## Backend Dependencies

The MCP server wraps these public FindA.Sale backend routes:

- `GET /api/sales/search` — search_sales
- `GET /api/sales/{id}` — get_sale
- `GET /api/items/search` — search_items
- `GET /api/items/{id}` — get_item
- `GET /api/sales/cities` — list_cities
- `GET /api/items/categories` — list_categories (optional, falls back to hardcoded)

All routes are public (no auth required).

## Deployment

### Railway

```yaml
# railway.toml
[build]
builder = "dockerfile"
dockerfile = "Dockerfile.production"

[deploy]
startCommand = "node dist/index.js"
port = 3003

[env]
BACKEND_URL = "https://api.finda.sale"
NODE_ENV = "production"
```

### Vercel (as serverless function)

Not recommended. MCP servers are best deployed as persistent services.

## Monitoring

### Health Check
```bash
curl http://localhost:3003/health
```

### Request Logging
All requests are logged to stdout in development mode.

### Error Tracking
Integrate with Sentry (future phase):
```bash
export SENTRY_DSN=https://...
```

## Development

### TypeScript

Strict mode enabled. Check for errors:
```bash
npm run type-check
```

### Adding New Tools

1. Create tool definition in `src/tools/[toolName].ts`
2. Create handler in `src/handlers.ts`
3. Add to `TOOLS` registry in `src/index.ts`
4. Export and register

### Testing Tools

```bash
# Interactive testing
curl -X POST http://localhost:3003/messages \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "1",
    "method": "tools/call",
    "params": {
      "name": "search_sales",
      "arguments": {"city": "Grand Rapids", "limit": 5}
    }
  }'
```

## License

MIT

## Author

FindA.Sale Team
