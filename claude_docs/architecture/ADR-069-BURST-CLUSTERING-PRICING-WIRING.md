# ADR-069: Burst Clustering & Pricing Wiring

**Status:** Approved (Patrick locked decisions 1–6, Session N+1 amendment)  
**Created:** 2026-04-23  
**Last Updated:** 2026-04-23 (amended with two-way Encyclopedia integration)  
**Author:** Architect  
**Epic:** CD2 Phase 2 (batch upload) + Feature #30 (valuation)

## Revision History

- **v1 (Session N):** Original ADR with clustering + PriceBenchmark fallback. Included 6 decision gates (decisions 1–6).
- **v2 (Session N+1 amendment):** All 6 decisions locked by Patrick. Added two-way Haiku↔Encyclopedia integration (Haiku writes EncoplopediaEntry stubs). Removed decision gates; replaced with locked constraints.

## Locked Constraints (Patrick Decisions 1–6)

### Atomic Set Rules (Decision 1–3)
- **A set is atomic.** Always.
  - **Print Kit:** 1 label per set (never N individual labels for components).
  - **POS/Sale model:** 1 Purchase record per set sale (never N records per component).
  - **Tier enforcement:** A set counts as 1 item against any tier cap (Simple 50-item, etc.). Uploading a set of 12 dinnerware counts as 1 item, not 12.
- **Consequence:** `Item.quantity` stores the set size; POS/invoice logic treats the set as a single line item; tier enforcement counts Item records, not summed quantities.

### Auto-Accept Clustering, No UI Prompts (Decision 5)
- **No confidence badge on clustered groups.** No "We think these 3 are a set, right?" modal or inline prompt.
- **Clustering happens silently.** Organizer sees the clustered result on the review screen and can edit/split like any other AI-tagged field.
- **Confidence score still exists internally** for logging, analytics, and edge-case recovery — but never surfaces as a user-facing prompt.
- **Design principle:** Less noise wins. Friction is the enemy.

### XP Award Clarity (Decision 4 Implicit)
- **XP is awarded on item creation; 1 set = 1 item creation event = 1 XP award.** Clustering reduces bursts to sets naturally, which is correct behavior, not a nerf.
- No special "photo-capture XP" mechanic exists; remove any framing that suggests clustering changed XP payout.

### Two-Way Haiku↔Encyclopedia Integration (Decision 6 Locked)
- **Haiku analysis READS PriceBenchmark** to ground item pricing (existing, unchanged).
- **Haiku analysis also WRITES EncyclopediaEntry stubs** during the same analysis call. When Haiku tags an item and detects a brand+category+pattern signature that does not already have a matching EncyclopediaEntry, it spawns a stub entry in the background.
- **Auto-generated entry stub includes:**
  - Slug (derived from brand+pattern, deduped on insert)
  - Title, short description, category, tags
  - `status: 'AUTO_GENERATED'` (new enum value)
  - `triggerItemId` FK to the item that caused creation
- **Companion PriceBenchmark row also auto-generated** using Haiku's suggested price range, tagged with `dataSource: 'haiku_inferred'`.
- **Curator moderation:** Auto-generated entries are visible but flagged as unreviewed. A future curator tool lets Patrick or a VA promote them to `status: 'PUBLISHED'` after review.
- **Backfill feedback loop:** As real sales data accumulates, a backfill job refines benchmark ranges using actual sold-item data (from ItemPriceHistory).
- **Cold-start elimination:** The 20 curated seed entries (Session N) become the initial `status: 'PUBLISHED'` content. Haiku auto-generation catches up on remaining categories as organizers photograph items, creating a self-reinforcing flywheel.

---

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

## Approved Design

Implement three coordinated changes (all locked — no further decision needed):

### D1: Haiku Clustering at Batch Intake
1. Receive up to 20 photos in `batchAnalyzeController`
2. **Before creating any Items,** call Haiku with a clustering prompt: multimodal (all photos), return JSON with clusters and confidence scores
3. Create one Item per cluster (not per photo); store all photos for that cluster in `Item.photoUrls`
4. Enrich each cluster in parallel: Vision labels, Haiku tagging, pricing
5. Return cluster summaries (grouped by detected sets) to frontend for review

