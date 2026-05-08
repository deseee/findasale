# Daily Friction Audit — 2026-04-20 (Monday)

AUTO-DISPATCH from daily-friction-audit | Run at 03:38am

---

## STATE.md Freshness

STATE.md updated S522 (2026-04-20) ✅ — current.
patrick-dashboard.md updated April 20 ✅ — current.
QA backlog last updated S518 (2026-04-19) ✅ — current.
Previous audit: 2026-04-16 (Thursday). April 17 Friday audit is **absent** — schedule gap, noted below.

---

## P1 — SHARE CARD 401 UNRESOLVED (ACTIVE BUG)

**Category:** code-quality / user-facing bug
**Finding:** `/api/share-card` returns 401 on all requests. Two fixes were attempted in S522 (removed edge runtime, switched to getServerSession) with no visible effect. The Share & Promote page's Download Image and Preview flows are broken for all users.

**Root cause unknown.** Likely culprits per STATE.md: promote page isn't calling `/api/share-card` at all (showing placeholder), or `guildXp` missing from session token, or session cookie not forwarded in Vercel edge environment.

**Action required:** S523 priority 1 — open Chrome DevTools Network tab on promote page, click Download Image, inspect request URL + headers + 401 response body.

**Subagent:** `findasale-dev` (after Chrome triage identifies root cause)
**Patrick action:** Run S522 push block first, then triage in next session.

---

## P1 — S522 PUSH BLOCK NOT YET EXECUTED

**Category:** deployment-risk
**Finding:** STATE.md ## S522 Wrap Push Block exists and has not been executed. The share & promote redesign (pages/api/share-card.tsx rename from .ts) is uncommitted. `git rm packages/frontend/pages/api/share-card.ts` + `git add packages/frontend/pages/api/share-card.tsx` are pending.

**Risk:** S522 work is not live. Share card 401 fix attempts cannot be verified until this push lands on Vercel.

