# Session Log — FindA.Sale

Cross-session memory for Claude. Updated at every session end.
Read this at session start to understand recent context without loading extra files.
Keep only the 5 most recent sessions. Delete older entries — git history and STATE.md are the durable record.

---

## Recent Sessions

### 2026-03-07 (session 93 — Sprint 4b frontend + MailerLite wire-up + spec rewrite)
**Worked on:**
- **Sprint 4b frontend (5 files):** `hooks/useItemSearch.ts` (React Query hook, `filtersFromQuery`, `useFilterSync` with shallow URL routing), `components/FilterSidebar.tsx` (desktop sticky sidebar + mobile full-screen drawer, 14 categories, 5 conditions, price range, sort, facet counts), `components/ItemSearchResults.tsx` (results grid, 8-card skeleton, empty/error states, pagination up to 7 page buttons), `components/ItemSearch.tsx` (300ms debounce, clear button, mobile filter toggle), `pages/search.tsx` (5 targeted edits integrating FTS into items tab — other tabs unchanged).
- **MailerLite spec rewrite:** Old spec used Tags tab (doesn't exist), Custom Event condition (doesn't exist), API v1. Rewrote `mailerlite-onboarding-automation-2026-03-07.md` for current UI: drag-and-drop builder, "Joins a group" trigger, Custom Field `sale_published` (not a Tag), exit condition via "Condition → Custom fields → Is set", API v2 endpoint `POST https://connect.mailerlite.com/api/subscribers`.
- **MailerLite backend wire-up:** Created `packages/backend/src/services/mailerliteService.ts` (upsert subscriber with `fields: { sale_published: "yes" }`, graceful no-op if key not set). Wired into `saleController.ts` PUBLISHED transition block (fire-and-forget `.then()`). Added `MAILERLITE_API_KEY` to `.env.example`.
- **TypeScript fix (`itemSearchService.ts`):** `ftsSearch` and `ilikeSearch` signatures used `Required<Omit<SearchQuery, 'q'>>` making optional filter fields required. Fixed to `Omit<SearchQuery, 'q'> & Required<Pick<SearchQuery, 'limit' | 'offset' | 'sort'>>`. `pnpm tsc --noEmit` passes clean on both packages.
**Decisions:** Sprint 4b items tab uses `/api/items/search` (FTS); all/sales tabs keep existing `/api/search` endpoint. No breaking changes to existing search behavior.
**Next up:** Sprint 5 — Seller Performance Dashboard. Patrick must add `MAILERLITE_API_KEY` to Railway and run `.\push.ps1` before testing.
**Blockers:** `MAILERLITE_API_KEY` not yet in Railway. Neon migration `20260310000001_add_item_fulltext_search_indexes` not yet deployed (needed for Sprint 4b end-to-end testing). Patrick to run `.\push.ps1`.

