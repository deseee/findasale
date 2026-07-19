/**
 * listingEnrichmentService.ts
 *
 * Enriches scraped sale listings with AI-generated metadata.
 * Extracts categories, price ranges, and summaries from description text using Claude Haiku.
 * Stores results in Sale.scrapedMetadata.aiEnriched for display on organizer profiles.
 */

import axios from 'axios';
import { regionConfig } from '../config/regionConfig';
import { trackAITokens, estimateTokensForRequest, isAICostCeilingExceeded, recordApiUsage, ANTHROPIC_COST_PER_M_TOKENS, recordAnthropicUsageOrEstimate, isAIDailyCallCapAvailable, trackAICall } from '../lib/aiCostTracker';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

export interface EnrichedListingData {
  categories: string[];
  priceRange: string;
  summary: string;
}

/**
 * Enrich a scraped listing with AI-generated metadata.
 * Extracts categories, estimated price range, and a concise summary from the description.
 *
 * Gate conditions:
 * - Only processes if scrapedMetadata.aiEnriched is null
 * - Only processes if description length > 50 characters
 * - Returns null if API unavailable or cost ceiling exceeded
 *
 * Result is stored in Sale.scrapedMetadata.aiEnriched for persistence.
 */

// ---------------------------------------------------------------------------
// Free extraction — runs before Haiku to avoid unnecessary API calls (~70% hit rate)
// ---------------------------------------------------------------------------

const KEYWORD_CATEGORY_MAP: Array<{ keywords: string[]; category: string }> = [
  { keywords: ['furniture'], category: 'Furniture' },
  { keywords: ['jewelry', 'jewellery'], category: 'Jewelry' },
  { keywords: ['art'], category: 'Art' },
  { keywords: ['clothing', 'clothes', 'garments'], category: 'Clothing' },
  { keywords: ['kitchenware', 'kitchen'], category: 'Kitchenware' },
  { keywords: ['tools', 'tool'], category: 'Tools' },
  { keywords: ['collectibles', 'collectible'], category: 'Collectibles' },
  { keywords: ['electronics', 'electronic'], category: 'Electronics' },
  { keywords: ['books', 'book'], category: 'Books' },
  { keywords: ['linens', 'linen'], category: 'Linens' },
  { keywords: ['antiques', 'antique'], category: 'Antiques' },
  { keywords: ['vintage'], category: 'Vintage' },
  { keywords: ['glassware', 'crystal'], category: 'Glassware' },
  { keywords: ['silverware', 'silver'], category: 'Silverware' },
  { keywords: ['coins', 'coin'], category: 'Coins' },
  { keywords: ['records', 'vinyl'], category: 'Records' },
  { keywords: ['toys', 'toy'], category: 'Toys & Games' },
  { keywords: ['games', 'game'], category: 'Toys & Games' },
  { keywords: ['rugs', 'rug'], category: 'Rugs' },
  { keywords: ['lamps', 'lamp'], category: 'Lighting' },
  { keywords: ['mirrors', 'mirror'], category: 'Mirrors' },
  { keywords: ['clocks', 'clock'], category: 'Clocks' },
  { keywords: ['china', 'pottery', 'ceramics'], category: 'Ceramics & China' },
];

