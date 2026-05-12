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

1. Check active MCP tools (GitHub, Stripe, MailerLite, Stripe, Vercel, etc.)
2. Load STATE.md (including "## Recent Sessions" + "## Next Session" sections)
3. Skip loading next-session-prompt.md — its content is now in STATE.md "## Next Session"
4. Skip loading session-log.md — its content is now in STATE.md "## Recent Sessions"
5. GitHub sync check: compare local STATE.md `Last Updated` vs remote.
   If different → tell Patrick to run `.\push.ps1` first. Block until synced.
6. Announce estimated context budget: "~Xk tokens available this session."

Skip re-loading on subsequent turns if context was already loaded this session.
First message of any session always triggers init (conversation-defaults Rule 3).

**§2.1: Post-Compression Re-Init**
After any autocompaction event (detected by resume message or context summarization),
immediately re-run ALL six init steps above before resuming work. Autocompaction is a
session boundary — treat it the same as a new session start. Do not skip steps 2–6.
Log: "[POST-COMPRESS-INIT] Completed steps 1–6 at turn N."

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

**Environment gate:** Before any shell, PowerShell, or Prisma command — STOP. Verify dev-environment skill is loaded this session. If not, invoke Skill('dev-environment') immediately. Do not proceed without it active.

**Compression logging:** When context is compressed (auto or manual), log:
`[COMPRESS] Session N turn M: kept [what], lost [what], ~Xk→Yk tokens`
Include this in STATE.md at wrap. Preserve Operational Anchors
(package paths, script names, shell syntax) through compression.

**§3.4: Post-Compression Mandatory Re-Read**
After detecting compression, immediately re-read CORE.md §4 (Push Rules) before resuming any work. This section contains the most compression-vulnerable rules (truncation gate, block completeness, file read mandate). These rules prevent production outages. Log: "[COMPRESS-RECOVER] Re-read CORE.md §4 at turn N." No exceptions.

**Post-compression re-read (mandatory):** Immediately after any compression event — before continuing any work — re-read CORE.md §4 (Push Rules). The commit block format rule (always provide full `git add` + `git commit` + `.\push.ps1` block) is the first rule lost after compression. Re-reading §4 restores it. No exceptions.

**Token checkpoints:** At natural pauses (after file read batch, after subagent
dispatch, before wrap), log:
`[CHECKPOINT — Turn N] Files read: X (est. Yk) | Tools: Z (est. Wk) | Session: ~Vk / 200k (P%)`
Warn at 170k used (85%) — pause and plan wrap. Hard stop at 190k (95%).

---

## 4. Push Rules

**IMPORTANT:** This section contains universal rules for any project. For FindA.Sale-specific push rules (which take precedence), see project CLAUDE.md §5. CLAUDE.md §5 is the authoritative source for this project.

**Universal rules:**

**MCP GitHub limits (universal baseline):** Max 3 files per `push_files` call. Files >200 lines
push solo via `create_or_update_file`. Max 3 agents dispatched in parallel.

**Pre-push verification:** Read function/type signatures before pushing code.
Grep patterns before pushing build fixes. One Read call prevents 3 failed deploys.

**MCP file content rule:** `create_or_update_file` replaces the entire remote file —
it does not merge or append. Always read the full file first. Always push the
COMPLETE file content, never truncated or partial lines.

**MCP truncation gate:** Before every `create_or_update_file` call, compare:
(a) line count of content to push vs. (b) line count on GitHub. If push content
is more than 20% shorter AND no intentional deletion, STOP — rebuild.

**Merge conflict re-staging:** After resolving any merge conflict, explicitly
re-stage ALL files in conflict state before committing. Missing re-stage causes
abort loops. Always: resolve → `git add [all-conflict-files]` → `git commit`.

**Commit block format:** Any time git commit instructions are given — mid-session
or at wrap — provide a complete copy-paste block with explicit `git add [file]`
lines, `git commit -m "..."`, and push method. Never `git add -A`. Never omit
commit message. Never omit push command.

