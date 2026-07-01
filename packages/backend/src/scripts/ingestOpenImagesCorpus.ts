/**
 * ingestOpenImagesCorpus.ts — Stage B of the Open Images reverse-image corpus pipeline.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * ATTRIBUTION (CC BY 4.0 annotations / CC BY 2.0 source images)
 * Source data: Google Open Images Dataset — class annotations licensed CC BY 4.0;
 * source images sourced from Flickr under CC BY 2.0. Commercially usable with
 * attribution. See NOTICE-open-images.md in the repo root.
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Per ADR-reverse-image-product-index-2026-07-01.md §4 (mirrors the Overture
 * Stage A/B split — scripts/overture/extract_overture.py +
 * runOvertureEnrichment.ts — heavy/bulk data work in Python, structured DB
 * write in Node):
 *
 *  - Stage A (Python, scripts/open-images/extract_open_images.py): filters
 *    Open Images' class list against EBAY_L1_CATEGORIES/DOMAIN_KEYWORD_MAP,
 *    downloads + embeds a capped per-class image sample via the Marqo-B
 *    embedding service, writes a staging NDJSON file.
 *  - Stage B (THIS script): reads that NDJSON and bulk-inserts into
 *    ProductReferenceEmbedding via $executeRaw batched inserts — Prisma
 *    Client cannot write Unsupported("vector") columns directly (ADR §2
 *    schema preflight note), so raw SQL is required for the embedding column.
 *
 * NOT RUN IN THIS DEV SESSION — this ingests the real corpus, a real
 * multi-hour data job. Build correctness only. Patrick (or a scheduled task,
 * once Stage A has produced real output) runs this once ready to build the
 * actual corpus:
 *
 *   npx tsx src/scripts/ingestOpenImagesCorpus.ts <path/to/staging.ndjson>
 *   or  OPEN_IMAGES_CANDIDATES_FILE=<path> npx tsx src/scripts/ingestOpenImagesCorpus.ts
 *
 * NDJSON candidate record shape (one JSON object per line) produced by Stage A:
 *   {
 *     "sourceDataset": "open-images",     // constant
 *     "sourceId":      string,            // Open Images ImageID
 *     "l1Category":    string,            // mapped EBAY_L1_CATEGORIES name
 *     "label":         string,            // Open Images class display name
 *     "embedding":     number[],          // length must equal EXPECTED_EMBEDDING_DIM
 *     "imageUrl":      string
 *   }
 */

import fs from 'fs';
import readline from 'readline';
import { randomUUID } from 'crypto';

import { prisma } from '../lib/prisma';
import { EBAY_L1_CATEGORIES } from '../config/ebayCategories';

// Marqo-Ecommerce-B output dimension, confirmed via the HuggingFace model card
// (Embedding Model | #Params (m) | Dimension table: Marqo-Ecommerce-B = 768).
// Kept as a named constant (not inline) so it's the one place to change if the
// embedding service is ever swapped to Marqo-Ecommerce-L (1024) per ADR §5 P2.
const EXPECTED_EMBEDDING_DIM = 768;

const BATCH_SIZE = 100;

interface OpenImagesCandidate {
  sourceDataset: string;
  sourceId: string;
  l1Category: string;
  label: string;
  embedding: number[];
  imageUrl?: string | null;
}

interface Stats {
  read: number;
  rejectedBadDim: number;
  rejectedBadL1: number;
  rejectedMissingFields: number;
  inserted: number;
  failed: number;
}

const stats: Stats = {
  read: 0,
  rejectedBadDim: 0,
  rejectedBadL1: 0,
  rejectedMissingFields: 0,
  inserted: 0,
  failed: 0,
};

const VALID_L1 = new Set<string>(EBAY_L1_CATEGORIES);

