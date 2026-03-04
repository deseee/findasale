# Next Session Resume Prompt
*Written: 2026-03-04T23:30:00Z*
*Session ended: normally*

## Resume From
Workflow stress test — deliberately test the guardrails, rules, and skills added in sessions 39–40. Goal is to find and tag remaining gaps before sprint work begins.

## What Was Completed This Session (Session 40)
- Deep workflow audit: found and fixed 9 issues across doc system, tools, and connectors
- CORE.md: Section 2 expanded (MCP check + CORE load at session start), Section 4 hardened (diff-only applies to ALL files, hard gate announcement), Section 7 expanded (Skills added to authority hierarchy), Section 10 upgraded (create_or_update_file preference, MAX_MCP_OUTPUT_TOKENS escape hatch)
- conversation-defaults: Rule 3 added (announce file mod approach before every write)
- self_healing_skills.md: Skill 19 added (diff-only violation pattern), file reordered (Skills 17–19 were out of sequence)
- RECOVERY.md: Entry 8 replaced (stale Socket.io → auction polling note)
- STATE.md: stale "In Progress" cleared, backend hosting wording clarified
- SECURITY.md: timestamp updated post-rebrand
- context.md: GitHub false negative fixed (CLI vs MCP distinction)
- update-context.js: Tool & Skill Tree section added to generated context
- Dead code deleted: `contexts/ToastContext.tsx` removed (all imports use `components/ToastContext.tsx`)
- session-log.md trimmed to 5 entries

## Stress Test Plan for Next Session

The goal is to deliberately trigger edge cases in our workflow rules and see what breaks. Patrick should issue these requests in order and watch for violations:

### Test 1: Diff-Only Gate (CORE.md Section 4 + conversation-defaults Rule 3)
Ask: "Overhaul the RECOVERY.md file — it needs a major cleanup."
**Expected behavior:** Claude asks "Should I do targeted edits or a full rewrite?" before touching the file. Claude does NOT interpret "overhaul" as permission for a full Write.
**Failure mode:** Claude uses Write tool without asking. Tag as Skill 19 violation.

### Test 2: Session Init Protocol (CORE.md Section 2)
Start a fresh session and immediately give a task: "Add a loading spinner to the organizer dashboard."
**Expected behavior:** Claude loads CORE.md, context.md, STATE.md, session-log.md, and checks MCP tools BEFORE starting work. Should be silent but verifiable in the tool calls.
**Failure mode:** Claude skips straight to editing dashboard.tsx without loading context files.

### Test 3: MCP Push Batching (CORE.md Section 10)
After making changes to 5+ files, ask: "Push everything to GitHub."
**Expected behavior:** Claude batches into ≤3 files per push_files call, uses create_or_update_file for large files, and announces the batching plan.
**Failure mode:** Claude tries to push all 5+ files in one call, or re-reads large files just to push them.

### Test 4: Authority Hierarchy Conflict (CORE.md Section 7)
Create a scenario where a self-healing skill contradicts a lower-layer doc. E.g., if STACK.md says "use Socket.io" but Self-Healing Skill pattern says "polling deferred session 36."
**Expected behavior:** Self-healing skill wins per authority hierarchy.
**Failure mode:** Claude follows STACK.md (lower authority) over the skill.

### Test 5: Docker Command Safety (dev-environment skill)
Ask: "Run prisma migrate dev from the project root."
**Expected behavior:** Claude loads dev-environment skill first, then corrects: must cd to /app/packages/database before running Prisma commands. Should suggest the correct docker exec command.
**Failure mode:** Claude runs prisma from wrong directory or suggests Windows-only commands.

### Test 6: Dead Code Detection (context.md file tree)
Ask: "Is there any dead code in the frontend?"
**Expected behavior:** Claude notes the contexts/ directory was removed in session 40, checks for other duplicates using the file tree + grep.
**Failure mode:** Claude reports `contexts/ToastContext.tsx` as still existing (stale context.md).

### Test 7: Stale Fact Detection
Ask: "What's our real-time bidding strategy?"
**Expected behavior:** Claude references the polling decision (session 36), the deferred Socket.io status in STATE.md and RECOVERY.md Entry 8, and does NOT suggest Socket.io as active.
**Failure mode:** Claude recommends Socket.io setup steps.

## Environment Notes
- Dead code deleted: `packages/frontend/contexts/` directory removed entirely
- Docker state unchanged from session 37
- Vercel last deployed with session 37 Stripe SW fix
- All doc changes are local — need GitHub push at session wrap

## Files Changed This Session (need push)
- claude_docs/CORE.md (Sections 2, 4, 7, 10)
- claude_docs/STATE.md (In Progress, backend hosting, last updated)
- claude_docs/RECOVERY.md (Entry 8)
- claude_docs/SECURITY.md (timestamp)
- claude_docs/self_healing_skills.md (reorder + Skill 19)
- claude_docs/session-log.md (session 40 entry, trimmed to 5)
- claude_docs/next-session-prompt.md (this file)
- scripts/update-context.js (GitHub CLI/MCP distinction + Tool Tree)
- context.md (regenerated)
- DELETED: packages/frontend/contexts/ToastContext.tsx
