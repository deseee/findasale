/**
 * eBay Shipping Classifier
 *
 * Auto-classifies items into shipping tiers based on category and tags.
 * Used for post-sale eBay push to suggest shipping policies to organizers.
 */

export type ShippingClassification = 'SHIPPABLE' | 'HEAVY_OVERSIZED' | 'FRAGILE' | 'UNKNOWN';

// Categories and keywords that indicate heavy/oversized items
const HEAVY_KEYWORDS = [
  'furniture',
  'sofa',
  'couch',
  'table',
  'desk',
  'chair',
  'wardrobe',
  'dresser',
  'appliance',
  'refrigerator',
  'washer',
  'dryer',
  'piano',
  'organ',
];

// Keywords that indicate fragile items
const FRAGILE_KEYWORDS = [
  'fragile',
  'delicate',
  'glass',
  'ceramic',
  'porcelain',
  'crystal',
];

// Categories and keywords for items that ship well
const SHIPPABLE_KEYWORDS = [
  'jewelry',
  'book',
  'clothing',
  'collectible',
  'coin',
  'card',
  'record',
  'vinyl',
  'dvd',
  'toy',
  'figurine',
  'art',
  'print',
  'vintage',
  'antique',
];

/**
 * Classify an item's shipping tier based on category and tags
 * @param category - Item category (nullable)
 * @param tags - Array of item tags from AI analysis
 * @returns ShippingClassification
 */
export function classifyEbayShipping(
  category: string | null,
  tags: string[]
): ShippingClassification {
  const categoryLower = (category || '').toLowerCase();
  const tagsLower = tags.map((t) => t.toLowerCase());
  const combinedStr = `${categoryLower} ${tagsLower.join(' ')}`;

  // Check HEAVY first — highest priority
  if (HEAVY_KEYWORDS.some((keyword) => combinedStr.includes(keyword))) {
    return 'HEAVY_OVERSIZED';
  }

  // Check FRAGILE second
  if (FRAGILE_KEYWORDS.some((keyword) => combinedStr.includes(keyword))) {
    return 'FRAGILE';
  }

  // Check SHIPPABLE
  if (SHIPPABLE_KEYWORDS.some((keyword) => combinedStr.includes(keyword))) {
    return 'SHIPPABLE';
  }

  return 'UNKNOWN';
}
