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

FindA.Sale is a PWA for secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment).

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
Include this in STATE.md at wrap.

**Post-compression mandatory re-read:** Immediately after any compression event:
1. Re-read this file §5 (Push Rules) — push rules are the first lost after compression.
2. Re-read this file §9 (QA Honesty Gate) — QA rigor is the second thing lost.
3. Re-read this file §10c (QA Management) — micro-dispatch and evidence rules.
4. Do NOT accept any ✅ marks from pre-compression context without re-verification.
5. Note in your next action: "Post-compression QA stack reloaded."
No exceptions.

---

## 5. Push Rules

**Pushblock-first strategy (new default):** Always provide Patrick a copy-paste pushblock as the default push method. MCP push is only used when: (a) Patrick explicitly says "push it now" and time-to-deploy matters, or (b) a single trivial edit under 50 lines to a file already in context. Rationale: MCP push costs ~12k tokens per file (mandatory read + full file content as parameter + verification). A pushblock costs ~300–500 tokens. Use the cheaper method first.

**After successful MCP push:** Do NOT also generate a pushblock — the files are already on GitHub. One or the other, never both.

**MCP GitHub limits (when MCP is used):** Max 3 files per `push_files` call. Total file content ≤25,000 tokens combined per call. Read each file before pushing and estimate token count. If the batch would exceed ~25k tokens, split or hand off to Patrick.

**GitHub MCP (`mcp__github__*`) — backup only:**
Use `mcp__github__push_files` only when pushblock is inappropriate, with two hard limits:
1. **≤3 files per push** (hard limit — stricter than any earlier 5-file guidance)
2. **Total file content ≤ 25,000 tokens combined** — read each file before pushing and estimate token count. If the batch would exceed ~25k tokens, split or hand off to Patrick.

**Large file guidance:** If a single file exceeds ~500 lines and a pushblock is used, include it solo. If it exceeds ~800 lines, hand off to Patrick with PS1 block. Never batch a large file with other files in a pushblock.

**Changeset size rule:** If changeset is >3 files, skip MCP entirely. Give one clean pushblock.

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

**Subagent git ban (HARD RULE — survives compression):** Subagents are BANNED from running ANY git commands — including `git status`, `git add`, `git commit`, `git reset`, `git clean`, `git checkout`, `git rm`, `git stash`, or any other git operation. Two complete repo wipes occurred (S362 confirmed, prior occurrence also confirmed) from subagent git commands running in the VM whose index state was desynced from Patrick's Windows repo. When Patrick ran `.\push.ps1` the delta was catastrophic (1,483 files deleted both times). Subagents may ONLY: read files, write files, run TypeScript/build checks (`npx tsc --noEmit`), run npm/pnpm commands, and return an explicit list of changed file paths to the main session. All git staging, committing, and pushing is Patrick-only via PowerShell. Main session provides the complete pushblock with explicit `git add [file]` lines per file.

Repo: `deseee/findasale` — Branch: `main`

---

## 6. Schema Change Protocol (Prisma)

