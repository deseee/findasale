# Phase 2 Feature Pipeline — Dev Readiness Assessment
**Date:** 2026-03-06
**Scope:** Technical feasibility review for Phase 2 features (AI Description Writer, Branded Social Templates, Shopper Loyalty Program, Search by Item Type)
**Status:** Research only — no code changes made.

---

## Executive Summary

**Go / No-Go Status:** 3 of 4 features ready to sprint. 1 feature (Shopper Loyalty Program) requires schema prep work before sprint starts.

| Feature | Status | Complexity | Blocker |
|---------|--------|-----------|---------|
| AI Sale Description Writer | GO | Medium | None — full infra exists |
| Branded Social Templates | GO | Medium | None — Cloudinary + social routes ready |
| Shopper Loyalty Program | PREPARE FIRST | Medium | Schema design needed; no coupon/discount models exist |
| Search by Item Type | GO | Medium | None — search + category API exists |

---

## Feature-by-Feature Assessment

### 1. AI Sale Description Writer

**Research Claim:** "80% of infrastructure exists in `cloudAIService.ts`"

**Actual State:** VERIFIED ✓

**What Exists:**
- `cloudAIService.ts` at `/sessions/dreamy-zen-knuth/mnt/FindaSale/packages/backend/src/services/cloudAIService.ts` — complete, production-ready service
- Google Vision API integration for label/object detection (lines 64–88)
- Claude Haiku structured JSON analysis for items (lines 92–163)
- Both APIs check for environment variable presence: `isCloudAIAvailable()` function (lines 57–60)
- Service returns `AITagResult` type: title, description, category, condition, suggestedPrice, tags
- Graceful fallback to Ollama if cloud AI unavailable (line 182)
- Price suggestion API also present (lines 198–301) using Claude Haiku with comparables support

**What's Missing:**
- No dedicated "sale description writer" endpoint — currently only item-level analysis exists
- Need to extend Claude Haiku prompt to handle full-sale-level descriptions (multi-item synthesis, merchandising narrative)
- No API endpoint in `routes/` to call description generation; `socialPostController.ts` exists but is for social posts, not sale descriptions
- Need to add `/api/sales/:id/generate-description` endpoint or similar

**Estimated True Complexity:** 1 sprint (low-medium)
- Reuse existing Claude Haiku integration
- New endpoint + minimal schema changes (add `aiGeneratedDescription` field to Sale or leave as transient)
- Organizer UI to trigger + edit + accept/dismiss feedback

**Prerequisites:** None beyond env vars (ANTHROPIC_API_KEY, GOOGLE_VISION_API_KEY)

**Notes:**
- Research correctly identified this as "low build cost" — the hard work (Vision + Haiku integration) is already done
- Key differentiator: free vs. MaxSold's paid tier is real and valuable

---

### 2. Branded Social Templates

**Research Claim:** "Cloudinary transformations + existing QR code + socialPostController.ts"

**Actual State:** PARTIALLY VERIFIED — components exist but integration needed

**What Exists:**
- `socialPostController.ts` at `/sessions/dreamy-zen-knuth/mnt/FindaSale/packages/backend/src/controllers/socialPostController.ts` (lines 7–79) — generates platform-specific social posts (Instagram, Facebook, Nextdoor)
- Route handler at `routes/socialPost.ts` — POST `/api/social-posts/generate` (authenticated)
- Cloudinary configured in `uploadController.ts` (line 7: `import { v2 as cloudinary } from 'cloudinary'`)
- Cloudinary credentials in env: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (confirmed in `.env.example`)
- Eager transforms already defined for images (lines 22–29 in uploadController.ts): thumbnail, optimized, full-res variants
- No QR code generation code found in social post controller — need to verify if QR exists elsewhere

**What's Missing:**
- No QR code generation logic in `socialPostController.ts` — research claims "existing QR code" but not visible in social post flow
- No watermarking/branding transformation using Cloudinary API (e.g., adding FindA.Sale logo to generated images)
- No image generation endpoint (currently only text posts returned by Claude Haiku)
- Cloudinary has native transformation API for overlays/watermarks (`angle`, `overlay`, `gravity`), but not wired into social post flow

**Estimated True Complexity:** 1 sprint (low-medium)
- Generate QR code (need to search for qrcode library or add one)
- Create Cloudinary transformation URL that overlays QR + FindA.Sale branding
- Wire into social post generation: return image URL + post text instead of text alone
- Add frontend to display/copy shareable image

