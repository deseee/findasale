# Decisions Log

Append-only. Max 3 lines per decision. Oldest entries pruned after 30 days.
Only decisions that affect future sessions — not implementation details.

---

## 2026-04-11 (S441) — Team Collaboration System Approved (14 Ideas, 4 Pages)

**Status:** LOCKED
**Made by:** Patrick
**Rationale:** Staff, Workspace Settings, Workspace View, and Command Center redesigned as cohesive team collaboration system. Workspace View converts from public to internal collaboration hub (public team spotlighting moves to organizer profile page). Staff gets full employee management (contact info, availability, skill tags, performance, coverage alerts). Workspace Settings gets templates (Empty/Solo/2-Person/5-Person/Custom), editable role permissions, brand rules, cost calculator. Command Center gets weather alerts, inactivity monitoring, coverage gap warnings, analytics. All 14 innovation ideas approved except Idea 9 (bulk member invite — deferred to Enterprise). Multiple workspaces deferred. Role permissions editable. Full scope: ADR at `claude_docs/strategy/TEAM_COLLABORATION_ADR.md`.

---

## 2026-04-10 (S436) — Sale Hubs Repurposed as Flea Market Events Foundation

**Status:** LOCKED
**Made by:** Patrick
**Rationale:** Hubs as built (one organizer pools their own sales) solves a problem that doesn't exist — organizers don't run 3 simultaneous estate sales in the same area. Treasure Trails already covers multi-sale discovery better. Hubs outer shell (geo-container, event date/name, public landing page, map) is the right skeleton for flea market events. Folds #238 into this repurpose.
**Locked decisions:** (1) Tier = TEAMS. (2) hubType = all four: FLEA_MARKET, VENDOR_MARKET, SWAP_MEET, ANTIQUE_FAIR. (3) Booth limits = unlimited for TEAMS — event size is the natural constraint. (4) Payout triggers = organizer's choice: end of event / manual / scheduled (net-30 or weekly). Auto-settlement via QR scan data is the key differentiator — no competitor has it.
**References:** ADR-014, `claude_docs/research/flea-market-software-competitive-analysis.md`

---

## 2026-04-07 (S413) — Brand-Spreading Features Are Never Tier-Gated

**Status:** LOCKED
**Made by:** Patrick
**Rationale:** Features that spread the FindA.Sale brand organically — social post generator, referral sharing, invite flows, and similar — must never be gated behind a paid tier, regardless of backend cost implications (Anthropic API tokens, Cloudinary, etc.). The acquisition value of brand spreading exceeds the marginal cost. This decision supersedes any generic "gate expensive AI features" guidance. Backend routes for these features use `authenticate` only (no `requireTier`). Frontend shows no `TierGate`. Applies to: Social Post Generator (`/api/social-post/generate`), referral sharing. When in doubt about a new feature, ask: "Does using this feature put FindA.Sale in front of new eyes?" — if yes, it stays ungated.

---

## 2026-04-04 (S392) — TEAMS Default Member Limit Reduced to 5 + Purchasable Upgrade

**Status:** LOCKED
**Made by:** Patrick
**Rationale:** Research shows most sale teams are fewer than 5 people. TEAMS default member cap reduced from 12 to 5. Additional team member slots available as purchasable upgrade at $20/month per seat. Enterprise remains unlimited. This creates a natural upsell path: TEAMS base (5 members) → additional seats ($20/mo each) → Enterprise ($500/mo unlimited). Centralized in tierLimits.ts maxTeamMembers field.

---

## 2026-04-04 (S392) — À La Carte Feature Set Defined

**Status:** LOCKED
**Made by:** Patrick
**Rationale:** The $9.99 per-sale ala carte fee (S268) now has a defined feature set: 500 items per sale, 10 photos per item, 500 auto tags for that sale, Flip Report, Virtual Queue (Hold & Reservations). Platform fee remains 10% (same as SIMPLE). Multi-platform exports are NOT an ala carte differentiator — already available to all tiers. Designed as "PRO capacity for one sale" to drive PRO conversion after 3 purchases ($29.97 > $29/mo PRO). Supersedes the vague "Everything in SIMPLE" framing.

---

## 2026-04-04 (S392) — S251 Support Tiers SUPERSEDED by S268 Automated Support Stack

