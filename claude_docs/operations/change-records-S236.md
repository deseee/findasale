# Change Records — Session 236 (Power-User Workflow Audit)

**Date:** 2026-03-22
**Agent:** findasale-records
**Tier:** 1 (Clarification — no behavioral change, documentation only)

---

## Change Record A — CLAUDE.md §10 (Subagent File Hygiene)

**Section:** 10. Operational Rules → Subagent file hygiene (hard rule)

**Current text (lines 249):**
> Subagents must NEVER write files to the project root (`$PROJECT_ROOT/`), create directories not in the locked folder map (`operations/file-creation-schema.md`), or leave temp/handoff/artifact files in `claude_docs/` root. All scratch and working files go to the VM working directory (`/sessions/[session-id]/`). All deliverables go to the correct `claude_docs/` subdirectory. Violations are flagged by Records at session wrap — but the goal is zero violations, not clean-up.

**Proposed addition:**
After the sentence "All scratch and working files go to the VM working directory (`/sessions/[session-id]/`)." insert:

> Temp files in the VM working directory are automatically cleaned up and are the correct location for subagent scratch work.

**Revised full paragraph:**
> Subagents must NEVER write files to the project root (`$PROJECT_ROOT/`), create directories not in the locked folder map (`operations/file-creation-schema.md`), or leave temp/handoff/artifact files in `claude_docs/` root. All scratch and working files go to the VM working directory (`/sessions/[session-id]/`). Temp files in the VM working directory are automatically cleaned up and are the correct location for subagent scratch work. All deliverables go to the correct `claude_docs/` subdirectory. Violations are flagged by Records at session wrap — but the goal is zero violations, not clean-up.

**Rationale:**
The current rule prevents subagents from leaving artifacts in `claude_docs/`, but the guidance could be misinterpreted as discouraging all temporary file creation in `/sessions/`. This clarification explicitly permits temporary files in the VM working directory, preventing subagents from being overly cautious or creating unnecessary deliverables to avoid violation flags.

---

## Change Record B — CLAUDE.md §5 (Subagent Push Ban)

**Section:** 5. Push Rules → Subagent push ban (paragraph starting line 131)

**Current text:**
> Subagents are NOT authorized to push to GitHub via MCP `push_files`. Only the main session may execute `push_files` calls. Subagents return output with file changes listed; main session batches into consolidated MCP pushes (≤3 files per call) or provides Patrick a single comprehensive push block.

**Proposed addition:**
After "main session batches into consolidated MCP pushes (≤3 files per call)" insert:

> This applies even when a subagent's batch would technically fit within 3-file/25k-token limits — the rule is absolute.

**Revised full paragraph:**
> Subagents are NOT authorized to push to GitHub via MCP `push_files`. Only the main session may execute `push_files` calls. Subagents return output with file changes listed; main session batches into consolidated MCP pushes (≤3 files per call). This applies even when a subagent's batch would technically fit within 3-file/25k-token limits — the rule is absolute. Or provides Patrick a single comprehensive push block.

**Rationale:**
The push ban is absolute, but subagents might interpret the size limits (3 files, 25k tokens) as implicit exemptions if their work technically fits those constraints. This clarification closes the edge case by stating the ban is unconditional, regardless of batch size. It reinforces the role boundary: only the main session orchestrates pushes, even for small changes.

---

## Implementation Notes

- **No file edit required yet** — awaiting Patrick approval before updating `/sessions/wizardly-trusting-curie/mnt/FindaSale/CLAUDE.md`
- **Proposed line numbers are approximate** — exact insertion points depend on Patrick's review and any intervening changes since S225
- **Both changes are low-risk**: They clarify existing intent without changing behavior, permissions, or architecture
- **Skill activation:** findasale-dev.skill repackaged with stale reference fixed (line 108: `context-maintenance` → `findasale-records`)

