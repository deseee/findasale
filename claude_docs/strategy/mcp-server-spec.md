# FindA.Sale MCP (Model Context Protocol) Server Specification

**Version:** 1.0  
**Status:** ARCHITECTURE APPROVED  
**Date:** 2026-05-07  
**Architect:** Systems Team

---

## Executive Summary

This spec defines a public Model Context Protocol (MCP) server that exposes FindA.Sale marketplace data to AI agents. The server enables Claude, ChatGPT, Perplexus, and other LLM-powered assistants to discover sales, search items, and look up organizer profiles without visiting the web UI.

**Strategic value:** By being the first secondary sale marketplace with an AI-native data interface, FindA.Sale becomes the default discovery tool for agent-powered queries like "Find estate sales near me this weekend" or "What items are selling for $10–50 in my area?" This is a competitive moat that compounds over time as more AI platforms adopt MCP.

**Effort:** Phase 1 (MVP) requires ~4–5 dev days. Phase 2–3 are future phases.

---

## 1. Architecture & Technology Stack

### 1.1 Monorepo Placement (DECISION)

**Recommendation:** New package `packages/mcp-server` (standalone Node.js/Express module)

**Rationale:**
- Isolates MCP dependencies (MCP SDK, stdio transport handler) from the main backend
- Allows independent deployment and versioning
- Makes the MCP server a thin wrapper around existing backend API routes (not duplication)
- Easier to scale independently if AI agent traffic becomes significant

**Structure:**
```
packages/mcp-server/
  src/
    index.ts                 # MCP server entry point
    tools/
      searchSales.ts         # Tool: search_sales
      getSale.ts             # Tool: get_sale
      searchItems.ts         # Tool: search_items
      getItem.ts             # Tool: get_item
      listCities.ts          # Tool: list_cities
      ...
    transport/
      stdio.ts               # Stdio transport handler
    lib/
      api.ts                 # HTTP client to backend (`packages/backend`)
  package.json
  Dockerfile.production      # Standard production Docker for Railway
  README.md
```

### 1.2 Technology Stack

| Component | Choice | Why |
|-----------|--------|-----|
| **MCP SDK** | `@modelcontextprotocol/sdk` v1.0+ | Official SDK; well-documented; active maintenance |
| **Transport** | Stdio | Simplest; no network exposure; works with all AI platforms; suitable for MCP registry discovery |
| **HTTP Client** | axios | Already in use in backend; minimal extra dependencies |
| **Deployment** | Railway (same as backend) | Single vendor; simplified secret management; zero network latency to backend |
| **Language** | TypeScript | Matches backend tech stack; type safety for tool contracts |

### 1.3 How It Works

```
AI Agent (e.g., Claude via Cowork MCP)
  ↓ (stdio connection)
MCP Server (packages/mcp-server)
  ↓ (HTTP)
FindA.Sale Backend (packages/backend, Railway)
  ↓ (Prisma queries)
PostgreSQL (Railway)
```

The MCP server is a stateless wrapper: it receives tool calls from the AI agent, translates them to HTTP calls against the backend's existing public routes, and returns JSON results to the agent.

---

## 2. Tool Definitions (Phase 1 MVP)

All tools are **read-only and unauthenticated** (no API key required). All endpoint prices and availability are public-facing data.

### 2.1 search_sales

**Purpose:** Discover sales by location, date, type, or keywords

**Input:**
```typescript
{
  city?: string                    // "Grand Rapids", "Ann Arbor", etc.
  lat?: number                     // Latitude (for radius search)
  lng?: number                     // Longitude (for radius search)
  radiusKm?: number                // Search radius in km (default 25)
  startDate?: string               // ISO date "2026-05-10" — sales starting on or after
  endDate?: string                 // ISO date "2026-05-15" — sales ending on or before
  saleType?: string[]              // ["ESTATE", "YARD", "AUCTION", "FLEA_MARKET", "CONSIGNMENT"]
  status?: string                  // "ACTIVE", "UPCOMING", "COMPLETED" (default: "ACTIVE")
  query?: string                   // Keyword search in sale name/description
  limit?: number                   // Max 50 results (default 20)
  sortBy?: string                  // "relevance" | "startDate" | "distance" (default: relevance)
}
```