**Status:** LOCKED (clarification)
**Made by:** Patrick
**Rationale:** S251 (Support Tier Definitions) is superseded by S268 (Automated Support Stack — Zero-Human, 5-Layer). The pricing page must NOT show: "Email support, 48-hour SLA" (PRO), "24-hour SLA + 1 onboarding call" (TEAMS), or "Dedicated account manager" (TEAMS). Correct support language: SIMPLE = self-serve help center + organizer guides; PRO = 24/7 support assistant + help center; TEAMS = community forum + support assistant + help center; ENTERPRISE = dedicated support contact. No SLA promises on any tier. No "AI" in support language.

---

## 2026-04-04 (S392) — Feature Naming Standardization (Pricing Page)

**Status:** LOCKED
**Made by:** Patrick
**Rationale:** Three renames locked for all customer-facing copy: "AI tags" → "Auto Tags", "AI valuation engine" → "Smart Pricing", "Link click stats" → "Ripples". No feature on the pricing page or in-app menus should reference "AI" in its name. These names apply to the pricing page, TierComparisonTable, and any marketing copy.

---

## 2026-03-30 (S341) — Hold-to-Pay Architecture Decisions (7 items)

**Status:** LOCKED (all 7 items)

**1. Stripe fee model — organizer pays (matches POS/Buy Now)**
**Status:** LOCKED
**Rationale:** Same application_fee_amount + transfer_data destination charges model as existing flows. Organizer absorbs Stripe processing fee (~3%) on top of platform fee. Shopper pays item price only. This model was decided in prior sessions (S176+) — logged here as explicit reference anchor.

**2. Invoice bundling — per shopper per sale**
**Status:** LOCKED
**Rationale:** One consolidated Stripe Checkout link per shopper covering ALL their held items at a given sale. Not per-item. Not cross-organizer (only one organizer per checkout). Simplifies reconciliation and shopper UX.

**3. Payment retry window — hold timer is the deadline**
**Status:** LOCKED
**Rationale:** Shopper can retry payment any number of times as long as their hold timer is still active. No separate invoice retry window. Invoice expires when hold expires. Hold duration = payment deadline (30–90 min by rank).

**4. Flash liquidation — organizer opt-in per sale**
**Status:** LOCKED
**Rationale:** When a hold expires without payment, the organizer manually activates the flash liquidation window (not automatic). Toggle in OrganizerHoldSettings. Prevents accidental liquidations and respects organizer intent.

**5. Shopper notification on invoice — in-app + email**
**Status:** LOCKED
**Rationale:** Both channels. In-app notification (existing Notification model) + email via Resend. No SMS. Provides redundant delivery of critical payment deadline.

**6. Organizer payout timing — immediate (matches POS/Buy Now)**
**Status:** LOCKED
**Rationale:** Immediate transfer to organizer's Stripe Connect account via transfer_data destination on payment capture. Stripe handles bank payout on its standard schedule. No custom batching. Matches existing POS and Buy Now payout flow.

**7. Invoice payment window = hold timer remainder (game design windows dropped)**
**Status:** LOCKED
**Rationale:** The architect's game design decision for separate rank-gated invoice windows (Initiate 2h → Grandmaster 8h) is SUPERSEDED. The payment window is simply the time remaining on the hold when the invoice is sent. Rank already expresses itself in hold duration (30–90 min). No additional rank-gated invoice window needed. Simplification reduces complexity without losing rank signal.

---

## 2026-03-30 (S341) — Platform Fee Model (Organizer-Paid, Shopper-Free)

**Status:** LOCKED
**Made by:** Records audit (clarification of prior decisions)
**Rationale:** Platform fee (10% or 8%) is paid by the ORGANIZER, deducted from their Stripe Connect payout. Shoppers only pay 5% auction fee (auction sales only). Shoppers never see a platform fee line item — they pay item price only. Hold-to-Pay Remote Path: shopper pays item price via consolidated Stripe Checkout link, organizer receives item price minus platform fee. This model was decided in S106/S153/S176 but got lost in context.

---

## 2026-03-24 (S274) — #86 Follow Network DEFERRED Post-Beta

