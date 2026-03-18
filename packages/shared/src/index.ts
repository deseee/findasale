// Shared types and utilities will go here

// Feature #51: Sale Ripples — social proof activity
export { RippleType, type RippleSummaryDTO, type RippleTrendDTO, type RippleActivityDTO } from './types/ripples';

// Feature #65: Subscription tier gating
export { type SubscriptionTier, hasAccess, TIER_RANK, FEATURE_TIERS } from './tierGate';

// Feature #68: Command Center Dashboard types
export type {
  CommandCenterResponse,
  CommandCenterFilters,
  CommandCenterSummary,
  SaleMetrics,
  PendingActions,
} from './types/commandCenter';

// Sprint 1: Listing Factory tag vocabulary
export { CURATED_TAGS, MAX_CUSTOM_TAGS, type CuratedTag } from './constants/tagVocabulary';

// B1 ADR: Sale type categories
export enum SaleType {
  ESTATE = 'ESTATE',
  YARD = 'YARD',
  AUCTION = 'AUCTION',
  FLEA_MARKET = 'FLEA_MARKET',
}

// B1 ADR: Item listing/transaction types
export enum ListingType {
  FIXED = 'FIXED',
  AUCTION = 'AUCTION',
  REVERSE_AUCTION = 'REVERSE_AUCTION',
  LIVE_DROP = 'LIVE_DROP',
  POS = 'POS',
}

// Feature #5: Validator functions for enum consistency
export const VALID_SALE_TYPES = Object.values(SaleType) as string[];
export const VALID_LISTING_TYPES = Object.values(ListingType) as string[];

export const isValidSaleType = (value: any): value is SaleType => {
  return typeof value === 'string' && VALID_SALE_TYPES.includes(value);
};

export const isValidListingType = (value: any): value is ListingType => {
  return typeof value === 'string' && VALID_LISTING_TYPES.includes(value);
};

export type Sale = {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  lat?: number;
  lng?: number;
  photoUrls: string[];
  organizer: {
    id: string;
    businessName: string;
  };
  tags?: string[];
  isAuctionSale?: boolean;
};

export type Organizer = {
  id: string;
  name: string;
  email: string;
  phone: string;
};

export type User = {
  id: string;
  name: string;
  email: string;
};

export type AuthResponse = {
  user: Omit<User, 'password'>;
  token: string;
};

export type LoginCredentials = {
  email: string;
  password: string;
};

export type RegisterCredentials = {
  email: string;
  password: string;
  name: string;
  role: 'USER' | 'ORGANIZER' | 'ADMIN';
};
