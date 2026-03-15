// Shared types and utilities will go here

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
