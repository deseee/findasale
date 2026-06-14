# ADR — Domain-Aware eBay Category Resolver — 2026-06-14 (S975)

## Problem (evidence)
The Danner AP-40 aquarium air pump listed under **Sporting Goods › Fishing › Fishing
Equipment › Bait Buckets** (eBay cat 179986). Root cause traced in code:
- `suggestEbayCategoryForTitle` (ebayController.ts ~L998) calls eBay
  `get_category_suggestions(title)`, then `getEbayCategoryCandidates` **re-sorts the
  results DEEPEST-FIRST** (L991 `sort((a,b)=>b.level-a.level)`) and picks the first
  non-catch-all. eBay ranks "Bait Buckets" among matches for "Air Pump / **Aerator**"
  (livewell/bait aerators); depth-sort promoted that deep leaf over the correct,
  shallower aquarium category. The S971 "skip Other/Misc catch-all" rule compounded it
  by reaching past the generic aquarium bucket to the wrong-domain leaf.
- Two paths disagree: the camera/batch path (batchAnalyzeController L365) takes eBay's
  **top-ranked** suggestion `suggestions[0]`; the push path re-sorts by depth. The worse
  one ran here.
- The push-path save sites store only `ebayCategoryId` (no name), so the edit-item
  Category field renders **blank** and the wrong category is invisible/uncatchable.

## Decision
Make category resolution **domain-aware** and stop discarding eBay's relevance ranking,
and always persist + surface the category name.

1. **Capture ancestors.** Extend `getEbayCategoryCandidates` to also return
   `categoryTreeNodeAncestors` (ancestor id+name list) for each suggestion — eBay already
   returns this in `get_category_suggestions`.
2. **Domain-aware selection.** `suggestEbayCategoryForTitle(title, domainHint?)` accepts the
   item's AI domain hint (`item.category` / `summary.suggestedCategory`). Map common domains
   to eBay top-level ancestor names (e.g. aquarium/fish/pet → "Pet Supplies"; the hint also
   lets us DEPRIORITIZE obviously-wrong domains, e.g. an aquarium item under "Sporting Goods"
   / "Fishing"). Selection order:
   a. Among candidates, prefer those whose ancestor path matches the domain hint.
   b. Within that set, respect eBay's **relevance order** (the order eBay returned them) —
      do NOT re-sort by depth.
   c. Skip catch-all (Other/Misc/Everything Else) as today.
   d. Fallbacks: matching-domain → eBay top-ranked non-catch-all → candidates[0].
3. **Persist + show the name.** Save `ebayCategoryName` alongside `ebayCategoryId` at ALL
   push-resolution save sites (ebayController ~L1764, ~L2082, ~L2625). Frontend edit-item
   Category picker must display the saved `ebayCategoryName` when present (so a wrong pick is
   visible). Unify the camera + push paths to use the same domain-aware resolver.

## Why not just "take eBay #1"
eBay's own matcher may still rank Bait Buckets high for "aerator"; relevance-order alone
doesn't guarantee domain correctness. The AI domain hint is what prevents cross-domain
misfiles. Relevance order is the tiebreaker *within* the right domain.

## Consequences
- Aquarium/pet/home/etc. items stop landing under unrelated trees (Fishing, etc.).
- Category name visible in edit UI → organizers can catch/override mistakes.
- Slightly more logic in the resolver; no schema change (ebayCategoryName column already exists).

## Schema / migration
None. `Item.ebayCategoryName` already exists.

## Dev sequence
1. `getEbayCategoryCandidates`: capture ancestors (id+name) per candidate.
2. `suggestEbayCategoryForTitle(title, domainHint?)`: domain-aware selection above; remove the
   depth re-sort; keep catch-all skip; return {categoryId, categoryName}.
3. Update push call sites to pass the item's domain hint and persist BOTH id + name.
4. Point batchAnalyze at the same resolver (or share the selection helper) so both paths agree.
5. Frontend edit-item: show saved ebayCategoryName in the Category field.
6. Backend `node node_modules/.pnpm/typescript@*/.../tsc.js --noEmit -p tsconfig.json` = 0 errors;
   frontend tsc 0 errors.

## Test (real, post-deploy)
Clear the pump's stale category (`ebayCategoryId=null, ebayCategoryName=null` for
cmqbb252i000i60qq7eilco9z) so the fixed resolver runs fresh, re-push as artifactmi, and
confirm it lands in a Pet Supplies aquarium category (NOT Bait Buckets), with the $32 flat
policy intact and the name shown in the edit UI.

## Rollback
Pure code (backend resolver + 2 frontend lines). `git revert`. No migration.
