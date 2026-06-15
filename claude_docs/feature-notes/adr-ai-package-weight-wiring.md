# ADR: AI Package Weight/Dimension Wiring into estimatePackageProfile

**Date:** 2026-06-14
**Status:** Proposed
**Author:** findasale-architect

---

## Problem

`estimatePackageProfile` (step 4) has a live code path that consumes `aiEstimatedWeightOz`, `aiEstimatedDimensions`, and `aiPackageConfidence` from the `PackageEstimateItem` argument. However, the sole call site in `ebayController.ts` (line 5429) never supplies these fields — they are not Item schema columns, so the Prisma query cannot select them and the caller passes `undefined` for all three. The step-4 AI path is structurally inert for every item. Items that have no matching `PackageProfile` keyword or category (e.g. cables, misc accessories) always fall through to the 24 oz / 10×8×6 MAILING_BOX SEED fallback, producing inaccurate eBay calculated-shipping quotes.

Evidence:
- `ebayPackageEstimateService.ts` lines 119–142: step-4 guard checks `aiPackageConfidence`, `aiEstimatedWeightOz`, `aiEstimatedDimensions` — all are in the `PackageEstimateItem` interface but not Item schema columns.
- `ebayController.ts` lines 5429–5441: the `estimatePackageProfile` call passes only schema columns (`title`, `category`, `ebayCategoryId`, `packageWeightOz`, etc.); no AI estimate fields are included.
- `prisma/schema.prisma`: grep for `aiEstimat*` returns 0 results on the Item model. There are no `aiEstimatedWeightOz`, `aiEstimatedDimensions`, or `aiPackageConfidence` columns.
- `cloudAIService.ts` lines 37–40: `AITagResult` does output `estimatedWeightOz`, `estimatedDimensionsIn`, `estimatedPackageType`, `packageConfidence` — gated at confidence ≥ 0.5 before being returned.

---

## Context

### Current data flow

```
Camera / batchAnalyze trigger
  └─► cloudAIService.tagItem()
        └─► returns AITagResult {
              estimatedWeightOz,
              estimatedDimensionsIn,
              estimatedPackageType,
              packageConfidence       ← already confidence-gated at 0.5
            }
  └─► productEnrichment.enrichItem() [aiEstimateProvider]
        └─► reads estimatedWeightOz / estimatedDimensionsIn from AITagResult
        └─► planEnrichmentApply() auto-applies if confidence >= 0.85 AND field is empty
              (aiEstimateProvider hardcodes confidence = 0.5 → falls BELOW 0.85 threshold)
              └─► writes packageWeightOz / packageLengthIn/WidthIn/HeightIn to Item
                  ONLY when barcode/catalog source is authoritative (confidence >= 0.85)
  └─► prisma.item.update() — writes packageWeightOz/Dims IF auto-apply threshold met
        (in practice, AI-only estimates at 0.5 confidence DO NOT reach the Item record
         because planEnrichmentApply requires >= 0.85 or authoritative source to auto-apply)
```

**Key finding:** The enrichment cascade intentionally keeps AI-confidence-0.5 estimates out of `packageWeightOz` on the Item record to protect organizer UX (no surprise auto-fills from low-confidence guesses). So when `estimatePackageProfile` is later called, the Item record has no weight, no PackageProfile match, and falls to SEED.

The AI estimate exists transiently in the tagging request context but is never persisted in a form the estimator can reach.

### Why not store in `packageWeightOz` directly?

`planEnrichmentApply` deliberately bars AI-confidence-0.5 weight/dims from auto-applying to `packageWeightOz` because that column is the organizer-facing confirmed value. Writing AI guesses there would mislead organizers reviewing package details. The column semantics are "organizer-set or barcode-confirmed weight" — not "best guess for shipping calculation."

### Why not call cloudAI inside estimatePackageProfile?

`estimatePackageProfile` is called per-item inside a `Promise.all` over all sale items when building the eBay listing payload (ebayController line 5413). Invoking cloudAI (Anthropic API) inside that loop would be:
- A cold Anthropic call per item with no photos in context (the estimator has no image bytes)
- Duplicate work — cloudAI already ran during the tagging pass and produced estimates
- Unacceptably slow for sales with 50+ items

