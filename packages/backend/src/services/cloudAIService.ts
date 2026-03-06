/**
 * cloudAIService.ts — CB1
 *
 * Provides cloud-based AI image analysis using:
 *   1. Google Cloud Vision API  — label + object detection
 *   2. Anthropic Claude Haiku   — structured JSON output
 *
 * Exported as a drop-in replacement for Ollama analysis.
 * Returns null when cloud AI env vars are missing so the caller
 * can fall back to Ollama gracefully.
 */

import axios from 'axios';

const GOOGLE_VISION_API_KEY = process.env.GOOGLE_VISION_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

export interface AITagResult {
  title: string;
  description: string;
  category: string;
  condition: string;
  suggestedPrice: number;
  tags: string[];
}

// ── CB4: In-memory feedback stats (post-beta: migrate to DB table) ─────────────
interface FeedbackRecord {
  accepted: number;
  dismissed: number;
  edited: number;
}
const feedbackStats: Record<string, FeedbackRecord> = {};

/** Record organizer feedback on an AI suggestion field. */
export function recordAIFeedback(field: string, action: 'accepted' | 'dismissed' | 'edited'): void {
  if (!feedbackStats[field]) {
    feedbackStats[field] = { accepted: 0, dismissed: 0, edited: 0 };
  }
  feedbackStats[field][action]++;
}

/** Return current acceptance rates per field (for diagnostic logging). */
export function getAIFeedbackStats(): Record<string, FeedbackRecord & { acceptRate: string }> {
  const result: Record<string, FeedbackRecord & { acceptRate: string }> = {};
  for (const [field, stats] of Object.entries(feedbackStats)) {
    const total = stats.accepted + stats.dismissed + stats.edited;
    result[field] = {
      ...stats,
      acceptRate: total > 0 ? `${Math.round((stats.accepted / total) * 100)}%` : 'n/a',
    };
  }
  return result;
}

/** Returns true when both API keys are present in the environment. */
export function isCloudAIAvailable(): boolean {
  return !!(GOOGLE_VISION_API_KEY && ANTHROPIC_API_KEY);
}

// ── Step 1: Google Vision label extraction ────────────────────────────────────

async function getVisionLabels(imageBase64: string): Promise<string[]> {
  const response = await axios.post(
    `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`,
    {
      requests: [
        {
          image: { content: imageBase64 },
          features: [
            { type: 'LABEL_DETECTION', maxResults: 15 },
            { type: 'OBJECT_LOCALIZATION', maxResults: 10 },
          ],
        },
      ],
    },
    { timeout: 15000 }
  );

  const annotations = response.data.responses?.[0];
  const labels: string[] = (annotations?.labelAnnotations ?? []).map((l: any) => l.description);
  const objects: string[] = (annotations?.localizedObjectAnnotations ?? []).map((o: any) => o.name);

  // Objects first (more specific), then labels — deduplicated
  const combined = [...new Set([...objects, ...labels])];
  return combined.slice(0, 15);
}

// ── Step 2: Claude Haiku structured analysis ──────────────────────────────────

