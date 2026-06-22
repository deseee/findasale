# Daily Friction Audit — 2026-05-25

**Run type:** Automated (daily-friction-audit scheduled task)
**Scope:** STATE.md, DECISIONS.md, codebase TODOs, blocked queue, TypeScript health

---

## Summary

1 P0 dispatch issued (photo pipeline — auto-dispatched to findasale-dev).
3 P1 items requiring Patrick action flagged.
TypeScript: ✅ clean (0 errors, frontend + backend).

---

## 1. STATE.md Freshness

**Status: CURRENT.** Updated S787 (most recent session). All three sections (Current Work, Recent Sessions, Next Session) populated. 5 sessions in Recent Sessions. Next Session has clear Patrick actions. No stale timelines detected.

**Flag:** Multiple push blocks are accumulating across 4+ sessions (S783, S784/S784b, S785, S787). STATE.md documents them all in Next Session. Risk: if Patrick's local git state drifts further before consolidating, the combined push becomes harder to untangle. **P1 — Patrick action needed: consolidate and push.**

---

## 2. P0 — Photo Upload Pipeline Missing Photo Records (AUTO-DISPATCHED)

**Category:** code-quality / broken feature
**Severity:** P0 (3 roadmap features dead: #319, #325, #328)
**Root cause confirmed:** `itemController.ts` lines 665–701 — `prisma.item.create()` saves URLs to `Item.photoUrls` only. No `prisma.photo.createMany()` call exists anywhere in the item upload flow. Grep for `Photo.create` / `Photo.createMany` in the entire backend confirms zero calls from item upload paths. The Photo table has 0 rows in production (130 items, 0 Photo records — confirmed S786 via psycopg2).

**Impact:**
- #319 Burst Clustering: `clusterConfidence` always NULL — dead code
- #325 Best-Photo-First Sorting: `orderIndex` unreachable — dead code
- #328 Photo Role Awareness: `photoRole` / `roleReasoning` unreachable — dead code

**Fix:** After `prisma.item.create()` in `itemController.ts`, add a fire-and-forget `prisma.photo.createMany()` call that creates one Photo record per URL with `isPrimary: true` for index 0, `orderIndex` set to position, all other fields at schema defaults.

**Status: AUTO-DISPATCHED to findasale-dev this run.**

---

## 3. P1 — Global CLAUDE.md Credentials Stale

**Category:** doc-staleness / security
**Severity:** P1
**Detail:** Railway DB password rotated 2026-05-24 (`[REDACTED_DB_PW_ROTATE]`). STATE.md S780b section explicitly notes: "⚠️ Global CLAUDE.md still has old password — Patrick must update manually." This Patrick action has appeared in Next Session across S780, S781, S783, S785, S787 without being cleared. Stale credentials in global CLAUDE.md means any session that references it for DB commands will use the wrong password and fail.

**Action needed:** Patrick to update `C:\Users\desee\AppData\Roaming\Claude\local-agent-mode-sessions\...\CLAUDE.md` — both DATABASE_URL lines — with password `[REDACTED_DB_PW_ROTATE]`.

**Cannot auto-dispatch:** global CLAUDE.md is not in the git repo; subagent cannot modify it.

---

## 4. P1 — Blocked Queue at 20 Items (QA Ceiling Active)

**Category:** workflow-drift
**Severity:** P1
**Detail:** Blocked Queue has ~20 open items (up from 14 on 2026-05-12 audit). CLAUDE.md §4 QA ceiling rule fires at ≥8. The rule has been active for 3+ consecutive months (March, April, May 2026 per CLAUDE.md). Recent sessions (S785–S787) have been QA-focused, which is correct. No new feature dev should ship without Patrick sign-off until queue is under control.

**Highest-impact items to clear:**
- Shopper accounts (#266, #184, user12+) — blocked by re-seed (Patrick action)
- eBay features (#244, #293, #295, #298) — blocked by no eBay connection for user1
- Photo features (#319, #325, #328) — unblocked once photo pipeline fix ships (dispatched this run)

---

## 5. P1 — Shopper Re-seed Overdue

**Category:** workflow-drift
**Severity:** P1
**Detail:** Shopper accounts (user12+) cannot log in — production DB not re-seeded after S576 password change (Seedy2025! rejected). This Patrick action has been in Next Session since S787 and S786. Every shopper QA session is blocked until this runs.

**Action needed (copy-paste ready):**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="[Railway DATABASE_URL from Railway dashboard → findasale-db → Variables]"
npx prisma db seed
```
⚠️ Confirm Patrick's test data is backed up before running.

---

## 6. TypeScript Health

**Frontend:** ✅ 0 errors (`npx tsc --noEmit --skipLibCheck`)
**Backend:** ✅ 0 errors (`npx tsc --noEmit --skipLibCheck`)

---

## 7. DECISIONS.md

Newest entry: S687 (2026-05-08) — within 30-day recency window. Oldest referenced: S141 (Fleet Redesign, ~March 2026) — ~2 months old. No entries older than 3 months detected. No review flag needed.

---

## Dispatch Log

| # | Finding | Agent | Status |
|---|---------|-------|--------|
| 1 | Photo upload pipeline missing Photo records (#319/#325/#328) | findasale-dev | AUTO-DISPATCHED |

---

*AUTO-RUN: daily-friction-audit scheduled task — Patrick not present*
