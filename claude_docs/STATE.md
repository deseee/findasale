# PROJECT STATE

Compression anchor. Active state only.
Historical detail: `claude_docs/COMPLETED_PHASES.md`

---

## Active Objective

**Session 216 COMPLETE (2026-03-20) — DUAL-ROLE SCHEMA PHASE 1 + PLATFORM SAFETY + CHROME AUDITS:**
- ✅ **#76 Skeleton loaders:** CONFIRMED shipped from S215 (SkeletonCards.tsx exists, referenced in 5 files). Verified.
- ✅ **Chrome audit: 7 secondary routes** — ALL PASS. No P0/P1. Report: `claude_docs/audits/chrome-secondary-routes-s216.md`
- ✅ **#72 Dual-Role Account Phase 1 COMPLETE:** `User.roles` array field + `UserRoleSubscription` table + `RoleConsent` table. Migration SQL: `packages/database/prisma/migrations/20260320204815_add_dual_role_schema/migration.sql`. Backend utility: `packages/backend/src/lib/roleUtils.ts` (backward-compatible role checking). **PENDING PATRICK ACTION:** Run `prisma migrate deploy` + `prisma generate` against Neon before Phase 2 work.
- ✅ **Platform safety #94/#97/#98/#99 COMPLETE:** Coupon rate limiting (Redis, 10/min), admin pagination hard cap (100), request correlation IDs (UUID middleware), coupon collision retry (3 attempts).
- ✅ **P1 fix: Date input on create-sale** — FIXED. Added `min` attribute to both date inputs enabling HTML5 picker. Confirmed by Chrome audit.
- ✅ **Chrome audit: Organizer happy path** — P1 found + fixed same session. P2 notes: sale card click handler, LiveFeedTicker live data verification. Report: `claude_docs/audits/organizer-happy-path-s216.md`
- Last Updated: 2026-03-20

**Session 215 COMPLETE (2026-03-20) — MASSIVE PARALLEL SPRINT + TS ERROR RECOVERY:**
- ✅ **Subscription tier bug fixed:** AuthContext was reading `organizerTier` instead of `subscriptionTier` from JWT
- ✅ **P2 backlog shipped:** Error shape standardization (27 controllers → `{ message }`), holds pagination, hub N+1 fix
- ✅ **Design polish shipped:** #77 PublishCelebration confetti overlay, #81 empty state copy pass (8+ pages)
- ✅ **Platform safety P0 shipped:** #93 account age gate (7-day), #95 Redis bid rate limiter, #96 buyer premium disclosure
- ✅ **Architect ADR filed:** #72 Dual-Role Account Schema → `claude_docs/architecture/adr-072-dual-role-account-schema.md`
- ✅ **Schema pre-wires:** Consignment fields + affiliate payout table migrated to Neon (2 migrations applied)
- ✅ **#92 SEO city pages:** ISR `/city/[city]` with Schema.org JSON-LD, Grand Rapids pre-built
- ✅ **Railway recovery:** Dockerfile truncation recovered, 17 TS errors fixed across 4 files (3 MCP pushes)
- Last Updated: 2026-03-20

**Pricing Model (LOCKED):**
- **SIMPLE (Free):** 10% platform fee, 200 items/sale included, 5 photos/item, 100 AI tags/month
- **PRO ($29/month or $290/year):** 8% platform fee, 500 items/sale, 10 photos/item, 2,000 AI tags/month, unlimited concurrent sales, batch operations, analytics, brand kit, exports
- **TEAMS ($79/month or $790/year):** 8% platform fee, 2,000 items/sale, 15 photos/item, unlimited AI tags, multi-user access, API/webhooks, white-label, priority support
- **Overages:** SIMPLE $0.10/item beyond 200; PRO $0.05/item beyond 500; TEAMS $0.05/item (soft cap)
- **Shopper Monetization:** 5% buyer premium on auction items ONLY; Hunt Pass $4.99/mo (PAUSED); Premium Shopper (DEFERRED to 2027 Q2)
- **Post-Beta:** Featured Placement $29.99/7d, AI Tagging Premium $4.99/mo (SIMPLE), Affiliate 2-3%, B2B Data Products (DEFERRED)
- **Sources:** pricing-and-tiers-overview-2026-03-19.md (complete spec), BUSINESS_PLAN.md (updated), b2b-b2e-b2c-innovation-broad-2026-03-19.md (B2B/B2C strategy)

