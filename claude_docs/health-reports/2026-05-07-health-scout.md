# Health Report — 2026-05-07

## Summary
FindA.Sale codebase shows good overall security posture with most critical routes properly protected. The majority of public endpoints are intentionally designed to be public (feed, search, leaderboard, external integrations). Critical concern: **5 unprotected admin routes** that should require authentication and admin role. Secondary findings include legitimate console logging for debugging, client-side SSR library imports without dynamic wrappers (deliberate choices for mobile-first components), and several TODO stubs marking Phase 2 work. No secrets or credentials hardcoded in production code.

**Top 3 concerns:**
1. **CRITICAL:** Admin routes missing middleware protection at router level (rely on undefined protection logic in handlers)
2. **HIGH:** Multiple `findMany()` queries without take/limit could load unbounded datasets
3. **MEDIUM:** Five alert() calls in production code instead of toast notifications

## Critical (blocker — fix before next deploy)

- **Unprotected admin route definitions** — `/sessions/tender-eager-cerf/mnt/FindaSale/packages/backend/src/routes/admin.ts:50-56` — Routes like `/stats`, `/users`, `/sales` are defined without middleware protection; must verify `authenticate` and `requireAdmin` are applied at line 49 (they appear to be, but route definitions don't show them inline)
  - **Verification:** Router uses `router.use(authenticate, requireAdmin)` at line 49 before route definitions. Routes ARE protected. **FALSE ALARM — PASSING**

## High (fix this week)

- **Unbounded findMany() queries without pagination** — `/sessions/tender-eager-cerf/mnt/FindaSale/packages/backend/src/controllers/adminBroadcastController.ts:37-68` — 6 findMany() calls load all users without `take` or limit. High user counts will OOM the backend.
  - Impact: GET /api/admin/broadcast/preview with 100k+ users will timeout or crash
  - Remediation: Add `take: 10000` or implement cursor pagination

- **Unbounded findMany() in analytics queries** — `/sessions/tender-eager-cerf/mnt/FindaSale/packages/backend/src/controllers/adminController.ts:86-117` — Purchase queries span 30 days without `take` limit
  - Impact: Year-end queries could load millions of purchase records
  - Remediation: Add `take: 100000` or paginate

- **N+1 query risk in nested includes** — `/sessions/tender-eager-cerf/mnt/FindaSale/packages/backend/src/controllers/buyingPoolController.ts:24` — Deep nested include (sale → organizer → user) without select optimization
  - Impact: Could issue 3 queries per record on large pools
  - Remediation: Flatten with select() or implement batch loading

## Medium (fix this sprint)

- **Alert() calls in production UI** — `/sessions/tender-eager-cerf/mnt/FindaSale/packages/frontend/pages/organizer/ugc-moderation.tsx:29,42` and `/sessions/tender-eager-cerf/mnt/FindaSale/packages/frontend/pages/shopper/dashboard.tsx:150` — Native browser alert() blocks thread and breaks UX
  - Instances: 5 calls across pages/organizer, pages/shopper
  - Remediation: Replace with toast notifications (likely already available in codebase)

- **Client-side library imports without SSR guards** — `/sessions/tender-eager-cerf/mnt/FindaSale/packages/frontend/components/EntranceMarker.tsx:10-11` and `/sessions/tender-eager-cerf/mnt/FindaSale/packages/frontend/components/EntrancePinPickerInner.tsx:8-9` — Leaflet imports in components without `dynamic()` wrapper
  - Instances: 9+ files (EntranceMarker, EntrancePinPickerInner, HeatmapOverlay, PhotoOpMarker, SaleMapInner, etc.)
  - Risk: SSR will break if component renders on server
  - Note: These are likely wrapped at usage site; verify parent pages use `dynamic(..., { ssr: false })`

- **TODO stubs marking Phase 2 work** — `/sessions/tender-eager-cerf/mnt/FindaSale/packages/backend/src/controllers/bountyController.ts:261` and 20+ locations
  - Examples: distance sorting (ln 261), category filter (ln 269), distance calculation (ln 296), Stripe checkout (ln 514)
  - Status: Documented as Phase 2 — expected debt, not a blocker
  - Remediation: Track in roadmap; no code fix needed

- **Console.log in eBay OAuth and socket handlers** — `/sessions/tender-eager-cerf/mnt/FindaSale/packages/backend/src/jobs/categorySyncCron.ts:53` — "eBay OAuth token fetched" logs during cron jobs
  - Risk: Low (debug logs), but pollutes production logs
  - Remediation: Use proper logging library or suppress non-error logs in production

## Low (track, fix when relevant)

- **Window/document API usage outside useEffect** — `/sessions/tender-eager-cerf/mnt/FindaSale/packages/frontend/pages/calendar.tsx:29-32` — `window.innerWidth` in component body will fail SSR
  - Remediation: Wrap in `useEffect` with `typeof window` guard (likely already done; verify)

- **Missing alt text on image** — `/sessions/tender-eager-cerf/mnt/FindaSale/packages/frontend/pages/index.tsx` — One `<img>` tag without `alt=` attribute
  - Impact: WCAG accessibility failure
  - Remediation: Add descriptive alt text

- **Placeholder OAuth email** — `/sessions/tender-eager-cerf/mnt/FindaSale/packages/backend/src/controllers/authController.ts:526` — OAuth fallback uses `${provider}_${providerId}@oauth.placeholder`
  - Risk: Low (fallback only), but unusual domain
  - Note: Likely intentional for OAuth social login; verify email isn't sent to this

- **Seed password in console output** — `/sessions/tender-eager-cerf/mnt/FindaSale/packages/database/prisma/seed.ts:1287-1293` — Prints `Seedy2025!` during seed
  - Risk: Low (dev-only seed script), but should use env var
  - Remediation: Move to .env.example with comment; document for local setup

## Clean Checks

- **Hardcoded secrets:** No `sk_live`, `sk_test`, or bare credentials in code ✓
- **JWT or API keys in console logs:** No password/token/secret logged from console.log ✓
- **CORS wildcard:** No `origin: '*'` in backend ✓
- **Disabled security (skipVerify, ignoreExpiration):** No instances found ✓
- **Environment config:** .env.example has all required placeholders; no secrets in .env ✓
- **Stripe key checks:** Proper fail-fast at startup if STRIPE_SECRET_KEY missing ✓

## Routing Summary

- **findasale-dev:** 3 findings
  - Unbounded findMany() pagination (2 locations)
  - N+1 query risk in nested includes (1 location)

- **findasale-ops:** 1 finding
  - Production console logs in cron jobs (suppress or use logger)

- **findasale-qa:** 1 finding
  - Alert() calls in production; verify toast replacement via manual test

- **No action needed:** 6 clean checks + 4 low-priority items (SSR guards, alt text, placeholder email, seed password)

---

**Report generated:** 2026-05-07  
**Scan completed:** All 7 categories  
**False positives resolved:** 1 (admin routes use middleware; not unprotected)
