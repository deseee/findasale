# CORE – Behavioral Operating System (v2)

Consolidated from 19 rules to 5. Session 112 fleet audit.
Always loaded. Authority over all behavior.

---

## 1. Mission + Authority

Deliver correct results with minimum token usage. Prevent repair loops
by keeping docs accurate — a stale fact costs more than the tokens to fix it.

**Authority order:** User → CORE.md → Self-Healing Skills → conversation-defaults
→ Root CLAUDE.md → Package CLAUDE.md → STACK.md → STATE.md → SECURITY.md

**Skill routing:** Always prefer `findasale-*` custom skills over generic plugin
equivalents. Custom skills have project context; generics don't.

---

## 2. Session Init

Every session, before any work:

1. Check active MCP tools (GitHub, Stripe, etc.)
2. Load CORE.md, context.md, STATE.md — extract sprint queue
3. Skim session-log.md (last 1–2 entries)
4. GitHub sync check: compare local STATE.md `Last Updated` vs remote.
   If different → tell Patrick to run `.\push.ps1` first. Block until synced.
5. Announce estimated context budget: "~Xk tokens available this session."

Skip re-loading on subsequent turns if context was already loaded this session.
First message of any session always triggers init (conversation-defaults Rule 3).

---

## 3. Execution Rules

**Flow:** Survey → Plan → Execute → Verify → Report. Never skip Verify.

**Diff-only:** Output only changed sections. No full rewrites unless Patrick
says "rewrite the whole file." Announce approach before every file write:
"Editing [file] lines X–Y" or "Rewriting [file] — confirmed by Patrick."

**Read before write:** MUST read any existing file before editing it.
Write-without-read is a rule violation, not a guideline.

**Batch work:** Continue until blocked, not until comfortable. Only valid
stops: (a) needs Patrick's input, (b) ambiguous failure, (c) batch complete.
Do not ask "shall I continue?" mid-batch.

**Environment gate:** Before any shell/PowerShell/Prisma command, verify
dev-environment skill is loaded this session. Patrick = PowerShell on Windows.
Cowork VM = bash on Linux. Never mix them.

**Compression logging:** When context is compressed (auto or manual), log:
`[COMPRESS] Session N turn M: kept [what], lost [what], ~Xk→Yk tokens`
Include this in session-log.md at wrap. Preserve Operational Anchors
(package paths, script names, shell syntax) through compression.

**Token checkpoints:** At natural pauses (after file read batch, after subagent
dispatch, before wrap), log:
`[CHECKPOINT — Turn N] Files read: X (est. Yk) | Tools: Z (est. Wk) | Session: ~Vk / 200k (P%)`
Warn at 170k used (85%) — pause and plan wrap. Hard stop at 190k (95%).

---

## 4. Push Rules

**MCP GitHub limits:** Max 3 files per `push_files` call. Files >200 lines
push solo via `create_or_update_file`. Max 3 agents dispatched in parallel.

**MCP vs PowerShell:** Use MCP for 1–3 small files already in context.
Tell Patrick `.\push.ps1` for 4+ files, large files, or session wrap.

**Pre-push verification:** Read function/type signatures before pushing
TypeScript. Grep entire frontend for a pattern before pushing a build fix.
One Read call prevents 3 failed deploys.

**Standing rules:** STATE.md pushes only at wrap. Wrap-only docs
(session-log, STATE, next-session-prompt) never MCP-pushed mid-session.
package.json and pnpm-lock.yaml always committed together.

**After MCP push:** Do not edit those files locally without `git fetch` first.

---

## 5. Session Wrap

Before ending any session:

1. Update session-log.md (completed work, files changed, compression events)
2. Update next-session-prompt.md (next task, blockers, pending Patrick actions).
   NEVER include credentials — reference `.env` only.
3. Write session scoreboard to session-log entry:
   `Files changed: N | Compressions: N | Subagents: [list] | Push method: MCP/PS1`
4. Provide Patrick the `.\push.ps1` block — every changed file as explicit
   `git add [file]` lines. Never `git add -A`. Never omit files.
5. Track subagent files: maintain running changed-files list. Cross-reference
   against `git status` at wrap. Include all subagent-reported files.

---

## Reference Docs (load on demand, not at init)

| Need | File |
|------|------|
| Recurring bug patterns | `self-healing/self_healing_skills.md` |
| Session safeguards (3-attempt limit) | `operations/session-safeguards.md` |
| Patrick's shorthand meanings | `operations/patrick-language-map.md` |
| Model routing (Sonnet/Haiku/Opus) | `operations/model-routing.md` |
| Detailed wrap protocol | `WRAP_PROTOCOL_QUICK_REFERENCE.md` |
| Tech stack decisions | `STACK.md` |
| Security rules | `SECURITY.md` |
| Recovery procedures | `RECOVERY.md` |
| File creation paths | `operations/file-creation-schema.md` |

---

Status: Behavioral Authority (v2, Session 112)
