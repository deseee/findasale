# Power User Sweep — 2026-04-20

**Agent:** Cowork Power User (scheduled run)
**Trigger:** findasale-power-user-sweep weekly task
**Sessions reviewed:** S520–S521 (STATE.md current)
**Files read:** STATE.md (full), roadmap.md (v114), improvement-memos/power-user-sweep-2026-04-13.md, research/pos-upgrade-market-research.md, research/cowork-ecosystem-audit-2026-03-15.md, dev-environment/SKILL.md (lines 1–60)
**Scheduled tasks audited:** 14 tasks
**Ecosystem searches:** Claude Cowork 2026 MCP connectors, Stripe MCP, Google Drive plugins

---

## ⚠️ Priority Alert: 4-Sweep Carry-Forward — QW-1 Now P0

**QW-1 (dev-environment Neon references) has now been flagged in 4 consecutive sweeps without action:**
March 30 → April 6 → April 13 → April 20.

This is no longer a "quick win" — it is a **P0 skill correctness bug** that actively misleads migration commands. Escalating to direct Patrick attention in the Summary section. The auto-executable designation has clearly not been sufficient. This sweep is escalating it to require explicit Patrick + findasale-records action in the next live session.

---

## Auto-Executed Quick Wins This Sweep

### ✅ QW-3 FIXED: findasale-competitor-monitor description corrected

**Status:** EXECUTED this sweep.
**Change:** Description updated from "Runs Monday 8am" → "Runs Thursday 4am."
**Tool:** `mcp__scheduled-tasks__update_scheduled_task`
**Carry-forward count:** 3 sweeps. Now resolved.

No other quick wins are auto-executable in an unattended run (skill changes require skill-creator + Patrick install, doc moves require records agent in a live session).

---

## Ecosystem Research — 2026-04-20

### Stripe Official MCP Server — Now Live (HIGH relevance)

Stripe has launched an official MCP server at `https://mcp.stripe.com`. Integration command:
```
claude mcp add --transport http stripe https://mcp.stripe.com
```

**Why this matters for FindA.Sale:** FindA.Sale has active Stripe Connect, subscription billing, and POS flows. The current approach requires Claude to read stripeController.ts to understand Stripe state. With the Stripe MCP active, Claude could:
- Query live Stripe data (subscriptions, payment intents, Connect accounts) directly
- Debug payment failures without Patrick pulling logs manually
- Verify webhook configurations without reading backend code

**Blocker:** Photo station (P1) and Checklist QA are both blocked on missing `STRIPE_TEST_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY`. These are Patrick manual actions. The Stripe MCP could accelerate the unblocking workflow by letting Claude inspect the test environment state directly.

**Recommendation:** Add to P-proposals section. Installing the Stripe MCP in Cowork could replace several manual "check Railway logs" debugging loops.

### Google Drive / Gmail / Calendar MCPs — Available

Twelve connectors added in February 2026 include Google Drive, Gmail, and Google Calendar. Pre-built, no-code setup via Claude settings.

**Applicability:** Currently LOW — FindA.Sale is not drive-centric. However: if Patrick begins doing beta outreach document management or tracking organizer onboarding in Drive, the connector would close a loop. Not urgent. Parking lot.

### Plugin Marketplace — Growth Continues

Plugin marketplace (launched Jan 2026) is growing rapidly. The knowledge-work-plugins bundle Patrick already has installed covers most PM/marketing/ops use cases. No new high-priority plugins identified this sweep.

### No New Connectors Immediately Applicable Beyond Stripe

CRM connectors (Apollo, Clay, Outreach) are available but require Patrick decision on CRM strategy first. MailerLite MCP already connected and active.

---

## Skill Audit — 2026-04-20

### 🔴 P0 (4th sweep): dev-environment — Neon reference confirmed at line 48

**Status: STILL UNFIXED. 4 consecutive sweeps. Escalated.**