/**
 * Format a JS number[] embedding as a pgvector literal string, e.g. '[0.1,0.2,...]'.
 * Prisma's $executeRaw can't bind a vector-typed parameter directly (no first-class
 * pgvector support), so the literal is interpolated as a `::vector` cast — safe here
 * because every value is a machine-generated float from our own embedding service,
 * never user input.
 */
function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.map((n) => (Number.isFinite(n) ? n : 0)).join(',')}]`;
}

async function insertBatch(rows: OpenImagesCandidate[]): Promise<void> {
  if (rows.length === 0) return;

  // Batched multi-row INSERT via a single $executeRawUnsafe call. Built with
  // parameterized values for all TEXT columns; only the vector literal itself
  // is string-interpolated (numeric-only, constructed by toVectorLiteral above —
  // not raw user input, so this is not a SQL-injection surface).
  const valuesSql: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  for (const row of rows) {
    const id = randomUUID();
    const vectorLiteral = toVectorLiteral(row.embedding);
    valuesSql.push(
      `($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, '${vectorLiteral}'::vector, $${paramIdx++}, CURRENT_TIMESTAMP)`
    );
    params.push(id, row.sourceDataset, row.sourceId, row.l1Category, row.label, row.imageUrl ?? null);
  }

  const sql = `
    INSERT INTO "ProductReferenceEmbedding"
      ("id", "sourceDataset", "sourceId", "l1Category", "label", "embedding", "imageUrl", "createdAt")
    VALUES ${valuesSql.join(', ')}
  `;

  try {
    await prisma.$executeRawUnsafe(sql, ...params);
    stats.inserted += rows.length;
  } catch (err) {
    console.error('[open-images-ingest] batch insert failed:', err);
    stats.failed += rows.length;
  }
}

async function main(): Promise<void> {
  const file = process.argv[2] || process.env.OPEN_IMAGES_CANDIDATES_FILE;
  if (!file) {
    console.error(
      '[open-images-ingest] No candidates file. Usage: npx tsx src/scripts/ingestOpenImagesCorpus.ts <candidates.ndjson>',
    );
    process.exit(1);
  }
  if (!fs.existsSync(file)) {
    console.error(`[open-images-ingest] Candidates file not found: ${file}`);
    process.exit(1);
  }

  console.log(`[open-images-ingest] Reading candidates from ${file}`);

  let batchRows: OpenImagesCandidate[] = [];

  const rl = readline.createInterface({
    input: fs.createReadStream(file, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let c: OpenImagesCandidate;
    try {
      c = JSON.parse(trimmed) as OpenImagesCandidate;
    } catch {
      continue; // skip malformed line
    }
    stats.read++;

    if (!c.sourceDataset || !c.sourceId || !c.l1Category || !c.label || !Array.isArray(c.embedding)) {
      stats.rejectedMissingFields++;
      continue;
    }
    if (c.embedding.length !== EXPECTED_EMBEDDING_DIM) {
      stats.rejectedBadDim++;
      continue;
    }
    if (!VALID_L1.has(c.l1Category)) {
      stats.rejectedBadL1++;
      continue;
    }

    batchRows.push(c);
    if (batchRows.length >= BATCH_SIZE) {
      await insertBatch(batchRows);
      batchRows = [];
    }
  }

  await insertBatch(batchRows);

  console.log('[open-images-ingest] ── Ingestion complete ──');
  console.log(`  candidates read:          ${stats.read}`);
  console.log(`  rejected (missing field): ${stats.rejectedMissingFields}`);
  console.log(`  rejected (bad dim):       ${stats.rejectedBadDim}`);
  console.log(`  rejected (bad L1):        ${stats.rejectedBadL1}`);
  console.log(`  inserted:                 ${stats.inserted}`);
  console.log(`  failed:                   ${stats.failed}`);
  console.log(
    `OPEN_IMAGES_INGEST_SUMMARY read=${stats.read} inserted=${stats.inserted} failed=${stats.failed}`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('[open-images-ingest] Fatal error:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
