/**
 * highValueFlagging.ts — Feature #371
 *
 * Auto High-Value Item Flagging utility
 * Evaluates whether an item should be auto-flagged as high-value based on:
 *   - Category (jewelry, art, antiques, collectibles, silver, watches)
 *   - Estimated value (>= threshold)
 *   - AI confidence (>= 0.85) with estimated value >= $300
 */

export interface ItemForHighValueCheck {
  isHighValueLocked?: boolean;
  category?: string | null;
  estimatedValue?: number | string | any;
  aiConfidence?: number;
  price?: number | string | any; // actual sale price — primary signal for eBay-imported items
}

/**
 * Evaluates whether an item should be auto-flagged as high-value.
 *
 * Respects organizer override: if isHighValueLocked === true, always returns false
 * (organizer explicitly disabled auto-flagging).
 *
 * @param item Item data to evaluate
 * @param saleThreshold Dollar threshold for price-based flagging (default $500)
 * @param autoFlagEnabled Whether auto-flagging is enabled for the sale
 * @returns true if item should be flagged as high-value, false otherwise
 */
export function evaluateAutoHighValueFlag(
  item: ItemForHighValueCheck,
  saleThreshold: number = 500,
  autoFlagEnabled: boolean = true
): boolean {
  if (!autoFlagEnabled) return false;
  if (item.isHighValueLocked) return false; // organizer said "no" — respect it

  const HIGH_VALUE_CATEGORIES = ['jewelry', 'art', 'antiques', 'collectibles', 'silver', 'watches'];

  // Convert estimatedValue to number if it's a Decimal/string
  let estimatedValueNum: number | null = null;
  if (item.estimatedValue) {
    if (typeof item.estimatedValue === 'number') {
      estimatedValueNum = item.estimatedValue;
    } else if (typeof item.estimatedValue === 'string') {
      estimatedValueNum = parseFloat(item.estimatedValue);
    } else if (item.estimatedValue.toNumber && typeof item.estimatedValue.toNumber === 'function') {
      // Handle Prisma Decimal type
      estimatedValueNum = item.estimatedValue.toNumber();
    }
  }

  // Convert price to number (handles Prisma Decimal)
  let priceNum: number | null = null;
  if (item.price) {
    if (typeof item.price === 'number') priceNum = item.price;
    else if (typeof item.price === 'string') priceNum = parseFloat(item.price);
    else if (item.price.toNumber) priceNum = item.price.toNumber();
  }

  const categoryMatch = item.category && HIGH_VALUE_CATEGORIES.includes(item.category.toLowerCase());
  const estimatedValueMatch = estimatedValueNum && estimatedValueNum >= saleThreshold;
  const priceMatch = priceNum && priceNum >= saleThreshold; // primary signal for eBay-imported items
  const confidenceMatch = item.aiConfidence && item.aiConfidence >= 0.85 && estimatedValueNum && estimatedValueNum >= 300;

  return !!(categoryMatch || estimatedValueMatch || priceMatch || confidenceMatch);
}

/**
 * Clears auto-flag status if an item no longer qualifies.
 * Use after AI re-analysis when estimated value or confidence drops.
 *
 * @param item Item with existing auto-flag status
 * @param saleThreshold Dollar threshold for price-based flagging
 * @param autoFlagEnabled Whether auto-flagging is enabled
 * @returns true if item should still be flagged, false if flag should be cleared
 */
export function shouldRetainAutoFlag(
  item: ItemForHighValueCheck & { highValueSource?: string },
  saleThreshold: number = 500,
  autoFlagEnabled: boolean = true
): boolean {
  // If it was manually flagged, don't touch it
  if (item.highValueSource === 'MANUAL') return true;

  // Re-evaluate if it was auto-flagged
  if (item.highValueSource === 'AUTO') {
    return evaluateAutoHighValueFlag(item, saleThreshold, autoFlagEnabled);
  }

  // Default: retain flag if already set
  return true;
}
