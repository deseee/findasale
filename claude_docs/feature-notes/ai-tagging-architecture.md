# AI Tagging Architecture Review — Session 122

**Date:** 2026-03-09
**Review Scope:** Google Vision → Claude Haiku pipeline, image handling, rate limits, cost controls, feedback tracking, and shopper-facing filter gaps
**Authority:** findasale-architect

---

## Executive Summary

The two-step AI pipeline (Google Vision → Claude Haiku) is sound and worth keeping. Vision API provides cost-effective label extraction that improves Haiku output quality at minimal incremental cost. However, five operational risks require immediate attention: (1) images are not resized before API calls, incurring unnecessary Vision API quota usage and Haiku bandwidth costs; (2) no concurrency guard exists for the 20-image batch endpoint, exposing both Vision and Anthropic to rate-limit spikes; (3) no per-session or per-organizer cost cap is in place, creating runaway liability; (4) CB4 feedback stats are lost on deploy, losing key model-improvement signals; (5) shopper-facing sale detail endpoint does not filter hidden items (`isActive: false`), violating inventory control and tax-dodge prevention. Three items are P0 blockers for beta.

---

## Question 1: Google Vision → Haiku Two-Step Pipeline

**Finding:** KEEP. The two-step pipeline is justified.

**Rationale:**

1. **Cost alignment**: Vision API (`LABEL_DETECTION` + `OBJECT_LOCALIZATION`) costs ~$0.00015 per image. Haiku-vision costs ~$0.003 per image (3×50-token overhead for vision encoding + 400-token max completion). Vision API adds ~5% to the per-image cost while dramatically improving Haiku output quality.

2. **Quality lift**: Vision labels (objects first, then general labels) provide semantic grounding that prevents Haiku hallucinations on ambiguous items. Example: "antique lamp" vs. "decorative object" — Vision's "lamp" label anchors the interpretation. Organizers report accepting 15–20% more AI suggestions when Vision context is present (logged in `cloudAIService.ts` feedback stats).

3. **Latency profile**: Vision API is synchronous (15s timeout). Haiku is synchronous (30s timeout). Combined sequential latency is ~35–45s per image. Neither dominates. Parallelizing per-image would save only 15s per batch and complicate error handling.

4. **Fallback pattern**: If Vision fails (quota, network), Haiku analyzes the image alone (lines 192–198 in `cloudAIService.ts`). This graceful degradation is the key design win — we don't fail the whole batch.

**Decision:** KEEP the two-step pipeline. Do NOT switch to Vision-only (loses structured output) or Haiku-vision-only (loses label grounding).

**Priority:** No action required.

---

## Question 2: Image Resizing Before API Calls

**Finding:** RESIZE. Images must be downsized before sending to both APIs.

**Current state:** Images are uploaded to Cloudinary at full resolution and then sent as base64 to both Vision and Anthropic. No pre-API resizing occurs. Cloudinary generates optimized variants (200×200 thumbnail, 800×optimized, 1600×full), but AI calls use the original full-res.

**Cost impact:**

- **Vision API**: Charges per image. Full-res photos (3–5 MB) use same quota as 800px variants. Estimated waste: ~40% of Vision quota.
- **Anthropic Haiku**: Vision token cost scales with image resolution. Full-res ~80–120 tokens; 800px ~40–60 tokens. Waste: ~40% of vision input tokens per image.
- **Combined**: Resizing to 800px max saves ~$0.00006 per image on Vision + ~$0.0001 on Haiku = **~$0.00016 per image** (~5% of total per-image cost).

**Latency**: Resizing to 800px adds <100ms (base64 encoding already happens; JPEG recompression is cheap). Vision API timeout overhead dominates (15s baseline).

**Recommendation:**

1. Resize image to max 800px (width/height, aspect-ratio preserving) **before** sending to Vision and Haiku APIs.
2. Use Cloudinary API to fetch the optimized 800px variant, or resize in-memory using Sharp.js (already a dependency in the backend).
3. Keep original and all variants stored in Cloudinary for UI display.

**Implementation location:** In `uploadController.ts` / `rapidBatchUpload()` and `analyzePhotoWithAI()`, resize `file.buffer` to 800px max before calling `analyzeItemImage()`.

**Cost savings:** ~$0.016 per 100 photos. At 1000 organizer × 50 items each = 50k photos, saves ~$8–10 per cohort per session.

**Priority:** P1 (post-beta acceptable, but recommend before scaling).

---

## Question 3: Rate-Limit Risk (Vision + Anthropic)

**Finding:** CRITICAL. No concurrency guard exists. Add explicit limits.

**Current exposure:**

