# Next Session Prompt — Sessions 105 + 106 + Backlog
**Written:** 2026-03-09 (end of Session 104)
**Purpose:** Hand Patrick a ready-to-paste session opener that loads full context and kicks off the right work immediately.

---

## Copy-Paste Session Opener

```
Load context.md and STATE.md. We are starting Session 105 — Bug Blitz.

Read BACKLOG_2026-03-08.md and roadmap.md Agent Task Queue before doing anything.

Session 105 sequence:
1. findasale-qa + health-scout: Run Bug Blitz Scoping — produce a prioritized P0/P1/P2 bug list from BACKLOG_2026-03-08.md §A. Do this FIRST before any code changes.
2. findasale-dev: Execute all P0 bugs in order (map pins A1.1/A1.2, mobile menu A2.1, photo upload A3.1/A3.2, server error A3.6, Rapid Capture A3.7, Dashboard audit A4.1).
3. findasale-ops: Verify MAILERLITE_API_KEY is set in Railway. If yes, confirm MailerLite webhook fires on sale publish. If not, document exact steps for Patrick.
4. findasale-dev: Run Neon migration 20260310000001 (full-text search indexes) — use `prisma migrate deploy`, not db push.

After P0 bugs are fixed:
- Continue with P1 bugs from the scoped list.
- Do NOT start Session 106 architecture decisions until all P0s are resolved.

When Session 105 work is complete, set up for Session 106:
- findasale-architect: Read BACKLOG_2026-03-08.md §B (Architecture Decisions). Produce a one-page brief on B1 (Sale Type → Item Type linchpin) covering: what changes, what it unblocks (B4/D1/B7), effort estimate, recommended decision. Patrick reviews before Session 106 starts.
```

---

## What Patrick Needs to Do Before Session 105 Starts

**Required (session will be slower without these):**

