# PROJECT STATE

Compression anchor. Active state only.
Historical detail: `claude_docs/COMPLETED_PHASES.md`

---

## Active Objective

**Session 214 COMPLETE (2026-03-20) — CHROME VERIFICATION + #70 FULLY COMPLETE:**
- ✅ **Chrome re-verify DONE:** 13/15 PASS — all S212/S213 fixes confirmed. 2 "fails" were wrong test URLs (not real bugs). Flag: `/organizer/subscription` PRO user sees upgrade CTA — possible `useOrganizerTier` issue, queued S215.
- ✅ **#70 FULLY COMPLETE:** LiveFeedTicker placed on sale detail page (`/sales/[id]`). Real-time feed live for shoppers.
- ✅ **#19 Passkey: DEPLOYED** — live on Railway + Vercel, no further action needed.
- ✅ **S213 secondary route security fixes shipped:** encyclopedia ownership, hub 500-cap, price history visibility.
- Last Updated: 2026-03-20

**Pricing Model (LOCKED):**
- **SIMPLE (Free):** 10% platform fee, 200 items/sale included, 5 photos/item, 100 AI tags/month
- **PRO ($29/month or $290/year):** 8% platform fee, 500 items/sale, 10 photos/item, 2,000 AI tags/month, unlimited concurrent sales, batch operations, analytics, brand kit, exports
- **TEAMS ($79/month or $790/year):** 8% platform fee, 2,000 items/sale, 15 photos/item, unlimited AI tags, multi-user access, API/webhooks, white-label, priority support
- **Overages:** SIMPLE $0.10/item beyond 200; PRO $0.05/item beyond 500; TEAMS $0.05/item (soft cap)
- **Shopper Monetization:** 5% buyer premium on auction items ONLY; Hunt Pass $4.99/mo (PAUSED); Premium Shopper (DEFERRED to 2027 Q2)
- **Post-Beta:** Featured Placement $29.99/7d, AI Tagging Premium $4.99/mo (SIMPLE), Affiliate 2–3%, B2B Data Products (DEFERRED)
- **Sources:** pricing-and-tiers-overview-2026-03-19.md (complete spec), BUSINESS_PLAN.md (updated), b2b-b2e-b2c-innovation-broad-2026-03-19.md (B2B/B2E/B2C strategy)

**DB test accounts (Neon production — current):**
- `user1@example.com` / `password123` → ADMIN role, SIMPLE tier organizer
- `user2@example.com` / `password123` → ORGANIZER, PRO tier ✅
- `user3@example.com` / `password123` → ORGANIZER, TEAMS tier ✅
- `user11@example.com` / `password123` → Shopper

---

**Next up (S215):**
- [ ] Subscription tier bug — PRO user sees upgrade CTA (`useOrganizerTier` fix)
- [ ] P2 backlog: error shape inconsistency, holds pagination, hub N+1
- [ ] Design polish: #76 skeleton loaders, #77 celebration screen, #81 empty states
- [ ] Platform safety P0: #93 account age gate, #95 velocity limits, #96 premium disclosure
- [ ] Architect ADR: #72 Dual-Role Account Schema (gates #73, #74, #75)
- [ ] Chrome audit: 7 secondary routes + sale detail LiveFeedTicker verify
- [ ] Deferred pre-wires: consignment fields, affiliate payout table to schema
- [ ] #92 City Weekend Landing Pages (SEO sprint)
- [ ] #51 Sale Ripples: Neon migration + `prisma generate` still pending (Patrick action)

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
