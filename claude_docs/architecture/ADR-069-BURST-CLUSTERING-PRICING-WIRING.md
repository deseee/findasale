# ADR-069: Burst Clustering & Pricing Wiring

**Status:** Proposed (awaiting Patrick decision)  
**Created:** 2026-04-23  
**Author:** Architect  
**Epic:** CD2 Phase 2 (batch upload) + Feature #30 (valuation)

## Context

Three independent pathologies block robust photo batch processing and pricing:

### P1: Batch Mode Item Fragmentation
`SmartInventoryUpload` accepts up to 20 photos in a single drop. `batchAnalyzeController` immediately splits them into 20 separate Item records (one photo per item) before any AI runs. A user uploading 12 photos of a dish set gets 12 unrelated items instead of 1 set with 12 photos. This breaks the grouping contract and forces manual remerging.

**Root cause:** Controller creates Items first, analyzes each in isolation, discards grouping signal.

### P2: Rapidfire Multi-Photo Vision Gap
`cloudAIService.analyzeItemImages()` (line 502) extracts Google Vision labels from only `imageBase64Array[0]`. When an organizer adds detail shots via the "+" button in RapidCapture (brand tags, reverse side, inside views), Vision signals from photos 2+ are silently discarded. Haiku receives all images but only receives Vision labels from the first photo.

**Root cause:** Vision API called on primary photo only; secondary photos are blind to OCR, text detection, brand labels.

### P3: Cold-Start Valuation Floor
`valuationService.generateValuation()` requires 10+ PAID purchases in the same category within 90 days to generate a comparable-sales-based price range. In beta, most categories have <10 sold items—valuation returns `insufficient_data` in >90% of cases. Meanwhile, `PriceBenchmark` table (added by ADR-052 Encyclopedia) sits empty and unqueried. Haiku's per-item pricing has no access to curated benchmark data.

**Root cause:** Valuation service queries internal FindA.Sale sales only; never consults PriceBenchmark or Encyclopedia entries.

## Decision

Implement three coordinated changes:

### D1: Haiku Clustering at Batch Intake
1. Receive up to 20 photos in `batchAnalyzeController`
2. **Before creating any Items,** call Haiku with a clustering prompt: multimodal (all photos), return JSON with clusters and confidence scores
3. Create one Item per cluster (not per photo); store all photos for that cluster in `Item.photoUrls`
4. Enrich each cluster in parallel: Vision labels, Haiku tagging, pricing
5. Return cluster summaries (grouped by detected sets) to frontend for review

**Cluster confidence threshold:** 0.75. Haiku returns "these 3 are probably a set" (0.75–0.99) vs. "definitely a set" (0.99+). Frontend shows confidence level; organizer can ungroup or regroup pre-review.

**Clustering prompt schema (to Haiku):**
```json
{
  "request": "You are a batch item grouper. Given N photos from an estate sale drop, identify logical groupings (sets, bundles, identical items, obvious pairs). Return JSON.",
  "images": [/* all base64 images */],
  "output": {
    "clusters": [
      {
        "id": "cluster-1",
        "photoIndices": [0, 1, 2],
        "detectedType": "8-piece place setting",
        "confidence": 0.95,
        "reasoning": "Matching dishes, same pattern, consistent lighting"
      }
    ],
    "ungrouped": [3, 4, 5], // indices of lone items
    "notes": "..."
  }
}
```

### D2: Aggregated Vision Labels Across Burst
1. Modify `analyzeItemImages()` to extract Vision labels from ALL photos, not just `[0]`
2. Strategy: aggregate distinct labels across all photos (union of detected objects, text, brands)
3. **Deduplication:** if photo 1 detects "ceramic plate" and photo 2 detects "ceramic" + "dinner plate," merge to "ceramic plate"
4. Pass aggregated labels to Haiku + curated tag suggestion