**Cluster confidence threshold:** 0.75. Haiku returns "these 3 are probably a set" (0.75–0.99) vs. "definitely a set" (0.99+). Frontend does NOT show confidence badges (locked decision 5); organizer sees grouped result and can ungroup/regroup on review screen like any AI-tagged field.

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

### D3: PriceBenchmark as Valuation Fallback + Two-Way Haiku↔Encyclopedia Integration
1. **Wire valuationService to consult PriceBenchmark:**
   - After querying internal comparables (existing logic)
   - If <10 comparables found: query PriceBenchmark for the item's category + condition
   - Extract `priceRangeLow/High` from Encyclopedia entries
   - Blend with Haiku-suggested price: weighted average (60% Haiku, 40% benchmark if benchmark exists; 100% Haiku if not)
2. **Include PriceBenchmark context in Haiku analysis prompt:**
   - When calling `getHaikuAnalysis()` or `getHaikuAnalysisMultiImage()`, pass `benchmarks?: PriceBenchmark[]`
   - Haiku prompt includes: "Similar items in the Encyclopedia are priced $X–$Y for {condition} items in {region}. Use this as a grounding signal but adjust for this specific item's condition and rarity."
   - **NEW: Haiku prompt also returns optional `newEncyclopediaStub` field** when item doesn't match existing entries (see below).
3. **Haiku writes EncyclopediaEntry stubs (TWO-WAY INTEGRATION):**
   - During `getHaikuAnalysisMultiImage()` call, if Haiku detects a brand+category+pattern signature (e.g., "Corelle dinnerware") that does not have a matching EncyclopediaEntry, it returns:
   ```json
   {
     "newEncyclopediaStub": {
       "slug": "corelle-dinnerware",
       "title": "Corelle Dinnerware Sets",
       "description": "Lightweight vitreous china dinnerware, popular 1970s–2000s.",
       "category": "Dinnerware & Serveware",
       "tags": ["dinnerware", "corelle", "vintage"],
       "estimatedPriceLow": 15,
       "estimatedPriceHigh": 45
     }
   }
   ```
   - Backend enqueues `createEncyclopediaStub` job to:
     - Dedup by slug; skip if slug already exists
     - Create EncyclopediaEntry with `status: 'AUTO_GENERATED'`, `triggerItemId: itemId`
     - Create paired PriceBenchmark with `dataSource: 'haiku_inferred'`, referencing the new entry
   - **Curator moderation:** Auto-generated entries visible in Encyclopedia UI but flagged as unreviewed. Future curator tool allows Patrick/VA to promote to `status: 'PUBLISHED'`.
   - **Backfill feedback loop:** As organizers mark items SOLD, ItemPriceHistory accumulates real-sale data. A scheduled backfill job refines PriceBenchmark ranges (from `haiku_inferred` to `community_consensus`) once N ≥ 5 real sales exist for a slug.
4. **Create ItemCompLookup table (optional, Phase 2):**
   - Denormalized cache: `{ itemId, ebayListingId, ebayPrice, ebayCondition, ebayCategory, fetchedAt }`
   - Used when `valuationService` triggers async eBay comp fetch (new job type)
   - Prevents duplicate eBay API calls within 24h
5. **Async eBay comp fetch (Phase 2):**
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

**EncyclopediaEntry Model Changes:**
```prisma
model EncyclopediaEntry {
  // ... existing fields ...
  status             String    @default("PUBLISHED")  // Add enum: PUBLISHED, AUTO_GENERATED, UNDER_REVIEW, REJECTED
  triggerItemId      String?   // Optional FK to item that triggered auto-generation
  
  @@index([status])
}
```

**PriceBenchmark Model Changes:**
```prisma
model PriceBenchmark {
  // ... existing fields ...
  dataSource        String    @default("curated")    // Add to enum: curated, community_consensus, haiku_inferred
  
  @@index([dataSource])
}
```

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

---

## Schema Migration