**Output:**
```typescript
{
  sales: Array<{
    id: string                     // e.g., "sale_12345"
    title: string                  // e.g., "Estate Sale – Downtown Heritage Home"
    saleType: string               // ESTATE, YARD, AUCTION, FLEA_MARKET, CONSIGNMENT
    status: string                 // ACTIVE, UPCOMING, COMPLETED
    startDate: string              // ISO datetime
    endDate: string                // ISO datetime
    address: string                // Street address
    city: string
    state: string
    lat: number
    lng: number
    description?: string           // First 200 chars
    itemCount: number              // Total items for sale
    organizerName: string
    organizerId: string
    images: Array<{
      url: string                  // CDN image URL
      alt: string
    }>
  }>,
  total: number                    // Total matching sales (for pagination)
  page: number
}
```

**Backend Route:** `GET /api/sales/search?city=&saleType=&startDate=&endDate=&query=&limit=20`

**Rate Limit:** 10 calls/minute per AI session (per IP in production)

---

### 2.2 get_sale

**Purpose:** Fetch full details for a specific sale

**Input:**
```typescript
{
  saleId: string                   // Required; e.g., "sale_12345"
}
```

**Output:**
```typescript
{
  id: string
  title: string
  saleType: string
  status: string
  startDate: string
  endDate: string
  address: string
  city: string
  state: string
  lat: number
  lng: number
  description: string              // Full description
  itemCount: number
  organizerName: string
  organizerId: string
  organizerPhone?: string          // May be public or redacted
  organizerEmail?: string          // May be public or redacted
  images: Array<{
    url: string
    alt: string
  }>
  highlights?: Array<string>       // e.g., ["Free delivery", "Accepts Venmo"]
  visitUrl: string                 // Link to sale page on finda.sale
  iCalUrl: string                  // .ics download link for calendar
  averageRating?: number           // Organizer rating (1–5)
  reviews?: number                 // Count of reviews
}
```

**Backend Route:** `GET /api/sales/{id}`

**Rate Limit:** 30 calls/minute per AI session

---

### 2.3 search_items

**Purpose:** Search for items across all active sales

**Input:**
```typescript
{
  query: string                    // Keywords: "vintage lamp", "leather sofa", etc.
  category?: string                // eBay category: "Furniture", "Collectibles", "Vintage"
  city?: string                    // Restrict to sales in a specific city
  priceMin?: number                // Filter: price >= this
  priceMax?: number                // Filter: price <= this
  condition?: string[]             // ["New", "Like New", "Good", "Fair"]
  limit?: number                   // Max 50 (default 20)
  sortBy?: string                  // "relevance" | "price_asc" | "price_desc" | "newest"
}
```

**Output:**
```typescript
{
  items: Array<{
    id: string                     // Item ID
    title: string
    description?: string           // 100 chars
    category: string
    condition: string
    price: number
    images: Array<{
      url: string
      alt: string
    }>
    saleId: string                 // Which sale this item belongs to
    saleName: string               // Sale title
    saleCity: string
    organizerName: string
    isActive: boolean              // Item still available?
    createdAt: string              // ISO datetime
  }>,
  total: number
  page: number
}
```

**Backend Route:** `GET /api/items/search?query=&category=&city=&priceMin=&priceMax=&condition=&limit=20`

**Rate Limit:** 15 calls/minute per AI session

---

### 2.4 get_item

**Purpose:** Fetch full details for a specific item

**Input:**
```typescript
{
  itemId: string                   // Required
}
```

**Output:**
```typescript
{
  id: string
  title: string
  description: string              // Full description
  category: string
  condition: string
  price: number
  priceBeforeDiscount?: number     // If on sale/markdown
  quantity: number                 // How many available
  images: Array<{
    url: string
    alt: string
  }>
  saleId: string
  saleName: string
  saleAddress: string
  saleCity: string
  saleDates: {
    startDate: string
    endDate: string
  }
  organizerId: string
  organizerName: string
  isActive: boolean
  visitUrl: string                 // Link to item detail page
  createdAt: string
}
```

**Backend Route:** `GET /api/items/{id}`

**Rate Limit:** 30 calls/minute per AI session

---

### 2.5 list_cities

**Purpose:** Get all active cities with sale counts and links to browse

**Input:** (none)

