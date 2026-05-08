# Weekly Comprehensive Site Audit — 2026-05-07

**Auditor:** Automated weekly scheduled task  
**Date:** 2026-05-07  
**Session reference:** Post-S668 (S668 push block provided but not all changes pushed)  
**Routes enumerated:** 190+ files across 6 route groups  
**Routes Chrome-tested:** 7 (auth system failure prevented further testing)

---

## ⚠️ AUDIT SCOPE NOTE

Chrome testing was severely limited by a P0 auth regression discovered within the first 5 minutes: **every URL on finda.sale redirects unauthenticated visitors to /login**, including /register, /pricing, and /. Once this was confirmed across 3+ routes it became the primary investigation focus. Authenticated route testing was not possible because login itself is caught in a loop (see CRITICAL findings).

---

## CRITICAL (blocks beta testing / outreach)

### C-001 — Every public URL redirects logged-out visitors to /login

**Route:** ALL — tested `/`, `/pricing`, `/register`, `/about` (by navigation)  
**What happens:** Navigate to any URL → immediately redirected to `https://finda.sale/login`. The redirect happens client-side, within 1–2 seconds of the page loading.  
**Root cause (confirmed):** The `api.ts` 401 interceptor (added S667) fires on any API call that returns 401. Every page — including the homepage (calls `/feed`), pricing, and even `/register` — makes an API call on mount. Unauthenticated requests return 401. The interceptor calls `POST /api/auth/refresh` → Railway returns 403 (no refresh cookie) → interceptor does `window.location.href = '/login'` for any path not starting with `/login`.

The S668 commit (`f352ee09`) partially addressed this: it prevents the loop *when already on /login* (`!window.location.pathname.startsWith('/login')`). But it does NOT make public pages accessible — every page still triggers the 401 → redirect cycle on first load.

**Evidence:**
- `finda.sale/` → tab lands at `finda.sale/login` (screenshot ss_1860vm9i1)
- `finda.sale/pricing` → tab lands at `finda.sale/login` (screenshot ss_4759ziuxa)
- `finda.sale/register` → tab lands at `finda.sale/login` (screenshot ss_11507vxga)
- Network: 8+ `POST /api/auth/refresh` → 403, then GET /login → 503 in rapid succession

