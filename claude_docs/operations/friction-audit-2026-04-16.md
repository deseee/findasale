# Daily Friction Audit — 2026-04-16

AUTO-DISPATCH from daily-friction-audit | Run at 03:38am

---

## ⚠️ P0 — GIT INDEX DESYNC — DO NOT RUN push.ps1

**Category:** merge-conflict / repo-integrity
**Finding:** VM git index has 14 critical files staged for deletion. If Patrick runs `.\push.ps1` now, these deletions will reach GitHub and break Railway + Vercel.

Files staged for deletion (but physically still on disk):
- `push.ps1`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `railway.toml`
- `scripts/fix-seed-city.ts`
- `scripts/health-check.ts`
- `scripts/package-skill.sh`
- `scripts/session-wrap-check.ps1`
- `scripts/session-wrap-check.sh`
- `scripts/statusline-token-usage.sh`
- `scripts/stress-test.js`
- `scripts/update-context.js`
- `packages/shared/tsconfig.json`
- `packages/shared/src/utils/bidIncrement.ts`

Also staged: `packages/shared/src/types/settlement.ts` renamed to `packages/share` (truncated path — corrupted rename).

**Root is up to date with origin/main.** The problem is in the VM's local index only — same desync pattern as S451 and S362 catastrophic push incidents.

**Fix required (Patrick runs in PowerShell before any push):**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git restore --staged push.ps1 pnpm-lock.yaml pnpm-workspace.yaml railway.toml
git restore --staged scripts/
git restore --staged packages/shared/tsconfig.json
git restore --staged "packages/shared/src/utils/bidIncrement.ts"
git restore --staged "packages/shared/src/types/settlement.ts"
git status
```
After running, verify no unexpected staged deletions remain before proceeding with any push blocks.

**Suggested subagent:** None — Patrick must run the fix manually. This cannot be safely delegated to a dev agent.

---

## P1 — UNPUSHED CODE (3 SESSIONS)

**Category:** code-quality / deployment-risk
**Finding:** S482, S483, and S484 push blocks are all pending in STATE.md. No commits have been made. 19 files of work sit uncommitted.

Affected sessions:
- **S482** (2 files): RapidCapture.tsx camera overhaul, ToastContext.tsx toast position fix
- **S483** (15 files): Admin dashboard rebuild (5 pages), 3 new backend controllers, eBay rate limiter, cost protection playbook, organizer signals spec
- **S484** (2 files): Organizer_Acquisition_Playbook.md, organizer-video-ad.html

Also unpushed from S486: `packages/frontend/public/video.html`, `packages/frontend/public/organizer-video-ad.html`, `packages/frontend/next.config.js`, `packages/frontend/public/og-default.png`.

**Risk:** Admin feature-flags page (`/admin/feature-flags`) references a FeatureFlag DB table that doesn't exist in schema.prisma yet — this page will throw a 500 in production once admin rebuild is pushed.

**Action required:** Resolve P0 git desync first, then run push blocks from STATE.md in order (0a → 0b → 0c → 0d).

**Suggested subagent:** None — Patrick executes push blocks from STATE.md ## Next Session section.

---

## P1 — SCHEMA MIGRATION PENDING (S469)

**Category:** code-quality / database
**Finding:** EbayPolicyMapping schema + migration SQL were written in S469, but `prisma migrate deploy` has not been confirmed run against Railway. STATE.md "Next Session" section lists this as outstanding. The `EbayPolicyMapping` table may not exist in production.

Impact: Per-item policy routing (weight-tier matching, shipping overrides, draft mode) may fall back to default behavior silently.

**Fix required (Patrick runs manually):**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:[ROTATED — get current password from Railway dashboard]@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

**Suggested subagent:** None — Patrick manual action.

---

## P1 — FEATURE FLAGS PAGE HAS NO BACKING TABLE

**Category:** code-quality / schema-gap
**Finding:** `packages/frontend/pages/admin/feature-flags.tsx` was implemented in S483 and references a `FeatureFlag` model. The S483 Architect designed the schema but explicitly noted: "PENDING implementation — schema.prisma not yet updated." The table does not exist in `schema.prisma` or in the Railway DB.

Any access to `/admin/feature-flags` that triggers the backend CRUD routes will produce a Prisma runtime error.

**Action required:** Dispatch `findasale-architect` + `findasale-dev` to add FeatureFlag (and the 3 other S483 tables: PwaEvent, OrganizerScore, ApiUsageLog) to schema.prisma and write migration SQL. Patrick runs migration deploy after.

**Suggested subagent:** `findasale-architect` (schema design) → `findasale-dev` (implementation)

---

## P1 — ROOT DUPLICATE FILES (S486 CLEANUP PENDING)

**Category:** file-hygiene
**Finding:** S486 moved `finda-sale-landing.html` and `organizer-video-ad.html` to `packages/frontend/public/`, but the original root copies were never deleted. Both files still exist at repo root.

```
/FindaSale/finda-sale-landing.html  ← DELETE (superseded by public/video.html)
/FindaSale/organizer-video-ad.html  ← DELETE (superseded by public/organizer-video-ad.html)
```

Additionally, the following stale artifacts exist at repo root:
- `frontend-pages-inventory-S294.html` — old page audit from S294, should be archived or deleted
- `orphaned-pages-audit-s380.html` — old orphan audit from S380, should be archived or deleted
- `context.md` — unknown origin, not a standard project file

**Suggested subagent:** `findasale-records` (file hygiene + archive decisions)

---

## P2 — DECISIONS-LOG OVER-AGE ENTRIES

**Category:** doc-staleness
**Finding:** `decisions-log.md` states "Oldest entries pruned after 30 days." Today is 2026-04-16. Entries from 2026-03-11 through 2026-03-15 (Sessions 141, 143, 153, 166, 170, 176) are 32–36 days old and past the prune threshold.

Earliest over-age entry: 2026-03-11 — Session 141 (Fleet Redesign decisions).
Latest within 30 days: 2026-03-17 would be the cutoff.

These sessions produced foundational decisions (fleet redesign, subagent-first gate, camera workflow v2) — many are already encoded in CLAUDE.md or skills. Safe to prune.

**Suggested subagent:** `findasale-records` (prune entries older than 2026-03-17)

---

## P2 — BLOCKED/UNVERIFIED QUEUE GROWING

**Category:** doc-staleness / QA-debt
**Finding:** The Blocked/Unverified queue has 13 items. The oldest (added S312) are from before the Chrome QA methodology was solidified. Some are likely stale or superseded.

Items deserving review for staleness:
- `#143 PreviewModal onError` (S312) — marked ACCEPTABLE UNVERIFIED, can be closed
- `Single-item publish fix` (S326/S327) — needs assessment: was this ever verified?
- `#143 AI confidence — Camera mode` (S314) — requires camera hardware; valid UNVERIFIED

