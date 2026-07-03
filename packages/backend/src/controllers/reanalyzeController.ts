/**
 * reanalyzeController — organizer-facing "Re-run Smart tagging" endpoint.
 *
 * POST /api/items/:id/reanalyze
 *
 * Re-runs the SAME upload-time Smart tagging pipeline (Vision + Haiku + eBay
 * searchByImage + catalog enrichment) on an item's ALREADY-STORED photos — no
 * re-upload — and writes the refreshed suggestions back to the item in place.
 *
 * Auth: organizer role required + must own the item (mirrors analyzeItemTags).
 * Quota: counts against the monthly Smart-tag allowance, same as upload-time tagging.
 * Organizer intent: price is never touched; identifier/dims only fill empties and
 * never override userEditedFields (enforced inside reanalyzeItem/planEnrichmentApply).
 */

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { SubscriptionTier } from '../constants/tierLimits';
import { checkAiTagQuota, incrementAiTagCount } from '../lib/aiTagsQuotaTracker';
import { reanalyzeItem } from '../services/reanalyzeService';

export const reanalyzeItemForOrganizer = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }

    const { id } = req.params;

    const item = await prisma.item.findUnique({
      where: { id },
      include: {
        sale: {
          select: {
            organizer: {
              select: { isUnmanagedListing: true, userId: true, id: true, subscriptionTier: true },
            },
          },
        },
      },
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Guard: reject actions on unmanaged listings (mirrors analyzeItemTags).
    if (item.sale?.organizer?.isUnmanagedListing) {
      return res.status(403).json({
        message: 'This listing is not yet claimed by an organizer. Try one of our verified organizer sales.',
        code: 'UNMANAGED_LISTING',
      });
    }

    if (!item.sale || item.sale.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'Access denied. Not your item.' });
    }

    if (!item.photoUrls || item.photoUrls.length === 0) {
      return res.status(400).json({ message: 'This item has no photos to re-analyze.', code: 'NO_PHOTOS' });
    }

    // Quota enforcement (P0) — same allowance as upload-time Smart tagging.
    const organizerId = item.sale.organizer.id;
    const tier = (item.sale.organizer.subscriptionTier || 'SIMPLE') as SubscriptionTier;
    const quotaStatus = await checkAiTagQuota(organizerId, tier);
    if (quotaStatus.exceeded) {
      return res.status(429).json({
        code: 'AI_QUOTA_EXCEEDED',
        message: `Monthly re-analyze limit reached for ${tier} tier. Upgrade to continue.`,
        usedThisMonth: quotaStatus.used,
        limit: quotaStatus.limit,
        remaining: quotaStatus.remaining,
      });
    }

    // Per-request bake-off trigger (observability-only): ?bakeoff=1 or { bakeoff: true }.
    // Never affects the reanalyze result — just logs a multi-model comparison.
    const bakeoff = req.query?.bakeoff === '1' || req.body?.bakeoff === true;

    // Per-request RESOLVE-ONLY trigger (observability-only): ?resolve=1 or { resolve: true }.
    // Runs the grounded-resolution pipeline WITHOUT the expensive 10-model extract bake-off,
    // to keep the focused resolution test cheap. Never affects the reanalyze result.
    const resolveOnly = req.query?.resolve === '1' || req.body?.resolve === true;

    // Dry-run trigger (observability-only): ?dryRun=1 or { dryRun: true }.
    // When set, the bake-off + grounded resolution still run (they key off `bakeoff`/`resolve`),
    // but reanalyzeItem writes NOTHING to the item and skips any eBay sync. This lets
    // the bake-off run against ANY item — including published live listings — safely.
    const dryRun = req.query?.dryRun === '1' || req.body?.dryRun === true;

    // Test-image override (observability-only): analyze arbitrary external image URLs
    // instead of this item's stored photos, for stress-testing identification on hard
    // examples. The item id is still used for auth/ownership; the pipeline forces
    // apply=false internally whenever test URLs are supplied, so nothing is written.
    const testImageUrls = Array.isArray(req.body?.testImageUrls)
      ? (req.body.testImageUrls as unknown[])
          .filter((u): u is string => typeof u === 'string')
          .slice(0, 6)
      : undefined;

    const result = await reanalyzeItem(id, { apply: !dryRun, bakeoff, resolveOnly, testImageUrls });

    if (!result.ok) {
      switch (result.code) {
        case 'ITEM_NOT_FOUND':
          return res.status(404).json({ message: 'Item not found' });
        case 'NO_PHOTOS':
          return res.status(400).json({ message: 'This item has no photos to re-analyze.', code: 'NO_PHOTOS' });
        case 'PHOTO_DOWNLOAD_FAILED':
          return res.status(502).json({ message: "We couldn't load this item's photos. Try again in a moment.", code: 'PHOTO_DOWNLOAD_FAILED' });
        case 'AI_UNAVAILABLE':
        default:
          return res.status(503).json({ message: 'Smart tagging is temporarily unavailable. Try again shortly.', code: 'AI_UNAVAILABLE' });
      }
    }

    // Count this re-run against the monthly allowance (best-effort; never fail the response).
    try {
      await incrementAiTagCount(organizerId, 1);
    } catch (err: any) {
      console.warn('[Reanalyze] quota increment failed (non-fatal):', err?.message || err);
    }

    // Return the refreshed fields so the review card can update in place.
    // In dry-run mode nothing was written, so `applied` reflects the real state.
    const { after, appliedData, ebaySynced, ebayCategoryLocked, applied } = result;
    return res.json({
      itemId: id,
      applied,
      item: {
        title: appliedData.title ?? after.title,
        description: appliedData.description ?? after.description,
        category: appliedData.category ?? after.category,
        condition: appliedData.condition ?? after.condition,
        conditionGrade: appliedData.conditionGrade ?? after.conditionGrade,
        tags: (appliedData.tags as string[] | undefined) ?? after.tags ?? undefined,
        ebayCategoryId: appliedData.ebayCategoryId ?? after.ebayCategoryId,
        ebayCategoryName: appliedData.ebayCategoryName ?? after.ebayCategoryName,
        brand: after.brand,
        mpn: after.mpn,
        upc: after.upc,
        aiConfidence: after.aiConfidence,
        isAiTagged: applied,
      },
      // suggestedPrice returned for reference only — price is never written.
      suggestedPrice: after.suggestedPrice,
      ebaySynced,
      ebayCategoryLocked,
    });
  } catch (error: any) {
    console.error('[Reanalyze] organizer route error:', error?.message || error);
    return res.status(500).json({ message: 'Server error while re-analyzing item.' });
  }
};