- [ ] **Install all 18 .skill files** — `claude_docs/skill-updates-2026-03-09/`. Click "Copy to your skills" on each. The three errored ones (hacker, pitchman, advisory-board) are re-packaged and should install cleanly now. Start with those to confirm.
- [ ] **Push Session 104 changes** — Open PowerShell, run exactly:

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add claude_docs/strategy/roadmap.md
git add claude_docs/STATE.md
git add claude_docs/logs/session-log.md
git add claude_docs/improvement-memos/fleet-self-audit-2026-03-09.md
git add claude_docs/improvement-memos/pitchman-sweep-2026-03-09.md
git add claude_docs/research/rd-opentelemetry-2026-03-09.md
git add claude_docs/next-session-prompt.md
git add claude_docs/CORE.md
git add claude_docs/SESSION_WRAP_PROTOCOL.md
git add claude_docs/WRAP_PROTOCOL_QUICK_REFERENCE.md
git add claude_docs/skill-updates-2026-03-09/findasale-dev.skill
git add claude_docs/skill-updates-2026-03-09/findasale-qa.skill
git add claude_docs/skill-updates-2026-03-09/findasale-architect.skill
git add claude_docs/skill-updates-2026-03-09/findasale-records.skill
git add claude_docs/skill-updates-2026-03-09/findasale-ops.skill
git add claude_docs/skill-updates-2026-03-09/findasale-deploy.skill
git add claude_docs/skill-updates-2026-03-09/health-scout.skill
git add claude_docs/skill-updates-2026-03-09/findasale-marketing.skill
git add claude_docs/skill-updates-2026-03-09/findasale-cx.skill
git add claude_docs/skill-updates-2026-03-09/findasale-support.skill
git add claude_docs/skill-updates-2026-03-09/findasale-legal.skill
git add claude_docs/skill-updates-2026-03-09/findasale-ux.skill
git add claude_docs/skill-updates-2026-03-09/findasale-rd.skill
git add claude_docs/skill-updates-2026-03-09/findasale-workflow.skill
git add claude_docs/skill-updates-2026-03-09/findasale-hacker.skill
git add claude_docs/skill-updates-2026-03-09/findasale-pitchman.skill
git add claude_docs/skill-updates-2026-03-09/findasale-advisory-board.skill
git add claude_docs/skill-updates-2026-03-09/cowork-power-user.skill
git commit -m "Session 104: fleet self-audit, 18 skill updates, roadmap v20, agent task queue"
.\push.ps1
```

**Optional (will unblock work during session 105):**
- [ ] **Add MAILERLITE_API_KEY to Railway** — Railway dashboard → FindA.Sale service → Variables → Add `MAILERLITE_API_KEY` with value from MailerLite → Integrations → MailerLite API. Needed before ops can verify the email automation.
- [ ] **Run Neon migration** — In PowerShell: `cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database && npx prisma migrate deploy`. This deploys migration 20260310000001 (full-text search indexes). Required for Sprint 4b FTS testing.

---

## Session 105 Context Summary

**Goal:** Clear all P0 production bugs before first beta organizer. These bugs would ruin trust on first contact.

**P0 Bugs from BACKLOG_2026-03-08.md §A (confirmed on finda.sale):**

| # | Bug | URL | Owner |
|---|-----|-----|-------|
| A1.1 | Map pins not rendering | finda.sale/ | findasale-dev |
| A1.2 | Map broken on mobile | finda.sale/ | findasale-dev |
| A2.1 | Mobile menu blocked by install banner | finda.sale/ | findasale-dev |
| A3.1/A3.2 | Photo upload "Unexpected field" error | Organizer flow | findasale-dev |
| A3.6 | Server error on manual item entry | Organizer flow | findasale-dev |
| A3.7 | Rapid Capture "camera unavailable" | Rapid Capture | findasale-dev |
| A4.1 | Dashboard audit (UX review first, then dev) | Organizer dashboard | findasale-ux → findasale-dev |
| A1.3 | "My location" button does nothing | finda.sale/map | findasale-dev |

**Quick wins to bundle in (P1, low effort):**
- A1.4: Search doesn't search item text (FTS integration to main search bar — Sprint 4b may have partially shipped this, verify)
- A2.2: Mobile scrolling jank
- A3.3, A3.4: Item entry UX issues
- A3.5: Batch upload improvements

---

## Session 106 Context Summary

**Goal:** Make the B1 linchpin decision — Sale Type → Item Type. This decision gates everything below.

**B1 Decision (Sale Type → Item Type):**
- Current: items belong to a Sale which has a Type (estate, yard, auction).
- Proposed: items have their own Type field (allows mixed-type sales, quasi-POS capture).
- Why it matters: B1 blocks B4 (auction reserves), D1 (quasi-POS), and B7 (referral mechanics). It's the schema linchpin.
- Session 106 deliverable: architect produces decision brief → Patrick approves or modifies → dev implements.

**Other architecture decisions queued for 106:**
- B5: Organizer email replies — dashboard-only or parse email replies?
- B8: Zapier/Webhooks — go/no-go? (Patrick decision needed)
- B4: Auction reserves (depends on B1)

---

## Backlog Clearance Priorities

From BACKLOG_2026-03-08.md — items to work through in sessions 105+:

**Clear in Session 105 (Bug Blitz):**
- All §A P0 and P1 bugs (see table above)
- D2: MailerLite backend verification (ops check)

**Route to Agent Task Queue (roadmap):**
- Agent tasks from roadmap Agent Task Queue — run in parallel with bug blitz where possible:
  - Bug Blitz Scoping (qa + health-scout) — do first
  - OAuth Red-Team (hacker) — do before OAuth ships
  - Spring Content Push (marketing) — time-sensitive, do this week

**Defer to Session 106:**
- §B Architecture decisions
- D1 Quasi-POS (depends on B1)
- D3 Map route planning

**Defer to post-beta:**
- §C Legal (no action for beta per fleet input)
- §F New agents (Hacker/Pitchman/Advisory Board already built — check off)
- §J Data monetization (Year 2)

---

## Fleet Status After Session 104

All 18 skills updated. Install in this order to catch any errors early:
1. findasale-hacker ← previously errored, re-packaged
2. findasale-pitchman ← previously errored, re-packaged
3. findasale-advisory-board ← previously errored, re-packaged
4–18. All remaining skills (already installed versions exist, new versions add steelmanned improvements)

MESSAGE_BOARD wiring status:
- ✅ Wired: architect, marketing, legal, rd, support, hacker (existing Rule 5), advisory-board (new Rule 7), pitchman (pre-existing)
- ⏳ Still need wiring: dev, qa, ops, deploy, ux, cx, workflow, records, health-scout (9 agents — defer to next power-user sweep)

---

*Session 104 complete. Fleet self-audited, all agents upgraded, roadmap expanded, next session staged. Good to go.*
