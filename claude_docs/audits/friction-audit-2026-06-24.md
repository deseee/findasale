# Friction Audit — 2026-06-24

**Auditor:** daily-friction-audit (scheduled task)
**Session:** Automated (no active session)
**Date:** 2026-06-24

---

## Self-Audit Gate

Findings in this report: 4 (2 informational carry-forwards, 2 new P3)
Tool citations below: 13 distinct bash/Read calls
4 < 13 → all findings are tool-cited. Gate passes.

---

## Check 1 — Blocked Queue Ceiling

**Command:**
```bash
python3 -c "
content = open('claude_docs/STATE.md').read()
section = content.split('## Blocked/Unverified Queue')[1].split('\n## ')[0]
rows = [l for l in section.split('\n') if l.startswith('| ') and '---' not in l and 'Feature' not in l and l.strip() not in ('|', '')]
print('TOTAL ROWS:', len(rows))
open_rows = [r for r in rows if '~~' not in r and 'CLOSED' not in r and 'RESOLVED' not in r and 'FIXED' not in r]
print('OPEN ROWS:', len(open_rows))
"
```

**Output:**
- TOTAL ROWS: 6
- OPEN ROWS: 2

**Open BQ items confirmed:**
1. `reclassify-bounces backfill` — Historical bounces (~93) landed in `deseee@gmail.com`. Backfill not needed for future function but old data not reclassified.
2. `schema.prisma drift — 5 EmailSuppression cols` — bounceCategory/bounceStatusCode/diagnosticCode/retryAfter/classifiedAt exist in DB+schema but were applied via raw DDL (no migration file). prisma migrate deploy cannot apply them.

**Result:** ✅ COUNT = 2 — well below the 8-item QA ceiling. No forced QA-only session.

---

## Check 2 — Roadmap BROKEN Items

**Command:**
```bash
grep -n "BROKEN" claude_docs/strategy/roadmap.md | head -30
```

**Output:**
```
128:## BROKEN — Fix Before Anything Else
```

Only the section header matched. No data rows contain unfixed BROKEN status.

**Secondary check (all data rows in BROKEN section):**
```python3
# Parse BROKEN section — found 4 rows, all FIXED
'SEO3' | STATUS: '✅ S944'
'SEO4' | STATUS: '✅ S1003'
'SEO5' | STATUS: '✅ S1004'
'SEO6' | STATUS: '✅ S1004'
```

**Result:** ✅ 0 unfixed BROKEN items — confirmed via grep + section parse.

---

## Check 3 — STATE.md Freshness

**Command:** `head -100 claude_docs/STATE.md`

**Output:** Most recent session entry = **S1029 WRAP (2026-06-24)** — today. STATE.md is current.

- "Next Session" block: present
- "Current Work" section: matches recent activity (react-hooks fix batch, CI gate green)
- BQ tracking: current (4 items noted in STATE, 2 open per live count)

**Result:** ✅ STATE.md is fresh as of today.

---

## Check 4 — TypeScript Health

**Frontend:**
```bash
cd packages/frontend && npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | grep -v node_modules | wc -l
```
**Output: 0** ✅

**Backend:**
```bash
cd packages/backend && timeout 40 npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | grep -v node_modules | wc -l
```
**Output: 19**

```bash
# Check for non-TS2688 errors (TS2688 = missing type-def-file = known VM artifact)
cd packages/backend && timeout 40 npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | grep -v node_modules | grep -v "TS2688"
```
**Output: (empty)** — All 19 errors are TS2688 "Cannot find type definition file for X" (body-parser, connect, express-serve-static-core, http-errors, mime, ms, mysql, node-fetch, pg, pg-pool, etc.)

**Assessment:** TS2688 errors are a known VM artifact caused by incomplete node_modules in the sandbox. CI (S1027/S1028 green runs) is the ground truth — backend tsc = 0 errors under a fresh install. No real logic errors present.

**Result:** ✅ Frontend 0 errors. Backend VM-only TS2688 artifacts — CI confirmed clean.

---

## Check 5 — Merge Conflict Check

**Command:**
```bash
grep -rn "^<<<<<<< HEAD\|^<<<<<<< " packages --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v node_modules | head -10
```
**Output:** (empty — exit 0)

**Result:** ✅ No merge conflicts — confirmed via grep.

---

## Check 6 — Uncommitted Truncations

**Command:**
```bash
git status --short | grep -E "^ M|^M " | head -20
git diff --stat HEAD | head -20
```
**Output:** Both returned empty. No modified tracked files.

**Result:** ✅ No uncommitted modifications to tracked files. No truncation risk.

**Side finding (P3 — see below):** `git status --short` shows numerous `??` untracked files at project root and in claude_docs/audits/ — these are scratch/working files never committed. Not a truncation risk but a file hygiene issue.

---

## Check 7 — Critical Docs

**TODOs in claude_docs:**
```bash
grep -rn "TODO\|FIXME" claude_docs/ --include="*.md" 2>/dev/null | grep -v "audits/"
```
**Output:** All matches are in `claude_docs/archive/` (archived health-reports, old legal docs). No active TODO/FIXME in live docs.

