# Power User Sweep — 2026-04-13

**Agent:** Cowork Power User (scheduled run)
**Trigger:** findasale-power-user-sweep weekly task
**Sessions reviewed:** S438–S443 (STATE.md)
**Files read:** STATE.md (full), improvement-memos/power-user-sweep-2026-04-06.md, research/tech-debt-audit-s413.md, research/s403-gamification-research.md
**Scheduled tasks audited:** 14 tasks
**Ecosystem search:** Claude Cowork GA April 2026, MCP connectors, Computer Use, Managed Agents

---

## ⚠️ Priority Alert: 3-Sweep Carry-Forward Pattern

Three consecutive sweeps (March 30, April 6, April 13) have flagged the same QW-1 (dev-environment Neon references) as "auto-executable." It has not been actioned in any of them. This pattern indicates the sweep output is producing proposals that are not being executed — either because:

1. The sweep runs unattended and its output is not surfaced in the next live session
2. The "auto-executable" designation is not being honored
3. findasale-records is not receiving the routing

**Meta-recommendation:** Add a "carry-forward count" to each QW that has appeared in a prior sweep. Items at 3+ sweeps unfixed should be escalated as P0 and shown to Patrick directly in the live session immediately following the sweep.

---

## Ecosystem Research — 2026-04-13

### Major Platform Event: Cowork Goes GA (April 9, 2026)

Anthropic announced General Availability of Claude Cowork on April 9, 2026. Key changes:

**Now GA (all paying subscribers, macOS + Windows):**
- Cowork is no longer a "research preview" — the beta label is removed
- Computer Use is now included in Cowork and Claude Code (Pro/Max plans)
- Dispatch improvements: persistent agent threads via Claude Desktop or iOS/Android

**Enterprise additions (Team/Enterprise plans):**
- Role-Based Access Controls (RBAC) — configure access by team/department
- Group Spend Limits — budget control per user group
- Expanded Usage Analytics — dashboards on usage, costs, interaction patterns
- OpenTelemetry support — native integration with enterprise observability
- **New: Zoom MCP Connector** — meetings and transcription integration

**New Anthropic product: Claude Managed Agents (public beta)**
- Cloud-hosted agent APIs for building production agents at scale
- Composable APIs — not directly applicable to FindA.Sale's current workflow

**Claude Code Channels (new):**
- Hook Claude Code to Discord or Telegram for mobile-first task assignment
- Similar to Dispatch but for developer workflows

### Applicable to FindA.Sale

**Computer Use (HIGH relevance):**
Computer Use is now generally available in Cowork. This means Claude can control the desktop directly — not just Chrome via MCP. For QA sessions, Computer Use could navigate the app, take screenshots, interact with forms, and verify flows without being limited to the Chrome extension's capabilities. The findasale-qa skill should document when to use `mcp__Claude_in_Chrome__*` vs. Computer Use tools.

