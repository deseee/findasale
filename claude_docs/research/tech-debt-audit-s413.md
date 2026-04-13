# Tech Debt Audit — S413 (2026-04-07)

**Scope:** Full monorepo — 821 source files, 111 controllers, 107 route files, 476 frontend pages/components  
**Method:** Automated codebase scan + architectural analysis  
**Score formula:** Priority = (Impact + Risk) × (6 − Effort) — higher = fix sooner

---

## Priority Stack

| # | Item | Score | Category |
|---|------|-------|----------|
| 1 | Hardcoded Stripe price IDs | 40 | Code |
| 2 | Critical path test coverage (targeted) | 30 | Test |
| 3 | Account deletion unimplemented (GDPR) | 32 | Code / Legal |
| 4 | Condition constants: 6+ duplicate definitions | 28 | Code |
| 5 | Cron job duplicates + timing collision | 28 | Infra |
| 6 | Missing input validation on 5 route files | 24 | Code / Security |
| 7 | .env.example out of sync (12+ missing vars) | 25 | Infra / Docs |
| 8 | next/image migration (10 raw `<img>` tags) | 15 | Code |
| 9 | Business logic inside route files | 14 | Architecture |
| 10 | Oversized frontend pages (largest: 2,442 LOC) | 7 | Architecture |
| 11 | Oversized controllers (largest: 1,827 LOC) | 7 | Architecture |
| 12 | 508 `: any` TypeScript instances | 6 | Code |

---

## Findings Detail

### 1. Hardcoded Stripe Price IDs — Score: 40

**What:** `stripeController.ts` and `syncTier.ts` both hardcode Stripe price IDs (`price_1TDUQsLTUdEUnHOT...`) as string literals. Environment variables `STRIPE_PRO_MONTHLY_PRICE_ID` and `STRIPE_TEAMS_MONTHLY_PRICE_ID` already exist but aren't used.

**Why it matters:** If price IDs ever rotate (Stripe plan update, test→prod migration), two files need edits instead of one env var change. Price ID mismatch = silent billing failure.

**Fix:** 2 files, ~10 lines. Replace literals with `process.env.STRIPE_PRO_MONTHLY_PRICE_ID`. Already have env vars — just wire them.

**Effort:** 1 session, <20 lines total → can be done inline.

---

### 2. Account Deletion Unimplemented — Score: 32

**What:** `packages/frontend/pages/shopper/settings.tsx:459` has `// TODO: Implement account deletion`. Button exists in UI but does nothing.

**Why it matters:** GDPR "right to erasure" is a legal requirement for any product with EU users. A visible broken button also erodes user trust.

**Fix:** Backend deletion endpoint + frontend wiring. Medium complexity (cascade deletes, Stripe subscription cancel, Cloudinary cleanup).

**Effort:** 1–2 sessions.

---

### 3. Critical Path Test Coverage — Score: 30

**What:** 6 test files exist for 821 source files (0.73% coverage). Only 1 backend test found (`stripe.e2e.ts`). Zero frontend tests.

**Why it matters:** Every payment flow, auth flow, and auction close has zero test coverage. Regressions ship silently. The only safety net is manual QA.

**Fix:** Don't boil the ocean. Target the 4 highest-risk controllers first:
- `stripeController.ts` (payments — money)
- `authController.ts` (auth — account takeover risk)
- `auctionClosingService.ts` (auction finalization)
- `reservationController.ts` (hold logic)

Write integration tests against a test DB, not mocks (per CLAUDE.md mandate).

**Effort:** 2–3 sessions for the 4 critical paths. Full coverage is a long-term program.

---

### 4. Condition Constants Duplication — Score: 28

**What:** 6+ separate definitions of `CONDITIONS` arrays across the frontend, with inconsistent values and casing:

| File | Values |
|------|--------|
| `PreviewModal.tsx` | `['Excellent', 'Good', 'Fair', 'Poor']` |
| `FilterSidebar.tsx` | `['mint', 'excellent', 'good', 'fair', 'poor']` |
| `SmartInventoryUpload.tsx` | `['NEW', 'USED', 'REFURBISHED', 'PARTS_OR_REPAIR']` |
| `add-items/[saleId].tsx` | `['NEW', 'LIKE_NEW', 'USED', 'GOOD', 'FAIR', 'POOR', 'REFURBISHED', 'PARTS_OR_REPAIR']` |
| `add-items/review.tsx` | `CONDITIONS` + separate `CONDITION_MAP` |

