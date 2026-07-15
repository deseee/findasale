import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { analyzeItemImage, analyzeItemImages, suggestPrice, AITagResult } from '../services/cloudAIService';
import { checkAITagLimit } from '../lib/tierEnforcement';
import { composeDescription } from '../services/descriptionMerger'; // Item Description Authoring Contract (2026-05-12)
import { suggestCategories } from '../services/ebayTaxonomyService';
import { getEbayAccessToken } from '../controllers/ebayController';
import { decodeBarcodeFromImage } from '../services/serverBarcodeDecoder';
import { lookupByBarcode } from '../services/ebayCatalogLookup';
import { enrichItem, planEnrichmentApply } from '../services/productEnrichment';
import { runGroundedIdentityAsync } from '../services/groundedIdentityService';
import axios from 'axios';
import { isAnthropicCreditError, alertAnthropicCreditExhausted } from '../lib/anthropicError';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://host.docker.internal:11434';
const OLLAMA_VISION_MODEL = process.env.OLLAMA_VISION_MODEL || 'qwen3-vl:4b';

/**
 * Ollama fallback for Rapidfire — mirrors the analyze-photo Ollama path in
 * uploadController. Used when the cloud AI chain (Vision -> Claude Haiku) THROWS
 * (e.g. Anthropic out of credit, HTTP 400). Returns an AITagResult on success, or
 * null if Ollama also fails — so a Rapidfire item lands in PENDING_REVIEW with real
 * tags instead of silently stalling in DRAFT. Fully self-contained / non-throwing.
 */
async function analyzeWithOllamaFallback(buffer: Buffer): Promise<AITagResult | null> {
  try {
    const base64Image = buffer.toString('base64');
    const prompt = `You are an estate sale pricing assistant. Look at this image and respond with ONLY valid JSON (no markdown, no explanation) in this exact format:
{
  "title": "short descriptive item title",
  "description": "1-2 sentence description mentioning condition and notable features",
  "category": "one of: Furniture, Electronics, Clothing, Books, Kitchenware, Tools, Art, Jewelry, Toys, Sports, Collectibles, Other",
  "condition": "one of: NEW, USED, REFURBISHED, PARTS_OR_REPAIR",
  "suggestedPrice": 12.50
}`;
    const response = await axios.post(
      `${OLLAMA_URL}/api/generate`,
      { model: OLLAMA_VISION_MODEL, prompt, images: [base64Image], stream: false },
      { timeout: 30000 }
    );
    const raw = (response.data?.response ?? '').replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(raw) as {
      title?: string;
      description?: string;
      category?: string;
      condition?: string;
      suggestedPrice?: number;
    };
    if (!parsed || !parsed.title) return null;
    return {
      title: parsed.title,
      description: parsed.description ?? '',
      category: parsed.category,
      condition: parsed.condition ?? 'USED',
      suggestedPrice: typeof parsed.suggestedPrice === 'number' ? parsed.suggestedPrice : 0,
      tags: [],
    };
  } catch (ollamaErr: any) {
    console.error('[rapidfire] Ollama fallback failed:', ollamaErr?.message ?? ollamaErr);
    return null;
  }
}

/**
 * processRapidDraft — Background job for Rapidfire Mode Phase 2A
 *
 * Processes a DRAFT Item created by /api/upload/rapidfire endpoint.
 * Steps:
 * 1. Fetch item from DB (verify it exists and draftStatus = 'DRAFT')
 * 2. If image data is stored: fetch image from Cloudinary URL
 * 3. Call Vision → Haiku AI tagging chain (via cloudAIService)
 * 4. On success: update Item with AI tags, set draftStatus = 'PENDING_REVIEW'
 * 5. On failure: log error to aiErrorLog, keep draftStatus = 'DRAFT'
 *
 * Non-throwing wrapper ensures background job failures don't crash the app.
 */