Any session that modifies `schema.prisma` or adds a migration SQL file **MUST** include these two Patrick manual actions in the handoff — no exceptions. The DATABASE_URL override MUST appear copy-paste-ready in the actual block Patrick receives:

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy   # applies SQL to Railway DB, records in _prisma_migrations
npx prisma generate         # regenerates TypeScript client with new fields
```

**CRITICAL:** `packages/database/.env` points to localhost — always override `DATABASE_URL` with the Railway connection string as shown above. Omitting the override silently runs the migration against localhost and leaves the production DB out of sync.

**Database is Railway PostgreSQL** (`maglev.proxy.rlwy.net:13949/railway` — migrated from Neon, S264). Never use the old `ep-plain-sound-aeefcq1y.c-2.us-east-2.aws.neon.tech` Neon URL — that service is decommissioned.

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

**REMOVAL GATE (fires before ANY subagent deletes user-facing content):**
Any subagent action that removes a feature, nav link, UI element, route, page,
component, or user-facing content MUST be returned to the main session as a
**decision point** — not executed autonomously. The subagent must:
1. List exactly what is being removed (component name, link text, route path)
2. Explain why removal was considered (audit finding, 404, redundancy, etc.)
3. Provide options: **REMOVE** / **FIX** (repair the broken thing) / **REDIRECT** / **REPLACE**
4. Do NOT ship the removal. Return it as "DECISION NEEDED" in the handoff.
The main session surfaces the decision to Patrick. Only Patrick may authorize removal.
Removal without Patrick sign-off is a rule violation regardless of justification.
**Examples of what triggers this gate:** deleting JSX, removing `<Link>` or `<a>` elements,
commenting out routes, hiding navigation items, removing page files, deleting components.
**Does NOT apply to:** removing code that is provably dead at the language level only —
unused imports flagged by TypeScript/ESLint, variables assigned but never read,
commented-out `console.log` or debug statements. If it's a page, route, component,
function, link, API endpoint, or anything that COULD be reached by a user or called
by another module, it is NOT dead code — it triggers the Removal Gate even if nothing
currently links to it. "Not wired into nav yet" ≠ dead. "No callers found" ≠ dead.
When in doubt, it triggers the gate.

**Orchestrator triage (main session responsibility):**
When a subagent returns a "DECISION NEEDED" block, the orchestrator evaluates it
against project context (STATE.md, DECISIONS.md, roadmap, prior Patrick decisions):
- **FIX / REDIRECT / REPLACE** — If the right action is clearly a fix, redirect, or
  replacement (broken link → fix the target, wrong label → rename, missing content →
  build it), the orchestrator dispatches the fix silently. No Patrick approval needed.
  Mention the fix inline in the session summary.
- **REMOVE** — If the orchestrator's assessment is that something should be removed
  from the product entirely (feature isn't needed, page is redundant, element adds
  confusion), this MUST be surfaced to Patrick with full context before execution.
  Only Patrick authorizes removal.
- **UNCLEAR** — If the orchestrator cannot confidently determine the right action,
  surface to Patrick with options. Do not guess.

**BATCH DISPATCH PROTOCOL (parallel dev work — orchestrator loop):**

When Patrick says "dispatch in parallel" or "work through the roadmap," follow this loop until context is tight:

**Step 1 — Pre-dispatch triage:**
Read STATE.md + scan roadmap BROKEN section. Group items by file ownership. Items touching the same file must run sequentially (different batches). Items touching different files can run in parallel. Identify cross-agent dependencies before dispatching — if Agent A adds a route that Agent B's component calls, either batch them together or note the dependency explicitly in Agent B's prompt.

**Step 2 — Knock-on effect check (before every dispatch):**
For each item being dispatched, answer: (a) Does it add/change an API route? → check if any existing frontend component calls the old path. (b) Does it change a shared service or controller? → grep for all callers. (c) Does it touch schema? → flag migration requirement and block dependent features until migration ships. Document found knock-ons in the dispatch prompt so the agent handles them in one pass.

**Step 3 — Dev agent prompt requirements (every dispatch, no exceptions):**
Each dev agent prompt MUST include:
1. Schema preflight: "Read schema.prisma. Confirm every field you reference exists before writing any code."
2. Knock-on effects: "After implementing, grep for any other file that references the old behavior and fix it or flag it."
3. TS check gate: `cd packages/frontend && npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | grep -v node_modules` — zero errors required before returning.
4. Changed-files list: "Return an explicit list of every file you created or modified."

**Step 4 — Post-batch processing (before next dispatch):**
When agents return, do all four before dispatching again:
1. Update roadmap rows for every completed item (BROKEN → FIXED S[N], add root-cause one-liner, mark Pending Chrome QA).
2. Update STATE.md Current Work with a Batch N summary paragraph.
3. Inline-fix any item an agent returned as "analysis only" if the fix is <20 lines.
4. Compile the changed-files list across all agents — this becomes the push block.

**Step 5 — Context budget:**
Each batch burns ~400–500k agent tokens. Main session grows ~15–20k per batch processed. At 80% context (~170k tokens), wrap instead of dispatching another batch. A fresh session with updated STATE.md produces better dispatches than a compressed one.

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

## 9. QA Honesty Gate (HARD RULE — survives compression)

A feature is ✅ only when a real user can complete the intended task end-to-end with correct real data. No exceptions.

**Before writing ANY ✅, ask all 6 questions. Every answer must be a clear YES or it gets ⚠️/❌:**

1. **Task completable?** Could a human sitting at a keyboard (or on their phone) right now complete this task end-to-end with real data?
2. **Display correct?** No mint text on green backgrounds, no white cards in dark mode, no layout conflicts, no overflow/clipping — correct on both desktop and mobile viewports.
3. **Makes sense in context?** Does the feature make sense to a non-technical user in the flow of the app, given where they came from and what they're trying to do?
4. **Explainers needed?** Would a first-time user be confused without a tooltip, label, or explainer? If yes, mark ⚠️ and flag the gap.
5. **Downstream effects work?** Does the action correctly trigger what should happen next — emails sent, state updates reflected, related records updated, UI refreshed?
6. **Brand voice?** Does all text (labels, copy, error messages, empty states, confirmations) follow FindA.Sale tone and style?

**These are NOT ✅:**
- Page loads → NOT verified
- Text renders on screen → NOT verified
- Modal opens → NOT verified
- Button is present → NOT verified
- API returns 200 → NOT verified
- "Looks right" → NOT verified

**These ARE ✅:**
- User clicked the button AND the expected outcome happened AND the data is real AND no error state appeared AND all 6 questions above are YES
- The full user task (open → interact → result) completed successfully with real data

**Bug vs Decision:** If something doesn't work for a real user, it is a **bug**. It is not a "Patrick decision." It is not "worth noting." It gets a ❌ or ⚠️ and a dev dispatch. The only decisions that go to Patrick are product direction (build this feature or not). Broken implementations of already-decided features are bugs — fix them.

**Converting bugs to decisions is prohibited.** If Claude writes "DECISION NEEDED" for something that is already a committed feature and simply doesn't work correctly, that is a rule violation.

**Image upload flows — upload_image is available (HARD RULE — survives compression):**
`mcp__Claude_in_Chrome__upload_image` IS available in the VM and WAS successfully used in S312 and S313. Before marking any camera/upload/photo flow as UNVERIFIED, Claude MUST attempt this tool. The following are NOT valid reasons to skip:
- "File upload is blocked" — `file_upload` and `upload_image` are DIFFERENT tools
- "VM filesystem restriction" — upload_image bypasses this
- "I couldn't attach the file" — wrong tool; use upload_image
UNVERIFIED is only valid after a genuine upload_image attempt that failed. Skipping the attempt and marking UNVERIFIED is rubber-stamping.

**Code confirmation ≠ browser verification (HARD RULE — survives compression):**
Reading a file on GitHub or in the filesystem and confirming a fix is present is NOT a ✅. "Fix confirmed deployed to Railway" without Chrome interaction is UNVERIFIED. For any fix that involves user-visible behavior (AI confidence label, photo display, form save, toast, redirect), the only valid ✅ requires: navigated to the page in Chrome, performed the interaction, saw the expected outcome, reloaded, confirmed persistence — with screenshot IDs. Code-on-GitHub ≠ works-in-browser.

---

## 10. MCP Tool Awareness

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

**Post-fix live verification (mandatory — FIRST action of every session):** After ANY
session that pushes bug fixes or feature code to production, the NEXT session must
include a live-site smoke test (Chrome MCP at finda.sale) of all changed pages BEFORE
starting new work. This is not optional and not something Patrick should have to request.
1. Read STATE.md "## Recent Sessions" for the previous session's fix list.
2. Open Chrome MCP. Navigate to each affected page.
3. Perform ONE interaction per page (click a button, verify data loads, check dark mode).
4. If ANY page is broken → flag immediately and dispatch findasale-dev before other work.
5. Report smoke test results to Patrick before proceeding.
Claude owns QA continuity — Patrick should never discover a broken page that Claude
could have caught. This rule exists because previous sessions fabricated ✅ marks that
were never actually verified (documented S285–S296). The smoke test catches fabrication.

**Context checkpoints (no-pause rule):** Agent handoff "Context Checkpoint: yes/no" is internal bookkeeping. Never pause work to discuss a checkpoint.

**QA Management (§10c) — Structural Anti-Fabrication Rules:**

**Micro-dispatch rule (HARD):** Never dispatch "QA these N features" as a single task.
Dispatch ONE feature or ONE flow per QA subagent call. Example: "QA the favorites
feature for shopper (user11). Return evidence per PRE-VERIFICATION GATE." Focused
dispatches prevent subagents from skimming 10 things and marking all ✅.

**Chrome concurrency rule (HARD):** QA agents that use Chrome MCP must be dispatched SEQUENTIALLY — one at a time. Never dispatch multiple Chrome-dependent QA agents in parallel. They share a single browser instance and will conflict. Dispatch the next QA agent only after the previous returns. Alternatively, the main session may run Chrome QA directly. This rule was locked S323.

**Evidence-required acceptance (HARD):** When a QA subagent returns findings, check
every ✅ mark for the required evidence sentence:
`Navigated to [URL] as [user]. Clicked [element]. Saw [outcome]. Refreshed — [persisted/not].`
If ANY ✅ lacks this specific evidence → reject that finding. Re-dispatch with:
"Feature [X] missing verification evidence. Re-test in Chrome and provide exact
interaction details." Do NOT accept vague reports like "works fine" or "page loads."

**UNVERIFIED acceptance (REQUIRED):** Accept UNVERIFIED results as valid honest output.
Do NOT re-dispatch UNVERIFIED items in the same session unless Chrome becomes available.
Queue them in STATE.md "## Blocked/Unverified Queue" for the next session.

**Main session verification (HARD):** The orchestrator does NOT inherit ✅ from subagents.
The orchestrator's role is evidence review: "did this report include Chrome interaction
evidence with specifics?" That is the only judgment call. If evidence exists and is
specific, relay the ✅. If evidence is vague or missing, reject it.

**Pre-dispatch scenario list:** Before dispatching dev, write the post-deploy QA scenario
list. After dev returns, provide the push block, then immediately write QA dispatches
(one per feature) — do not wait for Patrick to ask.

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
1. Update STATE.md (source of truth for session state; now includes "## Recent Sessions" section with 5 most recent entries and "## Next Session" section)
2. Update patrick-dashboard.md (Patrick-readable status summary)
3. Provide Patrick the pushblock — both files above must be in it

**New STATE.md structure:**
- Sessions start with "## Current Work" tracking in-flight tasks
- "## Blocked/Unverified Queue" section tracks features that could not be browser-tested.
  Each entry: `| Feature | Reason | What's Needed | Session Added |`
  Items stay in the queue until Chrome-verified with evidence. Never silently drop items.
