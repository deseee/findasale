# Project Execution Contract – FindA.Sale

Scope: Entire monorepo

Behavior rules: CORE.md  
Stack authority: STACK.md  
Project memory: STATE.md  
Security: SECURITY.md  
Recovery: RECOVERY.md  

If conflict exists between this file and a package CLAUDE.md,
this file prevails.

Package-level files must not redefine behavior or architecture.

---

## 1. Project Purpose

FindA.Sale is a PWA for estate sale operators.

Primary goals:
- Reduce manual work
- Simplify sale management
- Improve inventory visibility

---

## 2. Monorepo Structure

packages/
- backend
- frontend
- database
- shared

Each package contains a scoped CLAUDE.md.
They may constrain locally but not redefine architecture.

---

## 3. Cross-Layer Contracts

Database owns schema.
Backend owns business logic and API contract.
Frontend owns UI and presentation.
Shared owns cross-boundary types only.

No logic duplication.
No schema outside database.
No API formatting outside backend.

---

## 4. Operational Rules

- Never use `git add -A` — stage files explicitly by name
- Full safety and backup rules: `claude_docs/SECURITY.md`

---

## 5. MCP Tool Awareness (Session-Critical)

At session start, Claude must check which MCP tools are active. They are injected
at session start and not visible in any file — missing them causes wasted fallbacks.

**GitHub MCP (`mcp__github__*`):**
Use `mcp__github__push_files` for **small targeted changes only** (1–5 files per session wrap).
The VM cannot run `git push` (no HTTPS auth), but the MCP bypasses this for small batches.

**Bulk pushes (>5 files) must always be done manually by Patrick from PowerShell:**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add [specific files]
git commit -m "..."
git push origin main
```
Never attempt to push the full codebase via MCP — it burns tokens and fails at scale.
At session wrap, Claude must tell Patrick exactly which files changed so he can git add them.

Repo: `deseee/findasale` — Branch: `main`

**Other MCPs:** Note any active connectors (Slack, Notion, etc.) in the session
start announcement so Patrick knows what's available without having to ask.

---

## 6. Context Discipline

Do not restate:
- Tech stack
- Security rules
- Recovery steps
- Behavioral compression rules

Reference authoritative file instead.

---

Status: Project Authority Layer
