# PROJECT STATE

Compression anchor. Active state only.
Historical detail: `claude_docs/COMPLETED_PHASES.md`

---

## Active Objective

**Session 251 COMPLETE (2026-03-23) — STRATEGIC DECISIONS RECORDED:**
- ✅ **D-011: Gamification Core Loop** — Points ($1 = 1pt, referral 50pts), redeem for Hunt Pass (500pts) or $10 off (1000pts), badges cosmetic + yearly reset, Collector Passport hub, leaderboard paused for beta, organizer reputation separate
- ✅ **D-012: Feature Overlap Consolidation** — Favorites + Wishlists + Alerts → `/shopper/wishlist`, remove redundant pages, audit Sale Interests (rename or remove)
- ✅ **D-013: Support Tier Definitions** — SIMPLE (FAQ), PRO (48h email), TEAMS (24h + onboarding), ENTERPRISE (named contact, 4h), Intercom/Crisp automation stack
- ✅ **D-014: Page Consolidation** — Keep `/pricing` + `/organizer/subscription`, remove `/premium` + `/upgrade`, all CTAs to `/pricing`, Performance → Insights redirect
- ✅ **D-015: Profile vs Settings Split** — Profile (identity, public), Settings (controls, write-heavy), separate per role, push notifications in Settings only
- ✅ **D-016: Shopper/Organizer Settings Parity** — Organizer comprehensive, shopper minimal (different roles), no cross-import of org features, 3 shopper additions post-beta
- ⚠️ **S252 PRIORITY 1 — Dev dispatch:** Wishlist consolidation (FV1, AL1, PR5), pricing page copy update (P3), page removals (/premium, /upgrade, /alerts, /favorites), D-014 consolidation, D-015 split
- ⚠️ **S252 PRIORITY 2 — QA dispatch:** Double footers (I2, CP3, LY11, AL5, TR2, S3), TR1/OP1/OS3 missing routes, remaining walkthrough items
- Last Updated: 2026-03-23

**Session 250 COMPLETE (2026-03-23) — SEED DATA OVERHAUL:**
- ✅ **S249 item-library.tsx Vercel fix** — `user?.organizerProfileId` → `user?.id` (commit d12fb1b). Vercel confirmed GREEN.
- ✅ **Seed data overhaul COMPLETE** — All 14 DATA items from S248 walkthrough now covered. seed.ts rewritten (828 lines). Seed ran clean on Neon with zero errors.
  - 100 users, 10 organizers (3 tiers: 1×SIMPLE admin, 1×PRO, 1×TEAMS), 25 sales, 308 items (3 auction)
  - 54 purchases (6 for user11), 9 bids (user11 active bidder), 8 badge types, wishlists + alerts, follows + smart follows
  - Notifications (6 types), TreasureTrail (3-stop GR loop), ShopperStamps + milestone, CollectorPassport
  - Referral chain (user12→user11→user13), 3 MissingListingBounties, UserStreaks, OrganizerReputations
  - PointsTransactions, Conversations + Messages, 3 FraudSignals (admin command center)
  - Stripe-enabled: user2 (PRO) + user3 (TEAMS) have stripeConnectId + stripeCustomerId
- Last Updated: 2026-03-23

**Session 249 COMPLETE (2026-03-23) — WALKTHROUGH BUG + DARK MODE FIX BATCH:**
- ✅ **18 bug fixes shipped:** FAQ characters (F1-F3), shopper tier message (P1), access denied redirect (P7), search expanded to items+organizers (H4), leaderboard organizer links (L8), contact form submit (C2), "sales near you" error state (SD3), dashboard stat buttons navigate (SD6), follow seller end-to-end (SD9), workspace domain→finda.sale (OS2), flip report empty state (FR1), item library auth fix (IL1), print inventory verified (PI1)
- ✅ **8 dark mode violations fixed:** SD2 (overview), SD8 (pickups), M4 (route builder), AL2 (alerts), TY1 (typology), PY1 (payouts), ST1 (sales tab), H13 (organizer pages pass)
- ⚠️ **Carry-forward:** Double footers (I2, CP3, LY11, AL5, TR2, S3) + TR1/OP1/OS3 missing routes — decisions needed from Patrick
- Last Updated: 2026-03-23

