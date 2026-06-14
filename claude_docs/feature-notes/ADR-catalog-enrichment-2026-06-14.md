# ADR — Catalog-Based Product Enrichment (identifiers, dims, comps) — 2026-06-14 (S975)

## Decision
Add a catalog-enrichment step to the item-analysis pipeline that auto-fills product
identifiers (MPN/UPC/EAN/EPID/brand) and package weight/dimensions from eBay's catalog
when a match is confident, and stores a one-click *suggestion* otherwise. The established
model number then drives precise comps. Three connected parts: (1) catalog enrichment,
(2) comps model-enforcement, (3) AI captures the model number.

## Confidence gating (the core rule)
- **HIGH (auto-apply):** a barcode→catalog match (`lookupByBarcode`), OR a brand+model
  catalog search where the catalog product's brand matches AND the exact model token
  (e.g. `AP-40`) appears in the catalog product title. → write the real fields.
- **Below HIGH (suggest):** a partial/fuzzy catalog match. → write nothing authoritative;
  store under `Item.catalogSuggestions` for the edit UI to surface for one-click accept.
- **Organizer-set values always win:** auto-apply fills an identifier ONLY when the item's
  field is empty (never overwrite a value the organizer set). Weight/dims auto-fill ONLY
  when `packageConfirmedByOrganizer === false` (reuse the existing guardrail).

## Schema (additive — one nullable column)
`Item.catalogSuggestions Json?` — holds low-confidence suggestions, e.g.
`{ source: 'ebay-catalog'|'barcode', confidence: number, identifiers?: {mpn?,upc?,ean?,epid?,brand?}, package?: {weightOz?,lengthIn?,widthIn?,heightIn?}, matchedTitle?: string, suggestedAt: ISO }`.
Additive nullable JSONB — no data risk. DDL-only migration (run via `prisma db execute`,
not a full migration file). See Migration Plan below.

## Components
1. **AI prompt (cloudAIService, both single + multi-image):** capture a visible model/part
   number from labels/markings → return as `mpn` (or a `model` field mapped to mpn). Only
   when it actually appears in the photos (consistent with the accuracy-pass discipline).
2. **`enrichItemFromCatalog(item)` (new, in a service — e.g. ebayCatalogLookup.ts):**
   - If `item.upc/ean/isbn` or a detected barcode → `lookupByBarcode` (HIGH).
   - Else if brand + model token available → `searchCatalogProduct({ q: brand+model, ... })`,
     pick best match, compute confidence (brand-exact + model-token-in-title = HIGH).
   - Returns `{ confidence, identifiers, package, matchedTitle }` or null.
3. **Apply logic (in the analyze flows + re-analyze endpoint):**
   - HIGH → fill empty identifier fields + (if !packageConfirmedByOrganizer) weight/dims;
     clear `catalogSuggestions`.
   - Below HIGH → set `Item.catalogSuggestions` (don't touch real fields).
4. **Comps fix (`getEbayPriceComps`, ebayController):** derive a model token from
   `item.mpn` (preferred) or a regex on the title (e.g. `/\b[A-Z]{1,4}[- ]?\d{1,4}[A-Z]?\b/`).
   Include it in the `q=`, AND post-filter the eBay results to titles containing that exact
   token (case-insensitive) when a model token exists. Drops AP-4/AP-100 vs AP-40.
5. **Wire-in:** call `enrichItemFromCatalog` after AI analysis in `batchAnalyzeController`,
   `processRapidDraft`, and the `/api/internal/reanalyze-item` endpoint.
6. **Frontend (edit-item, minimal):** when `item.catalogSuggestions` exists, show the
   suggested MPN/UPC/dims with an "Accept" affordance that writes them into the fields.

## Rationale
- Barcode enrichment already auto-applies — this extends the SAME pattern to non-barcoded
  items via the catalog product search, with a confidence gate so we never assert a wrong
  identifier. Suggestions keep weak matches visible without polluting authoritative data.
- Model-enforced comps fix the wrong-model noise (AP-4/AP-100) AND the skewed price.

## Consequences
- Better identifiers/dims → better eBay listings, accurate comps, accurate flat-rate
  shipping (dims feed the cheapest-carrier engine). One new nullable column.
- Catalog coverage is partial for vintage/unique items — enrichment is best-effort; absence
  of a match is normal and silent.

## Migration Plan (DDL-only, additive)
```
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "catalogSuggestions" JSONB;
```
Run against Railway via `prisma db execute --stdin` (override DATABASE_URL with the Railway
proxy URL), then `prisma generate`. Add the field to schema.prisma so the client types match.

## Rollback
Code: `git revert`. Column: harmless to leave (nullable, unused) or
`ALTER TABLE "Item" DROP COLUMN "catalogSuggestions";`. No data migration to reverse.

## Dev sequence
1. schema.prisma: add `catalogSuggestions Json?` to Item. Provide the ALTER TABLE SQL for Patrick.
2. cloudAIService prompts: capture model/part number → mpn (evidence-only).
3. ebayCatalogLookup.ts: add `enrichItemFromCatalog(item)` (barcode → HIGH; catalog search →
   confidence-scored) + a `modelTokenFrom(title|mpn)` helper (shared with comps).
4. ebayController `getEbayPriceComps`: enforce model token (query + post-filter).
5. Wire enrichment + apply/suggest into batchAnalyze, processRapidDraft, reanalyze endpoint.
6. Frontend edit-item: surface catalogSuggestions with Accept.
7. Backend + frontend tsc 0 errors (use the pnpm-store tsc path; npx tsc is broken).