**Prerequisites:**
- QR code library (likely `qrcode` npm package — standard choice)
- Clarify branding: logo file, placement, size, opacity

**Known Unknowns:**
- Where is QR code currently generated? Search didn't find it in routes/. May already exist in frontend or a separate service.
- Image generation service — is there an existing pattern for generating images server-side (e.g., html2canvas, sharp)?

**Notes:**
- Research correctly identified Cloudinary transformations as "trivial to add" — the API supports this natively
- Viral marketing angle (FindA.Sale branding on competitor sites) is solid and differentiates from MaxSold

---

### 3. Shopper Loyalty Program

**Research Claim:** "Thank-you coupons, coupon tracking, email integration"

**Actual State:** SCHEMA MISSING — feature cannot start without prep work

**What Doesn't Exist:**
- No `Coupon` model in schema
- No `Discount` model in schema
- No loyalty-tier tracking models
- FlashDeal model exists (line 515–526) for time-limited discounts, but this is item-level, not user-level loyalty
- User has `points` field (line 18 in schema) and `PointsTransaction` model (line 366–376), but these track engagement points, not redeemable coupons/store credit
- User has `shopperCredits` field (line 78) for referral store credit, but no system to issue or redeem coupons tied to purchases/loyalty tiers

**What Exists (Partial):**
- Email infrastructure assumed to exist (referenced in other models like UnsubscribeToken, email opt-out)
- Points/credits framework: `PointsTransaction` logs, `User.points`, `User.shopperCredits` — could be extended
- OrganizerReferral model (line 697–709) shows precedent for crediting amounts to organizers
- Referral model (line 311–320) shows shopper referral tracking

**What Needs to Be Designed:**
1. **Coupon/Loyalty Schema Models:**
   - `Coupon` (id, code, discountType, discountValue, expiresAt, maxUses, currentUses, issuedAt)
   - `CouponIssue` (couponId, userId, issuedAt, redeemedAt, status) — track per-user coupon distribution
   - Or: `LoyaltyTransaction` (userId, type: "purchase" | "referral" | "thank_you", creditAmount, expiresAt)

2. **Integration Points:**
   - Purchase model needs reference to coupon applied
   - New endpoint to issue coupons (admin/organizer triggered)
   - Checkout flow needs coupon validation + redemption
   - Email trigger on purchase → send thank-you coupon

3. **Business Logic:**
   - When to issue? After purchase? After N purchases? Referral bonus?
   - Expiration policy?
   - Store credit vs. coupon code?

**Estimated True Complexity:** 1 sprint (medium)
- Once schema is approved: ~3–5 new models
- Backend: coupon CRUD, validation, redemption logic
- Frontend: coupon entry at checkout, dashboard to view active coupons
- Email: thank-you coupon issuance template

**Blocker Status:** CANNOT START without schema design + Architect sign-off
- Schema changes require migration
- Feature depends on `User → Coupon` relationship design decision (1-to-many? many-to-many?)

**Prerequisites:**
1. **MUST DO BEFORE SPRINT:** Architect design meeting
   - Decide: coupon codes vs. automatic store credit?
   - Decide: who issues coupons (system, organizer, admin)?
   - Decide: expiration + reusability rules
2. Create schema migration + new models
3. Finalize email template (send on purchase, confirm redemption)

**Notes:**
- Research mentions "thank-you coupons" — this suggests auto-issue on purchase, not referral-based
- No existing discount or loyalty infrastructure suggests this is net-new work, not extending existing patterns
- Schema risk: moderate. Data integrity risk: high (coupon redemption is transactional)

---

### 4. Search by Item Type (Search by Category)

**Research Claim:** "Index items, search UI, result optimization"

**Actual State:** MOSTLY COMPLETE — category search already exists

**What Exists:**
- `routes/search.ts` at `/sessions/dreamy-zen-knuth/mnt/FindaSale/packages/backend/src/routes/search.ts` — full-featured search
- **GET `/api/search?q=&type=all|sales|items&category=&...`** (line 9) — supports category filter
- **GET `/api/search/categories/:category?page=&limit=`** (line 158) — dedicated category browse endpoint
- Item model has `category` field (schema line 168): Furniture, Electronics, Clothing, Books, Kitchenware, Tools, Art, Jewelry, Toys, Sports, Collectibles, Glassware, Linens, Other
- Search filters already built: price, condition, saleStatus, sortBy (price_asc, price_desc, ending_soon, recent)
- Visual search also supports category (line 268 in search.ts)
- **SavedSearch model** (schema line 671–681) stores filter presets, including category
- No full-text search index (PostgreSQL uses ILIKE contains search, not trigram/FTS), but adequate for MVP

