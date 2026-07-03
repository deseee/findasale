/**
 * reanalyzeService — shared "re-run Smart tagging on an item's stored photos" pipeline.
 *
 * This is the SINGLE orchestration used by BOTH:
 *   1. the internal/admin route  POST /api/internal/reanalyze-item  (dry-run + apply, no user auth)
 *   2. the organizer-facing endpoint POST /api/items/:id/reanalyze   (apply, ownership-gated)
 *
 * It reuses the exact upload-time tagging orchestrator `analyzeItemImages`
 * (Vision + Haiku + eBay searchByImage via selectBestEbayFrame — all internally gated),
 * then re-resolves the eBay category and runs the catalog enrichment cascade.
 *
 * Organizer-intent protection (D-006 + ADR 2026-06-14):
 *   - price is NEVER overwritten (organizer pricing always wins).
 *   - identifier/dims fields are only auto-filled into EMPTY columns and never over
 *     any field listed in item.userEditedFields (handled by planEnrichmentApply).
 *   NOTE: title/description/category/condition/tags ARE overwritten by re-analysis
 *   when apply=true — the caller decides whether to guard organizer edits to those
 *   (see reanalyzeItemForOrganizer, which surfaces this as a client confirm).
 */

import axios from 'axios';
import { prisma } from '../lib/prisma';
import { analyzeItemImages } from './cloudAIService';
import { enrichItem, planEnrichmentApply } from './productEnrichment';
import { suggestEbayCategoryForTitle } from '../controllers/ebayController';
import { syncListedItemFieldsToEbay } from '../controllers/itemController';
import { runModelBakeoff, runGroundedResolution, runVisualResolution } from './modelBakeoffService';
import { resolveGroundedIdentityInline } from './groundedIdentityService';

export type ReanalyzeErrorCode =
  | 'ITEM_NOT_FOUND'
  | 'NO_PHOTOS'
  | 'PHOTO_DOWNLOAD_FAILED'
  | 'AI_UNAVAILABLE';

export interface ReanalyzeError {
  ok: false;
  code: ReanalyzeErrorCode;
}

export interface ReanalyzeBefore {
  title: string | null;
  description: string | null;
  category: string | null;
  condition: string | null;
  conditionGrade: string | null;
  price: number | null;
  tags: string[];
  ebayCategoryId: string | null;
  ebayCategoryName: string | null;
}

export interface ReanalyzeAfter {
  title: string | null;
  description: string | null;
  category: string | null;
  condition: string | null;
  conditionGrade: string | null;
  suggestedPrice: number | null;
  tags: string[] | null;
  ebayCategoryId: string | null;
  ebayCategoryName: string | null;
  aiConfidence: number | null;
  brand: string | null;
  mpn: string | null;
  upc: string | null;
  catalogEnrichment: {
    sources: string[];
    merged: Record<string, { value: string | number; source: string; confidence: number }>;
    wouldApply: Record<string, any>;
    suggestion: any;
  } | null;
  groundedIdentity: string | null;
  groundedConfidence: number | null;
  groundedSource: string | null;
}

export interface ReanalyzeResult {
  ok: true;
  itemId: string;
  applied: boolean;
  organizerId: string | null;
  before: ReanalyzeBefore;
  after: ReanalyzeAfter;
  /** Prisma column writes that WERE (apply=true) or WOULD BE (apply=false) written. */
  appliedData: Record<string, any>;
  ebaySynced: boolean;
  ebaySyncReason?: string;
  ebayCategoryLocked?: { changed: boolean; from: string | null; to: string | null };
}

/**
 * Re-run the Smart tagging pipeline on an item's already-stored photoUrls.
 *
 * @param itemId - the DRAFT/PENDING_REVIEW item id.
 * @param opts.apply - when true, writes the new suggested fields to the item (price excluded).
 *                     when false, returns before/after diff without writing.
 * @param opts.syncEbay - when true (default), propagate applied changes to a live eBay listing.
 */