Line 48 of `/sessions/gracious-wizardly-hamilton/mnt/.claude/skills/dev-environment/SKILL.md`:
> "For Neon (production): Find the commented line `# DATABASE_URL=postgresql://neondb`"

Neon was decommissioned in S264. Production is Railway (`maglev.proxy.rlwy.net:13949/railway`).

The April 13 sweep confirmed 9 total stale references (lines 48, 100, 104, 106, 119, 141, 143, 183, 217). The April 20 sweep re-confirmed line 48 is still present.

**Risk:** Any session that loads this skill and follows its migration instructions without reading CLAUDE.md §6 first will target a dead database. Migrations will silently fail or error. Data will not sync.

**Required action (next live session):**
1. Patrick must invoke `Skill('skill-creator')` to update dev-environment SKILL.md
2. Replace all 9 Neon references with Railway equivalents per CLAUDE.md §6
3. Install updated skill via Cowork UI

### ⚠️ Stale (3rd sweep): next-session-brief.md — S199 content

Still present at `claude_docs/next-session-brief.md`. Contains S199 priorities (Sale Ripples, Passkey) from ~250 sessions ago. Per CLAUDE.md §12, this content has been consolidated into STATE.md "## Next Session." The file is orphaned and contaminating context windows.

**Required action:** findasale-records to move to `claude_docs/archive/next-session-brief-archived.md`.

### ✅ QW-3: findasale-competitor-monitor — FIXED this sweep

Description now correctly reads "Runs Thursday 4am." No further action needed.

### ✅ No new skill staleness from S520–S521

S520 shipped Shop Mode, Share & Promote overhaul, Store Hours, and isActive centralization. S521 fixed Vercel build errors. Quick scan of findasale-dev, findasale-qa, findasale-ops, findasale-ux shows no routing or triggering issues relative to these features. Skill descriptions remain accurate.

### ⚠️ New observation: findasale-qa still has no Computer Use documentation

Flagged in April 13 sweep as P-4. Still not actioned. Computer Use has been GA in Cowork since April 9. The findasale-qa skill should document when to use `mcp__Claude_in_Chrome__*` vs. Computer Use tools (different capability profiles: Chrome MCP for web interaction, Computer Use for desktop/file system access). Low urgency but a genuine capability gap.

---

## Scheduled Tasks Audit — 2026-04-20

14 tasks active. All enabled. Summary:

| Task | Schedule | Last Run | Status |
|------|----------|----------|--------|
| findasale-health-scout | Sun 4:08am | 2026-04-19 | ✅ Running |
| findasale-competitor-monitor | Thu 4:05am | 2026-04-16 | ✅ Description fixed this sweep |
| findasale-ux-spotcheck | Wed 4:03am | 2026-04-15 | ✅ Running |
| findasale-monthly-digest | 1st of month | 2026-04-01 | ✅ Running |
| findasale-session-warmup | Manual | — | ✅ On-demand |
| findasale-session-wrap | Manual | — | ✅ On-demand |
| findasale-workflow-retrospective | 8th of month | 2026-04-08 | ✅ Running |
| context-freshness-check | Mon 4:23am | 2026-04-13 | ✅ Running |
| findasale-power-user-sweep | Mon 3:07am | Today | ✅ Running (this task) |
| daily-friction-audit | Mon–Fri 3:38am | 2026-04-17 | ✅ Running |
| weekly-pipeline-briefing | Fri 4:03am | 2026-04-17 | ✅ Running |
| weekly-full-site-audit | Thu 4:00am | 2026-04-16 | ✅ Running |
| weekly-brand-drift-detector | Tue 4:07am | 2026-04-14 | ✅ Running |
| monday-digest | Mon 4:38am | 2026-04-13 | ✅ Running |

**No stale or misfiring tasks found beyond the now-fixed competitor-monitor description.**

**Gap check:** P-3 (dedicated QA backlog-clearing task) remains unimplemented — still a Patrick decision (see Proposals section). The weekly-full-site-audit and ux-spotcheck tasks do code auditing, not interactive Chrome verification. The gap between "feature shipped" and "feature Chrome-verified" continues to be the primary QA accumulation point.

