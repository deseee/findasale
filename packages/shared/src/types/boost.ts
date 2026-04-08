/**
 * Boost system shared types — Phase 2b
 * Re-exports Prisma enums for use in frontend without importing from @prisma/client directly
 */

export type BoostType =
  | 'SALE_BUMP'
  | 'HAUL_VISIBILITY'
  | 'BOUNTY_VISIBILITY'
  | 'EVENT_SPONSORSHIP'
  | 'WISHLIST_NOTIFICATION'
  | 'SEASONAL_CHALLENGE_ACCESS'
  | 'GUIDE_PUBLICATION'
  | 'RARITY_BOOST';

export type PaymentMethod = 'XP' | 'STRIPE';

export type BoostStatus = 'ACTIVE' | 'EXPIRED' | 'REFUNDED' | 'FAILED' | 'PENDING';

export interface BoostQuoteResponse {
  boostType: BoostType;
  xpCost: number;
  stripeAmountCents: number;
  stripeAmountDollars: string;
  durationDays: number;
  cashRailAvailable: boolean;
  label: string;
  description: string;
  userXpBalance: number;
  canAffordXp: boolean;
}

export interface BoostPurchaseSummary {
  id: string;
  boostType: BoostType;
  targetType?: string | null;
  targetId?: string | null;
  paymentMethod: PaymentMethod;
  xpCost?: number | null;
  stripeAmountCents?: number | null;
  durationDays: number;
  activatedAt: string;
  expiresAt: string;
  status: BoostStatus;
  createdAt: string;
}

export interface ActiveBoostSummary {
  id: string;
  boostType: BoostType;
  targetType?: string | null;
  targetId?: string | null;
  expiresAt: string;
  activatedAt: string;
}
