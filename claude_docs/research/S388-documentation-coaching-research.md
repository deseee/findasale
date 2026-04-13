# S388 Research Synthesis: Documentation & Coaching Overhaul

**Session:** S388 (2026-04-03)
**Purpose:** Research all 5 focus areas before implementation sprints
**Sources:** ADR-065 pricing analysis, Gamification Phase 1 checklist, full codebase audit (5 parallel agents)

---

## 1. PRICING PAGE AUDIT — Current State vs ADR-065

### Price Discrepancies (P0 — must resolve before any beta announcement)

| Component | PRO Price | TEAMS Price | Source |
|-----------|-----------|-------------|--------|
| pricing.tsx (main page) | **$49/mo** | **$99/mo** | Lines 59, 90 |
| TierComparisonTable.tsx | **$29/mo** | **$79/mo** | Lines 215, 221 |
| AlaCartePublishModal.tsx | **$29/mo** | — | Line 80 |
| Stripe price objects | $49 / $99 | — | stripeController.ts L1125-1127 |

Three different prices shown to users for the same tier. TierComparisonTable and AlaCartePublishModal show $29 PRO; the main pricing page and Stripe show $49.

### ADR-065 Gap Analysis

| Recommendation | Status | Detail |
|----------------|--------|--------|
| Rename SIMPLE → Essential | ❌ NOT DONE | Still "SIMPLE" everywhere |
| Remove ENTERPRISE from launch | ❌ STILL VISIBLE | $500/mo Enterprise CTA at bottom of pricing page (L424-443) |
| Founding Organizer program ($19/mo) | ❌ ZERO CODE | No trace in codebase |
| Flip Report as "aha" feature | ⚠️ PARTIAL | Listed in PRO features but buried in a list of 20+ items |
| À la carte = Flip Report only ($9.99) | ❌ WRONG TARGET | Current à la carte is sale publication ($9.99), not Flip Report |
| Fee transparency | ⚠️ PARTIAL | SIMPLE shows "10% fee"; PRO/TEAMS show "8% fee" in feature lists, not in price headers |
| Fee model inversion ($20+15%) | ❌ NOT EXPLORED | Standard model only |

### Transaction Fee Structure (Current)

- SIMPLE: $0/mo + 10% per transaction
- PRO: $49/mo + 8% per transaction
- TEAMS: $99/mo + 8% per transaction

### Decisions Confirmed by Patrick (S388)

1. **PRO = $29/mo, TEAMS = $79/mo** — S268 locked. pricing.tsx showing $49/$99 is WRONG and must be fixed. Stripe price objects may also need recreation.
2. **SIMPLE stays SIMPLE** — ADR-065 "Essential" rename rejected. Previously locked decision.
3. **Enterprise STAYS** — D-007 (S240): unlimited members, API/webhooks, contact-sales ($500-800/mo annual). Not premature — intentional tier above Teams.
4. **Founding Organizer program REJECTED** — S268 locked. No special rates.
5. **À la carte = $9.99 per-sale fee for non-subscribers** — S268 locked. Not Flip Report. Breakeven at 3 sales drives PRO conversion.
6. **Fee model: standard** — S341 locked. Organizer pays 10% SIMPLE / 8% PRO/TEAMS. No inversion explored.
7. **Rank thresholds: board numbers** — Initiate 0 / Scout 500 / Ranger 2000 / Sage 5000 / Grandmaster 12000. Code currently has 1500/2500/5000 — needs updating.
8. **Social/viral features stay on ALL tiers** — anything driving reach (social post generator, QR codes, promotions, sharing, storefront) available to SIMPLE.
9. **Gate SIMPLE concurrent sales** — approved (limit TBD, likely 1-3).
10. **Coaching: Option A (inline banner)** — approved for camera 5-shot guidance.

---

## 2. ORGANIZER FEATURE × TIER MATRIX

### Tier-Gated Features (Backend Enforced via requireTier middleware)

**PRO-Only (13 features):**
- Command Center (multi-sale dashboard)
- Flip Report (post-sale PDF analytics)
- Insights/Analytics (detailed sale performance)
- Bulk Operations (batch item create/edit)
- Item Valuation (pricing appraisal)
- Item Library (consignment inventory management)
- CSV/JSON Export (EstateSales, Facebook, Craigslist formats)
- Photo Op Stations (branded selfie spots)
- Sale Hubs (multi-organizer coordinated events)
- Link Click Analytics
- Brand Kit Advanced (fonts, banners, accent color)
- Fraud Dashboard
- Item Pricing Advice

