# ADR — Product Enrichment Cascade — 2026-06-14 (S975)

## Decision
Replace the ad-hoc catalog enrichment with a **provider cascade**: one service that
runs pluggable providers in priority order, takes the first non-null value per field
(with a `source` + `confidence` attached), caches by identifier, and merges results into
the item — confident values to real fields (organizer-set + `packageConfirmedByOrganizer`
always win), weaker ones to `Item.catalogSuggestions`. Free providers first; paid wired
but disabled; eBay Catalog slotted in (dormant until the Buy-API grant lands). **No GS1.**

## Contract
```ts
type EnrichField = 'brand'|'mpn'|'upc'|'ean'|'isbn'|'epid'|'ebayCategoryId'|'ebayCategoryName'
                 |'weightOz'|'lengthIn'|'widthIn'|'heightIn';
interface ProviderResult { fields: Partial<Record<EnrichField, string|number>>; confidence: number; source: string; }
interface EnrichmentProvider {
  name: string;
  isEnabled(): boolean;                       // env-flag gate (paid providers default OFF)
  appliesTo(item): boolean;                    // e.g. openLibrary only when isbn present
  lookup(item): Promise<ProviderResult|null>;  // null on miss/error — NEVER throws
}
async function enrichItem(item): Promise<{ merged: Record<EnrichField,{value,source,confidence}>; }>;
```
Cascade: run each enabled+applicable provider in order; first provider to supply a field
wins that field; stop early once all wanted fields are filled. Cache provider results by
`upc`/`mpn`/`isbn` (in-memory map now; a small persistent cache later) — products' specs
never change, so each identifier is fetched at most once.

## Providers (priority order)
1. **localBarcode** — the locally DECODED barcode (already in the pipeline) → `upc`/`ean`.
   confidence 1.0. No API. This is the authoritative UPC source.
2. **openLibrary** — `isbn` → title/authors/etc. Free, no key. (Books.)
3. **openFoodFacts** — grocery `upc` → product name + `product_quantity` (net weight).
   Free, no key. (Food.)
4. **ebayCatalog** — wraps the existing `enrichItemFromCatalog` (searchCatalogProduct +
   later get_product). isEnabled=true but returns null on the current 403 → harmless;
   lights up automatically when the Buy-API grant lands. (General + dims.)
5. **goUpc** (PAID) — `isEnabled = !!process.env.GOUPC_API_KEY` → DEFAULT OFF. UPC →
   weight/dims/brand/category. Drop-in fallback; costs nothing until the key is set.
6. **aiEstimate** — last resort for `weightOz`/dims from the analysis result. Always on.

## Haiku one-pass (analysis prompt — the "reading" half)
Single analysis call also returns visible identifiers: `mpn`/model, `brand`, and `upc`
**only when a barcode or printed UPC digits are actually visible** — else null.
HARD RULE: the model NEVER fabricates a UPC or exact dimensions from memory; a UPC comes
only from a decoded barcode or visibly-printed digits. Recognition guesses ("looks like a
Danner AP-40") + recalled specs are SUGGESTIONS only, never auto-applied.

## Apply rule (per field, reused everywhere)
- A field is **auto-applied** when its winning source is authoritative
  (`localBarcode`/`openLibrary`/`openFoodFacts`/`ebayCatalog`/`goUpc`) OR confidence ≥ 0.85
  — and only into an EMPTY field (organizer-set always wins); weight/dims only when
  `packageConfirmedByOrganizer === false`.
- Otherwise → write to `Item.catalogSuggestions` (one-click accept in the edit UI). AI
  recognition/recall always lands here, never on the real fields.

## Schema
None new — reuse `Item.catalogSuggestions Json?` (already added). The cache is in-memory.

## Consequences
- One coherent enrichment layer; adding Amazon/Keepa later = one new provider, nothing else
  changes. Cost-controlled: free-first, paid disabled, cache-once. eBay grant flips the best
  free general source on with zero code change.
- Long-tail general-merchandise dims still fall to `aiEstimate` until eBay/paid is enabled —
  accepted, and visibly sourced.

## Dev sequence (extends the unpushed catalog-enrichment work)
1. New `productEnrichment.ts` service: the `EnrichmentProvider` interface + `enrichItem` cascade + per-identifier cache.
2. Providers: localBarcode, openLibrary (api.openlibrary.org, no key), openFoodFacts
   (world.openfoodfacts.org, no key), ebayCatalog (wrap existing `enrichItemFromCatalog`),
   goUpc (env-gated, OFF), aiEstimate. Each null-on-error.
3. cloudAIService prompts: add visible-UPC read + the no-fabrication rule (model reads, never recalls).
4. Wire `enrichItem` into batchAnalyze / processRapidDraft / reanalyze (replace the direct
   `enrichItemFromCatalog` call); store decoded barcode straight onto `upc`/`ean`.
5. Apply rule per §above. Backend tsc 0 errors (pnpm-store tsc; npx tsc is broken).
6. Frontend "Accept suggestion" surface = separate follow-up.

## Rollback
Pure code + the (already-additive) catalogSuggestions column. `git revert`. No migration to reverse.
