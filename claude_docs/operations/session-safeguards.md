# Session Safeguards — FindA.Sale

Circuit breakers and guardrails to prevent repair loops, excessive token usage,
and common Claude errors. Referenced by CORE.md §12.

---

## Repair Loop Prevention

**Max attempts per error:** 3. After 3 failed fix attempts for the same error:
1. Stop and tell Patrick: "I've tried 3 fixes for [error]. Here's what I've tried and why each failed."
2. Suggest escalation: different model, manual intervention, or deferral.
3. Do NOT try a 4th time without Patrick's explicit go-ahead.

**Same-file rewrite limit:** 2 per turn. If Claude has rewritten the same file twice
in one conversation turn, pause and verify the approach before a third attempt.

**Stale loop detection:** If the last 3 tool calls were Read → Edit → Read of the
same file with no other progress, Claude is in a loop. Stop and reassess.

---

## Common Claude Error Defenses

### 1. Write-Before-Read
**Error:** "Edit tool failed — file not read in this conversation."
**Defense:** Always Read a file before Edit. This is enforced by the tool, but
plan for it: batch-read all target files at the start of a multi-file edit.

### 2. PowerShell Syntax in Bash Context
**Error:** Using `&&` (works in bash, not PowerShell) or backticks (PowerShell escape, not bash).
**Defense:** When giving Patrick shell commands:
- PowerShell: use `;` to chain commands, backtick for line continuation
- Docker exec / Linux: use `&&` to chain, backslash for continuation
- Always specify which terminal the command is for
- Load dev-environment skill before giving ANY shell command

### 3. Prisma Migrate in Non-Interactive Docker
**Error:** "Prisma Migrate has detected that the environment is non-interactive"
**Defense:**
- Development (Docker): use `prisma db push` or `docker exec -it` with the `-it` flags
- Production (Railway/Neon): use `prisma migrate deploy` (non-interactive by design)
- Never use `prisma migrate dev` inside a non-interactive container

### 4. Full-File Rewrite Without Permission
**Defense:** CORE.md §4 hard gate. Announce approach before every write. See also
self-healing skill #19.

### 5. MCP Push Token Overflow
**Defense:** CORE.md §10. Max 3 files per push_files call. Large files get their
own create_or_update_file call.

### 6. Vercel Deploy Budget Burn
**Defense:** CORE.md §10 Build-Error Fix Protocol. Grep for the pattern across
the entire frontend before pushing any fix. One commit, all instances.

---

## Token Usage Awareness

**Signals that context is getting heavy:**
- Claude starts repeating itself or losing track of earlier decisions
- Sub-agent tasks take noticeably longer to return
- Claude asks for information that was already provided in this session

**Mitigation:**
- Use Auto Compression Protocol (CORE.md §5) proactively at ~50% context usage
- Offload exploration to Haiku sub-agents (Task tool with `model: "haiku"`)
- Batch file reads at turn start, not mid-reasoning
- Reference files by path instead of re-reading them when the content hasn't changed

---

## Pre-Commit Validation Checklist

Before any GitHub push, verify:
1. All modified files have been read in the current turn
2. TypeScript compiles (`tsc --noEmit` or verified by existing build)
3. No `console.log` left in production paths
4. No `TODO` or `// placeholder` in shipped code
5. New routes have `authenticate` middleware
6. New `findMany` calls have `take` limit
7. New env vars are in `.env.example`

---

## Production Startup Failures

**Never speculate on env vars or config.** When the backend crashes on startup:
1. Ask Patrick for the actual Railway/Docker logs immediately
2. Do not guess PORT, JWT_SECRET, or other env vars
3. One turn of evidence is worth more than five turns of guessing

---

## Escalation Protocol

| Situation | Action |
|-----------|--------|
| Backend startup crash | Ask for actual logs before diagnosing |
| 3 failed fix attempts | Stop, report to Patrick, suggest alternatives |
| Security issue found | Flag immediately, do not continue feature work |
| Schema change needed | Confirm with Patrick before migration |
| File > 300 lines needs editing | Announce scope, consider targeted edits only |
| Docker/infra command needed | Load dev-environment skill first |
| Deploy requested | Load findasale-deploy skill first |

---

Last Updated: 2026-03-07 (session 86 — added Production Startup Failures guardrail)
