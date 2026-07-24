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
  description?: string | null;
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
 * ADR-092 (2026-07-24): extract an explicit weight statement from free text (item
 * title/description), e.g. "44 lbs total weight" or "net weight 12oz". Returns ounces,
 * or null if no clear, unambiguous weight statement is found. Conservative by design --
 * a missed statement just means no plausibility check runs (same as today); a false
 * match would be worse (could wrongly veto a correct keyword estimate), so this only
 * matches clear numeric + unit patterns and makes no attempt to disambiguate things
 * like "16oz mug" (container capacity, not necessarily the shipping weight).
 */
function extractStatedWeightOz(text: string): number | null {
  if (!text) return null;
  const lbMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:lbs?|pounds?)\b/i);
  if (lbMatch) {
    const lbs = parseFloat(lbMatch[1]);
    if (!isNaN(lbs) && lbs > 0) return lbs * 16;
  }
  const ozMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:oz|ounces?)\b/i);
  if (ozMatch) {
    const oz = parseFloat(ozMatch[1]);
    if (!isNaN(oz) && oz > 0) return oz;
  }
  return null;
}

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
      if (hit) {
        // ADR-092 (2026-07-24): a generic keyword profile can't tell a single small
        // item from a bulk lot -- cross-check against any explicit weight the organizer
        // already stated in their own title/description text (e.g. "44 lbs total
        // weight"). More than 2x off in either direction means this keyword match is
        // implausible for this specific item -- don't trust it, fall through to the
        // next tier instead (exactly as if no keyword had matched at all).
        const statedOz = extractStatedWeightOz(`${item.title} ${item.description || ''}`);
        if (statedOz == null || hit.weightOz <= 0 || Math.abs(Math.log2(statedOz / hit.weightOz)) <= 1) {
          return toEstimate(hit, 'KEYWORD');
        }
        console.warn(
          `[PackageEstimate] KEYWORD match implausible for "${item.title}" -- stated=${statedOz}oz vs keyword=${hit.weightOz}oz, falling through to next tier`
        );
      }
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
