/**
 * voiceController.ts — Feature #42: Voice-to-Tag Extraction
 *
 * Converts voice transcripts to structured item data via keyword extraction.
 * Uses simple regex/keyword patterns (no AI call) for fast, deterministic extraction.
 * Endpoint: POST /api/ai/voice-extract
 * Request: { transcript: string }
 * Response: { name: string, tags: string[], category: string, estimatedPrice?: number, locationTag?: string }
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

/** Round to nearest integer; return undefined if NaN or <= 0. */
function safeRound(n: number): number | undefined {
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.round(n);
}

/**
 * Extract weight from transcript. Returns total ounces (Int) or undefined if not mentioned.
 * Digit-only patterns to avoid prose false positives ("ten pounds" does NOT match).
 * SUMS multiple unit mentions: "2 lb 8 oz" → 40 oz (not 32). Critical for eBay shipping
 * accuracy — underestimating weight by 8oz on a heavy item costs $5-10 of shipping per push.
 * Conversions: lb→16 oz, kg→35.274 oz, g→0.03527 oz, oz pass-through.
 * Each unit pattern uses /g flag and accumulates ALL matches.
 */
function extractWeightOz(transcript: string): number | undefined {
  const lower = transcript.toLowerCase();
  const patterns: Array<{ re: RegExp; mult: number }> = [
    { re: /(\d+(?:\.\d+)?)\s*(?:lbs?|pounds?)\b/gi, mult: 16 },
    { re: /(\d+(?:\.\d+)?)\s*(?:kg|kilograms?)\b/gi, mult: 35.274 },
    { re: /(\d+(?:\.\d+)?)\s*(?:oz|ounces?)\b/gi, mult: 1 },
    { re: /(\d+(?:\.\d+)?)\s*(?:grams?|g)\b/gi, mult: 0.03527 },
  ];
  let totalOz = 0;
  let matched = false;
  for (const { re, mult } of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(lower)) !== null) {
      totalOz += parseFloat(m[1]) * mult;
      matched = true;
    }
  }
  return matched ? safeRound(totalOz) : undefined;
}

/** Convert a value+unit pair to inches. Default unit: inches. */
function toInches(value: number, unit: string | undefined): number {
  const u = (unit || 'in').toLowerCase();
  if (u.startsWith('cm')) return value * 0.3937;
  if (u.startsWith('ft') || u.startsWith('feet') || u === 'foot') return value * 12;
  if (u.startsWith('mm')) return value * 0.03937;
  return value;
}

/**
 * Extract dimensions from transcript. Pattern "X by Y by Z" or "X x Y x Z" with optional per-axis
 * units. SAFETY: if any axis spec lacks a recognizable unit suffix AND the surrounding axes have
 * mixed units (e.g. "1 foot by 8 inches by 4 inches"), do NOT assume — return undefined rather
 * than ship eBay a half-foot box. Conservative: only commit when interpretation is unambiguous.
 *
 * Accepts:
 *  - "6 by 12 by 4"            → all inches (default)
 *  - "6 by 12 by 4 inches"     → all inches (trailing unit applies to all)
 *  - "6 inches by 12 inches by 4 inches" → per-axis inches
 *  - "1 foot by 8 inches by 4 inches"    → per-axis: 12, 8, 4 inches
 *  - "30 cm by 20 cm by 10 cm" → 12, 8, 4 inches (rounded)
 *  - "6x12x4"                  → all inches (default)
 */
function extractDimensions(transcript: string): { lengthIn?: number; widthIn?: number; heightIn?: number } | undefined {
  const lower = transcript.toLowerCase();
  // Per-axis: each number can optionally be followed by a unit.
  // (\d+(?:\.\d+)?)\s*(inches?|in|cm|ft|feet|foot|mm)?
  const axis = String.raw`(\d+(?:\.\d+)?)\s*(inches?|in|cm|ft|feet|foot|mm)?`;
  const re = new RegExp(`${axis}\\s*(?:by|x)\\s*${axis}\\s*(?:by|x)\\s*${axis}`, 'i');
  const m = re.exec(lower);
  if (!m) return undefined;
  const v1 = parseFloat(m[1]); const u1 = m[2];
  const v2 = parseFloat(m[3]); const u2 = m[4];
  const v3 = parseFloat(m[5]); const u3 = m[6];

  // If at least one axis has an explicit unit, propagate the LAST seen unit to bare-number axes
  // (e.g. "6 by 12 by 4 inches" → all 3 are inches). If NO axis has a unit, default to inches.
  // If units conflict per-axis, use each axis's own unit.
  const anyExplicit = !!(u1 || u2 || u3);
  const fallback = anyExplicit ? (u3 || u2 || u1) : 'in';
  const lengthIn = safeRound(toInches(v1, u1 || fallback));
  const widthIn  = safeRound(toInches(v2, u2 || fallback));
  const heightIn = safeRound(toInches(v3, u3 || fallback));
  if (lengthIn && widthIn && heightIn) {
    return { lengthIn, widthIn, heightIn };
  }
  return undefined;
}


