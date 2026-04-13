---
name: findasale-push-coordinator
description: >
  ⚠️ ARCHIVED — S227 (2026-03-21). Push orchestration rules are now in root
  CLAUDE.md §5 (MCP Tool Awareness). Do NOT invoke this skill. Push logic is
  handled by the main session using mcp__github__push_files directly per
  CLAUDE.md §11 (Subagent Push Ban).
archived: true
archived_date: 2026-03-21
archived_session: S227
replaced_by: CLAUDE.md §5 + §11
---

> ⚠️ **ARCHIVED** — This skill was retired in Session 227 (2026-03-21).
>
> Push orchestration rules are consolidated in root **CLAUDE.md §5** and **§11**:
> - Max 3 files per MCP push, max 25k tokens combined
> - Truncation gate: verify file not >20% shorter than remote before pushing
> - Only the main session (not subagents) executes push_files calls
> - Bulk pushes (>3 files) → Patrick's `.\push.ps1` from PowerShell
>
> **Do not invoke this skill.** The main session handles push coordination directly.
>
> Triggers that previously fired this skill ("push these files", "coordinate the push",
> "batch push") are now handled inline by the main session.
>
> Source history preserved in git.
