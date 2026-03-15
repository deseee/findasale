/**
 * tagVocabulary.ts — Tag Vocabulary Constants for Listing Factory
 *
 * Defines curated tag vocabulary (45 tags) for estate sale item tagging.
 * Tags are grouped by category but exported as a flat array for UI/AI purposes.
 *
 * Quarterly review process owned by Patrick. Custom tags limited to 1 slot per item.
 */

export const CURATED_TAGS = [
  // Style / Era (15)
  'mid-century-modern',
  'art-deco',
  'victorian',
  'craftsman',
  'industrial',
  'farmhouse',
  'bohemian',
  'danish-modern',
  'scandinavian',
  'atomic-age',
  'hollywood-regency',
  'arts-and-crafts',
  'colonial',
  'transitional',
  'contemporary',
  // Material (10)
  'walnut',
  'oak',
  'teak',
  'brass',
  'cast-iron',
  'wicker',
  'leather',
  'ceramic',
  'glass',
  'chrome',
  // Item Type Modifiers (10)
  'hand-painted',
  'signed',
  'original',
  'limited-edition',
  'first-edition',
  'handmade',
  'restored',
  'vintage-1950s',
  'vintage-1960s',
  'vintage-1970s',
  // Category Helpers (10)
  'collectible',
  'antique',
  'sterling-silver',
  'costume-jewelry',
  'fine-art',
  'folk-art',
  'architectural-salvage',
  'garden-decor',
  'holiday-decor',
  'musical',
] as const;

// Type export for tagging
export type CuratedTag = (typeof CURATED_TAGS)[number];

// Max 1 custom tag per item (in addition to curated tags)
export const MAX_CUSTOM_TAGS = 1;