**§4.10: Compression-Aware Push Checklist**
After any compression event, before pushing:
1. Read the file in full (non-negotiable).
2. Compare line count: local file vs. GitHub (via `get_file_contents`).
3. If local >20% shorter and no intentional deletion, STOP. Rebuild.
4. Confirm: complete block ready (all files, commit msg, `.\push.ps1`).
5. Push only after all checks pass.

---

## 5. Session Wrap

Before ending any session:

1. Update STATE.md (both "## Recent Sessions" and "## Next Session" sections)
   - Recent Sessions: add entry at top with completed work, files changed, compression events
   - Next Session: update with next task, blockers, pending Patrick actions
2. Update patrick-dashboard.md (Patrick-readable status summary)
   - NEVER include credentials — reference `.env` only
3. Write session scoreboard to STATE.md entry:
   `Files changed: N | Compressions: N | Subagents: [list] | Push method: MCP/PS1`
4. Provide Patrick the `.\push.ps1` block — every changed file as explicit
   `git add [file]` lines. Never `git add -A`. Never omit files.
5. Track subagent files: maintain running changed-files list. Cross-reference
   against `git status` at wrap. Include all subagent-reported files.

---

## 6. Escalation Channel

Any subagent may include a `## Patrick Direct` section in its output when it
believes the main session is: (a) ignoring a P0/P1 finding, (b) dispatching
work that contradicts a locked decision, (c) operating on stale context, or
(d) burning tokens on a wrong path.

**Guardrails:**
- Evidence required: every `## Patrick Direct` block must cite specific evidence
  (file names, decision references, concrete data). "I have a bad feeling" is
  not sufficient.
- Cooldown: one `## Patrick Direct` per agent per session. If overruled, do not
  re-escalate on the same topic in the same session.
- Auto-logging: all `## Patrick Direct` blocks are appended to
  `claude_docs/escalation-log.md` (append-only, pruned monthly by Records).
- No action requests: escalation blocks flag concerns only — they never say
  "do Z instead." Patrick decides the action.