**Status:** DEFERRED
**Made by:** Patrick (approved Architect recommendation)
**Rationale:** Social graph infra (follows, friend lists, activity feeds) entangles with notifications (#72 phase 2), tier logic (#75), and abuse/privacy guardrails. Deferred until after beta feedback on #87/#88 social features. Returns to roadmap as S2 post-beta item. Haul Posts (#88) shipped first as planned foundation.

---

## 2026-03-24 (S274) — #87 Brand Tracking Schema (BrandFollow)

**Status:** LOCKED
**Made by:** Architect
**Rationale:** New BrandFollow table: userId + brandName + notifyEmail/notifyPush + @@unique([userId, brandName]). Separate from organizer Follow model (different notification semantics — brand follow triggers on Item.tags match, not organizer publish). Migration: 20260324_add_brand_follow. 4 endpoints: GET/POST/DELETE brand-follows + notification trigger on item publish.

---

## 2026-03-24 (S274) — #88 Haul Posts Schema (UGCPhoto extension + UGCPhotoReaction)

**Status:** LOCKED
**Made by:** Architect
**Rationale:** Extends existing UGCPhoto model (isHaulPost Boolean, linkedItemIds String[], likeCount Int). New UGCPhotoReaction model (userId, photoId, type=LIKE, @@unique). Separate from existing UGCPhotoLike (different reaction semantic — likes on haul posts vs. existing photo likes). Migration: 20260324_add_haul_posts_and_reactions. MVP: likes only, no comments.

---

## 2026-03-24 (S268) — Gamification 3-System Model (guildXp + Hunt Pass + Explorer Rank)

**Status:** LOCKED
**Made by:** Patrick
**Rationale:** Three coexisting systems: (1) guildXp — earned currency from shopping actions, (2) Hunt Pass — $4.99/mo shopper subscription with Sage/Grandmaster exclusives (6h Legendary-first access, 1.5x XP multiplier, Loot Legend portfolio, Collector's League leaderboard), (3) Explorer Rank — progression track (Initiate→Scout→Ranger→Sage→Grandmaster). Legacy cleanup required: delete old points system ($1=1pt), purchase-count badge triggers (25/100/250), old Hunt Pass checkout flow. Collector Passport renamed to Loot Legend (single feature, single name).

---

## 2026-03-24 (S268) — Automated Support Stack (Zero-Human, 5-Layer)

**Status:** LOCKED
**Made by:** Patrick
**Rationale:** No paid tools, no phone, no SLA, no calendar. 5 layers: L1 FAQ (fuse.js, $0), L2 AI chatbot PRO/TEAMS (Claude API ~$5/mo), L3 community forum TEAMS, L4 smart escalation (P0→Slack, P1→daily digest), L5 auto-remediation crons. Patrick contacted only for catastrophic failures.

---

## 2026-03-24 (S268) — POS Value Unlock Tiers (5/20/50 Transactions)

**Status:** LOCKED
**Made by:** Patrick
**Rationale:** Dual-gate unlock (transactions + minimum dollar spend to prevent penny-transaction gaming). Tier 1 (5 tx + $50 revenue): Item Performance Snapshot. Tier 2 (20 tx + $300 revenue): Category Deep Dive + Repeat Buyer Map. Tier 3 (50 tx + $1,000 revenue, PRO-only): Regional Pricing Benchmarks + Predictive Demand. POS abuse pipeline: scoring 0-100 across 4 patterns, three auto-response tiers, weekly Sunday digest to Patrick, cross-account detection.

---

## 2026-03-24 (S268) — Homepage Modernization (Approved Mockup)

**Status:** LOCKED
**Made by:** Patrick
**Rationale:** Sage gradient hero, 4:3 landscape card images, card footer redesign, shadows + hover lift, filter pills, Fraunces/Inter typography, map behind toggle. Mockup approved. Roadmap item #129.

---

## 2026-03-24 (S268) — Brand Kit Field Migration

**Status:** LOCKED
**Made by:** Patrick
**Rationale:** Business Name, Phone, Bio, Website URL are account basics — move to Settings/Profile. Keep social links, logo, slug, colors, fonts, banner in Brand Kit. Roadmap item #130.

---

## 2026-03-24 (S268) — Share & Promote Templates (Option B — Expand)

**Status:** LOCKED
**Made by:** Patrick
**Rationale:** Expand Share button to include multiple templates (social posts, flyers, email invites, etc.) rather than deleting or keeping minimal. Roadmap item #131.

---

## 2026-03-24 (S268) — À La Carte Single-Sale Fee ($9.99)

**Status:** LOCKED
**Made by:** Patrick
**Rationale:** New `Sale.purchaseModel` schema field. $9.99 per-sale fee for non-subscribers. Breakeven at 3 sales drives PRO conversion. Roadmap item #132.

---

## 2026-03-24 (S268) — Shopper Settings (Minimal by Design)

**Status:** LOCKED (reconfirmed from S251)
**Made by:** Patrick
**Rationale:** Shopper settings intentionally minimal. Three post-beta additions: saved payment methods, expanded notification preferences, privacy controls (profile visibility, leaderboard opt-out). No import of organizer-specific features.

---

## 2026-03-24 (S268) — Plan a Sale Dashboard Placement

**Status:** LOCKED
**Made by:** Patrick
**Rationale:** "Plan a Sale" goes on organizer dashboard, not a standalone page. Currently shows "coming soon" until full feature is built. Roadmap item #134.

---

## 2026-03-24 (S268) — Organizer Reputation Stays Separate

**Status:** LOCKED (reconfirmed)
**Made by:** Patrick
**Rationale:** Organizer reputation is ratings-based only. Zero cross-pollination with shopper gamification (guildXp, Explorer Rank, Hunt Pass).

---

## 2026-03-24 (S268) — Pricing Page = Public, Subscription Page = Organizer Management

**Status:** LOCKED (clarified from S251)
**Made by:** Patrick
**Rationale:** `/pricing` is public-facing plan comparison. `/organizer/subscription` shows what the organizer is currently signed up for (active management only). All upgrade CTAs → `/pricing`. Downstream: audit all other pages currently showing pricing and remove/redirect.

---

## 2026-03-23 (S251) — Gamification Core Loop (Points + Badges + Hunt Pass)

**Status:** LOCKED
**Made by:** Patrick
**Rationale:** Shopper engagement mechanic: earn points ($1 = 1pt, referral = 50pts), redeem for Hunt Pass (500pts) or $10 off (1000pts). Badges cosmetic only, auto-awarded at 25/100/250 purchases, reset yearly. Leaderboard paused for beta (code ships, reactivates post-beta). Collector Passport single hub for all gamification. Organizer reputation entirely separate, ratings-based, zero cross-pollination. Referral points awarded only on referred shopper's first purchase.

---

## 2026-03-23 (S251) — Feature Overlap Consolidation (Favorites + Wishlists + Alerts → Single Wishlist)

**Status:** LOCKED
**Made by:** Patrick
**Rationale:** Three separate features (Favorites heart-saves, Wishlists named collections, Alerts item notifications) consolidated into single `/shopper/wishlist` page. One nav label. Items have per-item notification toggle. Remove `/shopper/alerts` and `/shopper/favorites` pages. Audit Sale Interests on organizer profile (if live: rename to "Follow Organizers" in shopper settings; if dead code: remove).

---

## 2026-03-23 (S251) — Support Tier Definitions (SIMPLE/PRO/TEAMS/ENTERPRISE)

**Status:** LOCKED ⚠️ SUPERSEDED by S268 (Automated Support Stack) + S392 (no-SLA confirmation)
**Made by:** Patrick
**Rationale:** SIMPLE (Free): FAQ + Organizer Guide only. PRO ($29/mo): email support 48h SLA (Intercom/Crisp). TEAMS ($79/mo): 24h SLA + 1 onboarding call. ENTERPRISE: named contact, 4h SLA. Automation stack: Intercom or Crisp free tier + FAQ deflects 80% volume. Patrick handles escalations only.

---

## 2026-03-23 (S251) — Page Consolidation (Premium/Subscription/Upgrade/Settings/Profile)

**Status:** LOCKED
**Made by:** Patrick
**Rationale:** Keep `/pricing` (public) + `/organizer/subscription` (active management only). Remove `/organizer/premium` and `/organizer/upgrade` (duplicate pricing). All upgrade CTAs → `/pricing`. Plan management → `/organizer/subscription`. Performance → redirect to Insights. Profile = identity (name, photo, bio, public). Settings = controls (email, password, notifications, privacy, payments). Keep separate pages per role.

---

## 2026-03-23 (S251) — Shopper/Organizer Settings Parity

**Status:** LOCKED
**Made by:** Patrick
**Rationale:** Organizer settings stay comprehensive. Shopper settings intentionally minimal — different roles, different needs. Do NOT import organizer-specific features (API keys, webhooks, team management) into shopper settings. Three shopper additions post-beta: (1) saved payment methods, (2) expanded notification preferences, (3) privacy controls (profile visibility, leaderboard opt-out).

---

## 2026-03-22 (S237) — Transactional Email Provider (Resend → Brevo or Postmark)

**Status:** DEFERRED
**Made by:** Patrick
**Rationale:** Resend free tier (100 emails/day) exhausted by weekly digest job on Sundays. Brevo free tier = 300/day (3x headroom, no cost). Postmark = best deliverability, $15/mo. Migration is a 1-file backend change (notificationService.ts API key + SDK swap). No urgency while user count is low; revisit when daily transactional emails routinely exceed 80 or before general launch.

---

## 2026-03-18 (S198) — Roadmap 13-Column Schema + #51 Implementation Gap

**Status:** APPROVED (schema + gap identification)
**Made by:** findasale-records (audit discovery)
**Rationale:** 13-column enriched tracking schema (# | Feature | Role | Tier | Shipped | DB | API | UI | QA | Chrome | Nav | Human | Notes) adopted for all 146 Completed features. Reveals #51 Sale Ripples as false-positive QA-PASS from S195 (zero implementation on disk — no schema, no API routes, no UI). Human test column shows 📋 for all features (Patrick has never formally executed E2E checklist or mobile gestures guide). Archive re-filed (134 files from archive-old → archive). findasale-records full project docs audit deferred to S199 due to context limits.
**Consequences:** Roadmap v51 now the source of truth for 146 features with detailed column visibility. #51 moved to TIER 1 for immediate implementation (treat as new feature sprint). Patrick human test execution is future blocker for feature promotion to prod. docs audit will remediate stale content + rule violations.

---

## Session 170 — 2026-03-15

### Decision: CLAUDE.md §11 — Subagent-First Implementation Gate (HARD GATE)
**Status:** APPROVED
**Made by:** Patrick (escalation from governance violation)
**Rationale:** Session 170 main window read 940-line itemController, 393-line promote, 256-line items route, then wrote 4 new code files inline. Violated existing "default to subagents" instruction in global CLAUDE.md. Burned ~30k tokens on work that should have been delegated. CLAUDE.md §11 elevated advisory to hard gate with exhaustive allowed/disallowed lists. Exception: only <20 line edits to 1–2 existing files inline.
**Consequences:** Main window is orchestrator only. All feature code must go through subagents. Main window reads specs, decides scope, writes dispatch prompts, reviews output, coordinates pushes. Zero inline code implementation except single targeted edits.

### Decision: CLAUDE.md §9 — File Delivery Rule (ALWAYS USE WORKSPACE + LINKS)
**Status:** APPROVED
**Made by:** Records auditor (governance)
**Rationale:** Files Patrick must view, install, or act on must be saved to workspace folder with clickable `computer://` link. Inline descriptions without links waste time. Rule prevents "find the file" friction.
**Consequences:** All deliverables from sessions must include presentable file cards via MCP tools. Never print paths without links.

### Decision: Comprehensive Sessions 166–170 Review (S171 START TASK)
**Status:** APPROVED
**Made by:** Patrick
**Rationale:** Series of governance + delivery issues detected (inline code, CLAUDE.md drift, communications baseline 5.3/10). Before resuming feature work, conduct full review: (1) did S166–170 deliver promised scope? (2) are rules being followed? (3) is communications/documentation improving? (4) should process change before continuing?
**Consequences:** S171 will start with governance review task, not feature work. Outcome may redirect resource allocation.

---

## Session 166 — 2026-03-15

### Decision: #64 Condition Grading — Fold into Sprint 1 of Listing Factory
**Status:** APPROVED
**Made by:** Patrick
**Rationale:** Additive schema change (conditionGrade String? on Item). Ships naturally with Sprint 1 tag picker UI. AI suggests S/A/B/C/D grade from photo during Rapidfire; organizer confirms. Coexists with existing `condition` field (backward compat). Adds +5 to health score when graded. Migration: 20260315000001_add_condition_grade_to_item.
**Consequences:** Sprint 1 now includes one schema migration. Health score max becomes 105 (or capped at 100).

### Decision: #31 Brand Kit — Schema fields added now, UI deferred to Sprint 3
**Status:** APPROVED (schema only — UI in Sprint 3)
**Made by:** Patrick
**Rationale:** Three additive fields on Organizer (brandLogoUrl, brandPrimaryColor, brandSecondaryColor). Migration 20260315000002_add_brand_kit_to_organizer added now so Sprint 3 dev can build on them without a separate migration session. No UI built yet — Sprint 3 owns settings page section and watermark logo integration.
**Consequences:** Organizer schema grows by 3 nullable fields. Watermark utility (Sprint 2) will use text overlay until Sprint 3 Brand Kit UI ships.

---

## 2026-03-12 — Session 153 (Cash POS Fee Policy)

- DECIDED: 10% platform fee applies to all cash POS transactions (parity with online/card transactions). Rationale: prevents perverse incentive to route everything through cash to avoid fees; maintains P&L consistency.
- DECIDED: Collection method = accumulate as `cashFeeBalance` on Organizer, deduct from next Stripe payout. Rationale: cleanest automatic collection without separate invoicing overhead.
- DECIDED: 30-day guardrail — if Stripe balance can't cover accumulated cash fees, surface a warning in organizer dashboard. Rationale: protects platform revenue without aggressive enforcement pre-beta.

## 2026-03-11 — Session 146 (Camera Workflow v2 Architecture)

- DECIDED: Background removal via Cloudinary server-side lazy transform (b_remove). Rationale: cost-efficient, no on-device WASM bloat, reduces network roundtrips vs. Remove.bg cloud API.
- DECIDED: Auto-enhance (brightness/saturation) on-device Canvas before upload, non-blocking. Rationale: spotty mobile wifi context, eliminates 2x network latency vs. server-side, enables immediate ✨ badge.
- DECIDED: Face detection on-device TensorFlow.js COCO-SSD (100% privacy). No cloud API. Rationale: spec requirement (private homes), no data sent off-device, organizer confirms before upload.
- DECIDED: AI confidence as `aiConfidence: Float` field on Item, sourced from Vision API in processRapidDraft. Rationale: enables color-coded confidence tinting (green/amber/red) on publishing page.
- DECIDED: Create Photo model (forward-looking, not used until v3), keep photoUrls array backward-compat for v2. Rationale: anticipates future per-photo labels/crops without schema re-migration.
- DECIDED: Aspect ratio crop client-side Canvas before upload + Cloudinary ar:4:3 display transform. Rationale: faster (local), reduces storage, consistent rendering.
- DECIDED: draftStatus enum unchanged (DRAFT → PENDING_REVIEW → PUBLISHED). No schema change required. Rationale: existing implementation already supports workflow.

## 2026-03-11 — Session 143 (Fleet Redesign Phase 2 Execution)

- EXECUTED: All 5 new standalone agents created and on 2-week trial. Rollback conditions defined in trial-rollback-protocol.md.
- EXECUTED: Advisory board restructured to 12 seats + 6 subcommittees per session 141 spec. Async voting protocol active.
- EXECUTED: conversation-defaults v6 — budget-first planning (Rule 17), DA/Steelman co-fire (Rule 18), feedback loop routing (Rule 19).
- EXECUTED: 2 scheduled tasks live — daily-friction-audit (8:30am Mon-Fri), weekly-pipeline-briefing (Mon 9am).
- DECIDED: Fleet redesign complete. Both phases shipped. Next priority returns to beta launch blockers.

## 2026-03-11 — Session 141 (Fleet Redesign)

- DECIDED: Merge CX + Support into Customer Champion. Reason: pre-beta scale doesn't justify split. Revisit at 50 organizers.
- DECIDED: Merge R&D + Pitchman into Innovation. Reason: natural creative-then-evaluate loop; two agents forced double-dispatch for one conceptual task.
- DECIDED: Create findasale-sales-ops agent. Reason: nobody owns organizer acquisition pipeline. Deferred to Phase 2.
- DECIDED: Create findasale-devils-advocate (standalone from board). Reason: contrarian thinking most valuable when automatic. Scoped to direction/strategy only, internalized preflight checklist.
- DECIDED: Create findasale-steelman (standalone from board). Reason: counterbalances DA. Co-fires via shared preflight checklist.
- DECIDED: Create findasale-investor (standalone from board). Reason: quick ROI/cost-benefit analysis for everyday decisions.
- DECIDED: Create findasale-competitor (standalone from board). Reason: unified competitive plugin routing; ad-hoc competitive questions without convening full board.
- DECIDED: Restructure Advisory Board to 12 seats (add Security Advisor, Systems Thinker, Legal Counsel, Marketing Strategist, Technical Architect, QA Gatekeeper). Drop Governance Auditor and Ecosystem Optimizer (redundant with source agents).
- DECIDED: Board subcommittees (Ship-Ready, Risk, Go-to-Market, Governance, Growth, Future Vision) with routing rules.
- DECIDED: Subagent-to-Patrick escalation channel with guardrails (evidence required, cooldown, auto-logging, no action requests).
- DECIDED: Inter-agent handoff protocol with integrity metadata and no-edit pass-through.
- DECIDED: Red-flag veto gate — auth/payment/deletion/security changes require Architect or Hacker sign-off before Dev dispatch.
- DECIDED: Async decision voting (+1/−1) for non-reversible decisions. Dissenting votes always surfaced.
- DECIDED: Cross-agent feedback loops (rollback→Innovation, Customer Champion→Sales-Ops, Competitor→Innovation).
- DECIDED: Budget-first session planning with outcome-bucketed delta tracking. Target ±10% accuracy within 60 sessions.
- DECIDED: decisions-log.md for cross-session decision memory. Max 3 lines/decision, 30-day prune.
- DECIDED: Daily friction audit scheduled task (8:30am Mon-Fri, replaces monthly retrospective). Owned by findasale-workflow.
- DECIDED: Weekly pipeline briefing scheduled task (Monday 9am, owned by sales-ops). Deferred to Phase 2.
- DECIDED: Trial/rollback protocol — explicit rollback plans checked by friction audit, post-mortems feed Innovation.
- DECIDED: DA/Steelman scoped to direction-only with internalized preflight checklist (not purely technical implementation).
- DECIDED: Token budget learning via outcome-bucketed delta tracking (succeeded-on-plan / over-plan / succeeded-after-retry).
- DECIDED: Phase 1 immediate (merges + escalation + handoff + veto gate + decisions-log). Phase 2 in two weeks (new agents + board restructure + context infrastructure).

## 2026-03-15 — Session 176 (Tier + Pricing Audit)

- DECIDED: Platform fee 10% flat rationale documented: matches Etsy (10%), below eBay (10–15%) and EstateSales.NET (~17%). Simplicity + competitive positioning. Advisory board S106 stress-tested 5%/7%; Patrick chose 10% flat post-review.
- DECIDED: Hunt Pass ($4.99/30 days) is confirmed monetization — not a dev experiment. Appears on pricing page. No beta testers yet, no disruption risk.
- DECIDED: pricing-strategy.md archived (stale, showed 5%/7%). Superseded by pricing-and-tiers-overview-2026-03-15.md and complete-feature-inventory-2026-03-15.md.
- DECIDED: BUSINESS_PLAN.md fee references stale (shows 5%/7%). Full rewrite is its own future session.
- OPEN: Virtual Queue tier (PRO vs ENTERPRISE), Affiliate (ENTERPRISE vs defer), Coupons (PRO vs SIMPLE with limits). Subagent input pending S176.
- OPEN: Hunt Pass ($4.99 standalone) vs. future Pro Shopper tier structure. Subagent input pending S176.

---

## 2026-03-28 (S332) — #13 Hold Button — Geolocation Gate

**Status:** LOCKED
**Made by:** Patrick
**Rationale:** Holds require physical presence at sale. QR check-in is primary gate (organizer posts QR at entrance; scan unlocks holds for that sale). GPS is fallback only, checked point-in-time at hold placement (not continuous polling). GPS radii by sale type: outdoor/flea 150m, indoor estate 250m, large/auction 400m. Organizer can override radius (Small/Medium/Large, PRO only). Continuous GPS revocation rejected — too many false positives from indoor drift, battery drain.

---

## 2026-03-28 (S332) — #13 Hold Button — En Route Grace Holds

**Status:** LOCKED
**Made by:** Patrick
**Rationale:** Shoppers within 10 miles actively navigating to a sale (via in-app map) receive limited en route holds: Initiate/Scout 1 hold, Ranger 2 holds, Sage/Grandmaster 3 holds. Full hold allotment unlocks on QR check-in or GPS arrival within geofence. Prevents remote abuse while rewarding high-intent navigating shoppers.

---

## 2026-03-28 (S332) — #13 Hold Button — Duration & Concurrency by Rank

**Status:** LOCKED
**Made by:** Patrick
**Rationale:** Hold duration and concurrency scale with Explorer Rank. Initiate/Scout: 30 min, 1 concurrent hold. Ranger: 45 min, 2 concurrent. Sage: 60 min, 3 concurrent. Grandmaster: 90 min, 3 concurrent. No Hunt Pass paywall — rank-gated, free. Longer holds reward progression without requiring payment.

---

## 2026-03-28 (S332) — #13 Hold Button — Expiry & Revocation Rules

**Status:** LOCKED
**Made by:** Patrick
**Rationale:** Three revocation rules only: (1) natural timer expiry always applies, (2) shopper navigating in-app to a different sale triggers a prompt to release current holds, (3) QR check-in auto-release at another sale was considered but rejected — flea markets have multiple vendors each with their own QR, so scanning Vendor B's QR should not release holds at Vendor A. Continuous GPS monitoring for revocation rejected.

---

## 2026-03-28 (S332) — #13 Hold Button — Organizer Controls

**Status:** LOCKED
**Made by:** Patrick
**Rationale:** Organizers have full hold management: per-sale disable toggle, view all active holds, cancel/delete individual holds, extend hold duration, edit holds. PRO tier gets radius override. This was flagged as a functional gap in existing code (P1 finding) and is now an explicit requirement.

---

## 2026-03-28 (S332) — #13 Hold Button — Business Model

**Status:** LOCKED
**Made by:** Patrick (validated by full Advisory Board 12/12 +1)
**Rationale:** Rank-gated, free to all logged-in shoppers. No Hunt Pass paywall, no deposit requirement. Deposit model rejected — legal risk (money-transmission regulations for held funds in some states). Hunt Pass paywall rejected — creates friction at moment of discovery, suppresses adoption. Board unanimously preferred rank-gated (earned) over pay-gated.

---

## 2026-03-30 (S342) — Roadmap Feature Decisions (9 items)

**Status:** LOCKED (all 9 items)

**1. Merge #174 + #80 — Auction Win + Persistent Purchase Confirmation**
**Status:** LOCKED
**Rationale:** Consolidate Auction Mechanics (#174) and Purchase Confirmation Redesign (#80) into one feature: persistent post-purchase page at `/purchases/{id}` replacing the 5-second dismissable success card. Immediate Stripe checkout at auction close (no deferred invoice window). Organizer receives payment; shopper sees persistent confirmation.

**2. #174 + #80 Payment Model — Charge at Winning Bid Time**
**Status:** LOCKED
**Rationale:** Same as Buy It Now — charge immediately on auction close. Consolidate with existing Stripe flows. Hold-to-Pay remote path: shopper pays via consolidated checkout link, organizer receives item price minus platform fee.

**3. #174 + #80 Reserve Price Not Met**
**Status:** LOCKED
**Rationale:** Organizer manual decision OR per-sale toggle (organizer chooses their reserve-price policy). Not automatic liquidation.

**4. #200 Shopper Public Profiles — Route & Privacy**
**Status:** LOCKED
**Rationale:** `/shoppers/[id]` by default (numeric ID). Optional `profileSlug` as profile customization. Shoppers toggle purchase visibility (default visible). Collector title curated list (Furniture Curator, Vintage Hunter, etc.) in profile header.

**5. #90 Sale Soundtrack — Defer to Organizer-Side**
**Status:** LOCKED (deferral)
**Rationale:** Remove from shopper-facing sale detail page. Defer to organizer POS or dashboard when proper inline player/Spotify widget can be built. Currently just an external link — not worth keeping in sidebar.

**6. #188 Neighborhood Pages — Status Update**
**Status:** RESOLVED
**Rationale:** Pages NOT 404 as roadmap claimed. 14 Grand Rapids neighborhoods fully functional, routes working, SEO schema.org markup in place. Stale roadmap note. Status: move to Chrome QA only.

**7. #49 City Heat Index — Patrick Decision Pending**
**Status:** PENDING
**Rationale:** Options: (a) Consolidate into `/cities` page as color/emoji indicator (~30 min), or (b) defer to post-beta backlog. Patrick decision needed — no implementation yet.

**8. #64 Save/Wishlist/Hold UX — Consolidation Approved**
**Status:** LOCKED (spec complete, no Patrick input needed)
**Rationale:** UX agent recommendation accepted: unify Favorites + Wishlists into "My Collections" with auto-created "Saved Items" collection. Hold remains separate (location-gated, different mental model). M effort (~2–3 days frontend IA). No schema changes.

**9. #149 Email Reminders — Frontend Work Only**
**Status:** LOCKED (no Patrick input needed)
**Rationale:** Backend 100% complete. Frontend S effort (<1 day): update button copy, add toggle-off UI, disabled states for cancelled/completed sales. No backend changes needed.

**10. #69 Local-First Offline Mode — Deferred**
**Status:** DEFERRED
**Rationale:** Patrick directive: "Defer coming soon." No implementation. Post-beta backlog.

**11. Organizer Hold Restriction Bug — Resolved**
**Status:** RESOLVED
**Rationale:** Was incorrectly implemented as blanket organizer gate. Organizers CAN place holds on other organizers' sales (dual shopper role). Bug fixed: HoldButton.tsx organizer gate removed; reservationController.ts now blocks organizer from holding their OWN sale items only.

**12. #49 City Heat Index — CONSOLIDATE into /cities page**
**Status:** LOCKED
**Made by:** Patrick
**Rationale:** Feature may already exist in some capacity on /cities. Decision: consolidate heat index concept into the /cities page as a visual activity density indicator (color-coded or emoji badges by sale count). ~30 min effort. Do not build as a separate page. Remove "Coming soon" placeholder from /city-heat-index.tsx or redirect it to /cities.