**Backwards Compatibility:**
- `quantity`, `isSet`, `setRole`, `clusterConfidence` default to null/false; existing items unaffected
- `Photo.photoRole` and `Photo.visionLabels` are new, optional
- `EncyclopediaEntry.status` defaults to PUBLISHED; existing entries unaffected
- `EncyclopediaEntry.triggerItemId` is nullable; legacy entries have null
- `PriceBenchmark.dataSource` defaults to curated; existing benchmarks unaffected
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

-- EncyclopediaEntry: add status + triggerItemId
ALTER TABLE EncyclopediaEntry ADD COLUMN status VARCHAR(30) DEFAULT 'PUBLISHED';
ALTER TABLE EncyclopediaEntry ADD COLUMN triggerItemId VARCHAR(255);
ALTER TABLE EncyclopediaEntry ADD FOREIGN KEY (triggerItemId) REFERENCES Item(id) ON DELETE SET NULL;
CREATE INDEX idx_EncyclopediaEntry_status ON EncyclopediaEntry(status);

-- PriceBenchmark: add dataSource
ALTER TABLE PriceBenchmark ADD COLUMN dataSource VARCHAR(30) DEFAULT 'curated';
CREATE INDEX idx_PriceBenchmark_dataSource ON PriceBenchmark(dataSource);