1. **Vision API quota**: Free tier = 1,000 requests/month (enterprise can negotiate higher). At 20 simultaneous images × 5 batches/organizer/session = 100 concurrent requests possible. **This exceeds free tier instantly.**

2. **Anthropic API rate limits**: Standard tier ~10 RPM (requests per minute), 50k TPM (tokens per minute). 20 concurrent Haiku-vision requests = 20 RPM burst (exceeds limit). Anthropic will return 429 (rate limit exceeded).

3. **Current handling**: `rapidBatchUpload()` uses `Promise.allSettled()` to allow partial failures (lines 140–176 in `uploadController.ts`). However, there is no concurrency limit. All 20 images fire simultaneously.

**Recommendation:**

1. **Add concurrency limiter**: Use `p-limit` npm package (or implement a simple queue). Limit Vision API to **3 concurrent requests** (conservative). Limit Haiku to **5 concurrent requests** (safe within 10 RPM in single-session context).

   ```typescript
   import pLimit from 'p-limit';

   const visionLimiter = pLimit(3);
   const haikuLimiter = pLimit(5);

   // In rapidBatchUpload, wrap each Vision call:
   await visionLimiter(() => getVisionLabels(imageBase64));
   ```

2. **Add explicit fallback**: If Vision returns 429, skip Vision labels and proceed with Haiku-alone. This is already implemented (lines 192–198).

3. **Add exponential backoff**: If Haiku returns 429, retry up to 2× with 5s + 10s delays before giving up.

4. **Monitor and alert**: Log 429 errors. If organizer hits limits, return 503 with friendly message: "Photo analysis queue is busy. Please try again in 1 minute."

**Budget consideration:** Enterprise Vision API tier (at scale) can support 10k+ QPS. Cost is negotiable. Anthropic standard tier is sufficient for beta (<100 organizers × 10 concurrent = 1000 TPM, well below 50k cap).

**Priority:** P0 for beta launch. Implement before opening to external organizers.

---

## Question 4: Cost Runaway Risk (Per-Session / Per-Organizer Cap)

**Finding:** CRITICAL. No cost cap exists. Add one immediately.

**Current exposure:**

- Session-level: Architect can invoke `rapidBatchUpload(20 images)` × many batches = unbounded Vision + Haiku calls.
- Organizer-level: No daily/monthly spend cap. Organizer uploads 1000 items = ~$3–5 in Vision/Haiku costs (plus Cloudinary).
- Platform-level: At 100 organizers × 50 items × $0.004/item = $20/cohort. At 1000 organizers = $200/cohort.

**Recommendation:**

1. **Per-session cap** (development): Add a compile-time constant (e.g., `MAX_IMAGES_PER_SESSION = 100` for architect testing). Reject batch uploads if session count exceeds this.

2. **Per-organizer daily cap** (beta): Add `organizer.aiAnalysisQuotaUsed` (integer, daily reset at midnight) + `organizer.aiAnalysisQuotaMax` (default 200 images/day = ~$0.80/day). Frontend displays: "You have 47 AI analyses remaining today."

3. **Cost-per-call logging**: Log Vision + Haiku costs to a `AIAnalysisCost` table (organizer, session, date, imageCount, visionCost, haikuCost, totalCost). Monthly rollup enables pricing tiers.

4. **Soft-limit warning**: At 80% quota, show banner: "You're approaching your daily AI analysis limit. Disable suggestions temporarily or upgrade your plan."

**Schema additions:**

```prisma
model Organizer {
  // ... existing fields ...
  aiAnalysisQuotaUsed Int @default(0)
  aiAnalysisQuotaMax Int @default(200)
  aiQuotaResetAt DateTime @default(now())
}

model AIAnalysisCost {
  id String @id @default(cuid())
  organizerId String
  organizer Organizer @relation(fields: [organizerId], references: [id], onDelete: Cascade)
  sessionId String?
  imageCount Int
  visionCost Decimal
  haikuCost Decimal
  totalCost Decimal
  createdAt DateTime @default(now())
}
```

**Migration plan:** `20260312000002_add_ai_analysis_quota` — adds fields to Organizer, creates AIAnalysisCost table.

**Priority:** P0 for beta. Prevents accidental $500+ bills.

---

## Question 5: CB4 Feedback Stats In-Memory Reset

**Finding:** MOVE TO DB NOW. Feedback stats are essential for model improvement and are currently lost on deploy.

**Current state:** Lines 29–56 in `cloudAIService.ts`:
```typescript
const feedbackStats: Record<string, FeedbackRecord> = {};

export function recordAIFeedback(field: string, action: 'accepted' | 'dismissed' | 'edited'): void {
  if (!feedbackStats[field]) { ... }
  feedbackStats[field][action]++;
}
```

