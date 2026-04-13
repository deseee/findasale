# FindA.Sale Subagent Fleet & System Audit
*Date: 2026-03-06 | Tier 3 (Archive on creation)*
*Auditor: Opus | Scope: Full fleet, docs, scheduled tasks, workflows*

---

## 1. Fleet Inventory

| Agent | Model Target | Purpose | Last Active |
|-------|-------------|---------|-------------|
| findasale-dev | Sonnet | Code implementation | Session 82 |
| findasale-architect | Sonnet/Opus | Schema + architecture | Session ~78 |
| findasale-qa | Sonnet | Test + code review gating | Not formally invoked yet |
| findasale-ops | Sonnet | Railway/Vercel/Neon infra | Session ~80 |
| findasale-deploy | Sonnet | Pre-deploy checklist | Not formally invoked yet |
| findasale-ux | Sonnet | UX flows + usability audits | Not formally invoked yet |
| findasale-rd | Sonnet | Research + feasibility | Session ~68 |
| findasale-marketing | Sonnet | Content + campaigns | Session ~69 |
| findasale-legal | Sonnet | Compliance + risk flags | Not formally invoked yet |
| findasale-support | Sonnet | Inbound issue resolution | Not formally invoked yet |
| findasale-cx | Sonnet | Beta onboarding + success | Not formally invoked yet |
| findasale-records | Sonnet | Doc gatekeeper + audits | Session ~80 |
| findasale-workflow | Sonnet | Meta-process optimization | Not formally invoked yet |
| health-scout | Haiku | Proactive code scanning | Session 82 |
| context-maintenance | Sonnet | Doc freshness + session wrap | Session 82 |

**Finding:** 7 of 15 agents have never been formally invoked. They exist as skills but have no usage history. The fleet was built in a burst but hasn't been battle-tested.

---

## 2. Critical Gaps

### Gap 1: No Agent-to-Agent Handoff Protocol
**Severity: HIGH**

Skills reference each other (e.g., "route to QA after Dev", "consult Architect before Dev") but there's no formal handoff mechanism. When health-scout finds a bug, it says "route to Dev" — but who spawns Dev? The orchestrating session (Patrick + Claude) must manually interpret and dispatch. This works at low volume but will break during beta when issues compound.