**DB test accounts (Neon production - current):**
- `user1@example.com` / `password123` → ADMIN role, SIMPLE tier organizer
- `user2@example.com` / `password123` → ORGANIZER, PRO tier ✅
- `user3@example.com` / `password123` → ORGANIZER, TEAMS tier ✅
- `user11@example.com` / `password123` → Shopper

---

**Session 217 COMPLETE (2026-03-21) — PRE-BETA SAFETY AUDIT + #102 PRICE VALIDATION:**
- ✅ **#100–#103 Pre-Beta Safety Audit:** 4 items audited. #100 (password reset rate limit) ✅ already implemented. #101 (sale publish ownership check) ✅ already implemented. #102 (item price >= 0 validation) ⚠️ MISSING → FIXED. Added price validation to itemController.ts createItem() and updateItem() for price, auctionStartPrice, auctionReservePrice. #103 (Stripe webhook signature verification) ✅ already implemented.
- ✅ **File Changed:** packages/backend/src/controllers/itemController.ts (price validation added, ~60 lines)
- ✅ **TypeScript Check:** PASS (0 errors)
- ✅ **MESSAGE_BOARD.json:** Updated with safety audit completion message
- Last Updated: 2026-03-21

**Next up (S218):**
- [ ] **PATRICK ACTION (S217 output):** Run git commands for #102 price validation:
  ```powershell
  cd C:\Users\desee\ClaudeProjects\FindaSale
  git add packages/backend/src/controllers/itemController.ts
  git commit -m "Add price validation to item create/update endpoints (#102)"
  .\push.ps1
  ```
- [ ] **Continue Pre-Beta Safety:** Next batch #104–#107 (CSRF, SQL injection, account enumeration, DDoS)
- [ ] **Verify #72 Phase 1 Migration Status:** Confirm Patrick has run Prisma migrate deploy + generate before proceeding with Phase 2
- [ ] **PATRICK ACTION (S216 blocker):** Run Prisma migration for #72 Phase 1:
  ```powershell
  cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
  $env:DATABASE_URL="postgresql://neondb_owner:npg_VYBnJs8Gt3bf@ep-plain-sound-aeefcq1y.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require"
  npx prisma migrate deploy
  npx prisma generate
  ```
- [ ] #72 Phase 2: JWT generation + auth middleware updates (gated by Phase 1 migration)
- [ ] #73 Two-Channel Notifications (gated by #72)
- [ ] #74 Role-Aware Registration Consent (gated by #72)
- [ ] #75 Tier Lapse State Logic (gated by #72)
- [ ] Chrome re-verify: create-sale flow after date input fix deployed
- [ ] #51 Sale Ripples: Neon migration + `prisma generate` still pending (Patrick action, lower priority than #72)
- [ ] Platform safety continued: #100-#121 from pre-beta safety list
- [ ] P2: Sale card click handler on homepage carousel
- [ ] P2: LiveFeedTicker live event verification

---

**Session 214 COMPLETE (2026-03-20) - CHROME VERIFICATION + #70 FULLY COMPLETE:**
- Chrome re-verify: 13/15 PASS. LiveFeedTicker placed on sale detail page. #19 Passkey deployed.
- Last Updated: 2026-03-20

---

**Sessions 191-203 COMPLETE (2026-03-17-18):**
- Wave 5 Sprint 1+2, Passkey P0 fix, full docs audit, 50+ routes Chrome-verified.
- Full history: session-log.md + git log.

---

## Active Infrastructure

### Connectors
- **Stripe MCP** - query payment data, manage customers, troubleshoot payment issues. Connected S172.
- **MailerLite MCP** - draft, schedule, and send email campaigns directly from Claude.
- *CRM deferred - Close requires paid trial. Spreadsheet/markdown for organizer tracking until beta scale warrants it.*

### Scheduled Automations (10 active)
Competitor monitoring, context refresh, context freshness check, UX spots, health scout (weekly), monthly digest, workflow retrospective, weekly Power User sweep, daily friction audit (Mon-Fri 8:30am), weekly pipeline briefing (Mon 9am). Managed by Cowork Power User + findasale-workflow + findasale-sales-ops agents.
