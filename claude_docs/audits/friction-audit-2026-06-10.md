# Daily Friction Audit — 2026-06-10

**Run:** Automated (scheduled task, 03:38 UTC)
**Session context:** S938 most recent (2026-06-10). BQ=0 at audit time.

---

## Check 1 — Blocked Queue Ceiling

```
python3 -c "
content = open('.../claude_docs/STATE.md').read()
section = content.split('## Blocked Queue')[1].split('\n## ')[0] if '## Blocked Queue' in content else ''
rows = [l for l in section.split('\n') if l.startswith('| ') and '---' not in l and 'Feature' not in l and l.strip() not in ('|', '')]
print(len(rows))
" → 0
```

**Result: 0 rows. DEV mode available. No ceiling trigger.** ✅ Clean.

---

## Check 2 — Roadmap BROKEN Items

```
grep -n "BROKEN" claude_docs/strategy/roadmap.md | head -30
→ 128:## BROKEN — Fix Before Anything Else
```

Only the section header matched. All rows within the BROKEN section carry "FIXED S[N]" status (confirmed by reading lines 128–200). Zero actively-unfixed items in the BROKEN section.

**Result: 0 unresolved BROKEN items.** ✅ Clean.

---

## Check 3 — STATE.md Freshness

```
head -80 claude_docs/STATE.md
→ Most recent: S938 — DEV/OPS (2026-06-10). BQ=0.
```

STATE.md is current. Most recent session entry is today (S938). "## Next Session" block present with detailed Patrick action list and S939 recommendations. "## Current Work" accurately reflects S938 wrap state.

**Minor finding → P3 (see F-001 below):** The section `## S913 Noted Findings (raised this session — not yet actioned)` at line 97 is stale — it was written in S913 (2026-06-07, 3 days ago). Its header says "not yet actioned" but the items within are either RESOLVED (P2 SPOF → S918, P3 /health → S915, P1 REFRESH_TOKEN → superseded S918) or deferred-by-design (P3 OUTREACH_ENABLED conflation). This section should be cleaned up at next WRAP to avoid future confusion. Not urgent — all items resolved or superseded.

**Result: STATE.md current.** ✅ Clean (P3 doc hygiene noted as F-001).

---

## Check 4 — TypeScript Health

```
cd packages/frontend && npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | grep -v node_modules | wc -l
→ 0

cd packages/backend && npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | grep -v node_modules | wc -l
→ 0
```

**Result: 0 TS errors in frontend and backend.** ✅ Clean.

---

## Check 5 — Merge Conflict Check

```
grep -rn "^<<<<<<< " packages --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v node_modules | head -10
→ (no output)
```

**Result: No merge conflicts.** ✅ Clean.

---

## Check 6 — Uncommitted Changes

```
git status --short | grep -E "^ M|^M " → 2 files:
  M claude_docs/STATE.md
  M packages/backend/src/services/scraper/sources/search-facebook-events.ts

git diff --stat HEAD →
  claude_docs/STATE.md                                         |   2 +
  .../scraper/sources/search-facebook-events.ts                | 218 +++++++++++++--------
  2 files changed, 142 insertions(+), 78 deletions(-)

wc -l search-facebook-events.ts → 632 (HEAD was 570 at a3dee469)
git log --oneline -1 -- search-facebook-events.ts → a3dee469 scrapers: widen FB Events query (auctions+flea)...
```

**`claude_docs/STATE.md`:** +2 lines vs HEAD. Expected normal activity. Not flagged.

**`search-facebook-events.ts`:** 632 lines in working tree vs 570 at HEAD. Diff review confirms two meaningful bug fixes not yet committed:

1. `extractFbEventId()` — Old logic grabbed the first `\d+` after `/events/` which returned street-number false-IDs for venue-slug URLs (e.g., `.../events/4900-six-fla...` → wrongly returned `4900`). New logic scans for the LAST run of 8+ consecutive digits, which is always the real Facebook event ID.
2. `inferSaleType()` — Added `typeHint?: string` parameter so flea-market results from the flea/swap sub-query classify correctly even when the event title omits the literal word "flea" (e.g., "Spring Swap Meet").