**Alternative strategy:** Take labels from the photo with highest object detection confidence (most metadata). Spec this during dev based on test data.

**Vision config:** Enable `webDetection` (return URLs of similar images online). Capture for optional "find comps online" feature (Phase 3).

### D3: PriceBenchmark as Valuation Fallback + Haiku Context
1. **Wire valuationService to consult PriceBenchmark:**
   - After querying internal comparables (existing logic)
   - If <10 comparables found: query PriceBenchmark for the item's category + condition
   - Extract `priceRangeLow/High` from Encyclopedia entries
   - Blend with Haiku-suggested price: weighted average (60% Haiku, 40% benchmark if benchmark exists; 100% Haiku if not)
2. **Include PriceBenchmark context in Haiku analysis prompt:**
   - When calling `getHaikuAnalysis()` or `getHaikuAnalysisMultiImage()`, pass `benchmarks?: PriceBenchmark[]`
   - Haiku prompt includes: "Similar items in the Encyclopedia are priced $X–$Y for {condition} items in {region}. Use this as a grounding signal but adjust for this specific item's condition and rarity."
3. **Create ItemCompLookup table (optional, Phase 2):**
   - Denormalized cache: `{ itemId, ebayListingId, ebayPrice, ebayCondition, ebayCategory, fetchedAt }`
   - Used when `valuationService` triggers async eBay comp fetch (new job type)
   - Prevents duplicate eBay API calls within 24h
4. **Async eBay comp fetch (Phase 2):**
   - After item is PENDING_REVIEW, enqueue `fetchEbayComps` job (separate from AI tagging)
   - Fetch top 3 sold listings from eBay for the item's title + category
   - Store in ItemCompLookup + update Item.estimatedValue if price > aiSuggestedPrice
   - Do NOT override organizer-explicit price (D-005 locked rule)

---

## Schema Changes

### Item Model (Existing Fields Repurposed + Additions)

**Reintroduce `quantity` (was removed in S132; now justified):**
```prisma
quantity                 Int?                   @default(1)    // Items per cluster (e.g., "set of 8")
isSet                    Boolean                @default(false) // Haiku clustered this as a set
setRole                  String?                // "primary" (dish 1) | "member" (dishes 2–8) | null for solo items
clusterConfidence        Float?                 // 0.0–1.0 from Haiku clustering pass
```

**Rationale for reintroduction:**
- Session 132 removed quantity because single-item capture had no use case
- Clustering changes this: a user uploads 1 photo of a 12-piece set; Haiku detects it as 1 item with quantity=12
- When set is sold as atomic unit (set of 8 dinnerware), quantity matters for inventory math, label printing, POS line-item generation
- If organizer splits set into individual items later (e.g., "list plates separately"), quantity resets to 1 and setRole clears

**Photo model additions:**
```prisma
photoRole               String?                // "primary" | "detail" | "brand-label" | "condition-wide" — semantic role (Haiku-suggested)
visionLabels            String[]               @default([])   // Aggregated Vision API labels from this photo (OCR, detected objects, brands)
orderIndex              Int?                   // Explicit ordering if user reorders in review UI
```

**Valuation Service Additions:**
No new Item fields. ValuationService uses existing `category` + `condition` to query PriceBenchmark.

### New Tables/Models

**ItemCompLookup (optional, Phase 2):**
```prisma
model ItemCompLookup {
  id                String   @id @default(cuid())
  itemId            String   @unique
  item              Item     @relation(fields: [itemId], references: [id], onDelete: Cascade)
  
  ebayListingId     String?  // Matched listing from eBay API
  ebayPrice         Float?   // Final price (cents)
  ebayCondition     String?  // "New" | "Used" | "Like New" | "Very Good" | "Good" | "Acceptable"
  ebayCategory      String?  // "Dinnerware & Serveware" etc.
  
  fetchedAt         DateTime?
  expireAt          DateTime? // Auto-expire after 24h to trigger re-fetch if prices change
  
  @@index([itemId])
  @@index([fetchedAt])
}
```