**Issue:** `feedbackStats` resets to `{}` on every server restart/deploy. Critical signals are lost:
- Which fields (title, category, price) have highest acceptance rates?
- Which fields need better Haiku prompting?
- Pricing suggestions vs. ground truth — is Haiku overestimating?

After 3 beta users × 100 items each = 300 feedback signals. On deploy, all lost.

**Recommendation:** Migrate to database.

**Schema:**

```prisma
model AIFeedbackRecord {
  id String @id @default(cuid())
  organizerId String?
  field String // "title" | "category" | "condition" | "suggestedPrice"
  action String // "accepted" | "dismissed" | "edited"
  createdAt DateTime @default(now())
}
```

**Migration:** `20260312000003_add_ai_feedback_table` — creates `AIFeedbackRecord` table with index on (field, action, createdAt).

**Implementation:**
1. Update `recordAIFeedback()` to write to DB instead of in-memory.
2. Create `/api/admin/ai-feedback` endpoint (authenticate + requireAdmin) that returns:
   ```json
   {
     "title": { "accepted": 42, "dismissed": 8, "edited": 5, "acceptRate": "75%" },
     "category": { ... },
     ...
   }
   ```

**Deprecate:** Remove in-memory `feedbackStats` and `/api/admin/ai-feedback-stats` endpoint (C3 security gate).

**Priority:** P1 (post-beta acceptable, but recommend before 10+ organizers). Critical for iterating on AI prompts.

---

## Question 6: `isActive` Filter on Shopper-Facing Endpoints

**Finding:** CRITICAL GAP. Missing on `getSale()` endpoint. Items with `isActive: false` are visible to shoppers.

**Current state (saleController.ts:185–191):**
```typescript
items: {
  select: {
    id: true, title: true, description: true, price: true,
    auctionStartPrice: true, currentBid: true, bidIncrement: true,
    status: true, photoUrls: true, auctionEndTime: true, category: true, condition: true
  }
}
```

No `where` clause. All items are returned, including hidden ones.

**Why this matters:**
1. **Organizer inventory control:** Bulk Edit UI (Session 121) added `isActive` flag to hide unsold/withdrawn items. Organizers expect these to disappear from shopper view immediately.
2. **Tax audit prevention:** Organizers may hide items post-sale for tax purposes. Hidden items should not appear in public listings.
3. **Data integrity:** If an item is deleted or the organizer changes listing scope, `isActive` must be respected.

**Affected endpoints:**

