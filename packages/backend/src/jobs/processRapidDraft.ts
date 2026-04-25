import { prisma } from '../lib/prisma';
import { analyzeItemImage, analyzeItemImages, suggestPrice } from '../services/cloudAIService';
import { checkAITagLimit } from '../lib/tierEnforcement';

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

      // Call Vision → Haiku chain with all photos (or single if only one available)
      const aiResult = photoBuffers.length === 1
        ? await analyzeItemImage(photoBuffers[0], mimeTypes[0])
        : await analyzeItemImages(photoBuffers, mimeTypes);

      if (!aiResult) {
        // Cloud AI unavailable — mark as PENDING_REVIEW without AI tags
        console.log(`[rapidfire] Cloud AI unavailable for item ${itemId}; marking PENDING_REVIEW`);
        await prisma.item.update({
          where: { id: itemId },
          data: { draftStatus: 'PENDING_REVIEW' }
        });
        return;
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
      const userEdited = item.userEditedFields || [];
      await prisma.item.update({
        where: { id: itemId },
        data: {
          title: !userEdited.includes('title') ? (aiResult.title || item.title) : item.title,
          description: !userEdited.includes('description') ? (aiResult.description || item.description) : item.description,
          category: !userEdited.includes('category') ? (aiResult.category || item.category) : item.category,
          condition: !userEdited.includes('condition') ? (aiResult.condition || item.condition) : item.condition,
          brand: !userEdited.includes('brand') ? (aiResult.brand || item.brand) : item.brand,
          conditionGrade: aiResult.suggestedConditionGrade || item.conditionGrade,
          price: !userEdited.includes('price') ? (refinedPrice ?? item.price) : item.price,
          tags: aiResult.tags || [],
          isAiTagged: true,
          aiConfidence: aiResult.confidence ?? 0.5,
          draftStatus: 'PENDING_REVIEW'
        }
      });

      console.log(`[rapidfire] Item ${itemId} processed successfully. Status: PENDING_REVIEW`);
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
