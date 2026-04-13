# File Naming & Structure Audit — Current State

*Created: 2026-03-09 (session 95, backlog E17). Tier 3 — archive after naming scheme designed.*

---

## Current File Count

Total .md files in claude_docs/: ~115 files across 12 directories.

---

## Naming Patterns Found

### Pattern 1: `topic-date.md` (most common, GOOD)
Examples: `competitive-analysis-2026-03-06.md`, `health-scout-pre-beta-2026-03-07.md`, `sprint-4-architecture-2026-03-07.md`
**Verdict:** Clear, sortable, traceable. Recommend as standard.

### Pattern 2: `UPPERCASE_NAME.md` (Tier 1 authority docs)
Examples: `CORE.md`, `STATE.md`, `STACK.md`, `SECURITY.md`, `RECOVERY.md`, `BUSINESS_PLAN.md`
**Verdict:** Good — immediately distinguishable as authority documents. Keep.

### Pattern 3: `MIXED_CASE_DESCRIPTION.md` (feature notes)
Examples: `BETA_INVITE_SYSTEM.md`, `PRICE_ALERTS_IMPLEMENTATION.md`, `SEO_IMPROVEMENTS_SUMMARY.md`
**Verdict:** Inconsistent with Pattern 1. These are Tier 3 artifacts from old phases. Should be in archive/ with dates.

### Pattern 4: `bare-name.md` (no date, not authority)
Examples: `organizer-guide.md`, `support-kb.md`, `incident-response.md`, `content-calendar.md`
**Verdict:** Acceptable for living documents that are updated over time (guides, calendars). But mixed in with dated one-time docs.

### Pattern 5: `date-only.md` (archive)
Examples: `2026-03-01.md`, `2026-03-02.md`, `2026-03-05.md`
**Verdict:** BAD. No topic indicator. Must open file to know what it contains.

---

## Folder Structure Assessment

### Well-organized:
- `archive/` — correct use of Tier 3 storage, has sub-folders
- `operations/` — growing but focused (ops docs, session management)
- `strategy/` — business plan, roadmap, pricing
- `research/` — all dated, all topical

### Needs cleanup:
- `beta-launch/` — 16 files, some are one-time artifacts (should move to archive after beta launches), some are living docs (organizer-outreach, marketing-calendar)
- `feature-notes/` — 11 files, mix of UPPERCASE old-phase artifacts and dated sprint docs. Old phase artifacts (BETA_INVITE_SYSTEM.md, etc.) should be in archive/
- `logs/` — contains non-log files (BETA_CHECKLIST.md, SEED_SUMMARY.md, WORKFLOW-SESSION-86-SUMMARY.md) that don't belong here
- `improvement-memos/` — fine as-is, all dated
- `health-reports/` — only 2 files in active dir (rest properly archived)

### Root-level files:
- `BACKLOG_2026-03-08.md` — should this live in root claude_docs/? It's a living task list, not an authority doc. Could argue for `strategy/` or `operations/`.
- `SESSION_WRAP_PROTOCOL.md` + `WRAP_PROTOCOL_QUICK_REFERENCE.md` — duplicative names. Consider consolidating or moving to `operations/`.

---

## Recommended Naming Convention (for Session 98.5 design)

**Standard format:** `{topic}-{date}.md` for one-time artifacts, `{topic}.md` for living docs.
**Authority docs:** `UPPERCASE.md` (CORE, STATE, STACK, SECURITY, RECOVERY only).
**Date format:** `YYYY-MM-DD` always.
**No date-only filenames.** Always include topic.

---

## Immediate Cleanup Candidates (low-effort, high-impact)

1. Move `logs/BETA_CHECKLIST.md` → `beta-launch/BETA_CHECKLIST.md`
2. Move `logs/SEED_SUMMARY.md` → `archive/SEED_SUMMARY.md`
3. Move `logs/WORKFLOW-SESSION-86-SUMMARY.md` → `archive/session-retrospectives/`
4. Move old feature-notes without dates to `archive/feature-notes/`

**Note:** These moves require Patrick's push. Flag at session wrap.