**TEAMS-Only (7 features):**
- Workspace Management (create/edit workspace)
- Invite/Remove Members
- Member Roles (ADMIN/MEMBER)
- Accept Workspace Invite
- Multi-Sale Access (workspace-wide)

### Available to ALL Tiers (SIMPLE)

Sale creation, editing, publishing, cloning, deleting. Single-item inventory management. Photos (up to 5/item). AI tagging (100/month). POS (Stripe Terminal + cash tracking). Holds & reservations. Message templates. Flash deals. Promotions. QR codes. Brand Kit basic (logo, primary/secondary colors, slug). Payouts. Weekly email digest. Verification badge. Social post generator. Line queue. Print inventory. Webhooks. Storefront page.

### ADR-065 Friction Gap

ADR-065 recommended moving these to PRO for intentional friction:
- **Multi-sale management** → Currently SIMPLE can create unlimited sales (only Command Center is PRO-gated)
- **CSV/PDF exports** → Already PRO ✓
- **Bulk operations** → Already PRO ✓
- **Performance reporting** → Already PRO ✓

**Action needed:** Consider limiting SIMPLE to 1-3 concurrent sales (currently unlimited).

---

## 3. SHOPPER FEATURE × RANK MATRIX

### Source of Truth: S259–S268 (NOT S388)

The comprehensive gamification design was done in **S259** (deep-dive spec, XP economy, dev handoff checklist), **S260** (RPG decisions, abuse prevention), **S261** (architect schema review), and **S268** (board consolidation vote). These sessions produced 200+ pages of locked specifications across 7 documents. S388's game design agent output is ~85% redundant with those sessions. The only new S388 value is the **code delta audit** below.

**Key reference docs (for any future dev dispatch):**
- `research/gamification-deep-dive-spec-S259.md` — full architectural spec (56k)
- `research/gamification-revised-spec-S259.md` — implementation-ready version (45k)
- `research/gamification-xp-economy-S259.md` — XP economy research (28k)
- `research/DEV_HANDOFF_CHECKLIST-S259.md` — 5-week sprint plan + QA matrix (15k)
- `research/gamification-rpg-spec-S260.md` — 8 locked game design decisions (12k)
- `feature-notes/explorer-guild-phase2-architect-S261.md` — schema + risk assessment (52k)
- `research/board-minutes-gamification-S268.md` — board consolidation decisions (43k)

### Two Independent Axes

**Hunt Pass (Binary):** FREE or HUNT_PASS ($4.99/mo)
**Explorer Rank (XP-based):** Initiate (0) → Scout (500) → Ranger (2000) → Sage (5000) → Grandmaster (12000)

**Rank thresholds confirmed S388:** Board numbers (500/2000/5000/12000). Code has wrong values — see code delta below.

### Rank-Gated Features (Currently Enforced)

| Feature | Required Rank | File |
|---------|---------------|------|
| Hold Duration: 45min | RANGER | reservationController.ts L115-134 |
| Hold Duration: 60min | SAGE | reservationController.ts |
| Hold Duration: 90min | GRANDMASTER | reservationController.ts |
| En-Route Hold Limit: 2 | RANGER | reservationController.ts L136-145 |
| En-Route Hold Limit: 3 | SAGE/GRANDMASTER | reservationController.ts |

### Hunt Pass Benefits (Currently Enforced)

- 1.5x XP multiplier (xpService.ts L398-420)
- 2x Streak XP (marketing text on hunt-pass page)
- Exclusive badge (schema: User.huntPassActive)

### XP Sinks (Working)

- Coupon generation: 20 XP → $1-off coupon (30-day expiry)
- Rarity Boost: 15 XP → +2% rarity odds for a sale

### Gamification Phase 1 Readiness