**No changes to Photo, PriceBenchmark, or ItemValuation schemas** — they already support the wiring.

---

## API / Controller Changes

### batchAnalyzeController (New Clustering Flow)

**Endpoint:** `POST /upload/batch-analyze`

**Old flow:**
```
1. For each image:
   a. Create Item record (one per photo)
   b. Analyze image in isolation
   c. Return result
2. Return array of Item+analysis pairs
```

**New flow:**
```
1. Download all images (max 20)
2. Call Haiku clustering: "Group these photos into sets/bundles"
   - Input: all base64 images + system prompt
   - Output: clusters[] with photoIndices, confidence, detected type
3. For each cluster:
   a. Create Item record (one per cluster, quantity = cluster.photoIndices.length)
   b. Store all photos for cluster in Item.photoUrls
   c. Analyze cluster in parallel (all photos at once to Vision)
4. Return array of cluster summaries with confidence badges
```

**Response shape:**
```json
{
  "clusters": [
    {
      "id": "cluster-1",
      "itemId": "item_xyz",
      "photoIndices": [0, 1, 2],
      "detectedType": "8-piece dinner set",
      "clusterConfidence": 0.95,
      "suggestedTitle": "Set of 8 Vintage Dinnerware...",
      "suggestedDescription": "...",
      "suggestedCategory": "Dinnerware & Serveware",
      "suggestedCondition": "USED",
      "suggestedPrice": 45.00,
      "suggestedTags": ["dinnerware", "vintage", "set"],
      "confidence": 0.87  // Overall AI confidence
    }
  ],
  "ungrouped": [
    {
      "id": "item-solo-1",
      "itemId": "item_abc",
      "photoIndex": 3,
      "suggestedTitle": "Crystal Vase",
      ...
    }
  ]
}
```

### cloudAIService Changes

**analyzeItemImages() — Multi-Photo Vision Aggregation**

Old (line 502):
```typescript
visionLabels = await getVisionLabels(imageBase64Array[0]); // HARDCODED: first photo only
```

New:
```typescript
// Fetch Vision labels from ALL photos; aggregate distinct labels
const allVisionLabels: string[] = [];
for (let i = 0; i < imageBase64Array.length; i++) {
  try {
    const labels = await getVisionLabels(imageBase64Array[i]);
    allVisionLabels.push(...labels);
  } catch {
    // Graceful: skip this photo's labels, continue with others
  }
}
// Deduplicate + aggregate
const visionLabels = Array.from(new Set(allVisionLabels));
```

**getHaikuAnalysis() & getHaikuAnalysisMultiImage() — Benchmark Context**

Add parameter:
```typescript
async function getHaikuAnalysis(
  imageBase64: string,
  mimeType: string,
  visionLabels: string[],
  comps?: ComparableSale[],
  benchmarks?: PriceBenchmark[]  // ← NEW
): Promise<AITagResult>
```

Haiku system prompt addition:
```
"Context: Encyclopedia price benchmarks for similar items:
- NEW condition: $50–$120
- USED condition: $20–$65
Use these as a grounding signal for pricing, but adjust for this item's specific condition, rarity, and market demand."
```

### valuationService Changes

**generateValuation() — PriceBenchmark Fallback**

```typescript
// After querying internal comparables, if count < 10:
if (recentComparables.length < 10) {
  const benchmarks = await prisma.priceBenchmark.findMany({
    where: {
      entry: {
        // Match by category name; fuzzy match if needed
        // (For MVP: exact match on lowercase normalized category)
      },
      condition: item.condition || 'USED'
    },
    include: { entry: true }
  });

  if (benchmarks.length > 0) {
    // Blend: 60% Haiku aiSuggestedPrice, 40% benchmark median
    const benchmarkMedian = 
      (benchmarks[0].priceRangeLow + benchmarks[0].priceRangeHigh) / 2;
    const blendedPrice = 
      (item.aiSuggestedPrice || 0) * 0.6 + benchmarkMedian * 0.4;
    
    // Store with confidence = (comparableCount + 5) / 20 (boost via benchmark)
    return upsert valuation with priceMedian = blendedPrice, method = 'STATISTICAL_WITH_BENCHMARK'
  }
}
```