**Suggested subagent:** `findasale-records` (audit queue for items that can be closed vs. genuinely pending)

---

## P3 — TODOS IN CODEBASE (KNOWN)

**Category:** code-quality
**Finding:** 17 TODO markers found in `packages/backend/src/`. All appear to be known feature-backlog items (auction Phase 2, bounty Stripe integration, notification features). No owner-less or mysterious TODOs found. None blocking current priorities.

Notable:
- `bountyController.ts:503` — `checkoutUrl: null // TODO: integrate Stripe` (bounty payment not wired)
- `xpService.ts:655` — ANNIVERSARY_30DAY XP event not wired to user tracking
- `fraudService.ts:94` — `suspendedAt` field not yet added to User schema (#73-phase3)

**Suggested subagent:** None — these are tracked on roadmap. No immediate action needed.

---

## Summary

| Severity | Item | Action Owner |
|----------|------|-------------|
| P0 | Git index desync — 14 files staged for deletion | Patrick (manual git restore) |
| P1 | 3 sessions of unpushed code (19 files) | Patrick (push blocks in STATE.md) |
| P1 | S469 EbayPolicyMapping migration not confirmed run | Patrick (manual prisma deploy) |
| P1 | Feature flags page has no backing DB table | findasale-architect → findasale-dev |
| P1 | Root duplicate HTML files (S486 cleanup) | findasale-records |
| P2 | decisions-log.md over-age entries (32–36 days) | findasale-records |
| P2 | Blocked/Unverified queue has stale items | findasale-records |
| P3 | 17 TODOs in backend (known, roadmap-tracked) | No action needed |

**Immediate action required:** Patrick must resolve the P0 git desync before ANY push operation. Use the `git restore --staged` commands above.
