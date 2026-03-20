# PROJECT STATE

Compression anchor. Active state only.
Historical detail: `claude_docs/COMPLETED_PHASES.md`

---

## Active Objective

**Session 207 COMPLETE (2026-03-19) — PRICING LOCK + B2B/B2E/B2C INNOVATION + ROADMAP V63:**
- Locked all pricing decisions (10%/8%/8% tiered, 5% auction buyer premium, $29/$79 subscriptions, overages model)
- Created pricing-and-tiers-overview-2026-03-19.md with full locked specifications
- Updated BUSINESS_PLAN.md: pricing sections, revenue model, subscription tiers, post-beta add-ons
- Added 15 B2B/B2E/B2C innovation items to roadmap Deferred section (require 200+ organizers)
- Added tiered photo storage migration (#121) as P1 Platform Safety item
- Roadmap now at v63 (from v62); total deferred innovations: 43 items
- Updated session-log.md with Session 207 work summary

**Pricing Model (LOCKED — Session 207):**
- **SIMPLE (Free):** 10% platform fee, 200 items/sale included, 5 photos/item, 100 AI tags/month
- **PRO ($29/month or $290/year):** 8% platform fee, 500 items/sale, 10 photos/item, 2,000 AI tags/month, unlimited concurrent sales, batch operations, analytics, brand kit, exports
- **TEAMS ($79/month or $790/year):** 8% platform fee, 2,000 items/sale, 15 photos/item, unlimited AI tags, multi-user access, API/webhooks, white-label, priority support
- **Overages:** SIMPLE $0.10/item beyond 200; PRO $0.05/item beyond 500; TEAMS $0.05/item (soft cap)
- **Shopper Monetization:** 5% buyer premium on auction items ONLY; Hunt Pass $4.99/mo (PAUSED); Premium Shopper (DEFERRED to 2027 Q2)
- **Post-Beta:** Featured Placement $29.99/7d, AI Tagging Premium $4.99/mo (SIMPLE), Affiliate 2–3%, B2B Data Products (DEFERRED)
- **Sources:** pricing-and-tiers-overview-2026-03-19.md (complete spec), BUSINESS_PLAN.md (updated), b2b-b2e-b2c-innovation-broad-2026-03-19.md (B2B/B2E/B2C strategy)

**Pending Patrick pushes (Session 207):**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add claude_docs/strategy/pricing-and-tiers-overview-2026-03-19.md claude_docs/strategy/BUSINESS_PLAN.md claude_docs/strategy/roadmap.md claude_docs/STATE.md claude_docs/session-log.md
git commit -m "S207: lock pricing model, add B2B/B2E/B2C innovation roadmap items, tiered photo storage"
.\push.ps1
```

**DB test accounts (Neon production — current):**
- `user1@example.com` / `password123` → ORGANIZER, SIMPLE tier
- `user2@example.com` / `password123` → ORGANIZER, PRO tier
- `user3@example.com` / `password123` → ORGANIZER, TEAMS tier
- `user11@example.com` / `password123` → Shopper

---

**Next up (S206) — CHROME + NAV + HUMAN PREP:**
- [ ] Chrome column verification — test features in browser via Chrome MCP
- [ ] Nav column audit — verify nav links in Layout.tsx match roadmap
- [ ] Human column prep — organize E2E test flows for Patrick
- [ ] #19 Passkey re-QA — end-to-end after P0 race fix
- [ ] #70 Live Sale Feed — needs live Socket.io testing

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