---

## Product Decisions Requiring Patrick Sign-Off

**[DECISION 1] Set Labeling in Print Kit**
When an organizer prints labels for sale day, should a set of 8 items generate:
- Option A: 1 label labeled "Set of 8 Dinnerware" (atomic unit)
- Option B: 8 individual labels, all with the same item ID but numbered "1 of 8", "2 of 8", etc. (assembly line clarity)

**Impact:** Affects label print logic, POS / invoice line-item structure, and shopper checkout ("1 set" vs. "add 8 items to cart").

**[DECISION 2] Set Sold as Atomic Unit or Components**
When a set is marked SOLD:
- Option A: 1 Purchase record for the entire set; quantity=8 baked into the record
- Option B: 8 Purchase records, one per component; all linked with `setId` FK
- Option C: Hybrid — 1 Purchase for the set, but createInvoice() explodes it into line items if customer paid-in-full

**Impact:** Inventory counting, revenue attribution (eBay listing when syncing multiple items), floor-plan layout updates.

**[DECISION 3] Tier Enforcement: Item Cap for Sets**
SIMPLE tier has a 50-item limit. If an organizer uploads a set of 12:
- Option A: Counts as 1 item (atomic unit approach; allows larger sets)
- Option B: Counts as 12 items (strict component counting; set of 12 hits the cap immediately)

**Impact:** Feature perception (can organizers sell large sets on SIMPLE tier?) and upgrade pressure.

**[DECISION 4] XP Awards for Photo Burst Clustering**
If clustering reduces item count from 20 photos to 8 items (12 were grouped):
- Option A: Award XP for 20 photos captured (not 8 items) — incentivizes burst capture
- Option B: Award XP for 8 items published (standard approach) — no boost for grouping
- Option C: Award XP for 8 items + bulk clustering bonus (10 XP) — incentivizes intelligent grouping

**Impact:** Guild rank progression speed and perception of photo capture value.

**[DECISION 5] Clustering Confidence UI Handling**
When Haiku detects clusters with 0.75–0.99 confidence:
- Option A: Show confidence badge on review screen ("95% likely a set"); organizer can ungroup freely
- Option B: Auto-accept clusters >0.85; show only <0.85 for manual review
- Option C: Always show light-touch prompt ("We think these 3 are a set — right?") but never block

**Impact:** Friction on happy path (how many organizers ungroup correctly-guessed sets?) vs. recovery from false positives (how many organizers re-merge incorrectly split items?).

**[DECISION 6] Encyclopedia PriceBenchmark Population**
Currently PriceBenchmark is empty (ADR-052 created it but no curator/admin tool exists to populate it). When should data flow in?
- Option A: Crowdsource from organizers (add UI: "This sold for $X, add to Encyclopedia benchmark")
- Option B: Seed from curated reference data (NADA, Kovels, Ruby Lane, etc.) — curator-only import
- Option C: Both — start with seed, allow organizer submissions (moderator-approved)

**Impact:** Valuation confidence in cold-start (months 1–3 of beta).

---

## Schema Migration

**Backwards Compatibility:**
- `quantity`, `isSet`, `setRole`, `clusterConfidence` default to null/false; existing items unaffected
- `Photo.photoRole` and `Photo.visionLabels` are new, optional
- `ItemCompLookup` is a new table with no required FK dependencies
- `valuationService` still works without PriceBenchmark (fallback to insufficient_data); no breaking change

