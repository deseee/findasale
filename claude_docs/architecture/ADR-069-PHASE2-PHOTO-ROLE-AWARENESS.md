# ADR-069 Phase 2: Photo Role Awareness

**Status:** Architecture Specification (Ready for Patrick Decision)  
**Created:** 2026-04-23  
**Author:** Architect  
**Epic:** CD2 Phase 2 (Batch Upload) + Feature #30 (Valuation)  
**Baseline:** ADR-069-BURST-CLUSTERING-PRICING-WIRING.md (Phase 1 locked)

---

## Executive Summary

Phase 1 (ADR-069) clusters photos into sets and aggregates Vision labels across all photos. **Phase 2 adds semantic role awareness:** each photo in a cluster receives a `photoRole` label (determined by Haiku during the same clustering call) that signals what type of visual information it contains—front shot, back/stamp shot, damage shot, label shot, etc.

This enables downstream components to **weight signals contextually**: Vision OCR from a "LABEL_BRAND" photo is prioritized for brand extraction; condition grading focuses on "DETAIL_DAMAGE" photos; title/tag generation uses "FRONT" photos primarily.

**Implementation:** Zero additional API calls. The existing clustering Haiku call (call #1 in Phase 1) is extended to include `photoRole` assignment in its JSON output. Per-cluster analysis (call #2) then routes Vision labels and image context by role during Haiku tagging.

**Scope:** Purely backend. No frontend changes; no new UI. Organizer never sees role labels. This is an internal signal routing optimization.

**Complexity:** M (Medium). ~4–6 dev-days assuming Phase 1 is shipped.  
**Risk:** Low. Graceful fallback to `photoRole: UNKNOWN` if Haiku doesn't assign a role.

---

## Problem Statement (Expanded from ADR-069)

Phase 1 fixed fragmentation (multi-photo clustering) and signal loss (Vision label aggregation). But **aggregation alone loses context about which photo shows what.**

### Example: Dinnerware Set
Organizer uploads 5 photos:
1. Stack of plates (front angle, marketing shot)
2. Bottom of plate (maker's mark, "Corelle")
3. Chipped rim (damage detail)
4. Original box label
5. Plates on table (scale/context)

**Phase 1 behavior:**
- Clusters all 5 as one item ✓
- Extracts Vision labels from all 5:
  - Photo 1: "plate", "dinnerware", "stacked", "product photo"
  - Photo 2: "ceramic", "text", "Corelle", "mark"
  - Photo 3: "chip", "crack", "damage"
  - Photo 4: "text", "label", "original box"
  - Photo 5: "table", "placement", "dinnerware"
- Haiku receives all labels in one flat list ❌

**Haiku's challenge without roles:**
- "Corelle" label in the flat list is equally weighted with "table", "stacked", "product"
- Haiku can't prioritize: "this is from a bottom-mark photo; weigh it heavily for identification"
- Condition grading uses all labels, including "stacked" (not relevant to condition)
- Result: generic pricing, missed brand signals

**Phase 2 behavior with roles:**
- Clustering call returns roles:
  ```json
  [
    { "index": 0, "photoRole": "FRONT" },
    { "index": 1, "photoRole": "BACK_STAMP" },  // ← explicit signal
    { "index": 2, "photoRole": "DETAIL_DAMAGE" },
    { "index": 3, "photoRole": "LABEL_BRAND" },
    { "index": 4, "photoRole": "SCALE_CONTEXT" }
  ]
  ```
- Haiku per-cluster prompt includes role-scoped instructions:
  - "Labels from BACK_STAMP photos (indices 1): prioritize brand/maker extraction"
  - "Images tagged DETAIL_DAMAGE (indices 2): feed directly into condition grading prompt"
  - "Images tagged LABEL_BRAND (indices 3): run enhanced OCR context"
  - "Skip SCALE_CONTEXT (indices 4) for title/tag generation"
- Result: "Corelle" brand locked; "chip" accurately grades condition; generic pricing avoided

---

## Solution Design

### 1. Photo Role Taxonomy

Six canonical roles, carefully scoped to maximize signal routing benefit while minimizing Haiku decision overhead:

| Role | Description | Primary Use | Haiku Guidance |
|------|-------------|-------------|---|
| **FRONT** | Main/marketing angle of item; best view for visual identification | Title, tags, category | "Use this image primarily for item name, category, and visual feature identification" |
| **BACK_STAMP** | Rear, underside, or interior view showing maker marks, hallmarks, stamps, pottery/silver backstamps | Brand/maker ID, origin | "This shows the back or underside. Look for maker marks, hallmarks, brand stamps, pottery marks, silver marks—critical for identification and pricing" |
| **DETAIL_DAMAGE** | Close-up of damage, wear, chips, cracks, patina, staining, repairs | Condition grading | "This is a detailed view of condition issues. Identify all visible damage, wear, or restoration work for accurate condition classification" |
| **LABEL_BRAND** | Photo of price tag, label, barcode, serial plate, manufacturer label | Brand/price/year occlusion & OCR | "This photo contains text labels, tags, or serial information. Extract all text; prioritize brand names, dates, model numbers, and price information" |
| **MULTI_ANGLE** | Alternate angle showing different side/view but not specialized (back, damage, label) | Secondary visual context | "This shows an alternative angle of the item. Use to confirm size, proportion, or additional visual details not visible in primary shots" |
| **UNKNOWN** | Haiku unable to classify, or fallback for unrecognized patterns | Passive (treat as unlabeled) | "Role unclear; treat as general reference image" |

**Rationale for 6 roles:**
- Fewer than 6: loses critical distinctions (back vs. damage are different signals)
- More than 6: Haiku classification unreliability increases; diminishing returns on signal routing
- UNKNOWN fallback: Graceful degradation—if Haiku is unsure, we still process the photo

**Organizer never sees role labels.** Roles are internal only, logged for analytics/audit but never surfaced in UI.

---

### 2. Clustering Prompt Extension (Haiku Call #1)

**Current Phase 1 clustering prompt returns:**
```json
{
  "clusters": [
    {
      "id": "cluster-1",
      "photoIndices": [0, 1, 2],
      "detectedType": "8-piece place setting",
      "confidence": 0.95,
      "reasoning": "Matching dishes, same pattern, consistent lighting"
    }
  ],
  "ungrouped": [3, 4, 5],
  "notes": "..."
}
```

**Phase 2 extended prompt returns:**
```json
{
  "clusters": [
    {
      "id": "cluster-1",
      "photoIndices": [0, 1, 2],
      "detectedType": "8-piece place setting",
      "confidence": 0.95,
      "reasoning": "Matching dishes, same pattern, consistent lighting",
      "photos": [
        {
          "index": 0,
          "photoRole": "FRONT",
          "roleReasoning": "Straight-on marketing angle of stacked plates; best for visual identification"
        },
        {
          "index": 1,
          "photoRole": "BACK_STAMP",
          "roleReasoning": "Underside view showing maker mark and 'Corelle' stamp"
        },
        {
          "index": 2,
          "photoRole": "DETAIL_DAMAGE",
          "roleReasoning": "Close-up of rim showing minor chipping and edge wear"
        }
      ]
    }
  ],
  "ungrouped": [
    {
      "index": 3,
      "photoRole": "LABEL_BRAND",
      "roleReasoning": "Original box label with product info and date code"
    },
    {
      "index": 4,
      "photoRole": "SCALE_CONTEXT",
      "roleReasoning": "Plates on table showing placement; not grouped with item"
    }
  ],
  "notes": "..."
}
```

**Prompt instruction to Haiku (added to clustering system prompt):**

```
For each photo in each cluster AND each ungrouped photo, assign one of these roles:
- FRONT: Best main angle for identifying the item visually (primary shot)
- BACK_STAMP: Shows maker marks, stamps, brand labels, hallmarks, or interior features
- DETAIL_DAMAGE: Close-up showing damage, wear, staining, repairs, or condition details
- LABEL_BRAND: Text labels, barcodes, serial plates, price tags, product labels
- MULTI_ANGLE: Alternate viewing angle not covered by other roles
- UNKNOWN: You cannot confidently classify the photo's role

Return each photo with:
- "index": [integer]
- "photoRole": [role name]
- "roleReasoning": [1-2 sentence explanation of why this role applies]

These roles will be used downstream to weight different analysis signals (e.g., brand extraction from BACK_STAMP, condition from DETAIL_DAMAGE).
```

**Schema change (backend):**
```typescript
interface ClusterPhoto {
  index: number;
  photoRole: 'FRONT' | 'BACK_STAMP' | 'DETAIL_DAMAGE' | 'LABEL_BRAND' | 'MULTI_ANGLE' | 'UNKNOWN';
  roleReasoning?: string;
}

interface Cluster {
  id: string;
  photoIndices: number[];
  detectedType: string;
  confidence: number;
  reasoning: string;
  photos: ClusterPhoto[];  // ← NEW
}
```

---

### 3. Per-Cluster Analysis Prompt Changes (Haiku Call #2)

Current Phase 1 per-cluster analysis prompt is called with:
- All N images for the cluster
- Aggregated Vision labels (flattened list)
- Optional PriceBenchmark context

**Phase 2 extends the prompt to use role context:**

#### Template for Role-Scoped Prompt Additions

**Baseline prompt section (unchanged):**
```
You are analyzing a cluster of photos of an item or set.
Determine title, description, category, condition, tags, and estimated price.
```

**Phase 2 additions (conditionally inserted based on detected roles in cluster):**

**If cluster contains BACK_STAMP photo(s):**
```
📌 BACK/STAMP PHOTOS (indices: X, Y, Z)
These images show the back, underside, or interior of the item(s). Look for:
- Maker marks, hallmarks, pottery stamps, silver marks
- Brand names, logos, or manufacturer information
- Date codes, serial numbers, pattern names
- Country of origin or "Made in" marks

These cues are CRITICAL for accurate brand/maker identification and pricing. Prioritize text 
and marks visible in these photos when assigning brand, category, and origin.
```

**If cluster contains DETAIL_DAMAGE photo(s):**
```
🔍 DAMAGE/CONDITION DETAIL PHOTOS (indices: X, Y, Z)
These are close-up views of condition issues. You will see:
- Chips, cracks, crazing, or breakage
- Staining, discoloration, or patina
- Repairs, glue lines, or restoration work
- Edge wear, fading, or surface scratches

Assess these carefully. They directly determine the item's condition grade (NEW, LIKE_NEW, USED, POOR).
Grade conservatively based on visible damage.
```

**If cluster contains LABEL_BRAND photo(s):**
```
🏷️ LABEL/TEXT PHOTOS (indices: X, Y, Z)
These images contain text, labels, or printing. Extract:
- Brand names or product names
- Model or style names/numbers
- Dates, years, or era markings
- Price tags or retail labels (for reference; do not override organizer's stated price)
- Care instructions or origin marks

Treat text extraction from these photos as higher priority than general Vision labels.
```

**If cluster does NOT contain BACK_STAMP but tags suggest it should:**
```
⚠️ NOTE: No back/underside photo in this cluster. Brand/maker identification may be uncertain. 
Base tags on visual features visible in front/main angles only.
```

**If cluster contains SCALE_CONTEXT photo(s):**
```
📐 CONTEXT/SCALE PHOTOS (indices: X, Y, Z)
These show the item in context or with size references (on table, in hand, etc.). 
Use for estimating item size/proportion but do NOT include placement context in title or description 
(e.g., "plates on a table" is not a feature of the item itself).
```

**If cluster contains MULTI_ANGLE photo(s):**
```
🔄 ALTERNATE ANGLE PHOTOS (indices: X, Y, Z)
These show different perspectives of the item(s). Use to confirm details visible in primary shots 
and to assess overall form, proportion, and any features visible from this angle.
```

**End of prompt section (before output schema):**
```
Use the role-based photo context above to inform your analysis. Prioritize signals from 
specialized photos (BACK_STAMP for brand, DETAIL_DAMAGE for condition) over generic labels.

If a photo role contradicts the item's visual evidence (e.g., LABEL_BRAND photo contains no readable text), 
note it internally but do not let role classification bias your analysis of what is actually visible.
```

**Implementation in code:**

```typescript
async function getHaikuAnalysisMultiImage(
  imageBase64Array: string[],
  mimeTypeArray: string[],
  visionLabels: string[],
  clusterPhotos: ClusterPhoto[],  // ← NEW: role-aware photo metadata
  benchmarks?: PriceBenchmark[]
): Promise<AITagResult> {
  // Build role-scoped prompt insertions
  const roleContext = buildRoleContextPrompt(clusterPhotos);
  
  // Assemble final system prompt with role sections
  const systemPrompt = `
[Existing base prompt...]
[INSERT roleContext here]
[Rest of existing prompt...]
  `;
  
  // Call Haiku with extended context
  const response = await anthropic.messages.create({
    model: 'claude-3-5-haiku-20241022',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: [
          // All images
          ...imageBase64Array.map((base64, i) => ({
            type: 'image' as const,
            source: {
              type: 'base64' as const,
              media_type: mimeTypeArray[i],
              data: base64,
            },
          })),
          // Text context
          {
            type: 'text' as const,
            text: `Vision API labels: ${visionLabels.join(', ')}
            
Analyze these images according to photo roles and return JSON...`,
          },
        ],
      },
    ],
  });
  
  return parseHaikuResponse(response);
}

function buildRoleContextPrompt(clusterPhotos: ClusterPhoto[]): string {
  const roles = groupBy(clusterPhotos, 'photoRole');
  const sections: string[] = [];
  
  if (roles.BACK_STAMP?.length > 0) {
    sections.push(`📌 BACK/STAMP PHOTOS (indices: ${roles.BACK_STAMP.map(p => p.index).join(', ')})
These images show the back, underside, or interior...`);
  }
  
  if (roles.DETAIL_DAMAGE?.length > 0) {
    sections.push(`🔍 DAMAGE/CONDITION DETAIL PHOTOS (indices: ${roles.DETAIL_DAMAGE.map(p => p.index).join(', ')})
These are close-up views of condition issues...`);
  }
  
  if (roles.LABEL_BRAND?.length > 0) {
    sections.push(`🏷️ LABEL/TEXT PHOTOS (indices: ${roles.LABEL_BRAND.map(p => p.index).join(', ')})
These images contain text, labels, or printing...`);
  }
  
  if (roles.SCALE_CONTEXT?.length > 0) {
    sections.push(`📐 CONTEXT/SCALE PHOTOS (indices: ${roles.SCALE_CONTEXT.map(p => p.index).join(', ')})
These show the item in context or with size references...`);
  }
  
  if (roles.MULTI_ANGLE?.length > 0) {
    sections.push(`🔄 ALTERNATE ANGLE PHOTOS (indices: ${roles.MULTI_ANGLE.map(p => p.index).join(', ')})
These show different perspectives of the item(s)...`);
  }
  
  return sections.join('\n\n');
}
```

---

### 4. Vision OCR Routing Decision

**Question:** Should we make a **separate enhanced Google Vision call** on BACK_STAMP and LABEL_BRAND photos with `DOCUMENT_TEXT_DETECTION` mode?

**Recommendation:** **NO — use standard Vision + Haiku routing.** Here's why:

#### Analysis

| Approach | Pros | Cons |
|----------|------|------|
| **Separate Document Vision calls** | Catches fine print, small text, highly structured labels (exact match) | Extra API calls (2–4 per cluster); added latency; document detection overkill for maker's marks; no guaranteed quality improvement over Haiku-refined text |
| **Standard Vision + Haiku routing** | One vision call per photo (unchanged); Haiku refines detected text; faster; Haiku can contextualize text ("this 'Corelle' mark comes from the bottom—it's a brand identifier") | Haiku sometimes hallucinates text; small text in photo may be missed by standard detection |

**Decision: Standard Vision + role-context routing**

- Keep Phase 1's `analyzeItemImages()` unchanged (one Vision call per photo, `LABEL_DETECTION` feature)
- Feed aggregated Vision labels to Haiku PLUS photo roles
- Haiku prompt emphasizes: "LABEL_BRAND photos contain critical text; extract and prioritize brand/date/serial information"
- If text detection accuracy is a problem, defer to Phase 3 (document vision as an optional enhancement)

**Justification:**
- Haiku-3.5 is very good at reading text from images; it often outperforms structured OCR on vintage maker's marks
- Maker's marks are often small, hand-stamped, or stylized—document detection not designed for these
- Adding document detection introduces latency + cost without guaranteed better results
- We have clear feedback loop: if text is missed, it shows up as low-confidence brand tags, which Patrick can improve via Encyclopedia curation

---

### 5. Schema Changes

#### Photo Model Extension
```prisma
model Photo {
  id            String   @id @default(cuid())
  itemId        String
  item          Item     @relation(fields: [itemId], references: [id], onDelete: Cascade)
  
  // Existing fields...
  url           String
  visionLabels  String[] @default([])  // Aggregated labels from Vision API (Phase 1)
  orderIndex    Int?
  
  // Phase 2: Photo Role Awareness
  photoRole     String?  // FRONT | BACK_STAMP | DETAIL_DAMAGE | LABEL_BRAND | MULTI_ANGLE | UNKNOWN
  roleReasoning String?  // Haiku's explanation of why this role was assigned (optional, for logging)
  
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  @@index([itemId])
  @@index([photoRole])
}
```

#### Item Model (No Changes)
- `photoRole` lives on Photo, not Item
- Item.photoUrls already stores all photos for a cluster

#### Enum for PostgreSQL (New)
```prisma
enum PhotoRole {
  FRONT
  BACK_STAMP
  DETAIL_DAMAGE
  LABEL_BRAND
  MULTI_ANGLE
  UNKNOWN
}
```

**Migration:**
```sql
-- Add photoRole + roleReasoning to Photo table
ALTER TABLE Photo ADD COLUMN photoRole VARCHAR(30);
ALTER TABLE Photo ADD COLUMN roleReasoning TEXT;

-- Create index for role-based queries
CREATE INDEX idx_Photo_photoRole ON Photo(photoRole);
```

**Backwards Compatibility:**
- `photoRole` and `roleReasoning` default to NULL
- Existing photos unaffected; new photos assigned roles during clustering
- If a photo lacks a role, code defaults to `UNKNOWN` and proceeds

---

### 6. Files to Modify

#### Backend

| File | Change | Scope |
|------|--------|-------|
| `packages/database/prisma/schema.prisma` | Add `photoRole`, `roleReasoning` to Photo model + enum | Schema |
| `packages/backend/src/controllers/batchAnalyzeController.ts` | Parse `photos[]` + roles from Haiku clustering response; pass to per-cluster analysis | Controller |
| `packages/backend/src/services/cloudAIService.ts` | (1) Extend `getHaikuAnalysisMultiImage()` to accept `clusterPhotos` param; (2) Build and insert role-context prompt; (3) Store `photoRole` on Photo records after analysis | Service |
| `packages/backend/src/lib/haikuPrompts.ts` (new file, optional) | Move role-context prompt logic to a dedicated file for maintainability | Utility |
| `packages/backend/src/jobs/processRapidDraft.ts` | If RapidCapture's single-photo analysis uses `analyzeItemImages()`, no change needed (roles only populate during clustering). If future work adds role assignment to RapidCapture, update here. | Future |

#### Database

| File | Change | Scope |
|------|--------|-------|
| `packages/database/migrations/[timestamp]_add_photo_role.sql` | Schema migration (see Migration section below) | Schema |

#### Frontend
- **No changes.** Photo roles are internal only; organizer never sees them.
- If future feature adds role display to admin/curator tools, defer to Phase 3+.

---

### 7. Implementation Complexity & Risk

#### Complexity: **M (Medium)**
- Requires understanding of Haiku prompt engineering + response parsing
- Role-context prompt sections are formulaic (easy to test with variations)
- Schema change is minimal (two nullable columns)
- Backward compatible: existing photos without roles degrade gracefully

#### Estimated Dev Time: **4–6 days** (assuming Phase 1 complete)
1. **Day 1–2:** Extend clustering prompt in cloudAIService; test Haiku response parsing
2. **Day 2–3:** Update batchAnalyzeController to handle `photos[]` + roles; wire role data to per-cluster analysis
3. **Day 3–4:** Build role-context prompt sections; extend Haiku analysis prompt
4. **Day 4–5:** Schema migration + Photo record updates with roles
5. **Day 5–6:** Integration testing (clustering + analysis + role routing) + edge case handling

#### Key Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| **Haiku classification hallucination** | Medium | Roles assigned to wrong photo (e.g., FRONT labeled as BACK_STAMP) | Confidence threshold in clustering (already 0.75); UNKNOWN fallback graceful; monitor analytics for misclassifications |
| **Role context "over-specifies" Haiku** | Low–Medium | Haiku follows role prompt too literally, ignoring actual image evidence | Prompt includes: "If role contradicts visual evidence, note it but don't let classification bias your analysis" |
| **Expensive prompt bloat** | Low | Extended prompt increases Haiku token usage significantly | Role sections are ~200 tokens total; acceptable cost |
| **Complex edge case: cluster with no FRONT** | Low | Haiku analysis falters when primary shot is absent | Prompt handles: "If no FRONT photo, use best-available angle"; graceful fallback |

---

### 8. Migration Strategy

**Phase 1 Complete:** Clustering + Vision aggregation deployed and live.

**Phase 2 Rollout:**

1. **Week 1: Code + Schema**
   - Commit schema changes (Photo model, enum, migration)
   - Update cloudAIService clustering response parser to handle `photos[]`
   - Update batchAnalyzeController to pass roles to per-cluster analysis
   - Extend Haiku prompt with role-context sections
   - Deploy to staging; test with real photos

2. **Week 2: Soft Launch**
   - Deploy to production
   - All NEW uploads use role-aware clustering
   - Existing items unaffected (no historical role data)
   - Monitor Haiku clustering quality (confidence, role assignments)
   - Log role assignments for analytics

3. **Week 3+: Refinement**
   - Monitor per-cluster analysis accuracy (do role-context prompts improve tag quality?)
   - Adjust role-context prompts if needed (e.g., if BACK_STAMP images aren't helping with brand extraction)
   - Optional: backfill roles on Phase 1 items if clustering re-runs (low priority)

**Feature Flag:** Not required. Old code path (no roles) is dead once clustering always assigns roles. Fallback: if Haiku returns no `photos[]` array, treat all photos as UNKNOWN and proceed.

---

## Integration with Phase 1

**No breaking changes to Phase 1 contracts.**

- batchAnalyzeController response shape unchanged (returns clusters + suggestions)
- Haiku clustering call adds `photos[]` field (optional to parse; ignored if not present)
- Per-cluster analysis call accepts optional `clusterPhotos` param (defaults to empty if not passed)
- Fallback: if roles are missing, Haiku still produces tags (generic analysis, no role-context optimization)

---

## Success Metrics

1. **Role Assignment Accuracy:** Haiku correctly assigns roles to >85% of photos in test clusters (10 multi-photo drops, 50+ photos total)
2. **Brand Signal Improvement:** BACK_STAMP photos with maker's marks result in correct brand tagging >75% of the time (vs. ~40% without roles)
3. **Condition Grading Confidence:** Items with DETAIL_DAMAGE photos receive accurate condition grades >80% of the time
4. **No Regression:** Per-cluster analysis latency ≤ Phase 1 (role-context prompt adds negligible overhead)

---

## Decision Gates

### For Patrick

1. **Approve 6 photo roles?** (FRONT, BACK_STAMP, DETAIL_DAMAGE, LABEL_BRAND, MULTI_ANGLE, UNKNOWN)
   - Alternative: propose different taxonomy

2. **Vision OCR routing approach?** (Recommended: standard Vision + Haiku role routing, NOT separate document detection)
   - Alternative: prefer separate `DOCUMENT_TEXT_DETECTION` calls on LABEL_BRAND photos

3. **Timeline?** Phase 2 fits after Phase 1; can run in parallel if dev bandwidth allows. No blocking dependencies.

---

## Fallback / Rollback

**If Haiku clustering returns no roles (API change or regression):**
- Parse response gracefully; treat missing `photos[]` as UNKNOWN for all photos
- Per-cluster analysis runs without role context; results degrade gracefully to Phase 1 quality

**If role-context prompt causes hallucinations:**
- Revert role-context prompt sections; revert to generic analysis (Phase 1)
- Deploy hotfix; no schema rollback needed

**If roles degrade tag accuracy:**
- Disable role-context prompt sections; photo roles remain stored (inert) for future use
- No code rollback required

---

## References

- ADR-069: Burst Clustering & Pricing Wiring (Phase 1 baseline)
- ADR-052: Encyclopedia + PriceBenchmark schema introduction
- Haiku-3.5 multimodal capabilities (Vision instruction-following)
- Photo model schema (packages/database/prisma/schema.prisma)
- cloudAIService (packages/backend/src/services/cloudAIService.ts)

---

## Appendix: Example Role-Context Prompt (Full)

```
You are analyzing a cluster of photos of an item or set. Determine title, description, 
category, condition, tags, and estimated price range.

📌 BACK/STAMP PHOTOS (indices: 1)
These images show the back, underside, or interior of the item(s). Look for:
- Maker marks, hallmarks, pottery stamps, silver marks
- Brand names, logos, or manufacturer information
- Date codes, serial numbers, pattern names
- Country of origin or "Made in" marks

These cues are CRITICAL for accurate brand/maker identification and pricing. Prioritize text 
and marks visible in these photos when assigning brand, category, and origin.

🔍 DAMAGE/CONDITION DETAIL PHOTOS (indices: 2)
These are close-up views of condition issues. You will see:
- Chips, cracks, crazing, or breakage
- Staining, discoloration, or patina
- Repairs, glue lines, or restoration work
- Edge wear, fading, or surface scratches

Assess these carefully. They directly determine the item's condition grade (NEW, LIKE_NEW, USED, POOR).
Grade conservatively based on visible damage.

🏷️ LABEL/TEXT PHOTOS (indices: 3)
These images contain text, labels, or printing. Extract:
- Brand names or product names
- Model or style names/numbers
- Dates, years, or era markings
- Price tags or retail labels (for reference; do not override organizer's stated price)
- Care instructions or origin marks

Treat text extraction from these photos as higher priority than general Vision labels.

📐 CONTEXT/SCALE PHOTOS (indices: 4)
These show the item in context or with size references (on table, in hand, etc.). 
Use for estimating item size/proportion but do NOT include placement context in title or description 
(e.g., "plates on a table" is not a feature of the item itself).

Use the role-based photo context above to inform your analysis. Prioritize signals from 
specialized photos (BACK_STAMP for brand, DETAIL_DAMAGE for condition) over generic labels.

If a photo role contradicts the item's visual evidence (e.g., LABEL_BRAND photo contains no readable text), 
note it internally but do not let role classification bias your analysis of what is actually visible.

Vision API aggregated labels: ceramic, plate, dinnerware, corelle, text, mark, chip, crack, damage, 
label, table, placement, original box, stacked

Return JSON:
{
  "title": "Set of 8 Corelle Dinnerware Plates",
  "description": "...",
  "category": "Dinnerware & Serveware",
  "condition": "USED",
  "tags": ["dinnerware", "corelle", "vintage", "set"],
  "estimatedPriceLow": 15,
  "estimatedPriceHigh": 35,
  "confidence": 0.88,
  "reasoning": "..."
}
```

---

**Status:** Ready for Patrick decision. No blocking issues. Phase 2 can proceed immediately after Phase 1 ships.