function tryFreeExtraction(description: string, saleTitle: string): EnrichedListingData | null {
  const haystack = `${description} ${saleTitle}`.toLowerCase();

  // --- Categories ---
  const seen = new Set<string>();
  const categories: string[] = [];
  for (const entry of KEYWORD_CATEGORY_MAP) {
    if (categories.length >= 5) break;
    if (entry.keywords.some((kw) => haystack.includes(kw))) {
      if (!seen.has(entry.category)) {
        seen.add(entry.category);
        categories.push(entry.category);
      }
    }
  }

  // --- Price range ---
  let priceRange = '';
  const rangeMatch = description.match(
    /\$(\d+(?:,\d{3})*(?:\.\d{2})?)\s*[-\u2013to]+\s*\$(\d+(?:,\d{3})*(?:\.\d{2})?)/i
  );
  if (rangeMatch) {
    priceRange = `$${rangeMatch[1]}\u2013$${rangeMatch[2]}`;
  } else {
    const singleMatch = description.match(/\$(\d+(?:,\d{3})*(?:\.\d{2})?)/);
    if (singleMatch) {
      priceRange = `from $${singleMatch[1]}`;
    } else {
      const centsMatch = description.match(/(\d+)\s*(?:cents?|¢)/i);
      if (centsMatch) {
        priceRange = 'under $5';
      }
    }
  }

  // --- Decision gate ---
  if (categories.length < 2 && priceRange === '') {
    return null; // Not enough signal — fall through to Haiku
  }

  // --- Summary (first sentence, max 150 chars) ---
  let summary = '';
  if (description.length <= 80) {
    summary = description.trim();
  } else {
    const sentenceMatch = description.match(/^[^.!?]+[.!?]/);
    summary = sentenceMatch ? sentenceMatch[0].trim() : description.slice(0, 150).trim();
  }
  if (summary.length > 150) {
    summary = summary.slice(0, 150);
  }

  return {
    categories: categories.map(sanitizeForPostgres),
    priceRange: sanitizeForPostgres(priceRange),
    summary: sanitizeForPostgres(summary),
  };
}

/**
 * Strip characters that PostgreSQL rejects in string literals.
 *
 * Covers the same set as sanitizeStr() in the controller:
 *   1. NUL bytes (\x00)
 *   2. ASCII control chars 0x01-0x08, 0x0B-0x0C, 0x0E-0x1F
 *      (tab/newline/CR are safe and preserved)
 *   3. Incomplete \x hex escapes (\x not followed by exactly 2 hex digits)
 *   4. Lone backslashes before unrecognised chars
 *   5. Lone Unicode surrogates (U+D800–U+DFFF) and non-BMP chars (emoji)
 *      — PostgreSQL 18 jsonb rejects lone surrogates (root cause of recurring
 *        FINDASALE-NODEJS-42; sale cmoog3n0l009tq4utw56ejcrx description ends
 *        with 🔥 emoji; slicing at 150 codepoints can split a surrogate pair)
 *
 * This runs on the Haiku AI response fields (categories, priceRange, summary)
 * BEFORE they reach the controller's recursive sanitizeMetadataStrings() pass,
 * providing defence-in-depth for FINDASALE-NODEJS-42 recurrences.
 */