**Migration Steps (no data loss):**
```sql
ALTER TABLE Item ADD COLUMN quantity INT DEFAULT 1;
ALTER TABLE Item ADD COLUMN isSet BOOLEAN DEFAULT false;
ALTER TABLE Item ADD COLUMN setRole VARCHAR(20);
ALTER TABLE Item ADD COLUMN clusterConfidence FLOAT;

ALTER TABLE Photo ADD COLUMN photoRole VARCHAR(30);
ALTER TABLE Photo ADD COLUMN visionLabels TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE Photo ADD COLUMN orderIndex INT;

-- ItemCompLookup: created fresh (no migration needed)
```

---

## Rollout Sequencing

**Phase 1 (Clustering + Vision aggregation) — Weeks 1–2**
- Modify `batchAnalyzeController` to cluster first
- Update `cloudAIService.analyzeItemImages()` for multi-photo Vision
- Schema migration (Item + Photo)
- Deploy: no feature flag needed; old code path dead (always clusters)

**Phase 2 (PriceBenchmark wiring) — Weeks 3–4**
- Wire `valuationService` to query PriceBenchmark fallback
- Include benchmarks in Haiku prompt context
- Publish Encyclopedia curator guide (how to add benchmarks)
- No schema changes; soft launch

**Phase 3 (Async eBay comps, ItemCompLookup) — Weeks 5+**
- New job type: `fetchEbayComps` queued after item reaches PENDING_REVIEW
- Create ItemCompLookup table + indexes
- Update valuationService to read ItemCompLookup cache
- Separate deployment; can defer if eBay API access not ready

---

## Knock-On Files

**Unavoidable Changes:**
1. `packages/database/prisma/schema.prisma` — Add columns + ItemCompLookup table
2. `packages/backend/src/controllers/batchAnalyzeController.ts` — Clustering logic, new response shape
3. `packages/backend/src/services/cloudAIService.ts` — Multi-photo Vision aggregation, Haiku prompt updates
4. `packages/backend/src/services/valuationService.ts` — PriceBenchmark fallback query
5. `packages/backend/src/jobs/processRapidDraft.ts` — Vision label aggregation when calling analyzeItemImages()
6. `packages/backend/src/lib/tierEnforcement.ts` — Item cap logic: decision needed on set counting

**Conditional Changes (Phase 2+):**
7. `packages/backend/src/jobs/fetchEbayComps.ts` (new file) — Async eBay lookup job
8. `packages/backend/src/controllers/valuationController.ts` (may need updates) — If valuation endpoint returns confidence boosted by benchmarks

**Frontend Changes (High Priority):**
9. `packages/frontend/components/SmartInventoryUpload.tsx` — Display cluster summaries with confidence badges; add ungroup/regroup UI
10. `packages/frontend/components/RapidCapture.tsx` — No changes if using analyzeItemImages() (already multimodal); if single-photo path exists, update to aggregate labels
11. `packages/frontend/lib/itemConstants.ts` — Add set-related constants (setRole enum, etc.)
12. `packages/frontend/hooks/useItemData.ts` — Possibly: handle quantity field in UI rendering

**No changes needed:**
- Photo model queries (Photo already has itemId FK; reverse cascade already works)
- PriceBenchmark schema (created by ADR-052; queries only)
- ItemValuation schema (queries only; confidence score already exists)

---

## Constraints Honored

✓ **Photo-centric capture unblocked:** Clustering happens server-side; frontend doesn't wait (upload → Cloudinary → batch-analyze endpoint → clusters returned in <5s for 20 photos).

✓ **No organizer-explicit price override:** `aiSuggestedPrice` is a suggestion; organizer-set `price` field always wins in pricing logic (D-005 locked rule maintained).

✓ **No "AI" in copy:** Clustering confidence badge shows "95% likely a set" (no "AI" word); benchmark grounding says "Encyclopedia reference" not "AI-powered benchmark."

