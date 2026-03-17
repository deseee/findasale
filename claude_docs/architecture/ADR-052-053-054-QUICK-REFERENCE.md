# ADR-052-053-054 Quick Reference

**Date:** 2026-03-17
**Status:** Design Complete

---

## Summary

Three Phase 5+ features designed and architecture locked.

| Feature | Type | Tier | Sprints | Status |
|---------|------|------|---------|--------|
| #52 Estate Sale Encyclopedia | Knowledge Base | FREE | 3 | ✅ Ready for Dev |
| #53 Cross-Platform Aggregator | Search Aggregation | TEAMS | 2 | 🔴 BLOCKED — Legal Review |
| #54 Crowdsourced Appraisal API | Valuation Service | PAID_ADDON | 2.5 | ✅ Ready for Dev |

---

## #52: Estate Sale Encyclopedia

**What:** Crowdsourced knowledge base with item guides, price benchmarks, era/style references.

**Why:** Long-tail SEO moat. Organic discovery driver. Community content reduces FindA.Sale creation burden.

**Revenue:** Organic traffic → discovery. Future sponsored entries + API licensing.

**Scope (3 sprints):**
- Sprint 1: Schema + service + API routes (EncyclopediaEntry, Revision, PriceBenchmark, Reference)
- Sprint 2: Frontend list/detail pages (ISR), Markdown rendering
- Sprint 3: Submission + moderation queue, full-text search, sitemap

**Key Schema Models:**
- `EncyclopediaEntry` (slug, title, content, category, tags, status, viewCount, helpfulCount)
- `EncyclopediaRevision` (versioning history)
- `PriceBenchmark` (condition, region, priceRange, dataSource)
- `EncyclopediaReference` (external links)

**Key Routes:**
- GET /api/encyclopedia/entries (list, search, filter)
- GET /api/encyclopedia/entries/:slug (detail + ISR)
- POST /api/encyclopedia/entries (user submission → review queue)
- POST /api/encyclopedia/entries/:slug/vote (helpful votes)

**Files:** 4 schema models, 2 migrations, 3 routes, 3 frontend components

**Risk:** Low. Read-heavy, no payment, moderation gate on submissions.

---

## #53: Cross-Platform Aggregator

**Status:** 🔴 **BLOCKED** — Legal Review Required

**What:** Unified search aggregating listings from EstateSales.NET, Craigslist, Facebook Marketplace.

**Why Blocked:**
- Scraping EstateSales.NET/Craigslist ToS → legal liability (hiQ Labs precedent)
- Facebook Marketplace scraping violates Meta ToS + GDPR/CCPA
- Personal data (names, contacts) collection = regulatory risk

**Recommendation:** DEFER to Q4 2026. If strategically necessary, pursue partnership model:
1. Contact EstateSales.NET directly for API access
2. Negotiate RSS feed rights or affiliate model
3. No scraping = no legal risk

**Scope (if approved):**
- 2 sprints for partnership-based aggregation
- Data normalization layer
- Unified search display with source attribution

**Decision:** Mark as Q4 2026 (deferred). Do NOT implement scraping-based approach.

---

## #54: Crowdsourced Appraisal API

**What:** Users submit photos → community estimates + optional paid AI appraisal (Claude Haiku vision).

**Why:** Revenue stream ($2–5/appraisal = $10–30k/year). Shopper engagement. Organizer value (find underpriced items).

**Revenue Model:**
- Free: Community appraisals (gamified, helpfulness voting)
- Paid: AI appraisal $2–5 per request (Stripe)
- Future: API licensing to external dealers/auctioneers

**Scope (2.5 sprints):**
- Sprint 1: Schema + service + API routes + Stripe integration
- Sprint 2: Frontend submit form + results view + Stripe checkout
- Sprint 3 (async): Webhook handler → Claude Haiku vision job

**Key Schema Models:**
- `AppraisalRequest` (photos[], status, expiresAt)
- `AppraisalResponse` (community estimate + reasoning)
- `AppraisalConsensus` (final estimate, confidenceScore 0–100, methodology)
- `AppraisalAIRequest` (payment tracking, Stripe intent)
- `AppraisalDispute` (dispute resolution)

**Key Routes:**
- POST /api/appraisals (submit request + photos)
- GET /api/appraisals/:id (fetch with all responses + consensus)
- POST /api/appraisals/:id/responses (community estimate)
- POST /api/appraisals/:id/ai-appraisal (payment + trigger analysis)
- POST /api/appraisals/:id/responses/:responseId/vote (community voting)