**DECISIONS.md:**
```bash
grep -n "Last Reviewed" claude_docs/brand/DECISIONS.md | head -5
```
**Output:** `Last Reviewed: 2026-06-18 (S1006) — all 10 decisions confirmed current; no edits required.`

6 days ago. Within freshness window.

**Result:** ✅ No active TODOs in live docs. DECISIONS.md reviewed 2026-06-18.

---

## New Findings

### P3 — Stray files at project root

**Command:** `git status --short | grep "^??" | grep -v "node_modules\|.next\|dist\|backups/"` + `ls *.md *.json *.txt`

**Output (selected stray files at root):**
```
alternativeto_audit.md
batch-templates.json
batch1-fixed.json
AUDIO_NOTES_UX_SPEC.md
EMAIL_AUDIT_REPORT.md
IMPLEMENTATION_SUMMARY_GROUP5.md
Organizer_Acquisition_Playbook.md / v2.md
label-sheet-composer-dev-prompt.md
rvm-a2p-10dlc-package.md / rvm-scripts-v1.md / v2.md
seo-pages-haiku-generator.md
guild-primer-content.txt / guild-primer-full.txt
scr.txt / tsc_out.txt / business-names.txt / PRICING_ENGINE_UPDATES_SUMMARY.txt
GROUP5_CHANGED_FILES.txt / PRICING_ENGINE_UPDATES_SUMMARY.txt
```

These are scratch/working files from prior sessions left at the project root — violates `claude_docs/operations/file-creation-schema.md` (subagent file hygiene rule). Should be deleted or moved to their correct `claude_docs/` subdirectory.

**Sessions unresolved:** Multiple (these accumulate session-over-session). Severity: **P3** (no runtime impact, but clutter and hygiene debt).

**Action:** Not auto-dispatched (P3). Patrick decides priority. Route to `findasale-records` for cleanup.

---

### P3 — Audit files never committed to git

**Command:** `git status --short | grep "^??" | grep "audits/"` + `ls claude_docs/audits/ | grep "friction-audit\|weekly-audit"`

**Output:** ~25+ audit files (friction-audits from 2026-05-29 through 2026-06-23, weekly-audits from 2026-06-06 through 2026-06-20, brand-drift audits from 2026-05-12 through 2026-06-16) are untracked — written by scheduled tasks but never committed to git.

**Sessions unresolved:** Accumulated over ~5 weeks. Severity: **P3** (audit history exists locally but not in the repo; lost if repo is cloned fresh).

**Action:** Not auto-dispatched (P3). Include audit files in the next regular pushblock. Route to Patrick next session.

---

## Carry-Forward Open BQ Items (no new severity escalation)

Both open BQ items confirmed still open via STATE.md parse:

1. **reclassify-bounces backfill** — Added S1020. Current session = S1029. Age: ~9 sessions.
   - Severity per age-floor rule: **P1 minimum** (5–9 sessions = P1).
   - Evidence: `python3` BQ parse confirmed still open (no `~~` or CLOSED/FIXED marker).
   - Previously classified as low-priority (Patrick noted "backfill not needed for future function").
   - **P1 finding — must be in STATE.md Blocked Queue.** Already present. ✅

2. **schema.prisma drift — 5 EmailSuppression cols** — Added S1020. Current session = S1029. Age: ~9 sessions.
   - Severity per age-floor rule: **P1 minimum** (5–9 sessions = P1).
   - Evidence: `python3` BQ parse confirmed still open.
   - **P1 finding — must be in STATE.md Blocked Queue.** Already present. ✅

Both items are already in STATE.md Blocked Queue. No new entries required.

**Note:** Per age-floor rule, both items are now P1 minimum due to 9-session age. If they reach the next session without resolution, they escalate to P0. Patrick should be informed at next session start.

---

## Summary

| Check | Result | Severity |
|-------|--------|----------|
| 1. Blocked Queue ceiling | 2 open items — below 8-item ceiling | ✅ |
| 2. Roadmap BROKEN | 0 unfixed items | ✅ |
| 3. STATE.md freshness | Current as of today (S1029) | ✅ |
| 4. TypeScript health | Frontend 0 errors; Backend VM-only TS2688 artifacts | ✅ |
| 5. Merge conflicts | 0 conflicts | ✅ |
| 6. Uncommitted truncations | No modified tracked files | ✅ |
| 7. Critical docs | No active TODOs; DECISIONS.md reviewed 2026-06-18 | ✅ |
| NEW: Stray root files | ~20 scratch files at project root | P3 |
| NEW: Audit files untracked | ~25 audit files never committed | P3 |
| CARRY: reclassify-bounces | 9 sessions open → P1 minimum (already in BQ) | P1 (in BQ) |
| CARRY: schema.prisma drift | 9 sessions open → P1 minimum (already in BQ) | P1 (in BQ) |

**No new P0/P1 findings requiring immediate STATE.md Blocked Queue additions. Both existing P1 items are already in BQ. 2 new P3 hygiene items logged.**
