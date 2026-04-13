# File Creation Schema — Naming, Folder, & Enforcement Rules

Created: Session 96 (2026-03-09)
Updated: Session 144 (2026-03-11) — hard gates, locked directory structure, archive vault
Status: **ENFORCED** (conversation-defaults Rules 7, 20, 21)
Backlog ref: E17
Advisory board: Approved unanimously, Meeting #1

---

## Naming Conventions

### Authority Documents (Tier 1)

Format: `UPPERCASE_NAME.md`
Location: `claude_docs/` root
Allowed: `CORE.md`, `STATE.md`, `STACK.md`, `SECURITY.md`, `RECOVERY.md`

Adding a new Tier 1 doc requires Patrick's explicit approval.

### Session Infrastructure (Tier 1.5)

Format: `kebab-case.md` or `kebab-case.json`
Location: `claude_docs/` root
Allowed: `decisions-log.md`, `escalation-log.md`, `.last-wrap`

**DEPRECATED (S264):** `session-log.md` and `next-session-prompt.md` are no longer separate files. Their content now lives in STATE.md under "## Recent Sessions" and "## Next Session" sections respectively. Agents must NOT create these files.

These are high-frequency files loaded every session. They live at root for fast access.
No other files may be added to this tier without Patrick's approval.

### Living Documents (Tier 2)

Format: `kebab-case-topic.md`
Location: Appropriate subdirectory of `claude_docs/` (see Locked Folder Map)

No date suffix — updated over time. Must go in an existing approved directory.

### One-Time Artifacts (Tier 3)

Format: `kebab-case-topic-YYYY-MM-DD.md`
Location: Working directory during creation → `claude_docs/archive/` on completion

Always include date. **Must be archived on completion.** No orphaned artifacts.

### Operations Documents

Format: `kebab-case-topic.md`
Location: `claude_docs/operations/`

Living process docs — no date unless one-time.

### Research Documents

Format: `backlog-id-topic.md`
Location: `claude_docs/research/`

Include backlog ID prefix for traceability (e.g., `e2-`, `g5-`).

---

## Locked Folder Map

**HARD RULE: No new directories may be created in `claude_docs/` without Patrick's explicit approval.** If a file doesn't fit an existing directory, it goes in the most appropriate existing one — or the question gets escalated to Patrick.

```
claude_docs/
├── [ROOT]                  Tier 1 + Tier 1.5 ONLY. Nothing else.
│   ├── CORE.md
│   ├── STATE.md             (contains "## Recent Sessions" + "## Next Session" sections)
│   ├── STACK.md
│   ├── SECURITY.md
│   ├── RECOVERY.md
│   ├── patrick-dashboard.md
│   ├── decisions-log.md
│   ├── escalation-log.md
│   └── .last-wrap
│   │
│   ├── [DEPRECATED] session-log.md (content moved to STATE.md § Recent Sessions)
│   ├── [DEPRECATED] next-session-prompt.md (content moved to STATE.md § Next Session)
│
├── archive/                RECORDS-ONLY. See Archive Vault below.
│   └── archive-index.json  (manifest — all agents may READ, only Records may WRITE)
│
├── beta-launch/            Beta preparation docs
├── brand/                  Brand assets, guidelines
├── competitor-intel/       Competitive research
├── feature-notes/          Active sprint/feature docs
├── guides/                 User-facing and internal guides
├── health-reports/         Active/latest scan ONLY — archive old ones
├── logs/                   session-log legacy + scheduled-task-log.md ONLY
├── operations/             Process docs, protocols, tools, JSON configs
├── research/               Investigation reports (backlog ID prefix required)
├── self-healing/           Self-healing skills file
├── skills-package/         Skill documentation and SKILL.md directories
├── architecture/           Architecture decision records (ADRs)
├── audits/                 QA audit reports, Chrome audits, live app audits
├── feature-decisions/      Product decision records for specific features
├── strategy/               Roadmap, business plan, pricing
├── ux-spotchecks/          UX audit snapshots and spot-check reports
└── workflow-retrospectives/ Session efficiency analyses
```

**Directories re-approved (session 234, 2026-03-22):** `architecture/`, `audits/`, `feature-decisions/`, `ux-spotchecks/` permanently added to the locked folder map. These directories kept being recreated organically across sessions — approving them stops the recurring violation. Rationale: `architecture/` holds ADRs (18 files, core engineering artifact), `audits/` holds QA/Chrome/live-app audit reports (20 files, actively referenced), `feature-decisions/` holds per-feature decision records (7 files, distinct from feature-notes/), `ux-spotchecks/` holds UX audit snapshots (5 files, distinct from health-reports/).

**Note on other flagged dirs:** `legal/`, `marketing/`, `improvement-memos/`, `testing-guides/` — contents should be routed to `operations/`, `brand/`, or `guides/` respectively. These are NOT approved as permanent directories; Records should consolidate on next audit pass.

**Directories removed (session 144):** `qa/`, `security/`, `session-wraps/`, `operations/context-audit/`. All contents archived.

---

## Archive Vault

`claude_docs/archive/` is a **Records-only zone**.

**Read access:** All agents may read `archive/archive-index.json` to check if a document exists.
**Write access:** Only `findasale-records` may add, move, or remove files in `archive/`.
**Retrieval:** Any agent needing an archived document must request it through `findasale-records`. Records retrieves the file and passes relevant content in a handoff block.

### archive-index.json Schema

Each entry: `{ file, topic, archivedFrom, originSession, dateArchived, summary }`

Records updates the index whenever a file is archived or retrieved.

### Archive Subdirectories

Subdirectories within `archive/` are allowed and encouraged for organization (e.g., `archive/audits/`, `archive/marketing/`). These do NOT require Patrick approval since they're within the vault.

---

## Temp/Scratch File Rules

**HARD RULE: Zero tolerance for temp files in `claude_docs/`.**

All scratch, temp, draft, and working files must be written to:
- `/sessions/[session-id]/` (the VM working directory) for throwaway work
- The appropriate `claude_docs/` subdirectory if the file is a keeper

Banned patterns anywhere in `claude_docs/`:
- `*.tmp`
- `*.bak`
- `*.backup`
- `test.*`
- Random-named files (e.g., `zikpWboU`)
- `*-proposed.*` (working drafts — keep in VM working dir until finalized)

---

## Directory File Count Guidance

Soft limits to prevent directory bloat. When exceeded, Records archives oldest non-active files.

| Directory | Soft cap | Action when exceeded |
|-----------|----------|---------------------|
| operations/ | 20 files | Archive completed process docs |
| research/ | 15 files | Archive completed research |
| health-reports/ | 5 files | Archive all but latest |
| feature-notes/ | 10 files | Archive completed features |
| competitor-intel/ | 10 files | Archive outdated intel |
| workflow-retrospectives/ | 5 files | Archive all but latest 3 |

---

## Enforcement Rules

1. **No files in `claude_docs/` root** except Tier 1 and Tier 1.5 (listed above).
2. **No new directories** without Patrick's explicit approval.
3. **No temp/scratch files** in `claude_docs/` — ever.
4. **No date-only filenames.** Always include topic.
5. **Research docs always prefixed with backlog ID.**
6. **Archive on completion.** Dispatch Records to move and index.
7. **Validate path before writing.** conversation-defaults Rule 7.
8. **Temp files go to VM working dir.** conversation-defaults Rule 20.
9. **Directory creation blocked.** conversation-defaults Rule 21.
10. **Session-wrap scan catches violations.** Any file that violates this schema at wrap time gets flagged and routed to Records for correction.