**Output:**
```typescript
{
  cities: Array<{
    name: string                   // "Grand Rapids", "Detroit", etc.
    state: string                  // "MI", "IN", etc.
    activeSaleCount: number        // How many sales active now
    upcomingSaleCount: number      // Upcoming (< 7 days away)
    browseUrl: string              // Link to /sales?city=Grand%20Rapids
  }>,
  total: number
}
```

**Backend Route:** `GET /api/sales/cities`

**Rate Limit:** 5 calls/minute per AI session (this is static-ish data)

---

### 2.6 list_sale_types

**Purpose:** Get available sale type definitions

**Input:** (none)

**Output:**
```typescript
{
  types: Array<{
    id: string                     // "ESTATE", "YARD", "AUCTION", "FLEA_MARKET", "CONSIGNMENT"
    displayName: string
    description: string            // Short definition
    icon?: string                  // Optional emoji or icon
  }>
}
```

**Backend Route:** Hardcoded in MCP server (no backend call needed)

**Rate Limit:** Unlimited (static)

---

### 2.7 list_categories

**Purpose:** Get eBay product categories for item filtering

**Input:** (none)

**Output:**
```typescript
{
  categories: Array<{
    id: string                     // eBay category ID
    name: string                   // "Furniture", "Jewelry", etc.
    itemCount: number              // Active items in this category
  }>,
  total: number
}
```

**Backend Route:** `GET /api/ebay/categories` or hardcoded lookup

**Rate Limit:** Unlimited (static)

---

### 2.8 get_organizer (Future Phase 2)

**Purpose:** Fetch organizer profile and sale history

**Input:**
```typescript
{
  organizerId: string
}
```

**Output:**
```typescript
{
  id: string
  name: string
  description?: string
  profileImageUrl?: string
  city: string
  activeSalesCount: number
  totalItemsForSale: number
  averageRating: number
  reviewCount: number
  tier: string                     // SIMPLE, PRO, TEAMS, ENTERPRISE
  websiteUrl?: string
  socialLinks?: {
    facebook?: string
    instagram?: string
  }
  recentSales: Array<{             // Last 5 sales
    id: string
    title: string
    dates: { start: string; end: string }
    itemCount: number
  }>
}
```

**Backend Route:** `GET /api/organizers/{id}`

**Rate Limit:** 20 calls/minute per AI session

---

## 3. Authentication & Rate Limiting

### 3.1 Public/No Auth Required

All Phase 1 tools require zero authentication. Data exposed is already public on finda.sale.

**Why:** Reduces friction for AI platforms. Discovery tools benefit from being as open as possible. Rate limiting (not auth) prevents abuse.

### 3.2 Rate Limiting

Implemented at MCP server level using `express-rate-limit` middleware. Tracks by IP (for server-side agents) or session ID (for Cowork-integrated agents).

**Default limits:**
- `search_sales`: 10 req/min
- `search_items`: 15 req/min
- `get_sale`: 30 req/min
- `get_item`: 30 req/min
- `list_cities`: 5 req/min
- Static tools: unlimited

**Burst handling:** 429 response with `Retry-After: 60` header.

### 3.3 Future: Authenticated Tools (Phase 2)

Organizer-specific tools (get my sales, update availability, etc.) will use optional API key authentication in Phase 2. Not in MVP.

---

## 4. Discovery & Registration

### 4.1 MCP Registry Entry

