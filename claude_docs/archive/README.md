# Archive Index

Completed phase artifacts, dated health reports, one-time procedures, and historical audits. Files here are organized by type and date for historical context but are NOT active requirements.

## Structure

- **health-reports/** — Periodic system health scans and verification reports. Newest file = latest status. Contains dated scans (2026-03-XX.md format) and handoff reports from audit runs.
- **session-retrospectives/** — Session wrap summaries, workflow audits, fleet performance reviews. Named by session number or audit type (e.g., `session-84-wrap-analysis.md`, `opus-fleet-audit-2026-03-06.md`).
- **audit-reports/** — Feature audits, system audits (UX, QA, rebrand), stress tests, and verification reports. One-time or periodic completeness checks that document findings and fixes.
- **migration-and-procedures/** — Executed runbooks and specification docs that have already been deployed. Not currently active but kept for reference (e.g., `migration-runbook.md`).
- **protocol-drafts/** — Superseded or variant versions of operational protocols. Deprecated wrap protocol summaries and integration docs are stored here for historical reference.

## Retention Policy

Files are kept indefinitely for audit trail and historical context. If space becomes an issue:
- Files older than 6 months can be safely archived to cold storage (e.g., compressed backup)
- Never delete without at least 6 months notice or explicit approval
- Most-recent health reports are the authoritative status — older scans are reference only

## How to Search

- **Current system health:** Look in `health-reports/` for the most recent dated file (e.g., `2026-03-06.md`)
- **Session summaries:** Look in `session-retrospectives/` by session number or date
- **Completed audits:** Look in `audit-reports/` and filter by type (e.g., files starting with `ux-`, `beta-`, `ca4-ca6-`, `rebrand-`)
- **Historical procedures:** Look in `migration-and-procedures/` when referencing a past deployment

## Important Note

Do not treat files in this folder as active requirements or current best practices. They are historical records only. If you need current operational guidance, consult the active Tier 2 docs in their respective folders (operations/, strategy/, logs/).