**Workflow:**
1. Shopper snaps 1–5 photos, fills item title
2. Submit → status PENDING
3. Community appraisers see request, submit estimates + reasoning
4. After 5+ responses → consensus calculated (median estimate, confidence score)
5. Shopper can optionally pay $2–5 for AI appraisal
6. AI analysis via Claude Haiku vision + benchmark cross-reference
7. Both community + AI estimates shown side-by-side

**Consensus Logic:**
- Estimate: median of all community responses
- Confidence: `(responseCount - 5) * 5` capped at 100
- Ranking: sort by helpfulness votes, hide low-quality responses

**AI Integration:**
- Stripe webhook → async job
- Claude Haiku analyzes photos
- Cross-reference EncyclopediaEntry benchmarks for item category
- Return estimate + confidence to consensus
- Frontend polls for status

**Files:** 5 schema models, 2 migrations, 4 routes, 4 frontend components

**Risk:** Medium. Payment flow + AI analysis accuracy. Mitigations: always show confidence, community votes first, paid appraisal is optional.

---

## Migrations

### #52 Encyclopedia

**File:** `20260317001300_add_encyclopedia`

```sql
CREATE TABLE "EncyclopediaEntry" (...)
CREATE TABLE "EncyclopediaRevision" (...)
CREATE TABLE "PriceBenchmark" (...)
CREATE TABLE "EncyclopediaReference" (...)
CREATE INDEX idx_encyclopedia_category ON "EncyclopediaEntry"(category)
-- Plus 3 more indexes
```

### #54 Appraisal

**File:** `20260317001400_add_appraisals`

```sql
CREATE TABLE "AppraisalRequest" (...)
CREATE TABLE "AppraisalPhoto" (...)
CREATE TABLE "AppraisalResponse" (...)
CREATE TABLE "AppraisalConsensus" (...)
CREATE TABLE "AppraisalAIRequest" (...)
CREATE TABLE "AppraisalDispute" (...)
CREATE INDEX idx_appraisal_user ON "AppraisalRequest"(...)
-- Plus 5 more indexes
```

---

## Patrick Action Items

### Immediate (S190 Completion)
- [ ] Review ADR-052-053-054-ENCYCLOPEDIA-AGGREGATOR-APPRAISAL-SPEC.md
- [ ] Approve #52 and #54 for sprint planning
- [ ] Schedule legal review for #53 (recommend defer to Q4 2026)

### For #52 Sprint Planning
- Assign to findasale-dev once roadmap prioritized
- Plan 3 sprints: schema (1.5w), frontend (1w), submit+SEO (0.5w)

### For #54 Sprint Planning
- Assign to findasale-dev once roadmap prioritized
- Plan 2.5 sprints: schema+payment (1.5w), frontend (1w), webhook+AI (async)
- Verify Stripe webhook endpoint before going live

### For #53
- Schedule legal review with legal team
- Recommendation: Mark as DEFERRED Q4 2026
- If partnership model decided: approach EstateSales.NET directly for API discussion

---

## Cross-Layer Contracts

**Database → Backend:**
- Encyclopedia: Full-text indexes on content, slug uniqueness guaranteed
- Appraisal: RequestID uniqueness, photo count validated

**Backend → Frontend:**
- Encyclopedia: Entries fully rendered Markdown (server-side), paginated lists
- Appraisal: Requests + all responses + consensus fetched in single call, polling for async results

**Frontend Responsibility:**
- Encyclopedia: Render Markdown, handle no-JS fallback
- Appraisal: Photo upload (Cloudinary), Stripe checkout, real-time polling

---

## Constraints (Locked)

1. **No scraping** (#53) — Legal constraint, partnership model only
2. **Encyclopedia categories enum** — 15 categories, expandable later
3. **Appraisal pricing** — $2–5 range (volume optimization)
4. **No expert vetting phase 1** (#54) — Community consensus only; expert badge deferred

---

## Success Metrics

### #52 Encyclopedia
- 100+ entries within 6 months
- 500+ organic visits/month from Google by month 6
- 30% of item viewers click encyclopedia link

### #54 Appraisal
- 1,000+ requests/month by month 3
- 10% AI conversion = $100/month revenue by month 3
- 100+ active community appraisers

---

## Full Spec Location

📄 **ADR-052-053-054-ENCYCLOPEDIA-AGGREGATOR-APPRAISAL-SPEC.md** (1,001 lines, 32KB)

Contains: Executive summary, detailed design, API contracts, schema with indexes, migrations, rollback plans, cross-layer contracts, constraints, success metrics.

---

**Design complete. Ready for development dispatch.**
