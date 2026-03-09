# CORE – Behavioral Operating System

Always loaded. Ultra-lean. Authority over behavior.

---

## 1. Primary Directive

Deliver correct results with minimum token usage.
Prevent repair loops by keeping docs, skills, and commands accurate.

These two goals are co-equal. A stale fact that triggers a wasted session
costs more than the tokens saved by not updating it.

Avoid verbosity.
Avoid redundancy.
Avoid architectural drift.
Avoid stale documentation.

---

## 2. Session Init

At the start of every session, before any task work:

1. Check active MCP tools in session context — note GitHub, Slack, Notion, etc. availability
2. Load `claude_docs/CORE.md` — verify behavior rules haven't drifted
3. Load `context.md` — filetree, last session summary, env signals
4. Load `claude_docs/STATE.md` — current sprint and blockers. After loading, **extract the sprint queue line and hold it for the session.** Before announcing "next up" at any milestone, re-confirm against STATE.md — do not rely on memory.
5. Skim `claude_docs/logs/session-log.md` — last 1–2 entries for recent decisions
6. **GitHub sync check** — read local `STATE.md` `Last Updated` line, then fetch GitHub version via `mcp__github__get_file_contents` (`deseee/findasale`, `claude_docs/STATE.md`). If the `Last Updated` lines differ, stop immediately and tell Patrick:
   > "Local docs are behind GitHub. Run this before we start: `git fetch origin && git merge origin/main --no-edit` (or just `.\push.ps1` which handles this automatically)"
   Do not make any file edits until Patrick confirms local is synced.

Skip silently **on subsequent turns** if Patrick has already given a task **and** context was loaded in the same session. This skip condition never applies to the first message of any session — conversation-defaults Rule 3 governs first-message handling unconditionally and cannot be bypassed.
Do not narrate the load unless asked.

---

## 3. Execution Loop

For non-trivial work:

Survey → Plan → Execute → Verify → Report

During Survey: check `context.md` filetree before using any file-location tool (Glob, find, ls).

Do not skip verification.

### Batch Continuation Rule

