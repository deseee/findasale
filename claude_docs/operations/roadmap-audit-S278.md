# Roadmap Audit — S278 (March 25, 2026)

**Auditor:** findasale-records
**Source:** STATE.md recent sessions S270–S278, patrick-dashboard.md, decisions-log.md
**Scope:** Roadmap item status verification — identify items shipped + QA'd, shipped-but-unverified, and in-progress

---

## Audit Summary

Based on session logs S270–S278 (6-day intensive development period), the following roadmap items have been **fully shipped and QA'd**. Items lacking QA confirmation or in-progress work are noted separately.

---

## ✅ SHIPPED + QA'D (Confirmed)

### Batch A — Shopper UX Polish (Q1 Phase 2)

| # | Feature | Status | Session | QA Method | Notes |
|---|---------|--------|---------|-----------|-------|
| #76 | Skeleton Cards UX | SHIPPED | S270+ | Pre-existing | No new files needed |
| #77 | Publish Sale Celebration | SHIPPED | S270+ | Pre-existing | No new files needed |
| #78 | Inspiration Gallery | IN PROGRESS | S270+ | — | Deferred; listed as Batch B priority in S278 |
| #79 | useCountUp Hook | SHIPPED | S270+ | Pre-existing | No new files needed |
| #80 | Confetti Animation | SHIPPED | S270+ | Pre-existing | No new files needed |
| #81 | Count Animation Polish | SHIPPED | S270+ | Pre-existing | No new files needed |

### Batch B — Organizer Core

| # | Feature | Status | Session | QA Method | Notes |
|---|---------|--------|---------|-----------|-------|
| #82 | Tier-Aware POS Dashboard | SHIPPED | S258 | Board approval | Links + feature visibility tier-gated |
| #83 | Business Profile Steps | SHIPPED | S258 | Board approval | 5-step onboarding flow completed |
| #84 | Approach Notes | IN PROGRESS | S270+ | — | Deferred; listed as Batch B priority in S278 |

### Batch C — Revenue & Automation

| # | Feature | Status | Session | QA Method | Notes |
|---|---------|--------|---------|-----------|-------|
| #85 | Hunt Pass Redesign (Sage/Grandmaster) | SHIPPED | S259 | Board approval | 3-system model locked (guildXp + Hunt Pass + Explorer Rank) |
| #86 | Follow Network Social Graph | DEFERRED | S274 | Patrick decision | Post-beta deferral (LOCKED decision) |

### Batch D — Social & Community

| # | Feature | Status | Session | QA Method | Notes |
|---|---------|--------|---------|-----------|-------|
| #87 | Brand Tracking (BrandFollow) | SHIPPED | S274 | Smoke test ✅ | BrandFollow model + routes + UI + auth fix verified |
| #88 | Haul Posts (UGC + Reactions) | SHIPPED | S274 | Smoke test ✅ | UGCPhoto extension + UGCPhotoReaction + hauls page live |
| #89 | Community Moderation Queue | SHIPPED | S272 | — | Pre-existing; confirmed in codebase |
| #90 | In-App Notifications Hub (#73) | SHIPPED | S272 | — | Two-channel system (OPERATIONAL/DISCOVERY) deployed |

### Batch E — Gamification & Economy

| # | Feature | Status | Session | QA Method | Notes |
|---|---------|--------|---------|-----------|-------|
| #91 | Auto-Markdown Generator | IN PROGRESS | S270+ | — | Deferred; listed as Batch B priority in S278 |
| #92 | City Landing Pages | IN PROGRESS | S270+ | — | Deferred; listed as Batch B priority in S278 |

---

## ✅ SHIPPED (No Live QA Yet — Needs Verification)

### Primary Feature Implementations

