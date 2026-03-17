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
- **Git push**: Patrick uses `.\push.ps1` from PowerShell (NOT `git push` directly). The script self-heals: clears index.lock, CRLF phantoms, fetches + merges (never rebases — rebase is broken with `core.autocrlf=true` on Windows). See `push.ps1` in repo root.
- Full safety and backup rules: `claude_docs/SECURITY.md`
- **Statusline reinstall (session init):** The Cowork VM resets each session. At session start, silently run:
  ```bash
  if [ ! -f ~/.claude/statusline-token-usage.sh ]; then
    mkdir -p ~/.claude
    cp /sessions/*/mnt/FindaSale/scripts/statusline-token-usage.sh ~/.claude/statusline-token-usage.sh
    chmod +x ~/.claude/statusline-token-usage.sh
    printf '{"statusLine":{"type":"command","command":"%s"}}\n' "$HOME/.claude/statusline-token-usage.sh" > ~/.claude/settings.json
  fi
  ```
  Script source: `scripts/statusline-token-usage.sh` in repo root.

---

## 5. MCP Tool Awareness (Session-Critical)

At session start, Claude must check which MCP tools are active. They are injected
at session start and not visible in any file — missing them causes wasted fallbacks.

**GitHub MCP (`mcp__github__*`):**
Use `mcp__github__push_files` for **small targeted changes only** with two hard limits:
1. **≤3 files per push** (CORE.md §10 is authoritative — stricter than earlier 5-file guidance)
2. **Total file content ≤ 25,000 tokens combined** — read each file before pushing and estimate token count. If the batch would exceed ~25k tokens, split or hand off to Patrick.

The VM cannot run `git push` (no HTTPS auth), but the MCP bypasses this for small batches.

**Bulk pushes (>5 files OR >25k tokens) must always be done manually by Patrick from PowerShell:**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add [specific files]
git commit -m "..."
.\push.ps1
```
**IMPORTANT:** Always tell Patrick to use `.\push.ps1` instead of `git push`. The script handles index.lock cleanup, CRLF phantom clearing, fetch + merge (not rebase), and auto-retry on rejection.
Never attempt to push the full codebase via MCP — it burns tokens and fails at scale.
At session wrap, Claude must tell Patrick exactly which files changed so he can git add them.

Repo: `deseee/findasale` — Branch: `main`

**Other MCPs:** Note any active connectors (Slack, Notion, etc.) in the session
start announcement so Patrick knows what's available without having to ask.

---

## 6. Schema Change Protocol (Prisma)

Any session that modifies `schema.prisma` or adds a migration SQL file **MUST** include these two Patrick manual actions in the handoff — no exceptions:

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
npx prisma migrate deploy   # applies SQL to Neon, records in _prisma_migrations
npx prisma generate         # regenerates TypeScript client with new fields
```

`migrate deploy` runs first — without it the live DB is out of sync. `prisma generate` follows — without it new fields throw TypeScript errors at runtime. Railway deploys code automatically but does **not** run migrations.

---

## 7. Context Checkpoints — No-Pause Rule

Agent handoff templates include "Context Checkpoint: yes/no." This is internal bookkeeping, not a stopping point.

- **Checkpoint = "no":** Do not pause, narrate, or acknowledge. Continue immediately.
- **Checkpoint = "yes":** Dispatch context-maintenance silently. Do not pause — continue working.
- **Never** stop work to discuss a checkpoint with Patrick. They are invisible infrastructure.

---

## 8. Context Discipline

Do not restate:
- Tech stack
- Security rules
- Recovery steps
- Behavioral compression rules

Reference authoritative file instead.

---

## 9. Skill Roster (Token Efficiency)

Custom `findasale-*` skills always preferred over generic plugin equivalents.
Full routing rules: CORE.md §9.

