/**
 * typologyService.ts — Feature #46: Treasure Typology Classifier
 *
 * AI-powered classification of items into collector categories (Art Deco, MCM, etc.)
 * using Claude Haiku vision API. Stores classifications with confidence scores
 * and organizer correction feedback.
 *
 * Sprint 1: Classification service + API
 */

import axios from 'axios';
import { prisma } from '../lib/prisma';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

interface ClassificationResult {
  category: string;
  confidence: number;
  secondaryCategory?: string;
  secondaryConfidence?: number;
  reasoning?: string;
}

/**
 * Fetch a remote image and convert to base64
 */
async function imageUrlToBase64(imageUrl: string): Promise<string> {
  try {
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 15000,
    });
    const buffer = Buffer.from(response.data, 'binary');
    return buffer.toString('base64');
  } catch (error) {
    console.error('[Typology] Error fetching image from URL:', imageUrl, error);
    throw new Error('Failed to fetch item photo');
  }
}

/**
 * Call Claude Haiku vision API to classify item into a typology category
 */
async function callHaikuClassification(imageBase64: string): Promise<ClassificationResult> {
  try {
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
                  media_type: 'image/jpeg',
                  data: imageBase64,
                },
              },
              {
                type: 'text',
                text: `You are an expert in decorative and functional item classification.
Analyze this item photo and classify it into exactly ONE primary typology category.

Categories (with examples):
- ART_DECO: Geometric, streamlined, 1920s–1930s (furniture, lamps, vases)
- MID_CENTURY_MODERN: Clean lines, tapered legs, 1940s–1970s (chairs, tables, sideboards)
- AMERICANA: Folk art, Americana flags, quilts, rustic 19th–early 20th century
- VICTORIAN: Heavy ornament, dark wood, marble, 1837–1901 (dressers, sofas, mirrors)
- INDUSTRIAL: Exposed metal, factory-inspired, reclaimed materials (shelving, lighting)
- FARMHOUSE: Distressed wood, vintage signage, shiplap-inspired, early 20th century rural
- RETRO_ATOMIC: 1950s–1960s popular culture, boomerangs, starburst, chrome (lamps, clocks)
- PRIMITIVE_FOLK_ART: Handmade, naive style, rustic wood or ceramic, any era
- ART_NOUVEAU: Curved organic forms, nature motifs, 1890s–1910s (vases, mirrors, jewelry)
- CONTEMPORARY: Modern materials, minimal, post-1990s (glass, plastic, steel)
- OTHER: None of the above

Respond ONLY with valid JSON (no markdown, no explanation):
{
  "primaryCategory": "CATEGORY_NAME",
  "primaryConfidence": 0.85,
  "secondaryCategory": "CATEGORY_NAME_OR_NULL",
  "reasoning": "This is a..." (1 sentence)
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
    const parsed = JSON.parse(raw) as ClassificationResult;

    return {
      category: parsed.primaryCategory as string,
      confidence: parsed.primaryConfidence as number,
      secondaryCategory: parsed.secondaryCategory as string | undefined,
      secondaryConfidence: parsed.secondaryConfidence as number | undefined,
      reasoning: parsed.reasoning as string | undefined,
    };
  } catch (error: any) {
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

/**
 * Classify a single item into a typology category.
 * Fetches item photo, calls Haiku API, stores result in DB.
 *
 * Returns the stored ItemTypology record.
 */
export async function classifyItem(itemId: string): Promise<any> {
  try {
    // Fetch the item with photo URLs
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: { sale: true },
    });

    if (!item) {
      throw new Error(`Item ${itemId} not found`);
    }

    // Check if item already has typology classification
    const existing = await prisma.itemTypology.findUnique({
      where: { itemId },
    });

    if (existing && !existing.organizer_reviewed) {
      // Already classified, return existing
      return existing;
    }

    // Require primary photo
    if (!item.photoUrls || item.photoUrls.length === 0) {
      throw new Error('Item has no photos for classification');
    }

    // Get primary photo (first in array)
    const photoUrl = item.photoUrls[0];
    const imageBase64 = await imageUrlToBase64(photoUrl);

    // Call Haiku API
    const classification = await callHaikuClassification(imageBase64);

    // Validate category against enum
    const validCategories = [
      'ART_DECO',
      'MID_CENTURY_MODERN',
      'AMERICANA',
      'VICTORIAN',
      'INDUSTRIAL',
      'FARMHOUSE',
      'RETRO_ATOMIC',
      'PRIMITIVE_FOLK_ART',
      'ART_NOUVEAU',
      'CONTEMPORARY',
      'OTHER',
    ];

    if (!validCategories.includes(classification.category)) {
      throw new Error(`Invalid category from AI: ${classification.category}`);
    }

    // If primary confidence < 0.5, clear secondary category
    let secondaryCategory = classification.secondaryCategory;
    let secondaryConfidence = classification.secondaryConfidence;
    if (classification.confidence < 0.5) {
      secondaryCategory = null;
      secondaryConfidence = null;
    }

    // Store in DB
    const typology = await prisma.itemTypology.upsert({
      where: { itemId },
      create: {
        itemId,
        primaryCategory: classification.category,
        primaryConfidence: classification.confidence,
        secondaryCategory: secondaryCategory || null,
        secondaryConfidence: secondaryConfidence || null,
        rawResponse: classification,
      },
      update: {
        primaryCategory: classification.category,
        primaryConfidence: classification.confidence,
        secondaryCategory: secondaryCategory || null,
        secondaryConfidence: secondaryConfidence || null,
        rawResponse: classification,
        updatedAt: new Date(),
      },
    });

    console.log(
      `[Typology] Classified item ${itemId} as ${classification.category} (${Math.round(
        classification.confidence * 100
      )}% confidence)`
    );

    return typology;
  } catch (error) {
    console.error('[Typology] Error classifying item', itemId, error);
    throw error;
  }
}

/**
 * Batch classify all items in a sale that lack a typology classification.
 * Processes up to 20 items at a time to avoid API rate limits.
 *
 * Returns summary of classifications completed and failures.
 */
export async function batchClassify(saleId: string): Promise<{ classified: number; failed: number }> {
  try {
    // Find all items in this sale without typology
    const itemsToClassify = await prisma.item.findMany({
      where: {
        saleId,
        typology: null,
      },
      take: 20, // Process max 20 per batch
      select: { id: true },
    });

    let classified = 0;
    let failed = 0;

    for (const item of itemsToClassify) {
      try {
        await classifyItem(item.id);
        classified++;
      } catch (error) {
        console.error(`[Typology] Failed to classify item ${item.id}:`, error);
        failed++;
        // Don't throw — allow batch to continue
      }
    }

    console.log(
      `[Typology] Batch classification complete: ${classified} succeeded, ${failed} failed`
    );

    return { classified, failed };
  } catch (error) {
    console.error('[Typology] Error in batch classification for sale', saleId, error);
    throw error;
  }
}

/**
 * Get existing typology for an item (cached)
 */
export async function getTypology(itemId: string): Promise<any | null> {
  try {
    return await prisma.itemTypology.findUnique({
      where: { itemId },
    });
  } catch (error) {
    console.error('[Typology] Error getting typology for item', itemId, error);
    throw error;
  }
}

/**
 * Record organizer correction to a typology classification
 */
export async function updateTypology(
  itemId: string,
  correctedTo: string,
  reason?: string
): Promise<any> {
  try {
    // Validate category
    const validCategories = [
      'ART_DECO',
      'MID_CENTURY_MODERN',
      'AMERICANA',
      'VICTORIAN',
      'INDUSTRIAL',
      'FARMHOUSE',
      'RETRO_ATOMIC',
      'PRIMITIVE_FOLK_ART',
      'ART_NOUVEAU',
      'CONTEMPORARY',
      'OTHER',
    ];

    if (!validCategories.includes(correctedTo)) {
      throw new Error(`Invalid category: ${correctedTo}`);
    }

    // Update typology record
    const typology = await prisma.itemTypology.update({
      where: { itemId },
      data: {
        organizer_reviewed: true,
        organizer_correctedTo: correctedTo,
        correctionReason: reason || null,
        updatedAt: new Date(),
      },
    });

    console.log(`[Typology] Organizer corrected item ${itemId} to ${correctedTo}`);

    return typology;
  } catch (error) {
    console.error('[Typology] Error updating typology for item', itemId, error);
    throw error;
  }
}
