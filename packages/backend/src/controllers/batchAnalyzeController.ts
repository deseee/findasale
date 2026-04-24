/**
 * batchAnalyzeController.ts — ADR-069 Phase 1
 *
 * Batch AI analysis for Cloudinary image URLs with clustering support.
 * Processes 5–20 photos without upload — photos already exist in Cloudinary.
 *
 * NEW FLOW (clustering-first):
 * 1. Receive up to 20 photos
 * 2. Call Haiku clustering to group related items into sets
 * 3. Create one Item per cluster (not per photo)
 * 4. Analyze each cluster in parallel
 * 5. Return cluster summaries (no confidence badges per locked decision 5)
 */

import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import {
  analyzeItemImages,
  isCloudAIAvailable,
  clusterPhotos,
  ClusterPhoto
} from '../services/cloudAIService';
import { prisma } from '../lib/prisma';
import axios from 'axios';
import { trackCloudinaryServe } from '../lib/cloudinaryBandwidthTracker';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://host.docker.internal:11434';
const OLLAMA_VISION_MODEL = process.env.OLLAMA_VISION_MODEL || 'qwen3-vl:4b';

interface ClusterSummary {
  itemId: string;
  photoIndices: number[];
  isSet: boolean;
  quantity: number;
  suggestedTitle: string;
  suggestedDescription?: string;
  suggestedCategory?: string;
  suggestedCondition?: string;
  suggestedPrice?: number;
  suggestedTags?: string[];
  aiConfidence?: number;
}

interface BatchAnalysisResponse {
  clusters: ClusterSummary[];
  totalProcessed: number;
  successCount: number;
}

/**
 * POST /api/upload/batch-analyze
 *
 * Body: { imageUrls: string[] } — array of Cloudinary URLs (already uploaded)
 *
 * NEW FLOW (ADR-069 Phase 1):
 * 1. Download all images
 * 2. Call clusterPhotos() to group them
 * 3. For each cluster: create 1 Item record
 * 4. Analyze each cluster in parallel
 * 5. Return cluster summaries
 *
 * If clustering fails, fall back to one-item-per-photo (old behavior).
 */