The MCP server will be registered in the official [MCP Registry](https://registry.mcp.ai/) under:
- **Name:** FindA.Sale Marketplace
- **Description:** Discover estate sales, yard sales, auctions, flea markets, and consignment shops near you. Search items across active sales.
- **URL:** `https://mcp.finda.sale/` (or `https://api.finda.sale/mcp`)
- **Stdio support:** Yes

### 4.2 Root Discovery File

A `/.well-known/mcp.json` file at the public root of `mcp.finda.sale` (or within the backend) advertises the MCP server:

**Location:** `https://finda.sale/.well-known/mcp.json`

**Content:**
```json
{
  "server": {
    "name": "FindA.Sale Marketplace",
    "description": "Discover estate sales, yard sales, auctions, flea markets, and consignment shops near you",
    "version": "1.0.0",
    "protocol": "stdio",
    "transport": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/mcp-server/index.js"]
    },
    "tools": [
      {
        "name": "search_sales",
        "description": "Search for sales by location, date, type, or keywords"
      },
      {
        "name": "get_sale",
        "description": "Fetch full details for a specific sale"
      },
      {
        "name": "search_items",
        "description": "Search for items across all active sales"
      },
      {
        "name": "get_item",
        "description": "Fetch full details for a specific item"
      },
      {
        "name": "list_cities",
        "description": "Get all active cities with sale counts"
      },
      {
        "name": "list_sale_types",
        "description": "Get available sale type definitions"
      },
      {
        "name": "list_categories",
        "description": "Get eBay product categories"
      }
    ],
    "supportedCapabilities": [
      "resources",
      "tools"
    ],
    "requestTimeout": 30000
  }
}
```

### 4.3 llms.txt Integration

Update `public/llms.txt` (or create it if missing) with explicit reference to MCP server:

```
# FindA.Sale — Marketplace for Secondary Sales

## MCP Server
To interact with FindA.Sale data programmatically, use our MCP (Model Context Protocol) server.

MCP Server Endpoint: https://finda.sale/.well-known/mcp.json
Registry: https://registry.mcp.ai/findasale-marketplace

Available tools:
- search_sales: Find sales by location, date, type, keywords
- get_sale: Fetch full sale details
- search_items: Search items across sales
- get_item: Fetch item details
- list_cities: Browse all active cities
- list_sale_types: Learn about sale types
- list_categories: Product categories

## Website
Website: https://finda.sale
About: https://finda.sale/about
Help: https://finda.sale/guide
```

### 4.4 robots.txt & SEO

Ensure `robots.txt` does NOT block the MCP discovery endpoints:

```
User-agent: *
Allow: /
Allow: /.well-known/mcp.json

# AI crawlers
User-agent: GPTBot
Allow: /
Allow: /.well-known/mcp.json

User-agent: anthropic-ai
Allow: /
Allow: /.well-known/mcp.json
```

---

## 5. Implementation Phases

### Phase 1: MVP (Weeks 1–2, ~4–5 dev days)

**Deliverables:**
- [ ] New `packages/mcp-server` package with 7 tools
- [ ] Stdio transport handler
- [ ] Rate limiting middleware
- [ ] HTTP client to backend
- [ ] Docker container for Railway deployment
- [ ] `.well-known/mcp.json` discovery file
- [ ] `llms.txt` update
- [ ] Documentation: README + tool schemas
- [ ] Test: Manual tool invocation via MCP SDK CLI
- [ ] Deploy to Railway, add to MCP registry

**Scope:**
- `search_sales` — filters by city, dates, type, query
- `get_sale` — public sale details
- `search_items` — keyword search
- `get_item` — item details
- `list_cities` — city browse
- `list_sale_types` — static list
- `list_categories` — static/cached list

**Out of scope:**
- Authentication / organizer-specific tools
- Webhooks / real-time updates
- Advanced filtering (e.g., by organizer tier)
- Bidding / purchasing integrations

**Backend dependencies:**
- Existing `GET /api/sales/search`, `GET /api/sales/{id}`
- Existing `GET /api/items/search`, `GET /api/items/{id}`
- New `GET /api/sales/cities` (if not present)
- New `GET /api/ebay/categories` (if not present, or hardcode)

---

### Phase 2: Enhanced Tools (Weeks 3–4, Future Session)

**Additions:**
- [ ] `get_organizer` — organizer profiles + sale history
- [ ] `search_by_distance` — radius-based search (optimize for "near me")
- [ ] Optional API key authentication for organizer-protected tools
- [ ] Caching layer (Redis or in-memory) for expensive queries
- [ ] Analytics: track tool usage, top searches, trending items
- [ ] Webhook support: AI agents subscribe to new sales/items in a region

**Organizer-Specific Tools (with API key):**
- `get_my_sales` — authenticated organizer sees only their own sales
- `update_sale_status` — organizer marks a sale as COMPLETED
- `list_sale_items` — see all items for an organizer's sale

---

### Phase 3: Real-Time & Advanced (Future)

**Additions:**
- [ ] Webhooks: "New sales added to [city]"
- [ ] Live item availability (is item still available?)
- [ ] Bidding integration: place bids via MCP
- [ ] Purchase integration: buy items via MCP
- [ ] Notifications: subscribe to price drops, new items matching saved searches
- [ ] Advanced filters: "Furniture from vendors rated 4.8+"

---

## 6. Deployment & Operations

### 6.1 Railway Deployment

MCP server runs as a separate **service** on Railway alongside the backend.

**Dockerfile.production:**
```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY packages/mcp-server /app

RUN npm install --production
EXPOSE 3002

CMD ["node", "dist/index.js"]
```

**Environment Variables (Railway):**
```
BACKEND_URL=https://api.railway.app  # or internal Railway backend URL
NODE_ENV=production
PORT=3002
LOG_LEVEL=info
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

**Monitoring:**
- Sentry for error tracking (already integrated in backend)
- Prometheus metrics: tool call count, latency, errors
- Slow-query alerts: if any tool takes >5 seconds

### 6.2 Scalability

MCP server is stateless and can be horizontally scaled:
- Requests per minute across all tools: ~1,000 (generous estimate for MVP)
- Single Railway container: ~5,000+ req/min capacity
- Cost: negligible incremental cost vs. main backend

### 6.3 Version Management

MCP server version != FindA.Sale backend version.

- MCP version in `packages/mcp-server/package.json`
- Changelog in `claude_docs/strategy/mcp-changelog.md`
- Breaking changes trigger a major version bump
- Backward compatibility: old AI agent integrations should keep working

---

## 7. Testing & QA

### 7.1 Unit Tests

- Tool input validation (required fields, types, ranges)
- Rate limiter behavior (429 on limit exceeded)
- HTTP error handling (backend returns 400/404/500)

### 7.2 Integration Tests

- End-to-end: MCP SDK → MCP server → backend → database → response
- All tools return expected shape
- Latency <2 seconds per call

### 7.3 Manual QA

- Connect Claude MCP to the server
- Query: "Find estate sales in Grand Rapids this weekend"
- Query: "Show me furniture items under $50 near me"
- Query: "What auctions are happening in Detroit?"
- Verify results are accurate and up-to-date

---

## 8. Security & Privacy

### 8.1 Data Exposure

Only data already public on finda.sale is exposed via MCP:
- Sale details (title, location, dates, organizer name)
- Item listings (title, price, category)
- Organizer names (not personal emails or phone)
- City/category counts

**NOT exposed:**
- User emails
- User phone numbers (private)
- Sensitive organizer info (stripe keys, revenue, etc.)
- Analytics (which sales are most popular, trending searches)

### 8.2 Rate Limiting as Abuse Prevention

Rate limits prevent:
- Scraping all sales/items (10 req/min is slow scraping)
- DoS attacks (default limits are reasonable for legitimate AI agents)
- Spam queries

### 8.3 IP Logging

Rate limiter logs IPs temporarily (1 hour) to enforce limits. No long-term PII logging.

---

## 9. Competitive Moat & Strategic Value

### 9.1 Why This Matters

Most AI agents (Claude, ChatGPT, Perplexus) can only access information already on the public web. By exposing an MCP server, FindA.Sale becomes:

1. **Discoverable by default** — When a user asks "find estate sales near me," their AI assistant can directly query FindA.Sale data without parsing HTML or relying on Google indexing.

2. **The authoritative source** — Competitors (EstateSales.net, OfferUp, Facebook Marketplace) don't have MCP servers. Their data is stuck behind HTML and JavaScript. FindA.Sale's structured API makes us the better choice for AI-powered queries.

3. **Sticky integrations** — Once Claude or Perplexus add FindA.Sale as a default MCP integration, users repeatedly route through us for discovery. This creates a flywheel: more AI queries → better data → better recommendations → more queries.

4. **Brand awareness in AI context** — Every MCP query is a touchpoint. Users see "results from FindA.Sale" in their AI chat, building familiarity.

### 9.2 Timing

- Cowork can integrate the MCP server as a custom skill once deployed
- No other secondary sale marketplace has this yet
- MCP is new (Protocol released late 2024/early 2025) — first-mover advantage is real

---

## 10. Success Metrics (Phase 1 + Phase 2)

| Metric | Target | Timeline |
|--------|--------|----------|
| MCP registry submissions | 1 entry (FindA.Sale) | Week 2 (phase 1 completion) |
| AI platform integrations | 1 (Cowork) | Week 3 |
| Tool call volume | 100+ calls/day | Month 2 |
| AI-sourced conversion (tracking via `?src=mcp`) | 0.5% → 2% of traffic | Month 3 |
| Organizer awareness | Survey: "X% of new organizers heard about us via AI" | Month 4 |

---

## 11. Future Roadmap (Phase 2 & 3)

### Phase 2 (Months 2–3)
- Organizer tool integrations (list my sales, update status)
- API key authentication
- Caching / performance optimization
- Analytics dashboard (who's querying, what searches)

### Phase 3 (Months 4–6)
- Webhook subscriptions
- Live bidding / purchasing
- Advanced filters
- Multi-language support

---

## 12. Implementation Handoff

### 12.1 Who Builds It

**Dev Agent:** `findasale-dev`
- Create `packages/mcp-server` package
- Implement 7 tools
- Write tests + README
- Deploy to Railway

**Ops Agent:** `findasale-ops` (supports Railway deployment)
- Railway service setup
- Environment variables
- Monitoring + alerting

**Records Agent:** `findasale-records`
- Add to roadmap
- Document in MCP registry
- Update llms.txt

### 12.2 Deliverables

1. **Code:** `packages/mcp-server/` with full source
2. **Docs:** README + inline tool schemas
3. **Deployment:** Docker config + Railway integration
4. **Discovery:** `.well-known/mcp.json` file
5. **Verification:** Tool tests + manual QA checklist

### 12.3 Next Steps

1. Patrick approves this spec (decision made: ✅ APPROVED or ❌ REVISIONS)
2. Dev agent gets task dispatch with schema + acceptance criteria
3. Deploy to Railway within 5 days
4. Register in MCP registry
5. Add to Cowork as custom MCP integration
6. Monitor tool usage and feedback

---

## Appendix A: Tool Schema Examples

### search_sales Example Call

**Input:**
```json
{
  "city": "Grand Rapids",
  "startDate": "2026-05-10",
  "saleType": ["ESTATE", "AUCTION"],
  "limit": 10
}
```

**Output:**
```json
{
  "sales": [
    {
      "id": "sale_abc123",
      "title": "Historic Home Estate Sale – Downtown GR",
      "saleType": "ESTATE",
      "status": "ACTIVE",
      "startDate": "2026-05-10T09:00:00Z",
      "endDate": "2026-05-12T17:00:00Z",
      "address": "123 Wealthy Ave",
      "city": "Grand Rapids",
      "state": "MI",
      "lat": 42.9629,
      "lng": -85.6789,
      "description": "Large 1920s colonial with original hardwood...",
      "itemCount": 847,
      "organizerName": "Heritage Estate Sales",
      "organizerId": "org_xyz789",
      "images": [
        {
          "url": "https://cdn.finda.sale/sales/abc123/main.jpg",
          "alt": "Living room with antique furniture"
        }
      ]
    }
  ],
  "total": 23,
  "page": 1
}
```

### search_items Example Call

**Input:**
```json
{
  "query": "vintage lamp",
  "city": "Grand Rapids",
  "priceMax": 75,
  "limit": 5
}
```

**Output:**
```json
{
  "items": [
    {
      "id": "item_lamp456",
      "title": "Tiffany-Style Table Lamp, c. 1960s",
      "description": "Brass base, stained glass shade. Works...",
      "category": "Lighting",
      "condition": "Good",
      "price": 65,
      "images": [
        {
          "url": "https://cdn.finda.sale/items/lamp456/main.jpg",
          "alt": "Tiffany lamp on wooden stand"
        }
      ],
      "saleId": "sale_abc123",
      "saleName": "Historic Home Estate Sale",
      "saleCity": "Grand Rapids",
      "organizerName": "Heritage Estate Sales",
      "isActive": true,
      "createdAt": "2026-05-09T14:30:00Z"
    }
  ],
  "total": 47,
  "page": 1
}
```

---

## Appendix B: Backend Route Dependencies

| Tool | Required Route | Exists? | Notes |
|------|----------------|---------|-------|
| search_sales | `GET /api/sales/search` | Yes | Extend to support filters |
| get_sale | `GET /api/sales/{id}` | Yes | Public endpoint |
| search_items | `GET /api/items/search` | Yes | Add price/condition filters if missing |
| get_item | `GET /api/items/{id}` | Yes | Public endpoint |
| list_cities | `GET /api/sales/cities` | Maybe | May need to create |
| list_sale_types | Hardcoded | — | No backend call needed |
| list_categories | `GET /api/ebay/categories` or hardcoded | Maybe | Use cached eBay taxonomy |

---

**END OF SPEC**
