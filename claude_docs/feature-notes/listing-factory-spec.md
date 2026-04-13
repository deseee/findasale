# Listing Factory — Feature Spec (#27)
**Status:** Spec complete, ready for dev sprint-by-sprint
**Architect:** Session 166 (2026-03-15)
**Scope:** #27 Listing Factory + optional fold-ins #31 Brand Kit, #64 Condition Grading
**Estimate:** 3 sprints (Sprint 1 + Sprint 2 can overlap; Sprint 3 sequential)

---

## Design Decisions (Locked — Session 155)

- **Tag vocabulary:** Curated 30–50 core tags + 1 free-form custom slot per item. AI suggests from curated list. Quarterly review.
- **Health score gate:** Block publishing < 40 (no photo or title). Nudge 40–70. Free above 70. Progress bar UX, never punitive.
- **Social templates:** Auto-fill v1. Three tone options: Casual, Professional, Friendly. WYSIWYG editor deferred to post-beta.
- **Watermarking:** On-demand Cloudinary overlay transform only. Primary photo. No batch job.

---

## Architecture Overview

Six workstreams across 3 sprints. No new top-level models required for sprints 1–2. Sprint 3 optional migrations for #31 and #64 only.

```
Sprint 1 (Foundation): AI Tag Suggestion + Listing Health Score
Sprint 2 (Distribution): Photo Watermarking + Exports + Social Templates
Sprint 3 (Discovery): SEO Landing Pages + optional #31 Brand Kit + optional #64 Condition Grading
```

Cross-layer contracts defined per sprint below. Dev builds sprint-by-sprint — no sprint should begin until the previous one has passed QA.

---

## Sprint 1 — AI Tags + Health Score

### Schema Changes: None

Item already has `tags String[]`. Health score is computed, not persisted. No migration needed.

### Tag Vocabulary

Define as a constant in `packages/shared/src/constants/tagVocabulary.ts`:

```typescript
export const CURATED_TAGS = [
  // Style / Era (15)
  "mid-century-modern", "art-deco", "victorian", "craftsman", "industrial",
  "farmhouse", "bohemian", "danish-modern", "scandinavian", "atomic-age",
  "hollywood-regency", "arts-and-crafts", "colonial", "transitional", "contemporary",
  // Material (10)
  "walnut", "oak", "teak", "brass", "cast-iron",
  "wicker", "leather", "ceramic", "glass", "chrome",
  // Item Type Modifiers (10)
  "hand-painted", "signed", "original", "limited-edition", "first-edition",
  "handmade", "restored", "vintage-1950s", "vintage-1960s", "vintage-1970s",
  // Category Helpers (10)
  "collectible", "antique", "sterling-silver", "costume-jewelry", "fine-art",
  "folk-art", "architectural-salvage", "garden-decor", "holiday-decor", "musical"
] as const;

export const MAX_CUSTOM_TAGS = 1; // 1 free-form slot per item
```

Total: 45 curated tags. Quarterly review process owned by Patrick.

### AI Tag Suggestion — Backend

**Modify existing:** `cloudAIService.ts` → `processRapidDraft()`

Add tag suggestion step to the existing AI chain:
1. After Vision API returns labels, pass them to Haiku with the curated vocabulary.
2. Haiku maps Vision labels → closest curated tags (return 3–5 suggestions max).
3. Returned as `suggestedTags: string[]` alongside existing draft fields.

**No new endpoint.** Tag suggestions ride the existing Rapidfire draft response.

**Response shape addition to processRapidDraft:**
```typescript
// Add to existing RapidDraftResult type in shared/
suggestedTags: string[]  // max 5, all from CURATED_TAGS
```

**Haiku prompt snippet** (add to existing cloudAIService.ts prompt):
```
Given these visual labels: [labels], suggest up to 5 tags from this vocabulary: [CURATED_TAGS].
Return only tags that are visually evident. Return as JSON array.
```

### Tag Editing UI — Frontend

**Modify existing:** `packages/frontend/pages/organizer/add-items/[saleId]/review.tsx`

In the item edit panel (already built), add a **Tag Picker** section:
- Show AI-suggested tags (highlighted with "AI" badge), pre-checked if `suggestedTags` present
- Show full curated tag list as scrollable chip grid (3-col on mobile, 5-col on desktop)
- Max 5 curated tags selectable per item (soft limit, warn if exceeded)
- 1 free-form text input slot ("Add a custom tag...")
- Persist via existing `PATCH /api/items/:id` endpoint (itemController.ts already handles `tags` field update)

**No new backend endpoint needed.** Tag array saved as part of standard item update.