✓ **Inclusive sale-type language:** No "estate sale" bias in clustering prompts; treats all secondary sales equally.

✓ **Backwards compatible:** Existing items with null quantity/isSet work unchanged.

---

## Alternatives Considered

**Alt 1: Client-side Clustering**
Haiku clustering runs in browser (compute cost moved to client). Rejected: reduces server load but adds network round-trips and requires shipping multi-image payload to Haiku API from frontend. Server-side is cleaner + cheaper (one endpoint hit vs. many).

**Alt 2: Ensemble Vision Labels**
Blend Vision API calls with Haiku's own object detection instead of aggregating labels. Rejected: would require Haiku to output detected-object JSON separately; harder to curate and deduplicate than feeding aggregated labels back to Haiku.

**Alt 3: PriceBenchmark as Constraint, Not Fallback**
Use benchmarks as hard floor/ceiling (item price must fall within benchmark range). Rejected: kills room for rare items or condition premiums; too rigid for estate sale dynamics.

**Alt 4: Defer Clustering to Review UI**
Keep current one-item-per-photo behavior; allow organizer to manually group on review screen. Rejected: high friction (user must spend 5+ min grouping); defeats the batch-speed value prop.

---

## Risk Mitigation

**Risk: Haiku Clustering Hallucination**
- Haiku groups unrelated items together (e.g., red bowl + red vase as a "red collection")
- **Mitigation:** Confidence threshold (0.75); show confidence badge; always allow ungroup. A/B test with <0.85 auto-review flag.

**Risk: Vision API Label Spam**
- Photo 1: 100 labels (busy background, shelf, other items). Photo 2: 5 labels. Aggregated = 105 labels (noisy).
- **Mitigation:** Deduplicate, then filter to top 20 by frequency score. Pass to Haiku with note: "Most common labels: X, Y, Z."

**Risk: PriceBenchmark Data Stale or Wrong**
- Curator adds benchmark data once; market prices change; benchmarks become misleading.
- **Mitigation:** Start with single source-of-truth data (e.g., Ruby Lane or Etsy aggregated). Sunset if curator capacity is lacking; revert to internal comparables-only fallback.

**Risk: Set Splitting at Checkout**
- Organizer uploads "set of 8," customer buys "1 of 8" instead of full set.
- **Mitigation:** Decision 2 and checkout UX determine this. If sold as atomic unit, POS prevents split purchase.

---

## Fallback / Rollback

**If clustering fails (Haiku timeout/error):**
- Log error, fall back to one-item-per-photo (old behavior)
- Organizer warned: "Clustering unavailable; reviewing individually"
- No blocking; sale flow continues

**If PriceBenchmark query fails:**
- Log error, return valuation from internal comparables only (old behavior)
- No blocking; valuation may report insufficient_data

**If multi-photo Vision fails:**
- Log error, use single-photo Vision fallback (existing code path)
- No blocking; analysis continues with less signal

---

## Success Metrics

1. **Clustering Accuracy:** >90% of organizer-grouped sets have clusterConfidence >0.85; <5% ungroup rate in review UI
2. **Valuation Coverage:** % of items with valuations increases from current ~10% (beta cold-start) to >60% within 3 months of Encyclopedia benchmark seeding
3. **Photo Burst Adoption:** % of sales using >5 photos per item increases by 25% (clustering makes multi-angle capture pay off)
4. **Set Listing Speed:** Avg time to publish a 12-item set drops from ~8 min (manual grouping) to ~2 min (auto-grouped + review)

---

## References

- ADR-052: Encyclopedia + PriceBenchmark schema introduction
- Feature #30: Item Valuation system
- Feature #75: AI tagging cost ceiling (tier enforcement)
- D-005: Organizer-explicit price always wins (locked design rule)
- D-006: No "AI" in user-facing copy (locked design rule)

---

**Architect Review:** Complete. ADR ready for Patrick decision gate.