| Component | Status | Notes |
|-----------|--------|-------|
| xpService.ts | ✅ BUILT (421 lines) | awardXp, spendXp, getRankProgress, leaderboard, Hunt Pass multiplier |
| RankProgressBar.tsx | ✅ BUILT (75 lines) | Animated XP bar, dark mode |
| RankBadge.tsx | ✅ BUILT (103 lines) | 5 ranks with emoji/colors |
| Leaderboard page | ✅ BUILT (206 lines) | Top 50 public view, responsive |
| Loyalty/Passport page | ✅ BUILT (593 lines) | Rank display, stamps, badges |
| PointsTransaction table | ✅ BUILT | Audit trail for all XP awards |
| Seasonal Challenges | ⚠️ PARTIAL | Hardcoded in challengeService.ts, no DB table |
| Challenge Progress | ⚠️ PARTIAL | ChallengeProgress table exists, not seasonal-reset-aware |
| UserRank table | ❌ NOT BUILT | Rank denormalized into User.explorerRank field |
| SeasonalLeaderboard table | ❌ NOT BUILT | Leaderboard is all-time, not seasonal |
| SeasonalChallenge table | ❌ NOT BUILT | Challenges hardcoded in code |
| Hunt Pass dynamic pricing | ❌ NOT BUILT | Hardcoded $4.99, no tier discount |
| Rank-up notifications | ❌ NOT BUILT | No event handler for rank transitions |
| Challenge-complete notifications | ❌ NOT BUILT | Progress tracked but no notification fires |
| Presale access gating | ❌ NOT BUILT | Sale.prelaunchAt field exists, no API enforcement |
| Analytics events | ❌ NOT BUILT | No tracking for guild_xp_awarded, rank_up, etc. |

**Overall readiness: ~45-50%.** Core engine works. Seasonal infrastructure, notifications, and dynamic pricing all missing.

### Code Delta (S388 New Finding — the actual value)

Three implementation bugs where code drifted from locked spec:

| What | Spec (S259/S268) | Code (xpService.ts) | Fix |
|------|-------------------|---------------------|-----|
| Ranger threshold | 2000 XP | 1500 XP | Update L11-16 |
| Sage threshold | 5000 XP | 2500 XP | Update L11-16 |
| Grandmaster threshold | 12000 XP | 5000 XP | Update L11-16 |
| Purchase XP | $1 = 1 XP | 15 per purchase (flat) | Update L36 |
| Visit XP | 5 per visit | 10 base + streak | Update L31-33 |

Plus: XP award logic is stubbed in xpService but **never called** from purchase/visit/auction flows. The wiring is the main Phase 1 gap.

---

## 4. IN-WORKFLOW COACHING APPROACH

### Current Coaching Inventory

| Mechanism | Pattern | Trigger | Scope |
|-----------|---------|---------|-------|
| OrganizerOnboardingModal | 3-step modal | New organizer, first dashboard visit | Welcome + first steps |
| OnboardingWizard | 5-step modal | First organizer login | Email verify → profile → Stripe → create sale |
| OnboardingModal (Shopper) | 3-step modal | First shopper login | Welcome → favorites → notifications |
| TeamsOnboardingWizard | 3-step form | TEAMS tier activation | Workspace setup |
| TooltipHelper | Hover "?" icon | Always visible where placed | Single-field explanations |
| BrightnessIndicator | Real-time overlay | Camera active | Lighting quality feedback |
| Toast system | 10s auto-dismiss popup | After user actions | Success/error/info feedback |

### showShotGuidance Analysis