### Listing Health Score — Backend

**New utility:** `packages/backend/src/utils/listingHealthScore.ts`

```typescript
interface HealthBreakdown {
  photo: number;      // 0-40
  title: number;      // 0-20
  description: number; // 0-20
  tags: number;       // 0-15
  price: number;      // 0-5
}

interface HealthResult {
  score: number;  // 0-100
  grade: 'blocked' | 'nudge' | 'clear';
  breakdown: HealthBreakdown;
}

export function computeHealthScore(item: ItemDraft): HealthResult
```

**Scoring algorithm:**
| Factor | Points |
|--------|--------|
| 0 photos | 0 |
| 1 photo | 25 |
| 2–3 photos | 35 |
| 4+ photos | 40 |
| No title | 0 |
| Title < 15 chars | 10 |
| Title ≥ 15 chars | 20 |
| No description | 0 |
| Description < 50 chars | 10 |
| Description ≥ 50 chars | 20 |
| 0 tags | 0 |
| 1–2 tags | 7 |
| 3+ tags | 15 |
| No price | 0 |
| Price set | 5 |

**Gate logic:**
- `score < 40` → `blocked` — cannot publish, show error: "Add at least one photo and a descriptive title to publish."
- `40 ≤ score < 70` → `nudge` — amber bar, show top 1 improvement tip
- `score ≥ 70` → `clear` — green bar, ready to publish

**Expose on existing endpoint:** Modify `getDraftItemsBySaleId` in itemController.ts to include `healthScore` in the returned item objects (computed server-side using utility).

### Health Score UI — Frontend

**Modify existing:** `review.tsx` item cards

In each item card (collapsed row), show a thin colored progress bar beneath the item title:
- Red bar if blocked (< 40) — publish button disabled for this item
- Amber bar if nudge (40–70) — publish allowed but badge shown
- Green bar if clear (≥ 70) — clean indicator

Tooltip on hover: shows breakdown ("Add 2 more photos to reach Green").

**Bulk bar enhancement:** Show aggregate health (e.g., "8 of 12 items are green — 4 need attention").

---

## Sprint 2 — Watermarking, Exports, Social Templates

### Schema Changes: None

All operations are stateless. Watermarking is a Cloudinary transform. Exports and social templates are generated endpoints.

### Photo Watermarking — Backend

**New utility:** `packages/backend/src/utils/watermark.ts`

```typescript
export function applyWatermark(cloudinaryPublicId: string, organizer: OrganizerProfile): string
```

Uses Cloudinary URL transformation to overlay organizer name + sale title on primary photo:
```
/l_text:Arial_24_bold:{organizer.businessName},g_south_east,x_10,y_10,co_white,o_70/
```

If organizer has a `brandLogoUrl` (Sprint 3 Brand Kit), overlay logo instead of text.

**Integration point:** Called in `cloudAIService.ts` when returning item photo URLs for published items. Watermark is a display transform only — original Cloudinary asset is never modified.

**No new endpoint.** Watermarked URLs are generated on-demand from existing photo URL generation paths.

### Export Packages — Backend

**New controller:** `packages/backend/src/controllers/exportController.ts`

**New routes:** Add to `packages/backend/src/routes/` as `export.ts`

**Endpoints:**

```
GET /api/sales/:saleId/export?format=estateSalesNet   → CSV download
GET /api/sales/:saleId/export?format=facebook         → JSON (or structured text)
GET /api/sales/:saleId/export?format=craigslist       → Plain text block
```

Auth: organizer must own the sale.

**EstateSales.NET CSV format** (per their import spec):
```
Title,Description,Price,Category,Condition,Photo URL 1,Photo URL 2,Tags
```
Include all PUBLISHED items in the sale. Max 5 photo URLs per row.

**Facebook Marketplace format** (JSON):
```json
{
  "title": "...",
  "price": 45.00,
  "category": "Home & Garden",
  "description": "...",
  "photos": ["url1", "url2"],
  "tags": ["mid-century-modern", "walnut"]
}
```
Returns array of items. User copies/pastes or uses FB's bulk import CSV (same structure as EstateSales.NET export).

**Craigslist text block:**
```
[Item Title] - $[price]
[Description]
Tags: [tags joined with spaces, no hyphens]
Photo: [first photo URL]
---
```
Returns full multi-item text block for paste into Craigslist ad body.

**Response headers for CSV:** `Content-Disposition: attachment; filename="[saleName]-export.csv"`

### Social Media Templates — Backend

**New endpoint** (add to existing itemController.ts or new socialController.ts):

```
GET /api/items/:id/social-template?tone=casual&platform=instagram
```