---

## Autonomous Work Discovery — 2026-04-20

### STATE.md is Healthy — No Drift

STATE.md is at S521, current as of today. Roadmap is at v114. No session count drift, no orphaned "Current Work" items. Records agent is maintaining docs well.

### P1 Blocker Is a Single Patrick Action

Both top P1 items in STATE.md share the same blocker: Stripe test env vars.

- **Photo station** (`/sales/[id]/photo-station.tsx`) → blocked on `STRIPE_TEST_SECRET_KEY`
- **Checklist QA** (POS/online/auction/in-app flows) → blocked on the same two env vars

This means a single 5-minute Patrick action (setting env vars on Railway + Vercel) unblocks two P1 workstreams simultaneously. Flagging directly in summary.

### Survey Trigger Calls — Still Unimplemented (4th flag)

`showSurvey()` calls on the 10 trigger pages remain unimplemented since S399. The feedback infrastructure (FeedbackModal, 10 survey definitions) is built and deployed. Without the trigger calls, zero surveys reach real users. This was flagged in April 6, April 13, and now April 20 sweeps.

**Note:** This is a dev dispatch task — no Patrick decision needed. Pure frontend wiring. Can be dispatched inline in the next live session.

### QA Backlog Assessment

The April 13 sweep documented S436–S443 as an 8-session QA backlog. Sessions S444–S521 have continued shipping features. Verifying actual Chrome-confirmed features from recent sessions would require reading each session's STATE entry — out of scope for this sweep. The P-3 scheduled task proposal (QA backlog clearing) remains the structural solution.

### Research-to-Roadmap Gap — POS Evolution

