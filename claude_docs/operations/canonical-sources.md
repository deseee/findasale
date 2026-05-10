# Canonical Sources Map

Created: Session ~S700 (2026-05-10)
Owner: findasale-records
Status: ENFORCED — treat any duplicate as a drift violation

---

## Purpose

Single source of truth map. Each information type has exactly ONE authoritative home. All other files must reference it, not restate it.

When you find a rule in two places, one of them is drift. This file tells you which one to keep.

---

## Main Table

| Information Type | Canonical File + Section | Must NOT Be Duplicated In | Last Audited |
|---|---|---|---|
| **Push / git rules** — who does what, git add format, push.ps1 usage, MCP push limits, pushblock format | `CLAUDE.md` §5 (Push Rules) | conversation-defaults SKILL.md, findasale-records SKILL.md, findasale-deploy SKILL.md, STATE.md, any feature notes | 2026-05-10 |
| **Subagent git ban** — no git commands in subagents, why it exists (two repo wipes), what's allowed | `CLAUDE.md` §5 (Push Rules — Subagent git ban) | findasale-dev SKILL.md, any dispatch prompt templates | 2026-05-10 |
| **Database credentials and connection strings** — Railway DATABASE_URL (internal + public proxy) | Patrick's global `~/.claude/CLAUDE.md` (Credentials section) | `CLAUDE.md`, `STACK.md`, `STATE.md`, any feature-notes or research files. Must NEVER appear in git-committed files. | 2026-05-10 |
| **Secrets handling rules** — no logging keys, no placeholder values, read from VM or stop | `claude_docs/SECURITY.md` §6 | conversation-defaults SKILL.md Rule 12 (pointer only — rule lives in SECURITY.md), global CLAUDE.md | 2026-05-10 |
| **QA honesty gate** — what counts as ✅, the 6 questions, code-on-GitHub ≠ verified, page-loads ≠ verified | `CLAUDE.md` §9 (QA Honesty Gate) | conversation-defaults SKILL.md, findasale-qa SKILL.md (may have summary but must point here), STATE.md, session logs | 2026-05-10 |
| **QA structural anti-fabrication rules** — micro-dispatch, evidence-required acceptance, UNVERIFIED default, Chrome concurrency | `CLAUDE.md` §10c (QA Management) | findasale-qa SKILL.md (may summarize but must cite §10c), findasale-records SKILL.md | 2026-05-10 |
| **Subagent dispatch rules** — Skill() vs Agent() tool usage, findasale-* are Skills not agent types, parallel dispatch pattern | `CLAUDE.md` §7 (Subagent-First Implementation Gate) | conversation-defaults SKILL.md Rule 33 (pointer to §7 for routing), findasale-records SKILL.md, findasale-ops SKILL.md | 2026-05-10 |
| **Removal gate rules** — no feature/nav/UI removal without Patrick sign-off, DECISION NEEDED format | `CLAUDE.md` §7 (Removal Gate) | findasale-dev SKILL.md, findasale-ux SKILL.md, findasale-qa SKILL.md — may reference but must not restate | 2026-05-10 |
| **Session start protocol** — §0 steps, read STATE.md, read roadmap, present top 3 | `CLAUDE.md` §0 (Session Start) | conversation-defaults SKILL.md Rule 3 (covers mechanics; §0 covers content — both are canonical for their scope) | 2026-05-10 |
| **Session start mechanics** — unified single-path pattern, token budget briefing, no "what would you like to work on?" | conversation-defaults SKILL.md Rule 3 | `CLAUDE.md` §0 (content of what to present — §0 is canonical for content, Rule 3 for mechanics) | 2026-05-10 |
| **Wrap protocol** — doc update order (STATE.md → patrick-dashboard.md → pushblock), what goes in STATE.md sections | `CLAUDE.md` §12 (Session Wrap) | findasale-records SKILL.md (has duplicate wrap steps — must become a pointer), conversation-defaults SKILL.md | 2026-05-10 |
| **Schema change protocol** — Prisma migrate deploy, generate, Railway DATABASE_URL override, never prisma db push in production | `CLAUDE.md` §6 (Schema Change Protocol) | findasale-dev SKILL.md, dev-environment SKILL.md — may reference but must not restate | 2026-05-10 |
| **Railway / Vercel deployment notes** — auto-deploy on main push, force redeploy via trivial commit, Vercel 100/day limit | `CLAUDE.md` §10 (MCP Tool Awareness) + `claude_docs/SECURITY.md` §9 | findasale-deploy SKILL.md (operational checklist lives there — deployment FACTS live in CLAUDE.md §10) | 2026-05-10 |
| **Dev-environment gate** — load skill before any shell/PowerShell/Prisma command | `CLAUDE.md` §4 (Execution Rules) + conversation-defaults SKILL.md Rule 4 | findasale-records SKILL.md, findasale-dev SKILL.md, findasale-ops SKILL.md — all must point to conversation-defaults Rule 4 | 2026-05-10 |
| **File creation schema** — naming conventions, locked folder map, Tier 1/2/3 definitions | `claude_docs/operations/file-creation-schema.md` | `CLAUDE.md` (may reference), conversation-defaults SKILL.md Rule 7 (gate only, not the schema itself), findasale-records SKILL.md | 2026-05-10 |
| **Token budget rules** — context window, warn/stop thresholds, checkpoint manifest | conversation-defaults SKILL.md Rules 9–11 | `CLAUDE.md` §11 (Token Efficiency Rules — complementary, not duplicate; covers different levers) | 2026-05-10 |
| **Scheduled tasks registry** — canonical list of active tasks, their schedules, what each does | findasale-records SKILL.md (Scheduled Tasks section) | STATE.md (may note upcoming changes, not the registry itself), any other SKILL.md | 2026-05-10 |
| **Skill update protocol** — three-step: edit source, zip to .skill, present_files for install | findasale-records SKILL.md (Skill Update Protocol) | conversation-defaults SKILL.md (may reference), no other skill should restate this | 2026-05-10 |
| **Decisions log** (individual product decisions) | `claude_docs/decisions-log.md` | STATE.md (may reference decision IDs, not restate decisions), feature-notes, research files | 2026-05-10 |
| **Security incident response** | `claude_docs/SECURITY.md` §7 | `CLAUDE.md`, STATE.md — may reference but not restate | 2026-05-10 |
| **Batch dispatch protocol** — pre-dispatch triage, knock-on checks, dev agent prompt requirements, TS check gate | `CLAUDE.md` §7 (Batch Dispatch Protocol) | findasale-dev SKILL.md (must cite §7, not restate), findasale-ops SKILL.md | 2026-05-10 |
| **Schema-first pre-flight gate** — four steps before any component edit touching DB models | `CLAUDE.md` §8 (Schema-First Pre-Flight Gate) | findasale-dev SKILL.md (may have reminder pointer, not full restatement) | 2026-05-10 |
| **No AI in user-facing copy** (D-006) | `claude_docs/decisions-log.md` D-006 | findasale-ux SKILL.md, findasale-marketing SKILL.md — may note the rule but must cite D-006 as source | 2026-05-10 |
| **Organizer-set values win over AI fallbacks** | `claude_docs/decisions-log.md` (product rule) + global CLAUDE.md MEMORY | findasale-dev SKILL.md, any feature spec — must cite decisions-log, not restate | 2026-05-10 |