**Session 248 COMPLETE (2026-03-23) — REMOVAL GATE + 114-ITEM WALKTHROUGH AUDIT:**
- ✅ **Vercel deployment verified GREEN** — all S247 commits deployed successfully
- ✅ **Security triage:** C1 (admin verification routes), H1 (JWT fallback), H2 (/api/dev) — all already fixed in codebase. Health report from 03-22 was pre-fix.
- ✅ **CLAUDE.md §7 Removal Gate added:** Subagents must return "DECISION NEEDED" blocks instead of executing removals. Orchestrator triages FIX/REDIRECT/REPLACE silently; only REMOVE goes to Patrick.
- ✅ **D-010 added to DECISIONS.md:** "No Autonomous Removal of User-Facing Content" — standing decision with tightened dead-code exemption ("not wired into nav" ≠ dead).
- ✅ **findasale-dev skill updated:** §17 Removal Gate added. Packaged as .skill for install.
- ✅ **findasale-qa skill updated:** Decision Point Protocol added. Packaged as .skill for install.
- ✅ **114-item walkthrough findings documented:** Patrick's full-site walkthrough organized into S248-walkthrough-findings.md. Categories: 29 BUG, 8 DARK, 41 UX, 14 DATA, 17 STRATEGIC, 5 DUP.
- ⚠️ **Patrick action needed:** Install findasale-dev.skill and findasale-qa.skill via Cowork UI
- ⚠️ **Patrick action needed:** Push block provided (CLAUDE.md + DECISIONS.md + walkthrough doc)
- ⚠️ **S249 PRIORITY 1:** Start fixing BUG + DARK items from walkthrough (29 bugs, 8 dark mode — mechanical fixes, no decisions needed)
- ⚠️ **S249 PRIORITY 2:** Seed data overhaul — 14 items untestable without realistic test data
- ⚠️ **STRATEGIC SESSION NEEDED:** Gamification spec, feature overlap consolidation (favorites/wishlists/alerts/sale interests), support tier definitions, page consolidation (premium/subscription/upgrade)
- Last Updated: 2026-03-23

**Session 247 COMPLETE (2026-03-23) — ROLE-BASED NAV FIX + ORGANIZER PROFILE + DESTRUCTIVE REMOVAL PATTERN:**
- ✅ Root cause found and fixed for organizer profile blank since S237
- ✅ AvatarDropdown, Layout.tsx, profile.tsx, AuthContext.tsx all updated
- ✅ Vercel build fix pushed (fcfa835)
- Last Updated: 2026-03-23

**Session 246 COMPLETE (2026-03-23) — SHOPPER QA SCAN + CRITICAL BUILD HOTFIXES:**
- ✅ QA scan: 14 items tested (9 passed, 1 fixed, 1 inconclusive, 3 unverified)
- ✅ B1 Favorites fix pushed (Array.isArray guard)
- ✅ HOTFIX: profile.tsx stray `>` + auth.ts `requireAdmin`
- Last Updated: 2026-03-23

---

**Pricing Model (LOCKED):**
- **SIMPLE (Free):** 10% platform fee, 200 items/sale included, 5 photos/item, 100 AI tags/month
- **PRO ($29/month or $290/year):** 8% platform fee, 500 items/sale, 10 photos/item, 2,000 AI tags/month, unlimited concurrent sales, batch operations, analytics, brand kit, exports
- **TEAMS ($79/month or $790/year):** 8% platform fee, 2,000 items/sale, 15 photos/item, unlimited AI tags, multi-user access, API/webhooks, white-label, priority support, **12-member cap (D-007 LOCKED)**
- **ENTERPRISE (Custom, $500–800/mo):** Unlimited members, dedicated support, SLA (D-007 LOCKED)
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

## Active Infrastructure

### Connectors
- **Stripe MCP** - query payment data, manage customers, troubleshoot payment issues. Connected S172.
- **MailerLite MCP** - draft, schedule, and send email campaigns directly from Claude.
- *CRM deferred - Close requires paid trial. Spreadsheet/markdown for organizer tracking until beta scale warrants it.*

### Scheduled Automations (11 active)
Competitor monitoring, context freshness check (weekly Mon), UX spots, health scout (weekly), monthly digest, workflow retrospective, weekly Power User sweep, daily friction audit with action loop (Mon-Fri 8:38am), weekly pipeline briefing (Mon 9am), session warmup (on-demand), session wrap (on-demand). Managed by findasale-records + findasale-workflow + findasale-sales-ops agents.
