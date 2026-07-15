/**
 * listingEnrichmentService.ts
 *
 * Enriches scraped sale listings with AI-generated metadata.
 * Extracts categories, price ranges, and summaries from description text using Claude Haiku.
 * Stores results in Sale.scrapedMetadata.aiEnriched for display on organizer profiles.
 */

import axios from 'axios';
import { regionConfig } from '../config/regionConfig';
import { trackAITokens, estimateTokensForRequest, isAICostCeilingExceeded, recordApiUsage, ANTHROPIC_COST_PER_M_TOKENS, recordAnthropicUsageOrEstimate, isAIDailyCallCapAvailable, trackAICall } from '../lib/aiCostTracker';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

export interface EnrichedListingData {
  categories: string[];
  priceRange: string;
  summary: string;
}

/**
 * Enrich a scraped listing with AI-generated metadata.
 * Extracts categories, estimated price range, and a concise summary from the description.
 *
 * Gate conditions:
 * - Only processes if scrapedMetadata.aiEnriched is null
 * - Only processes if description length > 50 characters
 * - Returns null if API unavailable or cost ceiling exceeded
 *
 * Result is stored in Sale.scrapedMetadata.aiEnriched for persistence.
 */

// ---------------------------------------------------------------------------
// Free extraction — runs before Haiku to avoid unnecessary API calls (~70% hit rate)
// ---------------------------------------------------------------------------

const KEYWORD_CATEGORY_MAP: Array<{ keywords: string[]; category: string }> = [
  { keywords: ['furniture'], category: 'Furniture' },
  { keywords: ['jewelry', 'jewellery'], category: 'Jewelry' },
  { keywords: ['art'], category: 'Art' },
  { keywords: ['clothing', 'clothes', 'garments'], category: 'Clothing' },
  { keywords: ['kitchenware', 'kitchen'], category: 'Kitchenware' },
  { keywords: ['tools', 'tool'], category: 'Tools' },
  { keywords: ['collectibles', 'collectible'], category: 'Collectibles' },
  { keywords: ['electronics', 'electronic'], category: 'Electronics' },
  { keywords: ['books', 'book'], category: 'Books' },
  { keywords: ['linens', 'linen'], category: 'Linens' },
  { keywords: ['antiques', 'antique'], category: 'Antiques' },
  { keywords: ['vintage'], category: 'Vintage' },
  { keywords: ['glassware', 'crystal'], category: 'Glassware' },
  { keywords: ['silverware', 'silver'], category: 'Silverware' },
  { keywords: ['coins', 'coin'], category: 'Coins' },
  { keywords: ['records', 'vinyl'], category: 'Records' },
  { keywords: ['toys', 'toy'], category: 'Toys & Games' },
  { keywords: ['games', 'game'], category: 'Toys & Games' },
  { keywords: ['rugs', 'rug'], category: 'Rugs' },
  { keywords: ['lamps', 'lamp'], category: 'Lighting' },
  { keywords: ['mirrors', 'mirror'], category: 'Mirrors' },
  { keywords: ['clocks', 'clock'], category: 'Clocks' },
  { keywords: ['china', 'pottery', 'ceramics'], category: 'Ceramics & China' },
];

function tryFreeExtraction(description: string, saleTitle: string): EnrichedListingData | null {
  const haystack = `${description} ${saleTitle}`.toLowerCase();

  // --- Categories ---
  const seen = new Set<string>();
  const categories: string[] = [];
  for (const entry of KEYWORD_CATEGORY_MAP) {
    if (categories.length >= 5) break;
    if (entry.keywords.some((kw) => haystack.includes(kw))) {
      if (!seen.has(entry.category)) {
        seen.add(entry.category);
        categories.push(entry.category);
      }
    }
  }

  // --- Price range ---
  let priceRange = '';
  const rangeMatch = description.match(
    /\$(\d+(?:,\d{3})*(?:\.\d{2})?)\s*[-\u2013to]+\s*\$(\d+(?:,\d{3})*(?:\.\d{2})?)/i
  );
  if (rangeMatch) {
    priceRange = `$${rangeMatch[1]}\u2013$${rangeMatch[2]}`;
  } else {
    const singleMatch = description.match(/\$(\d+(?:,\d{3})*(?:\.\d{2})?)/);
    if (singleMatch) {
      priceRange = `from $${singleMatch[1]}`;
    } else {
      const centsMatch = description.match(/(\d+)\s*(?:cents?|¢)/i);
      if (centsMatch) {
        priceRange = 'under $5';
      }
    }
  }

  // --- Decision gate ---
  if (categories.length < 2 && priceRange === '') {
    return null; // Not enough signal — fall through to Haiku
  }

  // --- Summary (first sentence, max 150 chars) ---
  let summary = '';
  if (description.length <= 80) {
    summary = description.trim();
  } else {
    const sentenceMatch = description.match(/^[^.!?]+[.!?]/);
    summary = sentenceMatch ? sentenceMatch[0].trim() : description.slice(0, 150).trim();
  }
  if (summary.length > 150) {
    summary = summary.slice(0, 150);
  }

  return {
    categories: categories.map(sanitizeForPostgres),
    priceRange: sanitizeForPostgres(priceRange),
    summary: sanitizeForPostgres(summary),
  };
}