**Recommendation:** Add a "Dispatch Protocol" section to CORE.md that defines: (a) which findings auto-spawn which agents, (b) the handoff format (structured JSON-like block with context, severity, files affected), and (c) who owns the dispatch decision (always the main session, never an agent spawning another agent without Patrick's awareness).

### Gap 2: QA Agent Has Never Run
**Severity: HIGH**

findasale-qa is described as a mandatory gate ("blocks bad code — treat its findings as mandatory") but has never actually been invoked across 82 sessions. All code has shipped without formal QA gating. The skill is well-written but untested.

**Recommendation:** Run QA immediately against the current codebase — particularly payment flows (Stripe Connect, Hunt Pass), auth (invite codes, OAuth), and data writes (messaging, reviews). This should happen before beta, not after.

### Gap 3: UX Agent Never Consulted Before Features
**Severity: MEDIUM**

findasale-ux says "Always consult UX before findasale-dev starts on new user-facing features." This has never happened. All CD2 features (Virtual Tours, Discovery Feed, Dynamic Pricing, Leaderboards, etc.) shipped without UX review. The skill exists but the workflow doesn't enforce it.

**Recommendation:** Before beta, run a UX audit of the 5 most user-facing flows: (1) organizer first sale creation, (2) shopper browse-to-purchase, (3) AI item upload, (4) beta invite → registration, (5) messaging. This is the CX agent's lifeline — if organizers hit confusing flows in beta, retention drops immediately.

### Gap 4: Legal Agent Never Consulted
**Severity: MEDIUM**

ToS and Privacy Policy shipped (CA1) but findasale-legal was never invoked to review them. Payment flows, data collection, consignment implications, and Michigan estate sale regulations haven't had a legal lens.

**Recommendation:** Run a legal compliance scan: (a) ToS/Privacy completeness for a marketplace, (b) Stripe Connect compliance (platform liability), (c) Michigan estate sale regulations, (d) data retention/deletion obligations.

### Gap 5: Support + CX Agents Have No Foundation
**Severity: MEDIUM**

findasale-support references a KB at `claude_docs/guides/support-kb.md` that doesn't exist. findasale-cx references a `beta-status.md` that doesn't exist. These agents are designed to handle beta users but have zero content to work with.

**Recommendation:** Bootstrap both: (a) Support KB with the top 10 likely beta issues (login, payment, item upload, notifications), (b) CX beta-status dashboard template, (c) onboarding email sequence (welcome → day 3 → week 2).

### Gap 6: dev-environment Skill Is Stale
**Severity: MEDIUM**

Still references Docker as the primary dev setup. STATE.md says "Dev stack is now native — Docker no longer used at all." The skill tells Claude to give Docker commands that won't work.

**Recommendation:** Rewrite dev-environment to reflect native Windows setup (pnpm, native postgres, no Docker). This prevents every future session from getting confused by stale Docker instructions.

### Gap 7: No E2E Smoke Test Automation
**Severity: MEDIUM**

A 31-step manual e2e test checklist exists (BETA_CHECKLIST.md) but there's no automated testing. No Playwright, no Cypress, no API test suite. All verification is manual or health-scout (which scans code, not runtime behavior).

**Recommendation:** This is post-beta, but flag it now. For beta, the e2e checklist is sufficient. Post-beta, findasale-rd should evaluate Playwright for critical paths.

---

## 3. Documentation Issues

### Issue 1: Orphan Files in claude_docs/
- `new 1.txt`, `new 2.txt` — purpose unknown, likely test artifacts
- `SEED_SUMMARY.md` — may be stale if seed has changed
- `pre-commit-check.md` — may duplicate self_healing_skills.md entries
- `beta-readiness-audit-2026-03-05.md` — Tier 3, should be in archive/

### Issue 2: RECOVERY.md References Docker Extensively
Entries 10–15 all reference Docker commands. Since Docker is retired, these recovery procedures are invalid. A native-Windows equivalent is needed.

### Issue 3: STATE.md Has Credential Leak
Lines 99-103 contain plaintext Neon database credentials (username + password). These are also in self_healing_skills.md entry #28. While STATE.md isn't committed to a public repo, this violates SECURITY.md §6 ("Never log API keys / commit secrets"). If these docs ever leak, the production database is exposed.

**Recommendation:** Remove credentials from STATE.md and self_healing_skills.md. Reference `.env` file location instead. Rotate Neon credentials as a precaution.

### Issue 4: Scheduled Task Descriptions Drift
- `findasale-session-warmup` says "Docker health check" — Docker is gone
- `findasale-changelog-tracker` and `weekly-industry-intel` and `findasale-workflow-review` are disabled but still listed — should be formally cleaned up or deleted
- `context-freshness-check` and `findasale-nightly-context` overlap — both check context.md freshness daily

### Issue 5: ROADMAP.md Is Massive (~225 lines)
It's Tier 2 but gets loaded frequently. Most content is completed phases marked ✅. The completed items should be compressed to a one-liner referencing COMPLETED_PHASES.md, keeping ROADMAP.md focused on what's actually next.

---

## 4. Workflow Gaps

### Workflow 1: Beta Incident Response Path Missing
When a beta user reports a bug, the expected chain is: Support → triage → QA/Dev → fix → deploy. But there's no documented incident response workflow for the subagent fleet. Who gets spawned first? What's the SLA? How does Patrick get notified?

### Workflow 2: No Feedback-to-Feature Pipeline
CX collects feedback → routes to R&D for feasibility → Architect for design → Dev for build → QA for verify. This pipeline is described in individual skills but not documented as an end-to-end workflow. During beta, this will be the primary value loop.

### Workflow 3: Marketing Has No Content Calendar
Marketing skill exists and has produced content (CC2), but there's no scheduled content creation or publishing cadence. Beta launch needs: week -1 (outreach emails), week 0 (launch announcement), weeks 1-4 (social posts, blog updates, user stories).

---

## 5. Preventative Measures

| Measure | Owner | Priority |
|---------|-------|----------|
| Rotate Neon credentials + remove from docs | Patrick + Ops | URGENT |
| Run QA audit before beta | QA | HIGH |
| Run UX audit of top 5 flows before beta | UX | HIGH |
| Run legal compliance scan | Legal | HIGH |
| Bootstrap Support KB + CX beta-status | Support + CX | HIGH |
| Rewrite dev-environment for native setup | Records | MEDIUM |
| Create incident response workflow doc | Ops + Support | MEDIUM |
| Create feedback-to-feature pipeline doc | Workflow | MEDIUM |
| Clean up orphan files + stale scheduled tasks | Records | LOW |
| Compress ROADMAP.md completed sections | Records | LOW |

---

## 6. Agent Work Paths (Immediate)

Each agent gets a specific task to execute right now, prioritized by beta readiness impact.

### Path 1: findasale-qa (Sonnet)
**Task:** Pre-beta code audit of payment flows, auth system, and data writes.
- Review: Stripe Connect fee logic, Hunt Pass payment, concurrent purchase guard
- Review: invite code validation + redemption, OAuth flow, JWT payload
- Review: messaging create/read, review submission, organizer payout
- Output: PASS/FAIL verdict with BLOCKER/WARN/NOTE findings

### Path 2: findasale-ux (Haiku — read-only audit)
**Task:** Usability audit of the 5 most critical user flows.
- Flow 1: Organizer creates first sale (onboarding wizard → sale form → item add → publish)
- Flow 2: Shopper browses → searches → purchases an item
- Flow 3: AI item upload (photo → suggestions → accept/edit → save)
- Flow 4: Beta invite → registration → first login
- Flow 5: Shopper sends message to organizer
- Output: UX findings with severity + recommended fixes

### Path 3: findasale-legal (Haiku — read-only review)
**Task:** Pre-beta legal compliance scan.
- Review: ToS at /terms and Privacy Policy at /privacy
- Review: Stripe Connect marketplace obligations
- Review: Michigan estate sale regulations
- Review: Data collection, retention, and deletion practices
- Output: Risk-rated findings (BLOCKER/HIGH/MEDIUM/LOW/NOTE)

### Path 4: findasale-support (Haiku — content creation)
**Task:** Bootstrap the support knowledge base.
- Create: claude_docs/guides/support-kb.md with top 15 anticipated beta issues
- Categories: account/login, payments, item management, notifications, organizer setup
- Format: issue → diagnosis → resolution → escalation trigger
- Output: Ready-to-use KB file

### Path 5: findasale-cx (Haiku — content creation)
**Task:** Build beta onboarding infrastructure.
- Create: claude_docs/beta-launch/beta-status.md dashboard template
- Create: onboarding email sequence (welcome, day 3 check-in, week 2 feedback request)
- Create: success criteria tracking template (published sale, 10+ items, 1+ buyer interaction)
- Output: Beta coordinator toolkit

### Path 6: findasale-records (Haiku — doc cleanup)
**Task:** Doc hygiene sweep.
- Move orphan files to archive/ (new 1.txt, new 2.txt, beta-readiness-audit, pre-commit-check)
- Remove credentials from STATE.md and self_healing_skills.md (replace with .env reference)
- Update RECOVERY.md Docker entries to native-Windows equivalents
- Compress ROADMAP.md completed sections
- Clean up disabled scheduled tasks
- Output: List of all changes made

### Path 7: findasale-marketing (Haiku — content creation)
**Task:** Beta launch content calendar + launch-week content.
- Create: 4-week content calendar (weeks -1 through 3)
- Create: launch announcement post (social + email)
- Create: "Meet FindA.Sale" blog post for the site
- Output: Content package in claude_docs/beta-launch/

### Path 8: findasale-ops (Haiku — verification)
**Task:** Production readiness verification.
- Verify: all env vars in Railway match .env.example
- Verify: Vercel env vars complete
- Verify: Neon connection healthy
- Verify: Sentry receiving events
- Verify: UptimeRobot monitors active
- Output: Infrastructure readiness report

---

*This audit is a Tier 3 artifact. Archive immediately after work paths are dispatched.*
