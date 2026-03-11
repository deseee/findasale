# Self-Healing Skills — FindA.Sale

Recurring bugs and their confirmed fixes. Add an entry when a pattern has been seen ≥2 times or is structurally certain to recur.

---

## SH-001: MCP-pushed files never committed locally → Docker build failure

**Trigger:** Railway Docker build fails with TypeScript errors on files that look fine locally (e.g. "Unknown keyword or identifier", placeholder content on line 1).

**Environment:** Any session after MCP pushes via `mcp__github__push_files` or `create_or_update_file`.

**Pattern:** MCP pushes files directly to GitHub without touching the local working tree. Local working copies diverge from git HEAD. When Docker builds from the git repo, it uses the remote versions — which may be placeholders ("This file is too large…") or older commits.

**Steps:**
1. `git status` on the failing files — they will show as `modified` or `untracked`
2. `git diff --stat HEAD <files>` to confirm local vs committed divergence
3. Stage and commit the local versions: `git add <specific files> && git commit -m "..."`
4. Run `.\push.ps1` — handle any merge conflicts (remote placeholder stubs → keep HEAD)

**Edge Cases:** If push.ps1 warns about untracked files with `[saleId]` brackets, use `Remove-Item -LiteralPath "..."` (PowerShell treats `[` as wildcards in normal Remove-Item). Also: files MCP-pushed earlier in the same session will exist on remote as untracked local copies — delete them before merging so git doesn't abort.

**Confidence:** HIGH — seen sessions 128, 129, 137.

---

## SH-002: Merge conflict — remote has placeholder stub, local has full file

**Trigger:** After committing local controllers and pushing, git merge shows conflict on a controller file. Remote version has `"This file is too large. Pushing with mcp__github__create_or_update_file separately."` on line 1.

**Pattern:** MCP `push_files` has a token limit. When a file exceeded the limit, a prior agent left a stub placeholder on the remote. Local HEAD has the real file.

**Steps:**
1. `git checkout --ours <file>` to keep the local (full) version
2. `git add <file> && git commit` to complete the merge

**Confidence:** HIGH — seen sessions 129, 137.

---

## SH-003: Functions dropped from itemController during full-file merge

**Trigger:** Build error: `Module has no exported member 'analyzeItemTags'` (or addItemPhoto, removeItemPhoto, reorderItemPhotos).

**Pattern:** When itemController.ts is rewritten by an agent (session 136 Rapidfire work), functions from earlier sessions get dropped if the agent's context didn't include the full file. The routes file still imports them.

**Steps:**
1. `git log --oneline -10` to find last known-good commit
2. `git show <commit>:packages/backend/src/controllers/itemController.ts | grep -n "^export const"` to locate the missing functions
3. `git show <commit>:packages/backend/src/controllers/itemController.ts | sed -n '<start>,<end>p'` to extract them
4. Append the functions to the current itemController.ts before the new functions

**Confidence:** HIGH — seen sessions 128, 137.

---

## SH-004: fireWebhooks arity mismatch after agent rewrite

**Trigger:** `TS2554: Expected 3 arguments, but got 2` on a fireWebhooks call.

**Pattern:** Agent writes new fireWebhooks calls copying the 2-arg pattern from older code. webhookService.ts signature requires `(userId, event, data)`.

**Fix:** Always call `fireWebhooks(organizerUserId, 'event.name', { ...data })`. For bid events use `item.sale.organizer.userId`; for organizer-action events use `req.user.id`.

**Confidence:** MEDIUM — seen once (session 137), but structurally certain to recur on any agent rewrite touching webhooks.

---

## SH-005: PowerShell bracket glob — Remove-Item fails on [saleId] paths

**Trigger:** `Remove-Item packages/frontend/pages/organizer/add-items/[saleId]/review.tsx` silently does nothing (PowerShell treats `[saleId]` as a character class glob).

**Fix:** `Remove-Item -LiteralPath "packages/frontend/pages/organizer/add-items/[saleId]/review.tsx"`

**Confidence:** HIGH — seen session 137, PowerShell behavior is consistent.

---

## SH-006: skill-creator package_skill validation failure — non-standard frontmatter keys

**Trigger:** `❌ Validation failed: Unexpected key(s) in SKILL.md frontmatter: last_updated, version. Allowed properties are: allowed-tools, compatibility, description, license, metadata, name`

**Environment:** Any session packaging a skill with the skill-creator `package_skill` script.

**Pattern:** When drafting a SKILL.md for human review (e.g., via findasale-records), it's natural to add doc-style frontmatter like `version: 4` or `last_updated: 2026-03-11`. The packager only allows: `name`, `description`, `compatibility`, `allowed-tools`, `license`, `metadata`. Any other key fails validation.

**Known instance:** Session 139 — conversation-defaults v4 SKILL.md had `version: 4` and `last_updated: 2026-03-11 (Session 138)` in frontmatter.

**Steps:**
1. Open the SKILL.md being packaged
2. Remove any frontmatter keys that are not in the allowed set: `name`, `description`, `compatibility`, `allowed-tools`, `license`, `metadata`
3. Keep `version` and `last_updated` as prose inside the body of the skill if needed for reference
4. Re-run `python -m scripts.package_skill <path> <output-dir>` from the skill-creator directory

**Edge Cases:**
- The output directory must be writable — `/sessions/*` works, `/tmp` may have a stale read-only `.skill` file from a prior run that blocks overwrite; use a fresh subdirectory
- The `.skills/skills/` directory is read-only from the VM — always output to `/sessions/*/skill-output/` or the workspace folder

**Confidence:** HIGH — validator is deterministic; any non-standard frontmatter key will always fail.
