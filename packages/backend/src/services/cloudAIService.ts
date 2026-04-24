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
import { regionConfig } from '../config/regionConfig';
import { trackAITokens, estimateTokensForRequest, isAICostCeilingExceeded } from '../lib/aiCostTracker';

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
  confidence?: number; // Camera Workflow v2: AI confidence score (0.0–1.0), defaults to 0.5
  suggestedTags?: string[]; // Sprint 1: Curated tags suggested by Haiku from Vision labels
  suggestedConditionGrade?: string; // #64: AI-suggested condition grade (S|A|B|C|D)
  photoOrderIndices?: number[]; // Enhancement 2: Best-photo-first sorting — reordered photo indices by Vision quality
}

/** Photo with its computed quality score for best-photo-first sorting */
interface PhotoWithScore {
  index: number;
  buffer: Buffer;
  mimeType: string;
  qualityScore: number;
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

/** Returns true when the Anthropic API key is present (sufficient for text-only AI features). */
export function isAnthropicAvailable(): boolean {
  return !!ANTHROPIC_API_KEY;
}

// ── Step 1: Google Vision label extraction ────────────────────────────────────

export async function getVisionLabels(imageBase64: string): Promise<string[]> {
  try {
    const response = await axios.post(
      `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`,
      {
        requests: [
          {
            image: { content: imageBase64 },
            features: [
              { type: 'LABEL_DETECTION', maxResults: 15 },
              { type: 'OBJECT_LOCALIZATION', maxResults: 10 },
              { type: 'TEXT_DETECTION', maxResults: 10 }, // Catches brand marks, embossed text, etched labels on glass/dark items
            ],
          },
        ],
      },
      { timeout: 15000 }
    );

    const annotations = response.data.responses?.[0];
    const labels: string[] = (annotations?.labelAnnotations ?? []).map((l: any) => l.description);
    const objects: string[] = (annotations?.localizedObjectAnnotations ?? []).map((o: any) => o.name);
    // TEXT_DETECTION returns a single block with all text, plus individual word annotations
    const textAnnotations: any[] = annotations?.textAnnotations ?? [];
    const detectedTexts: string[] = textAnnotations
      .slice(0, 5) // first entry is the full combined text block — skip it, use individual words
      .map((t: any) => t.description?.trim())
      .filter((t: string) => t && t.length > 1 && t.length < 40); // skip single chars and long strings

    // Objects first (more specific), then labels, then detected text — deduplicated
    const combined = [...new Set([...objects, ...labels, ...detectedTexts])];
    return combined.slice(0, 18);
  } catch (error: any) {
    // Feature #109: Graceful degradation — return empty labels on Vision API failure
    console.warn('[cloudAIService] Google Vision API error:', error.message || error);
    return [];
  }
}

// ── Step 2: Claude Haiku structured analysis ──────────────────────────────────

async function getHaikuAnalysis(
  imageBase64: string,
  mimeType: string,
  visionLabels: string[],
  comps?: ComparableSale[]
): Promise<AITagResult> {
  const labelContext =
    visionLabels.length > 0
      ? `\n\nVision API detected these objects/labels: ${visionLabels.join(', ')}.`
      : '';

  // Sparse-label fallback: if Vision returned very few/generic results, help Haiku reason visually
  const GENERIC_LABELS = new Set(['glass', 'black', 'darkness', 'white', 'transparent', 'product', 'still life', 'object']);
  const specificLabels = visionLabels.filter(l => !GENERIC_LABELS.has(l.toLowerCase()));
  const sparseImageNote = specificLabels.length < 3
    ? '\n\nNote: The image may contain a dark-colored or transparent/reflective item. Identify the object by its silhouette, shape, proportions, and any visible text, markings, or contextual clues rather than surface color or material appearance.'
    : '';

  const compsContext = comps && comps.length > 0
    ? `\n\nRecent comparable sales for this category: ${comps.map(c => `"${c.title}" sold for $${c.price}`).join('; ')}. Use these as your primary pricing reference.`
    : '';

  try {
    // Estimate tokens for cost tracking (#104)
    const systemPrompt = `You are an expert secondary market cataloger for a ${regionConfig.city}, ${regionConfig.state} estate sale marketplace.${labelContext}

Analyze this item photo and respond with ONLY valid JSON (no markdown, no explanation).`;
    const estimatedTokens = estimateTokensForRequest(systemPrompt, true);

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
                text: `You are an expert secondary market cataloger for a ${regionConfig.city}, ${regionConfig.state} estate sale marketplace.${labelContext}${sparseImageNote}${compsContext}

Analyze this item photo and respond with ONLY valid JSON (no markdown, no explanation).

Title guidelines: Start with the most recognizable/searchable keyword. Format: "[Type], [Material or Era], [Maker or Style if visible]". Examples: "Brass Floor Lamp, Art Deco Style", "Oak Dining Chair Set, Mid-Century Modern", "McCoy Pottery Planter, Green Drip Glaze", "Cast Iron Skillet, Lodge 10-inch". Include decade if identifiable (1950s, 1960s, Victorian). Avoid vague words like "Beautiful" or "Nice".
Description: 1–2 sentences. Lead with searchable keywords buyers use on Google or eBay. Mention material, maker/brand (if visible), era/decade, and standout features. Example: "Solid oak mid-century modern dresser with original brass hardware, circa 1960s. Six drawers, minor surface scratches, no structural damage." Note any maker marks, chips, cracks, or signs of age.
Category: Pick the single best fit from: Furniture, Electronics, Clothing, Books, Kitchenware, Tools, Art, Jewelry, Toys, Sports, Collectibles, Glassware, Linens, Other.
Condition: NEW = unused with tags. USED = minimal to normal wear. REFURBISHED = restored/refurbished by seller. PARTS_OR_REPAIR = damaged, functional only for parts/repair.
Price: Suggest a realistic secondary market price for this item. Do not use retail pricing as a baseline — derive the price from what similar items actually sell for. If comparable sales are provided above, anchor to those. Do not default to round numbers like $5, $10, $20, $25, $50 — derive a specific price from the item's actual characteristics.
Tags: 5–8 short search terms buyers type on Google or eBay. Prioritize: material (Cast Iron, Solid Oak, Sterling Silver, Brass, Copper), era (Mid-Century Modern, Victorian, Art Deco, 1950s, 1960s, Antique, Vintage), maker/brand (McCoy, Pyrex, Fiestaware, Depression Glass) if identifiable, and style (Farmhouse, Industrial, Bohemian). Always include "Vintage" or "Antique" when applicable. Examples: "Mid-Century Modern", "Solid Oak", "Cast Iron", "Hand-painted", "Art Deco", "1960s", "McCoy Pottery", "Set of 4".
Confidence: REQUIRED FIELD. Rate your confidence in this identification from 0.0 to 1.0. Use 0.9+ only when item, brand/maker, and era are clearly identifiable. Use 0.7–0.89 when item type is clear but details are uncertain. Use 0.5–0.69 when image is unclear or item is generic. Use below 0.5 when you cannot identify the item. Always include a confidence number.

{
  "title": "short specific title",
  "description": "1-2 sentence description with condition details",
  "category": "best matching category",
  "condition": "NEW | USED | REFURBISHED | PARTS_OR_REPAIR",
  "suggestedConditionGrade": "A | B | C | D | F",
  "suggestedPrice": 12.50,
  "tags": ["Tag1", "Tag2", "Tag3"],
  "confidence": 0.85
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

    // Track token usage for cost ceiling (#104)
    const responseTokens = Math.ceil(content.length / 4) + 50; // rough estimate
    trackAITokens(estimatedTokens + responseTokens);

    const raw = content.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(raw) as AITagResult;
    // Ensure tags is always an array even if Haiku omits the field
    if (!Array.isArray(parsed.tags)) {
      parsed.tags = [];
    }
    // Camera Workflow v2: Ensure confidence is always present (fallback if model doesn't return it)
    if (!parsed.confidence) {
      // Derive confidence from field completeness when model doesn't self-report
      const fieldCount = [parsed.title, parsed.description, parsed.category, parsed.condition, parsed.suggestedPrice]
        .filter(f => f != null && f !== '').length;
      parsed.confidence = 0.4 + (fieldCount / 5) * 0.4; // 0.4–0.8 range based on completeness
    }
    return parsed;
  } catch (error: any) {
    // P0-3: Capture specific error context and re-throw with context for caller
    if (error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET') {
      const err = new Error('AI_TIMEOUT: AI service connection failed');
      (err as any).errorCode = 'AI_TIMEOUT';
      throw err;
    }
    if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
      const err = new Error('AI_TIMEOUT: AI service timed out');
      (err as any).errorCode = 'AI_TIMEOUT';
      throw err;
    }
    if (error.response?.status === 429) {
      const err = new Error('AI_RATE_LIMIT: AI service busy — try again shortly');
      (err as any).errorCode = 'AI_RATE_LIMIT';
      throw err;
    }
    if (error instanceof SyntaxError || error.message?.includes('JSON')) {
      const err = new Error('AI_PARSE_ERROR: AI returned invalid data');
      (err as any).errorCode = 'AI_PARSE_ERROR';
      throw err;
    }
    const err = new Error('AI_ERROR: AI analysis unavailable');
    (err as any).errorCode = 'AI_ERROR';
    throw err;
  }
}

// ── Step 3: Haiku curated tag suggestion from Vision labels ─────────────────

async function suggestCuratedTags(visionLabels: string[]): Promise<string[]> {
  // Sprint 1: Map Vision labels → curated tags via Haiku
  const { CURATED_TAGS } = require('../../shared/src/constants/tagVocabulary');

  if (!visionLabels || visionLabels.length === 0) {
    return [];
  }

  try {
    const curatedTagsList = CURATED_TAGS.join(', ');
    const prompt = `Given these visual labels from an image: ${visionLabels.join(', ')}

Suggest up to 5 tags from this curated vocabulary that are visually evident in the image:
${curatedTagsList}

Return ONLY a JSON array of tags, no explanation. Example: ["mid-century-modern", "walnut", "hand-painted"]`;

    // Estimate tokens for cost tracking (#104)
    const estimatedTokens = estimateTokensForRequest(prompt, false);

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: ANTHROPIC_MODEL,
        max_tokens: 100,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      },
      {
        headers: {
          'x-api-key': ANTHROPIC_API_KEY as string,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        timeout: 15000,
      }
    );

    const content: string = response.data.content?.[0]?.text ?? '';

    // Track token usage for cost ceiling (#104)
    const responseTokens = Math.ceil(content.length / 4) + 25;
    trackAITokens(estimatedTokens + responseTokens);

    const raw = content.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(raw) as string[];

    // Return max 5 tags, all valid curated tags
    if (Array.isArray(parsed)) {
      return parsed
        .filter(tag => CURATED_TAGS.includes(tag))
        .slice(0, 5);
    }
    return [];
  } catch {
    // Tag suggestion is best-effort — return empty array on error (non-blocking)
    return [];
  }
}

/**
 * #64: Suggest a condition grade based on image analysis.
 * Returns one of: S | A | B | C | D
 * - S: Like new / pristine, no visible wear
 * - A: Excellent, minor traces of use
 * - B: Good, some wear but fully functional
 * - C: Fair, visible wear or minor damage
 * - D: Poor, significant damage or for parts
 */
async function suggestConditionGrade(imageBase64: string, mimeType: string): Promise<string> {
  if (!ANTHROPIC_API_KEY) {
    return 'B'; // Default to 'Good' if no API key
  }

  try {
    const prompt = `Assess the condition of the item in this photo and suggest a single grade:`;
    // Estimate tokens for cost tracking (#104)
    const estimatedTokens = estimateTokensForRequest(prompt, true);

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: ANTHROPIC_MODEL,
        max_tokens: 50,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mimeType,
                  data: imageBase64,
                },
              },
              {
                type: 'text',
                text: `Assess the physical condition of this item from the photo. Look specifically for:
- Scratches, scuffs, or surface marks
- Chips, cracks, or breaks (especially on ceramics, glass, edges)
- Fading, discoloration, or staining
- Rust, tarnish, or oxidation
- Missing parts, broken hardware, or structural damage
- Signs of repair or restoration
- Original finish vs. worn/patinated surface

Grade using this scale:
S = Like new / pristine — no visible wear, as if unused
A = Excellent — minor traces of use, no damage, fully functional
B = Good — some visible wear (light scratches, minor patina), fully functional
C = Fair — visible wear, minor chips/cracks/stains, functional but imperfect
D = Poor — significant damage, heavy wear, broken parts, or for parts only

If the image is unclear or the item is partially obscured, default to B. Return ONLY the single letter (S, A, B, C, or D), no explanation.`,
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
        timeout: 15000,
      }
    );

    const content: string = response.data.content?.[0]?.text ?? '';

    // Track token usage for cost ceiling (#104)
    const responseTokens = Math.ceil(content.length / 4) + 20;
    trackAITokens(estimatedTokens + responseTokens);

    const grade = content.trim().toUpperCase().charAt(0);

    // Validate grade is one of S|A|B|C|D, default to B if invalid
    return ['S', 'A', 'B', 'C', 'D'].includes(grade) ? grade : 'B';
  } catch {
    // Condition grade suggestion is best-effort — default to B on error
    return 'B';
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Analyze an item image using Google Vision + Claude Haiku.
 *
 * Flow:
 *   1. Send image to Google Vision for fast label/object detection.
 *   2. Pass those labels + the raw image to Claude Haiku for
 *      structured estate-sale metadata.
 *   3. Map Vision labels → curated tags via Haiku (non-blocking).
 *   4. Suggest condition grade via Haiku (non-blocking, #64).
 *
 * Returns null if cloud AI is not configured (caller should fall back to Ollama).
 * Feature #104: Returns null if AI cost ceiling is exceeded (graceful degradation).
 * Throws on API errors so the caller can handle/log them.
 */
export async function analyzeItemImage(
  buffer: Buffer,
  mimeType = 'image/jpeg',
  comps?: ComparableSale[]
): Promise<AITagResult | null> {
  if (!isCloudAIAvailable()) return null;

  // Feature #104: Cost ceiling check — graceful degradation
  if (isAICostCeilingExceeded()) {
    console.warn('[cloudAI] AI cost ceiling exceeded, returning null for fallback');
    return null;
  }

  const imageBase64 = buffer.toString('base64');

  // Vision labels are best-effort — proceed without them if Vision API fails
  let visionLabels: string[] = [];
  try {
    visionLabels = await getVisionLabels(imageBase64);
  } catch {
    // Vision API unavailable or quota exceeded — Haiku will analyse image alone
  }

  const result = await getHaikuAnalysis(imageBase64, mimeType, visionLabels, comps);

  // Sprint 1: Add curated tag suggestions (non-blocking)
  try {
    result.suggestedTags = await suggestCuratedTags(visionLabels);
  } catch {
    // Tag suggestion failed — set empty array (non-blocking)
    result.suggestedTags = [];
  }

  // #64: Add condition grade suggestion (non-blocking)
  try {
    result.suggestedConditionGrade = await suggestConditionGrade(imageBase64, mimeType);
  } catch {
    // Condition grade suggestion failed — leave undefined (non-blocking)
  }

  return result;
}

/**
 * Enhancement 2: Compute a quality proxy for a photo based on Vision label scores.
 * Uses the maximum score from Vision labelAnnotations as the "confidence" of the photo.
 * Falls back to 0 if labels unavailable.
 */
async function computePhotoQualityScore(imageBase64: string): Promise<number> {
  try {
    const response = await axios.post(
      `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`,
      {
        requests: [
          {
            image: { content: imageBase64 },
            features: [
              { type: 'LABEL_DETECTION', maxResults: 15 },
            ],
          },
        ],
      },
      { timeout: 15000 }
    );

    const annotations = response.data.responses?.[0];
    const labelAnnotations = annotations?.labelAnnotations ?? [];

    // Extract max score from all labels
    if (labelAnnotations.length === 0) {
      return 0;
    }

    const maxScore = Math.max(...labelAnnotations.map((l: any) => l.score ?? 0));
    return maxScore;
  } catch {
    // Quality score computation failed — default to 0 (non-blocking)
    return 0;
  }
}

/**
 * Analyze multiple photos of the same item using Google Vision + Claude Haiku.
 *
 * This function is optimized for Rapidfire and regular camera modes where
 * multiple photos (different angles, brand labels, close-ups) are captured
 * of the same item.
 *
 * Flow:
 *   1. Extract Vision labels from the primary photo (first in array)
 *   2. Pass ALL images + labels to Claude Haiku for multi-view analysis
 *   3. Map Vision labels → curated tags via Haiku (non-blocking)
 *   4. Suggest condition grade using primary photo (non-blocking)
 *   5. Enhancement: Sort photos by Vision label confidence (best-photo-first)
 *      and store order in Photo.orderIndex
 *
 * Returns null if cloud AI is not configured or cost ceiling exceeded.
 * Throws on API errors so the caller can handle/log them.
 */
export async function analyzeItemImages(
  buffers: Buffer[],
  mimeTypes: string[] = [],
  comps?: ComparableSale[],
  clusterPhotos?: ClusterPhoto[]
): Promise<AITagResult | null> {
  if (!isCloudAIAvailable()) return null;

  // Feature #104: Cost ceiling check — graceful degradation
  if (isAICostCeilingExceeded()) {
    console.warn('[cloudAI] AI cost ceiling exceeded, returning null for fallback');
    return null;
  }

  if (buffers.length === 0) {
    throw new Error('analyzeItemImages requires at least one image buffer');
  }

  // Default all images to JPEG if mimeTypes not provided
  const types = mimeTypes.length === buffers.length
    ? mimeTypes
    : buffers.map(() => 'image/jpeg');

  const imageBase64Array = buffers.map(buf => buf.toString('base64'));

  // Enhancement 2: Compute quality score for each photo (best-photo-first sorting)
  // This runs in parallel with subsequent analysis, non-blocking
  let photoOrderIndices: number[] = Array.from({ length: buffers.length }, (_, i) => i);
  let photosWithScores: PhotoWithScore[] | null = null;
  try {
    const photosWithQuality = await Promise.all(
      buffers.map((buf, idx) =>
        computePhotoQualityScore(imageBase64Array[idx])
          .then(score => ({ index: idx, buffer: buf, mimeType: types[idx], qualityScore: score }))
          .catch(() => ({ index: idx, buffer: buf, mimeType: types[idx], qualityScore: 0 }))
      )
    );

    // Sort by quality score (descending) — highest score first
    photosWithScores = photosWithQuality.sort((a, b) => b.qualityScore - a.qualityScore);

    // Track the reordered indices
    photoOrderIndices = photosWithScores.map(p => p.index);

    // Reorder the buffers and types arrays for Haiku analysis
    const reorderedBuffers = photosWithScores.map(p => p.buffer);
    const reorderedTypes = photosWithScores.map(p => p.mimeType);

    // Update arrays to use reordered versions
    for (let i = 0; i < reorderedBuffers.length; i++) {
      buffers[i] = reorderedBuffers[i];
      types[i] = reorderedTypes[i];
      imageBase64Array[i] = reorderedBuffers[i].toString('base64');
    }
  } catch {
    // Quality score computation failed — proceed with original order (non-blocking)
  }

  // ADR-069 Phase 1: Vision labels from ALL photos, not just [0]
  let visionLabels: string[] = [];
  try {
    const allVisionLabels: string[] = [];
    for (let i = 0; i < imageBase64Array.length; i++) {
      try {
        const labels = await getVisionLabels(imageBase64Array[i]);
        allVisionLabels.push(...labels);
      } catch {
        // Graceful: skip this photo's labels, continue with others
      }
    }
    // Deduplicate + cap at 20
    visionLabels = Array.from(new Set(allVisionLabels)).slice(0, 20);
  } catch {
    // Vision API unavailable or quota exceeded — proceed without labels
  }

  // Multi-image Haiku analysis (Phase 2: pass clusterPhotos for role context)
  const result = await getHaikuAnalysisMultiImage(imageBase64Array, types, visionLabels, comps, clusterPhotos);

  // Sprint 1: Add curated tag suggestions (non-blocking)
  try {
    result.suggestedTags = await suggestCuratedTags(visionLabels);
  } catch {
    result.suggestedTags = [];
  }

  // #64: Add condition grade suggestion using primary photo (non-blocking)
  try {
    result.suggestedConditionGrade = await suggestConditionGrade(imageBase64Array[0], types[0]);
  } catch {
    // Condition grade suggestion failed — leave undefined
  }

  // Enhancement 2: Attach photo order indices for Photo.orderIndex field
  if (photoOrderIndices.length > 0) {
    result.photoOrderIndices = photoOrderIndices;
  }

  return result;
}

/**
 * Claude Haiku structured analysis for multiple images of the same item.
 * Passes all images in a single API call for holistic multi-view understanding.
 */
/**
 * Phase 2: Build role-context prompt sections based on cluster photo roles.
 * Injects role-specific analysis guidance into per-cluster analysis.
 */
function buildRoleContextPrompt(clusterPhotos?: ClusterPhoto[]): string {
  if (!clusterPhotos || clusterPhotos.length === 0) {
    return '';
  }

  const roleContexts: string[] = [];
  const uniqueRoles = new Set(clusterPhotos.map(p => p.photoRole));

  if (uniqueRoles.has('BACK_STAMP')) {
    roleContexts.push('These images show the back/underside. Look for maker marks, hallmarks, pottery marks, silver marks. CRITICAL for brand/maker ID and pricing. Prioritize text/marks for brand, category, origin.');
  }

  if (uniqueRoles.has('DETAIL_DAMAGE')) {
    roleContexts.push('Close-up of condition issues — chips, cracks, crazing, staining, repairs, edge wear. Determines condition grade. Grade conservatively.');
  }

  if (uniqueRoles.has('LABEL_BRAND')) {
    roleContexts.push('Contains text labels, barcodes, serial info. Extract brand names, model/style numbers, dates, care instructions. Higher priority than general Vision labels.');
  }

  if (uniqueRoles.has('MULTI_ANGLE')) {
    roleContexts.push('Alternate perspective. Use to confirm details from primary shots.');
  }

  if (roleContexts.length === 0) {
    return '';
  }

  return `\n\n=== PHOTO ROLE CONTEXT ===\n${roleContexts.join('\n')}\nUse role-based context above. Prioritize signals from specialized photos (BACK_STAMP for brand, DETAIL_DAMAGE for condition) over generic labels. If a photo role contradicts visual evidence, note internally but don't let role classification bias analysis of what is actually visible.`;
}

async function getHaikuAnalysisMultiImage(
  imageBase64Array: string[],
  mimeTypes: string[],
  visionLabels: string[],
  comps?: ComparableSale[],
  clusterPhotos?: ClusterPhoto[]
): Promise<AITagResult> {
  const labelContext =
    visionLabels.length > 0
      ? `\n\nVision API detected these objects/labels: ${visionLabels.join(', ')}.`
      : '';

  const GENERIC_LABELS = new Set(['glass', 'black', 'darkness', 'white', 'transparent', 'product', 'still life', 'object']);
  const specificLabels = visionLabels.filter(l => !GENERIC_LABELS.has(l.toLowerCase()));
  const sparseImageNote = specificLabels.length < 3
    ? '\n\nNote: The image may contain a dark-colored or transparent/reflective item. Identify the object by its silhouette, shape, proportions, and any visible text, markings, or contextual clues rather than surface color or material appearance.'
    : '';

  const compsContext = comps && comps.length > 0
    ? `\n\nRecent comparable sales for this category: ${comps.map(c => `"${c.title}" sold for $${c.price}`).join('; ')}. Use these as your primary pricing reference.`
    : '';

  const roleContext = buildRoleContextPrompt(clusterPhotos);

  const imageCount = imageBase64Array.length;
  const multiImagePrompt = imageCount > 1
    ? `You are analyzing ${imageCount} photos of the same item from different angles.`
    : 'You are analyzing a photo of an item.';

  try {
    const systemPrompt = `You are an expert secondary market cataloger for a ${regionConfig.city}, ${regionConfig.state} estate sale marketplace.${labelContext}

${multiImagePrompt} Respond with ONLY valid JSON (no markdown, no explanation).`;
    const estimatedTokens = estimateTokensForRequest(systemPrompt, true);

    // Build content array with all images
    const contentArray: any[] = [];

    // Add all images
    imageBase64Array.forEach((imageBase64, idx) => {
      contentArray.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: mimeTypes[idx] as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
          data: imageBase64,
        },
      });
    });