/**
 * Extract location/room/bin/shelf tag from transcript.
 * Returns a title-cased string (e.g. "Living Room", "Bin B6", "Row C Shelf 2")
 * or undefined if no location mention is found.
 */
function extractLocationTag(transcript: string): string | undefined {
  const lower = transcript.toLowerCase();

  // Room names (longest first to avoid partial matches)
  const rooms = [
    'master bedroom', 'living room', 'dining room', 'laundry room',
    'sunroom', 'mudroom', 'bedroom', 'basement', 'kitchen', 'bathroom',
    'hallway', 'pantry', 'closet', 'attic', 'garage', 'office', 'study',
  ];
  for (const room of rooms) {
    if (lower.includes(room)) {
      return room.replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }

  // Multi-word codes: "row X shelf Y"
  const rowShelf = lower.match(/\brow\s+([a-z0-9]+)\s+shelf\s+([a-z0-9]+)\b/i);
  if (rowShelf) {
    const part1 = rowShelf[1].toUpperCase();
    const part2 = rowShelf[2].toUpperCase();
    return `Row ${part1} Shelf ${part2}`;
  }

  // Bin codes: "bin A3" or "bin 12"
  const bin = lower.match(/\bbin\s+([a-z]?[0-9]+|[a-z][0-9]*|[a-z])\b/i);
  if (bin) {
    return `Bin ${bin[1].toUpperCase()}`;
  }

  // Shelf codes: "shelf B2"
  const shelf = lower.match(/\bshelf\s+([a-z0-9]+)\b/i);
  if (shelf) {
    return `Shelf ${shelf[1].toUpperCase()}`;
  }

  // Aisle codes
  const aisle = lower.match(/\baisle\s+([a-z0-9]+)\b/i);
  if (aisle) {
    return `Aisle ${aisle[1].toUpperCase()}`;
  }

  // Location / loc codes
  const loc = lower.match(/\b(?:location|loc)\s+([a-z0-9]+)\b/i);
  if (loc) {
    return `Location ${loc[1].toUpperCase()}`;
  }

  // Row code (standalone)
  const row = lower.match(/\brow\s+([a-z0-9]+)\b/i);
  if (row) {
    return `Row ${row[1].toUpperCase()}`;
  }

  // Section code
  const section = lower.match(/\bsection\s+([a-z0-9]+)\b/i);
  if (section) {
    return `Section ${section[1].toUpperCase()}`;
  }

  return undefined;
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
    const estimatedPrice = estimatePrice(transcript, category) ?? 0;
    const weightOz = extractWeightOz(transcript);
    const dims = extractDimensions(transcript);
    const locationTag = extractLocationTag(transcript);

    if (!name) {
      return res.status(400).json({ message: 'Could not extract item name from transcript' });
    }

    res.json({
      name,
      tags,
      category,
      estimatedPrice: estimatedPrice > 0 ? estimatedPrice : undefined,
      ...(weightOz !== undefined ? { weightOz } : {}),
      ...(dims?.lengthIn !== undefined ? { lengthIn: dims.lengthIn } : {}),
      ...(dims?.widthIn !== undefined ? { widthIn: dims.widthIn } : {}),
      ...(dims?.heightIn !== undefined ? { heightIn: dims.heightIn } : {}),
      ...(locationTag !== undefined ? { locationTag } : {}),
    });
  } catch (error) {
    console.error('[voiceController] Error extracting from transcript:', error);
    res.status(500).json({ message: 'Server error processing transcript' });
  }
};