The `pos-upgrade-market-research.md` document identifies zero competitors in secondary sales with in-app POS as a major opportunity. The roadmap has POS features (#162 Chrome-verified, #285 in "Only Human Left"). The research document recommends "Simple Mode first (payment-only), then Advanced Mode (QR scanning, open cart) in Phase 2." STATE.md references a pending Architect spec for mark-sold → POS/Invoice evolution. No new action needed — this is tracked. Confirming alignment.

---

## Improvement Batch — 2026-04-20

---

### 🔴 P0 Escalation (4 sweeps, no action)

**QW-1: dev-environment skill — 9 Neon references — ESCALATED TO P0**
**Category:** Skill correctness bug — migration safety
**Impact:** HIGH — Incorrect migration instructions target a dead database
**Effort:** 30 min skill update via skill-creator + Patrick install via Cowork UI
**Route to:** skill-creator → Patrick installs → findasale-records confirms
**Auto-executable?:** NO (requires Patrick to install updated skill)
**Carry-forward count:** 4 consecutive sweeps. This is now the most dangerous unfixed item in the system.
**Action required:** Must be addressed in the next live session. Patrick should invoke skill-creator at session start.

---

### 🟢 Quick Wins (auto-executable)

**QW-3: COMPLETED THIS SWEEP** ✅
findasale-competitor-monitor description corrected to "Runs Thursday 4am."

---

### 🟡 Proposals Needing Patrick's Input

**P-NEW-1: Install Stripe Official MCP Connector**
**Category:** Ecosystem connector — direct project value
**Impact:** MEDIUM-HIGH — Enables Claude to query live Stripe state (subscriptions, Connect accounts, payment intents) without reading backend code. Eliminates several "check Railway logs" manual debugging loops. Especially useful while Stripe test env vars are being set up.
**Effort:** 5-min setup: `claude mcp add --transport http stripe https://mcp.stripe.com`
**Route to:** Patrick authorization (MCP installation)
**Auto-executable?:** NO — Patrick installs MCPs
**Note:** Official Stripe MCP, launched 2026. No third-party proxy.

**P-2: Mobile Dispatch evaluation (CARRY-FORWARD × 3, now GA)**
**Category:** Workflow — mobile task assignment
**Impact:** MEDIUM — Text Claude tasks from phone at estate sales
**Route to:** Patrick decision only
**Auto-executable?:** NO
**Carry-forward count:** 3 sweeps. Low friction to try since it's fully GA.

**P-3: QA backlog-clearing scheduled task (CARRY-FORWARD × 3)**
**Category:** Process improvement — QA accumulation
**Impact:** HIGH — Features keep shipping faster than Chrome QA can verify them
**Route to:** findasale-records (to create the task)
**Auto-executable?:** NO — Patrick decides: (a) automated Chrome QA dispatches or (b) dedicated QA-only live sessions
**Carry-forward count:** 3 sweeps. QA gap is the persistent structural problem in the workflow.

**P-1: Gmail MCP for Customer Champion (CARRY-FORWARD × 3)**
**Category:** Ecosystem connector
**Impact:** MEDIUM — Closes the loop on drafted support emails (Claude drafts → Patrick manually sends → could be Claude sends)
**Route to:** Patrick authorization
**Auto-executable?:** NO

---

### 🔵 Research / Dev Dispatch Items

**R-1: showSurvey() trigger calls — dispatch to findasale-dev (4th flag)**
Pure frontend wiring task. S399 handoff notes contain the 10 trigger pages. No Patrick decision needed. Recommend dispatching in the next live session as a focused 1-task dev dispatch. This has been sitting for ~120 sessions.

**P-4: findasale-qa SKILL.md — document Computer Use (CARRY-FORWARD × 2)**
Category: Skill enhancement. Now that Computer Use is GA, the QA skill should document both methods. Route to skill-creator. Patrick reviews before activation.

**P-5: Account Deletion — GDPR obligation (CARRY-FORWARD × 2)**
Broken button in shopper/settings.tsx:459. GDPR right to erasure. Route: findasale-legal risk confirmation → findasale-dev implementation. Patrick must authorize cascading delete logic.

---

### 🅿️ Parking Lot

- **Google Drive / Gmail / Calendar MCPs:** Available. Low FindA.Sale relevance until beta organizer docs/comms are more structured.
- **BatchData MCP (real estate/property):** Estate sale organizer prospecting. No current use case.
- **Managed Agents (Anthropic):** Cloud-hosted agent API for production agent deployment. Revisit post-launch.
- **Claude Code Channels (Discord/Telegram):** Developer-focused. No FindA.Sale use case.
- **Zoom MCP:** No organizer video use case identified.
- **Tech debt #4–#12 from S413 audit:** Valid but lower priority than Stripe IDs + account deletion. Bundle into a "tech debt sprint" roadmap item.

---

## Summary for Patrick

**This sweep auto-executed 1 fix:** findasale-competitor-monitor description corrected (Thursday 4am, not Monday 8am). ✅

**Top 3 actionable proposals:**

### 1. 🚨 dev-environment skill — Neon references are dangerous (4 sweeps, still unfixed)

This is now the #1 unfixed item in the entire system. The skill tells Claude to use a Neon database URL that was decommissioned in S264. Any session that follows the skill's migration instructions without manually overriding (per CLAUDE.md §6) will attempt to run migrations against a dead endpoint. In the next live session, please invoke `Skill('skill-creator')` and update the skill. This takes ~30 minutes and prevents silent migration failures.

### 2. ⚡ Single Patrick action unblocks two P1 workstreams

Setting `STRIPE_TEST_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY` on both Railway and Vercel simultaneously unblocks (a) the Photo Station page build and (b) all four Checklist QA test flows. This is the highest-ROI 5-minute action available right now.

### 3. 🔌 Install the official Stripe MCP connector

Stripe now has an official MCP server (`https://mcp.stripe.com`). Installing it would let Claude query your live Stripe data directly — subscriptions, Connect accounts, payment intents — without you having to pull logs or share credentials manually. Especially useful while debugging the Stripe test environment setup. Five-minute install.

---

*Next sweep scheduled: 2026-04-27*