export async function reanalyzeItem(
  itemId: string,
  opts: { apply: boolean; syncEbay?: boolean; bakeoff?: boolean; resolveOnly?: boolean; testImageUrls?: string[] } = { apply: false },
): Promise<ReanalyzeResult | ReanalyzeError> {
  // Test-image override: analyze arbitrary external image URLs instead of the item's
  // stored photos (stress-testing identification on hard examples). When supplied, we
  // FORCE apply=false so a test-image run can NEVER write fields back to the item.
  const rawTestUrls = Array.isArray(opts.testImageUrls) ? opts.testImageUrls : [];
  const testImageUrls = rawTestUrls
    .filter((u): u is string => typeof u === 'string' && /^https?:\/\//i.test(u.trim()))
    .map((u) => u.trim())
    .slice(0, 6);
  const usingTestImages = testImageUrls.length > 0;

  const apply = usingTestImages ? false : opts.apply === true;
  const syncEbay = opts.syncEbay !== false;
  const bakeoff = opts.bakeoff === true;
  const resolveOnly = opts.resolveOnly === true;
  if (usingTestImages) {
    console.log(`[resolve] item=${itemId} USING testImageUrls (${testImageUrls.length} images) — apply forced false`);
  }

  const item = await prisma.item.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      title: true,
      description: true,
      category: true,
      condition: true,
      conditionGrade: true,
      price: true,
      tags: true,
      photoUrls: true,
      ebayCategoryId: true,
      ebayCategoryName: true,
      brand: true,
      mpn: true,
      upc: true,
      ean: true,
      isbn: true,
      ebayEpid: true,
      packageWeightOz: true,
      packageLengthIn: true,
      packageWidthIn: true,
      packageHeightIn: true,
      packageConfirmedByOrganizer: true,
      userEditedFields: true,
      ebayOfferId: true,
      sale: { select: { id: true, organizerId: true } },
    },
  });

  if (!item) return { ok: false, code: 'ITEM_NOT_FOUND' };
  if (!usingTestImages && (!item.photoUrls || item.photoUrls.length === 0)) return { ok: false, code: 'NO_PHOTOS' };

  // Download images into Buffers (skip failures). When test-image URLs are supplied,
  // download THOSE (capped at 6) instead of the item's stored photos; otherwise use the
  // first 5 stored photoUrls. Only http(s) URLs are fetched (non-http already filtered above).
  const sourceUrls = usingTestImages ? testImageUrls : item.photoUrls.slice(0, 5);
  const buffers: Buffer[] = [];
  const mimeTypes: string[] = [];
  for (const url of sourceUrls) {
    if (!/^https?:\/\//i.test(url)) continue;
    try {
      const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000, headers: { 'User-Agent': 'FindaSale-ImageTagger/1.0 (+https://finda.sale; secondary-sale item tagging)' } });
      const contentType = String(resp.headers?.['content-type'] || '').split(';')[0].trim();
      buffers.push(Buffer.from(resp.data));
      mimeTypes.push(contentType.startsWith('image/') ? contentType : 'image/jpeg');
    } catch (err: any) {
      console.error(`[Reanalyze] image download failed (${url}):`, err?.message || err);
    }
  }
  if (buffers.length === 0) return { ok: false, code: 'PHOTO_DOWNLOAD_FAILED' };

  let result;
  try {
    result = await analyzeItemImages(buffers, mimeTypes);
  } catch (err: any) {
    console.error('[Reanalyze] analyzeItemImages threw:', err?.message || err);
    return { ok: false, code: 'AI_UNAVAILABLE' };
  }
  if (!result) return { ok: false, code: 'AI_UNAVAILABLE' };

  // Re-resolve eBay category (best-effort; tolerate null).
  let cat: { categoryId: string; categoryName: string } | null = null;
  try {
    cat = await suggestEbayCategoryForTitle(
      result.title || item.title,
      result.category || item.category,
    );
  } catch (err: any) {
    console.warn('[Reanalyze] eBay category resolve failed:', err?.message || err);
  }

  // Catalog enrichment (ADR 2026-06-14): best-effort identifier/dims fill.
  let merged: Record<string, { value: string | number; source: string; confidence: number }> = {};
  try {
    const out = await enrichItem(
      {
        title: result.title || item.title,
        brand: item.brand ?? result.brand ?? null,
        mpn: item.mpn ?? result.mpn ?? null,
        upc: item.upc ?? null,
        ean: item.ean ?? null,
        isbn: item.isbn ?? null,
        tags: (result.tags && result.tags.length ? result.tags : result.suggestedTags) ?? null,
      },
      { aiResult: result },
    );
    merged = out.merged;
  } catch (err: any) {
    console.warn('[Reanalyze] enrichment cascade failed:', err?.message || err);
  }

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
    userEditedFields: item.userEditedFields ?? [],
  });
  const catalogApply: Record<string, any> = plan.apply;
  const catalogSuggestionWrite: any = plan.suggestion;
  const enrichmentSources = Array.from(new Set(Object.values(merged).map((m) => m.source)));

  const before: ReanalyzeBefore = {
    title: item.title,
    description: item.description,
    category: item.category,
    condition: item.condition,
    conditionGrade: item.conditionGrade,
    price: item.price,
    tags: item.tags,
    ebayCategoryId: item.ebayCategoryId,
    ebayCategoryName: item.ebayCategoryName,
  };

  const nextTags = (result.tags && result.tags.length ? result.tags : result.suggestedTags) ?? null;

  // Assemble the Prisma write fragment (shared by after.wouldApply + the apply write).
  const appliedData: Record<string, any> = {};
  if (result.title) appliedData.title = result.title;
  if (result.description) appliedData.description = result.description;
  if (result.category) appliedData.category = result.category;
  if (result.condition) appliedData.condition = result.condition;
  if (result.suggestedConditionGrade) appliedData.conditionGrade = result.suggestedConditionGrade;
  if (nextTags && nextTags.length) appliedData.tags = nextTags;
  if (cat?.categoryId) {
    appliedData.ebayCategoryId = cat.categoryId;
    appliedData.ebayCategoryName = cat.categoryName;
  }
  Object.assign(appliedData, catalogApply);
  if (typeof result.confidence === 'number') appliedData.aiConfidence = result.confidence;
  // Mark tagged so the review card renders the confidence chip after re-analysis.
  appliedData.isAiTagged = true;
  // Price intentionally excluded — organizer pricing always wins.

  const after: ReanalyzeAfter = {
    title: result.title ?? null,
    description: result.description ?? null,
    category: result.category ?? null,
    condition: result.condition ?? null,
    conditionGrade: result.suggestedConditionGrade ?? null,
    suggestedPrice: result.suggestedPrice ?? null,
    tags: nextTags,
    ebayCategoryId: cat?.categoryId ?? null,
    ebayCategoryName: cat?.categoryName ?? null,
    aiConfidence: result.confidence ?? null,
    brand: (catalogApply.brand as string) ?? item.brand ?? result.brand ?? null,
    mpn: (catalogApply.mpn as string) ?? item.mpn ?? result.mpn ?? null,
    upc: (catalogApply.upc as string) ?? item.upc ?? null,
    catalogEnrichment: Object.keys(merged).length > 0
      ? {
          sources: enrichmentSources,
          merged,
          wouldApply: catalogApply,
          suggestion: catalogSuggestionWrite ?? null,
        }
      : null,
  };

  if (apply) {
    const data: Record<string, any> = { ...appliedData };
    if (catalogSuggestionWrite !== undefined) data.catalogSuggestions = catalogSuggestionWrite;
    if (Object.keys(data).length > 0) {
      await prisma.item.update({ where: { id: itemId }, data });
    }
  }

  // Bug #469: if this item is LIVE on eBay, propagate applied title/description/condition
  // to the live listing. Non-fatal: a sync error must NEVER fail the reanalyze response.
  let ebaySynced = false;
  let ebaySyncReason: string | undefined;
  let ebayCategoryLocked: { changed: boolean; from: string | null; to: string | null } | undefined;
  if (apply && syncEbay && item.ebayOfferId) {
    try {
      const condMap: Record<string, string> = {
        NEW: 'NEW',
        USED: 'USED_GOOD',
        REFURBISHED: 'SELLER_REFURBISHED',
        PARTS_OR_REPAIR: 'FOR_PARTS_OR_NOT_WORKING',
      };
      const conditionEnum = result.condition ? (condMap[result.condition] ?? 'USED_GOOD') : null;
      const syncResult = await syncListedItemFieldsToEbay({
        organizerId: item.sale!.organizerId,
        ebayOfferId: item.ebayOfferId,
        title: result.title ?? null,
        description: result.description ?? null,
        conditionEnum,
        logTag: `[Reanalyze eBay] item ${itemId}`,
      });
      ebaySynced = syncResult.synced && syncResult.published;
      ebaySyncReason = syncResult.reason;
      const newCatId = cat?.categoryId ?? null;
      if (newCatId && item.ebayCategoryId && newCatId !== item.ebayCategoryId) {
        ebayCategoryLocked = { changed: true, from: item.ebayCategoryId, to: newCatId };
      }
    } catch (syncErr: any) {
      console.warn(`[Reanalyze eBay] non-fatal sync error for item ${itemId}:`, syncErr?.message || syncErr);
      ebaySynced = false;
      ebaySyncReason = 'exception';
    }
  }

  // Observability-only model bake-off (per-request trigger via opts.bakeoff). Runs
  // AFTER the applied result above is fully computed, on the SAME already-downloaded
  // image buffers. Awaited but fully error-swallowed — it NEVER affects the response.
  // The big 10-model extract bake-off runs ONLY when `bakeoff` is true.
  if (bakeoff) {
    try {
      await runModelBakeoff(itemId, buffers, mimeTypes);
    } catch (bakeoffErr: any) {
      console.warn('[bakeoff] harness invocation error (non-fatal):', bakeoffErr?.message || bakeoffErr);
    }
  }
  // Grounded resolution (top-performers-only: two strong extractors -> Sonar-Pro -> gate).
  // Runs under EITHER the full bake-off trigger OR the cheap resolve-only trigger, so we can
  // run the focused resolution test without the expensive 10-model extract bake-off.
  // Observability only, fully error-swallowed — NEVER affects the response.
  if (bakeoff || resolveOnly) {
    try {
      await runGroundedResolution(itemId, buffers, mimeTypes);
    } catch (resolveErr: any) {
      console.warn('[resolve] pass invocation error (non-fatal):', resolveErr?.message || resolveErr);
    }
    // Visual reverse-image resolution (Lens parity for visually-identified items). Sends the
    // ACTUAL primary image to web-grounded VISION models + Google Vision Web Detection. Runs
    // under the SAME gate, observability only, fully error-swallowed — NEVER affects the response.
    try {
      await runVisualResolution(itemId, buffers, mimeTypes);
    } catch (visualErr: any) {
      console.warn('[visual] pass invocation error (non-fatal):', visualErr?.message || visualErr);
    }
  }

  // PRODUCTION grounded identity (ADR grounded-identification-production-2026-07-02).
  // Runs INLINE here (reanalyzeService is already async), fully gated + error-swallowed inside
  // the service. Master switch OFF => no-op. persist follows apply (test-image runs never write).
  // Skips re-grounding if the item already has a strong grounded winner.
  let groundedIdentity: string | null = null;
  let groundedConfidence: number | null = null;
  let groundedSource: string | null = null;
  try {
    const groundingOutcome = await resolveGroundedIdentityInline({
      itemId,
      buffers,
      mimeTypes,
      baseResult: {
        confidence: typeof result.confidence === 'number' ? result.confidence : undefined,
        brand: item.brand ?? result.brand ?? undefined,
        title: result.title ?? item.title ?? undefined,
        category: result.category ?? item.category ?? undefined,
      },
      persist: apply,
      skipIfAlreadyGrounded: true,
    });
    if (groundingOutcome && groundingOutcome.winner) {
      groundedIdentity = groundingOutcome.winner.identity ?? null;
      groundedConfidence = typeof groundingOutcome.winner.confidence === 'number' ? groundingOutcome.winner.confidence : null;
      groundedSource = groundingOutcome.winner.source ?? null;
    }
  } catch (groundingErr: any) {
    console.warn('[grounding] inline pass invocation error (non-fatal):', groundingErr?.message || groundingErr);
  }

  console.log(`[Reanalyze] item=${itemId} applied=${apply} ebaySynced=${ebaySynced} title="${(result.title || item.title || '').slice(0, 80)}"`);

  return {
    ok: true,
    itemId,
    applied: apply,
    organizerId: item.sale?.organizerId ?? null,
    before,
    after: { ...after, groundedIdentity, groundedConfidence, groundedSource },
    appliedData,
    ebaySynced,
    ebaySyncReason,
    ebayCategoryLocked,
  };
}