When Patrick assigns multiple tasks (a batch, a list, or says "work continuously"):
1. After completing each task, immediately begin the next one without pausing for confirmation.
2. Only stop when: (a) blocked by a dependency requiring Patrick's input, (b) a task fails and the fix is ambiguous, or (c) the batch is complete.
3. Between tasks, update the TodoList to mark completion and set the next task in_progress — this is the only pause.
4. Do not summarize completed work mid-batch unless Patrick asks. Save the full summary for the batch wrap.
5. If context window pressure is high, compress completed-task context before continuing — do not stop the batch to warn about context.
6. **Continue until blocked, not until comfortable.** The default is to keep working. Stopping to summarize, ask "shall I continue?", or announce progress mid-batch is a violation unless Patrick explicitly asked for check-ins. The only valid stops are: (a) external dependency (needs Patrick's input or action), (b) ambiguous failure requiring a decision, (c) batch complete.
7. **Cross-session continuity.** If the session ends mid-batch (context limit, autocompact), the session-wrap must record exactly where the batch stopped and what remains, so the next session can resume at the right task — not restart the batch.

---

## 4. Diff-Only Rule

When modifying **any file** (code, docs, config — no exceptions):
- Output only changed sections
- No full rewrites unless Patrick explicitly requests one
- No unchanged context
- Ambiguous phrases like "major rewrite" or "overhaul" do NOT count as requesting a full rewrite — ask first

**Hard gate — announce before every file write:**
Before using the Write or Edit tool on any existing file, state the approach in one line:
- Targeted edit: "Editing [file] lines X–Y"
- Full rewrite: "Rewriting [file] entirely — confirmed by Patrick"

If announcing a full rewrite, Patrick must have explicitly said "rewrite the whole file" or equivalent in that conversation. If unclear, ask: "Should I do targeted edits or a full rewrite?"

This lets Patrick immediately catch unnecessary rewrites. Skipping the announcement is a rule violation.

---

## 5. Auto Compression Protocol

Trigger compression when:
- Response > ~700 tokens
- Multi-step plan emerges
- Context grows across turns

Compression format:
- Current Objective
- Constraints
- Decisions Made
- Open Variables
- Next Step

Replace narrative history with structured summary.

---

## 6. Duplication Guard

If detecting:
- Repeated documentation across layers
- Stack redefinition in packages
- Behavioral rules outside CORE

Flag and recommend consolidation.

No silent duplication.

---

## 7. Authority Order

User
→ CORE.md (operational behavior)
→ Self-Healing Skills (structurally certain patterns, HIGH confidence)
→ conversation-defaults skill (active session rules)
→ Root CLAUDE.md (execution contract)
→ Package CLAUDE.md (scoped constraints)
→ STACK.md (technology decisions)
→ STATE.md (project state snapshot)
→ SECURITY.md / RECOVERY.md (fallback procedures)

Higher layer prevails. Skills override lower layers when pattern confidence ≥ HIGH.

---

## 8. Self-Healing Skills

Before debugging recurring errors, check:
`claude_docs/self-healing/self_healing_skills.md`

Covers: SSR crashes, JWT payload staleness, unwired frontend stubs, missing Prisma
relation fields, unhandled async failures, unprotected routes, unbounded queries,
missing env vars, Docker/pnpm monorepo startup failures (nodemon not found).

After fixing any bug:
- Check if the pattern exists in `claude_docs/self-healing/self_healing_skills.md`
- If not, and the pattern has been seen ≥2 times OR is structurally certain to recur,
  add a new entry immediately — do not wait for session wrap

---

## 9. Proactive Health Scanning

Before production deploys or after large sprints, run the health-scout skill.
Recent scan results: `claude_docs/health-reports/` (newest file = latest report).
Weekly scan runs automatically Sunday 11pm via `findasale-health-scout` task.

**Coverage requirement:** Every "comprehensive" audit must use
`claude_docs/operations/audit-coverage-checklist.md`. Check off each section,
note N/A items with justification, and include coverage % in the report header.
If coverage < 80%, the audit is incomplete.

### Skill Routing Priority

When a FindA.Sale custom skill exists for a domain, always prefer it over generic
plugin equivalents. Custom skills have project context; generic plugins don't.

- Marketing → `findasale-marketing` (not `marketing:*`)
- UX/Design → `findasale-ux` (not `design:*`)
- Code review/QA → `findasale-qa` (not `engineering:code-review`)
- Ops → `findasale-ops` (not `operations:*`)
- Support → `findasale-support` (not `customer-support:*`)
- Architecture → `findasale-architect` (not `engineering:system-design`)

Generic plugin skills are fallbacks only — use when no custom skill covers the need.
Full audit: `claude_docs/operations/skill-roster-recommendation.md`

---

## 10. GitHub Push Batching Rule

When using `mcp__github__push_files`, **never push more than 3 files per call**.
Large batches exceed the output token limit and silently fail or crash the session.

**Rule:** Max 3 files per `push_files` call. If a single file exceeds ~200 lines, push it alone.

**Preferred tool by file size:**
- **Single large file (200+ lines):** Use `mcp__github__create_or_update_file` — isolates token cost to one file per call, more reliable than `push_files` for big files.
- **Small batch (2–3 files, all <200 lines):** Use `mcp__github__push_files` — one commit, clean history.
- **Single small file:** Either tool works. Prefer `create_or_update_file` for simplicity.

**Environment escape hatch:** If medium-large batches consistently fail, `MAX_MCP_OUTPUT_TOKENS` can be raised in `.claude/settings.local.json` (default 25,000). Only increase if chunking alone isn't enough — higher limits consume more context.

**Pattern:**
1. Read all target files in parallel (as many as needed — reads are input tokens, not output)
2. Push in serial batches of ≤3 files, with a descriptive commit message per batch
3. Group small files together; large files (>200 lines) always get their own commit
4. For files >300 lines, always use `create_or_update_file` (requires the file's current SHA)

This applies to every session wrap and any mid-session push. Never revert to a single
giant push to "save commits" — the token limit will kill it.

**CRITICAL — MCP Mid-Session → Fetch at Wrap:**
After any MCP push, **do not edit the same files locally without fetching first.**
MCP bypasses the local repo (writes directly to GitHub). Remote changes won't sync
to Patrick's tree until `git fetch`. Pattern:

1. Subagent MCP-pushes files (e.g. `patrick-language-map.md`)
2. Wrap protocol locally edits those files
3. At wrap time, run `git fetch origin main` **before** staging wrap files
4. If conflicts appear, resolve with `git checkout --theirs [file]`

See entry #38 in `claude_docs/self-healing/self_healing_skills.md` for details and examples.

### MCP vs PowerShell Decision Rule

Use **MCP** (`push_files`) when ALL of the following are true:
- 1–3 files in the batch, AND
- All files were read or edited in the **current turn** (already in context — no re-read cost), AND
- No single file is a large doc (>300 lines) that wasn't actively changed this turn

Tell Patrick **"please run `.\push.ps1`"** when ANY of the following apply:
- 4+ files need pushing as a group
- Any file is large (>300 lines) and was NOT edited this turn — re-reading it just to push is wasteful
- Session wrap involves >5 changed files total
- A file needs to be re-read from GitHub before pushing (drift scenario — skip MCP, use PowerShell)

### Standing File Rules

- **ROADMAP.md** — Only push in the **same turn** it was edited. Never re-read and re-push across turns.
- **STATE.md** — Push **once**, at session wrap only. Never mid-session.
- **package.json + pnpm-lock.yaml** — Always commit together. Never push a package.json change alone. After any dependency add/remove, run `pnpm install` locally to regenerate the lockfile, then include it in the same commit. (Railway's frozen-lockfile check requires exact sync.)
- **Large docs not touched this turn** — Do not re-read for the sole purpose of pushing. Flag for PowerShell instead.
- **Wrap-only docs** (session-log.md, STATE.md, .last-wrap, next-session-prompt.md) — NEVER MCP-push mid-session. These files are committed only via Patrick's push.ps1 at wrap. MCP-pushing them mid-session guarantees merge conflicts at wrap time. See self-healing #52.

### Build-Error Fix Protocol (Vercel Deploy Budget)

Vercel free tier = **100 deploys/day**. Every push to `main` burns one.

**Before pushing ANY build fix:**
1. Identify the **pattern** (not just the one file Vercel reported).
2. Grep the entire frontend for that pattern.
3. Fix **every** instance locally or in a single push_files batch.
4. Push once.

Example: Vercel reports `loading` not on `AuthContextType` in `login.tsx`.
Wrong: fix login.tsx, push, wait for build, fix register.tsx, push, wait…
Right: grep for `loading.*useAuth\|useAuth.*loading` across all files,
fix all 6 hits, push one commit.

This rule is enforced by `claude_docs/SECURITY.md` Section 9.

---

## 11. Parallel Agent Dispatch Limits

Infrastructure constraint: **Max 3 agents may be dispatched in parallel per single tool call.**

Dispatching more than 3 agents simultaneously causes all calls to error. This limit was discovered empirically in session 91 when 7 parallel agents were dispatched and all errored.

**Rule:** When more than 3 agents are needed, dispatch in serial batches of 3 — wait for results of batch 1, then dispatch batch 2, etc. This mirrors the MCP push limits (≤3 files per call) — infrastructure constraints must be documented and respected.

**Subagent MCP awareness:** When dispatching a subagent that may need to push files to GitHub, include MCP limits in the dispatch instructions: max 3 files per push, files >200 lines pushed solo via `create_or_update_file`, wrap-only docs never MCP-pushed mid-session. Subagents don't inherit CORE.md knowledge — they must be told.

---

## 12. Model Routing

Before selecting session model or sub-agent model, consult:
`claude_docs/operations/model-routing.md`

Default: Sonnet. Haiku for read-only sub-agents. Opus for novel architecture only.
Sub-agents accept `model: "haiku"` parameter in the Task tool for cost savings.

---

## 13. Session Safeguards

Before debugging recurring errors or when stuck in a loop, consult:
`claude_docs/operations/session-safeguards.md`

Hard limits: 3 fix attempts per error, 2 rewrites per file per turn.
Escalate to Patrick after hitting limits — do not continue silently.

---

## 14. Patrick's Language Map

When interpreting Patrick's short commands ("check", "note", "ok", "wrap", etc.), consult:
`claude_docs/operations/patrick-language-map.md`

Key rule: Patrick's short affirmations ("ok", "that worked") mean proceed — don't re-explain.

---

## 15. Proactive Tool & Skill Suggestion

When conversation context suggests a tool, skill, command, or plugin would help —
suggest it to Patrick without waiting for him to ask. Patrick may not know what's
available.

Examples:
- Patrick describes a UX concern → suggest `findasale-ux` skill
- Patrick mentions a competitor → suggest `findasale-rd` or competitive analysis skill
- Patrick asks about deployment → suggest `findasale-deploy` skill
- Patrick describes a bug → suggest `findasale-dev` skill and offer to invoke it
- A connected MCP (Stripe, GitHub) could answer the question → use it directly

**Do not:** List every available skill. Pick the 1–2 most relevant and explain why
in one sentence. If Patrick declines, drop it.

---

## 16. Doc Classification + Anti-Bloat Rules

Every file in `claude_docs/` has a tier. Assign it when creating the file.

**Tier 1 — Hot (always loaded at session start):** CORE.md, STATE.md, context.md, root CLAUDE.md.
Target: ≤2,000 tokens combined. If you're adding something "just in case", it belongs in Tier 2.

**Tier 2 — Deep store (load on demand):** `logs/session-log.md`, `self-healing/self_healing_skills.md`, STACK.md, SECURITY.md, RECOVERY.md, `strategy/roadmap.md`, `operations/model-routing.md`, `operations/session-safeguards.md`, `operations/patrick-language-map.md`, `operations/next-session-prompt.md`, `operations/DEVELOPMENT.md`, `archive/health-reports/`, research/.
Load only when the task requires it. Never preload the whole directory.

**Tier 3 — One-time artifacts (archive on creation):** Audit reports, migration checklists, rebrand tables, any file whose purpose ends when the work ends.
**Rule: Tier 3 files go in `claude_docs/archive/` immediately. Never save them to the root `claude_docs/` directory.**

**Archive trigger:** When a phase, audit, or one-time task completes, move its driving document to `archive/` at session wrap. The context-maintenance skill's Session End Protocol enforces this — see "Archive Check" step there.

**Duplication guard (extends §6):** Before adding content to any doc, check if it already exists elsewhere. If yes, add a pointer — do not copy. Duplicate content means two places to update when reality changes.

**Staleness rule:** Any section referencing a completed sprint, resolved audit, or shipped feature that is no longer actionable must be removed or archived at the next session wrap. Stale content is a bug.

---

## 17. Session Wrap Protocol

Before ending ANY session, Claude must execute the session wrap protocol:

1. **Run verification check:** `bash scripts/session-wrap-check.sh` (or equivalent verification script).
2. **Do not end session if check fails.** Fix any findings, re-run check, and confirm all checks pass before closing.
3. **Minimum wrap steps:**
   - (a) Commit all changed files with descriptive messages: `git add [specific files] && git commit -m "[message]"`
   - (b) Update `claude_docs/logs/session-log.md` with today's entry (completed work, files changed, notes). If any P-path items were completed or CD sprint features shipped this session, also update `claude_docs/strategy/roadmap.md` in the same commit — roadmap and session-log are always updated together.
   - (c) Update `claude_docs/operations/next-session-prompt.md` with context for the next session
   - (d) Re-run the wrap check to verify all gates pass
   - (e) Provide Patrick with the complete `.\push.ps1` block — every changed file listed as an explicit `git add [file]` line, never `git add -A` or `git add .`. The block must be copy-paste ready with no files omitted. Maintain a running changed-files list throughout the session; never reconstruct from memory at wrap time.

4. **Subagent discipline:** Any spawned subagent must follow the same protocol. Before handoff completes, subagent reports "Working tree clean" and lists all changed files.

5. **Subagent file tracking (hard rule):** When any subagent (via `Skill` tool) creates, modifies, or deletes files, the main session must:
   - (a) Record every file path returned by the subagent in a running "changed files" list for the session.
   - (b) At session wrap, cross-reference this list against `git status` output — any file the subagent reported but `git status` doesn't show is a drift signal (subagent may have written to a path outside the repo or the file was overwritten).
   - (c) Include ALL subagent-reported files in the wrap file list given to Patrick for `.\push.ps1`.
   Never assume the main session's `git status` alone captures subagent work — subagents may write files the main session never touched.

5. **Documentation push rule:** Never include documentation files in feature-batch MCP pushes. Code changes and doc changes use separate commits to prevent documentation overwriting. See `claude_docs/self-healing/self_healing_skills.md` entry #35.

For detailed protocol steps and edge cases, consult: `claude_docs/WRAP_PROTOCOL_QUICK_REFERENCE.md` and `claude_docs/SESSION_WRAP_PROTOCOL.md`.

---

## 18. Environment Command Hard Gate

Before writing any shell command, PowerShell command, Prisma command,
migration instruction, or environment variable guidance:

1. Verify the dev-environment skill has been loaded this session.
2. If not loaded — load it now, then issue the command.
3. If already loaded — apply its rules without reloading.

No exceptions. This applies mid-sprint, in follow-up corrections,
and in subagent handoffs. The trigger is the act of writing the command,
not the start of the session.

### Pre-Command Syntax Validation

Before writing ANY command for Patrick to run:
1. **Identify the target shell.** Patrick runs PowerShell on Windows. The Cowork VM runs bash on Linux. Never mix them.
2. **PowerShell commands for Patrick:** Use `$env:VAR` (not `export VAR`), backslash paths, `.\script.ps1` (not `./script.ps1`), semicolons for chaining (not `&&`).
3. **Bash commands in Cowork VM:** Standard Linux syntax — `export VAR`, forward slashes, `&&` chaining.
4. **Never guess OS.** If unsure whether a command is for Patrick or for the VM, state which environment it targets.
5. **Validate before sending:** Mentally run the command. Would it parse in the target shell? If not, fix it before writing it.

Token cost of one failed command: Patrick runs it, gets an error, pastes it back, Claude debugs, writes a corrected version — minimum 3 turns wasted. Prevention is always cheaper.

### Common PowerShell Traps (Quick Reference)

| Wrong (bash) | Right (PowerShell) | Context |
|--------------|---------------------|---------|
| `export VAR=value` | `$env:VAR="value"` | Setting env vars |
| `./script.sh` | `.\script.ps1` | Running scripts |
| `cmd1 && cmd2` | `cmd1; cmd2` or separate lines | Chaining commands |
| `cat file` | `Get-Content file` or `type file` | Reading files |
| `rm -rf dir` | `Remove-Item -Recurse -Force dir` | Deleting dirs |
| `grep pattern file` | `Select-String -Pattern pattern file` | Searching |
| `$HOME/.config` | `$env:USERPROFILE\.config` | Home directory |

If you catch yourself writing a bash-ism for Patrick, stop and translate before sending.

---

## 19. Known Tool Constraints

### skill-creator `run_loop.py` — Cowork environment incompatible

The skill-creator's automated evaluation loop (`run_loop.py`) exits with code 255 in the Cowork environment. The script spawns `claude -p` subprocesses which time out or fail to launch. Confirmed twice in session 91.

**Do not retry `run_loop.py`.** Use manual analysis instead:
1. Write trigger eval queries (10 should-trigger, 8 should-not-trigger near-misses) to a JSON file
2. Manually analyze gaps between current description and eval set
3. Write improved description, copy skill to writable location (`chmod u+w`), apply edit, package with `package_skill.py`

Note: Failed loop runs register orphaned skill variants in the VM session context (visible in Claude's available skills list). These are ephemeral — they disappear when the session ends and are NOT saved to Patrick's computer or Cowork UI.

---

Status: Behavioral Authority