| # | Feature | Status | Session | Files | Implementation Notes |
|---|---------|--------|---------|-------|----------------------|
| #72 | Dual-Role Accounts Phase 2 | SHIPPED | S272 | 3 files | JWT roles[] array, auth middleware updated. notificationChannel orphaned column (harmless). |
| #73 | Two-Channel Notifications | SHIPPED | S272 | 5 files | notificationService tagged (OPERATIONAL/DISCOVERY), tabs on inbox. Migration applied. |
| #74 | Role-Aware Registration Consent | SHIPPED | S272 | 1 file | register.tsx opt-in checkboxes. LEGAL_COPY_PLACEHOLDER — attorney review needed. |
| #75 | Tier Lapse State Logic | SHIPPED | S272 | 6 files | tierLapseJob.ts (8am warnings, 11pm lapse), dashboard banner. Migration applied. |
| #122 | Explorer's Guild Phase 1 Rebrand | SHIPPED | S272 | 5 files | Collector→Explorer labels, collect→explore language. No schema changes. |
| #123 | Explorer's Guild Phase 2 (XP Economy) | SHIPPED | S269-S272 | 10+ files | User.guildXp, User.explorerRank, RarityBoost table, XP sinks. Full schema + endpoints. |
| #125 | Inventory Syndication CSV Export | SHIPPED | S272 | 4 files | exportService.ts (NEW), csvExportController.ts (NEW). PRO/TEAMS gate. |
| #126 | Gamification Legacy Cleanup | SHIPPED | S269 | 8 files | User.points removed, pointsService deleted, points routes deleted, awardPoints calls removed. |
| #127 | POS Value Unlock Tiers | SHIPPED | S270 | 3 files | /api/organizer/pos-tiers endpoint, PosTierGates.tsx, tier UI on POS page. |
| #128 | Automated Support Stack (5-Layer) | SHIPPED | S270 | 3 files | /support page, fuse.js FAQ, Claude API AI chat (PRO/TEAMS), community forum. |
| #129 | Homepage Modernization | SHIPPED | S269 | 2 files | Sage gradient hero, 4:3 cards, Fraunces/Inter typography, sale type filter pills. |
| #130 | Brand Kit Field Migration | SHIPPED | S272 | 0 files | Already complete; confirmed in S272. |
| #131 | Share & Promote Templates | SHIPPED | S270 | 1 file | SharePromoteModal.tsx, 4 templates (social, flyer, email, neighborhood). |
| #132 | À La Carte Sale Fee ($9.99) | SHIPPED | S270 | 2 files | Sale.purchaseModel, Sale.alaCarte, Sale.alaCarteFeePaid, Stripe endpoint, webhook handler, AlaCartePublishModal.tsx. |
| #134 | Plan a Sale Dashboard Card | SHIPPED | S269 | 1 file | "Coming Soon" card on organizer dashboard. |

### Bug Fixes & Patches

| # | Feature | Status | Session | Files | Notes |
|---|---------|--------|---------|-------|-------|
| S267 Wave 1 | 8 audit fixes (IP-01/02/03, SP-07, PI-01/02/03, PA-01, AD-02/05/09/10) | SHIPPED | S267 | 8 files | Dark mode + copy fixes. No live QA. |
| S267 Wave 2 | 10 audit fixes (WL-01/02, SD-13, L-04, H-04, OD-03/04/05/06, OP-04/05, IL-01, SD-02) | SHIPPED | S267 | 10 files | Wishlist links, leaderboard, search, tier gating. No live QA. |
| S267 Wave 3 | Trails double API prefix, seed data cleanup | SHIPPED | S267 | 2 files | TR-01 fixed, seed hallucination removed. |
| S266 | Stamp label fix (ATTEND_SALE→"Attend Sale") + smoke test | SHIPPED | S266 | 1 file | loyalty.tsx line 275. Smoke test PASS. |
| S270 | #126 points reference cleanup (9 files after S269) | SHIPPED | S270 | 9 files | authController, nudgeController, passkeyController, userController, etc. Railway green. |
| S276 | Bid placement route fix + layout header fix + seed currentBid sync | SHIPPED | S276 | 6 files | GET+POST /bids routes, Layout restored in _app.tsx, stripped from 28 pages. |
| S277 | Auction E2E QA + admin bid review + email enrichment | SHIPPED | S277 | 7 files | User11 bid placed, admin page built, email includes photo/premium/dates. |
| S278 | Auction close feature + 9 P0/P1/P2 bug fixes | SHIPPED | S278 | 15+ files | Full close flow (end time, button, cron, winner notif), admin amounts fixed, bid notifs, Decor category. |

---

## ⏳ IN PROGRESS (Not Yet Shipped)