---

## Smell Test

Run this audit quarterly. Any key phrase appearing authoritatively in more than one file is a drift violation.

**Procedure:**

1. Pick a rule that matters (e.g., the QA honesty gate, the subagent git ban, the push rules).
2. Extract a distinctive phrase from the canonical file (e.g., "subagent git ban", "page loads ≠ verified", "git add -A").
3. Run a codebase-wide search:
   ```
   grep -r "page loads" claude_docs/ --include="*.md" -l
   grep -r "subagent git ban" . --include="*.md" -l
   grep -r "prisma db push" . --include="*.md" -l
   ```
4. For every file returned: Is this file listed as canonical for this rule in the table above?
   - YES → OK, that's the authoritative copy.
   - NO → It's a duplicate. Convert it to a pointer (see Pointer Format below) or delete the restatement.

**Quarterly schedule:** Run at the start of each monthly-digest session (1st of month), or any time a rule update is made to a canonical file.

---

## Pointer Format

When a non-canonical file currently restates a rule, replace the restatement with a one-line pointer. This keeps the file useful without creating drift.

**Format:**

```
→ See [canonical file] §[section] — this rule is defined there. Do not restate it here.
```

**Examples:**

Instead of restating the QA honesty gate in findasale-qa SKILL.md:
```
→ See CLAUDE.md §9 (QA Honesty Gate) — authoritative definition of what counts as ✅. Apply those rules without restating them here.
```

Instead of restating push rules in findasale-dev SKILL.md:
```
→ See CLAUDE.md §5 (Push Rules) — all git/push mechanics are defined there.
```

Instead of restating the dev-environment gate in findasale-records SKILL.md:
```
→ See conversation-defaults Rule 4 — load dev-environment skill before any shell command.
```

**Rule:** A pointer is one line. If a second file has more than two lines on a topic that belongs to another file's canonical home, that's restatement — convert it.

---

## Known Active Drift (at time of creation)

These duplications were confirmed at creation and should be resolved on next records pass:

| Duplicate Location | Rule Being Restated | Canonical Home | Action |
|---|---|---|---|
| findasale-records SKILL.md (Session Wrap Protocol section) | Wrap doc update order | `CLAUDE.md` §12 | Convert to pointer |
| findasale-records SKILL.md (dev-environment gate implicit in Setup section) | dev-environment gate | conversation-defaults Rule 4 | Convert to pointer |
| conversation-defaults SKILL.md Rule 12 (no placeholder values) | Secrets handling | `SECURITY.md` §6 | Add pointer to SECURITY.md; keep the gate trigger in Rule 12 |
| Global CLAUDE.md (Credentials section) | Database connection strings | Global CLAUDE.md (correct) | Verify not duplicated in any git-committed file |

---

## Authority Order Reference

For rules that span multiple files, this is the resolution order when conflict exists:

1. User (Patrick, in-session) — overrides everything
2. `CLAUDE.md` (project root) — project behavior contract
3. conversation-defaults SKILL.md — mechanics and session flow
4. `claude_docs/SECURITY.md` — security rules override operational convenience
5. Package-level CLAUDE.md files — local constraints only, cannot redefine architecture
6. SKILL.md files — agent-specific behavior
7. `claude_docs/STATE.md` and other operational docs — current state, not rules

Source: `CLAUDE.md` preamble ("Authority order" section).
