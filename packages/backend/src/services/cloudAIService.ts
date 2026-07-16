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
import { EBAY_L1_CATEGORIES } from '../config/ebayCategories';
import { trackAITokens, estimateTokensForRequest, isAICostCeilingExceeded, trackVisionCall,
  webDetectionEnabled, isWebDetectionCeilingExceeded, isWebDetectionDailyCapAvailable, trackWebDetectionCall,
  recordApiUsage, ANTHROPIC_COST_PER_M_TOKENS,
  recordAnthropicUsageOrEstimate, isAIDailyCallCapAvailable, trackAICall } from '../lib/aiCostTracker';
import { findCatalogMatches, buildCatalogMatchContext, isCatalogMatchEnabled, CatalogMatch } from './imageMatchService';
import { getEbayImageMatch, buildEbayMatchContext, EbayImageMatch } from './ebayImageSearchService';

const GOOGLE_VISION_API_KEY = process.env.GOOGLE_VISION_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

export interface AITagResult {
  title: string;
  description: string;
  category?: string; // Task #339: Optional if confidence < 0.6
  condition: string;
  suggestedPrice: number;
  tags: string[];
  confidence?: number; // Camera Workflow v2: AI confidence score (0.0–1.0), defaults to 0.5
  suggestedTags?: string[]; // Sprint 1: Curated tags suggested by Haiku from Vision labels
  suggestedConditionGrade?: string; // #64: AI-suggested condition grade (S|A|B|C|D)
  photoOrderIndices?: number[]; // Enhancement 2: Best-photo-first sorting — reordered photo indices by Vision quality
  brand?: string; // Task #339: Optional if confidence < 0.6
  mpn?: string; // Catalog Enrichment (2026-06-14): visible model/part number from labels/markings (evidence-only)
  upc?: string; // Enrichment Cascade (2026-06-14): visible UPC — barcode or printed digits ONLY (evidence-only, never recalled)
  // Calculated-shipping package estimation (same tagging pass, no extra API call)
  estimatedWeightOz?: number; // packed weight estimate in ounces (null when packageConfidence < 0.5)
  estimatedDimensionsIn?: { length: number; width: number; height: number }; // packed box dims in inches
  estimatedPackageType?: string; // eBay packageType enum (MAILING_BOX | PACKAGE_THICK_ENVELOPE | LARGE_PACKAGE | etc.)
  packageConfidence?: number; // 0.0-1.0 confidence in the package estimate
  ocrIsbn?: string; // ADR-089: checksum-valid ISBN extracted from the full Vision OCR block (books)
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

/**
 * ADR-089 — extract a checksum-valid ISBN from a free-text OCR block.
 * Returns a normalized ISBN-13 (13 digits, no separators) or null.
 *  - ISBN-13: 978/979 + 10 digits, tolerant of hyphens/spaces and the EAN-13 barcode digit
 *    grouping ("9 781419 756917"); validated against the mod-10 checksum.
 *  - ISBN-10: 10 chars (final may be X), validated mod-11, converted to ISBN-13.
 * Non-book barcodes and bad checksums are rejected — near-zero false positives (checksum + prefix).
 */
export function extractIsbnFromText(text: string | null | undefined): string | null {
  if (!text || typeof text !== 'string') return null;

  const isValidIsbn13 = (d: string): boolean => {
    if (!/^\d{13}$/.test(d) || !/^(978|979)/.test(d)) return false;
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += Number(d[i]) * (i % 2 === 0 ? 1 : 3);
    return (10 - (sum % 10)) % 10 === Number(d[12]);
  };
  const isValidIsbn10 = (r: string): boolean => {
    if (!/^\d{9}[\dX]$/.test(r)) return false;
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += Number(r[i]) * (10 - i);
    sum += r[9] === 'X' ? 10 : Number(r[9]);
    return sum % 11 === 0;
  };
  const isbn10to13 = (r: string): string => {
    const core = '978' + r.slice(0, 9);
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += Number(core[i]) * (i % 2 === 0 ? 1 : 3);
    return core + String((10 - (sum % 10)) % 10);
  };

  // ISBN-13 first — separators allowed between every digit so barcode grouping reconstructs.
  const re13 = /9[\s-]?7[\s-]?[89](?:[\s-]?\d){10}/g;
  let m: RegExpExecArray | null;
  while ((m = re13.exec(text)) !== null) {
    const digits = m[0].replace(/[-\s]/g, '');
    if (digits.length === 13 && isValidIsbn13(digits)) return digits;
  }
  // ISBN-10 fallback (may carry an "ISBN" label prefix; final char may be X).
  const re10 = /\b\d(?:[-\s]?\d){8}[-\s]?[\dXx]\b/g;
  while ((m = re10.exec(text)) !== null) {
    const raw = m[0].replace(/[-\s]/g, '').toUpperCase();
    if (raw.length === 10 && isValidIsbn10(raw)) return isbn10to13(raw);
  }
  return null;
}

// ── Step 1: Google Vision label extraction ────────────────────────────────────

export async function getVisionLabels(imageBase64: string): Promise<{ objectLabels: string[]; detectedText: string[]; qualityScore: number; ocrIsbn?: string }> {
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
    const labelAnnotations: any[] = annotations?.labelAnnotations ?? [];
    const labels: string[] = labelAnnotations.map((l: any) => l.description);
    const objects: string[] = (annotations?.localizedObjectAnnotations ?? []).map((o: any) => o.name);
    // TEXT_DETECTION returns a single block with all text, plus individual word annotations
    const textAnnotations: any[] = annotations?.textAnnotations ?? [];
    const detectedTexts: string[] = textAnnotations
      .slice(0, 5) // first entry is the full combined text block — skip it, use individual words
      .map((t: any) => t.description?.trim())
      .filter((t: string) => t && t.length > 1 && t.length < 40); // skip single chars and long strings

    // ADR-089: textAnnotations[0] is the FULL combined OCR block (skipped above for word tokens).
    // A book's printed/barcode ISBN lives there — extract a checksum-valid ISBN before discarding it.
    const fullOcrBlock: string = textAnnotations[0]?.description ?? '';
    const ocrIsbn = extractIsbnFromText(fullOcrBlock) ?? undefined;

    // Derive quality score from max label confidence — replaces computePhotoQualityScore
    const qualityScore = labelAnnotations.length > 0
      ? Math.max(...labelAnnotations.map((l: any) => l.score ?? 0))
      : 0.5;

    // Track Vision API cost for unified $50 ceiling
    await trackVisionCall(1);

    // Objects + labels are shape/silhouette-based generic classification (lower reliability
    // for visually-similar-but-functionally-different items). Detected text is kept SEPARATE —
    // legible on-item text/marks are strong identification evidence and must not be flattened
    // in with generic label guesses (see evidence-hierarchy instruction in the Haiku prompts).
    const objectLabels = [...new Set([...objects, ...labels])].slice(0, 18);
    const detectedText = [...new Set(detectedTexts)].slice(0, 18);
    return { objectLabels, detectedText, qualityScore, ocrIsbn };
  } catch (error: any) {
    // Feature #109: Graceful degradation — return empty labels on Vision API failure
    console.warn('[cloudAIService] Google Vision API error:', error.message || error);
    return { objectLabels: [], detectedText: [], qualityScore: 0.5 };
  }
}

