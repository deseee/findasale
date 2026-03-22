# Project Execution Contract – FindA.Sale

Scope: Entire monorepo

Behavior rules: This file (CLAUDE.md)
Stack authority: STACK.md
Project memory: STATE.md
Security: SECURITY.md
Recovery: RECOVERY.md

If conflict exists between this file and a package CLAUDE.md,
this file prevails.

Package-level files must not redefine behavior or architecture.

**Authority order:** User → this file → conversation-defaults
→ Package CLAUDE.md → STACK.md → STATE.md → SECURITY.md

**Skill routing:** Always prefer `findasale-*` custom skills over generic plugin
equivalents. Custom skills have project context; generics don't.

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

## 4. Execution Rules

**Flow:** Survey → Plan → Execute → Verify → Report. Never skip Verify.

**Diff-only:** Output only changed sections. No full rewrites unless Patrick
says "rewrite the whole file." Announce approach before every file write:
"Editing [file] lines X–Y" or "Rewriting [file] — confirmed by Patrick."

**Read before write:** MUST read any existing file before editing it.
Write-without-read is a rule violation, not a guideline.

**Batch work:** Continue until blocked, not until comfortable. Only valid
stops: (a) needs Patrick's input, (b) ambiguous failure, (c) batch complete.
Do not ask "shall I continue?" mid-batch.

**Environment gate:** Before any shell, PowerShell, or Prisma command — STOP. Verify dev-environment skill is loaded this session. If not, invoke Skill('dev-environment') immediately. Do not proceed without it active.

**Never tell Patrick to manually resolve git issues.** Use Read + Edit + MCP push to fix merge conflicts, stale branches, and rebase errors yourself. Exception: genuine repo corruption requiring `git init`.

**File creation path validation:** Before creating any new file in `claude_docs/`, verify the path against `claude_docs/operations/file-creation-schema.md`.

**Compression logging:** When context is compressed, log:
`[COMPRESS] Session N turn M: kept [what], lost [what], ~Xk→Yk tokens`
Include this in session-log.md at wrap.

**Post-compression mandatory re-read:** Immediately after any compression event, re-read this file §5 (Push Rules) before resuming work. Push rules are the first lost after compression. No exceptions.

---

## 5. Push Rules

**MCP GitHub limits:** Max 3 files per `push_files` call. Total file content ≤25,000 tokens combined per call. Read each file before pushing and estimate token count. If the batch would exceed ~25k tokens, split or hand off to Patrick.

**GitHub MCP (`mcp__github__*`):**
Use `mcp__github__push_files` for **small targeted changes only** with two hard limits:
1. **≤3 files per push** (hard limit — stricter than any earlier 5-file guidance)
2. **Total file content ≤ 25,000 tokens combined** — read each file before pushing and estimate token count. If the batch would exceed ~25k tokens, split or hand off to Patrick.

**Large file guidance:** If a single file exceeds ~500 lines, push it solo via `create_or_update_file`. If it exceeds ~800 lines, hand off to Patrick with PS1 block. Never batch a large file with other files.

**MCP vs PowerShell:** Use MCP for 1–3 small files already in context.
Tell Patrick `.\push.ps1` for 4+ files, large files, or session wrap.

**Pre-push verification:** Read function/type signatures before pushing
TypeScript. Grep entire frontend for a pattern before pushing a build fix.
One Read call prevents 3 failed deploys.

**MCP file content rule:** `create_or_update_file` replaces the entire remote file — it does not merge or append. Always read the full file first. Always push the COMPLETE file content, never truncated or partial lines. Truncated schema.prisma (S166) and itemController.ts (S167) both broke Railway builds. No exceptions.

**MCP truncation gate (mandatory pre-push check):** Before every `create_or_update_file` call, compare: (a) line count of the content you are about to push vs. (b) line count of the file currently on GitHub. If the push content is more than 20% shorter than the existing file AND you did not intend to delete code, STOP — you are about to truncate. Re-read the local file in full and rebuild the push content.

**Complete push instruction blocks:** Every push block given to Patrick must list ALL modified tracked files, ALL new untracked files, ALL merge-conflict-resolved files, and ALL migration files. No partial lists. One complete block per push.

**Commit block format (always):** Any time git commit instructions are given to Patrick, provide a complete copy-paste block:
1. `cd` to project root (if needed)
2. Explicit `git add [file1] [file2]...` lines (never `git add -A`)
3. `git commit -m "..."`  with full message
4. `.\push.ps1` (PowerShell script, never `git push` directly)
Never use `&&` (bash only). Never use placeholders.

**PowerShell escaping:** For paths containing brackets (e.g., `[saleId].tsx`), use `-LiteralPath` in Remove-Item commands. PowerShell interprets brackets as wildcards.