async function getHaikuAnalysis(
  imageBase64: string,
  mimeType: string,
  visionLabels: string[]
): Promise<AITagResult> {
  const labelContext =
    visionLabels.length > 0
      ? `\n\nVision API detected these objects/labels: ${visionLabels.join(', ')}.`
      : '';

  const response = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: ANTHROPIC_MODEL,
      max_tokens: 400,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                data: imageBase64,
              },
            },
            {
              type: 'text',
              text: `You are an expert estate sale cataloger for a Grand Rapids, Michigan marketplace.${labelContext}

Analyze this item photo and respond with ONLY valid JSON (no markdown, no explanation).

Title guidelines: Be specific. Include material, era, or maker if visible. Examples: "Vintage Brass Floor Lamp", "Oak Dining Chair Set", "McCoy Pottery Planter".
Description: 1–2 sentences. Note condition details and standout features. Mention any maker marks, damage, or signs of age.
Category: Pick the single best fit from: Furniture, Electronics, Clothing, Books, Kitchenware, Tools, Art, Jewelry, Toys, Sports, Collectibles, Glassware, Linens, Other.
Condition: NEW = unused with tags. LIKE_NEW = minimal wear. GOOD = normal use, no damage. FAIR = noticeable wear/scratches. POOR = damaged but functional.
Price: Realistic Grand Rapids estate sale price (typically 20–50% of retail). Consider condition heavily.
Tags: 3–6 short tags collectors search for. Examples: "Mid-Century Modern", "Vintage", "Cast Iron", "Hand-painted", "Art Deco", "Set of 4".

{
  "title": "short specific title",
  "description": "1-2 sentence description with condition details",
  "category": "best matching category",
  "condition": "NEW | LIKE_NEW | GOOD | FAIR | POOR",
  "suggestedPrice": 12.50,
  "tags": ["Tag1", "Tag2", "Tag3"]
}`,
            },
          ],
        },
      ],
    },
    {
      headers: {
        'x-api-key': ANTHROPIC_API_KEY as string,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      timeout: 30000,
    }
  );

  const content: string = response.data.content?.[0]?.text ?? '';
  const raw = content.replace(/```json\n?|\n?```/g, '').trim();
  const parsed = JSON.parse(raw) as AITagResult;
  // Ensure tags is always an array even if Haiku omits the field
  if (!Array.isArray(parsed.tags)) {
    parsed.tags = [];
  }
  return parsed;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Analyze an item image using Google Vision + Claude Haiku.
 *
 * Flow:
 *   1. Send image to Google Vision for fast label/object detection.
 *   2. Pass those labels + the raw image to Claude Haiku for
 *      structured estate-sale metadata.
 *
 * Returns null if cloud AI is not configured (caller should fall back to Ollama).
 * Throws on API errors so the caller can handle/log them.
 */
export async function analyzeItemImage(
  buffer: Buffer,
  mimeType = 'image/jpeg'
): Promise<AITagResult | null> {
  if (!isCloudAIAvailable()) return null;

  const imageBase64 = buffer.toString('base64');

  // Vision labels are best-effort — proceed without them if Vision API fails
  let visionLabels: string[] = [];
  try {
    visionLabels = await getVisionLabels(imageBase64);
  } catch {
    // Vision API unavailable or quota exceeded — Haiku will analyse image alone
  }

  return getHaikuAnalysis(imageBase64, mimeType, visionLabels);
}

// ── Price Suggestion API ──────────────────────────────────────────────────────

export interface PriceSuggestion {
  low: number;
  high: number;
  suggested: number;
  reasoning: string;
}

/**
 * Suggest a price range for an item based on title, category, and condition.
 * Uses Claude Haiku with estate sale pricing expertise.
 *
 * Returns a fallback price if parsing fails or API is unavailable.
 */
export async function suggestPrice(
  title: string,
  category: string,
  condition: string
): Promise<PriceSuggestion> {
  if (!ANTHROPIC_API_KEY) {
    return {
      low: 1,
      high: 50,
      suggested: 10,
      reasoning: 'Manual pricing recommended (AI service unavailable)',
    };
  }

  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: ANTHROPIC_MODEL,
        max_tokens: 200,
        messages: [
          {
            role: 'user',
            content: `You are an estate sale pricing expert. Based on typical Grand Rapids, Michigan estate sale prices, suggest a fair price for this item.

Item: ${title}
Category: ${category}
Condition: ${condition}

Respond with ONLY valid JSON in this exact format:
{"low": 5, "high": 25, "suggested": 15, "reasoning": "Similar vintage items sell for $10-25 at local estate sales"}

Be realistic and conservative — estate sale prices are typically 20-50% of retail. Condition heavily affects value.`,
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
    const raw = content.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(raw) as PriceSuggestion;

    // Validate parsed response
    if (
      typeof parsed.low === 'number' &&
      typeof parsed.high === 'number' &&
      typeof parsed.suggested === 'number' &&
      typeof parsed.reasoning === 'string'
    ) {
      return parsed;
    }

    return {
      low: 1,
      high: 50,
      suggested: 10,
      reasoning: 'Manual pricing recommended (invalid response format)',
    };
  } catch (error) {
    // Log error but return fallback gracefully
    console.error('Price suggestion API error:', error);
    return {
      low: 1,
      high: 50,
      suggested: 10,
      reasoning: 'Manual pricing recommended (API error)',
    };
  }
}