- Stale-context claims must cite a specific file version delta (e.g., "STATE.md
  updated in session 140 but main session references session 138 state").

**Main session obligation:** Surface every `## Patrick Direct` block to Patrick
verbatim. No summarizing, no filtering. Suppressing an escalation is a CORE.md
violation.

---

## 7. Handoff Protocol

When Agent A's work creates a task for Agent B, Agent A writes a structured
handoff block:

```
## Handoff: [Source Agent] → [Target Agent]
Timestamp: [ISO 8601]
Source agent: [name]
Task: [what needs to be done]
Context files: [relevant files with paths]
Decisions already made: [locked decisions relevant to this task]
Constraints: [scope limits, no-go areas]
Acceptance criteria: [how to verify completion]
Cited file versions: [filename@commit:hash or "current" if uncommitted]
```

**Integrity rules:**
- The main session passes handoff blocks as-is — no editing, no summarizing.
  The main session is a pass-through, not a translator.
- If the receiving agent detects a conflict between the handoff and current file
  state, it raises a `## Patrick Direct` escalation rather than silently resolving.

---

## 8. Red-Flag Veto Gate

Changes touching auth flows, payment processing, data deletion, or security
config require sign-off from Architect or Hacker before the main session
dispatches Dev. This is a mandatory pre-dispatch check, not optional review.

**Orange tier (review before merge):** Fee changes, public-facing content, new
integrations, API contract changes. DA + Steelman weigh in; Patrick decides.

**Red tier (blocks until sign-off):** Auth flow changes, payment processing
changes, data deletion logic, security config changes. Requires sign-off from
Architect or Hacker before proceeding.

Reference: Session 120 incident — Dev agent replaced a 563-line file with a
stub due to unsupervised dispatch on a security-sensitive path.

---

## ## 9. Skill Update Protocol

**Critical fact:** Editing a SKILL.md file in git does NOT activate the change.
Active skills are read-only at `/sessions/[session-id]/mnt/.skills/skills/`.

1. SKILL.md sources exist in two git locations:
   - `claude_docs/skills-package/[skill-name]/SKILL.md` — most FindA.Sale skills
   - `.skills/skills/[skill-name]/SKILL.md` — conversation-defaults, dev-environment, skill-creator

2. To activate a SKILL.md change this session:
   - Package the updated skill directory as a `.skill` zip file
   - Patrick installs via Cowork's skill install UI
   - The `.skill` format is a zip archive containing the skill directory

3. Between sessions: installed skills persist at `mnt/.skills/skills/` on Patrick's machine.

4. **When to do this:** Any session where a SKILL.md edit needs to take effect immediately.
   Without reinstall, the new version only exists in git — the active skill is unchanged.

### Skill Packaging (mandatory for all skill updates)

After any SKILL.md edit is committed to git, the skill MUST be repackaged as a .skill ZIP and pushed to GitHub so Patrick can reinstall it via Cowork UI.

**Process (every time a SKILL.md changes):**
1. Fix frontmatter: `version` and `last_updated` fields must be nested under `metadata:` — top-level invalid keys fail the packager validator.
2. Copy skill dir to `/tmp/skill-build/[skill-name]/`
3. Run: `cd /sessions/[session]/mnt/.skills/skills/skill-creator && python -m scripts.package_skill /tmp/skill-build/[skill-name] /tmp/skill-build`
4. Copy output to `claude_docs/skills-package/[skill-name].skill`
5. Push .skill file to GitHub via MCP
6. Present to Patrick via `mcp__cowork__present_files` — the card shows a "Copy to your skills" install button

**Skills in `.skills/skills/[name]/` path** (conversation-defaults, dev-environment, skill-creator): Read-only in VM. Copy to /tmp, edit, package from copy.
**Skills in `claude_docs/skills-package/[name]/` path** (all findasale-* skills): Writable. Edit in place, package from there.

**Canonical .skill locations on GitHub:** `claude_docs/skills-package/[name].skill`

---

## Reference Docs (load on demand, not at init)

| Need | File |
|------|------|
| Recurring bug patterns | `self-healing/self_healing_skills.md` |
| Session safeguards (3-attempt limit) | `operations/session-safeguards.md` |
| Patrick's shorthand meanings | `operations/patrick-language-map.md` |
| Model routing (Sonnet/Haiku/Opus) | `operations/model-routing.md` |
| Wrap protocol (canonical) | `CLAUDE.md §12` |
| Wrap protocol (reference) | `WRAP_PROTOCOL_QUICK_REFERENCE.md` |
| Tech stack decisions | `STACK.md` |
| Security rules | `SECURITY.md` |
| Recovery procedures | `RECOVERY.md` |
| File creation paths | `operations/file-creation-schema.md` |

---

## § Token Efficiency Rules

These rules exist to prevent early auto-compaction. Violating them burns tokens and degrades session quality.

**T1 — Compaction summary compression:** Compaction summaries must be ≤15 lines / ~1.5k tokens. One-liner outcomes only. No code, diffs, or full error messages. This is the #1 cause of early re-compaction.

**T2 — No production code in session init:** Never read production code files >200 lines during session init or in the main window for architectural reference. Reference by path; subagents read code as needed. Applies to any file under `packages/`.

**T3 — Mid-dispatch checkpoints are NON-BLOCKING:**
- Context < 80%: log marker silently, continue immediately
- Context 80–89%: log warning inline, continue immediately
- Context ≥ 90%: evaluate remaining work; if 1–2 short tasks remain, continue; if major work remains, complete current subagent round then wrap
Checkpoints are observability, not gates. Never stop productive work just because a checkpoint fires.

**T4 — Recent Sessions rotation:** STATE.md "## Recent Sessions" section keeps the 5 most recent session entries. When adding a new entry pushes it to 6+, move the oldest entry to `claude_docs/session-log-archive.md` (create if missing, append at bottom).

**T5 — STATE.md size gate:** If STATE.md exceeds 250 lines, archive the oldest completed-features section to `claude_docs/STATE-archive.md` before adding new content.

**T6 — Checkpoint manifest trimming:** .checkpoint-manifest.json keeps only the last 10 checkpoint entries. Trim oldest when adding.

**T7 — Init file budget gate:** Session init file loading targets ≤10k tokens total. If projected total exceeds 10k, drop lowest-priority files (session-log, decisions-log) first.

---

Status: Behavioral Authority (v4.4, Session 265 — wrap file consolidation, STATE.md now canonical)
