# Quarterly Security Audit — June 2026
**Auditor:** findasale-hacker (quarterly cadence)
**Date:** 2026-06-08 (S919)
**Last audit:** ~S218 (700+ sessions ago)
**Scope:** Application security, infrastructure, business logic, dependency vulnerabilities
**Method:** Static analysis via bash/grep/Read — no active exploitation attempted

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 1 |
| HIGH | 2 |
| MEDIUM | 2 |
| LOW | 1 |
| INFO | 3 |

One CRITICAL finding requires an **immediate hotfix** before the next production deploy.

---

## Findings

---

### CRITICAL — Dev Route Privilege Escalation in Production

**Attack vector:** Any actor registers an account at finda.sale with email `user1@example.com`. Registration requires no invite code (inviteCode field is optional per authController.ts line 66: `if (inviteCode)`). After registering and logging in, the attacker calls `POST /api/dev/fix-seed-tiers`. This endpoint sets `user1@example.com` to ADMIN role in the database. The attacker logs out and back in, receiving a JWT with role=ADMIN. Full admin panel access: user management, role changes, data exports, feature flag manipulation.

**Impact:** Complete account takeover to ADMIN role by any unauthenticated actor. Admin panel allows deleting users, changing tiers, accessing payout/revenue reports, manipulating feature flags.

**Likelihood:** HIGH — The route is public knowledge (open-source repo), registration is open (no mandatory invite), and the email address is a well-known seed value.

**Evidence:**
- `packages/backend/src/index.ts` line 550: `app.use('/api/dev', devRoutes);` — no NODE_ENV guard
- `packages/backend/src/routes/dev.ts` line 16: `if (req.user?.email !== 'user1@example.com')` — email gate, not role gate
- `packages/backend/src/routes/dev.ts` line 19: `await prisma.user.update({ where: { email: 'user1@example.com' }, data: { role: 'ADMIN' } })` — direct role elevation
- `packages/backend/src/controllers/authController.ts` line 66: `if (inviteCode)` — invite code is optional; anyone can register with any email

**Recommendation:** Add NODE_ENV guard in `index.ts`. Change:
```typescript
app.use('/api/dev', devRoutes);
```
to:
```typescript
if (process.env.NODE_ENV !== 'production') {
  app.use('/api/dev', devRoutes);
}
```
**Owner:** findasale-dev. **Fix target:** Before next production session.

**Priority:** P0 — Fix in current session or block production deploys.

---

### HIGH — SQL Injection via String Interpolation in Admin Demand Signals

**Attack vector:** Authenticated admin sends `GET /api/admin/demand-signals?city=<payload>` where `<payload>` contains Unicode quote characters or PostgreSQL-specific injection syntax. The `city` parameter is manually escaped with `city.replace(/'/g, "''")` but then string-interpolated into a `$queryRawUnsafe` call.

**Impact:** Data exfiltration from any table, potential lateral movement within the database. Limited by admin-only auth gate — attacker must already hold ADMIN role.

**Likelihood:** LOW — Requires admin credentials. Manual `''` escaping is sufficient on modern PostgreSQL (standard_conforming_strings=on). Risk is code-smell + becomes HIGH if PostgreSQL config ever changes.

