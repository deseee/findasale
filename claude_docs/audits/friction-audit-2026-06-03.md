# Daily Friction Audit — 2026-06-03

**Run type:** Automated (daily-friction-audit scheduled task, 3:38 AM)
**Scope:** Blocked Queue, roadmap BROKEN items, STATE.md freshness, TypeScript health, merge conflicts, uncommitted changes/truncations, critical docs

---

## Summary

**1 P1 TRUNCATION FOUND AND FIXED** — `unsubscribe.tsx` restored from HEAD.
**1 P2 — Stale git index.lock** in repo root (created during this audit's failed git checkout). Push.ps1 self-heals, but Patrick should be aware.
**4 P0 carry-forward age-escalations** — Patrick-only actions pending 67–132 sessions; age floor mandates P0. Added to Blocked Queue this session.
**All code health checks clean** — 0 TS errors (both packages), 0 merge conflicts, Blocked Queue at 6 (below ≥8 QA ceiling).

---

## ✅ Clean Checks

| Check | Command | Result |
|-------|---------|--------|
| Blocked Queue ceiling | `python3 -c "... split/count rows ..."` | **6 rows** — below ≥8 QA ceiling. DEV mode permitted. |
| Roadmap BROKEN items | `grep -n "BROKEN" roadmap.md` | **0 active BROKEN items.** Section header exists but all entries show FIXED status. Confirmed via grep — 1 occurrence total (section header only). |
| STATE.md freshness | `head -100 STATE.md` | Current — latest entry is S854 (most recent session). Next Session block populated. |
| Frontend TypeScript | `cd packages/frontend && npx tsc --noEmit --skipLibCheck 2>&1 \| grep "error TS" \| grep -v node_modules \| wc -l` | **0 errors** |
| Backend TypeScript | `cd packages/backend && npx tsc --noEmit --skipLibCheck 2>&1 \| grep "error TS" \| grep -v node_modules \| wc -l` | **0 errors** |
| Merge conflicts | `grep -rn "^<<<<<<< " packages/ --include="*.ts" --include="*.tsx"` | **0 conflicts** |
| DECISIONS.md age | `grep -n "Last Updated" claude_docs/brand/DECISIONS.md` | Oldest entries: 2026-03-22 (~10 weeks). Within 3-month threshold. No stale decisions. |
| TODOs in claude_docs | `grep -rn "TODO\|FIXME" claude_docs/ --include="*.md"` | All matches in `/archive/` only — no actionable TODOs in live docs. |

---

## 🔴 P1 — FIXED: `unsubscribe.tsx` Truncated

**Severity:** P1 (build-breaking if pushed)
**Status:** ✅ AUTO-FIXED this audit session
**Evidence:** `git diff --stat HEAD` showed `packages/frontend/pages/unsubscribe.tsx` at 60 lines local vs 71 lines on HEAD. `tail -20` confirmed file ended mid-JSX inside the error state `<div>` — missing closing tags, `<p>` error message, `</div></div></></>`, and `export default UnsubscribePage`.

**Root cause:** Edit-tool truncation (prior session subagent edit cut file at line 60). Documented failure mode per `feedback_edit_tool_truncation.md`.

**Fix applied:** File rewritten via Python from `git show HEAD:packages/frontend/pages/unsubscribe.tsx`. Post-fix verification: `wc -l` = 71 lines, `tail -8` shows `export default UnsubscribePage`, `npx tsc --noEmit` = 0 errors.

**Push required:** `unsubscribe.tsx` fix must be included in next push block. File is currently unstaged locally — Patrick must `git add packages/frontend/pages/unsubscribe.tsx`.

**Added to Blocked Queue:** No — fix is complete. Requires push only.

---

## 🟡 P2 — Stale git `index.lock` in Repo Root

**Severity:** P2
**Status:** Cannot remove from VM (Operation not permitted on mounted FS)
**Evidence:** `ls -la .git/index.lock` → 0-byte file, created 2026-06-03 07:41 (during this audit session's failed `git checkout` call). `rm -f .git/index.lock` → `Operation not permitted`.

**Impact:** `git checkout` and `git add` fail with "Another git process seems to be running." The `.\push.ps1` script self-heals index.lock per CLAUDE.md §5, so Patrick's next push run should clear it automatically. However any manual `git add` from Patrick before running push.ps1 will fail.

**Patrick action:** If `git add` fails, run `.\push.ps1` first (it clears the lock). Or manually delete `C:\Users\desee\ClaudeProjects\FindaSale\.git\index.lock`.

---

## 🔴 P0 Carry-Forward Age Escalations (Patrick-Only Actions)

Per CLAUDE.md §10a age floor: findings unresolved 10+ sessions → minimum P0 regardless of prior classification. These were rated P2 in prior audits. Age mandates escalation. All four added to STATE.md Blocked Queue this session.

### P0-A: Email Verification Migration Undeployed (132 sessions unresolved)
**First flagged:** S722 (migration `20260515180000` created S726)
**Evidence:** `ls packages/database/prisma/migrations/ | grep 20260515180000` confirms migration file exists. No `prisma migrate deploy` in S727–S854 session summaries in STATE.md.
**Risk:** Email verification token expiry is live in code but not enforced in production DB schema. Token expiry may not be enforced.
**What's needed:** Patrick runs `prisma migrate deploy` with Railway DATABASE_URL.

### P0-B: Production DB Re-Seed (67 sessions unresolved)
**First flagged:** S787
**Evidence:** Prior audits confirm Seedy2025! password rejected for shopper test accounts (user5–user12+) since S576. STATE.md S854 session mentions psycopg2 workarounds for DB operations.
**Risk:** Shopper Chrome QA requiring normal login remains blocked. Affects #266, #184, #261, and any future shopper-flow QA.
**What's needed:** Patrick runs `npx prisma db seed` with Railway DATABASE_URL (after backing up test sale cmpbvumj90001e7t7v5sa1iqi).

### P0-C: eBay Connection for user1 (69 sessions unresolved)
**First flagged:** S785
**Evidence:** STATE.md Blocked Queue shows #332 Shopify (P0, 58 sessions) blocked for same reason — no test eBay/OAuth connection available. June 1 audit confirmed eBay connection absent for organizer QA accounts.
**Risk:** #293 (eBay Listing Data Parity), #298 (eBay Advanced Setup), and any eBay end-to-end push QA remain UNVERIFIED.
**What's needed:** Patrick connects eBay to user1 via `/organizer/settings/ebay` OAuth, or inserts EbayConnection row in Railway DB via psycopg2.

### P0-D: Bing Webmaster Sitemap Submission (71 sessions unresolved)
**First flagged:** S783
**Evidence:** No record of Bing sitemap submission in S784–S854 session summaries. Prior audits confirm pending.
**Risk:** Bing/DuckDuckGo crawlers not proactively notified of new sale pages. SEO gap on second-largest search engine.
**What's needed:** Patrick submits at https://www.bing.com/webmasters → Add sitemap → `https://finda.sale/server-sitemap.xml`

---

## 🔵 P3 — Accumulating Untracked Files in `claude_docs/`

**Evidence:** `git status --short | grep "??"` returned 38 untracked files in `claude_docs/` and its subdirectories — audit reports, brand-drift reports, competitor intel, health reports, improvement memos, marketing content, and operations docs.

**Notable:** Multiple files in wrong locations per `file-creation-schema.md` (e.g., `claude_docs/health-reports/friction-audit-2026-05-15.md` should be in `claude_docs/audits/`). `claude_docs/archive/test-write-check` and `claude_docs/test-write-check` are subagent hygiene violations (test artifacts left in repo).

**No action required this session.** Flag for findasale-records cleanup pass. Prior audits have noted this repeatedly — recommend Patrick authorizes a Records session dedicated to: (a) `git add` all legitimate untracked docs, (b) delete junk test files, (c) move misplaced files to correct subdirectories.

---

## STATE.md Blocked Queue Updates This Session

Added 4 P0 carry-forward items (P0-A through P0-D above). Queue now at **6 rows** — still below ≥8 QA ceiling.

---

## Dispatch Blocks

### Fix for next push (unsubscribe.tsx restoration):
```
git add packages/frontend/pages/unsubscribe.tsx
git commit -m "fix: restore truncated unsubscribe.tsx (audit auto-fix 2026-06-03)"
.\push.ps1
```

### No subagent dispatches required — all P0-A through P0-D are Patrick manual actions only.

---

## Self-Audit Gate

Findings: 7 (P1×1, P2×1, P0×4, P3×1)
Tool citations: 14 distinct bash commands with outputs cited above.
Findings ≤ tool citations ✅ — no UNVERIFIED findings in this report.