**Merge conflict re-staging:** After resolving any merge conflict, explicitly re-stage ALL files that were in conflict state before committing.

**Standing rules:** STATE.md pushes only at wrap. Wrap-only docs (session-log, STATE, next-session-prompt) never MCP-pushed mid-session. package.json and pnpm-lock.yaml always committed together.

**After MCP push:** Do not edit those files locally without `git fetch` first.

**Git push:** Patrick uses `.\push.ps1` from PowerShell (NOT `git push` directly). The script self-heals: clears index.lock, CRLF phantoms, fetches + merges (never rebases). Never tell Patrick to use `git push`.

**Subagent push ban:** Subagents are NOT authorized to push to GitHub via MCP `push_files`. Only the main session may execute `push_files` calls. Subagents return output with file changes listed; main session batches into consolidated MCP pushes (≤3 files per call). This applies even when a subagent's batch would technically fit within 3-file/25k-token limits — the rule is absolute. Main session provides Patrick a single comprehensive push block when MCP isn't used.

Repo: `deseee/findasale` — Branch: `main`

---

## 6. Schema Change Protocol (Prisma)

Any session that modifies `schema.prisma` or adds a migration SQL file **MUST** include these two Patrick manual actions in the handoff — no exceptions. The DATABASE_URL override MUST appear copy-paste-ready in the actual block Patrick receives:

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://neondb_owner:npg_VYBnJs8Gt3bf@ep-plain-sound-aeefcq1y.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require"
npx prisma migrate deploy   # applies SQL to Neon, records in _prisma_migrations
npx prisma generate         # regenerates TypeScript client with new fields
```

**CRITICAL:** `packages/database/.env` points to localhost — always override `DATABASE_URL` with the Neon direct (non-pooled) connection string as shown above. Omitting the override silently runs the migration against localhost and leaves Neon out of sync. Use the non-pooled hostname (no `-pooler` suffix) — Prisma requires a direct connection for migrations.

`migrate deploy` runs first — without it the live DB is out of sync. `prisma generate` follows — without it new fields throw TypeScript errors at runtime. Railway deploys code automatically but does **not** run migrations.

---

## 7. Subagent-First Implementation Gate (CRITICAL)

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

**Allowed inline edits (exhaustive list):**
- Doc files (`.md` in `claude_docs/`, skills, `CLAUDE.md`)
- Single-line config fixes explicitly requested by Patrick
- Conversation-defaults and skill SKILL.md files

**QA DISPATCH GATE (fires when orchestrator dispatches QA work):**
Before dispatching any QA or audit task:
1. Identify which roles are affected (SHOPPER, ORGANIZER, ADMIN)
2. Identify which tiers are affected (FREE, SIMPLE, PRO, TEAMS)
3. Identify what data operations the feature performs (create, read, update, delete)
4. Generate specific test scenarios for each role × tier × operation combination
5. Batch scenarios by feature or page into focused dispatches (not one-per-scenario)
6. Do NOT dispatch a single "audit everything" task

---

## 8. Schema-First Pre-Flight Gate (Dev Subagents — Mandatory)

Before any component edit or new file that renders or references database-model data,
dev subagents MUST complete all four steps below. No exceptions. No assumptions.

**Step 1 — Schema verify:**
Read `packages/database/prisma/schema.prisma`. Confirm every model field referenced
in the component or hook actually exists in the schema.

**Step 2 — Hook shape verify:**
Read the relevant hook file. Confirm the return shape before destructuring.
- `useState`-based hooks do NOT return `{ isLoading, data }` — they return values directly.
- `react-query`-based hooks DO return `{ data, isLoading, isError }`.
- Never assume. Always read.

**Step 3 — Controller/service type verify:**
If the component references fields from an API response, read the relevant controller
file's return type.

**Step 4 — Post-edit TypeScript check (mandatory before returning):**
```bash
cd packages/frontend && npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | grep -v node_modules
```
Zero errors required before returning output to main session.

**Forbidden patterns:**
- `import { anything } from '@findasale/shared'` — always causes Vercel build failure
- Destructuring `{ isLoading }` from a hook without verifying it returns that shape
- Adding a field to a type definition without confirming it exists in schema.prisma

---

## 9. MCP Tool Awareness

At session start, check which MCP tools are active. They are injected at session start and not visible in any file.

**GitHub MCP (`mcp__github__*`):**
Use `mcp__github__push_files` for small targeted changes only with two hard limits:
1. ≤3 files per push
2. Total file content ≤25,000 tokens combined

The VM cannot run `git push` (no HTTPS auth), but the MCP bypasses this for small batches.

**Bulk pushes** (>3 files OR >25k tokens) must always be done manually by Patrick from PowerShell via `.\push.ps1`.

**Railway stuck / not rebuilding:** Push a trivial change to `packages/backend/Dockerfile.production` — update the cache-bust comment with today's date. This always unblocks Railway.

**Deployments:** Frontend on Vercel, backend on Railway. Both auto-deploy on push to `main`. No manual redeploy buttons — to force a redeploy, make a trivial commit and push.

---

## 10. Operational Rules

**Post-fix live verification (mandatory):** After ANY session that pushes bug fixes or feature code to production, the NEXT session must include a live-site smoke test (Chrome MCP at finda.sale) of all changed pages BEFORE starting new work. This is not optional and not something Patrick should have to request. Check the previous session's fix list in STATE.md, load each affected page, verify it works. If pages are broken, flag immediately and dispatch findasale-dev before any other work proceeds. Claude owns QA continuity — Patrick should never discover a broken page that Claude could have caught.

**Context checkpoints (no-pause rule):** Agent handoff "Context Checkpoint: yes/no" is internal bookkeeping. Never pause work to discuss a checkpoint.

**Escalation channel:** Any subagent may include a `## Patrick Direct` section when it believes the main session is ignoring a P0/P1 finding, dispatching work that contradicts a locked decision, operating on stale context, or burning tokens on a wrong path. Evidence required. One per agent per session. Main session surfaces verbatim — no filtering.