---

## Decision

**Store AI package estimates in dedicated Item columns and pass them through to the estimator.**

Add three new columns to the Item schema:

| Column | Type | Purpose |
|---|---|---|
| `aiPackageWeightOz` | `Int?` | Packed weight estimate from cloudAI tagging pass |
| `aiPackageDimsJson` | `Json?` | `{length, width, height}` dims in inches from cloudAI |
| `aiPackageConfidence` | `Decimal? @db.Decimal(3,2)` | Confidence score 0.00–1.00 from cloudAI |

**Rationale for dedicated columns over `catalogSuggestions` JSON:**

`catalogSuggestions` is an organizer-UI surface — it renders one-click accept prompts. AI package estimates are not organizer-accepted values; they are shipping-calculation inputs consumed by the estimator service. Mixing them into `catalogSuggestions` would either leak them into the organizer UI where they don't belong, or require the estimator to parse and re-interpret a UI-facing blob. Dedicated columns keep semantics clean and allow direct Prisma select in the estimator call.

**Rationale for not reusing `packageWeightOz`:**

`packageWeightOz` carries the semantic "organizer-reviewed or barcode-confirmed value." The estimator already checks this column (step 0 / organizer-confirmed guard). Writing AI estimates there conflates two different authority levels and could suppress the organizer-confirmed guard.

**The wiring path:**

```
cloudAIService.tagItem() returns AITagResult
  └─► batchAnalyzeController / processRapidDraft write tagging results to Item
        NEW: also write aiPackageWeightOz, aiPackageDimsJson, aiPackageConfidence
             when estimatedWeightOz is present (confidence gate already applied in cloudAIService)

ebayController.estimatePackageProfile() call site (line 5429)
  └─► Prisma select on Item NOW includes aiPackageWeightOz, aiPackageDimsJson, aiPackageConfidence
  └─► Pass these as aiEstimatedWeightOz / aiEstimatedDimensions / aiPackageConfidence
      in the PackageEstimateItem argument
        └─► step-4 AI path in estimatePackageProfile is now live
```

**No change to `estimatePackageProfile` itself.** The service already handles the AI path correctly (lines 119–142). The fix is entirely in the data path upstream (schema + write side) and the call site (read + pass-through).

---

## Implementation Sequence

### Step 1 — Schema migration

Add to `packages/database/prisma/schema.prisma` on the Item model:

```prisma
// AI-estimated package profile (from cloudAI tagging pass — not organizer-confirmed)
// Used by estimatePackageProfile step 4 when no PackageProfile keyword/category match exists.
aiPackageWeightOz    Int?
aiPackageDimsJson    Json?                          // { length: number, width: number, height: number }
aiPackageConfidence  Decimal?  @db.Decimal(3, 2)   // 0.00–1.00; only written when >= 0.5
```

Generate and apply migration:
```bash
cd packages/database
npx prisma migrate dev --name add_ai_package_estimate_columns
npx prisma generate
```

Production deploy (Railway):
```powershell
$env:DATABASE_URL="<Railway public proxy URL>"
npx prisma migrate deploy
npx prisma generate
```

### Step 2 — Write side: persist AI estimates after tagging

In **`batchAnalyzeController.ts`** (prisma.item.update around line 455) and **`processRapidDraft.ts`** (prisma.item.updateMany around line 318), add to the update data block:

```typescript
// AI package estimate persistence (feeds estimatePackageProfile step-4 AI path)
// cloudAIService already gates these at packageConfidence >= 0.5 before returning them.
...(analysis?.estimatedWeightOz != null && analysis?.packageConfidence != null ? {
  aiPackageWeightOz: Math.round(analysis.estimatedWeightOz),
  aiPackageDimsJson: analysis.estimatedDimensionsIn ?? null,
  aiPackageConfidence: analysis.packageConfidence,
} : {}),
```

Note: `analysis` is the `AITagResult` reference in each context. In batchAnalyzeController it is the `analysis` variable from the cluster; in processRapidDraft it is `aiResult`.

### Step 3 — Read side: pass AI estimates to estimatePackageProfile