**Tones:** `casual` | `professional` | `friendly`
**Platforms:** `instagram` | `facebook` (different char limits + hashtag conventions)

**Response:**
```typescript
{
  text: string;       // Platform-formatted post text
  hashtags: string[]; // Auto-generated from item.tags + category
  charCount: number;  // To warn if over platform limit
}
```

**Tone templates** (Haiku-generated on demand, not stored):

Casual: "Found this beauty 👀 [title] at our upcoming estate sale — [sale dates], [city]! [price] and it won't last. Link in bio to see more."

Professional: "Now available: [title] — [condition condition], priced at [price]. Browse the full collection at our upcoming estate sale [sale dates] in [city]."

Friendly: "Hey friends! 😊 This gorgeous [title] is waiting for a new home at our sale [sale dates] in [city]. Stop by and say hi — it's [price]!"

**Hashtag generation:** Map `item.tags` → `#mid-century-modern` + add platform-standard tags: `#estatesale #thrifting #[city]estatesale #[category]`

### Social Template UI — Frontend

**New page:** `packages/frontend/pages/organizer/sales/[id]/promote.tsx`

Or add a "Promote" tab to existing sale management pages.

**Features:**
- Item picker (dropdown or grid, select which item to promote)
- Tone selector (3 chips: Casual / Professional / Friendly)
- Platform selector (Instagram / Facebook)
- Live preview of generated post
- Copy to clipboard button
- Display suggested hashtags separately (organizer can edit before copying)