**Red-flag veto gate:** Changes touching auth flows, payment processing, data deletion, or security config require sign-off from Architect or Hacker before Dev dispatch.

**Handoff protocol:** When Agent A's work creates a task for Agent B, write a structured handoff block with: task, context files, locked decisions, constraints, acceptance criteria, cited file versions. Main session passes handoff blocks as-is.

**Skill update protocol:** Editing a SKILL.md in git does NOT activate the change. Active skills are read-only at `/sessions/[session-id]/mnt/.skills/skills/`. To activate: package as `.skill` zip, Patrick installs via Cowork UI.

**Subagent file hygiene (hard rule):** Subagents must NEVER write files to the project root (`$PROJECT_ROOT/`), create directories not in the locked folder map (`operations/file-creation-schema.md`), or leave temp/handoff/artifact files in `claude_docs/` root. All scratch and working files go to the VM working directory (`/sessions/[session-id]/`). Temp files in the VM working directory are automatically cleaned up and are the correct location for subagent scratch work. All deliverables go to the correct `claude_docs/` subdirectory. Violations are flagged by Records at session wrap — but the goal is zero violations, not clean-up.

---

## 11. Token Efficiency Rules

**T1 — Compaction summaries:** ≤15 lines / ~1.5k tokens. One-liner outcomes only.

**T2 — No production code in session init:** Never read production code files >200 lines during init or in the main window. Reference by path; subagents read code.

**T3 — Mid-dispatch checkpoints are NON-BLOCKING:** Context < 80% → log silently. 80–89% → log warning, continue. ≥ 90% → evaluate remaining work, wrap if major work remains.

**T4 — Session-log rotation:** Keep 3 most recent entries. Move oldest to `claude_docs/session-log-archive.md`.

**T5 — STATE.md size gate:** If >250 lines, archive oldest completed-features section.

---

## 12. Session Wrap

Before ending any session:

**Doc Update Order (mandatory at every session wrap — in this exact order):**
1. Update STATE.md (source of truth for session state)
2. Update next-session-prompt.md (pending Patrick actions + what comes next). NEVER include credentials.
3. Update session-log.md (prepend new entry, keep 5 most recent)
4. Update patrick-dashboard.md (Patrick-readable status summary)
5. Provide Patrick the `.\push.ps1` block — all four files above must be in it

**Critical rule:** Never update one without the others. Never push STATE.md without also updating next-session-prompt.md and patrick-dashboard.md. This ensures Patrick always has a current snapshot of project state.

**Subagent files:**
- Maintain running changed-files list from all subagent dispatches
- Cross-reference against `git status` at wrap
- Include all tracked and untracked files in the final push block

---

## Reference Docs (load on demand, not at init)

| Need | File |
|------|------|
| Recurring bug patterns | `self-healing/self_healing_skills.md` |
| Session safeguards | `operations/session-safeguards.md` |
| Patrick's shorthand | `operations/patrick-language-map.md` |
| Model routing | `operations/model-routing.md` |
| Wrap protocol | `WRAP_PROTOCOL_QUICK_REFERENCE.md` |
| Tech stack | `STACK.md` |
| Security | `SECURITY.md` |
| Recovery | `RECOVERY.md` |
| File creation paths | `operations/file-creation-schema.md` |

---

Status: Project Authority Layer (v5.0, Session 226 — merged CORE.md, added pain point fixes)