**DECISIONS.md violations:** D-001 (all sale types scope — visitors can't see any content), D-003 (empty state/CTA — the only CTA is a login form), D-004 (mobile-first — cannot test on any screen size)

**Fix required:** The 401 interceptor must be scoped to authenticated routes only. Public routes (`/`, `/pricing`, `/about`, `/sales/*`, `/items/*`, `/register`, `/login`, `/forgot-password`, `/search`, `/categories/*`, `/city/*`, `/neighborhoods/*`, `/guide`, `/faq`, `/terms`, `/privacy`, `/contact`, `/encyclopedia/*`) must be excluded from the redirect-to-login behavior. The interceptor should check `window.location.pathname` against a public routes allowlist before redirecting.

**Priority: P0 — site is functionally closed to the public.**

---

### C-002 — Login loop: successful login does not produce an authenticated session

**Route:** `/login`  
**What happens:** Backend login API (`POST /api/auth/login`) returns HTTP 200 with a valid JWT token and user object (confirmed via direct fetch test and curl). But after login, the user is never redirected to the dashboard — they stay on /login or are immediately redirected back.

**Root cause (confirmed via network trace):** After a successful login, `router.push('/organizer/dashboard')` fires. The dashboard loads and makes direct requests to `backend-production-153c9.up.railway.app` (the Railway URL). These requests return 401 because:
1. The httpOnly cookie is scoped to `finda.sale` and is not sent on cross-origin Railway requests
2. The `NEXT_PUBLIC_API_URL` env var is set to the Railway URL directly, bypassing the Vercel proxy
3. The 401 interceptor fires, refresh returns 403, redirect to /login

**Network evidence (captured):**
```
GET backend-production-153c9.up.railway.app/api/notifications/inbox → 401
GET backend-production-153c9.up.railway.app/api/sales/mine → 401
GET backend-production-153c9.up.railway.app/api/organizers/me → 401
POST backend-production-153c9.up.railway.app/api/auth/refresh → 403 (×8+)
GET finda.sale/login → 503 (×6+, service worker)
```

**Additional finding:** `GET /api/auth/me` returns **403** (not 401) for unauthenticated users. The AuthContext logs `[AuthContext] Session restore failed: Request failed with status code 403`. This is semantically wrong (403 = forbidden, 401 = unauthorized) and bypasses proper 401-handling logic.

**Fix required:** Two separate fixes needed:
1. `NEXT_PUBLIC_API_URL` must be unset (or set to `/api`) so all API calls go through the Vercel proxy, which correctly forwards `finda.sale` cookies to Railway
2. `GET /auth/me` backend endpoint must return 401 (not 403) for unauthenticated requests

**Priority: P0 — no user can successfully log in to the live site.**

---

## HIGH (degrades user experience significantly)

### H-001 — Railway backend URL directly exposed in browser

**What:** Network tab shows all API calls going to `https://backend-production-153c9.up.railway.app` directly. The `NEXT_PUBLIC_API_URL` env var is set to the Railway URL, bypassing the Vercel proxy designed to hide it.  
**Impact:** The Railway URL is visible to anyone with DevTools. The Railway service is directly accessible from the public internet without going through Vercel's edge network, WAF, or the intended proxy layer. Combined with C-002 this is also the functional cause of the login loop.  
**Fix:** In Vercel project settings, remove or unset `NEXT_PUBLIC_API_URL`. The api.ts fallback `|| '/api'` then takes over, routing all API calls through the Vercel proxy (`next.config.js` `fallback` rewrite handles `/api/:path*` → Railway).  
**Priority: P1 (security + functional)**

---

### H-002 — GET /api/auth/me returns 403 for unauthenticated users (should be 401)

**What:** On every page load, AuthContext calls `GET /api/auth/me` with `credentials: 'include'`. When no session cookie exists, the backend returns 403 instead of 401. Console shows: `[AuthContext] Session restore failed: Request failed with status code 403` on every page load.  
**Impact:** AuthContext catches 401 specifically (to treat as "not logged in"). A 403 response is an unexpected error path — the AuthContext logs it as an error rather than as a clean "no session" state. If any redirect logic were scoped to 403, it could cause a secondary loop. This is likely a CSRF middleware misconfiguration — CSRF check fails before auth check, returning 403 before the endpoint has a chance to return 401.  
**Fix:** Review the `/auth/me` route middleware order in `routes/auth.ts`. The CSRF protection middleware should run AFTER verifying whether auth is optional for this endpoint, OR the CSRF check should be skipped for GET requests (CSRF only matters for state-mutating requests anyway).  
**Priority: P1**

---

### H-003 — Unpushed S668 files include critical auth fixes not yet deployed

**What:** `git status` shows 26 modified files and dozens of untracked files. Among the modified (unpushed) files:
- `packages/frontend/components/AuthContext.tsx` — grown from 5,564 to 9,095 bytes (significant rewrite)
- `packages/frontend/lib/api.ts` — 29 bytes of changes
- `packages/frontend/pages/_app.tsx` — **MISSING `export default MyApp;`** at end of file

**Critical:** The local `_app.tsx` is missing its default export. If Patrick pushes these files as-is, the Next.js app would fail to build on Vercel (missing page component export). This must be corrected before pushing.

**Also critical:** The unpushed AuthContext.tsx is nearly double the size of the committed version, suggesting a comprehensive auth rewrite is waiting to be deployed. This may be the actual fix for C-001 and C-002.

**Recommended action:**
1. Patrick must NOT push `packages/frontend/pages/_app.tsx` as currently modified — it will break the build
2. The enlarged `AuthContext.tsx` should be reviewed and pushed after the export default is verified

**Priority: P1 (blocker for fix deployment)**

---

### H-004 — Vercel Web Analytics and Speed Insights not loading

**Console (every page load):**
```
[Vercel Web Analytics] Failed to load script from /_vercel/insights/script.js
[Vercel Speed Insights] Failed to load script from /_vercel/speed-insights/script.js
```
**Impact:** Patrick has zero visibility into traffic, page load performance, or which pages real users visit. During outreach campaigns this is especially damaging — no data to validate what's working.  
**Fix:** In Vercel dashboard → project → Analytics tab → enable Web Analytics. Also check Speed Insights is enabled under the project settings. These are likely disabled because the project is on a free tier or the feature wasn't turned on.  
**Priority: P1**

---

## MEDIUM (polish / experience issues)

### M-001 — Service worker serving stale /login → 503

**What:** Repeated GET requests to `finda.sale/login` return **HTTP 503**. The service worker has a NetworkFirst strategy for HTML pages with a 10-second timeout. When the login page request fails or times out at the network, the SW falls back to the cache — but the cache appears to be serving a 503 or an error page for /login.  
**Impact:** Login page may render from stale cache even when the network version has changed. Stale SW cache can also prevent new deployments from being picked up immediately.  
**Fix:** The SW for `/login` should have a shorter network timeout or a `StaleWhileRevalidate` strategy to always serve a valid page. Alternatively, ensure the login page is pre-cached correctly during SW install.  
**Priority: P2**

### M-002 — Auth page dark mode not verified (public page testing blocked)

Because the auth redirect prevented testing any routes, dark mode compliance per D-002 could not be verified on any page except /login. The login page itself renders correctly in dark mode (dark background, white text, orange CTAs visible). All other pages are unverified.  
**Priority: P2 — queue for next session once C-001/C-002 are fixed**

### M-003 — 190+ route inventory reveals several pages that may be stale/unused

Routes found that have no navigation path and may be vaporware:
- `haul/coming-soon.tsx` — the Haul feature appears in coming-soon state
- `shopper/early-access-cache.tsx` and `shopper/early-access-cache/items.tsx`
- `organizer/ripples.tsx`, `organizer/bounties.tsx`, `shopper/bounties/`
- `creator/dashboard.tsx` — creator role not mentioned in STATE.md
- `city-heat-index.tsx` — standalone, unclear entry point

These are DECISION NEEDED per D-010 (no autonomous removal). Patrick should confirm which are active features vs orphaned pages.  
**Priority: P2**

### M-004 — `.new` file left in pages directory

`packages/frontend/pages/city/[slug].tsx.new` exists in the pages directory. Next.js may try to resolve this as a route or at minimum it's noise in the filesystem.  
**Fix:** `git rm packages/frontend/pages/city/[slug].tsx.new`  
**Priority: P3**

### M-005 — Orphaned scratch files in project root

Several files in the project root that appear to be subagent scratch work:
- `EMAIL_AUDIT_REPORT.md`, `GROUP5_CHANGED_FILES.txt`, `IMPLEMENTATION_SUMMARY_GROUP5.md`, `PRICING_ENGINE_UPDATES_SUMMARY.txt`
- Multiple `.sql` files (`checkphotos.sql`, `delseed2.sql`, `cleanup-system-organizer-sales.sql`, etc.)
- Multiple `.html` prototypes (`cart-mockup.html`, `icon-preview-v3.html`, etc.)

Per CLAUDE.md subagent file hygiene rules, these should have been written to the VM working directory, not the project root.  
**Priority: P3**

---

## LOW (nitpick)

### L-001 — Console noise on every page load (non-blocking)
Two Vercel script load failures appear in console on every page. Users don't see these but they're noise for debugging sessions. Fixed by enabling Vercel Analytics (see H-004).

### L-002 — Stale `city/[slug].tsx.new` appears in git untracked
Should be removed to keep the pages directory clean.

---

## Multi-Role and Adversarial Testing

**SKIPPED** — the P0 auth redirect prevented logging in as any role (shopper, organizer, admin). All multi-role flows (D-005 messaging, team features, sale interactions) are unverifiable until C-001 and C-002 are resolved.

**Admin page access control:** Could not test whether `/admin/*` routes are blocked for non-admin users (C-001 means all routes redirect to /login for unauthenticated users, which is accidentally "correct" access control but for the wrong reason).

---

## DECISIONS.md Drift Analysis

| Decision | Status | Notes |
|----------|--------|-------|
| D-001 All Sale Types | ❌ CANNOT VERIFY | Public pages inaccessible |
| D-002 Dark Mode | ⚠️ PARTIAL — login only | All other pages untestable |
| D-003 Empty States with CTAs | ❌ CANNOT VERIFY | Pages not loading |
| D-004 Mobile-First | ❌ CANNOT VERIFY | Pages not loading |
| D-005 Multi-Endpoint Testing | ❌ CANNOT VERIFY | Cannot log in |
| D-006 Sale Detail Section Order | ❌ CANNOT VERIFY | Cannot reach sale pages |
| D-007 Teams Cap | ❌ CANNOT VERIFY | Cannot reach settings |
| D-008 Loading States | ❌ CANNOT VERIFY | Pages not loading |
| D-009 Error States | ❌ CANNOT VERIFY | Pages not loading |
| D-010 No Autonomous Removal | ✅ No violations this audit | (audit-only session) |

**9 of 10 decisions cannot be verified** due to the auth regression.

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 2 |
| HIGH | 4 |
| MEDIUM | 5 |
| LOW | 2 |
| **Total** | **13** |

---

## Top 3 Recommendations for Next Session

1. **Fix C-001 immediately** — Add a public routes allowlist to the `api.ts` 401 interceptor. The redirect should only fire for authenticated routes, not public pages. This is a ~10-line fix in `packages/frontend/lib/api.ts` and can be dispatched directly to findasale-dev.

2. **Fix C-002 by unsetting `NEXT_PUBLIC_API_URL`** — Remove this env var from Vercel so all API calls route through the proxy. This fixes the cookie scope mismatch that causes logged-in users to be immediately logged out. Can be done in Vercel dashboard with no code change.

3. **Do NOT push the current local `_app.tsx`** — The file is missing `export default MyApp;`. Review and fix before including in the next push block. The unpushed `AuthContext.tsx` rewrite (9,095 bytes) should be reviewed for whether it addresses C-001/C-002 before deciding whether to push or discard it.

---

*Next audit should re-run all DECISIONS.md checks once auth is restored. Aim: verify D-001 through D-009 in one focused Chrome session.*