- "## Recent Sessions" section contains the 5 most recent session summaries (same format as prior session-log.md)
- "## Next Session" section contains pending Patrick actions and what comes next (same format as prior next-session-prompt.md)

**Deprecated files (consolidation):**
- `session-log.md` content moves INTO STATE.md "## Recent Sessions" section
- `next-session-prompt.md` content moves INTO STATE.md "## Next Session" section
- Existing instances of these files remain for now but are no longer updated after this session

**Critical rule:** Never update STATE.md without also updating patrick-dashboard.md. This ensures Patrick always has a current snapshot of project state.

**Wrap doc files — always in the push block (HARD RULE):**
`claude_docs/STATE.md` and `claude_docs/patrick-dashboard.md` are edited by the main session at every wrap using the Edit tool (not MCP). They will always appear as uncommitted local changes. They MUST be included in every wrap push block — no exceptions. `push.ps1` will abort if they are omitted. Template:
```powershell
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git add [all other changed files...]
git commit -m "..."
.\push.ps1
```

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
| QA accountability | `operations/orchestrator-qa-accountability.md` |
| Wrap protocol | `operations/WRAP_PROTOCOL_QUICK_REFERENCE.md` |
| Tech stack | `STACK.md` |
| Security | `SECURITY.md` |
| Recovery | `RECOVERY.md` |
| File creation paths | `operations/file-creation-schema.md` |

---

Status: Project Authority Layer (v5.0, Session 226 — merged CORE.md, added pain point fixes)