// ── Web Detection (ADR-web-detection-hard-gating-2026-07-01) ──────────────────
// Deliberately a SEPARATE function from getVisionLabels() — never merged into that call — so
// that Web Detection being disabled, rate-capped, or erroring can never affect the existing,
// already-legitimate Label/Object/Text pipeline. Gated behind 3 checks, in order, ALL of which
// must pass before the network call fires:
//   1. webDetectionEnabled()            — kill switch, default OFF
//   2. isWebDetectionDailyCapAvailable() — daily call-count breaker (bug-catcher)
//   3. isWebDetectionCeilingExceeded()   — dedicated monthly cost ceiling, checked PRE-flight
// Call this ONLY from the real-time per-photo tagging request path. Never from a cron/job/backfill
// script — see ADR Layer 3. On any gate failing or any error, returns null (graceful degradation);
// callers must treat a null return as "no web-match evidence available," not as an error to surface.
export async function getWebDetectionMatch(imageBase64: string): Promise<{ webEntities: string[]; bestGuessLabels: string[] } | null> {
  if (!webDetectionEnabled()) {
    console.log('[cloudAIService] Web Detection skipped — WEB_DETECTION_ENABLED is not \'true\'');
    console.log('[webDetection] skipped early return: kill switch off (WEB_DETECTION_ENABLED != true)');
    return null;
  }
  if (!(await isWebDetectionDailyCapAvailable())) {
    console.warn('[cloudAIService] Web Detection skipped — daily call cap reached (WEB_DETECTION_DAILY_CAP)');
    console.warn('[webDetection] skipped early return: daily call cap reached (WEB_DETECTION_DAILY_CAP)');
    return null;
  }
  if (await isWebDetectionCeilingExceeded()) {
    console.warn('[cloudAIService] Web Detection skipped — monthly cost ceiling reached (WEB_DETECTION_COST_CEILING_USD)');
    console.warn('[webDetection] skipped early return: monthly cost ceiling exceeded (WEB_DETECTION_COST_CEILING_USD)');
    return null;
  }

  try {
    const response = await axios.post(
      `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`,
      {
        requests: [
          {
            image: { content: imageBase64 },
            features: [{ type: 'WEB_DETECTION', maxResults: 10 }],
          },
        ],
      },
      { timeout: 15000 }
    );

    // Track the call AFTER success — same shape as trackVisionCall for the existing features.
    await trackWebDetectionCall();

    const webDetection = response.data.responses?.[0]?.webDetection;
    const webEntities: string[] = (webDetection?.webEntities ?? [])
      .filter((e: any) => e.description)
      .map((e: any) => e.description);
    const bestGuessLabels: string[] = (webDetection?.bestGuessLabels ?? [])
      .map((l: any) => l.label)
      .filter(Boolean);

    if (!webDetection) {
      console.warn('[webDetection] Vision returned no webDetection block — returning empty match');
    } else if (webEntities.length === 0 && bestGuessLabels.length === 0) {
      console.warn('[webDetection] Vision returned empty results (no webEntities, no bestGuessLabels)');
    } else {
      console.log(`[webDetection] match: bestGuess=[${bestGuessLabels.slice(0, 5).join(', ')}] webEntities=[${webEntities.slice(0, 5).join(', ')}]`);
    }

    return { webEntities: [...new Set(webEntities)].slice(0, 10), bestGuessLabels: [...new Set(bestGuessLabels)].slice(0, 5) };
  } catch (error: any) {
    console.warn('[cloudAIService] Google Vision Web Detection error:', error.message || error);
    return null;
  }
}

/**
 * Same conditional-inclusion evidence pattern as buildCatalogMatchContext() in
 * imageMatchService.ts. Empty string when there's no result (feature off, gated,
 * or error) — coexists with the text-vs-shape hierarchy and catalog-match context
 * as a FOURTH, independent evidence source, never a replacement for the others.
 */
function buildWebDetectionContext(webMatch: { webEntities: string[]; bestGuessLabels: string[] } | null): string {
  if (!webMatch || (webMatch.webEntities.length === 0 && webMatch.bestGuessLabels.length === 0)) return '';
  const parts: string[] = [];
  if (webMatch.bestGuessLabels.length > 0) {
    parts.push(`best guess: ${webMatch.bestGuessLabels.join(', ')}`);
  }
  if (webMatch.webEntities.length > 0) {
    parts.push(`related web entities: ${webMatch.webEntities.slice(0, 6).join(', ')}`);
  }
  return `\n\nGoogle web image search match: ${parts.join('; ')}. This comes from matching the photo against pages elsewhere on the web (not eBay's own catalog) — treat it as a weak hint only, and never let it override legible on-item text or brand marks.`;
}

// ── Step 2: Claude Haiku structured analysis ──────────────────────────────────

