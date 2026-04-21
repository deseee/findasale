/**
 * boostPricing.ts — Single source of truth for all boost XP and cash prices.
 * Phase 2b: Dual-rail boost system (ADR: claude_docs/feature-notes/ADR-featured-boost-dual-rail-S418.md)
 *
 * RULE: Both xpService.ts XP_SINKS constants AND the /api/boosts/quote endpoint
 * reference this file. Never hardcode prices anywhere else.
 */

export interface BoostPriceEntry {
  xpCost: number;         // XP cost for XP rail (same numeric value as stripeAmountCents for 1 XP = $0.01 anchor)
  stripeAmountCents: number; // Cash cost in cents for Stripe rail
  durationDays: number;   // Default duration in days (0 = instant/permanent)
  cashRailAvailable: boolean; // false = XP-only (cosmetics, Lucky Roll, etc.)
  label: string;          // Human-readable label for UI
  description: string;    // Short description for modal
}

/**
 * Boost pricing table.
 * XP cost and Stripe cents are intentionally equal (1 XP = $0.01 anchor, S388).
 * Duration 0 = permanent/non-expiring (e.g. cosmetics).
 * Duration 999 = sale duration (expires when target sale closes).
 */
export const BOOST_PRICING: Record<string, BoostPriceEntry> = {
  SALE_BUMP: {
    xpCost: 100,
    stripeAmountCents: 100,
    durationDays: 0,          // 1 hour bump, implemented as 0.042 days — backend handles as 1-hour window
    cashRailAvailable: true,
    label: 'Sale Bump',
    description: 'Push your sale to the top of search and map results for 1 hour.',
  },
  HAUL_VISIBILITY: {
    xpCost: 80,
    stripeAmountCents: 80,
    durationDays: 7,
    cashRailAvailable: true,
    label: 'Haul Visibility Boost',
    description: 'Boost your haul post to the top of the Loot Legend feed for 7 days.',
  },
  BOUNTY_VISIBILITY: {
    xpCost: 50,
    stripeAmountCents: 50,
    durationDays: 7,
    cashRailAvailable: true,
    label: 'Bounty Visibility Boost',
    description: 'Increase your missing-item bounty visibility to organizers for 7 days.',
  },
  EVENT_SPONSORSHIP: {
    xpCost: 1000,
    stripeAmountCents: 1000,
    durationDays: 7,
    cashRailAvailable: true,
    label: 'Event Sponsorship (7-day)',
    description: 'Exclusive featured placement on sale discovery, exclusive bounties, and high visibility for 7 days.',
  },
  EVENT_SPONSORSHIP_14D: {
    xpCost: 1800,
    stripeAmountCents: 1800,
    durationDays: 14,
    cashRailAvailable: true,
    label: 'Event Sponsorship (14-day)',
    description: 'Exclusive featured placement and high visibility for 14 days.',
  },
  WISHLIST_NOTIFICATION: {
    xpCost: 100,
    stripeAmountCents: 100,
    durationDays: 30,
    cashRailAvailable: true,
    label: 'Wishlist Notification Boost',
    description: 'Get first-alert push notifications when a matching item is posted for 30 days.',
  },
  SEASONAL_CHALLENGE_ACCESS: {
    xpCost: 250,
    stripeAmountCents: 250,
    durationDays: 90,         // approx. one season
    cashRailAvailable: true,
    label: 'Seasonal Challenge Access',
    description: 'Unlock the premium seasonal challenge tier for the current season (~90 days).',
  },
  GUIDE_PUBLICATION: {
    xpCost: 100,
    stripeAmountCents: 100,
    durationDays: 0,          // permanent
    cashRailAvailable: true,
    label: 'Guide Publication',
    description: 'Publish a collection guide to the FindA.Sale Encyclopedia.',
  },
  RARITY_BOOST: {
    xpCost: 50,
    stripeAmountCents: 50,
    durationDays: 999,        // sale duration — expires when target sale ends
    cashRailAvailable: true,
    label: 'Rarity Boost',
    description: 'Get +2% Legendary item rarity odds for a specific sale.',
  },
  CUSTOM_MAP_PIN: {
    xpCost: 1000,
    stripeAmountCents: 1000,
    durationDays: 0,          // permanent
    cashRailAvailable: true,
    label: 'Custom Map Pin',
    description: 'Customize your sale\'s map icon with an emoji or short icon. Permanent.',
  },
  TREASURE_TRAIL_SPONSOR: {
    xpCost: 150,
    stripeAmountCents: 150,
    durationDays: 0,          // per trail, permanent until removed
    cashRailAvailable: true,
    label: 'Treasure Trail Sponsor',
    description: 'Add a scavenger hunt trail to your sale for shoppers to complete.',
  },
  EARLY_ACCESS_BOOST: {
    xpCost: 200,
    stripeAmountCents: 200,
    durationDays: 7,
    cashRailAvailable: true,
    label: 'Early Access Boost',
    description: 'Feature your presale 1 week early with extra visibility to shoppers.',
  },
  LISTINGS_EXTENSION: {
    xpCost: 250,
    stripeAmountCents: 250,
    durationDays: 30,
    cashRailAvailable: true,
    label: 'Listings Extension',
    description: 'Add 10 more item listings beyond your plan limit for 30 days. ($0.25/listing)',
  },
};

/**
 * Get pricing for a boost type. Falls back to null if type not found.
 */
export function getBoostPrice(boostType: string, durationDays?: number): BoostPriceEntry | null {
  const key = durationDays === 14 && boostType === 'EVENT_SPONSORSHIP'
    ? 'EVENT_SPONSORSHIP_14D'
    : boostType;
  return BOOST_PRICING[key] ?? null;
}

/**
 * Get the actual duration days for a boost, handling special cases.
 * SALE_BUMP: 1 hour expressed as fractional days for DB storage, but we store 1 day minimum.
 */
export function getEffectiveDurationDays(boostType: string, overrideDays?: number): number {
  if (overrideDays != null) return overrideDays;
  const entry = BOOST_PRICING[boostType];
  if (!entry) return 1;
  if (entry.durationDays === 0) return 1; // SALE_BUMP and permanents: 1-day DB record, expiry logic is separate
  if (entry.durationDays === 999) return 999; // sale duration, caller sets real expiry
  return entry.durationDays;
}
