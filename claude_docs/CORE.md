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

1. Load `context.md` — filetree, Docker status, last session summary
2. Load `claude_docs/STATE.md` — current sprint and blockers
3. Skim `claude_docs/session-log.md` — last 1–2 entries for recent decisions

Skip silently if Patrick has already given a task and context was loaded this session.
Do not narrate the load unless asked.

---

## 3. Execution Loop

For non-trivial work:

Survey → Plan → Execute → Verify → Report

During Survey: check `context.md` filetree before using any file-location tool (Glob, find, ls).

Do not skip verification.

---

## 4. Diff-Only Rule

When modifying code:
- Output only changed files
- No full rewrites unless requested
- No unchanged context

Before executing any file change, state the approach in one line:
- Targeted edit: "Editing [file] lines X–Y"
- Full rewrite: "Rewriting [file] entirely"

This lets Patrick immediately catch unnecessary rewrites.

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
→ CORE.md  
→ Root CLAUDE.md  
→ Package CLAUDE.md  
→ STACK.md  
→ STATE.md  
→ SECURITY.md / RECOVERY.md  

Higher layer prevails.

---

## 8. Self-Healing Skills

Before debugging recurring errors, check:
`claude_docs/self_healing_skills.md`

Covers: SSR crashes, JWT payload staleness, unwired frontend stubs, missing Prisma
relation fields, unhandled async failures, unprotected routes, unbounded queries,
missing env vars, Docker/pnpm monorepo startup failures (nodemon not found).

After fixing any bug:
- Check if the pattern exists in `self_healing_skills.md`
- If not, and the pattern has been seen ≥2 times OR is structurally certain to recur,
  add a new entry immediately — do not wait for session wrap

---

## 9. Proactive Health Scanning

Before production deploys or after large sprints, run the health-scout skill.
Recent scan results: `claude_docs/health-reports/` (newest file = latest report).
Weekly scan runs automatically Sunday 11pm via `findasale-health-scout` task.

---

## 10. GitHub Push Batching Rule

When using `mcp__github__push_files`, **never push more than 3 files per call**.
Large batches exceed the output token limit and silently fail or crash the session.

**Rule:** Max 3 files per `push_files` call. If a single file exceeds ~200 lines, push it alone.

**Pattern:**
1. Read all target files in parallel (as many as needed — reads are input tokens, not output)
2. Push in serial batches of ≤3 files, with a descriptive commit message per batch
3. Group small files together; large files (>200 lines) always get their own commit

This applies to every session wrap and any mid-session push. Never revert to a single
giant push to "save commits" — the token limit will kill it.

### MCP vs PowerShell Decision Rule

Use **MCP** (`push_files`) when ALL of the following are true:
- 1–3 files in the batch, AND
- All files were read or edited in the **current turn** (already in context — no re-read cost), AND
- No single file is a large doc (>300 lines) that wasn't actively changed this turn

Tell Patrick **"please run `git push` in PowerShell"** when ANY of the following apply:
- 4+ files need pushing as a group
- Any file is large (>300 lines) and was NOT edited this turn — re-reading it just to push is wasteful
- Session wrap involves >5 changed files total
- A file needs to be re-read from GitHub before pushing (drift scenario — skip MCP, use PowerShell)

### Standing File Rules

- **ROADMAP.md** — Only push in the **same turn** it was edited. Never re-read and re-push across turns.
- **STATE.md** — Push **once**, at session wrap only. Never mid-session.
- **Large docs not touched this turn** — Do not re-read for the sole purpose of pushing. Flag for PowerShell instead.

---

Status: Behavioral Authority