export const batchAnalyzeImages = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      res.status(403).json({ message: 'Access denied. Organizer access required.' });
      return;
    }

    const { imageUrls } = req.body;

    if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
      res.status(400).json({ message: 'imageUrls must be a non-empty array' });
      return;
    }

    if (imageUrls.length > 20) {
      res.status(400).json({ message: 'Maximum 20 images allowed per batch' });
      return;
    }

    // Step 1: Download all images from Cloudinary
    const downloadedImages: { buffer: Buffer; mimeType: string; url: string }[] = [];

    for (const photoUrl of imageUrls) {
      trackCloudinaryServe();

      try {
        const response = await axios.get(photoUrl, {
          responseType: 'arraybuffer',
          timeout: 15000,
        });
        downloadedImages.push({
          buffer: Buffer.from(response.data),
          mimeType: 'image/jpeg',
          url: photoUrl,
        });
      } catch (err: any) {
        console.error(`Failed to download image ${photoUrl}:`, err.message);
        // Partial result: skip this image, continue with others
      }
    }

    if (downloadedImages.length === 0) {
      res.status(400).json({ message: 'Failed to download any images' });
      return;
    }

    // Step 2: Cluster the photos (ADR-069 Phase 1 + Phase 2)
    let clusterGroups: Array<{ photoIndices: number[]; detectedType: string; confidence: number; photos?: any[] }> = [];
    let ungroupedPhotos: any[] = [];

    try {
      const clusterResult = await clusterPhotos(downloadedImages.map(img => img.buffer.toString('base64')));
      clusterGroups = clusterResult.clusters || [];
      ungroupedPhotos = clusterResult.ungrouped || [];
    } catch (clusterError) {
      console.warn('[batchAnalyzeController] Clustering failed, falling back to one-item-per-photo:', clusterError);
      // Fallback: treat each photo as its own cluster with UNKNOWN role
      clusterGroups = downloadedImages.map((_, i) => ({
        photoIndices: [i],
        detectedType: 'Single Item',
        confidence: 0.5,
        photos: [
          {
            index: i,
            photoRole: 'UNKNOWN',
            roleReasoning: 'Clustering failed; defaulted to UNKNOWN',
          },
        ],
      }));
      ungroupedPhotos = [];
    }

    // Step 3: Create Item records for clusters + ungrouped photos
    const itemIds: string[] = [];

    for (const cluster of clusterGroups) {
      try {
        const item = await prisma.item.create({
          data: {
            title: 'Item', // Placeholder; will be updated by Haiku analysis
            quantity: cluster.photoIndices.length,
            isSet: cluster.photoIndices.length > 1,
            clusterConfidence: cluster.confidence,
            isAiTagged: true,
          },
        });
        itemIds.push(item.id);
      } catch (err) {
        console.error('Failed to create Item for cluster:', err);
      }
    }

    // For ungrouped photos, each becomes a solo item
    const ungroupedPhotoMap: Map<number, any> = new Map();
    for (const photoData of ungroupedPhotos) {
      const idx = typeof photoData === 'number' ? photoData : photoData.index;
      if (!ungroupedPhotoMap.has(idx)) {
        ungroupedPhotoMap.set(idx, photoData);
      }
    }

    for (const [_, photoData] of ungroupedPhotoMap) {
      try {
        const item = await prisma.item.create({
          data: {
            title: 'Item',
            quantity: 1,
            isSet: false,
            isAiTagged: true,
          },
        });
        itemIds.push(item.id);
      } catch (err) {
        console.error('Failed to create Item for ungrouped photo:', err);
      }
    }

    // Step 4: Analyze each cluster in parallel
    const useCloudAI = isCloudAIAvailable();
    const results: ClusterSummary[] = [];

    const CONCURRENCY_LIMIT = 5;
    const allClusters = [
      ...clusterGroups.map((c, idx) => ({ ...c, itemId: itemIds[idx], type: 'cluster' as const })),
      ...Array.from(ungroupedPhotoMap.entries()).map(([origIdx, photoData], cidx) => ({
        photoIndices: [origIdx],
        detectedType: 'Single Item',
        confidence: 0.5,
        photos: [photoData],
        itemId: itemIds[clusterGroups.length + cidx],
        type: 'ungrouped' as const
      })),
    ];

    for (let i = 0; i < allClusters.length; i += CONCURRENCY_LIMIT) {
      const batch = allClusters.slice(i, i + CONCURRENCY_LIMIT);

      const batchResults = await Promise.allSettled(
        batch.map(async (clusterSpec) => {
          const { photoIndices, itemId, photos: photoRoleData } = clusterSpec;

          // Get images for this cluster
          const clusterImages = photoIndices.map(idx => downloadedImages[idx]);

          // Phase 2: Build ClusterPhoto array for role-context analysis
          const clusterPhotosForAnalysis: ClusterPhoto[] = [];

          // Create Photo records with roles (Phase 2)
          try {
            for (let i = 0; i < photoIndices.length; i++) {
              const photoIdx = photoIndices[i];
              const photoUrl = downloadedImages[photoIdx].url;
              const photoMetadata = photoRoleData?.[i] || { index: photoIdx, photoRole: 'UNKNOWN', roleReasoning: 'No role assigned' };

              // Map photoRole string to enum value, defaulting to UNKNOWN if invalid
              let photoRole: string = photoMetadata.photoRole || 'UNKNOWN';
              const validRoles = ['FRONT', 'BACK_STAMP', 'DETAIL_DAMAGE', 'LABEL_BRAND', 'MULTI_ANGLE', 'UNKNOWN'];
              if (!validRoles.includes(photoRole)) {
                photoRole = 'UNKNOWN';
              }

              // Track for role-context analysis (Phase 2)
              clusterPhotosForAnalysis.push({
                index: i,
                photoRole: photoRole as any,
                roleReasoning: photoMetadata.roleReasoning,
              });

              await prisma.photo.create({
                data: {
                  itemId,
                  url: photoUrl,
                  photoRole: photoRole as any, // TypeScript will enforce enum at compile time
                  roleReasoning: photoMetadata.roleReasoning,
                  isPrimary: i === 0, // First photo in cluster is primary
                },
              });
            }
          } catch (err: any) {
            console.error(`Failed to create Photo records for item ${itemId}:`, err.message);
          }

          let analysis: any = null;

          if (useCloudAI) {
            try {
              const imageBuffers = clusterImages.map(img => img.buffer);
              const mimeTypes = clusterImages.map(img => img.mimeType);
              // Phase 2: Pass clusterPhotos for role-context analysis
              analysis = await analyzeItemImages(imageBuffers, mimeTypes, undefined, clusterPhotosForAnalysis);
            } catch (err: any) {
              console.error(`Cloud AI error for item ${itemId}:`, err.message);
            }
          }

          // Fallback to Ollama if Cloud AI unavailable or failed
          if (!analysis) {
            try {
              const ollamaPrompt = `You are an estate sale pricing assistant. Look at this image and respond with ONLY valid JSON (no markdown, no explanation):
{
  "title": "short specific title (include material, era, or maker if visible)",
  "description": "1-2 sentence description mentioning condition and notable features",
  "category": "one of: Furniture, Electronics, Clothing, Books, Kitchenware, Tools, Art, Jewelry, Toys, Sports, Collectibles, Glassware, Linens, Other",
  "condition": "one of: NEW, USED, REFURBISHED, PARTS_OR_REPAIR",
  "suggestedPrice": 12.50,
  "suggestedTags": ["Tag1", "Tag2", "Tag3"]
}`;

              const base64Images = clusterImages.map(img => img.buffer.toString('base64'));
              const aiResponse = await axios.post(
                `${OLLAMA_URL}/api/generate`,
                {
                  model: OLLAMA_VISION_MODEL,
                  prompt: ollamaPrompt,
                  images: base64Images.slice(0, 1), // Ollama: use primary image only
                  stream: false,
                },
                { timeout: 45000 }
              );
              const raw = aiResponse.data.response
                .replace(/```json\n?|\n?```/g, '')
                .trim();
              analysis = JSON.parse(raw);
            } catch (err) {
              console.error(`Ollama error for item ${itemId}:`, err);
            }
          }

          // Build cluster summary
          const summary: ClusterSummary = {
            itemId,
            photoIndices,
            isSet: photoIndices.length > 1,
            quantity: photoIndices.length,
            suggestedTitle: analysis?.title || 'Item',
            suggestedDescription: analysis?.description || 'No description available',
            suggestedCategory: analysis?.category || 'Other',
            suggestedCondition: analysis?.condition || 'USED',
            suggestedPrice: analysis?.suggestedPrice || 10,
            suggestedTags: analysis?.tags || analysis?.suggestedTags || [],
            aiConfidence: analysis?.confidence || 0.5,
          };

          // Update Item record with AI analysis
          try {
            await prisma.item.update({
              where: { id: itemId },
              data: {
                title: summary.suggestedTitle,
                description: summary.suggestedDescription,
                category: summary.suggestedCategory,
                condition: summary.suggestedCondition,
                price: summary.suggestedPrice ? summary.suggestedPrice * 100 : undefined,
                tags: summary.suggestedTags,
                aiConfidence: summary.aiConfidence,
              },
            });
          } catch (err) {
            console.error(`Failed to update Item ${itemId}:`, err);
          }

          return summary;
        })
      );

      batchResults.forEach((r) => {
        if (r.status === 'fulfilled') {
          results.push(r.value as ClusterSummary);
        } else {
          console.error('Cluster analysis failed:', r.reason);
        }
      });
    }

    const response: BatchAnalysisResponse = {
      clusters: results,
      totalProcessed: results.length,
      successCount: results.filter(r => r.suggestedTitle !== 'Error').length,
    };

    res.json(response);
  } catch (error) {
    console.error('batchAnalyzeImages error:', error);
    res.status(500).json({ message: 'Batch analysis failed' });
  }
};
