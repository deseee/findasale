/**
 * Type definitions for bulk item operations
 */

export type BulkOperation = 'delete' | 'status' | 'category' | 'price_adjust';

export type ItemStatus = 'AVAILABLE' | 'SOLD' | 'ON_HOLD' | 'RESERVED' | 'AUCTION_ENDED';

export type ItemCategory =
  | 'furniture'
  | 'decor'
  | 'vintage'
  | 'textiles'
  | 'collectibles'
  | 'art'
  | 'jewelry'
  | 'books'
  | 'tools'
  | 'electronics'
  | 'sports'
  | 'other';

export type ItemCondition = 'mint' | 'excellent' | 'good' | 'fair' | 'poor';

export interface BulkUpdatePayload {
  itemIds: string[];
  operation: BulkOperation;
  value?: string | number;
}

export interface BulkUpdateResponse {
  updated: number;
  failed: number;
}

export interface ItemForBulkManagement {
  id: string;
  title: string;
  category?: string;
  condition?: ItemCondition;
  price?: number;
  auctionStartPrice?: number;
  status: ItemStatus;
  photoUrls?: string[];
  createdAt?: string;
}