    // Add text prompt at the end
    contentArray.push({
      type: 'text',
      text: `${multiImagePrompt} Use all images to determine the best title, category, condition grade, description, and estimated price. Pay particular attention to any brand labels, tags, or markings visible in any of the photos.${labelContext}${sparseImageNote}${compsContext}${roleContext}

Analyze and respond with ONLY valid JSON (no markdown, no explanation).

Title guidelines: Start with the most recognizable/searchable keyword. Format: "[Type], [Material or Era], [Maker or Style if visible]". Examples: "Brass Floor Lamp, Art Deco Style", "Oak Dining Chair Set, Mid-Century Modern", "McCoy Pottery Planter, Green Drip Glaze", "Cast Iron Skillet, Lodge 10-inch". Include decade if identifiable (1950s, 1960s, Victorian). Avoid vague words like "Beautiful" or "Nice".
Description: 1–2 sentences. Lead with searchable keywords buyers use on Google or eBay. Mention material, maker/brand (if visible), era/decade, and standout features. Example: "Solid oak mid-century modern dresser with original brass hardware, circa 1960s. Six drawers, minor surface scratches, no structural damage." Note any maker marks, chips, cracks, or signs of age.
Category: Pick the single best fit from: Furniture, Electronics, Clothing, Books, Kitchenware, Tools, Art, Jewelry, Toys, Sports, Collectibles, Glassware, Linens, Other.
Condition: NEW = unused with tags. USED = minimal to normal wear. REFURBISHED = restored/refurbished by seller. PARTS_OR_REPAIR = damaged, functional only for parts/repair.
Price: Suggest a realistic secondary market price for this item. Do not use retail pricing as a baseline — derive the price from what similar items actually sell for. If comparable sales are provided above, anchor to those. Do not default to round numbers like $5, $10, $20, $25, $50 — derive a specific price from the item's actual characteristics.
Tags: 5–8 short search terms buyers type on Google or eBay. Prioritize: material (Cast Iron, Solid Oak, Sterling Silver, Brass, Copper), era (Mid-Century Modern, Victorian, Art Deco, 1950s, 1960s, Antique, Vintage), maker/brand (McCoy, Pyrex, Fiestaware, Depression Glass) if identifiable, and style (Farmhouse, Industrial, Bohemian). Always include "Vintage" or "Antique" when applicable. Examples: "Mid-Century Modern", "Solid Oak", "Cast Iron", "Hand-painted", "Art Deco", "1960s", "McCoy Pottery", "Set of 4".
Confidence: REQUIRED FIELD. Rate your confidence in this identification from 0.0 to 1.0. Use 0.9+ only when item, brand/maker, and era are clearly identifiable. Use 0.7–0.89 when item type is clear but details are uncertain. Use 0.5–0.69 when image is unclear or item is generic. Use below 0.5 when you cannot identify the item. Always include a confidence number.

{
  "title": "short specific title",
  "description": "1-2 sentence description with condition details",
  "category": "best matching category",
  "condition": "NEW | USED | REFURBISHED | PARTS_OR_REPAIR",
  "suggestedConditionGrade": "A | B | C | D | F",
  "suggestedPrice": 12.50,
  "tags": ["Tag1", "Tag2", "Tag3"],
  "confidence": 0.85
}`,
    });

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: ANTHROPIC_MODEL,
        max_tokens: 400,
        messages: [
          {
            role: 'user',
            content: contentArray,
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

    // Track token usage for cost ceiling (#104)
    const responseTokens = Math.ceil(content.length / 4) + 50;
    trackAITokens(estimatedTokens + responseTokens);

    const raw = content.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(raw) as AITagResult;

    if (!Array.isArray(parsed.tags)) {
      parsed.tags = [];
    }
    if (!parsed.confidence) {
      // Derive confidence from field completeness when model doesn't self-report
      const fieldCount = [parsed.title, parsed.description, parsed.category, parsed.condition, parsed.suggestedPrice]
        .filter(f => f != null && f !== '').length;
      parsed.confidence = 0.4 + (fieldCount / 5) * 0.4; // 0.4–0.8 range based on completeness
    }

    return parsed;
  } catch (error: any) {
    // P0-3: Capture specific error context and re-throw with context for caller
    if (error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET') {
      const err = new Error('AI_TIMEOUT: AI service connection failed');
      (err as any).errorCode = 'AI_TIMEOUT';
      throw err;
    }
    if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
      const err = new Error('AI_TIMEOUT: AI service timed out');
      (err as any).errorCode = 'AI_TIMEOUT';
      throw err;
    }
    if (error.response?.status === 429) {
      const err = new Error('AI_RATE_LIMIT: AI service busy — try again shortly');
      (err as any).errorCode = 'AI_RATE_LIMIT';
      throw err;
    }
    if (error instanceof SyntaxError || error.message?.includes('JSON')) {
      const err = new Error('AI_PARSE_ERROR: AI returned invalid data');
      (err as any).errorCode = 'AI_PARSE_ERROR';
      throw err;
    }
    const err = new Error('AI_ERROR: AI analysis unavailable');
    (err as any).errorCode = 'AI_ERROR';
    throw err;
  }
}