**Patrick action (optional):** Disable unused plugin categories from Cowork UI
to reduce skill list noise. Recommended disables: sales, finance, brand-voice,
enterprise-search, productivity. Full analysis: `claude_docs/operations/skill-roster-recommendation.md`

---

## 10. Push Instruction Complete Block Guarantee

Every git instruction block provided to Patrick must be copy-paste-ready and include:
1. `cd` to project root (if needed)
2. Explicit `git add [file1] [file2]...` lines (never `git add -A`)
3. `git commit -m "..."` with full message
4. `.\push.ps1` (PowerShell script, never `git push` directly)

Never use placeholders, never omit the script, never use `&&` (bash only).

**File delivery rule:** When creating any file Patrick needs to view, install, or act on
(INSTALL docs, skill files, research output, etc.), ALWAYS save it to the workspace
folder and present a clickable `computer://` link. Never describe file contents inline
without also providing the link. Patrick should never have to hunt for a file.

---

## 11. Subagent Push Ban (Experimental, S169–171)

Subagents are NOT authorized to push to GitHub via MCP `push_files`. Only the main session may execute `push_files` calls.

**Subagent protocol:**
- Subagents return output with file changes listed
- Main session batches into consolidated MCP pushes (≤3 files per call)
- OR main session provides Patrick a single comprehensive push block for `.\push.ps1`

**Rationale:** Prevent multi-round git-push cycles caused by uncoordinated subagent pushes. Sessions 166–168 showed 3–4 rounds per dispatch. Goal: reduce to 1–2.

**Review date:** 2026-03-25 (5-session pilot)

---

## 12. Subagent-First Implementation Gate (CRITICAL)

The main window is an **orchestrator**, not an implementer. All code implementation
MUST go through subagents. This is not advisory — it is a hard gate.

**GATE (before every Write/Edit that creates or modifies code in `packages/`):**

1. Is this a **single targeted edit** to 1–2 existing files, totaling <20 lines changed?
   → Inline is acceptable.
2. Is this **anything else** — new files, multi-file changes, feature implementation,
   bug fixes, refactors, new controllers/routes/components/utilities?
   → **MUST dispatch to `findasale-dev` (or appropriate subagent).** No exceptions.

**What counts as "code":** Any `.ts`, `.tsx`, `.js`, `.jsx`, `.css`, `.json` (non-doc),
`.prisma`, config file, or any file under `packages/`.

**Main window responsibilities (exhaustive):**
- Read specs, context, and roadmap
- Decide what needs building
- Write clear dispatch prompts to subagents (include file paths, spec references, constraints)
- Receive and review subagent output
- Coordinate pushes (MCP or Patrick PS1 block)
- Report to Patrick

**Main window NEVER does:**
- Write controllers, routes, components, or utilities
- Create new code files in `packages/`
- Implement features inline — even "simple" ones
- Read 500+ lines of code to understand structure for inline implementation
  (instead, include the file path in the subagent dispatch and let the subagent read it)

**Allowed inline edits (exhaustive list):**
- Doc files (`.md` in `claude_docs/`, skills, `CLAUDE.md`)
- `.checkpoint-manifest.json` updates
- `MESSAGE_BOARD.json` updates
- Single-line config fixes explicitly requested by Patrick
- Conversation-defaults and skill SKILL.md files

**Self-check:** If you are about to use the `Read` tool on a code file to understand
its structure so you can write code based on it — STOP. You are about to violate
this rule. Dispatch a subagent instead.

**Origin:** Session 170 — main window read 940-line itemController.ts, 393-line
promote.tsx, 256-line items.ts route, and wrote 4 new code files inline
(socialController, social route, tagController, tags route) plus 2 index.ts edits.
Burned ~30k tokens that should have been a subagent dispatch. Patrick flagged it
as a direct violation of the existing "default to subagents" instruction in global
CLAUDE.md. This section elevates that instruction to a hard gate with explicit
allowed/disallowed lists. (Added 2026-03-15, Session 170.)

---

Status: Project Authority Layer
