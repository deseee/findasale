# Audit Coverage Checklist

Used by `health-scout` and `findasale-qa` to verify scan completeness.
Every "comprehensive" audit must cover all applicable sections below.
Check off each area and note "N/A" if genuinely not applicable — never silently skip.

---

## 1. Security Surface

- [ ] **Secrets scan:** grep for `sk_live`, `sk_test`, `jwt_secret`, API keys, passwords in code and docs
- [ ] **Auth middleware:** all sensitive routes protected (`authenticate`, `requireAdmin`, `requireOrganizer`)
- [ ] **CORS config:** not wildcard, uses `ALLOWED_ORIGINS`
- [ ] **Webhook validation:** Stripe webhook signature verified, endpoint unauthenticated (correct)
- [ ] **Rate limiting:** auth endpoints, coupon validation, any brute-forceable endpoint
- [ ] **JWT handling:** no fallback secrets, proper expiry, env var validated at startup
- [ ] **File upload:** size limits enforced, file type validation, Cloudinary config correct
- [ ] **SQL injection:** all queries use Prisma parameterized queries (no raw SQL without `$queryRaw` + params)
- [ ] **XSS:** no `dangerouslySetInnerHTML` without sanitization

## 2. Data Integrity

- [ ] **Prisma schema:** all relations have proper `onDelete` cascades or restrictions
- [ ] **Unbounded queries:** all `findMany` calls have `take` limits
- [ ] **Transaction safety:** multi-step mutations use `prisma.$transaction`
- [ ] **Enum consistency:** frontend enums match backend enums match Prisma schema enums

## 3. Error Handling

- [ ] **Async/await:** all async route handlers wrapped in try/catch or express error middleware
- [ ] **Sentry integration:** errors reported with context (userId, saleId, action)
- [ ] **User-facing errors:** no stack traces or internal details leaked to frontend
- [ ] **Console logging:** no `console.log` with sensitive data (passwords, tokens, full user objects)

## 4. Frontend

- [ ] **SSR safety:** no `window`/`document` access outside `useEffect` or dynamic imports
- [ ] **Loading states:** all data-fetching pages have skeleton/loading UI
- [ ] **Error states:** all data-fetching pages have error UI (not blank screen)
- [ ] **Mobile viewport:** key pages tested at 375px width (or noted as untested)
- [ ] **PWA manifest:** icons, name, theme_color all current (no SaleScout references)

## 5. Environment & Config

- [ ] **`.env.example` complete:** all required env vars documented with descriptions
- [ ] **No hardcoded values:** no hardcoded URLs, cities, coordinates, API endpoints in code
- [ ] **Region config:** all geographic references use `regionConfig.ts` or `NEXT_PUBLIC_*` env vars
- [ ] **Production vs dev:** no `if (process.env.NODE_ENV === 'development')` blocks that skip important logic

## 6. Business Logic

- [ ] **Fee calculation:** 5% regular / 7% auction correctly applied, minimum $0.50 Stripe charge
- [ ] **Stripe Connect:** payout splits correct, idempotency keys used
- [ ] **Sale lifecycle:** draft → published → active → completed transitions validated
- [ ] **Permissions:** organizers can only edit their own sales, admins have proper escalation

## 7. Infrastructure

- [ ] **Dockerfile:** `--frozen-lockfile` in production build, correct `EXPOSE` port
- [ ] **Migrations:** all pending migrations identified, no `db push` in production
- [ ] **Dependencies:** no known CVEs in `pnpm audit` (or documented as accepted risk)

---

## Post-Audit Verification

After completing the checklist:
1. Count checked items vs total items → coverage percentage
2. List any "N/A" items with justification
3. List any items that FAILED with severity (P0/P1/P2/P3)
4. Include this checklist completion summary in the audit report header

**If coverage < 80%:** The audit is incomplete. Expand scope or document why sections were skipped.

---

*Created: 2026-03-09 (session 95, backlog E8). Tier 2 — load on demand before audits.*