// ── Sale Description Generator ────────────────────────────────────────────────

export interface SaleDescriptionInput {
  title: string;
  tags?: string[];
  city?: string;
  isAuctionSale?: boolean;
  saleType?: string;
  startDate?: string;
  endDate?: string;
}

/**
 * Generate a 2–3 sentence sale listing description using Claude Haiku.
 * Returns null if ANTHROPIC_API_KEY is not configured.
 * Feature #109: Returns null on API errors (graceful degradation).
 * Feature #104: Returns null if AI cost ceiling is exceeded.
 */
export async function generateSaleDescription(input: SaleDescriptionInput): Promise<string | null> {
  if (!ANTHROPIC_API_KEY) return null;

  // Feature #104: Cost ceiling check
  if (isAICostCeilingExceeded()) {
    console.warn('[cloudAI] AI cost ceiling exceeded, returning null for sale description');
    return null;
  }

  try {
    const { title, tags = [], city = regionConfig.city, isAuctionSale = false, saleType, startDate, endDate } = input;

    const tagContext = tags.length > 0 ? `Featured categories/items: ${tags.join(', ')}.` : '';
    const dateContext =
      startDate && endDate
        ? `Sale runs ${new Date(startDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} through ${new Date(endDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}.`
        : '';

    const saleTypeLabels: Record<string, string> = {
      ESTATE: 'estate sale',
      YARD: 'yard sale',
      AUCTION: 'auction',
      FLEA_MARKET: 'flea market',
      CONSIGNMENT: 'consignment sale',
      CHARITY: 'charity sale',
      BUSINESS_CORPORATE: 'business liquidation sale',
    };
    const resolvedType = saleType
      ? (saleTypeLabels[saleType] ?? 'sale')
      : isAuctionSale ? 'auction' : 'sale';

    const prompt = `You are helping a ${resolvedType} organizer in ${city}, ${regionConfig.state} write a compelling 2–3 sentence listing description.

Sale title: "${title}"
${tagContext}
${dateContext}

Write a friendly, inviting description that shoppers will see on the listing. Use a warm tone. Mention the city if relevant. Do NOT make up specific items or prices — only reference what's provided. Respond with just the description text, no quotes, no explanation.`;

    // Estimate tokens for cost tracking (#104)
    const estimatedTokens = estimateTokensForRequest(prompt, false);

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: ANTHROPIC_MODEL,
        max_tokens: 150,
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

    const text: string = response.data.content?.[0]?.text ?? '';

    // Track token usage for cost ceiling (#104)
    const responseTokens = Math.ceil(text.length / 4) + 100;
    trackAITokens(estimatedTokens + responseTokens);

    return text.trim() || null;
  } catch (error: any) {
    // Feature #109: Graceful degradation — return null on API failure
    console.warn('[cloudAIService] Sale description generation error:', error.message || error);
    return null;
  }
}