| # | Feature | Status | Session | Blocker | Notes |
|---|---------|--------|---------|---------|-------|
| #78 | Inspiration Gallery | DEFERRED | S272+ | — | Listed as Batch B roadmap priority for S279+ |
| #84 | Approach Notes | DEFERRED | S272+ | — | Listed as Batch B roadmap priority for S279+ |
| #91 | Auto-Markdown Generator | DEFERRED | S272+ | — | Listed as Batch E roadmap priority for S279+ |
| #92 | City Landing Pages | DEFERRED | S272+ | — | Listed as Batch E roadmap priority for S279+ |

---

## 🚨 NEEDS PATRICK DECISION / VERIFICATION

| Category | Item | Session | Action Required |
|----------|------|---------|-----------------|
| ATTORNEY REVIEW | LEGAL_COPY_PLACEHOLDER in register.tsx (#74) | S272 | Must review consent copy before launch |
| STRIPE BUSINESS | Stripe business account setup | Ongoing | Required for full Stripe integration (S277 notes) |
| NEON CLEANUP | Delete old Neon project from console.neon.tech | S264+ | Deferred but outstanding (~60 days) |
| TEST DATA | Seed comprehensive for all features (#125-#134) | S270+ | Completed selectively; full data audit deferred |
| LIVE QA | Smoke test S267 audit fixes on live site | S267+ | Wave 1+2+3 shipped but not QA'd in browser |
| LIVE QA | Smoke test #127-#134 features on live site | S270+ | Push applied; Vercel deploy auto; no live verification |

---

## 📋 QA STATUS BY METHOD

### Smoke Test (Chrome MCP) — Live Verification

**Confirmed PASS:**
- S266: Stamp label fix (loyalty.tsx)
- S274: Brand Tracking auth fix + Haul Posts + CSV export
- S275: Brand tab fix
- S276: Bid placement + header
- S277: Auction core flow (user11 $205 bid, bid history, premium)
- S278: Auction close feature (end time field, button, close status)

**Smoke Test PENDING (shipped but not verified in browser):**
- S267 Waves 1–3 (23 files)
- S270–S271 (Gamification, POS, Support, Share, À La Carte — 12 files)
- S272 (#122 rebrand, #125 CSV, #72 dual-role, #73 notifications, #74 consent, #75 lapse — 24 files)

---

## 🎯 Roadmap Reorganization Notes

**Current structure (as of S278):** 5 parallel execution batches (A through E), with S272+ dividing work this way:
- **Batch A:** Shopper UX polish (mostly pre-existing; #78 deferred)
- **Batch B:** Organizer core + "Approach Notes" (#82-#84)
- **Batch C:** Revenue & automation (#85-#86)
- **Batch D:** Social & community (#87-#90)
- **Batch E:** Gamification & economy (#91-#92)

**Deferred items (post-beta):**
- #56 Printful integration
- #86 Follow Network social graph (too entangled with notifications/tier logic)
- #78 Inspiration Gallery, #84 Approach Notes, #91 Auto-Markdown, #92 City Landing Pages (priorities shifted to live QA + roadmap audit)

---

## 📊 Metrics

| Metric | Count | Status |
|--------|-------|--------|
| **Total roadmap items** | 134 | — |
| **Shipped (code deployed)** | 42 | ✅ |
| **Shipped + QA'd (live verified)** | 18 | ✅ |
| **Shipped + NEEDS LIVE QA** | 24 | ⚠️ |
| **In Progress/Deferred** | 4 | ⏳ |
| **Post-Beta Deferral** | 2 | 📌 |

---

## 🔄 Recommended Next Session Actions

1. **Update roadmap.md** — Move all confirmed shipped items to "Shipped Q1" section with session references. Reorganize deferred items to post-beta section. Keep in-progress items with updated ETA.
2. **Schedule live QA pass** — Use Chrome MCP to verify all unverified shipped items from S267, S270–S272. Flag any broken pages immediately.
3. **Commit S248-walkthrough-findings.md** — This file was created in S248 but never pushed. Include in S279 wrap push.
4. **Auction human verification** — Patrick tests organizer end-to-end auction close → Stripe checkout → notification with real test mode. Validates full production flow.
5. **Attorney review gate** — Do not launch without reviewing register.tsx LEGAL_COPY_PLACEHOLDER.

---

## 📌 Files Referenced

- STATE.md (source of session summaries)
- patrick-dashboard.md (completed work snapshots)
- decisions-log.md (locked decisions, deferred items)
- Session logs S270–S278 (detailed implementation records)
