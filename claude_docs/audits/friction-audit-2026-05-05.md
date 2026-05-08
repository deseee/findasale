# Daily Friction Audit — 2026-05-05

**Generated:** 2026-05-05 03:38 UTC (automated, daily-friction-audit task)
**Scope:** S647 wrap state, doc freshness, codebase health

---

## 🔴 P0 — S647 Push Block 2 NEVER PUSHED (13 files uncommitted)

**Category:** unpushed-code / production-blocker
**Source:** `git status` + `git diff --name-only HEAD`

Push Block 1 (Settlement Hub + Sale Type) ✅ pushed (commit 76391a30).
Push Block 3 (Guide drafts) ✅ pushed (commit d60b023e).
**Push Block 2 (13 files) — NOT committed. Not on GitHub. Not deployed.**

Uncommitted modified files:
- `packages/frontend/components/CommandCenterCard.tsx` — fix for site-wide click failures #418 (SSR hydration mismatch)
- `packages/frontend/pages/shopper/profile.tsx` — SSR 404 fix
- `packages/frontend/pages/shopper/collection.tsx` — SSR 404 fix
- `packages/frontend/pages/categories/[category].tsx` — SEO ISR + item grid
- `packages/frontend/pages/sales/[id].tsx` — Event JSON-LD structured data
- `packages/frontend/pages/city/[slug].tsx` — BreadcrumbList JSON-LD
- `packages/frontend/pages/server-sitemap.xml.tsx` — sitemap lastmod fix
- `packages/backend/src/index.ts` — outreach routes wired at startup
- `packages/database/prisma/schema.prisma` — EmailSuppression table + outreach columns

Untracked (new, never committed):
- `packages/backend/src/services/suppressionService.ts`
- `packages/backend/src/jobs/outreachEmailsCron.ts`
- `packages/backend/src/routes/outreach.ts`
- `packages/database/prisma/migrations/20260505000000_add_outreach_pipeline/migration.sql`

**Impact:** Click failures (#418), /shopper/profile and /shopper/collection 404s are NOT fixed in production. SEO improvements not live. Outreach pipeline not deployed.

**Action required — Patrick:**
Run Push Block 2 from STATE.md "Next Session — S648" section. Then run `prisma migrate deploy` for `20260505000000_add_outreach_pipeline`.

---

## 🟡 P1 — Additional uncommitted local changes from prior sessions

**Category:** unpushed-code
**Source:** `git diff --name-only HEAD`

Files modified locally that post-date their last commits (not part of any S647 push block):
- `packages/backend/src/controllers/scraperController.ts` — last commit: FB Marketplace scraper (a51381ff)
- `packages/backend/src/jobs/scraperCron.ts` — last commit: FB Marketplace scraper (a51381ff)
- `packages/frontend/components/Layout.tsx` — last commit: sale type reorder (49f7ef24)
- `.github/workflows/enrich-sale-details.yml` — last commit: S644 dynamic matrix (13db6716)

These have uncommitted deltas on top of their last-pushed versions. Need Patrick to inspect and either commit or discard.

**Action required — Patrick:** At session start, `git diff` each of these files to determine if changes are intentional. Include any intentional changes in next push block or discard with `git checkout`.

---

## 🟡 P2 — Roadmap header stale (S647 not reflected)

**Category:** doc-staleness
**Suggested agent:** findasale-records

Roadmap header is v132 last updated 2026-05-04 (S626/S641/S643). S647 shipped:
- #374 Cold Outreach Pipeline (code complete, awaiting push — P0 above)
- #228 Settlement Hub bugs fixed (Push Block 1 shipped)
- #382 Sale type ordering fixed (Push Block 1 shipped)
- #377 Help Library 75 drafts complete (Push Block 3 shipped)

Roadmap rows for #228, #382, #377 not updated to reflect S647 status. Header version not bumped.

---

## 🟡 P2 — decisions-log entries past 30-day retention policy

**Category:** doc-staleness
**Suggested agent:** findasale-records

decisions-log.md states "Oldest entries pruned after 30 days." Entries from 2026-03-11 through 2026-03-24 (11+ entries, ~42–55 days old) have exceeded the stated retention period. These cover S268, S274, S251, S332 era decisions — many are architectural locks (Hold Button rules, Gamification model, etc.) that arguably should be kept. Records agent should review and either prune or explicitly extend retention for permanent decisions.

---

## 🟢 P3 — Deprecated files still present in claude_docs root

**Category:** doc-noise
**Suggested agent:** findasale-records

Per CLAUDE.md §12 (Session Wrap), `session-log.md` and `next-session-prompt.md` contents moved into STATE.md "Recent Sessions" and "Next Session" sections starting S226+. Both files still exist with stale content (last updated ~S251):
- `claude_docs/session-log.md` — stale S251-era content
- `claude_docs/next-session-prompt.md` — stale credential table from ~S251
- `claude_docs/logs/session-log.md` — duplicate in logs/ subdirectory

These create confusion about which source is authoritative (STATE.md is). Should be archived or deleted.

---

## 🟢 P3 — SharePromoteModal.tsx removal gate unresolved

**Category:** code-decision-pending
**File:** `packages/frontend/components/SharePromoteModal.tsx`

File-level comment: `// TODO: Pending Patrick confirmation before removal.` — This is a Removal Gate item that never received a Patrick decision. Likely added by a subagent auditing the component. Next session should surface: REMOVE / FIX / KEEP?

---

## Summary

| Severity | Count | Requires Patrick | Dispatchable to agent |
|----------|-------|-----------------|----------------------|
| P0       | 1     | ✅ YES (push block) | No |
| P1       | 1     | ✅ YES (git diff inspection) | No |
| P2       | 2     | No | findasale-records |
| P3       | 2     | Partial | findasale-records |

**Critical path:** Patrick must run Push Block 2 + prisma migrate deploy before S648 starts. This unblocks 3 production bugs and the outreach pipeline going live.