// ── Price Suggestion API ──────────────────────────────────────────────────────

export interface PriceSuggestion {
  low: number;
  high: number;
  suggested: number;
  reasoning: string;
}

export interface ComparableSale {
  title: string;
  price: number;
  soldAt: string;
}

/**
 * Suggest a price range for an item based on title, category, and condition.
 * Uses Claude Haiku with estate sale pricing expertise.
 * Optionally includes comparable sold prices from the platform to inform the suggestion.
 *
 * Feature #104: Returns fallback price if cost ceiling is exceeded.
 * Returns a fallback price if parsing fails or API is unavailable.
 */
export async function suggestPrice(
  title: string,
  category: string,
  condition: string,
  comps?: ComparableSale[]
): Promise<PriceSuggestion> {
  if (!ANTHROPIC_API_KEY) {
    return {
      low: 1,
      high: 50,
      suggested: 10,
      reasoning: 'Manual pricing recommended (AI service unavailable)',
    };
  }

  // Feature #104: Cost ceiling check
  if (isAICostCeilingExceeded()) {
    console.warn('[cloudAI] AI cost ceiling exceeded, returning fallback price');
    return {
      low: 5,
      high: 25,
      suggested: 15,
      reasoning: 'Manual pricing recommended (AI service temporarily unavailable)',
    };
  }

  try {
    const compsContext =
      comps && comps.length > 0
        ? `Comparable sales from our platform:\n${comps.map(c => `- "${c.title}": sold for $${c.price} (${c.soldAt})`).join('\n')}\n\n`
        : '';

    const prompt = `You are a secondary market pricing expert. Suggest a realistic price for this item based on what it actually sells for in the secondary market.

Item: ${title}
Category: ${category}
Condition: ${condition}

${compsContext}Respond with ONLY valid JSON in this exact format:
{"low": 7, "high": 23, "suggested": 14, "reasoning": "Similar items in this condition sell for $12-18 based on recent comparable sales"}

Base your price on actual secondary market demand, not retail pricing. Do not anchor to common round numbers like $5, $10, $15, $20, $25, $50 — derive specific values from the item characteristics and any comparables provided. Condition affects value significantly.`;

    // Estimate tokens for cost tracking (#104)
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

    // Track token usage for cost ceiling (#104)
    const responseTokens = Math.ceil(content.length / 4) + 75;
    trackAITokens(estimatedTokens + responseTokens);

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

// ── ADR-069 Phase 1: Clustering + Multi-Photo Vision Aggregation ─────────────

/**
 * Extract EXIF DateTimeOriginal/DateTime from JPEG base64 data.
 * Falls back gracefully if EXIF is missing or unreadable.
 * Returns null if no timestamp found.
 */
function extractExifTimestamp(imageBase64: string): Date | null {
  try {
    // Convert base64 to Buffer
    const buffer = Buffer.from(imageBase64, 'base64');

    // JPEG EXIF starts at 0xFF 0xE1 marker. Look for Exif header.
    // Simplified approach: search for "Exif\0\0" and then look for DateTime/DateTimeOriginal
    const exifSignature = Buffer.from([0xFF, 0xE1]);
    let exifOffset = buffer.indexOf(exifSignature);

    if (exifOffset === -1) {
      return null; // No EXIF APP1 marker
    }

    // Look for DateTime or DateTimeOriginal tags in the EXIF data
    // DateTime is typically in format: "YYYY:MM:DD HH:MM:SS"
    const exifData = buffer.toString('binary', exifOffset, Math.min(exifOffset + 65536, buffer.length));

    // Search for DateTime strings: pattern is "YYYY:MM:DD HH:MM:SS"
    const dateRegex = /(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/;
    const match = exifData.match(dateRegex);

    if (match) {
      const [, year, month, day, hour, minute, second] = match;
      try {
        return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
      } catch {
        return null;
      }
    }

    return null;
  } catch {
    // Extraction failed — return null (non-blocking, graceful fallback)
    return null;
  }
}

export interface ClusterPhoto {
  index: number;
  photoRole: 'FRONT' | 'BACK_STAMP' | 'DETAIL_DAMAGE' | 'LABEL_BRAND' | 'MULTI_ANGLE' | 'UNKNOWN';
  roleReasoning?: string;
}

export interface ClusterResult {
  clusters: Array<{
    photoIndices: number[];
    detectedType: string;
    confidence: number;
    photos?: ClusterPhoto[]; // Phase 2: per-photo role assignments
  }>;
  ungrouped: Array<number | ClusterPhoto>; // Can be index number or full ClusterPhoto object
}

/**
 * Cluster photos into groups (sets, bundles, identical items, obvious pairs).
 * Uses Haiku with multimodal images to identify logical groupings.
 * Enhancement: Temporal EXIF clustering boost — photos taken close together in time
 * are more likely to be the same item, passed as a weighting signal to the prompt.
 *
 * Fallback: on error, returns all ungrouped (one-item-per-photo behavior).
 */
export async function clusterPhotos(imageBase64Array: string[]): Promise<ClusterResult> {
  if (imageBase64Array.length === 0) {
    return { clusters: [], ungrouped: [] };
  }

  // If only 1 photo, return it ungrouped (no clustering needed)
  if (imageBase64Array.length === 1) {
    return { clusters: [], ungrouped: [0] };
  }

  try {
    // Build multimodal messages: one image per message
    const imageMessages = imageBase64Array.map((base64, index) => ({
      type: 'image' as const,
      source: {
        type: 'base64' as const,
        media_type: 'image/jpeg' as const,
        data: base64,
      },
    }));

    // Enhancement 1: Extract EXIF timestamps and compute temporal proximity hints
    let timingHints = '';
    try {
      const timestamps: (Date | null)[] = imageBase64Array.map(base64 => extractExifTimestamp(base64));

      // Find consecutive photos taken within ~30 seconds (likely same item from different angles)
      const timingGroups: Array<{ indices: number[]; gapSeconds: number }> = [];
      let currentGroup: number[] = [0];

      for (let i = 1; i < timestamps.length; i++) {
        if (timestamps[i] && timestamps[i - 1]) {
          const gapMs = timestamps[i]!.getTime() - timestamps[i - 1]!.getTime();
          const gapSeconds = Math.abs(gapMs) / 1000;

          if (gapSeconds <= 30) {
            // Same temporal group
            currentGroup.push(i);
          } else {
            // New temporal group
            if (currentGroup.length > 0) {
              timingGroups.push({ indices: [...currentGroup], gapSeconds: 0 });
            }
            currentGroup = [i];
          }
        } else {
          // Missing EXIF data for this photo
          currentGroup.push(i);
        }
      }

      // Add final group
      if (currentGroup.length > 0) {
        timingGroups.push({ indices: [...currentGroup], gapSeconds: 0 });
      }

      // Build timing hint string for the prompt
      if (timingGroups.length > 0 && timingGroups.some(g => g.indices.length > 1)) {
        const hints = timingGroups
          .filter(g => g.indices.length > 1)
          .map(g => `photos ${g.indices.join(',')} were taken within ~30 seconds of each other`)
          .join('; ');
        timingHints = `\n\nTemporal clustering hint: ${hints}. Use this as an additional grouping signal when photos were captured close together in time.`;
      }
    } catch {
      // EXIF extraction failed gracefully — proceed without timing hints
    }

    const clusteringPrompt = `You are a batch item grouper for an estate sale app. Given N photos from an organizer's drop, identify logical groupings (matching sets, bundles, identical items, obvious pairs). A "set" is: same pattern/design, same manufacturer, intended to be used/sold together.${timingHints}

For each photo in each cluster AND each ungrouped photo, assign one of these roles:
- FRONT: Best main angle for identifying the item visually (primary shot)
- BACK_STAMP: Shows maker marks, stamps, brand labels, hallmarks, or interior features
- DETAIL_DAMAGE: Close-up showing damage, wear, staining, repairs, or condition details
- LABEL_BRAND: Text labels, barcodes, serial plates, price tags, product labels
- MULTI_ANGLE: Alternate viewing angle not covered by other roles
- UNKNOWN: You cannot confidently classify the photo's role

Return JSON only:
{
  "clusters": [
    {
      "id": "cluster-1",
      "photoIndices": [0, 1, 2],
      "detectedType": "8-piece place setting",
      "confidence": 0.95,
      "reasoning": "Matching dishes, same pattern, consistent lighting",
      "photos": [
        {
          "index": 0,
          "photoRole": "FRONT",
          "roleReasoning": "Straight-on marketing angle of stacked plates; best for visual identification"
        },
        {
          "index": 1,
          "photoRole": "BACK_STAMP",
          "roleReasoning": "Underside view showing maker mark and brand stamp"
        },
        {
          "index": 2,
          "photoRole": "DETAIL_DAMAGE",
          "roleReasoning": "Close-up of rim showing minor chipping and edge wear"
        }
      ]
    }
  ],
  "ungrouped": [
    {
      "index": 3,
      "photoRole": "LABEL_BRAND",
      "roleReasoning": "Original box label with product info"
    }
  ]
}

Confidence threshold: only cluster at >= 0.75. When in doubt, leave ungrouped.`;

    const estimatedTokens = estimateTokensForRequest(clusteringPrompt, true);

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: ANTHROPIC_MODEL,
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: [...imageMessages, { type: 'text' as const, text: clusteringPrompt }],
          },
        ],
      },
      {
        headers: {
          'x-api-key': ANTHROPIC_API_KEY as string,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        timeout: 60000,
      }
    );

    const content: string = response.data.content?.[0]?.text ?? '';

    // Track token usage
    const responseTokens = Math.ceil(content.length / 4) + 50;
    trackAITokens(estimatedTokens + responseTokens);

    const raw = content.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(raw) as ClusterResult;

    // Validate parsed clusters + ungrouped
    if (!Array.isArray(parsed.clusters)) {
      parsed.clusters = [];
    }
    if (!Array.isArray(parsed.ungrouped)) {
      parsed.ungrouped = [];
    }

    // Ensure all clusters meet confidence threshold
    parsed.clusters = parsed.clusters.filter(c => c.confidence >= 0.75);

    // Ensure all indices are valid and normalize ungrouped (convert numbers to ClusterPhoto objects if needed)
    const usedIndices = new Set<number>();
    parsed.clusters.forEach(c => c.photoIndices.forEach(idx => usedIndices.add(idx)));

    parsed.ungrouped = parsed.ungrouped
      .filter(item => {
        const idx = typeof item === 'number' ? item : item.index;
        return !usedIndices.has(idx) && idx < imageBase64Array.length;
      })
      .map(item => {
        // Normalize: if it's a number, wrap it as a ClusterPhoto with UNKNOWN role
        if (typeof item === 'number') {
          return {
            index: item,
            photoRole: 'UNKNOWN' as const,
            roleReasoning: 'Not assigned a specific role',
          };
        }
        // Ensure role is valid; default to UNKNOWN if missing or invalid
        const validRoles = ['FRONT', 'BACK_STAMP', 'DETAIL_DAMAGE', 'LABEL_BRAND', 'MULTI_ANGLE', 'UNKNOWN'];
        if (!validRoles.includes(item.photoRole)) {
          item.photoRole = 'UNKNOWN';
        }
        return item as ClusterPhoto;
      });

    // If no clusters formed, everything is ungrouped
    if (parsed.clusters.length === 0) {
      parsed.ungrouped = Array.from({ length: imageBase64Array.length }, (_, i) => ({
        index: i,
        photoRole: 'UNKNOWN' as const,
        roleReasoning: 'No clustering performed',
      }));
    }

    return parsed;
  } catch (error: any) {
    console.warn('[cloudAIService] Clustering failed, falling back to one-item-per-photo:', error.message);
    // Fallback: treat each photo as ungrouped with UNKNOWN role
    return {
      clusters: [],
      ungrouped: Array.from({ length: imageBase64Array.length }, (_, i) => ({
        index: i,
        photoRole: 'UNKNOWN' as const,
        roleReasoning: 'Clustering failed; defaulted to UNKNOWN',
      })),
    };
  }
}
