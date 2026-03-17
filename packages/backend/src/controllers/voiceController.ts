/**
 * voiceController.ts — Feature #42: Voice-to-Tag Extraction
 *
 * Converts voice transcripts to structured item data via keyword extraction.
 * Uses simple regex/keyword patterns (no AI call) for fast, deterministic extraction.
 * Endpoint: POST /api/ai/voice-extract
 * Request: { transcript: string }
 * Response: { name: string, tags: string[], category: string, estimatedPrice?: number }
 */

import { Request, Response } from 'express';

// Curated tags — mirrors tagController.ts
const CURATED_TAGS = [
  'mid-century-modern', 'art-deco', 'victorian', 'craftsman', 'industrial',
  'farmhouse', 'bohemian', 'danish-modern', 'scandinavian', 'atomic-age',
  'hollywood-regency', 'arts-and-crafts', 'colonial', 'transitional', 'contemporary',
  'walnut', 'oak', 'teak', 'brass', 'cast-iron',
  'wicker', 'leather', 'ceramic', 'glass', 'chrome',
  'hand-painted', 'signed', 'original', 'limited-edition', 'first-edition',
  'handmade', 'restored', 'vintage-1950s', 'vintage-1960s', 'vintage-1970s',
  'collectible', 'antique', 'sterling-silver', 'costume-jewelry', 'fine-art',
  'folk-art', 'architectural-salvage', 'garden-decor', 'holiday-decor', 'musical',
];

// Category keywords — maps transcript patterns to item categories
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Furniture': ['chair', 'table', 'sofa', 'couch', 'desk', 'dresser', 'cabinet', 'nightstand', 'bench', 'seat', 'headboard'],
  'Jewelry': ['ring', 'necklace', 'bracelet', 'earring', 'pendant', 'brooch', 'locket', 'chain', 'watch', 'gem'],
  'Art & Decor': ['painting', 'sculpture', 'art', 'vase', 'mirror', 'frame', 'wall hanging', 'statue', 'figurine', 'decor'],
  'Clothing': ['dress', 'coat', 'jacket', 'shirt', 'pants', 'skirt', 'sweater', 'blouse', 'suit', 'vintage clothing'],
  'Kitchenware': ['knife', 'fork', 'spoon', 'dish', 'plate', 'bowl', 'glass', 'cup', 'pot', 'pan', 'cutlery', 'silverware'],
  'Tools & Hardware': ['hammer', 'wrench', 'saw', 'drill', 'screwdriver', 'tool', 'vice', 'bolt', 'nail', 'clamp'],
  'Collectibles': ['coin', 'stamp', 'figurine', 'model', 'card', 'memorabilia', 'collectible', 'rare'],
  'Electronics': ['radio', 'television', 'lamp', 'speaker', 'record player', 'camera', 'projector', 'phone', 'vintage radio'],
  'Books & Media': ['book', 'magazine', 'record', 'vinyl', 'cassette', 'cd', 'novel', 'first edition'],
};

// Material/style keywords → tags
const MATERIAL_KEYWORDS: Record<string, string> = {
  'walnut': 'walnut',
  'oak': 'oak',
  'teak': 'teak',
  'brass': 'brass',
  'cast iron': 'cast-iron',
  'cast-iron': 'cast-iron',
  'wicker': 'wicker',
  'leather': 'leather',
  'ceramic': 'ceramic',
  'glass': 'glass',
  'chrome': 'chrome',
  'hand-painted': 'hand-painted',
  'hand painted': 'hand-painted',
  'signed': 'signed',
  'original': 'original',
  'limited edition': 'limited-edition',
  'limited-edition': 'limited-edition',
  'handmade': 'handmade',
  'hand-made': 'handmade',
  'restored': 'restored',
  'sterling silver': 'sterling-silver',
  'sterling-silver': 'sterling-silver',
};

// Era/style keywords → tags
const ERA_KEYWORDS: Record<string, string> = {
  'mid-century': 'mid-century-modern',
  'mid century': 'mid-century-modern',
  'art deco': 'art-deco',
  'art-deco': 'art-deco',
  'victorian': 'victorian',
  'craftsman': 'craftsman',
  'industrial': 'industrial',
  'farmhouse': 'farmhouse',
  'bohemian': 'bohemian',
  'boho': 'bohemian',
  'danish modern': 'danish-modern',
  'danish-modern': 'danish-modern',
  'scandinavian': 'scandinavian',
  'atomic age': 'atomic-age',
  'atomic-age': 'atomic-age',
  'hollywood regency': 'hollywood-regency',
  'hollywood-regency': 'hollywood-regency',
  'arts and crafts': 'arts-and-crafts',
  'arts-and-crafts': 'arts-and-crafts',
  'colonial': 'colonial',
  'transitional': 'transitional',
  'contemporary': 'contemporary',
  'antique': 'antique',
  'vintage': 'vintage-1900s',
  'vintage-1950s': 'vintage-1950s',
  'vintage-1960s': 'vintage-1960s',
  'vintage-1970s': 'vintage-1970s',
  '1950s': 'vintage-1950s',
  '1960s': 'vintage-1960s',
  '1970s': 'vintage-1970s',
};

