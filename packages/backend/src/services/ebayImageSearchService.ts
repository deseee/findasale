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

  // Per-top-item enrichment (EXTENDED fieldgroup + item_summary fields). All optional /
  // best-effort — eBay omits any of these freely, so every one is null-safe.
  topEpid?: string | null; // eBay catalog product id, when the top match is a catalog product
  topConditionId?: string | null; // e.g. "1000" (New), "3000" (Used)
  topCondition?: string | null; // human label, e.g. "New", "Used"
  leafCategoryId?: string | null; // precise leaf category — prefer over topCategoryId (broad)
  shortDescription?: string | null; // only present with the EXTENDED fieldgroup

  // Top-level consensus from the `refinement` container (fieldgroups: *_REFINEMENTS).
  // These aggregate across the whole match set, so they are stronger identity signals
  // than any single listing when many listings agree.
  totalMatches?: number | null; // response.total — count of similar listings
  dominantCategoryId?: string | null; // refinement.dominantCategoryId
  brandConsensus?: { value: string; matchCount: number } | null;
  colorConsensus?: { value: string; matchCount: number } | null;
  materialConsensus?: { value: string; matchCount: number } | null;
  categoryConsensus?: { categoryId: string; categoryName: string; matchCount: number } | null;
  conditionConsensus?: { condition: string; conditionId: string | null; matchCount: number } | null;
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
  if (!ebayImageSearchEnabled()) {
    console.log("[ebayImageSearch] skipped — kill switch off (EBAY_IMAGE_SEARCH_ENABLED!=='true')");
    return null;
  }

  // Layer 1 — daily call cap (protects the shared ~5k/day Browse quota that price
  // comps also draw from; searchByImage itself is free, so there is no $ ceiling).
  if (!(await canCallEbayImageSearch())) {
    console.warn('[ebayImageSearch] skipped — daily call cap reached (EBAY_IMAGE_SEARCH_DAILY_CAP)');
    return null;
  }

  if (!imageBase64) {
    console.warn('[ebayImageSearch] skipped — empty imageBase64 (no primary photo supplied)');
    return null;
  }
  if (imageBase64.length > MAX_BASE64_LEN) {
    console.warn(`[ebayImageSearch] skipped — image too large for proxy POST (${imageBase64.length} b64 chars)`);
    return null;
  }

  try {
    const token = await getEbayAccessToken();
    if (!token) {
      console.warn('[ebayImageSearch] skipped — no eBay app token (getEbayAccessToken returned empty)');
      return null;
    }

    // limit=15 widens the sample so the refinement/consensus aggregates are meaningful;
    // still one call per item. fieldgroups pull the EXTENDED item fields + the aspect /
    // category / condition refinement containers used for consensus below. The FIXED_PRICE
    // filter drops auctions so price/consensus reflect buy-it-now comps.
    const fieldgroups = 'EXTENDED,ASPECT_REFINEMENTS,CATEGORY_REFINEMENTS,CONDITION_REFINEMENTS';
    const filter = encodeURIComponent('buyingOptions:{FIXED_PRICE}');
    const path = `/buy/browse/v1/item_summary/search_by_image?limit=15&fieldgroups=${fieldgroups}&filter=${filter}`;
    const res = await fetch(ebayProxyUrl(path), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        ...ebayProxyHeaders(),
      },
      body: JSON.stringify({ image: imageBase64 }),
      signal: AbortSignal.timeout(15000), // 15s per-call timeout (Node 20); AbortError caught by surrounding try/catch
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '(unreadable)');
      console.warn(`[ebayImageSearch] eBay ${res.status} — ${body.slice(0, 200)}`);
      return null;
    }

    const data = (await res.json()) as any;

    // Evidence-first (§10b): surface any eBay warnings so a silently-degraded response
    // is visible in logs rather than guessed at.
    if (Array.isArray(data?.warnings)) {
      for (const w of data.warnings) {
        console.warn(`[ebayImageSearch] eBay warning: ${w?.message ?? JSON.stringify(w)}`);
      }
    }

    const rawSummaries: any[] = Array.isArray(data?.itemSummaries) ? data.itemSummaries : [];
    // Safety: never let an adult-only listing drive identification/category/price.
    const summaries: any[] = rawSummaries.filter((s) => s?.adultOnly !== true);
    if (summaries.length === 0) {
      console.log('[ebayImageSearch] eBay returned 0 visual matches');
      return null;
    }

    // Count the call only after a successful, non-empty response.
    await trackEbayImageSearchCall();

    const top = summaries[0];
    const topTitle: string = (top?.title ?? '').trim();
    if (!topTitle) {
      console.log('[ebayImageSearch] top match had no title — treating as no match');
      return null;
    }

    const topCategoryId: string | null =
      Array.isArray(top?.categories) && top.categories[0]?.categoryId
        ? String(top.categories[0].categoryId)
        : top?.categoryId
        ? String(top.categoryId)
        : null;

    // Precise leaf category (prefer this over the broad topCategoryId when present).
    const leafCategoryId: string | null =
      Array.isArray(top?.leafCategoryIds) && top.leafCategoryIds[0]
        ? String(top.leafCategoryIds[0])
        : null;

    const topEpid: string | null = top?.epid ? String(top.epid) : null;
    const topConditionId: string | null = top?.conditionId ? String(top.conditionId) : null;
    const topCondition: string | null = top?.condition ? String(top.condition) : null;
    const shortDescription: string | null =
      typeof top?.shortDescription === 'string' && top.shortDescription.trim()
        ? top.shortDescription.trim()
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

    // ---- Top-level consensus from the refinement container (best-effort, all null-safe) ----
    const refinement: any = data?.refinement ?? {};
    const totalMatches: number | null = Number.isFinite(data?.total) ? Number(data.total) : null;
    const dominantCategoryId: string | null = refinement?.dominantCategoryId
      ? String(refinement.dominantCategoryId)
      : null;

    // Highest-matchCount aspect value for a given localizedAspectName.
    const aspectConsensus = (aspectName: string): { value: string; matchCount: number } | null => {
      const dists: any[] = Array.isArray(refinement?.aspectDistributions)
        ? refinement.aspectDistributions
        : [];
      const dist = dists.find((d) => d?.localizedAspectName === aspectName);
      const values: any[] = Array.isArray(dist?.aspectValueDistributions)
        ? dist.aspectValueDistributions
        : [];
      let best: { value: string; matchCount: number } | null = null;
      for (const v of values) {
        const value = v?.localizedAspectValue;
        const mc = Number(v?.matchCount);
        if (!value || !Number.isFinite(mc)) continue;
        if (!best || mc > best.matchCount) best = { value: String(value), matchCount: mc };
      }
      return best;
    };

    const brandConsensus = aspectConsensus('Brand');
    const colorConsensus = aspectConsensus('Color');
    const materialConsensus = aspectConsensus('Material');

    let categoryConsensus: { categoryId: string; categoryName: string; matchCount: number } | null = null;
    {
      const cats: any[] = Array.isArray(refinement?.categoryDistributions)
        ? refinement.categoryDistributions
        : [];
      for (const c of cats) {
        const mc = Number(c?.matchCount);
        if (!c?.categoryId || !Number.isFinite(mc)) continue;
        if (!categoryConsensus || mc > categoryConsensus.matchCount) {
          categoryConsensus = {
            categoryId: String(c.categoryId),
            categoryName: String(c?.categoryName ?? ''),
            matchCount: mc,
          };
        }
      }
    }

    let conditionConsensus: { condition: string; conditionId: string | null; matchCount: number } | null = null;
    {
      const conds: any[] = Array.isArray(refinement?.conditionDistributions)
        ? refinement.conditionDistributions
        : [];
      for (const c of conds) {
        const mc = Number(c?.matchCount);
        if (!c?.condition || !Number.isFinite(mc)) continue;
        if (!conditionConsensus || mc > conditionConsensus.matchCount) {
          conditionConsensus = {
            condition: String(c.condition),
            conditionId: c?.conditionId != null ? String(c.conditionId) : null,
            matchCount: mc,
          };
        }
      }
    }

    console.log(
      `[ebayImageSearch] match: title="${topTitle}" ` +
        `category=${categoryConsensus?.categoryId ?? leafCategoryId ?? topCategoryId ?? 'n/a'} ` +
        `"${categoryConsensus?.categoryName ?? ''}" ` +
        `condition="${conditionConsensus?.condition ?? topCondition ?? 'n/a'}" ` +
        `brand="${brandConsensus?.value ?? 'n/a'}" ` +
        `(from${summaries.length} summaries)`
    );

    return {
      topTitle,
      topCategoryId,
      priceRange,
      alternates,
      topEpid,
      topConditionId,
      topCondition,
      leafCategoryId,
      shortDescription,
      totalMatches,
      dominantCategoryId,
      brandConsensus,
      colorConsensus,
      materialConsensus,
      categoryConsensus,
      conditionConsensus,
    };
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
/**
 * Experiment flag — controls whether the eBay searchByImage TOP-MATCH TITLE is
 * presented to Haiku as this item's IDENTITY.
 *
 *   unset / anything but 'true' (NEW DEFAULT) = "demoted" — the matched title is
 *     reframed as a visually-similar marketplace listing that MAY be a different
 *     product; Haiku is told NOT to treat it as this item's identity, only as a
 *     weak category/condition hint. (searchByImage anchors ambiguous items toward
 *     the wrong identity — e.g. a trivet titled "lid" — because the visual match is
 *     approximate; Haiku is multimodal and Web Detection also feeds in, so we test
 *     removing the title as an identity signal.)
 *   'true' = "anchored" — restores the prior behavior where the matched title leads
 *     the context as "closest eBay listing" and is called a strong identification hint.
 *
 * Category / condition / brand / color / material consensus and price comps are
 * UNCHANGED in both modes — only the TITLE's framing differs. Instantly reversible
 * from Railway env with no code deploy. Mirrors the `=== 'true'` gate pattern.
 */
