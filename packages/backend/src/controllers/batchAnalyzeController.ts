/**
 * batchAnalyzeController.ts — CD2 Phase 2
 *
 * Batch AI analysis for Cloudinary image URLs.
 * Processes 5–20 photos without upload — photos already exist in Cloudinary.
 * Returns AI suggestions for each photo as a batch.
 */

import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { analyzeItemImage, isCloudAIAvailable } from '../services/cloudAIService';
import axios from 'axios';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://host.docker.internal:11434';
const OLLAMA_VISION_MODEL = process.env.OLLAMA_VISION_MODEL || 'qwen3-vl:4b';

interface BatchAnalysisResult {
  photoUrl: string;
  suggestedTitle: string;
  suggestedDescription: string;
  suggestedCategory: string;
  suggestedCondition: string;
  suggestedPrice: number;
  suggestedTags: string[];
  confidence: 'high' | 'medium' | 'low';
  error?: string;
}

/**
 * POST /api/upload/batch-analyze
 *
 * Body: { imageUrls: string[] } — array of Cloudinary URLs (already uploaded)
 *
 * For each URL:
 *   1. Download the image
 *   2. Run Google Vision + Claude Haiku (or Ollama fallback)
 *   3. Return AI suggestions
 *
 * Process up to 20 images, max 10 concurrent.
 * Return partial results if individual images fail.
 */
export const batchAnalyzeImages = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user || req.user.role !== 'ORGANIZER') {
      res.status(403).json({ message: 'Access denied. Organizer access required.' });
      return;
    }

    const { imageUrls } = req.body;

    if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
      res.status(400).json({ error: 'imageUrls must be a non-empty array' });
      return;
    }

    if (imageUrls.length > 20) {
      res.status(400).json({ error: 'Maximum 20 images allowed per batch' });
      return;
    }

    // CB5: Updated Ollama fallback prompt to match cloud AI output format (includes tags).
    const ollamaPrompt = `You are an estate sale pricing assistant. Look at this image and respond with ONLY valid JSON (no markdown, no explanation) in this exact format:
{
  "title": "short specific title (include material, era, or maker if visible)",
  "description": "1-2 sentence description mentioning condition and notable features",
  "category": "one of: Furniture, Electronics, Clothing, Books, Kitchenware, Tools, Art, Jewelry, Toys, Sports, Collectibles, Glassware, Linens, Other",
  "condition": "one of: NEW, LIKE_NEW, GOOD, FAIR, POOR",
  "suggestedPrice": 12.50,
  "suggestedTags": ["Tag1", "Tag2", "Tag3"]
}`;

    const useCloudAI = isCloudAIAvailable();

    // Process images with concurrency limit (max 10 concurrent)
    const results: BatchAnalysisResult[] = [];
    const CONCURRENCY_LIMIT = 10;

    for (let i = 0; i < imageUrls.length; i += CONCURRENCY_LIMIT) {
      const batch = imageUrls.slice(i, i + CONCURRENCY_LIMIT);

      const batchResults = await Promise.allSettled(
        batch.map(async (photoUrl: string) => {
          // Download image from Cloudinary
          let imageBuffer: Buffer;
          try {
            const response = await axios.get(photoUrl, {
              responseType: 'arraybuffer',
              timeout: 15000,
            });
            imageBuffer = Buffer.from(response.data);
          } catch (err: any) {
            return {
              photoUrl,
              error: `Failed to download image: ${(err as Error)?.message ?? 'Unknown error'}`,
            } as Partial<BatchAnalysisResult>;
          }

          // AI analysis (best-effort)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let ai: Record<string, any> | null = null;

          if (useCloudAI) {
            try {
              ai = await analyzeItemImage(imageBuffer, 'image/jpeg');
            } catch {
              // Cloud AI failed — fall through to Ollama
            }
          }

          if (!ai) {
            try {
              const base64Image = imageBuffer.toString('base64');
              const aiResponse = await axios.post(
                `${OLLAMA_URL}/api/generate`,
                {
                  model: OLLAMA_VISION_MODEL,
                  prompt: ollamaPrompt,
                  images: [base64Image],
                  stream: false,
                },
                { timeout: 45000 }
              );
              const raw = aiResponse.data.response
                .replace(/```json\n?|\n?```/g, '')
                .trim();
              ai = JSON.parse(raw);
            } catch {
              // AI unavailable — organizer fills in manually
            }
          }

          if (!ai) {
            return {
              photoUrl,
              error: 'AI analysis unavailable for this image',
            } as Partial<BatchAnalysisResult>;
          }

          // Map AI response to our result format
          const result: BatchAnalysisResult = {
            photoUrl,
            suggestedTitle: (ai.title as string) || 'Item',
            suggestedDescription:
              (ai.description as string) || 'No description available',
            suggestedCategory: (ai.category as string) || 'Other',
            suggestedCondition: (ai.condition as string) || 'GOOD',
            suggestedPrice: (ai.suggestedPrice as number) || 10,
            suggestedTags: Array.isArray(ai.suggestedTags)
              ? (ai.suggestedTags as string[])
              : [],
            confidence: 'medium', // Default to medium; could be refined with model confidence scores
          };

          return result;
        })
      );

      // Collect results from this batch
      batchResults.forEach((r) => {
        if (r.status === 'fulfilled') {
          results.push(r.value as BatchAnalysisResult);
        } else {
          results.push({
            photoUrl: '(unknown)',
            suggestedTitle: 'Error',
            suggestedDescription: (r.reason as Error)?.message ?? 'Analysis failed',
            suggestedCategory: 'Other',
            suggestedCondition: 'GOOD',
            suggestedPrice: 10,
            suggestedTags: [],
            confidence: 'low',
            error: (r.reason as Error)?.message ?? 'Failed to analyze',
          });
        }
      });
    }

    res.json({
      results,
      totalProcessed: results.length,
      successCount: results.filter((r) => !r.error).length,
    });
  } catch (error) {
    console.error('batchAnalyzeImages error:', error);
    res.status(500).json({ error: 'Batch analysis failed' });
  }
};