function sanitizeForPostgres(value: string): string {
  return value
    .replace(/\x00/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/\\x(?![0-9a-fA-F]{2})/g, ' ')
    .replace(/\\(?![\\nrtbf"'0-9xu])/g, '\\\\')
    // Lone Unicode surrogates (U+D800–U+DFFF) and non-BMP chars (emoji etc.)
    // cause "invalid input syntax for type json" in PostgreSQL 18 jsonb.
    // eslint-disable-next-line no-misleading-character-class
    .replace(/[\uD800-\uDFFF]|[^\u0000-\uFFFF]/g, ' ')
    .trim();
}

export function buildEnrichmentPrompt(description: string, saleTitle: string): string {
  return `You are analyzing a secondary market sale listing for ${regionConfig.city}, ${regionConfig.state}.

Sale Title: "${saleTitle}"
Description: "${description}"

Extract and respond with ONLY valid JSON (no markdown, no explanation):
{
  "categories": ["category1", "category2", "category3"],
  "priceRange": "$X\u2013$Y" or "typically $X\u2013$Y",
  "summary": "1-sentence description of featured items or typical prices"
}

Guidelines:
- Categories: Extract 2-5 item types or categories mentioned (e.g., "furniture", "jewelry", "tools", "vintage"). If none clear, infer from description.
- Price Range: Estimate typical price range for items mentioned. Use format "$5\u2013$50" or "typically $10\u2013$100". Base on secondary market values, not retail.
- Summary: If description > 100 words, create a 1-sentence summary. Otherwise, summarize the key item types/themes. Max 15 words.

Return ONLY JSON, no explanation.`;
}

/**
 * Parse + validate + sanitize a raw Haiku text response into EnrichedListingData.
 * Shared by both the synchronous single-call path and the Batch API path so the two
 * never drift in validation/sanitization behavior.
 */
export function parseEnrichmentResponse(content: string): EnrichedListingData | null {
  try {
    const raw = content.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(raw) as EnrichedListingData;

    if (
      !Array.isArray(parsed.categories) ||
      typeof parsed.priceRange !== 'string' ||
      typeof parsed.summary !== 'string'
    ) {
      console.warn('[enrichment] Invalid response structure:', parsed);
      return null;
    }

    parsed.categories = parsed.categories
      .slice(0, 5)
      .map((c: string) => (typeof c === 'string' ? sanitizeForPostgres(c.slice(0, 50)) : ''))
      .filter((c: string) => c.length > 0);

    parsed.priceRange = sanitizeForPostgres(parsed.priceRange.slice(0, 100));
    parsed.summary = sanitizeForPostgres(parsed.summary.slice(0, 150));

    return parsed;
  } catch (error: any) {
    console.warn('[enrichment] Failed to parse enrichment response:', error.message || error);
    return null;
  }
}

export async function enrichScrapedListing(
  description: string,
  saleTitle: string
): Promise<EnrichedListingData | null> {
  // Pre-flight checks
  if (!ANTHROPIC_API_KEY) {
    console.warn('[enrichment] ANTHROPIC_API_KEY not configured, skipping enrichment');
    return null;
  }

  if (!description || description.length <= 50) {
    return null;
  }

  // Cost ceiling check
  if (await isAICostCeilingExceeded()) {
    console.warn('[enrichment] AI cost ceiling exceeded, skipping enrichment');
    return null;
  }

  // Fix B: absolute daily AI call-count cap
  if (!(await isAIDailyCallCapAvailable())) {
    console.warn('[enrichment] AI daily call cap reached (AI_DAILY_CALL_CAP), skipping enrichment');
    return null;
  }

  // Try free extraction before paying for AI
  const freeResult = tryFreeExtraction(description, saleTitle);
  if (freeResult) {
    return freeResult;
  }

  console.log('[enrichment] Free extraction insufficient \u2014 calling Haiku for:', saleTitle.slice(0, 50));

  try {
    const prompt = buildEnrichmentPrompt(description, saleTitle);
    const estimatedTokens = estimateTokensForRequest(prompt, false);

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: ANTHROPIC_MODEL,
        max_tokens: 200,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      },
      {
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        timeout: 20000,
      }
    );

    const content: string = response.data.content?.[0]?.text ?? '';

    // Fix A: record REAL per-model usage. Fix B: count toward the daily AI call cap.
    const responseTokens = Math.ceil(content.length / 4) + 50; // estimate fallback only
    await recordAnthropicUsageOrEstimate('anthropic:listing_enrichment', ANTHROPIC_MODEL, response.data.usage, estimatedTokens + responseTokens);
    await trackAICall();

    return parseEnrichmentResponse(content);
  } catch (error: any) {
    // Graceful degradation on error
    console.warn('[enrichment] Error enriching listing:', error.message || error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Batch API path (2026-07-19) — nightly `listingEnrichmentCron` is a fully
// background, non-organizer-facing job (GitHub Actions cron -> POST
// /api/internal/enrich-listing-metadata -> fire-and-forget background processing).
// Nothing waits synchronously on its result, so trading a few extra minutes of
// latency for Anthropic's flat 50% Batch API discount is a clean win here —
// it must NEVER be used on the realtime cloudAIService photo-tagging path, which
// IS user-facing (organizer waiting on a thumbnail).
//
// Design deliberately avoids any new DB table/migration for tracking in-flight
// batch ids: the whole submit -> poll -> collect cycle runs inside one bounded
// background async call. If the Railway process restarts mid-poll (a real,
// non-trivial risk — this backend redeploys frequently), the in-flight batch
// is simply abandoned: those Sale rows are never written, so they still show
// scrapedMetadata.aiEnriched = absent and the NEXT nightly run's "unenriched"
// query naturally re-selects and re-submits them. Self-healing, no schema
// needed — the only cost is the (bounded, small) wasted spend on an abandoned
// in-flight batch, which is an acceptable trade-off flagged to Patrick.
// ---------------------------------------------------------------------------

const ANTHROPIC_API_VERSION = '2023-06-01';
const BATCH_POLL_INTERVAL_MS = 30_000; // 30s between status checks
const BATCH_MAX_WAIT_MS = 20 * 60 * 1000; // 20 min — most batches finish in minutes for this volume; if it runs longer we bail for tonight and let the next run's re-select retry naturally.

interface AnthropicBatchRequest {
  custom_id: string;
  params: {
    model: string;
    max_tokens: number;
    messages: Array<{ role: 'user'; content: string }>;
  };
}

interface AnthropicBatchObject {
  id: string;
  processing_status: 'in_progress' | 'canceling' | 'ended';
  results_url: string | null;
}

interface AnthropicBatchResultLine {
  custom_id: string;
  result: {
    type: 'succeeded' | 'errored' | 'canceled' | 'expired';
    message?: {
      content?: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    error?: { type?: string; message?: string };
  };
}

function anthropicHeaders(): Record<string, string> {
  return {
    'x-api-key': ANTHROPIC_API_KEY as string,
    'anthropic-version': ANTHROPIC_API_VERSION,
    'content-type': 'application/json',
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface BatchEnrichmentItem {
  id: string;
  description: string;
  saleTitle: string;
}

/**
 * Enrich many scraped listings in one Anthropic Message Batch (50% cheaper than the
 * per-item /v1/messages calls in enrichScrapedListing). Returns a Map keyed by the
 * input item's `id` -> EnrichedListingData, or null for items that were skipped,
 * failed, or expired. Free-extraction still runs first per item — only listings
 * that need Haiku are sent to Anthropic at all.
 *
 * Cost-ceiling / daily-cap / API-key gates are checked ONCE for the whole batch
 * (same conservative behavior as the existing single-item gates — no per-item
 * nuance is added here).
 */
export async function enrichScrapedListingsBatch(
  items: BatchEnrichmentItem[]
): Promise<Map<string, EnrichedListingData | null>> {
  const results = new Map<string, EnrichedListingData | null>();

  if (!ANTHROPIC_API_KEY) {
    console.warn('[enrichment:batch] ANTHROPIC_API_KEY not configured, skipping enrichment');
    return results;
  }

  const eligible = items.filter((item) => item.description && item.description.length > 50);

  // Free extraction first — identical logic/order to the single-item path.
  const needsAi: BatchEnrichmentItem[] = [];
  for (const item of eligible) {
    const freeResult = tryFreeExtraction(item.description, item.saleTitle);
    if (freeResult) {
      results.set(item.id, freeResult);
    } else {
      needsAi.push(item);
    }
  }

  if (needsAi.length === 0) {
    return results;
  }

  if (await isAICostCeilingExceeded()) {
    console.warn('[enrichment:batch] AI cost ceiling exceeded, skipping Haiku batch for', needsAi.length, 'listings');
    return results;
  }

  if (!(await isAIDailyCallCapAvailable())) {
    console.warn('[enrichment:batch] AI daily call cap reached (AI_DAILY_CALL_CAP), skipping Haiku batch');
    return results;
  }

  console.log(`[enrichment:batch] Submitting Anthropic Message Batch for ${needsAi.length} listings`);

  const requests: AnthropicBatchRequest[] = needsAi.map((item) => ({
    custom_id: item.id,
    params: {
      model: ANTHROPIC_MODEL,
      max_tokens: 200,
      messages: [{ role: 'user', content: buildEnrichmentPrompt(item.description, item.saleTitle) }],
    },
  }));

  let batch: AnthropicBatchObject;
  try {
    const createResp = await axios.post(
      'https://api.anthropic.com/v1/messages/batches',
      { requests },
      { headers: anthropicHeaders(), timeout: 20000 }
    );
    batch = createResp.data as AnthropicBatchObject;
  } catch (error: any) {
    // Batch submission itself failed (network/API error) — do NOT silently drop these
    // listings for the whole night. Caller (internalListingEnrichmentController) falls back
    // to the per-item enrichScrapedListing path when this function throws.
    console.error('[enrichment:batch] Batch creation failed:', error.message || error);
    throw error;
  }

  console.log(`[enrichment:batch] Batch ${batch.id} created, polling for completion...`);

  const startedAt = Date.now();
  while (batch.processing_status !== 'ended') {
    if (Date.now() - startedAt >= BATCH_MAX_WAIT_MS) {
      console.warn(
        `[enrichment:batch] Batch ${batch.id} did not finish within ${BATCH_MAX_WAIT_MS / 60000}min \u2014 ` +
        'giving up for tonight. Unenriched sales remain unenriched and will be re-selected + ' +
        're-submitted by the next scheduled run (self-healing, no data loss).'
      );
      for (const item of needsAi) {
        if (!results.has(item.id)) results.set(item.id, null);
      }
      return results;
    }

    await sleep(BATCH_POLL_INTERVAL_MS);

    try {
      const statusResp = await axios.get(
        `https://api.anthropic.com/v1/messages/batches/${batch.id}`,
        { headers: anthropicHeaders(), timeout: 20000 }
      );
      batch = statusResp.data as AnthropicBatchObject;
    } catch (error: any) {
      console.warn('[enrichment:batch] Poll request failed, will retry:', error.message || error);
      // transient poll failure — keep looping until BATCH_MAX_WAIT_MS
    }
  }

  console.log(`[enrichment:batch] Batch ${batch.id} ended, fetching results`);

  const resultsUrl: string | null = batch.results_url;
  if (!resultsUrl) {
    console.error(`[enrichment:batch] Batch ${batch.id} ended with no results_url`);
    for (const item of needsAi) {
      if (!results.has(item.id)) results.set(item.id, null);
    }
    return results;
  }

  let resultsText: string;
  try {
    const resultsResp = await axios.get(resultsUrl, {
      headers: anthropicHeaders(),
      timeout: 60000,
      responseType: 'text',
      transformResponse: (r: any) => r, // keep raw JSONL text, do not let axios JSON-parse it
    });
    resultsText = resultsResp.data as string;
  } catch (error: any) {
    console.error('[enrichment:batch] Failed to fetch batch results:', error.message || error);
    for (const item of needsAi) {
      if (!results.has(item.id)) results.set(item.id, null);
    }
    return results;
  }

  const lines = resultsText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

  for (const line of lines) {
    let parsedLine: AnthropicBatchResultLine;
    try {
      parsedLine = JSON.parse(line) as AnthropicBatchResultLine;
    } catch {
      console.warn('[enrichment:batch] Could not parse a results line, skipping');
      continue;
    }

    const { custom_id, result } = parsedLine;

    if (result.type === 'succeeded' && result.message) {
      const text = result.message.content?.[0]?.text ?? '';
      const enriched = parseEnrichmentResponse(text);
      results.set(custom_id, enriched);

      const usage = result.message.usage;
      if (usage && typeof usage.input_tokens === 'number' && typeof usage.output_tokens === 'number') {
        await recordAnthropicUsageOrEstimate(
          'anthropic:listing_enrichment',
          ANTHROPIC_MODEL,
          usage,
          0,
          true // isBatch — halves the recorded cost to reflect the real 50% Batch API discount
        );
      }
      await trackAICall();
    } else {
      // errored / canceled / expired — not billed by Anthropic, so record nothing.
      // Not found -> stays unenriched -> naturally retried by the next scheduled run.
      console.warn(`[enrichment:batch] Result for ${custom_id}: ${result.type}${result.error?.message ? ' - ' + result.error.message : ''}`);
      results.set(custom_id, null);
    }
  }

  // Anything submitted but missing from the results stream (shouldn't normally happen) -> null.
  for (const item of needsAi) {
    if (!results.has(item.id)) results.set(item.id, null);
  }

  return results;
}