**What's Missing (Optimization Only):**
- No database index on `Item.category` — may slow search as inventory grows
- No aggregate endpoint for category popularity/trending
- No AI-powered "related categories" suggestions
- Frontend UI to browse categories (UI is frontend responsibility, not blocker here)
- Search quality: text search via ILIKE is O(n) — could add PostgreSQL tsvector index for full-text efficiency

**Estimated True Complexity:** < 1 sprint (low)
- Add database index: `@@index([category])` in schema (trivial)
- Category aggregate endpoint for UI: 1–2 hours
- Optimize search query if needed (depends on actual query performance in beta)

**Prerequisites:** None — search is functional now

**Known Unknowns:**
- What does "Search by Item Type" mean differently from current `/api/search/categories/:category`?
  - If it means faceted search / drill-down filtering, that's UI work only
  - If it means full-text search improvements, that's 1–2 days of tuning

**Notes:**
- Category browse already ship-ready
- This is less "feature" and more "polish existing feature"
- Research's claim of "2 sprints" seems high — current implementation covers 80%+ of the need
- Optimization work (index, query tuning, trending) is post-beta refinement, not blocking sprint start

---

## Pre-Sprint Prep Checklist

### Before Sprint Starts:

- [ ] **Loyalty Program (Feature 3):** Schedule Architect design session to finalize coupon schema. No sprint work starts until schema is approved and migration created.
- [ ] **AI Description Writer (Feature 1):** Confirm Anthropic API key is loaded in production. Verify Google Vision API quota is adequate for expected volume.
- [ ] **Social Templates (Feature 2):** Search codebase for QR code generation (may already exist). Clarify branding assets (logo, sizing).
- [ ] **Search by Item Type (Feature 4):** No action needed — ready to sprint. Consider adding category index to schema for performance, but not blocking.

### Env Vars Needed:
- Feature 1: `ANTHROPIC_API_KEY` (already in use by socialPostController)
- Feature 1: `GOOGLE_VISION_API_KEY` (already in use by cloudAIService)
- Feature 2: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (already configured)
- Feature 3: None until schema is designed

### Sprint Planning Notes:
1. **Dependency order:** Feature 3 (Loyalty) must wait for schema → start Feature 1, 2, 4 in parallel
2. **Feature 1 + 2 can run in parallel** — both use Claude Haiku, no conflicts
3. **Feature 4 can start immediately** — only polish, no blockers
4. **Risk:** Feature 2 (QR code) if QR generation doesn't already exist somewhere in the codebase

---

## Schema Changes Needed

### Required (Blocking):
- **Feature 3 (Loyalty):** 3–5 new models (coupon, coupon issue, transaction, etc.) — must be designed + approved before sprint

### Recommended (Non-Blocking):
- **Feature 4 (Search):** Add index to `Item.category` for performance
- **Feature 1 (Description):** Optional field on `Sale` model for `aiGeneratedDescription`, or keep as transient (no schema change)

---

## Risk Summary

| Feature | Risk Level | Issue | Mitigation |
|---------|-----------|-------|-----------|
| AI Sale Description Writer | Low | None | None |
| Branded Social Templates | Medium | QR code location unknown | Verify QR generation exists before sprint kickoff |
| Shopper Loyalty Program | High | Schema missing | Schedule Architect design ASAP; don't start sprint until schema approved |
| Search by Item Type | Low | Performance (optional) | Add category index to schema; can defer post-beta |

---

## Conclusion

**Ready to Sprint:** Features 1, 2, 4 can start immediately after Loyalty schema design is finalized (Feature 3).

**Go-No-Go Recommendation:**
- **GO** on Features 1, 2, 4 after QR code verification (Feature 2).
- **PREPARE** Feature 3 schema before starting Feature 3 implementation.
- **Estimate:** 6–8 weeks for all 4 features (parallel work on 1, 2, 4 + sequential prep/sprint for 3).