This is **F-002 (P2)**: the scraper event-ID corruption bug remains active in production until this is pushed. The weekly FB Events cron (Monday 03:00 UTC) runs against HEAD. If it fires before these changes are committed and pushed, dedup will continue mis-filing venue-slug events as wrong IDs.

The Next Session block in STATE.md explicitly lists: *"S934 pushblock (search-facebook-events.ts + googlePlaces.ts + feature-notes + wrap docs) — if not yet pushed."* This confirms the change is intentional and awaiting Patrick's push.

**This change has been in the working tree since at least S934 (2026-06-09) — 1+ day. Next weekly cron: Monday 2026-06-15. Push is needed before then.**

---

## Check 7 — Critical Docs

```
grep -rn "TODO|FIXME" claude_docs/ --include="*.md" | grep -v "/archive/" | grep -v node_modules | head -10
→ Only references in historical audit files (friction-audit-2026-05-12.md, friction-audit-2026-05-05.md)
  — all in past audit bodies, not live action items
```

```
grep -n "^##|Date:|date:" claude_docs/brand/DECISIONS.md | head -40
→ D-001 through D-010 present; no date fields (by design — DECISIONS.md format omits dates)
```

No actionable TODOs in live docs. DECISIONS.md entries are intact and consistent. ✅ Clean.

---

## Findings Summary

| ID | Severity | Finding | Tool Evidence | Sessions Unresolved | BQ Entry |
|----|----------|---------|---------------|---------------------|----------|
| F-001 | P3 | S913 Noted Findings section stale in STATE.md — items resolved/superseded but header still says "not yet actioned" | `grep -n "S913 Noted Findings" STATE.md → line 97` | 1 session (S913→S938) | Not required (P3) |
| F-002 | P2 | `search-facebook-events.ts` has uncommitted bug fixes (extractFbEventId + inferSaleType) pending since S934 (2026-06-09). Weekly scraper cron fires Monday. | `git status → M search-facebook-events.ts`; `wc -l → 632 vs 570 HEAD`; `git log → a3dee469 as last commit` | 1 session (S934→now) | Not required (P2) |

**Self-audit gate:** 2 findings, 8+ distinct tool citations (python3, grep×3, head, tsc×2, git status, git diff, git log, wc -l). Findings ≤ tool citations. ✅ Passes.

---

## Auto-Dispatch Blocks

### F-001 (P3) — STATE.md S913 section cleanup
Handle at next WRAP session. At session wrap, delete the `## S913 Noted Findings` section from STATE.md (all items resolved/superseded as of S918/S915). Include STATE.md in the push block. *AUTO-DISPATCH from daily-friction-audit. Tag: WRAP.*

### F-002 (P2) — Push search-facebook-events.ts before Monday cron
Patrick action needed. Include this file in the next push block:

```
git add packages/backend/src/services/scraper/sources/search-facebook-events.ts
git commit -m "fix(scraper): FB Events extractFbEventId venue-slug false-ID + inferSaleType flea typeHint"
.\push.ps1
```

The change fixes event-ID corruption from venue-slug URLs and improves flea-market classification via sub-query type hints. No schema change. TS: 0 errors (no backend TS check needed — pure JS logic). *AUTO-DISPATCH from daily-friction-audit. Tag: PENDING-PUSH.*

---

## All Checks Summary

| Check | Result |
|-------|--------|
| Blocked Queue (0 = clean, ≥8 = P0) | ✅ 0 rows — DEV available |
| BROKEN items in roadmap | ✅ 0 unresolved |
| STATE.md freshness | ✅ S938 current (today) |
| TypeScript frontend | ✅ 0 errors |
| TypeScript backend | ✅ 0 errors |
| Merge conflicts | ✅ None |
| Uncommitted truncations | ⚠️ F-002 (P2 — intentional pending push) |
| Critical docs / TODOs | ✅ Clean |
