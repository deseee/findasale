-- Sprint U1: Add embedding column to Item for Ollama semantic search
-- nomic-embed-text produces 768-dimensional float vectors
-- Stored as DOUBLE PRECISION[] (Prisma Float[])
-- Empty array default: items without embeddings fall back to text search

ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "embedding" DOUBLE PRECISION[] NOT NULL DEFAULT '{}';