**Patrick action:**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git rm packages/frontend/pages/api/share-card.ts
git add packages/frontend/pages/api/share-card.tsx
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "S522 wrap: share & promote redesign, share-card API, auth fix attempt (triage S523)"
.\push.ps1
```

---

## P1 — ROOT STALE FILES STILL PRESENT (FLAGGED APRIL 16 — NOW 4 DAYS OVERDUE)

**Category:** file-hygiene
**Finding:** Root cleanup was flagged as P1 in the April 16 audit. These files are still present at repo root:

- `context.md` — unknown origin, not a standard project file
- `frontend-pages-inventory-S294.html` — old page audit from S294
- `orphaned-pages-audit-s380.html` — old orphan audit from S380
- `label-sheet-composer-dev-prompt.md` — session artifact, not project doc
- `sale-progress-prototype.html` — prototype artifact
- `Organizer_Acquisition_Playbook.md` — should be in `claude_docs/` or archived

These do not belong at repo root. Four days overdue for cleanup.

**Subagent:** `findasale-records` (determine archive vs. delete per file-creation-schema.md, then provide Patrick a `git rm` block)

```
AUTO-DISPATCH from daily-friction-audit (2026-04-20)
Task: Audit 6 root-level stale files. For each: determine correct disposition (archive to claude_docs/ subdirectory, or git rm). Produce a clean git rm + git mv block for Patrick. Do NOT delete — provide the block. Files: context.md, frontend-pages-inventory-S294.html, orphaned-pages-audit-s380.html, label-sheet-composer-dev-prompt.md, sale-progress-prototype.html, Organizer_Acquisition_Playbook.md. Reference: operations/file-creation-schema.md.
```

---

## P1 — QA BACKLOG: 30+ FEATURES UNVERIFIED SINCE S518

**Category:** QA-debt
**Finding:** qa-backlog.md (updated S518, April 19) shows 30+ features in "Feature QA Queue" pending Chrome verification. Items range from S515–S518. This backlog is growing as sessions add features without Chrome verification passes.

Highest-risk unverified items:
- Settlement Hub (#228) — financial flow, SIMPLE tier
- Charity Close + Tax Receipt PDF (#235) — PRO
- SIMPLE Concurrent Sales Gate (#249) — known bug area
- Efficiency Coach label (#518-C) — known inverted fix
- Workspace Team Chat (#518-E) — fixed S518, unverified

**Action required:** S523 priority 2. Micro-dispatch findasale-qa for the 5 🔴 Hot items (S518-A through S518-E) first, then work Feature QA Queue.

**Subagent:** `findasale-qa` (micro-dispatches per feature per CLAUDE.md §10c)
**Note:** Chrome QA agents must run sequentially — do not dispatch multiple simultaneously.

---

## P2 — STRIPE TEST ENV VARS MISSING (SINCE S513)

**Category:** config / environment
**Finding:** `STRIPE_TEST_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY` are still not configured on Railway + Vercel. First flagged S513. Now at least 7 sessions old. Blocks:
- Checklist test flow QA (POS, online, auction, in-app payment)
- Photo station build (P1 feature gated behind this)

**Patrick action:** Configure env vars in Railway dashboard (backend service) and Vercel dashboard (frontend project). Reference SECURITY.md §6 for correct variable handling.

---

## P2 — DECISIONS-LOG OVER-AGE ENTRIES (NOW 36–40 DAYS OLD)

**Category:** doc-staleness
**Finding:** decisions-log.md states "Oldest entries pruned after 30 days." The April 16 audit identified entries from 2026-03-11 to 2026-03-15 as 32–36 days old. Now 4 days later they are 36–40 days old. No pruning has occurred.

Over-age entries to review for pruning:
- 2026-03-11 (S141) — Fleet Redesign decisions
- 2026-03-13 (S143) — Camera workflow decisions
- 2026-03-15 (S153, S166, S170, S176) — Multiple locked decisions

Most are encoded in CLAUDE.md or skills already. Safe to prune.

**Subagent:** `findasale-records`

```
AUTO-DISPATCH from daily-friction-audit (2026-04-20)
Task: Prune decisions-log.md entries older than 2026-03-21 (30-day cutoff from today). Before pruning, confirm each entry's content is encoded in CLAUDE.md, STACK.md, or a skill. Return a diff showing removed entries and confirmation that no unencoded decision was lost.
```

---

## P3 — APRIL 17 FRIDAY AUDIT MISSING

**Category:** schedule-gap
**Finding:** The friction-audit-2026-04-17.md file is absent. The scheduled task runs weekdays (Mon–Fri). April 17 was a Friday. The gap covers one weekday. The April 16 (Thursday) audit was the most recent before today.

No action required — the issues that would have been caught are covered in today's audit.

---

## Positive Findings (Items Resolved Since April 16)

- **FeatureFlag model in schema.prisma** ✅ — April 16 P1 (no backing DB table for `/admin/feature-flags`) is resolved. Model found in schema.prisma.
- **STATE.md current** ✅ — Updated S522 (today)
- **No merge conflicts or unresolved stale branches found** ✅
- **No new unowned TODOs in packages/** ✅ (17 known TODOs remain, roadmap-tracked)
- **CLAUDE.md reference files all exist** ✅ (STACK.md, SECURITY.md, RECOVERY.md, file-creation-schema.md, etc.)

---

## Summary

| Severity | Item | Action Owner |
|----------|------|-------------|
| P1 | Share card 401 — active user-facing bug | findasale-dev (after Chrome triage) |
| P1 | S522 push block not executed | Patrick (push block in STATE.md) |
| P1 | Root stale files — 4 days overdue for cleanup | findasale-records |
| P1 | 30+ features in QA backlog, no Chrome verification | findasale-qa (micro-dispatches) |
| P2 | Stripe test env vars missing (7+ sessions) | Patrick (Railway + Vercel dashboards) |
| P2 | decisions-log over-age entries (36–40 days) | findasale-records |
| P3 | April 17 audit file absent | No action needed |

**Highest priority for S523:** Execute S522 push block → triage share card 401 in Chrome → run QA micro-dispatches for 🔴 Hot items.