**Evidence:**
- `packages/backend/src/routes/admin.ts` lines 245-246:
  ```javascript
  const whereCity = city ? `AND city = '${city.replace(/'/g, "''")}'` : '';
  const rows = await (prisma as any).$queryRawUnsafe(`...WHERE 1=1 ${whereCity}...`);
  ```
- Route is protected: `router.use(authenticate, requireAdmin)` (line 67) — mitigates exploitation surface

**Recommendation:** Replace string interpolation with Prisma.sql parameterization:
```typescript
// Replace manual escaping with:
import { Prisma } from '@prisma/client';
const whereCity = city ? Prisma.sql`AND city = ${city}` : Prisma.empty;
const rows = await prisma.$queryRaw`
  SELECT ... FROM "UnmetDemandSignal"
  WHERE 1=1 ${whereCity}
  ...
`;
```
**Owner:** findasale-dev. **Priority:** P1 — Fix within 3 sessions.

---

### HIGH — No File Type or Size Validation on Item Upload Routes

**Attack vector:** Authenticated user calls `POST /api/items` with `images[]` containing malicious files (SVG with embedded JavaScript, oversized files). The multer instance on `packages/backend/src/routes/items.ts` line 86 has no `fileFilter` and no `limits.fileSize`. Files go to Cloudinary via memory storage — 5 images × uncapped size = potential OOM/memory exhaustion on Railway.

**Impact:** (1) Memory-based DoS if large files are uploaded (all 5 slots × large files loaded into RAM before Cloudinary). (2) Malicious SVG uploaded to Cloudinary served as `image/svg+xml` can execute JavaScript in any browser that loads it directly.

**Likelihood:** MEDIUM — Requires authenticated account.

**Evidence:**
- `packages/backend/src/routes/items.ts` line 86: `const upload = multer({ storage: multer.memoryStorage() });` — no fileFilter, no limits
- Compare to `packages/backend/src/controllers/uploadController.ts` lines 40-50 which HAS a proper MIME whitelist: `['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic']`
- Routes affected: `POST /api/items` (images), `POST /:saleId/import-items` (CSV), `POST /:saleId/bulk-import` (file)

**Recommendation:** Add fileFilter and size limits to the items.ts multer instance:
```typescript
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per file
  fileFilter: (_req, file, cb) => {
    const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic'];
    if (ALLOWED.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Invalid file type'));
  },
});
```
CSV import routes can use a separate `csvUpload` multer that accepts `text/csv` and `application/vnd.ms-excel` only.
**Owner:** findasale-dev. **Priority:** P1 — Fix within 3 sessions.

---

### MEDIUM — 6 HIGH Severity npm Vulnerabilities (Backend)

**Attack vector:** Exploitation depends on specific CVEs. `path-to-regexp` is used by Express for route matching — ReDoS vulnerabilities in route parsing can cause event loop blocking under specific route patterns. `semver` has ReDoS. `axios` varies by version.

**Impact:** Denial of service (ReDoS via malformed requests), potential downstream impacts depending on CVE specifics.

**Likelihood:** LOW-MEDIUM — ReDoS requires crafted input hitting vulnerable route patterns.

**Evidence:** `npm audit` output (run in session):
```
6 high severity vulnerabilities
Packages: axios, js-cookie, nodemon, path-to-regexp, semver
```
- `nodemon` is a dev dependency — not in the production bundle, no production risk
- `path-to-regexp` is in the Express dependency chain — in production

**Recommendation:** Run `npm audit fix` in `packages/backend`. For vulnerabilities that require `--force` (breaking changes), evaluate each manually. At minimum upgrade `path-to-regexp` and `semver`.
**Owner:** findasale-dev. **Priority:** P2 — Address in next maintenance session.

---

### MEDIUM — No Size Limit on Bulk CSV Import Routes

**Attack vector:** Authenticated organizer uploads a multi-gigabyte CSV to `POST /api/items/:saleId/import-items` or `/bulk-import`. Both use `multer.memoryStorage()` with no size limit — the entire file is buffered in Railway memory before parsing.

**Impact:** Memory exhaustion on Railway backend, service restart, brief downtime for all users.

**Likelihood:** LOW — Requires an organizer account. Accidental large uploads more likely than intentional attack.

**Evidence:** Same multer instance as HIGH finding above (items.ts line 86). Included separately because the fix differs — CSV routes should use `text/csv` filter, not image filter.

**Recommendation:** Create a separate `csvUpload` multer with `limits: { fileSize: 5 * 1024 * 1024 }` and fileFilter accepting only CSV MIME types.
**Owner:** findasale-dev. **Priority:** P2.

---

### LOW — Dev Route Email Gate vs. Role Gate (Defense in Depth)

**Attack vector:** If the CRITICAL finding above is fixed (NODE_ENV guard added), this finding describes the residual risk: the dev route's safety gate is email-based, not role-based. A developer seeding a staging environment with `user1@example.com` could inadvertently expose the escalation path.

**Impact:** Low post-CRITICAL-fix, since the route won't exist in production.

**Evidence:** `packages/backend/src/routes/dev.ts` line 16 — email check only. Adding `requireAdmin` as a secondary guard before the email check would be defense-in-depth even in non-production environments.

**Recommendation:** After adding NODE_ENV guard, also add `requireAdmin` to the dev route as defense-in-depth for staging.
**Owner:** findasale-dev. **Priority:** P3.

---

### INFO — CSP Disabled in Helmet (Backend — Correct by Design)

**Finding:** `contentSecurityPolicy: false` in `packages/backend/src/index.ts` line 280.

**Assessment:** Not a vulnerability. The backend returns JSON API responses, not HTML. CSP headers are irrelevant for JSON responses and are correctly handled by Next.js `next.config.js` on the frontend. The comment confirms intent: "CSP is handled by Next.js headers config; keep it loose here for the API."

**No action needed.**

---

### INFO — No-Origin CORS Bypass (By Design)

**Finding:** `if (!origin) return callback(null, true)` in CORS handler allows requests with no Origin header (curl, Postman, server-to-server) to bypass the allowlist.

**Assessment:** Standard and intentional for APIs that serve non-browser consumers (webhooks, cron jobs, server-to-server calls). The actual authentication layer (JWT cookies + Bearer tokens) provides the security — CORS is a browser-only defense. No action needed unless a specific route needs browser-only access enforcement.

**No action needed.**

---

### INFO — Duplicate requireAdmin Exports

**Finding:** `requireAdmin` is exported from both `middleware/adminAuth.ts` and `middleware/auth.ts`. Both implementations appear identical.

**Assessment:** Maintenance risk only. If one is updated without the other, behavior diverges silently.

**Recommendation:** Remove the export from `middleware/adminAuth.ts` and have it re-export from `middleware/auth.ts` to establish a single source of truth.
**Owner:** findasale-dev. **Priority:** P3.

---

## Positive Findings (What's Working)

- **Stripe webhook signature verification** confirmed in billingController.ts, stripeController.ts, and index.ts — `constructEvent` with webhook secret on all webhook routes ✓
- **JWT stored in httpOnly + secure cookies** (not localStorage) — prevents XSS-based token theft ✓
- **Auth rate limiting** on all auth endpoints: loginLimiter, registerLimiter, forgotPasswordLimiter, verifyEmailLimiter ✓
- **IDOR protection in itemController.ts** — ownership check `authReq.user?.id === item.sale?.organizer?.userId` before mutations ✓
- **QA bypass gated properly** — `isQABypassRequest` returns `false` if `QA_RATE_LIMIT_BYPASS_SECRET` env var is not set ✓
- **Password reset tokens** use `crypto.randomUUID()` with 1-hour expiry ✓
- **Email verification tokens** use `crypto.randomBytes(32).toString('hex')` — strong entropy ✓
- **CORS allowlist** properly restricts to known finda.sale domains + Vercel preview URLs ✓
- **searchNotificationController raw SQL** uses tagged template literals (parameterized) ✓
- **itemSearchService queryRawUnsafe** uses numbered PostgreSQL params ($1, $2...) — safe ✓
- **Frontend: 0 critical, 0 high, 0 moderate** npm vulnerabilities ✓
- **Consignment commission rates** validated to 0-100 range with parseFloat ✓

---

## Recommended Dispatch Plan

**Session S919 (today) — P0:**
Dispatch `Skill('findasale-dev')` with single targeted fix: add NODE_ENV guard to `/api/dev` route registration in `packages/backend/src/index.ts`. Change 1 line, ~1 token cost, blocks the CRITICAL escalation path.

**Next DEV session — P1 batch:**
Dispatch `Skill('findasale-dev')` for:
1. Add fileFilter + size limits to the items.ts multer instance (images + CSV routes)
2. Convert admin.ts demand-signals `$queryRawUnsafe` to parameterized `$queryRaw` with Prisma.sql
3. Run `npm audit fix` in `packages/backend`

**Future session — P3 cleanup:**
- Remove duplicate requireAdmin export from adminAuth.ts
- Add requireAdmin to dev route as defense-in-depth

---

*Audit completed: 2026-06-08. Next quarterly audit: 2026-09-08.*