### 2026-03-07 (session 92 — Legal ToS + health scout triage + Sprint 4a FTS backend)
**Worked on:**
- **Legal ToS (terms.tsx):** 7 targeted edits — meta description, Section 2 scope, Section 4 opener, INSERT consignment disclaimer (Legal Authority to Sell + FindA.Sale's Limited Role), expanded Cancellations → Fulfillment and Cancellation Obligations (24-hr ack, 30-day pickup, dispute escalation), INSERT Section 4a Sales Tax Obligations, expanded Buyer Terms dispute resolution (7-day timeline, Stripe escalation, Contact Support).
- **Legal (privacy.tsx):** 2 edits — meta description + Location Information subsection updated to reference all sale types.
- **Health scout triage:** 2 HIGH findings confirmed already resolved (.env.example already had all 8 region vars; frontend .env.local.example had NEXT_PUBLIC_DEFAULT_CITY). Admin findMany finding also false alarm — all 5 queries have `take` limits. 5 of 6 mediums deferred post-beta. 1 medium (coupon rate limiting) → pre-beta critical.
- **Coupon rate limiting (coupons.ts):** Added `express-rate-limit` on POST /api/coupons/validate. User-ID-keyed (10 attempts/min). Prevents brute-force coupon guessing.
- **Sprint 4a FTS backend:** Migration SQL (pg_trgm, tsvector generated column, 4 GIN/composite indexes), `itemSearchService.ts` (FTS + ILIKE fallback + filteredSearch, facets, categories), `searchController.ts` (searchItemsHandler + getItemCategoriesHandler), `items.ts` route updated (/search and /categories added before /:id).
- **Skill files verified:** health-scout-improved.skill and findasale-dev-improved.skill confirmed installed.
- **MailerLite spec summarized:** 3-email sequence, 15-minute setup, all Patrick manual actions.
- **Marketing output reviewed:** Week 1 social posts presented.
**Decisions:** All 4 Sprint 4a files follow existing import patterns. TypeScript check blocked by Cowork pnpm environment — Patrick to run `pnpm tsc --noEmit` in packages/backend from PowerShell to verify.
**Next up:** Sprint 4b frontend search UI. Run Neon migration 20260310000001 before testing end-to-end.
**Blockers:** Patrick needs to run `.\push.ps1` to push all session 92 changes. Neon migration pending deployment.

### 2026-03-07 (session 91 — Health Scout pre-beta scan)
**Worked on:**
- **Pre-beta health scan:** Comprehensive security and code quality audit using health-scout skill across three areas: (1) Sprint 3 coupon logic (validation, Stripe integration, edge cases); (2) Sprint 3.5 regionConfig completeness and env var fallback behavior; (3) General pre-beta sweep for secrets, console logging, auth gaps, SSR risks, Prisma safety.
- **Coupon sprint audit:** couponController.ts and stripeController.ts coupon sections reviewed line-by-line. All validation edge cases sound: expired coupon rejection (line 83), wrong-sale prevention (line 77), negative total protection via Math.min capping at $0.50 Stripe minimum (line 229/235). Idempotency key correctly includes coupon context (line 242–243). Fire-and-forget coupon operations have proper error handling (lines 426–427, 431–432). ✓
- **Region config sprint audit:** regionConfig.ts properly centralizes Grand Rapids defaults as env var fallbacks. DeGR-ification complete — no hardcoded "Grand Rapids" or "Michigan" in controllers, components, or routes. All references safely in config defaults, test fixtures, seed data, comments, and meta tags. Layout.tsx correctly uses NEXT_PUBLIC_DEFAULT_CITY fallback. Graceful fallback to defaults prevents deployment failures. ✓
- **Security clean checks pass:** 0 hardcoded API keys (sk_live/sk_test/jwt_secret), 0 sensitive console logs (password/token/secret), JWT verification enabled (not skipped), CORS restricted to ALLOWED_ORIGINS env var (not wildcard), webhook signature validation in place (STRIPE_WEBHOOK_SECRET required), auth middleware on all sensitive routes (/coupons, /stripe). Webhook handler properly unauthenticated (public endpoint). ✓
- **Findings:** 2 HIGH (env var documentation gaps: missing DEFAULT_* in .env.example, missing NEXT_PUBLIC_DEFAULT_CITY reference), 6 MEDIUM (coupon collision retry single-attempt, no redemption audit trail, console logs lack correlation IDs, Stripe Connect ID logged in plain text, admin findMany queries lack pagination, no rate limiter on coupon validation), 10 LOW (all clean checks — no SSR crashes, no alert() in production, no hardcoded regions outside safe zones).
- **Report saved:** `claude_docs/health-reports/health-scout-pre-beta-2026-03-07.md` with P0/P1/P2/P3 ratings, routing summary for findasale-qa/dev/ops/ux/legal/records, and 8 recommended next actions.
**Decisions:** No blockers identified. All findings are minor or medium-severity. Pre-beta scan clear to launch. Recommend Patrick address 2 HIGH items (env vars) and 6 MEDIUM items (logging, rate limiting, audit trail) before load testing. P2 items can run parallel to upcoming sprints.
**Next up:** Implement express-rate-limit on /api/coupons/validate (findasale-dev). Update .env.example with DEFAULT_* vars (findasale-ops). Add coupon redemption audit fields to schema if dispute resolution needed (findasale-qa).
**Blockers:** None identified. Pre-beta ready.

### 2026-03-07 (session 90 — push.ps1 hardening + git workflow audit)
**Worked on:**
- **push.ps1 Bug 1 (CRLF false-positive):** `git diff` without `--ignore-cr-at-eol` flagged CRLF-only changes as real content changes. Windows autocrlf caused perpetual "uncommitted changes" warnings. Fixed by adding `--ignore-cr-at-eol` to the diff command.
- **push.ps1 Bug 2 (em dash encoding crash):** Em dash U+2014 in a string literal caused PowerShell parse failure ("string missing terminator"). Byte 0x94 in Windows-1252 = RIGHT DOUBLE QUOTATION MARK. Fixed by replacing with ASCII hyphen. Self-healing entry #51 added.
- **push.ps1 Bug 3 (doc conflict auto-resolution):** After git merge origin/main, conflicts in claude_docs/ and context.md files now auto-resolve with --theirs strategy. Code file conflicts still route to Cowork. Patrick no longer blocked by doc merge conflicts.
- **Root cause hardened:** CORE.md section 10 now prohibits MCP-pushing wrap-only docs (STATE.md, session-log.md, .last-wrap, next-session-prompt.md) mid-session. Self-healing entry #52 added.
- **4 merge conflicts resolved:** .last-wrap, STATE.md, session-log.md, next-session-prompt.md all had conflict markers from session 89/90 MCP vs local drift. Resolved via Read + Edit.
**Decisions:** Wrap-only docs are never MCP-pushed mid-session. Push.ps1 is now fully self-healing for doc conflicts.
**Next up:** Sprint 4 (Search by Item Type) — consult findasale-architect for schema/API design first.
**Blockers:** None. Patrick's 5 manual beta items unchanged.

### 2026-03-07 (session 89 continued — Sprint 3.5 + Power User + roadmap redesign + workflow hardening)
**Worked on:**
- **Sprint 3.5 (code deGR-ification):** 51 hardcoded Grand Rapids references found across 13 files. All replaced with env var-driven `regionConfig.ts` (backend) and `NEXT_PUBLIC_*` env vars (frontend). 26 code files modified, `regionConfig.ts` created. QA caught 2 bugs: hardcoded "Michigan" in cloudAIService.ts line 239, hardcoded map coordinates in map.tsx line 247 — both fixed. All 30 files (code + docs) pushed to GitHub via MCP in batched commits.
- **Cowork Power User skill:** New skill created with 7 responsibilities: ecosystem research, skill optimization, autonomous work discovery (reads roadmap.md + research docs), cross-agent coordination, proactive change proposals, connector/plugin scouting, Cowork config optimization. Packaged as .skill and installed.
- **Roadmap v18 simplified:** Removed CA/CB/CC/CD parallel path encoding. Plain English sections: Patrick's Checklist → Running Automations → Connectors → Feature Pipeline → Sync Points → Deferred & Long-Term Hold → Infrastructure → Maintenance Rules.
- **Connectors:** Stripe MCP connected. MailerLite MCP connected. Close CRM deferred (requires paid trial).
- **Workflow failure hardened:** Claude told Patrick to manually fix merge conflict (session-log.md) — Patrick escalated. Self-healing entry #50 added (merge conflict auto-resolution). Conversation-defaults Rule 6 added (never hand off git issues). Workflow failure memo written and pushed.
**Decisions:** Roadmap uses plain English section names (no more CA/CB/CC/CD). CRM connector deferred until beta scale warrants paid trial. Merge conflicts always resolved by Claude using Read → Edit → MCP push — never handed to Patrick.
**Next up:** Sprint 4 (Search by Item Type) → Sprint 5 (Seller Performance Dashboard). Weekly Power User scheduled task proposed but not yet created.
**Blockers:** Patrick needs to run `git merge --abort` then `git reset --hard origin/main` to sync local with MCP pushes. Patrick's 5 manual beta items unchanged.