async function getHaikuAnalysis(
  imageBase64: string,
  mimeType: string,
  objectLabels: string[],
  detectedText: string[],
  comps?: ComparableSale[],
  catalogMatches?: CatalogMatch[] | null,
  webMatch?: { webEntities: string[]; bestGuessLabels: string[] } | null,
  ebayMatch?: EbayImageMatch | null
): Promise<AITagResult> {
  const labelContext =
    objectLabels.length > 0 || detectedText.length > 0
      ? `\n\n${detectedText.length > 0 ? `Text detected ON the item (labels, plates, engravings, printed marks): ${detectedText.join(', ')}.` : ''}${objectLabels.length > 0 ? `${detectedText.length > 0 ? ' ' : ''}General visual/shape classification (Vision API, lower reliability for close visual look-alikes): ${objectLabels.join(', ')}.` : ''}\n\nEvidence hierarchy — text overrides shape: You are given two separate categories of visual evidence. (1) Text detected ON the item (labels, plates, engravings, stamps, tags, printed or embossed marks) — this is HIGH-reliability evidence because it directly names or identifies the item. (2) General visual/shape classification from the Vision API (object and label detection) — this is LOWER-reliability evidence based only on silhouette, shape, and general appearance, and it frequently misidentifies items that look visually similar but are functionally different (for example: small dial or gauge instruments of different kinds, stackable containers made of different materials, or differently-shaped items within the same broad category). When the two categories conflict, ALWAYS trust the legible on-item text, brand mark, model plate, engraving, or printed label over the generic shape-based classification — override the shape-based guess with what the text actually says. This rule applies uniformly to every item category (furniture, pottery and ceramics, books and media, appliances, tools, clothing, toys, collectibles, and anything else) — do not special-case any single category.`
      : '';

  // Sparse-label fallback: if Vision returned very few/generic results, help Haiku reason visually
  const GENERIC_LABELS = new Set(['glass', 'black', 'darkness', 'white', 'transparent', 'product', 'still life', 'object']);
  const specificLabels = objectLabels.filter(l => !GENERIC_LABELS.has(l.toLowerCase()));
  const sparseImageNote = specificLabels.length < 3 && detectedText.length === 0
    ? '\n\nNote: The image may contain a dark-colored or transparent/reflective item. Identify the object by its silhouette, shape, proportions, and any visible text, markings, or contextual clues rather than surface color or material appearance.'
    : '';

  const compsContext = comps && comps.length > 0
    ? `\n\nRecent comparable sales for this category: ${comps.map(c => `"${c.title}" sold for $${c.price}`).join('; ')}. Use these as your primary pricing reference.`
    : '';

  // Reverse-Image Product Index (ADR 2026-07-01 §1): additional grounding evidence
  // from a self-hosted catalog-match vector search, same conditional-inclusion
  // pattern as labelContext/sparseImageNote/compsContext above. Empty string when
  // there is no qualifying match (feature off, service down, or below threshold) —
  // this coexists with the text-vs-shape evidence hierarchy in labelContext rather
  // than replacing it; catalog match is a THIRD, independent evidence source.
  const catalogMatchContext = buildCatalogMatchContext(catalogMatches ?? null);
  const webDetectionContext = buildWebDetectionContext(webMatch ?? null);
  // eBay searchByImage live match (ADR-ebay-searchbyimage-tagging-2026-07-02): independent
  // evidence source, same conditional-inclusion shape as catalog/web-detection above.
  const ebayMatchContext = buildEbayMatchContext(ebayMatch ?? null);

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
                text: `You are an expert secondary market cataloger for a ${regionConfig.city}, ${regionConfig.state} estate sale marketplace.${labelContext}${sparseImageNote}${compsContext}${catalogMatchContext}${webDetectionContext}${ebayMatchContext}

Analyze this item photo and respond with ONLY valid JSON (no markdown, no explanation).

Accuracy over richness: only state attributes (era, brand, material, maker, category) you can actually SEE or verify from the photos and any visible marks/labels. When unsure, omit the attribute rather than guessing a confident-but-wrong value.
Title guidelines: Start with the most recognizable/searchable keyword. Format: "[Type], [Material or Era], [Maker or Style if visible]". Examples: "Brass Floor Lamp, Art Deco Style", "Oak Dining Chair Set, Mid-Century Modern", "McCoy Pottery Planter, Green Drip Glaze", "Cast Iron Skillet, Lodge 10-inch". Include an era/decade when there is reasonable supporting evidence — style, materials, maker marks, or a date — but do not force it or infer age from wear alone; leave it out when you are genuinely unsure rather than guess. Avoid vague words like "Beautiful" or "Nice".
Description: 1–2 sentences. Lead with searchable keywords buyers use on Google or eBay. Mention material, maker/brand (if visible), era/decade, and standout features. Example: "Solid oak mid-century modern dresser with original brass hardware, circa 1960s. Six drawers, minor surface scratches, no structural damage." Note any maker marks, chips, cracks, or signs of age.
Category: Pick the single best fit by the item's PRIMARY USE/DOMAIN — not its materials or whether it plugs in. A powered device is categorized by what it is FOR (e.g. an aquarium air pump is "Pet Supplies", a guitar amp is "Musical Instruments", a kitchen mixer is "Kitchenware"), NOT "Electronics". Choose from: ${EBAY_L1_CATEGORIES.join(', ')}.
Condition: NEW = unused with tags. USED = minimal to normal wear. REFURBISHED = restored/refurbished by seller. PARTS_OR_REPAIR = damaged, functional only for parts/repair.
Price: Suggest a realistic secondary market price for this item. Do not use retail pricing as a baseline — derive the price from what similar items actually sell for. If comparable sales are provided above, anchor to those. Do not default to round numbers like $5, $10, $20, $25, $50 — derive a specific price from the item's actual characteristics.
Tags: 5–8 short search terms buyers type on Google or eBay. Prioritize: material (Cast Iron, Solid Oak, Sterling Silver, Brass, Copper), era (Mid-Century Modern, Victorian, Art Deco, 1950s, 1960s, Antique, Vintage), maker/brand (McCoy, Pyrex, Fiestaware, Depression Glass) if identifiable, and style (Farmhouse, Industrial, Bohemian). Only add "Vintage" (roughly 20+ years), "Antique" (roughly 100+ years), or a specific era when there is real evidence of age — a datable maker mark, a date, or distinct period styling. Do NOT call an item vintage or antique just because it looks worn, used, or generic; when age is unclear, omit era tags entirely. Examples: "Mid-Century Modern", "Solid Oak", "Cast Iron", "Hand-painted", "Art Deco", "1960s", "McCoy Pottery", "Set of 4".
Confidence: REQUIRED FIELD. Rate your confidence in this identification from 0.0 to 1.0. Use 0.9+ only when item, brand/maker, and era are clearly identifiable. Use 0.7–0.89 when item type is clear but details are uncertain. Use 0.5–0.69 when image is unclear or item is generic. Use below 0.5 when you cannot identify the item. Always include a confidence number.
Model number: If a model number or part number is actually VISIBLE on a label, plate, or marking in the photos (e.g. "Model AP-40", "Part No. 12345", "M/N: XR500"), capture it exactly as printed in the "mpn" field. Evidence-only: include mpn ONLY when you can literally read it from the item — never infer or guess a model number. If no model/part number is visible, set mpn to null or omit it.
UPC: If a barcode or printed UPC/EAN digits are actually VISIBLE in the photos, read the digits exactly as shown and put them in the "upc" field. HARD RULE: never invent a UPC or exact dimensions from memory — a UPC must be visibly present in the photo (as a scannable barcode or printed digits) or omitted. If no UPC is visible, set upc to null or omit it.
Brand: If a brand, maker, or manufacturer name is identifiable from a visible label, tag, stamp, engraving, or is confidently stated in the title/description above, capture it in the "brand" field as a short proper-noun string (e.g. "Cherub", "Pyrex", "McCoy"). Do not guess a brand with no supporting evidence — omit or set null if genuinely unidentifiable. Consistency check (mandatory): if you use a brand/maker name anywhere in the title, tags, or description you write above, you MUST also set that same value in the "brand" field — never state a brand in prose while leaving "brand" null or omitted. The two must always agree.
Shipping package: Estimate the PACKED shipping weight (item + box + padding) in ounces, and the packed box outer dimensions (length, width, height) in inches. Pick the eBay packageType enum that best fits: PACKAGE_THICK_ENVELOPE (thin/flat <12oz), MAILING_BOX (most boxed items), LARGE_PACKAGE (over ~18in any side or heavy), USPS_FLAT_RATE_ENVELOPE (documents/flat). Rate packageConfidence 0.0-1.0 on how sure you are of weight + dimensions. If packageConfidence is below 0.5 (you cannot reasonably estimate size/weight), set estimatedWeightOz, estimatedDimensionsIn, and estimatedPackageType to null — do not guess.

{
  "title": "short specific title",
  "description": "1-2 sentence description with condition details",
  "category": "best matching category",
  "condition": "NEW | USED | REFURBISHED | PARTS_OR_REPAIR",
  "suggestedConditionGrade": "A | B | C | D | F",
  "suggestedPrice": 12.50,
  "tags": ["Tag1", "Tag2", "Tag3"],
  "confidence": 0.85,
  "mpn": null,
  "upc": null,
  "brand": null,
  "estimatedWeightOz": 24,
  "estimatedDimensionsIn": { "length": 10, "width": 8, "height": 6 },
  "estimatedPackageType": "MAILING_BOX",
  "packageConfidence": 0.7
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

    // Fix A: record REAL per-model usage from the response (falls back to the char/4 estimate
    // only when usage is absent). Fix B: count this call toward the absolute daily AI call cap.
    const responseTokens = Math.ceil(content.length / 4) + 50; // estimate fallback only
    await recordAnthropicUsageOrEstimate('anthropic:cloud_ai_tagging', ANTHROPIC_MODEL, response.data.usage, estimatedTokens + responseTokens);
    await trackAICall();

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
    // Task #339: Low-confidence refuse-to-fill for brand + category
    // If confidence < 0.6, clear brand and category to prevent mislabeling
    if (parsed.confidence < 0.6) {
      parsed.category = undefined;
      parsed.brand = undefined;
      // Catalog Enrichment: model number is evidence-only — drop it under low confidence too
      parsed.mpn = undefined;
      // Enrichment Cascade: a UPC must be visibly read, never recalled — drop it under low confidence too
      parsed.upc = undefined;
    }
    // Calculated-shipping: refuse-to-fill package estimate when confidence < 0.5
    // (mirrors the brand/category discipline above). Downstream package estimator
    // will fall back to PackageProfile lookup or its own default.
    if (parsed.packageConfidence == null || parsed.packageConfidence < 0.5) {
      parsed.estimatedWeightOz = undefined;
      parsed.estimatedDimensionsIn = undefined;
      parsed.estimatedPackageType = undefined;
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
    await trackAITokens(estimatedTokens + responseTokens);
    await recordApiUsage('anthropic:cloud_ai_tagging', (estimatedTokens + responseTokens) / 1_000_000 * ANTHROPIC_COST_PER_M_TOKENS);

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
    await trackAITokens(estimatedTokens + responseTokens);
    await recordApiUsage('anthropic:cloud_ai_tagging', (estimatedTokens + responseTokens) / 1_000_000 * ANTHROPIC_COST_PER_M_TOKENS);

    const grade = content.trim().toUpperCase().charAt(0);

    // Validate grade is one of S|A|B|C|D, default to B if invalid
    return ['S', 'A', 'B', 'C', 'D'].includes(grade) ? grade : 'B';
  } catch {
    // Condition grade suggestion is best-effort — default to B on error
    return 'B';
  }
}

/**
 * Fix C: derive curated tags LOCALLY (no Anthropic call) by matching the CURATED_TAGS vocabulary
 * against candidate terms (main-response tags + Vision object labels + detected text). Both sides
 * are normalized (lowercased, non-alphanumerics stripped) so kebab-case vocabulary
 * ('mid-century-modern') matches human-style tags ('Mid-Century Modern'). Capped at 5, matching the
 * old suggestCuratedTags cap. Replaces the separate suggestCuratedTags() Anthropic call.
 */
function deriveCuratedTags(candidateTerms: string[]): string[] {
  const { CURATED_TAGS } = require('../../shared/src/constants/tagVocabulary');
  const norm = (v: string): string => (v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const candidates = candidateTerms.map(norm).filter(Boolean);
  const matched: string[] = [];
  for (const tag of CURATED_TAGS as readonly string[]) {
    const nt = norm(tag);
    if (!nt) continue;
    const hit = candidates.some(
      (c) => c === nt || (nt.length >= 3 && c.includes(nt)) || (c.length >= 4 && nt.includes(c))
    );
    if (hit) {
      matched.push(tag);
      if (matched.length >= 5) break;
    }
  }
  return matched;
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
  if (await isAICostCeilingExceeded()) {
    console.warn('[cloudAI] AI cost ceiling exceeded, returning null for fallback');
    return null;
  }

  // Fix B: absolute daily AI call-count cap — bounded even on a Redis outage (in-memory backstop)
  if (!(await isAIDailyCallCapAvailable())) {
    console.warn('[cloudAI] AI daily call cap reached (AI_DAILY_CALL_CAP), returning null for fallback');
    return null;
  }

  const imageBase64 = buffer.toString('base64');

  // Vision labels are best-effort — proceed without them if Vision API fails.
  // Reverse-Image Product Index (ADR 2026-07-01 §1): catalog-match vector search
  // runs IN PARALLEL with Vision (both are pre-Haiku, independent of each other) —
  // not sequentially after Vision — per the ADR's latency-budget principle.
  // Category hint is unavailable at this point (no prior classification yet), so
  // the search runs unscoped; isCatalogMatchEnabled() short-circuits to a no-op
  // Promise when the feature flag is off or the embedding service isn't configured.
  let objectLabels: string[] = [];
  let detectedText: string[] = [];
  let ocrIsbn: string | undefined;
  let catalogMatches: CatalogMatch[] | null = null;
  let webMatch: { webEntities: string[]; bestGuessLabels: string[] } | null = null;
  let ebayMatch: EbayImageMatch | null = null;
  // Web Detection (ADR-web-detection-hard-gating-2026-07-01): runs in the same parallel batch as
  // Vision + catalog-match. getWebDetectionMatch() is internally gated (kill switch, daily cap,
  // monthly ceiling) and returns null on any gate failure or error — safe to always include here,
  // it is a fast no-op when WEB_DETECTION_ENABLED is not 'true'.
  // eBay searchByImage (ADR-ebay-searchbyimage-tagging-2026-07-02): same parallel pre-Haiku batch.
  // Internally gated (kill switch + daily cap) — fast no-op when EBAY_IMAGE_SEARCH_ENABLED is not 'true'.
  const [visionSettled, catalogSettled, webDetectionSettled, ebaySettled] = await Promise.allSettled([
    getVisionLabels(imageBase64),
    isCatalogMatchEnabled() ? findCatalogMatches(buffer, mimeType) : Promise.resolve(null),
    getWebDetectionMatch(imageBase64),
    getEbayImageMatch(imageBase64),
  ]);
  if (visionSettled.status === 'fulfilled') {
    objectLabels = visionSettled.value.objectLabels;
    detectedText = visionSettled.value.detectedText;
    ocrIsbn = visionSettled.value.ocrIsbn;
  }
  // Vision API unavailable or quota exceeded — Haiku will analyse image alone (unchanged behavior)
  if (catalogSettled.status === 'fulfilled') {
    catalogMatches = catalogSettled.value;
  }
  // catalog match failure is silent/non-blocking — imageMatchService never throws,
  // but Promise.allSettled is used defensively in case that contract ever changes
  if (webDetectionSettled.status === 'fulfilled') {
    webMatch = webDetectionSettled.value;
  }
  if (ebaySettled.status === 'fulfilled') {
    ebayMatch = ebaySettled.value;
  }
  // getWebDetectionMatch() never throws (returns null on error) — allSettled defensive as above

  const result = await getHaikuAnalysis(imageBase64, mimeType, objectLabels, detectedText, comps, catalogMatches, webMatch, ebayMatch);
  if (ocrIsbn) result.ocrIsbn = ocrIsbn; // ADR-089: thread OCR-derived ISBN onto the analysis result

  // Fix C: curated tag suggestions derived LOCALLY (no extra Anthropic call). Match the curated
  // vocabulary against the main-response tags + Vision object labels + detected text.
  try {
    result.suggestedTags = deriveCuratedTags([...(result.tags ?? []), ...objectLabels, ...detectedText]);
  } catch {
    result.suggestedTags = [];
  }

  // Fix C: use the condition grade already returned by the main analysis call
  // (parsed.suggestedConditionGrade in getHaikuAnalysis) instead of a second Anthropic call.
  // Default 'B' when the model omitted it, matching the old suggestConditionGrade fallback.
  if (!result.suggestedConditionGrade) {
    result.suggestedConditionGrade = 'B';
  }

  return result;
}


type VisionFrameResult = {
  index: number;
  buffer: Buffer;
  mimeType: string;
  qualityScore: number;
  objectLabels: string[];
  detectedText: string[];
};

/**
 * Pick the best single frame to send to eBay searchByImage from the per-photo Vision
 * results. eBay reverse-image match is far stronger on the frame with the most on-item
 * TEXT (brand marks, model numbers, labels) than on an arbitrary primary photo, so we
 * score each frame by the total character length of its detected-text tokens.
 * Tiebreak: higher Vision qualityScore. Fallback: if NO frame has any detected text,
 * return index 0 — preserving today's "primary photo" behavior for text-free items.
 */
function selectBestEbayFrame(allVisionResults: VisionFrameResult[]): string {
  if (allVisionResults.length === 0) return '';
  const textScore = (r: VisionFrameResult): number =>
    (r.detectedText || []).reduce((sum, t) => sum + (typeof t === 'string' ? t.length : 0), 0);

  let best = allVisionResults[0];
  let bestScore = textScore(best);
  for (const r of allVisionResults) {
    const score = textScore(r);
    if (score > bestScore || (score === bestScore && r.qualityScore > best.qualityScore)) {
      best = r;
      bestScore = score;
    }
  }
  // No detected text anywhere → preserve legacy behavior (primary/index-0 frame).
  const chosen = bestScore === 0 ? (allVisionResults.find((r) => r.index === 0) ?? allVisionResults[0]) : best;
  return chosen.buffer.toString('base64');
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
  if (await isAICostCeilingExceeded()) {
    console.warn('[cloudAI] AI cost ceiling exceeded, returning null for fallback');
    return null;
  }

  // Fix B: absolute daily AI call-count cap — bounded even on a Redis outage (in-memory backstop)
  if (!(await isAIDailyCallCapAvailable())) {
    console.warn('[cloudAI] AI daily call cap reached (AI_DAILY_CALL_CAP), returning null for fallback');
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

  // Enhancement 2 + ADR-069 Phase 1: Single Vision pass per photo — derives both
  // quality score (for best-photo-first sorting) and labels (for Haiku context).
  // Previously: two separate Vision calls per photo (computePhotoQualityScore + getVisionLabels).
  // Now: getVisionLabels() returns { objectLabels, detectedText, qualityScore } in one API call —
  // kept separate (not flattened) so Haiku can weight on-item text above shape-based guesses.
  let photoOrderIndices: number[] = Array.from({ length: buffers.length }, (_, i) => i);
  let objectLabels: string[] = [];
  let detectedText: string[] = [];
  let ocrIsbn: string | undefined; // ADR-089: first checksum-valid ISBN across all photos
  // Reverse-Image Product Index (ADR 2026-07-01 §1): catalog-match vector search
  // runs IN PARALLEL with the per-photo Vision pass below (both are pre-Haiku,
  // independent of each other) — not sequentially after Vision. Uses the FIRST
  // buffer (primary photo) as the query image; no category hint is available yet
  // at this point in the pipeline, so the search runs unscoped.
  const catalogMatchPromise: Promise<CatalogMatch[] | null> = isCatalogMatchEnabled()
    ? findCatalogMatches(buffers[0], types[0]).catch(() => null)
    : Promise.resolve(null);
  // Web Detection (ADR-web-detection-hard-gating-2026-07-01): same "compute early on the
  // ORIGINAL primary photo, await after the Vision reorder pass" shape as catalogMatchPromise
  // above — the reorder loop below mutates buffers/types/imageBase64Array in place, so capture
  // the primary-photo base64 now, before any mutation. Internally gated — safe no-op when off.
  const webDetectionPromise: Promise<{ webEntities: string[]; bestGuessLabels: string[] } | null> =
    getWebDetectionMatch(imageBase64Array[0]).catch(() => null);
  // eBay searchByImage runs once per item on the BEST frame (most on-item text), chosen
  // from the per-photo Vision results below. Deferred — kicked off inside the try after
  // allVisionResults resolves but before the reorder loop mutates imageBase64Array, so it
  // reads pre-reorder buffers (mutation-safe, same as catalog/web capturing the ORIGINAL
  // primary). Internally gated; safe no-op when disabled.
  let ebayImageSearchPromise: Promise<EbayImageMatch | null> = Promise.resolve(null);
  try {
    const allVisionResults = await Promise.all(
      imageBase64Array.map((b64, idx) =>
        getVisionLabels(b64)
          .then(res => ({ index: idx, buffer: buffers[idx], mimeType: types[idx], qualityScore: res.qualityScore, objectLabels: res.objectLabels, detectedText: res.detectedText, ocrIsbn: res.ocrIsbn as string | undefined }))
          .catch(() => ({ index: idx, buffer: buffers[idx], mimeType: types[idx], qualityScore: 0, objectLabels: [] as string[], detectedText: [] as string[], ocrIsbn: undefined as string | undefined }))
      )
    );

    // eBay best-frame: choose the frame with the most on-item text and kick off the
    // (internally gated) reverse-image lookup NOW — this reads allVisionResults buffers,
    // which are the PRE-reorder buffers, so it is mutation-safe (the reorder loop below
    // only mutates buffers/types/imageBase64Array in place). Awaited later alongside
    // catalog/web so it does not serialize with the Haiku call.
    ebayImageSearchPromise = getEbayImageMatch(selectBestEbayFrame(allVisionResults)).catch(() => null);

    // Sort by quality score (descending) — highest score first (best-photo-first)
    const photosWithScores = [...allVisionResults].sort((a, b) => b.qualityScore - a.qualityScore);

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

    // Collect deduplicated object/shape labels and detected text separately from all photos (cap at 20 each)
    const allObjectLabels: string[] = allVisionResults.flatMap(r => r.objectLabels);
    const allDetectedText: string[] = allVisionResults.flatMap(r => r.detectedText);
    objectLabels = Array.from(new Set(allObjectLabels)).slice(0, 20);
    detectedText = Array.from(new Set(allDetectedText)).slice(0, 20);
    ocrIsbn = allVisionResults.map(r => r.ocrIsbn).find((v): v is string => !!v);
  } catch {
    // Vision pass failed — proceed with original order and no labels (non-blocking)
  }

  const catalogMatches = await catalogMatchPromise;
  const webMatch = await webDetectionPromise;
  const ebayMatch = await ebayImageSearchPromise;
  console.log(
    ebayMatch
      ? `[ebayImageSearch] passed into Haiku call — matched title="${ebayMatch.topTitle}"`
      : '[ebayImageSearch] no eBay match passed into Haiku call (ebayMatch=null)'
  );
  console.log(
    webMatch
      ? `[webDetection] passed into Haiku call — bestGuess=[${webMatch.bestGuessLabels.slice(0, 5).join(', ')}]`
      : '[webDetection] no web match passed into Haiku call (webMatch=null)'
  );

  // Multi-image Haiku analysis (Phase 2: pass clusterPhotos for role context)
  const result = await getHaikuAnalysisMultiImage(imageBase64Array, types, objectLabels, detectedText, comps, clusterPhotos, catalogMatches, webMatch, ebayMatch);
  if (ocrIsbn) result.ocrIsbn = ocrIsbn; // ADR-089: thread OCR-derived ISBN onto the analysis result

  // Fix C: curated tag suggestions derived LOCALLY (no extra Anthropic call). Match the curated
  // vocabulary against the main-response tags + Vision object labels + detected text.
  try {
    result.suggestedTags = deriveCuratedTags([...(result.tags ?? []), ...objectLabels, ...detectedText]);
  } catch {
    result.suggestedTags = [];
  }

  // Fix C: use the condition grade already returned by the main analysis call
  // (parsed.suggestedConditionGrade in getHaikuAnalysisMultiImage) instead of a second Anthropic
  // call. Default 'B' when the model omitted it, matching the old suggestConditionGrade fallback.
  if (!result.suggestedConditionGrade) {
    result.suggestedConditionGrade = 'B';
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
  objectLabels: string[],
  detectedText: string[],
  comps?: ComparableSale[],
  clusterPhotos?: ClusterPhoto[],
  catalogMatches?: CatalogMatch[] | null,
  webMatch?: { webEntities: string[]; bestGuessLabels: string[] } | null,
  ebayMatch?: EbayImageMatch | null
): Promise<AITagResult> {
  const labelContext =
    objectLabels.length > 0 || detectedText.length > 0
      ? `\n\n${detectedText.length > 0 ? `Text detected ON the item (labels, plates, engravings, printed marks): ${detectedText.join(', ')}.` : ''}${objectLabels.length > 0 ? `${detectedText.length > 0 ? ' ' : ''}General visual/shape classification (Vision API, lower reliability for close visual look-alikes): ${objectLabels.join(', ')}.` : ''}\n\nEvidence hierarchy — text overrides shape: You are given two separate categories of visual evidence. (1) Text detected ON the item (labels, plates, engravings, stamps, tags, printed or embossed marks) — this is HIGH-reliability evidence because it directly names or identifies the item. (2) General visual/shape classification from the Vision API (object and label detection) — this is LOWER-reliability evidence based only on silhouette, shape, and general appearance, and it frequently misidentifies items that look visually similar but are functionally different (for example: small dial or gauge instruments of different kinds, stackable containers made of different materials, or differently-shaped items within the same broad category). When the two categories conflict, ALWAYS trust the legible on-item text, brand mark, model plate, engraving, or printed label over the generic shape-based classification — override the shape-based guess with what the text actually says. This rule applies uniformly to every item category (furniture, pottery and ceramics, books and media, appliances, tools, clothing, toys, collectibles, and anything else) — do not special-case any single category.`
      : '';

  const GENERIC_LABELS = new Set(['glass', 'black', 'darkness', 'white', 'transparent', 'product', 'still life', 'object']);
  const specificLabels = objectLabels.filter(l => !GENERIC_LABELS.has(l.toLowerCase()));
  const sparseImageNote = specificLabels.length < 3 && detectedText.length === 0
    ? '\n\nNote: The image may contain a dark-colored or transparent/reflective item. Identify the object by its silhouette, shape, proportions, and any visible text, markings, or contextual clues rather than surface color or material appearance.'
    : '';

  const compsContext = comps && comps.length > 0
    ? `\n\nRecent comparable sales for this category: ${comps.map(c => `"${c.title}" sold for $${c.price}`).join('; ')}. Use these as your primary pricing reference.`
    : '';

  // Reverse-Image Product Index (ADR 2026-07-01 §1): same conditional-inclusion
  // evidence pattern as the single-image path in getHaikuAnalysis above.
  const catalogMatchContext = buildCatalogMatchContext(catalogMatches ?? null);
  const webDetectionContext = buildWebDetectionContext(webMatch ?? null);
  // eBay searchByImage live match (ADR-ebay-searchbyimage-tagging-2026-07-02): independent
  // evidence source, same conditional-inclusion shape as catalog/web-detection above.
  const ebayMatchContext = buildEbayMatchContext(ebayMatch ?? null);

  const roleContext = buildRoleContextPrompt(clusterPhotos);

  const imageCount = imageBase64Array.length;
  const multiImagePrompt = imageCount > 1
    ? `You are analyzing ${imageCount} photos of the same item from different angles.`
    : 'You are analyzing a photo of an item.';

  try {
    const systemPrompt = `You are an expert secondary market cataloger for a ${regionConfig.city}, ${regionConfig.state} estate sale marketplace.${labelContext}${catalogMatchContext}${webDetectionContext}${ebayMatchContext}

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
      text: `${multiImagePrompt} Use all images to determine the best title, category, condition grade, description, and estimated price. Pay particular attention to any brand labels, tags, or markings visible in any of the photos.${labelContext}${sparseImageNote}${compsContext}${catalogMatchContext}${webDetectionContext}${ebayMatchContext}${roleContext}

Analyze and respond with ONLY valid JSON (no markdown, no explanation).

Accuracy over richness: only state attributes (era, brand, material, maker, category) you can actually SEE or verify from the photos and any visible marks/labels. When unsure, omit the attribute rather than guessing a confident-but-wrong value.
Title guidelines: Start with the most recognizable/searchable keyword. Format: "[Type], [Material or Era], [Maker or Style if visible]". Examples: "Brass Floor Lamp, Art Deco Style", "Oak Dining Chair Set, Mid-Century Modern", "McCoy Pottery Planter, Green Drip Glaze", "Cast Iron Skillet, Lodge 10-inch". Include an era/decade when there is reasonable supporting evidence — style, materials, maker marks, or a date — but do not force it or infer age from wear alone; leave it out when you are genuinely unsure rather than guess. Avoid vague words like "Beautiful" or "Nice".
Description: 1–2 sentences. Lead with searchable keywords buyers use on Google or eBay. Mention material, maker/brand (if visible), era/decade, and standout features. Example: "Solid oak mid-century modern dresser with original brass hardware, circa 1960s. Six drawers, minor surface scratches, no structural damage." Note any maker marks, chips, cracks, or signs of age.
Category: Pick the single best fit by the item's PRIMARY USE/DOMAIN — not its materials or whether it plugs in. A powered device is categorized by what it is FOR (e.g. an aquarium air pump is "Pet Supplies", a guitar amp is "Musical Instruments", a kitchen mixer is "Kitchenware"), NOT "Electronics". Choose from: ${EBAY_L1_CATEGORIES.join(', ')}.
Condition: NEW = unused with tags. USED = minimal to normal wear. REFURBISHED = restored/refurbished by seller. PARTS_OR_REPAIR = damaged, functional only for parts/repair.
Price: Suggest a realistic secondary market price for this item. Do not use retail pricing as a baseline — derive the price from what similar items actually sell for. If comparable sales are provided above, anchor to those. Do not default to round numbers like $5, $10, $20, $25, $50 — derive a specific price from the item's actual characteristics.
Tags: 5–8 short search terms buyers type on Google or eBay. Prioritize: material (Cast Iron, Solid Oak, Sterling Silver, Brass, Copper), era (Mid-Century Modern, Victorian, Art Deco, 1950s, 1960s, Antique, Vintage), maker/brand (McCoy, Pyrex, Fiestaware, Depression Glass) if identifiable, and style (Farmhouse, Industrial, Bohemian). Only add "Vintage" (roughly 20+ years), "Antique" (roughly 100+ years), or a specific era when there is real evidence of age — a datable maker mark, a date, or distinct period styling. Do NOT call an item vintage or antique just because it looks worn, used, or generic; when age is unclear, omit era tags entirely. Examples: "Mid-Century Modern", "Solid Oak", "Cast Iron", "Hand-painted", "Art Deco", "1960s", "McCoy Pottery", "Set of 4".
Confidence: REQUIRED FIELD. Rate your confidence in this identification from 0.0 to 1.0. Use 0.9+ only when item, brand/maker, and era are clearly identifiable. Use 0.7–0.89 when item type is clear but details are uncertain. Use 0.5–0.69 when image is unclear or item is generic. Use below 0.5 when you cannot identify the item. Always include a confidence number.
Model number: If a model number or part number is actually VISIBLE on a label, plate, or marking in any of the photos (e.g. "Model AP-40", "Part No. 12345", "M/N: XR500"), capture it exactly as printed in the "mpn" field. Evidence-only: include mpn ONLY when you can literally read it from the item — never infer or guess a model number. If no model/part number is visible, set mpn to null or omit it.
UPC: If a barcode or printed UPC/EAN digits are actually VISIBLE in any of the photos, read the digits exactly as shown and put them in the "upc" field. HARD RULE: never invent a UPC or exact dimensions from memory — a UPC must be visibly present in the photo (as a scannable barcode or printed digits) or omitted. If no UPC is visible, set upc to null or omit it.
Brand: If a brand, maker, or manufacturer name is identifiable from a visible label, tag, stamp, engraving, or is confidently stated in the title/description above, capture it in the "brand" field as a short proper-noun string (e.g. "Cherub", "Pyrex", "McCoy"). Do not guess a brand with no supporting evidence — omit or set null if genuinely unidentifiable. Consistency check (mandatory): if you use a brand/maker name anywhere in the title, tags, or description you write above, you MUST also set that same value in the "brand" field — never state a brand in prose while leaving "brand" null or omitted. The two must always agree.

{
  "title": "short specific title",
  "description": "1-2 sentence description with condition details",
  "category": "best matching category",
  "condition": "NEW | USED | REFURBISHED | PARTS_OR_REPAIR",
  "suggestedConditionGrade": "A | B | C | D | F",
  "suggestedPrice": 12.50,
  "tags": ["Tag1", "Tag2", "Tag3"],
  "confidence": 0.85,
  "mpn": null,
  "upc": null,
  "brand": null
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

    // Fix A: record REAL per-model usage. Fix B: count toward the daily AI call cap.
    const responseTokens = Math.ceil(content.length / 4) + 50; // estimate fallback only
    await recordAnthropicUsageOrEstimate('anthropic:cloud_ai_tagging', ANTHROPIC_MODEL, response.data.usage, estimatedTokens + responseTokens);
    await trackAICall();

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
    // Task #339: Low-confidence refuse-to-fill for brand + category
    // If confidence < 0.6, clear brand and category to prevent mislabeling
    if (parsed.confidence < 0.6) {
      parsed.category = undefined;
      parsed.brand = undefined;
      // Catalog Enrichment: model number is evidence-only — drop it under low confidence too
      parsed.mpn = undefined;
      // Enrichment Cascade: a UPC must be visibly read, never recalled — drop it under low confidence too
      parsed.upc = undefined;
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
  if (await isAICostCeilingExceeded()) {
    console.warn('[cloudAI] AI cost ceiling exceeded, returning null for sale description');
    return null;
  }

  // Fix B: absolute daily AI call-count cap
  if (!(await isAIDailyCallCapAvailable())) {
    console.warn('[cloudAI] AI daily call cap reached (AI_DAILY_CALL_CAP), returning null for sale description');
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

    // Fix A: record REAL per-model usage. Fix B: count toward the daily AI call cap.
    const responseTokens = Math.ceil(text.length / 4) + 100; // estimate fallback only
    await recordAnthropicUsageOrEstimate('anthropic:cloud_ai_tagging', ANTHROPIC_MODEL, response.data.usage, estimatedTokens + responseTokens);
    await trackAICall();

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
  comps?: ComparableSale[],
  currentPrice?: number
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
  if (await isAICostCeilingExceeded()) {
    console.warn('[cloudAI] AI cost ceiling exceeded, returning fallback price');
    return {
      low: 5,
      high: 25,
      suggested: 15,
      reasoning: 'Manual pricing recommended (AI service temporarily unavailable)',
    };
  }

  // Fix B: absolute daily AI call-count cap
  if (!(await isAIDailyCallCapAvailable())) {
    console.warn('[cloudAI] AI daily call cap reached (AI_DAILY_CALL_CAP), returning fallback price');
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

    const currentPriceContext = currentPrice && currentPrice > 0
      ? `\nThe organizer has currently priced this item at $${currentPrice}. If your suggested price differs from this by more than 30%, explain why clearly in your reasoning.`
      : '';

    const prompt = `You are a secondary market pricing expert. Suggest a realistic price for this item based on what it actually sells for in the secondary market.

Item: ${title}
Category: ${category}
Condition: ${condition}
${currentPriceContext}

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

    // Fix A: record REAL per-model usage. Fix B: count toward the daily AI call cap.
    const responseTokens = Math.ceil(content.length / 4) + 75; // estimate fallback only
    await recordAnthropicUsageOrEstimate('anthropic:cloud_ai_tagging', ANTHROPIC_MODEL, response.data.usage, estimatedTokens + responseTokens);
    await trackAICall();

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

  // Fix B: absolute daily AI call cap — degrade to one-item-per-photo (same as the error fallback)
  if (!(await isAIDailyCallCapAvailable())) {
    console.warn('[cloudAI] AI daily call cap reached (AI_DAILY_CALL_CAP), skipping clustering');
    return {
      clusters: [],
      ungrouped: Array.from({ length: imageBase64Array.length }, (_, i) => ({
        index: i,
        photoRole: 'UNKNOWN' as const,
        roleReasoning: 'Daily AI call cap reached; defaulted to UNKNOWN',
      })),
    };
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

    // Fix A: record REAL per-model usage. Fix B: count toward the daily AI call cap.
    const responseTokens = Math.ceil(content.length / 4) + 50; // estimate fallback only
    await recordAnthropicUsageOrEstimate('anthropic:cloud_ai_tagging', ANTHROPIC_MODEL, response.data.usage, estimatedTokens + responseTokens);
    await trackAICall();

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
