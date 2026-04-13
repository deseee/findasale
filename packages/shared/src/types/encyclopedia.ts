/**
 * Encyclopedia Types — Feature #52
 * Shared DTOs for encyclopedia entries, revisions, and price benchmarks
 */

export interface EncyclopediaEntryDTO {
  id: string;
  slug: string;
  title: string;
  subtitle?: string;
  content: string;
  category: string;
  tags: string[];
  authorName: string;
  status: 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | 'FLAGGED';
  viewCount: number;
  helpfulCount: number;
  excerpt: string;
  isFeatured: boolean;
  createdAt: string;
  updatedAt: string;
  userVote?: boolean | null; // null = no vote, true = helpful, false = not helpful
}

export interface EncyclopediaDetailDTO {
  id: string;
  slug: string;
  title: string;
  subtitle?: string;
  content: string;
  category: string;
  tags: string[];
  author: {
    id: string;
    name: string;
    profilePhoto?: string;
  };
  status: 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | 'FLAGGED';
  viewCount: number;
  helpfulCount: number;
  isFeatured: boolean;

  benchmarks: PriceBenchmarkDTO[];
  references: EncyclopediaReferenceDTO[];
  related: {
    slug: string;
    title: string;
    viewCount: number;
  }[];

  userVote?: boolean | null;
  createdAt: string;
  updatedAt: string;
}

export interface PriceBenchmarkDTO {
  id: string;
  condition: 'mint' | 'excellent' | 'good' | 'fair' | 'poor';
  region: 'Northeast' | 'Midwest' | 'South' | 'West' | 'National';
  priceRangeLow: number; // cents
  priceRangeHigh: number; // cents
  dataSource?: string;
  updatedAt: string;
}

export interface EncyclopediaReferenceDTO {
  id: string;
  title: string;
  url: string;
  source?: string;
}

export interface EncyclopediaRevisionDTO {
  id: string;
  entryId: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  authorName: string;
  changeNote?: string;
  createdAt: string;
}

export interface ListEntriesResponse {
  entries: EncyclopediaEntryDTO[];
  total: number;
  page: number;
  hasMore: boolean;
}

export interface CreateEntryRequest {
  title: string;
  subtitle?: string;
  content: string;
  category: string;
  tags?: string[];
  references?: Array<{
    title: string;
    url: string;
    source?: string;
  }>;
}

export interface CreateEntryResponse {
  id: string;
  slug: string;
  status: 'PENDING_REVIEW';
  createdAt: string;
  message: string;
}

export interface VoteRequest {
  helpful: boolean;
}

export interface VoteResponse {
  helpfulCount: number;
  userVote: boolean;
}

export interface UpdateEntryRequest {
  title?: string;
  subtitle?: string;
  content?: string;
  category?: string;
  tags?: string[];
  changeNote?: string;
}

export interface UpdateEntryResponse {
  revisionId: string;
  entryId: string;
  changeNote?: string;
  createdAt: string;
}

// Categories enum
export const ENCYCLOPEDIA_CATEGORIES = [
  'Art Deco',
  'Mid-Century Modern',
  'Americana',
  'Victorian',
  'Tools',
  'Toys',
  'Jewelry',
  'Pottery',
  'Glassware',
  'Textiles',
  'Furniture',
  'Collectibles',
  'Vintage',
  'Antiques',
  'Books'
] as const;

export type EncyclopediaCategory = typeof ENCYCLOPEDIA_CATEGORIES[number];