**What it does:** Progressive messages for regular-mode photo captures (shots 1-5). Each shot gets encouraging copy suggesting what to photograph next (back view, maker's marks, details, damage, completion).

**Why dead:** Never wired to any event. Toast was wrong pattern — 5 sequential toasts would stack and overwhelm. No state tracking for shot count existed.

### Recommended Replacement: Option A — Contextual Inline Banner

**Pattern:** Persistent banner above shutter button showing step + next action.
**Example:** "Shot 1 of 5 — Primary photo (listing photo). Next: back view or maker's mark."

**Why this option:**
- Reuses existing RapidCapture banner infrastructure
- Non-blocking, always visible but not intrusive
- Low complexity (~60 lines new TSX + 20 lines state)
- Dismissable via ✕ tap; localStorage "show once" tracking
- 1-2 day implementation

**Alternatives documented:** Tooltip-based progressive disclosure (Option B, medium complexity) and modal walkthrough (Option C, higher complexity). Both viable for Phase 2 if banner proves insufficient.

### Key Workflows Needing Coaching

| Workflow | Current Gap | Priority |
|----------|-------------|----------|
| Camera — 5-shot coverage | Dead showShotGuidance, no replacement | **HIGH** |
| Camera — Rapidfire intro | No "+" button tutorial, no mode explanation | MEDIUM |
| First sale creation | No field-level guidance, form is long | MEDIUM |
| Bulk operations | Select-first UX not obvious | MEDIUM |
| Publishing/review page | AI confidence colors unexplained | MEDIUM |

---

## 5. FAQ + USER-FACING COPY AUDIT

### AI Branding Violations (P0 — 13 locations)

| File | Current Text | Fix |
|------|-------------|-----|
| plan.tsx L96 | "AI assistant" in meta desc | → "planning assistant" |
| plan.tsx L152, 167 | "AI" avatar badge in chat | → "Assistant" |
| privacy.tsx L51-52 | "third-party AI services" | → "automated analysis services" |
| privacy.tsx L106-108 | "AI Services" / "AI tagging" | → "Auto-Tagging Services" |
| dashboard.tsx L459 | "AI helps tag and describe" | → "Smart tagging helps suggest descriptions" |
| settings.tsx L364-366 | "AI Assistance" section header | → "Smart Tagging" |
| faq.tsx L186-192 | "How does AI auto-tagging work?" + "our AI analyzes" | → "How does auto-tagging work?" / "our system analyzes" |
| OrganizerOnboardingModal L23 | "Our AI will suggest..." | → "Smart tagging will suggest..." |
| SmartInventoryUpload L348 | "AI will analyze" | → "Smart analysis will create..." |
| SmartInventoryUpload L412 | "Analyzing with AI..." | → "Analyzing items..." |
| SmartInventoryUpload L527-529 | "AI service timed out/busy/invalid" | → "Analysis timed out/busy/invalid" |
| PriceSuggestion L106 | "AI Price Suggestion" | → "Smart Price Suggestion" |
| guide.tsx L94 | "our AI suggests..." | → "our system suggests..." |

### Sale Type Inclusivity Issues

- index.tsx meta: "estate sales and auctions" — should include yard/flea/consignment
- about.tsx L26: "estate sale organizers" — should be "sale organizers"
- faq.tsx L18: "How do I find estate sales?" — should broaden
- guide.tsx L305: "successful estate sale" — should be "successful sale"

### Missing FAQ Topics (Shipped Features, No Documentation)

1. Tier system (SIMPLE/PRO/TEAMS) — no FAQ despite prominent upgrade page
2. Brand Kit — not in guide or FAQ
3. Command Center — mentioned in tiers, no explanation
4. Trails/Treasure Hunt — feature exists, zero docs
5. Loot Log — purchase history feature, undocumented
6. Collector Passport / Achievements — no guide or FAQ
7. Neighborhood/City Hubs — no FAQ
8. Condition Ratings — page exists at /condition-guide but not linked from FAQ
9. Photo quality guidelines — critical for conversions, not documented
10. POS integration — mentioned in tiers, not explained

### Brand Voice

Generally good. FindA.Sale naming is consistent (no variants found). Tone is friendly and practical. Main issues are the AI references above and some technical error messages in SmartInventoryUpload that show internal codes to users.

---

## SUMMARY: TOP ACTIONS FOR S389+

### P0 (Before Any Beta Announcement)
1. **Fix price discrepancies** — align $29 vs $49 PRO across all components
2. **Remove Enterprise CTA** from pricing page (or make conscious decision to keep)
3. **Fix 13 AI branding violations** — every "AI" reference in user-facing copy

### P1 (Pre-Launch Polish)
4. **Patrick pricing decisions** — lock tier names, prices, Founding Organizer go/no-go
5. **Camera coaching banner** — replace dead showShotGuidance with inline banner
6. **FAQ gaps** — add tier system, Brand Kit, Command Center, gamification features
7. **Sale type inclusivity** — broaden "estate sale" language across 4 key pages

### P2 (Gamification Phase 1 Completion)
8. **Lock rank thresholds** — 1500/2500/5000 (code) vs 2000/5000/12000 (checklist)
9. **Seasonal infrastructure** — DB tables for seasonal challenges, leaderboard resets
10. **Notifications** — rank-up, challenge-complete, badge-earned event handlers
11. **Hunt Pass dynamic pricing** — tier-based discounts per rank

---

**Research complete. All findings are code-verified with file paths and line numbers.**