These are already drifted (4 values vs. 8 values, mixed case). Any filter or display using the wrong definition shows incorrect options to users.

**Fix:** Single canonical `CONDITIONS` constant in `packages/frontend/lib/constants.ts` (or promote to shared package). Replace all 6 definitions with import.

**Effort:** 1 session.

---

### 5. Cron Job Duplicates + Timing Collision — Score: 28

**What:** 18 cron jobs total. Two specific problems:

1. **Duplicate auction jobs:** `auctionCloseCron.ts` and `auctionJob.ts` both run every 5 minutes. Both appear to process auction closes. Risk of double-processing bids.

2. **Monday 8 AM collision:** `curatorEmailJob.ts` and `organizerWeeklyDigestJob.ts` both fire at `0 8 * * 1`. Simultaneous bulk email sends = likely Resend rate-limit errors, emails dropped silently.

3. **FraudDetectionJob not wired:** `fraudDetectionJob.ts` has `// TODO: Integrate with node-cron` — the fraud detection logic exists but never runs.

**Fix:** Audit and merge the two auction jobs. Stagger Monday email jobs by 1 hour. Wire fraudDetectionJob to cron (1-line fix).

**Effort:** 1 session.

---

### 6. Missing Input Validation on Route Files — Score: 24

**What:** 5 route files use manual `if (!field)` checks instead of Zod schemas:
- `routes/contact.ts` — manual string checks
- `routes/auth.ts` — inline password validation
- `routes/organizers.ts` — no body validation on POST/PUT
- `routes/items.ts` — inline bulk-op validation
- `routes/search.ts` — inline filter parsing

**Why it matters:** Manual validation is inconsistent and easy to miss. Missing type coercion and sanitization. Auth route validation being manual is a security concern.

**Fix:** Add Zod schemas to these 5 files. Can reuse existing schema patterns from the other 85 route files that already use them.

**Effort:** 1 session.

---

### 7. `.env.example` Out of Sync — Score: 25

**What:** 12+ environment variables used in production code are missing from `.env.example`:
- `STRIPE_TRIAL_COUPON_ID`
- `AI_COST_CEILING_USD`
- `CLOUDINARY_AVG_IMAGE_SIZE_KB`
- `EBAY_DELETION_ENDPOINT_URL`, `EBAY_VERIFICATION_TOKEN`
- `GOOGLE_PLACES_API_KEY`
- `MAILERLITE_SHOPPERS_GROUP_ID`
- `OLLAMA_URL`, `OLLAMA_VISION_MODEL`
- `OSRM_API_URL`
- `RATE_LIMIT_WHITELIST_IPS`

Also: 8 geo-config vars in `.env.example` have zero usage in backend code (may be dead).

**Why it matters:** Any new environment (staging, a new developer, disaster recovery) would silently be missing production-required vars. Features fail without obvious error.

**Fix:** Sync `.env.example` with actual code. Mark legacy/optional vars clearly.

**Effort:** 1 hour, can be done inline.

---

### 8. next/image Migration — Score: 15

**What:** 10 raw `<img>` HTML tags instead of Next.js `<Image>` component:
- `HaulPostCard.tsx`, `HighValueTrackerWidget.tsx`, `InstallPrompt.tsx`
- `SaleQRCode.tsx` (×2 — but PDF context, legitimate exception)
- `add-items/[saleId].tsx`, `dashboard.tsx`, `print-kit/[saleId].tsx`
- `profile.tsx`, `shopper/history.tsx`

**Why it matters:** Raw `<img>` tags bypass Next.js lazy loading and WebP/AVIF optimization. Affects Core Web Vitals (LCP) and Vercel image bandwidth costs.

**Fix:** Mechanical swap to `<Image>` with appropriate `width`/`height` props. Skip `SaleQRCode.tsx` (PDF rendering context).

**Effort:** 1 session.

---

### 9. Business Logic Inside Route Files — Score: 14

**What:** Three route files contain substantial business logic that should live in controllers or services:
- `routes/organizers.ts` (1,117 lines) — revenue calculations, analytics aggregation inline
- `routes/search.ts` (482 lines) — full-text query building, filter parsing inline
- `routes/items.ts` (862 lines) — bulk operation validation inline