In **`ebayController.ts`** at the `estimatePackageProfile` call site (line 5429):

1. Add `aiPackageWeightOz`, `aiPackageDimsJson`, `aiPackageConfidence` to the Prisma select that fetches sale items (around line 5385 where `packageWeightOz: true` appears).

2. Pass them through in the `estimatePackageProfile` argument:

```typescript
const est = await estimatePackageProfile({
  id: item.id,
  title: item.title,
  category: item.category,
  ebayCategoryId: item.ebayCategoryId,
  packageConfirmedByOrganizer: item.packageConfirmedByOrganizer,
  packageWeightOz: item.packageWeightOz,
  packageLengthIn: item.packageLengthIn != null ? Number(item.packageLengthIn) : null,
  packageWidthIn: item.packageWidthIn != null ? Number(item.packageWidthIn) : null,
  packageHeightIn: item.packageHeightIn != null ? Number(item.packageHeightIn) : null,
  packageType: item.packageType,
  // NEW: AI estimate from tagging pass
  aiEstimatedWeightOz: item.aiPackageWeightOz ?? null,
  aiEstimatedDimensions: item.aiPackageDimsJson
    ? (item.aiPackageDimsJson as { length: number; width: number; height: number })
    : null,
  aiPackageConfidence: item.aiPackageConfidence != null
    ? Number(item.aiPackageConfidence)
    : null,
});
```

### Step 4 — Dev tasks summary

| Task | File(s) | ~Lines |
|---|---|---|
| Add 3 columns to schema.prisma | `packages/database/prisma/schema.prisma` | +4 |
| Persist AI estimates in batchAnalyzeController | `packages/backend/src/controllers/batchAnalyzeController.ts` | +5 |
| Persist AI estimates in processRapidDraft | `packages/backend/src/jobs/processRapidDraft.ts` | +5 |
| Add columns to Prisma select in ebayController | `packages/backend/src/controllers/ebayController.ts` | +3 |
| Pass AI estimates to estimatePackageProfile in ebayController | `packages/backend/src/controllers/ebayController.ts` | +6 |
| Migration: add_ai_package_estimate_columns | `packages/database/prisma/migrations/` | auto |

No changes to `ebayPackageEstimateService.ts` — step-4 AI path is already correct.

---

## Consequences

**Enables:**
- Items with no keyword/category PackageProfile match (cables, miscellaneous accessories, unusual collectibles) receive an AI-sourced shipping estimate instead of always falling back to the generic 24 oz / 10×8×6 SEED default.
- Shipping accuracy improvement proportional to cloudAI tagging coverage. Items tagged before this migration will not benefit until re-tagged; newly tagged items benefit immediately.
- The `packageEstimateSource` column on Item will correctly report `'AI'` for these items once the estimator writes its result back (existing logic at the push/listing step).

**Does not change:**
- Organizer-confirmed package values are never touched (the existing `packageConfirmedByOrganizer` guard in step 0 remains).
- Items with a matching PackageProfile row continue to use the CATEGORY or KEYWORD path (higher priority than AI in the lookup cascade).
- The enrichment cascade (`planEnrichmentApply`) weight/dim auto-apply threshold (0.85) is unchanged — this ADR adds a separate persistence path for the shipping estimator, not for organizer-facing auto-fill.
- `estimatePackageProfile` function signature and logic: unchanged.

**Risk:**
- Low. New columns are nullable; existing items without AI estimates are unaffected (all three columns null → step-4 guard fails → falls through to SEED exactly as before). Migration is additive-only.
- The 0.5 confidence gate is already applied in cloudAIService before returning estimates, so only estimates cloudAI is reasonably confident about are persisted.

---

## Schema fields already considered and rejected

- `packageWeightOz` / `packageLengthIn` / `packageWidthIn` / `packageHeightIn` — organizer-confirmed semantics; cannot be used for AI estimates without conflating authority levels.
- `catalogSuggestions` (Json) — organizer UI surface; wrong semantic for shipping-engine inputs; requires estimator to parse UI blob.
- `packageEstimateConfidence` / `packageEstimateSource` — these record the estimator's OUTPUT provenance, not the AI input. They exist on the Item model and remain unchanged.
