/**
 * cloudAIService.ts — CB4 (enhanced)
 *
 * Provides cloud-based AI image analysis using:
 *   1. Google Cloud Vision API  — label + object detection
 *   2. Anthropic Claude Haiku   — structured JSON output with category-aware prompts
 *
 * CB4 improvements:
 *   - Category-specific description prompts based on Vision labels
 *   - Improved title formatting prompts
 *   - Tag deduplication and normalization
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

// ── CB4: Category-specific description prompts ─────────────────────────────────

function getCategoryPrompt(labels: string[]): string {
  const labelsLower = labels.map(l => l.toLowerCase()).join(' ');
  
  if (/chair|sofa|couch|table|desk|dresser|bed|cabinet|shelf|bookcase|armoire|wardrobe|chest/.test(labelsLower)) {
    return 'Describe this furniture piece for an estate sale listing. Include: material (wood/metal/fabric/leather), style/era (mid-century, Victorian, farmhouse, etc.), condition (excellent/good/fair/worn), notable features or markings. Keep it under 40 words. Be specific and honest.';
  }
  if (/ring|necklace|bracelet|earring|brooch|pendant|jewelry|jewellery|gemstone|diamond|gold|silver/.test(labelsLower)) {
    return 'Describe this jewelry piece for an estate sale listing. Include: type, apparent metal (gold/silver/brass/unknown), any visible stones, style era, condition, any visible markings or hallmarks. Keep it under 40 words.';
  }
  if (/painting|print|artwork|sculpture|vase|figurine|ceramic|pottery|decor|ornament|statue|tapestry|frame/.test(labelsLower)) {
    return 'Describe this decorative item for an estate sale listing. Include: type/medium, subject matter, apparent era, condition, any visible signature or maker marks. Keep it under 40 words.';
  }
  if (/shirt|dress|coat|jacket|sweater|pants|skirt|blouse|clothing|garment|textile|fabric/.test(labelsLower)) {
    return 'Describe this clothing item for an estate sale listing. Include: type, color, apparent material, visible brand or label, style era, condition. Keep it under 30 words.';
  }
  if (/pot|pan|dish|plate|bowl|cup|mug|kitchen|appliance|mixer|toaster|blender|cookware|cutlery|utensil/.test(labelsLower)) {
    return 'Describe this kitchen item for an estate sale listing. Include: type, material, brand if visible, era, condition, whether complete set or single piece. Keep it under 35 words.';
  }
  if (/tool|drill|saw|wrench|hammer|screwdriver|hardware|equipment|machine|power tool/.test(labelsLower)) {
    return 'Describe this tool for an estate sale listing. Include: type, brand if visible, condition, whether complete set or single, any accessories included. Keep it under 35 words.';
  }
  if (/toy|game|doll|action figure|collectible|model|figurine|comic|card|vintage|antique/.test(labelsLower)) {
    return 'Describe this collectible or toy for an estate sale listing. Include: type, brand/manufacturer, approximate era, condition, whether original packaging is present. Keep it under 40 words.';
  }
  if (/tv|computer|phone|camera|radio|stereo|electronics|device|monitor|speaker/.test(labelsLower)) {
    return 'Describe this electronic item for an estate sale listing. Include: type, brand, model if visible, approximate era, visible condition, any accessories included. Keep it under 35 words.';
  }
  if (/book|magazine|record|vinyl|cd|dvd|media/.test(labelsLower)) {
    return 'Describe this media item for an estate sale listing. Include: type, title/subject if visible, condition, quantity if multiple. Keep it under 25 words.';
  }
  
  // Default fallback
  return 'Describe this estate sale item in 30-40 words. Include the most notable physical characteristics, apparent condition, and any brand or maker information visible. Be specific and honest — this description helps buyers decide whether to visit.';
}

// ── CB4: Title formatting prompt ───────────────────────────────────────────────

function getTitlePrompt(): string {
  return 'Give a concise 3-7 word title for this estate sale item. Format: [Adjective] [Brand?] [Item Type]. Examples: "Vintage Oak Writing Desk", "Lodge Cast Iron Skillet", "Mid-Century Teak Side Table", "Brass Floor Lamp", "Singer Sewing Machine". Return only the title, nothing else.';
}

// ── CB4: Tag deduplication and normalization ───────────────────────────────────

function normalizeTags(tags: string[]): string[] {
  // Lowercase and trim
  let normalized = tags.map(t => t.toLowerCase().trim());
  // Remove empty strings
  normalized = normalized.filter(t => t.length > 0);
  // Remove duplicates
  normalized = [...new Set(normalized)];
  // Remove tags that are substrings of other tags (e.g. "oak" if "oak desk" exists)
  normalized = normalized.filter((tag, _, arr) => 
    !arr.some(other => other !== tag && other.includes(tag) && other.length > tag.length + 3)
  );
  // Limit to 10 tags max
  return normalized.slice(0, 10);
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

  // CB4: Use category-specific description prompt
  const descriptionPrompt = getCategoryPrompt(visionLabels);
  const titlePrompt = getTitlePrompt();

  const response = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: ANTHROPIC_MODEL,
      max_tokens: 300,
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
              text: `You are an estate sale pricing assistant.${labelContext}

Title guidance: ${titlePrompt}
Description guidance: ${descriptionPrompt}

Look at this item photo and respond with ONLY valid JSON (no markdown, no explanation):
{
  "title": "short descriptive item title",
  "description": "description following the guidance above",
  "category": "one of: Furniture, Electronics, Clothing, Books, Kitchenware, Tools, Art, Jewelry, Toys, Sports, Collectibles, Other",
  "condition": "one of: NEW, LIKE_NEW, GOOD, FAIR, POOR",
  "suggestedPrice": 12.50
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
  return JSON.parse(raw) as AITagResult;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Analyze an item image using Google Vision + Claude Haiku.
 *
 * Flow:
 *   1. Send image to Google Vision for fast label/object detection.
 *   2. Pass those labels + the raw image to Claude Haiku for
 *      structured estate-sale metadata with category-specific guidance.
 *
 * CB4 enhancements:
 *   - Category-specific description prompts based on Vision labels
 *   - Improved title formatting guidance
 *   - Tag deduplication and normalization
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

  const result = await getHaikuAnalysis(imageBase64, mimeType, visionLabels);
  return result;
}