function ebayMatchTitleAsIdentity(): boolean {
  return process.env.EBAY_MATCH_TITLE_AS_ID === 'true';
}

export function buildEbayMatchContext(match: EbayImageMatch | null): string {
  if (!match || !match.topTitle) return '';
  const titleAsIdentity = ebayMatchTitleAsIdentity();
  console.log(`[ebayTitleAnchor] mode=${titleAsIdentity ? 'anchored' : 'demoted'}`);

  // In "anchored" mode the matched title leads as the item's likely identity.
  // In "demoted" mode (default) it is reframed as a visually-similar listing that
  // may be a DIFFERENT product — a weak category/condition hint only, never identity.
  const parts: string[] = titleAsIdentity
    ? [`closest eBay listing: "${match.topTitle}"`]
    : [`a visually-similar marketplace listing (MAY be a different product): "${match.topTitle}"`];

  // Consensus signals (aggregated across the whole match set) come first — when many
  // visual matches agree, that is a stronger identity cue than any single listing.
  if (match.brandConsensus?.value) {
    parts.push(`most visual matches are brand: ${match.brandConsensus.value}`);
  }
  // Category: prefer the aggregated consensus, then the dominant category, then the
  // precise leaf, then the broad top category.
  const categorySignal =
    (match.categoryConsensus && (match.categoryConsensus.categoryName || match.categoryConsensus.categoryId)
      ? `category consensus ${match.categoryConsensus.categoryName || ''} (${match.categoryConsensus.categoryId})`.trim()
      : null) ||
    (match.dominantCategoryId ? `dominant eBay category ${match.dominantCategoryId}` : null) ||
    (match.leafCategoryId ? `eBay category ${match.leafCategoryId}` : null) ||
    (match.topCategoryId ? `eBay category ${match.topCategoryId}` : null);
  if (categorySignal) parts.push(categorySignal);

  if (match.conditionConsensus?.condition) {
    parts.push(`most matches listed as condition: ${match.conditionConsensus.condition}`);
  }
  if (match.colorConsensus?.value) parts.push(`common color: ${match.colorConsensus.value}`);
  if (match.materialConsensus?.value) parts.push(`common material: ${match.materialConsensus.value}`);

  if (match.priceRange) parts.push(`similar listings priced ${match.priceRange}`);
  if (typeof match.totalMatches === 'number' && match.totalMatches > 0) {
    // More matches = stronger consensus — surfaced as a confidence cue for Haiku.
    parts.push(`${match.totalMatches} similar listings found (more = stronger consensus)`);
  }
  if (match.shortDescription) parts.push(`listing description: "${match.shortDescription.slice(0, 200)}"`);

  if (match.alternates.length > 0) {
    parts.push(`other visual matches: ${match.alternates.slice(0, 3).map((t) => `"${t}"`).join(', ')}`);
  }
  const closing = titleAsIdentity
    ? 'This comes from matching the photo against live eBay listings — treat it as a strong hint for identification and category, but never let it override legible on-item text or brand marks, and verify against what you can actually see in the photo.'
    : "This comes from matching the photo against live eBay listings, which can return a DIFFERENT product that merely looks similar — do NOT treat the matched listing title as this item's identity. Use it only as a weak category/condition hint. Identify the item from what you can actually SEE in the photos (shape, function, on-item text, brand marks) and from the category/condition/brand/price signals above.";
  return `\n\neBay image-search match: ${parts.join('; ')}. ${closing}`;
}
