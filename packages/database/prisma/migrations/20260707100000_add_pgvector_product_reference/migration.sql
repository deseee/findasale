-- Reverse-Image Product Index — pgvector MVP
-- Per ADR-reverse-image-product-index-2026-07-01.md §2
--
-- Enable pgvector extension (Railway Postgres ships with this available)
CREATE EXTENSION IF NOT EXISTS vector;

-- Marqo/marqo-ecommerce-embeddings-B output dimension confirmed 768 via the
-- official HuggingFace model card table (Embedding Model | #Params (m) | Dimension):
-- Marqo-Ecommerce-B = 768, Marqo-Ecommerce-L = 1024. Confirmed 2026-07-07, not a guess.
CREATE TABLE "ProductReferenceEmbedding" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sourceDataset" TEXT NOT NULL,        -- 'open-images' | 'findasale-item' | 'ebay-comp'
  "sourceId" TEXT NOT NULL,             -- Open Images ImageID, or Item.id, or eBay comp ID
  "l1Category" TEXT NOT NULL,           -- maps to EBAY_L1_CATEGORIES for corpus filtering/scoping
  "label" TEXT NOT NULL,                -- human-readable label (Open Images class name, or item title)
  "embedding" vector(768) NOT NULL,     -- Marqo-B output dimension
  "imageUrl" TEXT,                      -- optional, for debugging/audit — not required at query time
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "ProductReferenceEmbedding_l1Category_idx" ON "ProductReferenceEmbedding"("l1Category");
CREATE INDEX "ProductReferenceEmbedding_sourceDataset_idx" ON "ProductReferenceEmbedding"("sourceDataset");

-- HNSW index for cosine similarity search (pgvector >= 0.5.0).
-- NOTE for Patrick / next session: confirm Railway's pgvector extension version
-- before running this migration. If Railway's Postgres image ships pgvector < 0.5.0,
-- HNSW will fail to create — fall back to IVFFlat instead:
--   CREATE INDEX "ProductReferenceEmbedding_embedding_ivfflat_idx"
--     ON "ProductReferenceEmbedding" USING ivfflat ("embedding" vector_cosine_ops)
--     WITH (lists = 100);
CREATE INDEX "ProductReferenceEmbedding_embedding_hnsw_idx"
  ON "ProductReferenceEmbedding"
  USING hnsw ("embedding" vector_cosine_ops);

-- Rollback plan:
-- DROP TABLE IF EXISTS "ProductReferenceEmbedding";
-- DROP EXTENSION IF EXISTS vector;