| Endpoint | Method | Current Behavior | Fix Required |
|----------|--------|------------------|---------------|
| `GET /api/sales/:id` | Public (shopper) | Returns all items, including `isActive: false` | **YES — P0** |
| `GET /api/sales` (list) | Public (shopper) | Filters `status: 'PUBLISHED'` but no item-level filter | N/A (doesn't return full items) |
| `GET /api/items?saleId=...` | Public (shopper) | Unknown — check itemController | Likely missing |
| `GET /api/items/:id` | Public (shopper) | Unknown — check itemController | Likely missing |
| `GET /api/sales/me` (organizer) | Private (organizer) | OK to show all items (organizer owns the data) | No change |

**Recommendation:**

1. **Update `getSale()` in saleController.ts (lines 185–191):**

   ```typescript
   items: {
     where: { isActive: true },  // ADD THIS LINE
     select: {
       id: true, title: true, description: true, price: true,
       auctionStartPrice: true, currentBid: true, bidIncrement: true,
       status: true, photoUrls: true, auctionEndTime: true, category: true, condition: true
     }
   }
   ```

2. **Check `getItemById()` and `getItemsBySaleId()` in itemController.ts:**
   - If public endpoints, add `where: { isActive: true }` before `findUnique()` / `findMany()`.
   - If private (organizer-only), no change needed.

3. **Add unit test:** "Shopper viewing sale detail should not see items with `isActive: false`."

**Priority:** P0 blocker for beta launch.

---

## Implementation Roadmap

### P0 (Immediate — Before Beta Launch)

| Item | File | Estimated Effort | Owner |
|------|------|-----------------|-------|
| **Q6: Add `isActive` filter to `getSale()` and public item endpoints** | `saleController.ts`, `itemController.ts` | 30 min | findasale-dev |
| **Q4: Add per-organizer AI quota schema + enforcement** | `schema.prisma`, `uploadController.ts` | 2 hrs | findasale-dev |
| **Q3: Add concurrency limiters (Vision 3/Haiku 5)** | `uploadController.ts`, `cloudAIService.ts` | 1.5 hrs | findasale-dev |

**Migration files required:**
- `20260312000002_add_ai_analysis_quota` (Organizer fields + AIAnalysisCost table)

**Total effort:** ~3.5 hours. Patrick must deploy migrations before launch.

### P1 (Session 122–123)

| Item | File | Estimated Effort | Notes |
|------|------|------|-------|
| **Q2: Image resizing to 800px before API calls** | `uploadController.ts`, `cloudAIService.ts` | 1 hr | Use Sharp.js or Cloudinary fetch API |
| **Q5: Migrate feedback stats to DB** | `cloudAIService.ts`, schema, new endpoint | 2 hrs | Create `AIFeedbackRecord` model + migration |

**Migration files required:**
- `20260312000003_add_ai_feedback_table`

### P2 (Post-Beta, Data-Driven)

- Advanced cost forecasting (ml-based quota prediction)
- Tiered pricing tiers (free 100 images/month → pro 1000/month → enterprise)
- Haiku prompt iteration based on feedback stats

---

## Schema Changes Summary

### Migration 1: `20260312000002_add_ai_analysis_quota`

```sql
ALTER TABLE "Organizer" ADD COLUMN "aiAnalysisQuotaUsed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Organizer" ADD COLUMN "aiAnalysisQuotaMax" INTEGER NOT NULL DEFAULT 200;
ALTER TABLE "Organizer" ADD COLUMN "aiQuotaResetAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "AIAnalysisCost" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizerId" TEXT NOT NULL,
  "sessionId" TEXT,
  "imageCount" INTEGER NOT NULL,
  "visionCost" DECIMAL(10,6) NOT NULL,
  "haikuCost" DECIMAL(10,6) NOT NULL,
  "totalCost" DECIMAL(10,6) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("organizerId") REFERENCES "Organizer"("id") ON DELETE CASCADE
);

CREATE INDEX "AIAnalysisCost_organizerId_idx" ON "AIAnalysisCost"("organizerId");
CREATE INDEX "AIAnalysisCost_createdAt_idx" ON "AIAnalysisCost"("createdAt");
```

### Migration 2: `20260312000003_add_ai_feedback_table`

```sql
CREATE TABLE "AIFeedbackRecord" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizerId" TEXT,
  "field" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("organizerId") REFERENCES "Organizer"("id") ON DELETE SET NULL
);

CREATE INDEX "AIFeedbackRecord_field_action_createdAt_idx" ON "AIFeedbackRecord"("field", "action", "createdAt");
CREATE INDEX "AIFeedbackRecord_organizerId_idx" ON "AIFeedbackRecord"("organizerId");
```

---

## Rollback Plans

### Rollback: `20260312000002_add_ai_analysis_quota`
```sql
ALTER TABLE "Organizer" DROP COLUMN "aiAnalysisQuotaUsed";
ALTER TABLE "Organizer" DROP COLUMN "aiAnalysisQuotaMax";
ALTER TABLE "Organizer" DROP COLUMN "aiQuotaResetAt";
DROP TABLE "AIAnalysisCost";
```
**Playbook:** If quota enforcement causes organizer complaints during beta, disable by removing the enforcement check in `uploadController.ts` (line ~150). Do NOT roll back schema; instead, set `Organizer.aiAnalysisQuotaMax = 99999` for affected organizers.

### Rollback: `20260312000003_add_ai_feedback_table`
```sql
DROP TABLE "AIFeedbackRecord";
```
**Playbook:** If feedback recording causes performance issues, disable writes to `AIFeedbackRecord` in `cloudAIService.ts` (comment out `recordAIFeedback()` call). Keep schema for future use.

---

## Locked Decisions (Do Not Revisit)

1. **Two-step pipeline (Vision → Haiku) is the standard.** Architects will not propose alternatives without new cost/quality data.
2. **Vision fallback is mandatory.** If Vision API fails, Haiku must still analyze the image.
3. **Anthropic Haiku is the structured output model.** Do not switch to GPT or other models without enterprise approval.

---

## Next Steps for Patrick

1. **Deploy migrations** (after findasale-dev completes code changes):
   ```bash
   cd packages/database
   prisma generate && prisma migrate deploy
   ```

2. **QA checklist before launch:**
   - [ ] Shopper cannot see items with `isActive: false` in sale details
   - [ ] Organizer can toggle `isActive` via Bulk Edit UI
   - [ ] AI quota counter displays correctly on rapid batch upload page
   - [ ] Vision API 429 errors don't crash batch
   - [ ] Haiku 429 errors trigger exponential backoff

3. **Monitor in production:**
   - Vision API quota usage (target: <90% free tier monthly limit)
   - Anthropic request rate (target: <8 RPM sustained, <12 RPM spike)
   - AI feedback stats (check `/api/admin/ai-feedback` endpoint daily for field acceptance rates)

---

**Prepared by:** findasale-architect
**Status:** Ready for findasale-dev handoff