**Why it matters:** Violates the routing layer's responsibility (route → validate → hand off). Logic can't be reused or tested independently. Any route refactor requires touching business logic simultaneously.

**Fix:** Extract business logic to `services/` or `controllers/`. Routes become thin wrappers.

**Effort:** 3–4 sessions. This is structural — scope carefully before touching.

---

### 10. Oversized Frontend Pages — Score: 7

**What:** 24 pages exceed 400 lines; 3 exceed 1,000 lines:
- `add-items/[saleId].tsx` — 2,442 lines
- `organizer/pos.tsx` — 1,474 lines
- `add-items/review.tsx` — 1,465 lines

**Why it matters:** These are the most-used pages in the app. Any change to `add-items` risks regressions in the core organizer workflow. Component extraction would reduce surface area per change.

**Fix:** Extract sub-components and custom hooks. Don't rewrite — surgical extraction only.

**Effort:** 3–5 sessions per major page. Low urgency unless active regression pain.

---

### 11. Oversized Controllers — Score: 7

**What:** 5 controllers exceed 1,000 lines:
- `stripeController.ts` — 1,827 lines
- `itemController.ts` — 1,816 lines
- `saleController.ts` — 1,335 lines
- `reservationController.ts` — 1,311 lines
- `printKitController.ts` — 1,066 lines

These mix DB queries, business logic, email triggers, and external API calls.

**Fix:** Extract service layers (e.g., `stripeWebhookService.ts`, `itemPricingService.ts`). Low urgency — these work — but item #3 (test coverage) becomes much easier after extraction.

**Effort:** 2–3 sessions per controller. Defer until tests gate the refactor.

---

### 12. TypeScript `any` Sprawl — Score: 6

**What:** 508 instances of `: any` across the codebase — ~300 in backend, ~200 in frontend.

**Why it matters:** TypeScript can't catch type errors at `any` boundaries. Particularly risky on API response types (frontend assumes shape, backend changes it, no compile error).

**Fix:** Start at API boundaries: type the top 10 most-called API responses in `packages/shared/src/types/`. Don't attempt a wholesale sweep.

**Effort:** Ongoing, background task. 2–3 hours per API domain.

---

## Phased Remediation Plan

### Phase 1 — Quick wins (do alongside any session, <1 session each)

These are low-effort, high-value fixes. Any can be dispatched to `findasale-dev` as a small task.

1. Wire Stripe price IDs to env vars (2 files, ~10 lines)
2. Wire `fraudDetectionJob` to node-cron (1 line)
3. Stagger Monday 8 AM email jobs by 1 hour
4. Sync `.env.example` with actual codebase
5. Fix `healthController` and `viewerController` missing try/catch (2 files, ~5 lines each)

**Estimated total:** 1 focused session or folded into unrelated sessions as they touch nearby files.

---

### Phase 2 — Targeted sprints (1–2 sessions each, schedule deliberately)

6. Condition constants centralization
7. Cron job duplicate audit (merge auction jobs, verify no double-processing)
8. Missing Zod validation on 5 route files
9. next/image migration (10 files)
10. Account deletion implementation (backend endpoint + frontend wiring)

**Estimated total:** 4–5 sessions, can be parallelized.

---

### Phase 3 — Structural debt (multi-session, plan before executing)

11. Targeted tests for critical paths: `stripeController`, `authController`, `auctionClosingService`, `reservationController`
12. Extract business logic from `routes/organizers.ts`, `routes/search.ts`
13. Controller decomposition: start with `itemController.ts` (most-touched file)
14. Frontend page extraction: start with `add-items/[saleId].tsx` (core organizer workflow)

**Estimated total:** 8–12 sessions. Do not start Phase 3 until beta data collection is complete — refactoring during active feature development amplifies risk.

---

## Not Debt (Confirmed Good)

- Socket.io centralization — well-contained in `lib/socket.ts` ✓
- Raw SQL queries — only 5 instances, all parameterized, all justified ✓
- Dependency versions — current for 2026 (Next 14, React 18, Prisma 5, Express 4) ✓
- `@findasale/shared` import violations — down to 1 instance (migration nearly done) ✓
- Migration naming conventions — 151 migrations, consistent naming, no emergency hotfixes ✓
- Auth middleware — consistent `authenticate` + `requireTier` pattern across routes ✓

---

*Generated S413 · findasale-dev scan · 821 files · April 7, 2026*
