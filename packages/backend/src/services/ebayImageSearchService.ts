/**
 * ebayImageSearchService.ts — eBay Browse `searchByImage` catalog-match evidence
 * (ADR-ebay-searchbyimage-tagging-2026-07-02)
 *
 * Live reverse-image lookup against eBay's marketplace catalog. The organizer's
 * PRIMARY photo is POSTed to Browse `search_by_image`; the top matches' titles +
 * eBay categoryId + price range become additional grounding evidence fed into the
 * Haiku (and Ollama-fallback) prompt — the same "feeds Haiku, never standalone"
 * pattern as Vision labels and Web Detection.
 *
 * Reuses the existing client-credentials app token (getEbayAccessToken) and the
 * Vercel proxy (ebayProxyUrl) — no new OAuth scope, no user token. searchByImage
 * is PRODUCTION-ONLY (no Sandbox). This function never throws to the caller — it
 * returns null on any gate failure, oversize image, network error, non-2xx
 * response, or empty result, so callers treat null as "no match evidence."
 */
import { getEbayAccessToken, ebayProxyUrl, ebayProxyHeaders } from './ebayHttp';
import {
  ebayImageSearchEnabled,
  canCallEbayImageSearch,
  trackEbayImageSearchCall,
} from '../lib/aiCostTracker';

export interface EbayImageMatch {
  topTitle: string;
  topCategoryId: string | null;
  priceRange: string | null; // e.g. "$12.99–$45.00" across the returned matches
  alternates: string[]; // up to 4 other visual-match titles
}

// No server-side image downscaler is available in the backend (sharp/jimp are not
// dependencies), and this call site receives an already-encoded base64 string (the
// pipeline hands cloudAIService buffers, not Cloudinary URLs). To keep the proxy
// POST body safely under Vercel's ~4.5MB API-route limit, skip the eBay call for
// oversize images rather than risk a proxy body-limit error. ~3.5M base64 chars ≈
// a ~2.6MB image. See ADR "Flagged" note #1 — a sharp-based downscale is the
// follow-on that would raise coverage on large photos.
const MAX_BASE64_LEN = 3_500_000;

/**
 * Query eBay Browse searchByImage with a single (primary) photo. Internally gated
 * by the kill switch + daily quota-protection cap — a fast no-op when
 * EBAY_IMAGE_SEARCH_ENABLED is not 'true'. Call ONCE PER ITEM on its primary photo.
 */
export async function getEbayImageMatch(imageBase64: string): Promise<EbayImageMatch | null> {
  // Layer 0 — kill switch (default OFF).
  if (!ebayImageSearchEnabled()) return null;

  // Layer 1 — daily call cap (protects the shared ~5k/day Browse quota that price
  // comps also draw from; searchByImage itself is free, so there is no $ ceiling).
  if (!(await canCallEbayImageSearch())) {
    console.warn('[ebayImageSearch] skipped — daily call cap reached (EBAY_IMAGE_SEARCH_DAILY_CAP)');
    return null;
  }

  if (!imageBase64) return null;
  if (imageBase64.length > MAX_BASE64_LEN) {
    console.warn(`[ebayImageSearch] skipped — image too large for proxy POST (${imageBase64.length} b64 chars)`);
    return null;
  }

  try {
    const token = await getEbayAccessToken();
    if (!token) return null;

    // limit=5 keeps the response small; best-match order is eBay's default.
    const path = '/buy/browse/v1/item_summary/search_by_image?limit=5';
    const res = await fetch(ebayProxyUrl(path), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        ...ebayProxyHeaders(),
      },
      body: JSON.stringify({ image: imageBase64 }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '(unreadable)');
      console.warn(`[ebayImageSearch] eBay ${res.status} — ${body.slice(0, 200)}`);
      return null;
    }

    const data = (await res.json()) as any;
    const summaries: any[] = Array.isArray(data?.itemSummaries) ? data.itemSummaries : [];
    if (summaries.length === 0) return null;

    // Count the call only after a successful, non-empty response.
    await trackEbayImageSearchCall();

    const top = summaries[0];
    const topTitle: string = (top?.title ?? '').trim();
    if (!topTitle) return null;

    const topCategoryId: string | null =
      Array.isArray(top?.categories) && top.categories[0]?.categoryId
        ? String(top.categories[0].categoryId)
        : top?.categoryId
        ? String(top.categoryId)
        : null;

    // Price range across the returned matches (best-effort — price may be absent on some).
    const prices = summaries
      .map((s) => parseFloat(s?.price?.value))
      .filter((v) => Number.isFinite(v));
    let priceRange: string | null = null;
    if (prices.length > 0) {
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      const cur = summaries.find((s) => s?.price?.currency)?.price?.currency ?? 'USD';
      const sym = cur === 'USD' ? '$' : `${cur} `;
      priceRange = min === max ? `${sym}${min.toFixed(2)}` : `${sym}${min.toFixed(2)}–${sym}${max.toFixed(2)}`;
    }

    const alternates = summaries
      .slice(1, 5)
      .map((s) => (s?.title ?? '').trim())
      .filter(Boolean);

    return { topTitle, topCategoryId, priceRange, alternates };
  } catch (err: any) {
    console.warn('[ebayImageSearch] error:', err?.message || err);
    return null;
  }
}

/**
 * Conditional-inclusion evidence string, same shape as buildCatalogMatchContext()
 * (imageMatchService) and buildWebDetectionContext() (cloudAIService). Empty string
 * when there is no qualifying match — coexists with the text-vs-shape hierarchy and
 * the other evidence sources as an independent hint, never a replacement.
 */
export function buildEbayMatchContext(match: EbayImageMatch | null): string {
  if (!match || !match.topTitle) return '';
  const parts: string[] = [`closest eBay listing: "${match.topTitle}"`];
  if (match.topCategoryId) parts.push(`eBay category ${match.topCategoryId}`);
  if (match.priceRange) parts.push(`similar listings priced ${match.priceRange}`);
  if (match.alternates.length > 0) {
    parts.push(`other visual matches: ${match.alternates.slice(0, 3).map((t) => `"${t}"`).join(', ')}`);
  }
  return `\n\neBay image-search match: ${parts.join('; ')}. This comes from matching the photo against live eBay listings — treat it as a strong hint for identification and category, but never let it override legible on-item text or brand marks, and verify against what you can actually see in the photo.`;
}
