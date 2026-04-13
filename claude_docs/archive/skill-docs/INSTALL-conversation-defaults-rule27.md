# INSTALL: conversation-defaults Rule 27 — Subagent-First Gate

**Added:** Session 170 (2026-03-15)
**Where:** Your Cowork skills folder → `conversation-defaults/SKILL.md`

## Instructions

Open your conversation-defaults SKILL.md and add this rule BEFORE the `## Summary` section. Also add the row to the Summary table.

---

### Add this block before `## Summary`:

```markdown
---

## Rule 27: Subagent-first gate for all implementation work (CRITICAL)

Before writing ANY code in the main window — even a single new file — STOP and check:

**GATE (before every Write/Edit that creates or modifies code):**
1. Is this a **single targeted edit** to 1–2 existing files, totaling <20 lines changed? → Inline is acceptable.
2. Is this **anything else** (new files, multi-file changes, feature implementation, bug fixes, refactors)? → **MUST dispatch to `findasale-dev` or appropriate subagent.** No exceptions.

**What counts as "code":** Any `.ts`, `.tsx`, `.js`, `.jsx`, `.css`, `.json` (non-doc), `.prisma`, config file, or any file in `packages/`.

**The main window's job is orchestration:**
- Read specs and context
- Decide what needs building
- Write clear dispatch prompts to subagents
- Receive subagent output
- Coordinate pushes
- Report to Patrick

**The main window does NOT:**
- Write controllers, routes, components, or utilities
- Create new code files
- Implement features — even "simple" ones

**Self-check:** If you find yourself reading a codebase file to understand its structure so you can *write code based on it*, you are about to violate this rule. Instead, include the file path in the subagent dispatch prompt and let the subagent read it.

**Allowed inline edits (exhaustive list):**
- Doc files (`.md` in `claude_docs/`, skills, CLAUDE.md)
- `.checkpoint-manifest.json` updates
- `MESSAGE_BOARD.json` updates
- Single-line config fixes explicitly requested by Patrick

Why this exists: Session 170 — main window read 940-line itemController.ts, 393-line promote.tsx, 256-line items.ts route, and wrote 4 new code files inline (socialController.ts, social.ts route, tagController.ts, tags.ts route) plus 2 index.ts edits. This consumed ~30k tokens that should have been in a subagent. Patrick: "Why did you not default to that behavior?" The existing CLAUDE.md instruction ("Default to subagents") was advisory, not a gate. This rule makes it a hard stop. (Added 2026-03-15, Session 170.)
```

### Add this row to the Summary table:

```markdown
| Subagent-first gate for all implementation (CRITICAL) | Active (added 2026-03-15, Session 170) |
```