export async function processRapidDraft(itemId: string): Promise<void> {
  try {
    // Fetch the item
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: {
        sale: {
          select: {
            id: true,
            organizer: { select: { userId: true } }
          }
        }
      }
    });

    if (!item) {
      console.warn(`[rapidfire] Item ${itemId} not found`);
      return;
    }

    if (item.draftStatus !== 'DRAFT') {
      console.warn(`[rapidfire] Item ${itemId} is not in DRAFT status (current: ${item.draftStatus})`);
      return;
    }

    // Check if image data is available — if no photos, skip AI processing
    if (!item.photoUrls || item.photoUrls.length === 0) {
      console.log(`[rapidfire] Item ${itemId} has no photos; marking PENDING_REVIEW without AI`);
      await prisma.item.update({
        where: { id: itemId },
        data: { draftStatus: 'PENDING_REVIEW' }
      });
      return;
    }

    // Feature #75: Check AI tag limit before processing
    const organizer = await prisma.organizer.findUnique({
      where: { userId: item.sale!.organizer.userId },
      select: { id: true, subscriptionTier: true }
    });

    if (organizer) {
      const aiTagLimit = await checkAITagLimit(organizer.id, organizer.subscriptionTier);
      if (aiTagLimit.isOverLimit) {
        // AI tag limit reached — skip AI analysis and mark as PENDING_REVIEW without tags
        console.log(`[rapidfire] AI tag limit reached for item ${itemId}. Organizer ${organizer.id} has used ${aiTagLimit.tagCount}/${aiTagLimit.limit} tags this month.`);
        await prisma.item.update({
          where: { id: itemId },
          data: { draftStatus: 'PENDING_REVIEW' }
        });
        return;
      }
    }

    // AI tagging: Download ALL photos and analyze them together
    // Multiple angles help with brand identification, condition grading, and feature detection
    try {
      const axios = (await import('axios')).default;

      // Download all photos as buffers
      const photoBuffers: Buffer[] = [];
      const mimeTypes: string[] = [];

      for (const photoUrl of item.photoUrls) {
        try {
          const response = await axios.get(photoUrl, { responseType: 'arraybuffer' });
          const photoBuffer = Buffer.from(response.data);
          photoBuffers.push(photoBuffer);

          // Determine MIME type from URL or default to image/jpeg
          const mimeType = photoUrl.includes('.png') ? 'image/png' : 'image/jpeg';
          mimeTypes.push(mimeType);
        } catch (downloadError) {
          console.warn(`[rapidfire] Failed to download photo ${photoUrl}:`, downloadError);
          // Skip this photo and continue with others
        }
      }

      if (photoBuffers.length === 0) {
        console.log(`[rapidfire] Item ${itemId} had no downloadable photos; marking PENDING_REVIEW without AI`);
        await prisma.item.update({
          where: { id: itemId },
          data: { draftStatus: 'PENDING_REVIEW' }
        });
        return;
      }

      // Organizer-intent gate: skip full Vision + Haiku pipeline when all core fields
      // are already populated by the organizer. This avoids a needless Vision API call
      // (and its associated cost) when there is nothing for AI to contribute.
      const userEditedFields = item.userEditedFields ?? [];
      const coreFields = ['title', 'category', 'condition', 'price', 'brand'] as const;
      const allOrganizerFilled = coreFields.every(field => {
        if (userEditedFields.includes(field)) return true;
        const val = (item as any)[field];
        return val !== null && val !== undefined && val !== '';
      });
      if (allOrganizerFilled) {
        console.log(`[processRapidDraft] Skipping AI pipeline for item ${itemId} — all core organizer fields pre-set`);
        await prisma.item.update({
          where: { id: itemId },
          data: { draftStatus: 'PENDING_REVIEW' }
        });
        return;
      }

      // Call Vision → Haiku chain with all photos (or single if only one available)
      let aiResult: AITagResult | null;
      try {
        aiResult = photoBuffers.length === 1
          ? await analyzeItemImage(photoBuffers[0], mimeTypes[0])
          : await analyzeItemImages(photoBuffers, mimeTypes);
      } catch (cloudErr: any) {
        // Cloud AI (Vision → Claude Haiku) threw — e.g. Anthropic out of credit (HTTP 400).
        // Mirror the upload paths' Ollama fallback so Rapidfire items don't stall in DRAFT.
        if (isAnthropicCreditError(cloudErr)) {
          await alertAnthropicCreditExhausted('rapidfire');
        }
        console.error(`[rapidfire] Cloud AI failed for item ${itemId}, attempting Ollama fallback:`, cloudErr?.message ?? cloudErr);
        aiResult = await analyzeWithOllamaFallback(photoBuffers[0]);
        if (!aiResult) {
          // Ollama also failed — rethrow so the existing aiError handler logs + keeps DRAFT (recoverable).
          throw cloudErr;
        }
      }

      if (!aiResult) {
        // Cloud AI unavailable — mark as PENDING_REVIEW without AI tags
        console.log(`[rapidfire] Cloud AI unavailable for item ${itemId}; marking PENDING_REVIEW`);
        await prisma.item.update({
          where: { id: itemId },
          data: { draftStatus: 'PENDING_REVIEW' }
        });
        return;
      }

      // #319/#325/#328: Backfill Photo.orderIndex from Vision quality scores (fire-and-forget)
      // analyzeItemImages() returns photoOrderIndices sorted by Vision label confidence.
      // Write orderIndex + isPrimary to Photo rows so #325 Best-Photo-First sorting is persisted.
      if (aiResult.photoOrderIndices && aiResult.photoOrderIndices.length > 0) {
        const orderIndices: number[] = aiResult.photoOrderIndices;
        Promise.all(
          orderIndices.map((origPhotoIdx, sortedPosition) => {
            const photoUrl = item.photoUrls[origPhotoIdx];
            if (!photoUrl) return Promise.resolve();
            return prisma.photo.updateMany({
              where: { itemId, url: photoUrl },
              data: {
                orderIndex: sortedPosition,
                isPrimary: sortedPosition === 0,
              },
            });
          })
        ).catch(err => console.warn(`[Photo sync] orderIndex backfill failed for item ${itemId}:`, err));
      }

      // Comp-based price refinement: use detected category to fetch recent sold comps
      // and override the raw AI price with a market-grounded suggestion
      let refinedPrice = aiResult.suggestedPrice;
      if (aiResult.category) {
        try {
          const recentComps = await prisma.item.findMany({
            where: {
              category: { equals: aiResult.category, mode: 'insensitive' },
              status: 'SOLD',
              price: { not: null, gt: 0 },
            },
            orderBy: { updatedAt: 'desc' },
            take: 5,
            select: { title: true, price: true, updatedAt: true },
          });

          if (recentComps.length >= 2) {
            const compData = recentComps.map((c: { title: string; price: number | null; updatedAt: Date }) => ({
              title: c.title,
              price: c.price!,
              soldAt: c.updatedAt.toISOString().split('T')[0],
            }));
            const priceSuggestion = await suggestPrice(
              aiResult.title,
              aiResult.category,
              aiResult.condition,
              compData
            );
            refinedPrice = priceSuggestion.suggested;
          }
        } catch (priceErr) {
          // Price refinement is best-effort — fall back to raw AI price on error
          console.warn(`[rapidfire] Price refinement failed for item ${itemId}:`, priceErr);
        }
      }

      // Success: Update item with AI tags and set to PENDING_REVIEW
      // D-006: Respect organizer-edited fields — do NOT overwrite fields in userEditedFields array
      // S624 Camera Debounce Race Fix: Use optimistic lock to detect if organizer edited while AI was processing
      const userEdited = item.userEditedFields || [];
      const snapshotUpdatedAt = item.updatedAt;

      // Description: append-if-novel via composeDescription (architect contract 2026-05-12)
      // No userEditedFields gate — composeDescription with 'AUTO' handles merge safely:
      // voice content (above sentinel) is never touched; AI appends below sentinel only.
      const composedDescription = aiResult.description
        ? composeDescription(item.description, aiResult.description, 'AUTO').description
        : item.description;

      // eBay category auto-fill: non-blocking enrichment. Skip if organizer already set
      // ebayCategoryId OR if eBay API fails. Uses the AI title as the query.
      let ebayCategoryId: string | undefined;
      let ebayCategoryName: string | undefined;
      if (!userEdited.includes('ebayCategoryId') && !item.ebayCategoryId && aiResult.title) {
        try {
          const token = await getEbayAccessToken();
          if (token) {
            const suggestions = await suggestCategories(token, aiResult.title);
            if (suggestions.length > 0) {
              ebayCategoryId = suggestions[0].categoryId;
              ebayCategoryName = suggestions[0].categoryName;
            }
          }
        } catch (ebayErr) {
          console.warn(`[rapidfire] eBay category suggestion failed for item ${itemId}:`, ebayErr);
        }
      }

      // Barcode auto-detection: scan all photo buffers for a visible barcode.
      // Fires AFTER AI tagging. Non-blocking — any error or timeout = silent skip.
      // Barcode enrichment overrides AI title-based eBay category (stronger signal).
      let barcodeEnrichment: import('../services/ebayCatalogLookup').EbayCatalogResult | null = null;
      let rapidDecodedBarcode: { code: string; type?: string } | undefined = undefined;
      for (const photoBuffer of photoBuffers) {
        try {
          const detected = await decodeBarcodeFromImage(photoBuffer);
          if (detected) {
            console.log(`[rapidfire] Barcode detected for item ${itemId}: ${detected.code} (${detected.codeType})`);
            if (!rapidDecodedBarcode) rapidDecodedBarcode = { code: detected.code, type: detected.codeType };
            barcodeEnrichment = await lookupByBarcode(detected.code, detected.codeType);
            if (barcodeEnrichment) {
              console.log(`[rapidfire] Barcode enrichment found for item ${itemId}: "${barcodeEnrichment.title}"`);
              break; // First hit wins
            }
          }
        } catch {
          // Non-blocking — barcode decode failure must never interrupt AI pipeline
        }
      }

      // Catalog enrichment (ADR 2026-06-14): non-barcode fallback using AI title +
      // brand + visible model number. HIGH (>=0.85) auto-fills empty fields; lower
      // confidence is stored under catalogSuggestions for one-click accept in the edit UI.
      let rapidCatalogApply: Record<string, any> = {};
      let rapidCatalogSuggestion: any = undefined;
      try {
        const { merged } = await enrichItem(
          {
            title: aiResult.title || item.title,
            brand: item.brand ?? aiResult.brand ?? null,
            mpn: item.mpn ?? aiResult.mpn ?? null,
            upc: item.upc ?? null,
            ean: item.ean ?? null,
            isbn: item.isbn ?? null,
            tags: aiResult.tags ?? null,
          },
          { decodedBarcode: rapidDecodedBarcode, aiResult },
        );
        const plan = planEnrichmentApply(merged, {
          brand: item.brand ?? null,
          mpn: item.mpn ?? null,
          upc: item.upc ?? null,
          ean: item.ean ?? null,
          isbn: item.isbn ?? null,
          ebayEpid: item.ebayEpid ?? null,
          ebayCategoryId: item.ebayCategoryId ?? null,
          packageWeightOz: item.packageWeightOz ?? null,
          packageLengthIn: item.packageLengthIn ?? null,
          packageWidthIn: item.packageWidthIn ?? null,
          packageHeightIn: item.packageHeightIn ?? null,
          packageConfirmedByOrganizer: item.packageConfirmedByOrganizer ?? null,
          userEditedFields: userEdited,
        });
        rapidCatalogApply = plan.apply;
        rapidCatalogSuggestion = plan.suggestion;
      } catch (enrichErr) {
        console.warn(`[rapidfire] enrichment cascade failed for item ${itemId}:`, enrichErr);
      }

      const updateData = {
        title: !userEdited.includes('title') ? (aiResult.title || item.title) : item.title,
        description: composedDescription,
        category: !userEdited.includes('category') ? (aiResult.category || item.category) : item.category,
        condition: !userEdited.includes('condition') ? (aiResult.condition || item.condition) : item.condition,
        brand: !userEdited.includes('brand') ? (aiResult.brand || item.brand) : item.brand,
        // Catalog Enrichment: persist AI-read model/part number when organizer hasn't set one.
        // aiResult.mpn is evidence-only (Vision reads it from visible labels — never inferred).
        // Barcode enrichment below still wins if it provides a more authoritative mpn.
        mpn: !userEdited.includes('mpn') ? (aiResult.mpn || item.mpn) : item.mpn,
        conditionGrade: aiResult.suggestedConditionGrade || item.conditionGrade,
        price: !userEdited.includes('price') ? (refinedPrice ?? item.price) : item.price,
        tags: aiResult.tags || [],
        isAiTagged: true,
        aiConfidence: aiResult.confidence ?? 0.5,
        draftStatus: 'PENDING_REVIEW' as const,
        ...(ebayCategoryId ? { ebayCategoryId, ebayCategoryName } : {}),
        // Barcode enrichment: override AI suggestions for exact-product-match fields.
        // Organizer-set values always win (userEdited gate). AI-set values lose to barcode.
        ...(barcodeEnrichment ? {
          ...(!userEdited.includes('brand') && !item.brand && barcodeEnrichment.brand
            ? { brand: barcodeEnrichment.brand } : {}),
          ...(!item.upc && barcodeEnrichment.upc
            ? { upc: barcodeEnrichment.upc } : {}),
          ...(!userEdited.includes('mpn') && !item.mpn && barcodeEnrichment.mpn
            ? { mpn: barcodeEnrichment.mpn } : {}),
          ...(!userEdited.includes('packageWeightOz') && !item.packageWeightOz && barcodeEnrichment.weightOz != null
            ? { packageWeightOz: barcodeEnrichment.weightOz } : {}),
          ...(!item.packageLengthIn && barcodeEnrichment.lengthIn != null
            ? { packageLengthIn: barcodeEnrichment.lengthIn } : {}),
          ...(!item.packageWidthIn && barcodeEnrichment.widthIn != null
            ? { packageWidthIn: barcodeEnrichment.widthIn } : {}),
          ...(!item.packageHeightIn && barcodeEnrichment.heightIn != null
            ? { packageHeightIn: barcodeEnrichment.heightIn } : {}),
          // Barcode eBay category overrides AI title-based guess (exact product match)
          ...(!userEdited.includes('ebayCategoryId') && barcodeEnrichment.ebayCategoryId
            ? { ebayCategoryId: barcodeEnrichment.ebayCategoryId, ebayCategoryName: barcodeEnrichment.ebayCategoryName ?? ebayCategoryName }
            : {}),
        } : {}),
        // Catalog enrichment: HIGH-confidence auto-fills + suggestion write.
        ...rapidCatalogApply,
        ...(rapidCatalogSuggestion !== undefined ? { catalogSuggestions: rapidCatalogSuggestion } : {}),
        // AI package estimate persistence — feeds estimatePackageProfile step-4 AI path.
        // cloudAIService already gates these at packageConfidence >= 0.5 before returning.
        ...(aiResult?.estimatedWeightOz != null && aiResult?.packageConfidence != null ? {
          aiPackageWeightOz: Math.round(aiResult.estimatedWeightOz),
          aiPackageDimsJson: aiResult.estimatedDimensionsIn ?? Prisma.JsonNull,
          aiPackageConfidence: aiResult.packageConfidence,
        } : {}),
      };

      // Optimistic lock: include updatedAt in where clause to detect concurrent edits
      const result = await prisma.item.updateMany({
        where: { id: itemId, updatedAt: snapshotUpdatedAt },
        data: updateData,
      });

      if (result.count === 0) {
        // Optimistic lock failed — organizer edited item while AI was processing
        // Re-fetch organizer's current values and merge intelligently
        console.log(`[rapidfire] Optimistic lock failed for item ${itemId} — organizer edited while AI was processing`);
        const freshItem = await prisma.item.findUnique({ where: { id: itemId } });
        if (freshItem) {
          // Build merged update: only apply AI suggestions where organizer hasn't set a value
          const mergedData: Record<string, unknown> = {};
          for (const [key, aiValue] of Object.entries(updateData)) {
            // Description uses composeDescription against the FRESH value so voice content
            // added during the race window survives. Other fields: only write if absent.
            if (key === 'description') {
              if (!freshItem.userEditedFields?.includes('description') && aiResult.description) {
                const composed = composeDescription(freshItem.description, aiResult.description, 'AUTO').description;
                if (composed !== freshItem.description) {
                  mergedData.description = composed;
                }
              }
              continue;
            }
            // Only use AI value if organizer's current value is null/empty/default
            const freshValue = freshItem[key as keyof typeof freshItem];
            // Skip if organizer has explicitly edited this field
            if (!freshItem.userEditedFields?.includes(key as string)) {
              // Use AI value only if fresh item's value is falsy (null, empty string, default)
              if (!freshValue) {
                mergedData[key] = aiValue;
              }
            }
          }
          // Always set draftStatus to PENDING_REVIEW regardless
          mergedData.draftStatus = 'PENDING_REVIEW';

          if (Object.keys(mergedData).length > 0) {
            await prisma.item.update({
              where: { id: itemId },
              data: mergedData,
            });
            console.log(`[rapidfire] Item ${itemId} merged after race condition. Applied ${Object.keys(mergedData).length} AI suggestions (organizer values preserved).`);
          }
        }
      } else {
        console.log(`[rapidfire] Item ${itemId} processed successfully. Status: PENDING_REVIEW`);
      }

      // PRODUCTION grounded identity (ADR grounded-identification-production-2026-07-02).
      // FIRE-AND-FORGET: never blocks this job's completion / the upload response. Fully gated +
      // error-swallowed inside the service; master switch OFF => no-op. Patches the item row when
      // a gated winner lands (the review card picks it up on its next refetch).
      runGroundedIdentityAsync({
        itemId,
        buffers: photoBuffers,
        mimeTypes,
        baseResult: {
          confidence: typeof aiResult.confidence === 'number' ? aiResult.confidence : undefined,
          brand: item.brand ?? aiResult.brand ?? undefined,
          title: aiResult.title ?? item.title ?? undefined,
          category: aiResult.category ?? item.category ?? undefined,
        },
      });
    } catch (aiError) {
      // AI processing failed — log error to aiErrorLog, keep DRAFT status
      const errorMessage = aiError instanceof Error ? aiError.message : String(aiError);
      const newError = { error: errorMessage, timestamp: Date.now() };

      const currentErrors = Array.isArray(item.aiErrorLog) ? item.aiErrorLog : [];
      const updatedErrors = [...currentErrors, newError];

      await prisma.item.update({
        where: { id: itemId },
        data: {
          aiErrorLog: updatedErrors,
          draftStatus: 'DRAFT'
        }
      });

      console.error(`[rapidfire] AI processing failed for item ${itemId}: ${errorMessage}`);
    }
  } catch (error) {
    // Catch-all: any unexpected error should be logged, not thrown
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[rapidfire] Unexpected error processing item ${itemId}: ${errorMessage}`);

    // Attempt to log error to DB, but don't fail if this also errors
    try {
      const item = await prisma.item.findUnique({ where: { id: itemId } });
      if (item) {
        const newError = { error: errorMessage, timestamp: Date.now() };
        const currentErrors = Array.isArray(item.aiErrorLog) ? item.aiErrorLog : [];
        const updatedErrors = [...currentErrors, newError];

        await prisma.item.update({
          where: { id: itemId },
          data: { aiErrorLog: updatedErrors }
        });
      }
    } catch (dbError) {
      console.error(`[rapidfire] Failed to log error to DB for item ${itemId}:`, dbError);
    }
  }
}

/**
 * Enqueue processRapidDraft for asynchronous execution.
 * Called by /api/upload/rapidfire endpoint to queue job without blocking.
 * Uses setImmediate to ensure caller response is sent first.
 */
export function enqueueProcessRapidDraft(itemId: string): void {
  setImmediate(() => {
    processRapidDraft(itemId).catch((err: unknown) => {
      console.error(`[rapidfire] Uncaught error in processRapidDraft(${itemId}):`, err);
    });
  });
}