**One-click share:** Not in v1 (requires OAuth to organizer's social accounts). Clipboard copy is v1. Deep-link to pre-fill Facebook post is a v1.5 option (no OAuth needed).

---

## Sprint 3 — SEO Landing Pages + Optional #31/#64

### Tag-Based SEO Landing Pages

**New frontend pages:** `packages/frontend/pages/tags/[slug].tsx`

**Rendering:** ISR (`getStaticProps` + `getStaticPaths` with `fallback: 'blocking'`)
- `getStaticPaths`: Fetch top 20 tags by item count at build time
- `fallback: 'blocking'`: Generates on first request for remaining tags
- `revalidate: 3600` (1-hour ISR cache)

**New backend endpoint:**
```
GET /api/tags/[slug]/items?page=1&limit=24
```
Returns: `{ tag: string, itemCount: number, items: PublishedItem[], sales: SaleSummary[] }`

**New backend endpoint for sitemap:**
```
GET /api/tags/popular
```
Returns: `{ tags: Array<{ slug: string, count: number }> }` — used by next-sitemap config

**SEO metadata per page:**
```
Title: "[slug] for sale | FindA.Sale"
Description: "Browse [count] [slug] items available at estate sales near you. Updated weekly."
OG image: First item photo with Cloudinary transform
```

**JSON-LD schema:** `ItemList` schema with first 10 items.

**Sitemap update:** Add `getServerSideProps` to `next-sitemap.config.js` to include all active tag slugs.

**URL design:** `/tags/mid-century-modern` (lowercase, hyphenated — matches CURATED_TAGS format exactly). Custom tags from free-form slots are excluded from SEO pages initially (quality control).

---

## Optional: #64 Condition Grading (Fold-In Decision)

Recommend folding into Sprint 1, as it pairs naturally with the tag picker UI.

### Schema Change: Additive

```prisma
model Item {
  // ...existing fields...
  conditionGrade String?  // S | A | B | C | D — null for items not yet graded
}
```

**Migration file:** `20260315_add_condition_grade_to_item`

```sql
ALTER TABLE "Item" ADD COLUMN "conditionGrade" TEXT;
```

No index needed (not a filter field at this stage).

**Rollback:**
```sql
ALTER TABLE "Item" DROP COLUMN "conditionGrade";
```

**Note:** The existing `condition` field (`mint | excellent | good | fair | poor`) coexists. Condition Grading is additive — the old field remains for backward compat. Organizers may set either or both.

**Grade definitions (displayed in UI):**
- S: Like new / pristine, no visible wear
- A: Excellent, minor traces of use
- B: Good, some wear but fully functional
- C: Fair, visible wear or minor damage
- D: Poor, significant damage or for parts

**AI suggestion integration:** In processRapidDraft, Haiku assesses photo and suggests a grade. Organizer must confirm.

**Health score update:** `conditionGrade` set = +5 points (add to score algorithm above).

---

## Optional: #31 Brand Kit (Fold-In Decision)

Recommend deferring to Sprint 3 or a standalone session. Lower priority than SEO pages for beta.

### Schema Change: Additive on Organizer

```prisma
model Organizer {
  // ...existing fields...
  brandLogoUrl       String?   // Cloudinary URL for organizer logo
  brandPrimaryColor  String?   // Hex e.g. "#2563EB"
  brandSecondaryColor String?  // Hex e.g. "#1E40AF"
}
```

**Migration file:** `20260315_add_brand_kit_to_organizer`

```sql
ALTER TABLE "Organizer"
  ADD COLUMN "brandLogoUrl" TEXT,
  ADD COLUMN "brandPrimaryColor" VARCHAR(7),
  ADD COLUMN "brandSecondaryColor" VARCHAR(7);
```

**Rollback:**
```sql
ALTER TABLE "Organizer"
  DROP COLUMN "brandLogoUrl",
  DROP COLUMN "brandPrimaryColor",
  DROP COLUMN "brandSecondaryColor";
```

**Integration points once built:**
- Watermark utility uses `brandLogoUrl` instead of text overlay
- Social templates include brand colors in OG image generation
- Export CSVs include brand attribution in footer row

---

## Layer Responsibilities

| Layer | Sprint 1 | Sprint 2 | Sprint 3 |
|-------|---------|---------|----------|
| **shared** | `tagVocabulary.ts` constant, `RapidDraftResult` type extension | `ExportFormat` type | `TagPage` type |
| **backend** | `listingHealthScore.ts` utility, `processRapidDraft` tag suggestion | `exportController.ts`, social template endpoint, `watermark.ts` | `tags/[slug]` API endpoints |
| **frontend** | Tag picker in `review.tsx`, health bar in review.tsx | `promote.tsx` social template page | `pages/tags/[slug].tsx`, sitemap update |
| **database** | None | None | Optional migrations for #64/#31 |

---

## Implementation Order (Per Sprint)

### Sprint 1 Order:
1. `packages/shared/src/constants/tagVocabulary.ts` — define constant, export type
2. `packages/backend/src/utils/listingHealthScore.ts` — utility + algorithm
3. `packages/backend/src/services/cloudAIService.ts` — add Haiku tag suggestion step
4. `packages/backend/src/controllers/itemController.ts` — include `suggestedTags` + `healthScore` in getDraftItemsBySaleId response
5. `packages/frontend/pages/organizer/add-items/[saleId]/review.tsx` — tag picker UI + health bar UI
6. QA: verify tag suggestions appear in Rapidfire, health score gates work, tag save persists

### Sprint 2 Order:
1. `packages/backend/src/utils/watermark.ts` — Cloudinary overlay utility
2. `packages/backend/src/controllers/exportController.ts` + routes — 3 export formats
3. `packages/backend/src/controllers/socialController.ts` (or add to itemController) — social template endpoint
4. `packages/frontend/pages/organizer/sales/[id]/promote.tsx` — social template UI
5. Wire watermark into existing photo URL generation (cloudAIService or itemController)
6. QA: test all 3 export formats, social template generation at all tones, watermark applied

### Sprint 3 Order:
1. `GET /api/tags/[slug]/items` + `GET /api/tags/popular` endpoints
2. `packages/frontend/pages/tags/[slug].tsx` — ISR page
3. `next-sitemap.config.js` — add tag slugs
4. (If #64 approved) migration + conditionGrade field + UI + AI integration
5. (If #31 approved) migration + brand kit fields + settings page section
6. QA: ISR works, tag pages indexed, sitemaps include tags

---

## Flagged for Patrick

1. **`claude_docs/features/` doesn't exist.** Spec saved to `claude_docs/feature-notes/` (correct per file-creation-schema). No action needed unless you want a dedicated `features/` directory — requires your explicit approval to create.
2. **#64 Condition Grading fold-in:** Schema is additive and clean. Recommend YES — ships naturally with Sprint 1 tag picker. Adds one migration.
3. **#31 Brand Kit fold-in:** More work, lower immediate beta value. Recommend deferring to a standalone session after Listing Factory core ships. Watermarking in Sprint 2 uses organizer name (text) until Brand Kit builds the logo overlay.
4. **EstateSales.NET import format:** This spec uses a reasonable CSV format but the actual import spec should be confirmed against EstateSales.NET's current documentation before Sprint 2 dev begins.
5. **Social template one-click share:** Not in v1 (clipboard only). Upgrade to Facebook Graph API auto-post requires OAuth scope and app review — flag if you want that in v2.
6. **Brand Voice session:** roadmap.md calls for a Brand Voice session before Listing Factory ships. Social templates (Sprint 2) will be better if brand voice is documented first. Recommend running that session before Sprint 2 starts.

---

## Context Checkpoint: yes
