/**
 * listingEnrichmentService.ts
 *
 * Enriches scraped sale listings with AI-generated metadata.
 * Extracts categories, price ranges, and summaries from description text using Claude Haiku.
 * Stores results in Sale.scrapedMetadata.aiEnriched for display on organizer profiles.
 */

import axios from 'axios';
import { regionConfig } from '../config/regionConfig';
import { trackAITokens, estimateTokensForRequest, isAICostCeilingExceeded } from '../lib/aiCostTracker';

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

    // Track token usage for cost ceiling
    const responseTokens = Math.ceil(content.length / 4) + 50;
    await trackAITokens(estimatedTokens + responseTokens);

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
      .map((c: string) => (typeof c === 'string' ? c.slice(0, 50) : ''))
      .filter((c: string) => c.length > 0);

    parsed.priceRange = parsed.priceRange.slice(0, 100);
    parsed.summary = parsed.summary.slice(0, 150);

    return parsed;
  } catch (error: any) {
    // Graceful degradation on error
    console.warn('[enrichment] Error enriching listing:', error.message || error);
    return null;
  }
}
