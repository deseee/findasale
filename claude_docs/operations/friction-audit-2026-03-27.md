# Daily Friction Audit — 2026-03-27

**AUTO-DISPATCH from daily-friction-audit**
Run: 2026-03-27 03:38 UTC (scheduled)
Session context: Post S303

---

## Summary

3 actionable findings. No TypeScript errors detected from file scan. No merge conflicts. STACK.md current (Railway PostgreSQL confirmed, fee structure locked). DECISIONS.md entries all from 2026-03-22 — within review window. State docs are fresh (S303, 2026-03-26) but not committed.

**P1 requires Patrick action before S304 starts.**

---

## P1 — S303 Wrap Docs Not Committed

**Category:** doc-staleness / state-sync
**Severity:** P1

`claude_docs/STATE.md` and `claude_docs/patrick-dashboard.md` are modified locally but NOT committed to GitHub. Last GitHub commit is `4f6daf7 S302 wrap`. S303 code changes (organizers.ts, edit-sale/[id].tsx) were pushed mid-session (per patrick-dashboard), but wrap documents were not staged. Any new session reading from GitHub will get S302-era state.

**Patrick action required before S304:**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale

git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md

git commit -m "chore(s303): session wrap — geocode + profile save fixes Chrome verified"

.\push.ps1
```

---

## P2 — Untracked Scheduled-Task Output Files Accumulating

**Category:** file-hygiene / doc-debt
**Severity:** P2

15+ untracked files have accumulated since yesterday from scheduled tasks and subagent sessions, none committed:

- `claude_docs/audits/` — 7 QA audit files from S288–S294 era
- `claude_docs/audits/weekly-audit-2026-03-26.md` — yesterday's weekly audit
- `claude_docs/audits/friction-audit-2026-03-26.md` — yesterday's friction audit (untracked, not pushed)
- `claude_docs/competitor-intel/intel-2026-03-26.md` — yesterday's competitor intel
- `claude_docs/marketing/content-pipeline/content-2026-03-26.md` — yesterday's content pipeline
- `claude_docs/human-QA-walkthrough-findings.md` — walkthrough findings, untracked
- `claude_docs/audits/roadmap-audit-S294.md`, `s290-qa-retroaudit-s285-s289.md` — stale audit artifacts
- `frontend-pages-inventory-S294.html` — stray file in **project root** (CLAUDE.md §10 hygiene violation)
- `claude_docs/skills-package/ziXF55C2` — temp artifact from skills packaging

These are research outputs and audit artifacts — low risk individually, but growing. Suggest adding to the next S304 push block alongside wrap docs.

**Suggested partial push block (non-destructive — add to Patrick's S303 push above):**
```powershell
git add claude_docs/audits/
git add claude_docs/human-QA-walkthrough-findings.md
git add claude_docs/competitor-intel/intel-2026-03-26.md
git add claude_docs/marketing/
```
Do NOT `git add` the stray root files (`frontend-pages-inventory-S294.html`, `ziXF55C2`) — surface to Patrick for deletion or filing.

---

## P2 — Pre-Beta Blockers Still Outstanding (Persistent, Multi-Session)

**Category:** operational / pre-launch risk
**Severity:** P2

These items have been flagged across multiple sessions and remain unresolved. Beta testers are live this week (per memory note, 2026-03-22 start):

| Item | Outstanding Since | Risk Level |
|------|------------------|------------|
| Attorney review — register.tsx consent copy (`LEGAL_COPY_PLACEHOLDER_*`) | S272 | **P0 — required before beta launch** |
| `MAILERLITE_SHOPPERS_GROUP_ID=182012431062533831` not set on Railway | S272+ | P1 — email signup broken for shoppers |
| `RESEND_API_KEY` + `RESEND_FROM_EMAIL` verify on Railway | S272+ | P1 — transactional email uncertain |
| Patrick manual test: #142 Photo Upload (drag photo → AI draft) | S300 | P2 — blocked on Patrick device |
| Patrick manual test: #143 Camera AI (mobile capture) | S300 | P2 — blocked on Patrick device |

The attorney review + MailerLite env var are blockers if real beta users are signing up. If beta is live, these should move to P0.

No subagent dispatch — all require Patrick action.

---

## No Findings (Clean)

- STATE.md: current, updated S303 (2026-03-26) — "Nothing in flight, S303 wrapped"
- STACK.md: current, Railway PostgreSQL confirmed, fee structure locked 2026-03-10
- DECISIONS.md: 10 decisions, all from 2026-03-22, none stale (< 3 months old)
- CLAUDE.md file references: all 8 referenced docs confirmed present
- Source TODOs: 13 found in packages/ — all have context, all are deferred/phase-gated, none owner-less. Existing pattern, not new regression.
- Merge conflicts: none
- Git log: clean commit history, no orphaned branches
- TypeScript: no scan run this session (would require tsc; deferred to subagent)
- Skills fleet: all expected custom skills present in `.claude/skills/`

---

## Next Audit

Scheduled: 2026-03-28 03:38 UTC
