/**
 * imageMatchService.ts — Reverse-Image Product Index query service.
 *
 * Per ADR-reverse-image-product-index-2026-07-01.md §1/§2/§4:
 * Takes a photo buffer, calls the self-hosted Marqo-Ecommerce-B embedding
 * service (MARQO_EMBED_URL), then runs a raw-SQL pgvector cosine-similarity
 * query against ProductReferenceEmbedding (scoped by l1Category when a hint
 * is available) and returns the top-K matches above SIMILARITY_THRESHOLD.
 *
 * Graceful degradation (mirrors the existing Vision-API-failure pattern in
 * cloudAIService.ts lines 137-141): embedding service unreachable, feature
 * flag off, or no matches above threshold → return null. The caller
 * (cloudAIService.ts) proceeds without catalog-match evidence; nothing else
 * in the pipeline is blocked.
 *
 * IMPORTANT — this feature must stay OFF by default (CATALOG_MATCH_ENABLED,
 * see isCatalogMatchEnabled() below) until the corpus is actually built via
 * scripts/open-images/extract_open_images.py + ingestOpenImagesCorpus.ts.
 * Querying an empty ProductReferenceEmbedding table is harmless (returns no
 * rows) but there's no reason to pay the embedding-service round-trip cost
 * on every photo until there's a corpus to match against.
 */

import axios from 'axios';
import FormData from 'form-data';
import { prisma } from '../lib/prisma';

const MARQO_EMBED_URL = process.env.MARQO_EMBED_URL; // e.g. https://marqo-embed-service-production.up.railway.app
const CATALOG_MATCH_ENABLED = process.env.CATALOG_MATCH_ENABLED === 'true'; // default false — Step 7 feature flag, read once at module load

// Starting similarity threshold per ADR §1/§4 ("~0.75 as a starting point").
// Named constant, easy to tune once real match-quality data comes in from the
// Phase 1 corpus (ADR §5 success metric — track catalog-match acceptance the
// same way feedbackStats does for title/category/price).
export const CATALOG_MATCH_SIMILARITY_THRESHOLD = 0.75;

const TOP_K = 3;
const EMBED_TIMEOUT_MS = 5000; // small budget — Vision is 15s, Haiku is 30s; this must stay well under both (ADR §1 latency note)

export interface CatalogMatch {
  label: string;
  l1Category: string;
  similarity: number; // 0.0–1.0, cosine similarity
  sourceDataset: string;
}

/** Returns true when the catalog-match feature flag is on AND the embedding service URL is configured. */
export function isCatalogMatchEnabled(): boolean {
  return CATALOG_MATCH_ENABLED && !!MARQO_EMBED_URL;
}

/**
 * Call the Marqo-B embedding service for a single image buffer.
 * Returns null on any failure (timeout, service down, bad response) — never throws.
 */
async function embedImage(buffer: Buffer, mimeType: string): Promise<number[] | null> {
  if (!MARQO_EMBED_URL) return null;

  try {
    const form = new FormData();
    form.append('file', buffer, { filename: 'image.jpg', contentType: mimeType });

    const response = await axios.post(`${MARQO_EMBED_URL.replace(/\/$/, '')}/embed`, form, {
      headers: form.getHeaders(),
      timeout: EMBED_TIMEOUT_MS,
    });

    const embedding = response.data?.embedding;
    if (!Array.isArray(embedding) || embedding.length === 0) return null;
    return embedding as number[];
  } catch (error: any) {
    // Graceful degradation — embedding service down/unreachable/slow. Caller
    // proceeds without catalog-match evidence (same shape as Vision-API-down).
    console.warn('[imageMatchService] embed request failed:', error?.message ?? error);
    return null;
  }
}

/**
 * Find the top-K most visually similar reference images for a given photo,
 * optionally scoped to an L1 category hint (from Vision labels or a prior
 * Haiku pass) to narrow the search and improve precision.
 *
 * Returns null when: the feature flag is off, the embedding service is
 * unreachable, or no match clears CATALOG_MATCH_SIMILARITY_THRESHOLD.
 * Never throws — every failure path degrades to null.
 */
export async function findCatalogMatches(
  buffer: Buffer,
  mimeType: string,
  l1CategoryHint?: string | null
): Promise<CatalogMatch[] | null> {
  if (!isCatalogMatchEnabled()) return null;

  const embedding = await embedImage(buffer, mimeType);
  if (!embedding) return null;

  const vectorLiteral = `[${embedding.map((n) => (Number.isFinite(n) ? n : 0)).join(',')}]`;

  try {
    // pgvector cosine distance operator `<=>` returns distance (0 = identical);
    // similarity = 1 - distance. Prisma's Unsupported("vector") type requires
    // raw SQL for any query against this column (ADR §2 schema preflight note).
    // Category scoping is applied when a hint is available (narrows the HNSW
    // scan and improves precision); falls back to an unscoped search otherwise.
    const rows = l1CategoryHint
      ? await prisma.$queryRawUnsafe<
          { label: string; l1Category: string; sourceDataset: string; similarity: number }[]
        >(
          `SELECT "label", "l1Category", "sourceDataset",
                  1 - ("embedding" <=> $1::vector) AS similarity
           FROM "ProductReferenceEmbedding"
           WHERE "l1Category" = $2
           ORDER BY "embedding" <=> $1::vector
           LIMIT $3`,
          vectorLiteral,
          l1CategoryHint,
          TOP_K
        )
      : await prisma.$queryRawUnsafe<
          { label: string; l1Category: string; sourceDataset: string; similarity: number }[]
        >(
          `SELECT "label", "l1Category", "sourceDataset",
                  1 - ("embedding" <=> $1::vector) AS similarity
           FROM "ProductReferenceEmbedding"
           ORDER BY "embedding" <=> $1::vector
           LIMIT $2`,
          vectorLiteral,
          TOP_K
        );

    const matches = rows
      .filter((r) => r.similarity >= CATALOG_MATCH_SIMILARITY_THRESHOLD)
      .map((r) => ({
        label: r.label,
        l1Category: r.l1Category,
        similarity: r.similarity,
        sourceDataset: r.sourceDataset,
      }));

    return matches.length > 0 ? matches : null;
  } catch (error: any) {
    // Graceful degradation — e.g. empty corpus, HNSW index not yet built, or
    // any query error. Caller proceeds without catalog-match evidence.
    console.warn('[imageMatchService] pgvector query failed:', error?.message ?? error);
    return null;
  }
}

/**
 * Build the catalogMatchContext prompt string for the top match, per ADR §1's
 * exact template. Returns '' when there is no qualifying match (caller can
 * unconditionally concatenate this into a prompt string).
 */
export function buildCatalogMatchContext(matches: CatalogMatch[] | null): string {
  if (!matches || matches.length === 0) return '';
  const top = matches[0];
  const scorePct = Math.round(top.similarity * 100);
  return `\n\nReference catalog match: the photo's visual embedding most closely matches a reference image labeled "${top.label}" (category: ${top.l1Category}, similarity: ${scorePct}%). Treat this as a strong hint, not a certainty — verify against what you can actually see before using it.`;
}
