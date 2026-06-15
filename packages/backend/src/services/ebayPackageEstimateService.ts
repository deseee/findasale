/**
 * ebayPackageEstimateService — pre-fill eBay package dimensions from a global
 * PackageProfile lookup, falling back to an AI estimate when no profile matches.
 *
 * Lookup precision (first hit wins, descending precision):
 *   1. ebayCategoryId exact match
 *   2. FindA.Sale category match
 *   3. keyword match against the item title
 *
 * NEVER overwrites organizer-confirmed values (packageConfirmedByOrganizer = true).
 */

import { prisma } from '../lib/prisma';

export interface PackageEstimateItem {
  id?: string;
  title?: string | null;
  category?: string | null;
  ebayCategoryId?: string | null;
  packageConfirmedByOrganizer?: boolean | null;
  // existing measured/confirmed values
  packageWeightOz?: number | null;
  packageLengthIn?: number | null;
  packageWidthIn?: number | null;
  packageHeightIn?: number | null;
  packageType?: string | null;
  // AI-estimated values (from cloudAIService tagging pass)
  aiEstimatedWeightOz?: number | null;
  aiEstimatedDimensions?: { length?: number; width?: number; height?: number } | null;
  aiEstimatedPackageType?: string | null;
  aiPackageConfidence?: number | null;
}

export interface PackageEstimate {
  weightOz: number;
  dims: { length: number; width: number; height: number };
  packageType: string;
  confidence: number;
  source: 'CATEGORY' | 'KEYWORD' | 'AI' | 'ORGANIZER' | 'SEED';
}

/**
 * Last-resort default when nothing matches and no AI estimate exists.
 * A generic small/medium mailing box — conservative middle ground.
 */
const FALLBACK: PackageEstimate = {
  weightOz: 24,
  dims: { length: 10, width: 8, height: 6 },
  packageType: 'MAILING_BOX',
  confidence: 0.25,
  source: 'SEED',
};

/**
 * Estimate a package profile for an item.
 * If the item is organizer-confirmed, the confirmed values are returned as-is
 * with source ORGANIZER and never overwritten.
 */
export async function estimatePackageProfile(item: PackageEstimateItem): Promise<PackageEstimate> {
  // 0. Organizer-confirmed values win and are never overwritten.
  if (
    item.packageConfirmedByOrganizer &&
    item.packageWeightOz != null &&
    item.packageLengthIn != null &&
    item.packageWidthIn != null &&
    item.packageHeightIn != null
  ) {
    return {
      weightOz: Number(item.packageWeightOz),
      dims: {
        length: Number(item.packageLengthIn),
        width: Number(item.packageWidthIn),
        height: Number(item.packageHeightIn),
      },
      packageType: item.packageType || 'MAILING_BOX',
      confidence: 1.0,
      source: 'ORGANIZER',
    };
  }

  // 1. ebayCategoryId exact match
  try {
    if (item.ebayCategoryId) {
      const byCat = await prisma.packageProfile.findFirst({
        where: { ebayCategoryId: item.ebayCategoryId },
        orderBy: { confidence: 'desc' },
      });
      if (byCat) return toEstimate(byCat, 'CATEGORY');
    }

    // 2. Keyword match against the item title — a specific item type must beat a
    //    broad category (e.g. "figurine" wins over a generic "Collectibles" profile).
    //    Runs BEFORE the category-label match (was step 3; reordered).
    if (item.title) {
      const title = item.title.toLowerCase();
      const keywordProfiles = await prisma.packageProfile.findMany({
        where: { keyword: { not: null } },
        orderBy: { confidence: 'desc' },
      });
      const hit = keywordProfiles.find((p) => p.keyword && title.includes(p.keyword.toLowerCase()));
      if (hit) return toEstimate(hit, 'KEYWORD');
    }

    // 3. FindA.Sale category match — ONLY true category defaults (keyword IS NULL).
    //    Without this guard, a broad parent category ("Collectibles"/"Electronics")
    //    matches a miscategorized keyword profile (coin 4oz / camera 36oz) and applies
    //    it to every item in the bucket. Defaults only; specific items are handled above.
    if (item.category) {
      const byLabel = await prisma.packageProfile.findFirst({
        where: { category: { equals: item.category, mode: 'insensitive' }, keyword: null },
        orderBy: { confidence: 'desc' },
      });
      if (byLabel) return toEstimate(byLabel, 'CATEGORY');
    }
  } catch (err) {
    console.warn('[PackageEstimate] PackageProfile lookup failed', err);
  }

  // 4. AI estimate — uses aiPackageWeightOz/aiPackageDimsJson/aiPackageConfidence columns (added S981).
  //     ebayController maps these to aiEstimatedWeightOz/aiEstimatedDimensions before calling this fn.
  //     Fires when aiPackageConfidence >= 0.5 and weight/dims are populated (new uploads only).
  if (
    item.aiPackageConfidence != null &&
    item.aiPackageConfidence >= 0.5 &&
    item.aiEstimatedWeightOz != null &&
    item.aiEstimatedDimensions?.length != null &&
    item.aiEstimatedDimensions?.width != null &&
    item.aiEstimatedDimensions?.height != null
  ) {
    return {
      weightOz: Math.round(Number(item.aiEstimatedWeightOz)),
      dims: {
        length: Number(item.aiEstimatedDimensions.length),
        width: Number(item.aiEstimatedDimensions.width),
        height: Number(item.aiEstimatedDimensions.height),
      },
      packageType: item.aiEstimatedPackageType || 'MAILING_BOX',
      confidence: Number(item.aiPackageConfidence),
      source: 'AI',
    };
  }

  // 5. Fallback
  return FALLBACK;
}

function toEstimate(
  p: {
    weightOz: number;
    lengthIn: unknown;
    widthIn: unknown;
    heightIn: unknown;
    packageType: string;
    confidence: unknown;
  },
  source: 'CATEGORY' | 'KEYWORD'
): PackageEstimate {
  return {
    weightOz: p.weightOz,
    dims: {
      length: Number(p.lengthIn),
      width: Number(p.widthIn),
      height: Number(p.heightIn),
    },
    packageType: p.packageType,
    confidence: Number(p.confidence),
    source,
  };
}
