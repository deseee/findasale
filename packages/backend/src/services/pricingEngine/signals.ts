/**
 * Signal Layer — Trends, brand exceptions, sleeper detection
 * Phase 1: Brand exception lookup + sleeper detection stubs
 * Phase 2: Google Trends + eBay momentum
 */

import { PricingRequest, SignalResult } from './types';
import { prisma } from '../../lib/prisma';
import googleTrends from 'google-trends-api';
import { extractL1 } from '../../config/ebayCategories';

/**
 * Fetch trend data for a keyword via google-trends-api
 */
async function fetchGoogleTrend(keyword: string): Promise<number> {
  try {
    const result = await googleTrends.interestOverTime({
      keyword,
      startTime: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // last 90 days
      geo: 'US',
    });

    const data = JSON.parse(result);
    const timelineData: Array<{ value: number[] }> = data?.default?.timelineData ?? [];
    if (timelineData.length === 0) return 1.0;

    // Compare last 2 weeks vs prior 10 weeks
    const recent = timelineData.slice(-14).map(d => d.value[0] ?? 0);
    const prior = timelineData.slice(0, -14).map(d => d.value[0] ?? 0);
    const recentAvg = recent.reduce((a, b) => a + b, 0) / (recent.length || 1);
    const priorAvg = prior.reduce((a, b) => a + b, 0) / (prior.length || 1);

    if (priorAvg === 0) return 1.0;
    const ratio = recentAvg / priorAvg;

    // Cap multiplier: floor 0.85 (declining), ceiling 1.35 (viral)
    return Math.max(0.85, Math.min(1.35, ratio));
  } catch {
    return 1.0; // graceful fallback — trends are a signal, not a requirement
  }
}

/**
 * Analyze item for signal factors: trends, brand premium, sleeper detection
 */
export async function analyzeItem(request: PricingRequest): Promise<SignalResult> {
  const result: SignalResult = {
    isTrending: false,
    trendMultiplier: 1.0,
    isBrandPremium: false,
    isSleeperDetected: false,
    isAppreciating: false,
  };

  // 1. Check for brand exception
  if (request.brand) {
    // Normalize before lookup -- see extractL1's doc comment (2026-08-25
    // category-vocabulary-drift fix). A null normalized category means no
    // exception row could ever match, so skip the query entirely.
    const normalizedCategory = extractL1(request.category);
    const brandException = normalizedCategory
      ? await prisma.brandException.findFirst({
          where: {
            brand: request.brand,
            category: normalizedCategory,
          },
        })
      : null;

    if (brandException) {
      result.isBrandPremium = true;
      result.brandPremiumBrand = brandException.brand;
      result.trendMultiplier = brandException.trendMultiplier;

      if (brandException.appreciationMode === 'APPRECIATION') {
        result.isAppreciating = true;
      } else if (brandException.appreciationMode === 'SLOW_DEPRECIATION') {
        result.depreciationRate = brandException.depreciationRate ?? undefined;
      }
    }
  }

  // 2. Check for sleeper patterns (Phase 1: stub, return no detections)
  // Phase 2 will call cloudAIService for photo analysis
  if (request.photoUrls && request.photoUrls.length > 0) {
    // Stub: No sleeper detection in Phase 1
    // const sleeperResult = await detectSleeperPattern(request.photoUrls, request.category);
    // if (sleeperResult) {
    //   result.isSleeperDetected = true;
    //   result.sleeperCategory = sleeperResult.category;
    //   result.sleeperMultiplier = sleeperResult.multiplier;
    // }
  }

  // 3. Check for trending signals via Google Trends
  result.trendMultiplier = await getTrendMultiplier(request.category, request.title);
  result.isTrending = result.trendMultiplier > 1.1 || result.trendMultiplier < 0.9;

  return result;
}

/**
 * Detect if item matches a sleeper pattern based on vision tags
 * Phase 2: Integrate with cloudAIService
 */
