/**
 * MCP Server Local Types
 *
 * All types are defined here to avoid imports from @findasale/shared
 * which cause Vercel/Railway build failures.
 */

// ──────────────────────────────────────────────────────────────
// Response Shapes -- match spec exactly
// ──────────────────────────────────────────────────────────────

export interface ImageData {
  url: string;
  alt: string;
}

export interface SaleData {
  id: string;
  title: string;
  saleType: string; // ESTATE, YARD, AUCTION, FLEA_MARKET, CONSIGNMENT
  status: string; // ACTIVE, UPCOMING, COMPLETED
  startDate: string; // ISO datetime
  endDate: string; // ISO datetime
  address: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  description?: string;
  itemCount: number;
  organizerName: string;
  organizerId: string;
  images: ImageData[];
  confidenceScore?: number | null;
}

export interface SearchSalesResponse {
  sales: SaleData[];
  total: number;
  page: number;
}

export interface GetSaleResponse {
  id: string;
  title: string;
  saleType: string;
  status: string;
  startDate: string;
  endDate: string;
  address: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  description: string;
  itemCount: number;
  organizerName: string;
  organizerId: string;
  organizerPhone?: string;
  organizerEmail?: string;
  images: ImageData[];
  highlights?: string[];
  visitUrl: string;
  iCalUrl: string;
  averageRating?: number;
  reviews?: number;
}

export interface ItemData {
  id: string;
  title: string;
  description?: string;
  category: string;
  condition: string;
  price: number;
  images: ImageData[];
  saleId: string;
  saleName: string;
  saleCity: string;
  organizerName: string;
  isActive: boolean;
  createdAt: string;
}

export interface SearchItemsResponse {
  items: ItemData[];
  total: number;
  page: number;
}

export interface GetItemResponse {
  id: string;
  title: string;
  description: string;
  category: string;
  condition: string;
  price: number;
  priceBeforeDiscount?: number;
  quantity: number;
  images: ImageData[];
  saleId: string;
  saleName: string;
  saleAddress: string;
  saleCity: string;
  saleDates: {
    startDate: string;
    endDate: string;
  };
  organizerId: string;
  organizerName: string;
  isActive: boolean;
  visitUrl: string;
  createdAt: string;
}

export interface CityData {
  name: string;
  state: string;
  activeSaleCount: number;
  upcomingSaleCount: number;
  browseUrl: string;
}

export interface ListCitiesResponse {
  cities: CityData[];
  total: number;
}

export interface SaleType {
  id: string;
  displayName: string;
  description: string;
  icon?: string;
}

export interface ListSaleTypesResponse {
  types: SaleType[];
}

export interface CategoryData {
  id: string;
  name: string;
  itemCount: number;
}

export interface ListCategoriesResponse {
  categories: CategoryData[];
  total: number;
}

// ──────────────────────────────────────────────────────────────
// MCP Tool Definitions
// ──────────────────────────────────────────────────────────────

export interface MCPToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface MCPToolDefinition {
  name: string;
  description: string;
  annotations?: MCPToolAnnotations;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

// ──────────────────────────────────────────────────────────────
// Input Validation Types
// ──────────────────────────────────────────────────────────────

export interface SearchSalesInput {
  city?: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  startDate?: string;
  endDate?: string;
  saleType?: string[];
  status?: string;
  query?: string;
  limit?: number;
  sortBy?: string;
  minConfidence?: number;
}

export interface GetSaleInput {
  saleId: string;
}

export interface SearchItemsInput {
  query: string;
  category?: string;
  city?: string;
  priceMin?: number;
  priceMax?: number;
  condition?: string[];
  limit?: number;
  sortBy?: string;
}

export interface GetItemInput {
  itemId: string;
}

export interface GetTrendingSalesInput {
  city?: string;
  saleType?: string;
  limit?: number;
}

export interface GetSalesStartingSoonInput {
  city?: string;
  saleType?: string;
  daysAhead?: number;
}

export interface FindItemForSaleInput {
  query: string;
  city?: string;
  maxPrice?: number;
  minPrice?: number;
}

// ──────────────────────────────────────────────────────────────
// Response shapes for new high-intent tools
// ──────────────────────────────────────────────────────────────

export interface TrendingSaleItem {
  id: string;
  title: string;
  city: string;
  state: string;
  saleType: string;
  startDate: string;
  endDate: string;
  itemCount: number;
  url: string;
}

export interface GetTrendingSalesResponse {
  sales: TrendingSaleItem[];
  total: number;
}

export interface StartingSoonSaleItem {
  id: string;
  title: string;
  city: string;
  state: string;
  saleType: string;
  startDate: string;
  endDate: string;
  url: string;
}

export interface GetSalesStartingSoonResponse {
  sales: StartingSoonSaleItem[];
  total: number;
}

export interface FoundItemForSale {
  itemName: string;
  description: string | null;
  price: number | null;
  condition: string | null;
  saleTitle: string;
  saleCity: string;
  saleState: string;
  saleEndDate: string;
  saleUrl: string;
}

export interface FindItemForSaleResponse {
  items: FoundItemForSale[];
  total: number;
}

// ──────────────────────────────────────────────────────────────
// Rate Limiter Types
// ──────────────────────────────────────────────────────────────

export interface RateLimitStore {
  [ip: string]: {
    [toolName: string]: {
      count: number;
      resetAt: number;
    };
  };
}

// ──────────────────────────────────────────────────────────────
// MCP Server Types
// ──────────────────────────────────────────────────────────────

export interface MCPRequest {
  jsonrpc: string;
  id: string | number;
  method: string;
  params: {
    name: string;
    arguments: Record<string, any>;
  };
}

export interface MCPResponse {
  jsonrpc: string;
  id: string | number;
  result?: {
    content: Array<{
      type: string;
      text: string;
    }>;
  };
  error?: {
    code: number;
    message: string;
  };
}