**Cowork "research preview" label is outdated:**
The system prompt for this session still says "Cowork mode is currently a research preview." This is factually wrong as of April 9 — Cowork is GA. Any marketing copy, docs, or user-facing text that says "research preview" needs updating. (Note: Claude's system prompt is controlled by Anthropic, not Patrick — but if Patrick has any internal docs or onboarding copy that uses this language, it should be updated.)

**Zoom MCP Connector (LOW relevance):**
FindA.Sale doesn't currently use Zoom for organizer communication. No immediate action.

**Dispatch (MEDIUM relevance — ongoing from prior sweeps):**
Persistent agent threads via mobile are now GA. Patrick can text Claude a task from his phone and have it work on the desktop. Still unactioned from P-2 in previous two sweeps.

### Recommended Actions

- Document Computer Use availability in findasale-qa SKILL.md as an alternative to Claude in Chrome (see P-4).
- Dispatch evaluation (P-2) is now more urgent — it's GA, not beta.
- No new connectors found that are immediately applicable beyond prior sweep findings.

---

## Skill Audit — 2026-04-13

### 🔴 CRITICAL (3rd sweep): dev-environment has 8 stale Neon references

**Status: STILL UNFIXED — flagged in sweeps of 2026-03-30, 2026-04-06, and now 2026-04-13.**

The `dev-environment/SKILL.md` file at lines 48, 100, 104, 106, 119, 141, 143, 183, 217 all reference Neon as the production database. Neon was decommissioned in S264. Production is Railway (`maglev.proxy.rlwy.net:13949/railway`). A session that loads this skill and follows its migration instructions will attempt `prisma migrate deploy` against a dead database.

**This is now the longest-running unfixed bug in the skill fleet. 3 sweeps. Zero action.**

Specific stale lines:
- Line 48: `For Neon (production): Find the commented line # DATABASE_URL=postgresql://neondb`
- Line 100: Table shows "Neon PostgreSQL (cloud)" as production
- Line 104: ⚠️ warning about Neon URL format
- Line 106: ⚠️ never hardcode Neon credentials
- Line 119: `# Apply migrations (production/Neon)`
- Line 141: Section header `### migrate deploy pre-flight (Neon)`
- Line 143: `Before running prisma migrate deploy against Neon`
- Line 183: Table row `Production (Neon)`
- Line 217: `Confirm .env points to local vs Neon before any command`

**All 9 occurrences should be replaced with Railway equivalents.**

### ⚠️ Stale (2nd sweep): next-session-brief.md — S199 content

`claude_docs/next-session-brief.md` still contains S199 content (~S199 = 2026-03-18, 250+ sessions ago). Per CLAUDE.md §12, next-session content has been consolidated into STATE.md "## Next Session" section. The file is orphaned and potentially confusing. Should be archived to `claude_docs/archive/`.

### ⚠️ Stale (2nd sweep): findasale-competitor-monitor description mismatch

Description says "Runs Monday 8am" but cron is `0 4 * * 4` (Thursday 4am). Confirmed again in this sweep's task list.

### ✅ No new skill staleness found in S438–S443

The recent sessions (S438–S443) shipped nav changes, bounties, gamification, command center, and workspace features. Quick scan of relevant skill descriptions (findasale-qa, findasale-dev, findasale-ux, findasale-ops) shows no obvious staleness relative to new features. Skills are routed correctly.

### ⚠️ NEW: findasale-qa skill — no mention of Computer Use

The findasale-qa SKILL.md documents Claude in Chrome as the primary browser interaction method. Now that Computer Use is GA in Cowork, QA sessions have a more powerful option. The skill should document both approaches and guide when to use each.

---

## Autonomous Work Discovery — 2026-04-13

### Tech Debt Top Items Ripe for Dispatch (from S413 audit)

The S413 tech debt audit (2026-04-07) produced 12 prioritized findings. None of the top items have been scheduled for dev dispatch. Two are immediately actionable:

**Item #1 — Hardcoded Stripe Price IDs (Score: 40, highest):**
`stripeController.ts` and `syncTier.ts` hardcode Stripe price IDs as string literals. Environment variables `STRIPE_PRO_MONTHLY_PRICE_ID` and `STRIPE_TEAMS_MONTHLY_PRICE_ID` already exist but aren't wired. Fix is ~10 lines across 2 files. If price IDs rotate, silent billing failure results.

This is an inline-eligible fix (2 files, <20 lines) per CLAUDE.md §7.

**Item #3 — Account Deletion Unimplemented (Score: 32, GDPR legal risk):**
`shopper/settings.tsx:459` has a TODO button that does nothing. GDPR "right to erasure" is a legal obligation for any product with EU users. The visible broken button also erodes user trust.

This was flagged in the legal review (findasale-legal) — routing to dev is overdue.

### Accumulated QA Backlog (S436–S443)

Eight consecutive sessions have "QA needed" items in STATE.md that have not been Chrome-verified:
- S436: Earnings page, QR Analytics, Staff page (TEAMS tier)
- S437: Sale selector, Calendar, Bounties end-to-end, Platform fees, Appraisals, Checklist
- S438: Fee fixes live, Hubs, Plan tabs
- S439: Inventory (447 backfilled items), Shopper bounties, Market Hubs nav, Subscription PRO card
- S440: Nav reorder, Leaderboard, Messages dual-role, Connect links
- S441: Bounties XP copy, Achievements rank progression, Reputation scores, Dashboard view link, Receipts CTA, Haul Posts upload
- S442: Team seeding data visible (Alice 7-member, Carol 4-member)
- S443: Staff crash, Reputation scores, Bounties submit, Achievements data, Lucky Roll, Workspace, Appraisal XP gating, Command Center

This is now 8 sessions of unverified features. The weekly-full-site-audit task audits code quality — it does not run the specific per-feature interaction scenarios from these QA queues. The backlog is compounding faster than live sessions can clear it.

### Survey Trigger Integrations Still Missing (S399)

From previous sweep (April 6): S398+S399 built the complete feedback infrastructure (FeedbackModal, survey triggers, 10 survey definitions) but the actual `showSurvey()` calls on 10 specific pages were never implemented. Without those calls, the entire feedback system ships zero surveys to real users.

This finding appeared in the April 6 sweep as an autonomous work item and has not been actioned. It is a dev dispatch task: implement `showSurvey()` calls on the 10 trigger pages per S399's handoff notes.

### Roadmap — S443 Command Center not yet marked shipped

S443 shipped the Command Center upgrade (10 new files, live activity feed, sale health cards, weather alert, quick actions). This should be reflected in roadmap.md. Records should update at next session wrap.

---

## Improvement Batch — 2026-04-13

---

### 🔴 Quick Wins (auto-executable — proceeding unless Patrick objects)

---

**QW-1: dev-environment skill — 9 Neon references (CARRY-FORWARD × 3, NOW ESCALATED)**
**Category:** Skill correctness bug
**Impact:** HIGH — Migration commands point to a dead database. Any session that follows these instructions and skips the Railway override will fail silently or error.
**Effort:** ~15 min skill update via skill-creator
**Route to:** skill-creator → findasale-records (Tier 1)
**Auto-executable?:** YES — factual correction. No product decision.
**Carry-forward count:** 3 consecutive sweeps (March 30, April 6, April 13). Escalating.
**Action this sweep:** Routing to skill-creator. If output is returned, will push update immediately.

---

**QW-2: next-session-brief.md — archive stale S199 file (CARRY-FORWARD × 2)**
**Category:** Documentation staleness
**Impact:** MEDIUM — Stale S199 priorities (Sale Ripples, Passkey) could contaminate a context window.
**Effort:** 5 min — move to archive/
**Route to:** findasale-records
**Auto-executable?:** YES
**Carry-forward count:** 2 consecutive sweeps. Escalating.

---

**QW-3: findasale-competitor-monitor description fix (CARRY-FORWARD × 2)**
**Category:** Scheduled task description mismatch
**Impact:** LOW — "Monday 8am" vs. Thursday 4am actual schedule. Confusing when reviewing tasks.
**Effort:** 2 min description update
**Route to:** findasale-records (owns scheduled tasks)
**Auto-executable?:** YES
**Carry-forward count:** 2 consecutive sweeps.

---

**QW-5 (NEW): Stripe price ID hardcoding — inline fix (2 files, <20 lines)**
**Category:** Tech debt — silent billing risk
**Impact:** HIGH — If Stripe price IDs rotate, billing fails silently. Fix is already stubbed (env vars exist).
**Effort:** Inline edit (<20 lines across 2 files, CLAUDE.md §7 eligible)
**Files:** `packages/backend/src/controllers/stripeController.ts`, `packages/backend/src/services/syncTier.ts`
**Fix:** Replace hardcoded `price_1TDUQsLTUdEUnHOT...` literals with `process.env.STRIPE_PRO_MONTHLY_PRICE_ID` and `process.env.STRIPE_TEAMS_MONTHLY_PRICE_ID`
**Auto-executable?:** YES — factual wiring of existing env vars. No product decision.
**Note:** Dispatch to findasale-dev since it touches payment code (red-flag gate awareness — but this is a variable-wiring fix, not a logic change).

---

### 🟡 Proposals Needing Patrick's Input

---

**P-2: Dispatch for field use — NOW GA (CARRY-FORWARD × 2, urgency increased)**
**Category:** Ecosystem feature
**Impact:** MEDIUM — Patrick can text Claude tasks from his phone at estate sales ("QA the add-items page", "check Railway logs"). Now GA on Pro/Max plans — no longer beta.
**Effort:** 30-min setup evaluation
**Route to:** Patrick decision only
**Auto-executable?:** NO — requires Patrick to enable Dispatch on his phone.
**Note:** This was flagged in March 30 and April 6 sweeps. Now that it's GA, the evaluation cost is lower (no beta friction).

---

**P-3: Dedicated QA-clearing scheduled task (CARRY-FORWARD × 2)**
**Category:** Process improvement
**Impact:** HIGH — QA backlog now spans S436–S443 (8 sessions). Code-auditing tasks (weekly-full-site-audit, ux-spotcheck) don't clear per-feature Chrome interaction scenarios. The backlog compounds every session.
**Effort:** 1 session — create findasale-qa-backlog-clear task that reads STATE.md QA queues + dispatches findasale-qa for the oldest 2–3 items each run
**Route to:** findasale-records (scheduled task creation)
**Auto-executable?:** NO — Patrick should decide: (a) automated Chrome QA dispatches or (b) manual live session QA only.

---

**P-4 (NEW): Document Computer Use in findasale-qa SKILL.md**
**Category:** Skill enhancement — new platform capability
**Impact:** MEDIUM — Computer Use (now GA in Cowork) gives QA sessions more power than Claude in Chrome alone. Can interact with desktop apps, take full-screen screenshots, navigate outside the browser. QA skill should document when each approach is best.
**Effort:** Quick win — skill update
**Route to:** skill-creator → findasale-records
**Auto-executable?:** PARTIAL — can draft the addition, but Patrick should review before findasale-records activates it (changes QA methodology).

---

**P-5 (NEW): Account Deletion — dispatch to findasale-dev (GDPR obligation)**
**Category:** Legal compliance + UX
**Impact:** HIGH — GDPR "right to erasure" is a legal requirement. Broken button in settings.tsx is also a visible trust signal.
**Effort:** 1–2 sessions (cascade deletes, Stripe sub cancel, Cloudinary cleanup)
**Route to:** findasale-legal (risk confirmation) → findasale-dev (implementation)
**Auto-executable?:** NO — Patrick should confirm priority and authorize cascading delete logic before dispatch.

---

**P-1 (CARRY-FORWARD × 2): Gmail MCP for Customer Champion**
**Category:** Ecosystem connector
**Impact:** MEDIUM — Currently agents draft support emails that Patrick manually sends. Gmail MCP would close the loop.
**Effort:** Session task — OAuth setup + skill update
**Route to:** Patrick authorization (outbound email from his domain)
**Auto-executable?:** NO

---

### 🔵 Research Needed

**R-1: Survey trigger implementation (S399 debt)**
Survey infrastructure is built but `showSurvey()` is never called. Recommend: findasale-dev reads S399 handoff notes and implements calls on the 10 trigger pages in a single focused dispatch. Pre-research confirms this is a pure frontend wiring task — no schema changes. Route to findasale-dev directly.

**R-2: Computer Use vs. Claude in Chrome — capability comparison**
Before updating findasale-qa, need a clear capability matrix: what can Computer Use do that Claude in Chrome cannot, and vice versa? Specifically: file uploads, multi-tab scenarios, PWA behavior, mobile viewport simulation. Brief findasale-innovation to produce this in ≤200 words.

---

### 🅿️ Parking Lot

- **Managed Agents (new Anthropic product):** Cloud-hosted agent API for production-scale agent deployment. Potentially relevant if FindA.Sale ever needs to deploy its own Claude-powered agents for organizers. Revisit post-launch.
- **Claude Code Channels (Discord/Telegram):** Developer-focused messaging integration. No FindA.Sale use case currently — organizers communicate via the app, not Discord.
- **Zoom MCP:** No organizer Zoom use case identified. Revisit if virtual estate sale consultations become a feature.
- **BatchData MCP (real estate/property):** Flagged in March 30 sweep. Still no immediate use case. Revisit when sales-ops needs organizer prospect lead data.
- **Tech debt items #4–#12 (S413):** Condition constants, missing input validation, .env.example sync, `<img>` → next/image, oversized controllers, TypeScript `: any` cleanup. All are valid but lower priority than Stripe IDs + account deletion. Add to a "tech debt sprint" roadmap item.

---

## Auto-Executed Quick Wins

### QW-5 — Stripe price ID fix

This is inline-eligible per CLAUDE.md §7 (2 files, <20 lines, existing env vars being wired). However, it touches payment code — red-flag gate applies. **Not auto-executing inline.** Routing to findasale-dev as a focused 1-task dispatch instead.

*(All other QW items require skill-creator + records workflow which cannot be completed in a scheduled/unattended run. Flagging for the next live session.)*

---

## Summary for Patrick

**Top 3 Actionable Proposals:**

1. **The dev-environment skill has been broken for 3 consecutive sweeps — Neon references point to a dead database.** This is the most critical recurring unfixed item. Every time someone loads this skill and runs a migration without manually overriding the URL, it will fail. Routing to skill-creator. Please approve the fix in your next live session.

2. **8 sessions of unverified QA is now a serious liability.** S436 through S443 all have Chrome interaction tests that have never been run. The weekly audit tasks don't cover these. A dedicated QA-backlog-clear scheduled task would drain this systematically — or you can dedicate one live session to Chrome QA only.

3. **Cowork is now GA (April 9) and Computer Use is included.** Claude can now control your desktop directly, not just Chrome. This could speed up QA sessions significantly. The findasale-qa skill should be updated to document this capability. Also: Dispatch is now GA on Pro/Max — you can queue Claude tasks from your phone at estate sales.

---

*Next sweep scheduled: 2026-04-20*