-- ItemCompLookup: created fresh (no migration needed)
```

---

## Rollout Sequencing

**Phase 1 (Clustering + Vision aggregation + Haiku→Encyclopedia stubs) — Weeks 1–3**
- Modify `batchAnalyzeController` to cluster first
- Update `cloudAIService.analyzeItemImages()` for multi-photo Vision
- Update Haiku prompt to return `newEncyclopediaStub` field
- Create `encyclopediaService.createEncyclopediaStub()` with dedup logic
- Create `createEncyclopediaStub` job type; enqueue from `batchAnalyzeController`
- Schema migration (Item, Photo, EncyclopediaEntry, PriceBenchmark)
- Deploy: no feature flag needed; old code path dead (always clusters)
- Seed initial 20 curated EncyclopediaEntry records with `status: 'PUBLISHED'` (from Session N curator work)

**Phase 2 (PriceBenchmark wiring + backfill feedback loop) — Weeks 4–5**
- Wire `valuationService` to query PriceBenchmark fallback
- Include benchmarks in Haiku prompt context
- Create `backfillBenchmarks` scheduled job: refines `haiku_inferred` → `community_consensus` once N ≥ 5 real sales per slug
- No new schema changes; soft launch
- Monitor auto-generated entry quality in admin logs

**Phase 3 (Async eBay comps, ItemCompLookup) — Weeks 6+**
- New job type: `fetchEbayComps` queued after item reaches PENDING_REVIEW
- Create ItemCompLookup table + indexes
- Update valuationService to read ItemCompLookup cache
- Separate deployment; can defer if eBay API access not ready

**Phase 4 (Curator Tool, deferred) — Future**
- Build `encyclopedia-review.tsx` UI to promote AUTO_GENERATED → PUBLISHED entries
- Batch operations for VA or Patrick to review stubs quarterly

---

## Knock-On Files

**Unavoidable Changes (Phase 1):**
1. `packages/database/prisma/schema.prisma` — Add columns to Item, Photo, EncyclopediaEntry, PriceBenchmark + ItemCompLookup table
2. `packages/backend/src/controllers/batchAnalyzeController.ts` — Clustering logic, new response shape (no confidence badges in response)
3. `packages/backend/src/services/cloudAIService.ts` — Multi-photo Vision aggregation, Haiku prompt updates, `newEncyclopediaStub` parsing
4. `packages/backend/src/services/valuationService.ts` — PriceBenchmark fallback query
5. `packages/backend/src/jobs/processRapidDraft.ts` — Vision label aggregation when calling analyzeItemImages()
6. `packages/backend/src/lib/tierEnforcement.ts` — Item cap logic counts Item records (not summed quantities) per locked decision 3
7. `packages/backend/src/services/encyclopediaService.ts` (new file) — New `createEncyclopediaStub()` service; dedup by slug, create EncyclopediaEntry + PriceBenchmark pair

**Phase 2 Changes (Async eBay + Backfill):**
8. `packages/backend/src/jobs/createEncyclopediaStub.ts` (new job type) — Enqueued when Haiku returns `newEncyclopediaStub`; writes to EncyclopediaEntry + PriceBenchmark
9. `packages/backend/src/jobs/fetchEbayComps.ts` (new file) — Async eBay lookup job; enqueued after item → PENDING_REVIEW
10. `packages/backend/src/jobs/backfillBenchmarks.ts` (new scheduled job) — Refines PriceBenchmark ranges from `haiku_inferred` to `community_consensus` once N ≥ 5 real sales exist per slug

**Frontend Changes (High Priority):**
11. `packages/frontend/components/SmartInventoryUpload.tsx` — Display cluster summaries WITHOUT confidence badges (no UI prompts per locked decision 5); add ungroup/regroup UI (standard edit mode)
12. `packages/frontend/components/RapidCapture.tsx` — No changes if using analyzeItemImages() (already multimodal); if single-photo path exists, update to aggregate labels
13. `packages/frontend/lib/itemConstants.ts` — Add set-related constants (setRole enum, etc.)
14. `packages/frontend/hooks/useItemData.ts` — Possibly: handle quantity field in UI rendering

**Optional UI (Curator Tool, deferred):**
15. `packages/frontend/pages/admin/encyclopedia-review.tsx` (future) — Curator dashboard to review auto-generated entries, promote to PUBLISHED

**No changes needed:**
- Photo model queries (Photo already has itemId FK; reverse cascade already works)
- ItemValuation schema (queries only; confidence score already exists)

---

## Constraints Honored

✓ **Atomic set behavior:** Per locked decisions 1–3, sets are atomic units (1 label, 1 Purchase record, 1 item against tier cap).

✓ **No UI friction on clustering:** No confidence badges, no "is this a set?" prompts (locked decision 5). Organizer sees result and can edit on review screen.

✓ **Organizer price always wins:** `aiSuggestedPrice` is a suggestion; organizer-set `price` field always wins in pricing logic (D-005 locked rule maintained).

✓ **No "AI" in user-facing copy:** Clustering happens silently. Benchmark grounding says "Encyclopedia reference" not "AI-powered." Auto-generated entries are flagged internally, never shown to shoppers until curator reviewed.

✓ **XP unchanged:** XP awarded on item creation; clustering naturally reduces bursts to sets, correct behavior not a nerf (locked decision 4 implicit).

✓ **Inclusive sale-type language:** No "estate sale" bias in clustering prompts; treats all secondary sales equally.

✓ **Backwards compatible:** Existing items with null quantity/isSet work unchanged. Auto-generated entries marked distinctly from curated data.

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
- **Mitigation:** Confidence threshold (0.75); no UI badges (per locked decision 5); organizer can ungroup/regroup on review screen. Confidence score logged internally for analytics and edge-case recovery.

**Risk: Vision API Label Spam**
- Photo 1: 100 labels (busy background, shelf, other items). Photo 2: 5 labels. Aggregated = 105 labels (noisy).
- **Mitigation:** Deduplicate, then filter to top 20 by frequency score. Pass to Haiku with note: "Most common labels: X, Y, Z."

**Risk: Haiku-Generated Encyclopedia Entries Are Hallucinated**
- Haiku creates stub with wrong title, description, or slug.
- **Mitigation:** Mark as `status: 'AUTO_GENERATED'`, not PUBLISHED. Curator review required before visibility to shoppers (future curator tool). Slug dedup prevents duplicate entries. Internal logging ties each entry back to `triggerItemId` for audit.

**Risk: PriceBenchmark Data Stale or Wrong**
- Haiku-inferred benchmarks are outdated or wrong when published.
- **Mitigation:** Benchmarks marked `dataSource: 'haiku_inferred'` are never shown to shoppers until curator promotes to PUBLISHED. Backfill job refines ranges using actual sold-item data once N ≥ 5 real sales exist; this replaces `haiku_inferred` ranges with `community_consensus`.

**Risk: Set Splitting at Checkout**
- Organizer uploads "set of 8," customer buys "1 of 8" instead of full set.
- **Mitigation:** Locked decision 1–2: 1 Purchase record per set, 1 label per set. POS prevents split purchase (atomic unit behavior).

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
