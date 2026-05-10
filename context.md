# CONTEXT.md — Session Routing Guide
*Created 2026-05-10. Manually maintained. Do not auto-generate or overwrite.*

At session start, identify your session type from the table below.
Load only the listed CLAUDE.md sections and reference docs. Skip the rest.
This file exists because CLAUDE.md is 517 lines — loading it entirely every session
wastes context and causes compression to drop enforcement rules. Load what you need.

---

## Session Types

### 1. DEV SESSION — feature implementation, bug fixes, writing code

| Load | Skip |
|------|------|
| §0 Session Start (always) | §9 QA Honesty Gate (QA sessions only) |
| §1 Project Purpose | §10c QA Management (QA sessions only) |
| §2 Monorepo Structure | §12 Session Wrap (wrap sessions only) |
| §3 Cross-Layer Contracts | |
| §4 Execution Rules | |
| §5 Push Rules (full — survives compression) | |
| §7 Subagent-First Gate (full — survives compression) | |
| §8 Schema-First Pre-Flight Gate | |
| §10 MCP Tool Awareness | |
| §11 Token Efficiency Rules | |

**Reference docs:** `STACK.md`, `SECURITY.md`, `STATE.md`, `claude_docs/decisions-log.md`

---

### 2. QA SESSION — browser testing, Chrome MCP, feature audits

| Load | Skip |
|------|------|
| §0 Session Start (always) | §3 Cross-Layer Contracts |
| §4 Execution Rules (QA ceiling rule) | §6 Schema Change Protocol |
| §5 Push Rules (push block after fixes) | §8 Schema-First Pre-Flight |
| §7 Subagent-First Gate (dispatch routing) | §11 Token Efficiency Rules |
| §9 QA Honesty Gate (full — survives compression) | |
| §10 MCP Tool Awareness | |
| §10c QA Management (full — survives compression) | |

**Reference docs:** `STATE.md` (Blocked/Unverified Queue), `claude_docs/operations/orchestrator-qa-accountability.md`

---

### 3. OPS SESSION — Railway, Vercel, database, migrations, deploys

| Load | Skip |
|------|------|
| §0 Session Start (always) | §7 Subagent-First Gate |
| §4 Execution Rules (environment gate) | §8 Schema-First Pre-Flight |
| §5 Push Rules | §9 QA Honesty Gate |
| §6 Schema Change Protocol (if migration involved) | §10c QA Management |
| §10 MCP Tool Awareness | |
| §11 Token Efficiency Rules | |

**Reference docs:** `STATE.md`, `STACK.md`, `RECOVERY.md`, `claude_docs/migration-runbook.md`

---

### 4. DOCS/WRAP SESSION — STATE.md update, roadmap, session wrap, planning

| Load | Skip |
|------|------|
| §0 Session Start (always) | §3 Cross-Layer Contracts |
| §4 Execution Rules (roadmap update gate) | §6 Schema Change Protocol |
| §5 Push Rules (wrap doc push block) | §7 Subagent-First Gate |
| §10 MCP Tool Awareness | §8 Schema-First Pre-Flight |
| §11 Token Efficiency Rules | §9 QA Honesty Gate |
| §12 Session Wrap (full — mandatory order) | §10c QA Management |

**Reference docs:** `STATE.md`, `claude_docs/strategy/roadmap.md`, `claude_docs/patrick-dashboard.md`, `claude_docs/operations/file-creation-schema.md`

---

### 5. RESEARCH/PLANNING SESSION — advisory board, competitor, innovation, no code

| Load | Skip |
|------|------|
| §0 Session Start (always) | §3 Cross-Layer Contracts |
| §1 Project Purpose | §5 Push Rules |
| §4 Execution Rules (friction gate only) | §6 Schema Change Protocol |
| | §7 Subagent-First Gate |
| | §8 Schema-First Pre-Flight |
| | §9 QA Honesty Gate |
| | §10 MCP Tool Awareness |
| | §10c QA Management |
| | §12 Session Wrap |

**Reference docs:** `STATE.md`, `claude_docs/strategy/roadmap.md`, `claude_docs/decisions-log.md`

---

## Always Load (every session type, no exceptions)

- `§0 Session Start` — mandatory ritual, non-negotiable
- `claude_docs/STATE.md` — source of truth for current project state
- `claude_docs/strategy/roadmap.md` — the work queue (BROKEN + PENDING items)

## Compression Survivors (reload immediately after any compression event)

- `§5 Push Rules` — most commonly lost rule set
- `§7 Subagent-First Gate` (dispatch routing table)
- `§9 QA Honesty Gate`
- `§10c QA Management` (micro-dispatch, evidence gate)