// Quality keywords for price estimation
const PREMIUM_KEYWORDS = ['antique', 'vintage', 'designer', 'signed', 'rare', 'limited edition', 'handmade', 'fine art', 'sterling silver', 'original'];
const CONDITION_KEYWORDS: Record<string, number> = {
  'excellent': 1.0,
  'mint': 1.2,
  'pristine': 1.2,
  'perfect': 1.2,
  'good': 0.8,
  'fair': 0.6,
  'poor': 0.4,
  'worn': 0.5,
  'damaged': 0.3,
};

/**
 * Extract item name from transcript (first noun phrase)
 * Simple heuristic: first 1-3 words or up to first connective word
 */
function extractItemName(transcript: string): string {
  const words = transcript.toLowerCase().trim().split(/\s+/);
  if (words.length === 0) return '';

  // Stop at common verbs/connectives
  const stopWords = ['is', 'are', 'has', 'have', 'with', 'and', 'or', 'the', 'a', 'in', 'on', 'at', 'from'];
  let name = '';
  for (const word of words) {
    if (stopWords.includes(word)) break;
    name += (name ? ' ' : '') + word;
    if (name.split(' ').length >= 3) break; // Cap at 3 words
  }

  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Detect item category based on keywords
 */
function detectCategory(transcript: string): string {
  const lower = transcript.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        return category;
      }
    }
  }
  return 'Other'; // Default
}

/**
 * Extract tags from transcript
 */
function extractTags(transcript: string): string[] {
  const lower = transcript.toLowerCase();
  const tags = new Set<string>();

  // Check material keywords
  for (const [keyword, tag] of Object.entries(MATERIAL_KEYWORDS)) {
    if (lower.includes(keyword)) {
      tags.add(tag);
    }
  }

  // Check era/style keywords
  for (const [keyword, tag] of Object.entries(ERA_KEYWORDS)) {
    if (lower.includes(keyword)) {
      tags.add(tag);
    }
  }

  // Check for condition keywords (don't add as tags, just note for context)
  // (Could be used for condition grading in future)

  return Array.from(tags).filter(tag => CURATED_TAGS.includes(tag));
}

/**
 * Estimate price based on keywords
 * Simple heuristic: base price + multipliers for quality indicators
 */
function estimatePrice(transcript: string, category: string): number | undefined {
  const lower = transcript.toLowerCase();

  // Base prices by category (in dollars)
  const basePrices: Record<string, number> = {
    'Furniture': 80,
    'Jewelry': 40,
    'Art & Decor': 50,
    'Clothing': 20,
    'Kitchenware': 15,
    'Tools & Hardware': 30,
    'Collectibles': 45,
    'Electronics': 50,
    'Books & Media': 10,
    'Other': 25,
  };

  let price = basePrices[category] || 25;

  // Multipliers for premium keywords
  let multiplier = 1.0;
  for (const keyword of PREMIUM_KEYWORDS) {
    if (lower.includes(keyword)) {
      multiplier += 0.3;
    }
  }

  // Multiplier for condition
  for (const [condition, factor] of Object.entries(CONDITION_KEYWORDS)) {
    if (lower.includes(condition)) {
      multiplier *= factor;
    }
  }

  price *= multiplier;
  return Math.round(price * 100) / 100; // Round to 2 decimals
}

/**
 * POST /api/ai/voice-extract
 * Extract item data from voice transcript
 */
export const voiceExtract = async (req: Request, res: Response) => {
  try {
    const { transcript } = req.body;

    if (!transcript || typeof transcript !== 'string' || transcript.trim().length === 0) {
      return res.status(400).json({ message: 'Transcript is required and must be a non-empty string' });
    }

    const name = extractItemName(transcript);
    const category = detectCategory(transcript);
    const tags = extractTags(transcript);
    const estimatedPrice = estimatePrice(transcript, category);

    if (!name) {
      return res.status(400).json({ message: 'Could not extract item name from transcript' });
    }

    res.json({
      name,
      tags,
      category,
      estimatedPrice: estimatedPrice > 0 ? estimatedPrice : undefined,
    });
  } catch (error) {
    console.error('[voiceController] Error extracting from transcript:', error);
    res.status(500).json({ message: 'Server error processing transcript' });
  }
};
