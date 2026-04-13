# GitHub MCP & Subagent Rules Optimization Audit

*Created: 2026-03-09 (session 95, backlog G8). Tier 3 — archive after findings applied.*

---

## Current Rules Reviewed

### CORE.md §10: GitHub Push Batching
- Max 3 files per `push_files` call ✓
- Large files (200+ lines) pushed solo via `create_or_update_file` ✓
- MCP vs PowerShell decision rule clearly defined ✓
- Standing file rules for wrap-only docs ✓
- Build-error fix protocol (grep-all-then-push-once) ✓
- Mid-session MCP → fetch-at-wrap sync rule ✓

### CORE.md §11: Parallel Agent Dispatch
- Max 3 agents in parallel ✓
- Serial batching for >3 agents ✓

### CORE.md §12: Model Routing
- Default Sonnet, Haiku for read-only, Opus for novel architecture ✓

### Root CLAUDE.md §5: MCP Tool Awareness
- ≤5 files per push, ≤25k tokens combined ✓
- Bulk pushes → Patrick's PowerShell ✓
- Always `.\push.ps1` instead of `git push` ✓

---

## Assessment: What's Working

1. **Push batching rules are solid.** The 3-file limit in CORE.md (stricter than CLAUDE.md's 5-file limit) has prevented push failures since session 90.
2. **Wrap-only doc rule** (never MCP-push STATE.md, session-log.md mid-session) eliminated the merge conflict class of bugs that plagued sessions 89–90.
3. **MCP vs PowerShell decision tree** is clear and actionable.

## Assessment: Optimization Opportunities

### O1: CLAUDE.md vs CORE.md limit mismatch (LOW)
CLAUDE.md says ≤5 files per push. CORE.md says ≤3 files. The stricter CORE.md rule prevails (authority order), but the inconsistency could confuse a fresh session that reads CLAUDE.md first and CORE.md second.
**Recommendation:** Align CLAUDE.md to say ≤3 files, matching CORE.md. One number, one rule.

### O2: SHA fetch for `create_or_update_file` is undocumented cost (MEDIUM)
Using `create_or_update_file` requires the file's current SHA from GitHub. This means a `get_file_contents` call first, which consumes tokens. For files already in context (just edited), this is cheap. For files NOT in context, it's an extra read.
**Recommendation:** Add to §10: "When using `create_or_update_file`, get the SHA from `mcp__github__get_file_contents` in the same turn. If the file is >300 lines and not already in context, consider whether PowerShell is cheaper."

### O3: Subagent MCP awareness gap (MEDIUM)
CORE.md §17 (Session Wrap, item 5) now requires subagents to report changed files. But subagents invoked via `Skill` tool don't inherently know about MCP limits — they may attempt oversized pushes.
**Recommendation:** Add to §11: "When dispatching a subagent that may need to push files, include MCP limits in the dispatch instructions: max 3 files per push, max 200 lines per file in a batch, use `create_or_update_file` for large files."

### O4: No cost tracking for MCP calls (LOW)
We have no data on how many MCP calls per session, or their token cost. This blocks E12 (token efficiency measurement).
**Recommendation:** Future work — when token monitoring tools exist, track MCP call count and cost per session.

---

## Actions Taken This Session

1. O1: Will align CLAUDE.md file limit to match CORE.md (below).
2. O3: Will add subagent MCP awareness note to §11.
3. O2 and O4: Documented for future sessions.