export async function detectSleeperPattern(
  title: string,
  category: string,
  visionTags?: string[]
): Promise<
  | {
      patternName: string;
      category: string;
      multiplier: number;
    }
  | null
> {
  if (!visionTags || visionTags.length === 0) return null;

  // Normalize before lookup (2026-08-25 category-vocabulary-drift fix).
  const normalizedCategory = extractL1(category);
  const patterns = normalizedCategory
    ? await prisma.sleeperPattern.findMany({
        where: {
          category: normalizedCategory,
        },
      })
    : [];

  for (const pattern of patterns) {
    // Check if any of the vision tags match the pattern's indicators
    const hasMatch = pattern.indicatorTokens.some(token =>
      visionTags.some(tag => tag.toLowerCase().includes(token.toLowerCase()))
    );

    if (hasMatch) {
      return {
        patternName: pattern.patternName,
        category: pattern.category,
        multiplier: pattern.priceMultiplier,
      };
    }
  }

  return null;
}

/**
 * Get trend multiplier for a category or search term
 * Queries cache first (TrendSignal table with 24h TTL)
 * Falls back to live Google Trends API if cache miss
 */
export async function getTrendMultiplier(
  category: string,
  searchTerm?: string
): Promise<number> {
  // Normalize before lookup/write so cache reads and writes always agree on the
  // same key (2026-08-25 category-vocabulary-drift fix). Fall back to the raw
  // category string only if it can't be normalized at all -- better to still try
  // a Google Trends lookup on the raw text than to silently no-op.
  const normalizedCategory = extractL1(category) ?? category;

  // Check cache first (24h TTL)
  const trendSignal = await prisma.trendSignal.findFirst({
    where: {
      category: normalizedCategory,
      expireAt: {
        gt: new Date(),
      },
    },
    orderBy: {
      fetchedAt: 'desc',
    },
  });

  if (trendSignal) {
    // Apply cached trend multiplier
    if (trendSignal.trendType === 'UP') {
      return Math.max(1.0, trendSignal.trendStrength);
    }

    if (trendSignal.trendType === 'DOWN') {
      return Math.min(1.0, trendSignal.trendStrength);
    }

    return 1.0; // FLAT or SPIKE = neutral
  }

  // Cache miss — fetch fresh data from Google Trends
  const keyword = searchTerm || category;
  if (!keyword) return 1.0;

  try {
    const multiplier = await fetchGoogleTrend(keyword);

    // Write result to cache for next time -- write the NORMALIZED category so a
    // later read (which also normalizes) actually finds this row.
    const trendType = multiplier > 1.1 ? 'UP' : multiplier < 0.9 ? 'DOWN' : 'FLAT';
    await prisma.trendSignal.create({
      data: {
        category: normalizedCategory,
        searchTerm: category,
        signal: 'GOOGLE_TRENDS',
        trendType,
        trendStrength: multiplier,
        dataPoints: 1,
        period: '30d',
        fetchedAt: new Date(),
        expireAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h TTL
      },
    });

    return multiplier;
  } catch {
    return 1.0; // safe fallback
  }
}

/**
 * Apply brand exception override to depreciation
 * If brand is in exception list and mode is APPRECIATION, skip depreciation
 */
export async function applyBrandException(
  brand: string,
  category: string
): Promise<{
  skipDepreciation: boolean;
  depreciationRate?: number;
  appreciationMode?: string;
} | null> {
  // Normalize before lookup (2026-08-25 category-vocabulary-drift fix).
  const normalizedCategory = extractL1(category);
  if (!normalizedCategory) return null;

  const exception = await prisma.brandException.findFirst({
    where: {
      brand: brand,
      category: normalizedCategory,
    },
  });

  if (!exception) return null;

  return {
    skipDepreciation: exception.appreciationMode === 'APPRECIATION',
    depreciationRate: exception.depreciationRate ?? undefined,
    appreciationMode: exception.appreciationMode,
  };
}