/**
 * Strip characters that PostgreSQL rejects in string literals.
 *
 * Covers the same set as sanitizeStr() in the controller:
 *   1. NUL bytes (\x00)
 *   2. ASCII control chars 0x01-0x08, 0x0B-0x0C, 0x0E-0x1F
 *      (tab/newline/CR are safe and preserved)
 *   3. Incomplete \x hex escapes (\x not followed by exactly 2 hex digits)
 *   4. Lone backslashes before unrecognised chars
 *   5. Lone Unicode surrogates (U+D800–U+DFFF) and non-BMP chars (emoji)
 *      — PostgreSQL 18 jsonb rejects lone surrogates (root cause of recurring
 *        FINDASALE-NODEJS-42; sale cmoog3n0l009tq4utw56ejcrx description ends
 *        with 🔥 emoji; slicing at 150 codepoints can split a surrogate pair)
 *
 * This runs on the Haiku AI response fields (categories, priceRange, summary)
 * BEFORE they reach the controller's recursive sanitizeMetadataStrings() pass,
 * providing defence-in-depth for FINDASALE-NODEJS-42 recurrences.
 */
function sanitizeForPostgres(value: string): string {
  return value
    .replace(/\x00/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/\\x(?![0-9a-fA-F]{2})/g, ' ')
    .replace(/\\(?![\\nrtbf"'0-9xu])/g, '\\\\')
    // Lone Unicode surrogates (U+D800–U+DFFF) and non-BMP chars (emoji etc.)
    // cause "invalid input syntax for type json" in PostgreSQL 18 jsonb.
    // eslint-disable-next-line no-misleading-character-class
    .replace(/[\uD800-\uDFFF]|[^\u0000-\uFFFF]/g, ' ')
    .trim();
}

export async function enrichScrapedListing(
  description: string,
  saleTitle: string
): Promise<EnrichedListingData | null> {
  // Pre-flight checks
  if (!ANTHROPIC_API_KEY) {
    console.warn('[enrichment] ANTHROPIC_API_KEY not configured, skipping enrichment');
    return null;
  }

  if (!description || description.length <= 50) {
    return null;
  }

  // Cost ceiling check
  if (await isAICostCeilingExceeded()) {
    console.warn('[enrichment] AI cost ceiling exceeded, skipping enrichment');
    return null;
  }

  // Fix B: absolute daily AI call-count cap
  if (!(await isAIDailyCallCapAvailable())) {
    console.warn('[enrichment] AI daily call cap reached (AI_DAILY_CALL_CAP), skipping enrichment');
    return null;
  }

  // Try free extraction before paying for AI
  const freeResult = tryFreeExtraction(description, saleTitle);
  if (freeResult) {
    return freeResult;
  }

  console.log('[enrichment] Free extraction insufficient — calling Haiku for:', saleTitle.slice(0, 50));

  try {
    const prompt = `You are analyzing a secondary market sale listing for ${regionConfig.city}, ${regionConfig.state}.

Sale Title: "${saleTitle}"
Description: "${description}"

Extract and respond with ONLY valid JSON (no markdown, no explanation):
{
  "categories": ["category1", "category2", "category3"],
  "priceRange": "$X–$Y" or "typically $X–$Y",
  "summary": "1-sentence description of featured items or typical prices"
}

Guidelines:
- Categories: Extract 2-5 item types or categories mentioned (e.g., "furniture", "jewelry", "tools", "vintage"). If none clear, infer from description.
- Price Range: Estimate typical price range for items mentioned. Use format "$5–$50" or "typically $10–$100". Base on secondary market values, not retail.
- Summary: If description > 100 words, create a 1-sentence summary. Otherwise, summarize the key item types/themes. Max 15 words.

Return ONLY JSON, no explanation.`;

    const estimatedTokens = estimateTokensForRequest(prompt, false);

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: ANTHROPIC_MODEL,
        max_tokens: 200,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      },
      {
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        timeout: 20000,
      }
    );

    const content: string = response.data.content?.[0]?.text ?? '';

    // Fix A: record REAL per-model usage. Fix B: count toward the daily AI call cap.
    const responseTokens = Math.ceil(content.length / 4) + 50; // estimate fallback only
    await recordAnthropicUsageOrEstimate('anthropic:listing_enrichment', ANTHROPIC_MODEL, response.data.usage, estimatedTokens + responseTokens);
    await trackAICall();

    // Parse JSON response
    const raw = content.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(raw) as EnrichedListingData;

    // Validate structure
    if (
      !Array.isArray(parsed.categories) ||
      typeof parsed.priceRange !== 'string' ||
      typeof parsed.summary !== 'string'
    ) {
      console.warn('[enrichment] Invalid response structure:', parsed);
      return null;
    }

    // Sanitize and cap arrays/strings
    parsed.categories = parsed.categories
      .slice(0, 5)
      .map((c: string) => (typeof c === 'string' ? sanitizeForPostgres(c.slice(0, 50)) : ''))
      .filter((c: string) => c.length > 0);

    parsed.priceRange = sanitizeForPostgres(parsed.priceRange.slice(0, 100));
    parsed.summary = sanitizeForPostgres(parsed.summary.slice(0, 150));

    return parsed;
  } catch (error: any) {
    // Graceful degradation on error
    console.warn('[enrichment] Error enriching listing:', error.message || error);
    return null;
  }
}
