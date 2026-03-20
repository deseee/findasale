# PROJECT STATE

Compression anchor. Active state only.
Historical detail: `claude_docs/COMPLETED_PHASES.md`

---

## Active Objective

**Session 213 COMPLETE (2026-03-20) — REDIS ENV + #70 SOCKET DISPATCH + P1/P2 BUG FIXES:**
- ✅ **Redis infrastructure live:** REDIS_URL + NEXT_PUBLIC_SOCKET_URL set on Railway + Vercel
- ✅ **P1 fix SHIPPED:** `GET /sales/cities` — `getCities` via `$queryRaw` (bigint→Number conversion)
- ✅ **P2 fixes SHIPPED (all remaining):** ThemeToggle dedup, Layout dedup (item-library, photo-ops)
- ✅ **#70 dev dispatch COMPLETE:** Redis adapter + JWT socket auth + `useLiveFeed` + `LiveFeedTicker`
- Last Updated: 2026-03-20

**#19 Passkey — CLEAR TO DEPLOY ✅ (no further work needed)**

**Pricing Model (LOCKED — Session 207):**
- **SIMPLE (Free):** 10% platform fee, 200 items/sale included, 5 photos/item, 100 AI tags/month
- **PRO ($29/month or $290/year):** 8% platform fee, 500 items/sale, 10 photos/item, 2,000 AI tags/month, unlimited concurrent sales, batch operations, analytics, brand kit, exports
- **TEAMS ($79/month or $790/year):** 8% platform fee, 2,000 items/sale, 15 photos/item, unlimited AI tags, multi-user access, API/webhooks, white-label, priority support
- **Overages:** SIMPLE $0.10/item beyond 200; PRO $0.05/item beyond 500; TEAMS $0.05/item (soft cap)
- **Shopper Monetization:** 5% buyer premium on auction items ONLY; Hunt Pass $4.99/mo (PAUSED); Premium Shopper (DEFERRED to 2027 Q2)
- **Post-Beta:** Featured Placement $29.99/7d, AI Tagging Premium $4.99/mo (SIMPLE), Affiliate 2–3%, B2B Data Products (DEFERRED)
- **Sources:** pricing-and-tiers-overview-2026-03-19.md (complete spec), BUSINESS_PLAN.md (updated), b2b-b2e-b2c-innovation-broad-2026-03-19.md (B2B/B2E/B2C strategy)

**DB test accounts (Neon production — current):**
- `user1@example.com` / `password123` → ADMIN role, SIMPLE tier organizer
- `user2@example.com` / `password123` → ORGANIZER, PRO tier ✅ (fixed S211)
- `user3@example.com` / `password123` → ORGANIZER, TEAMS tier ✅ (fixed S211)
- `user11@example.com` / `password123` → Shopper

---

**Next up (S214+):**
- [x] Fix 7 P0 bugs from audit ✅ S212 COMPLETE
- [x] Fix P1 dark mode on premium + insights ✅ S212 SHIPPED
- [x] Fix P1 messages blank page ✅ S212 SHIPPED
- [x] Fix P1 subscription error state for PRO/TEAMS ✅ S212 SHIPPED
- [x] Fix P1 webhooks tier gating ✅ S212 SHIPPED
- [x] Fix P1 cities page — `GET /sales/cities` endpoint ✅ S213 SHIPPED
- [x] Fix P2 remaining (ThemeToggle dedup, Layout dedup) ✅ S213 SHIPPED
- [x] Redis env live on Railway + Vercel ✅ S213 COMPLETE
- [x] Dev dispatch: Redis adapter + JWT socket auth + LiveFeedTicker for #70 ✅ S213 SHIPPED
- [x] Secondary route audit P0s fixed (price history import + visibility) ✅ S213 SHIPPED
- [x] Secondary route audit P1s fixed (encyclopedia ownership, price history item-level, hub discovery cap) ✅ S213 SHIPPED
- [ ] #19 Passkey — CLEAR TO DEPLOY ✅ (no further work needed)
- [ ] P2 audit findings: inconsistent error shapes, missing pagination on holds, N+1 hub query

---

**Session 202 COMPLETE (2026-03-18) — CHROME VERIFICATION + DB ACCOUNTS + UX + A11Y AUDIT REPORTS:**
- 50+ routes verified across all user types. 1 confirmed 404 fixed: /organizer/neighborhoods → /neighborhoods.
- Neon test accounts established for all 4 user types. JWT + tier payload verified.
- 7 TypeScript errors fixed. Vercel build unblocked. 13 routes now deploy correctly.
- P0 UX restructure: drawer grouping, dashboard sections, Plan a Sale gated to organizers.
- §13 Schema-First Pre-Flight Gate added to CLAUDE.md (permanent, binding on all dev subagents).
- 3 audit reports filed: ux-audit, design-critique, accessibility-audit (claude_docs/audits/).
- Last Updated: 2026-03-18 (sessions 202+203)

---

**Sessions 191–199 COMPLETE (2026-03-17–18):**
- Wave 5 Sprint 1 (6 features) + Sprint 2 frontends shipped. All Neon migrations applied.
- Passkey P0 fix (S196+S197) — QA confirmed READY. Rate limiting added.
- Full docs audit + archive reorganization (134 files re-filed). Roadmap v55.
- Vercel + Railway GREEN throughout.
- Full history: session-log.md + git log.

---

---

## Active Infrastructure

### Connectors
- **Stripe MCP** — query payment data, manage customers, troubleshoot payment issues. Connected S172. Unlocks #6 dashboard real payment data + #65 Tiers subscription billing.
- **MailerLite MCP** — draft, schedule, and send email campaigns directly from Claude.
- *CRM deferred — Close requires paid trial. Spreadsheet/markdown for organizer tracking until beta scale warrants it.*

### Scheduled Automations (10 active)
Competitor monitoring, context refresh, context freshness check, UX spots, health scout (weekly), monthly digest, workflow retrospective, weekly Power User sweep, daily friction audit (Mon-Fri 8:30am), weekly pipeline briefing (Mon 9am). Managed by Cowork Power User + findasale-workflow + findasale-sales-ops agents.

---

**Sessions 186–195 COMPLETE (2026-03-13–17):**
- Wave 2–4 QA sprints, 29 features audited. Vercel build recovered (8 TS errors fixed).
- Bugs: login redirect loop, Google Fonts CSP, dark mode, ThemeToggle visibility, service worker image loading, CityHeatBanner coordinates.
- Full history: session-log.md + git log.
