# Daily Friction Audit — 2026-04-07 (Tuesday)

**Automated run. AUTO-DISPATCH from daily-friction-audit.**

---

## Findings Summary

### P1 — Three Pending Migrations (Multi-Session Debt)

**Category:** deployment-blocker
**Source:** `claude_docs/STATE.md` — Next Session (S406) Standing Notes

Three schema migrations are documented as required but not confirmed run:

1. **S399** — `20260405_add_feedback_system` (FeedbackSuppression table + User extensions) — since 2026-04-05
2. **S404** — `20260406_add_treasure_trails` (TreasureTrail + 5 new models) — since 2026-04-06
3. **S405** — `20260406_add_pos_payment_request` (POSPaymentRequest model) — since 2026-04-07

The S399 migration also was flagged in friction-audit-2026-04-06.md. If unresolved, feedback surveys, Treasure Trails, and POS payment requests are schema-broken in production. These are Patrick manual actions but have now crossed multiple sessions without confirmation of completion.

**Action:** Surface to Patrick at next session start. Confirm each migration has been run before any Chrome QA of these features.

---

### P2 — STATE.md Size Gate Violation (Repeat — Still Unresolved)

**Category:** doc-staleness
**Source:** `claude_docs/STATE.md`

Flagged in friction-audit-2026-04-06.md as P2. Still unresolved. STATE.md now exceeds 49,000 tokens — reading requires chunking and is degrading session init quality. CLAUDE.md §11 T5 threshold is 250 lines. Sessions S326–S362 (2026-03-28 to 2026-03-31) are complete with no pending items and should be archived to COMPLETED_PHASES.md.

**Dispatch:** `findasale-records` — Archive S326–S362 session summaries from STATE.md to COMPLETED_PHASES.md. Keep S363+ in STATE.md.

```
AUTO-DISPATCH from daily-friction-audit
Agent: findasale-records
Task: Archive completed session summaries from STATE.md (S326–S362) to COMPLETED_PHASES.md.
Context files: claude_docs/STATE.md, claude_docs/COMPLETED_PHASES.md
Constraint: Do NOT remove S363+ — all have pending QA or deferred items.
Acceptance: STATE.md < 250 lines, all archived content preserved in COMPLETED_PHASES.md.
```

---

### P2 — Chrome QA Sweep 9+ Sessions Overdue (Escalated)

**Category:** process-debt
**Source:** `claude_docs/STATE.md` — Blocked/Unverified Queue + S406 Next Session

Was flagged in friction-audit-2026-04-06.md. Now one session further behind. S396–S405 have never been Chrome-QA'd. That's 9 consecutive sessions with unverified UI changes in production. Specific deferred items:

- S396: rapidfire hold-analysis, photo limit prompt, onboarding modal routing
- S397: add-items sort controls, toolbar dark mode, item row layout
- S398: dashboard button icons, LIVE badge link, Other Sales card mobile
- S399: review card status (Ready/Needs Review/Cannot Publish), feedback settings
- S400–S401: camera thumbnail refresh, inline camera append, swipe-back intercept
- S402: Smart Pricing panel, health breakdown UI, eBay sandbox button
- S404: Treasure Trails discovery + check-in smoke test (blocked by migration)
- S405: Shopper QR dashboard, POS shopper QR scan + banner, support chat gate

**Action:** Priority 1 at S406 session start per Next Session notes. Chrome concurrency rule applies: dispatch QA agents SEQUENTIALLY, one at a time.

---

### P2 — Google Places API Key Missing (Trails Feature Non-Functional)

**Category:** deployment-blocker / feature-gap
**Source:** `claude_docs/STATE.md` S405 Deferred + S406 Patrick Actions

Treasure Trails (S404) built `packages/backend/src/lib/placesService.ts` which calls Google Places API for trail discovery. `GOOGLE_PLACES_API_KEY` env var is not set in Railway. Trail discovery and nearby-stops endpoints will return errors until this key is added.

**Action:** Patrick manual action listed in S406 "Patrick Actions First" — create API key at console.cloud.google.com → Maps Platform → Places API, set $200/mo billing cap, add to Railway as `GOOGLE_PLACES_API_KEY`.

---

### P2 — Orphan Temp File in skills-package Directory

**Category:** file-hygiene / CLAUDE.md §10 violation
**Source:** `claude_docs/skills-package/findasale-deploy/`

File found: `SKILL.md.tmp.80512.1774192958848`

This is an orphaned temp file from a prior skill-creation or edit operation. CLAUDE.md §10 subagent file hygiene rule: temp/working files must not be left in `claude_docs/`. The correct location is the VM working directory which auto-cleans.

**Action:** Patrick can delete this file from Windows: `del "C:\Users\desee\ClaudeProjects\FindaSale\claude_docs\skills-package\findasale-deploy\SKILL.md.tmp.80512.1774192958848"`. VM deletion was blocked by file permissions.

---

### P3 — OG-3 Feedback Trigger Deferred 3 Sessions

**Category:** implementation-debt
**Source:** `claude_docs/STATE.md` — S404 Deferred, S405 Deferred, S406 Priority 2

`showSurvey('OG-3')` after mark-sold has been deferred from S404 → S405 → S406. It's a small, well-defined task. The mark-sold flow endpoint exists; the survey infrastructure is built. This is a ~30 min dev task that keeps getting bumped.

**Action:** Include in S406 dispatch immediately after Chrome QA sweep.

---

### P2 — Fraud Detection Job Not Running (Never Mounted)

**Category:** code-quality / silent feature failure
**Source:** `packages/backend/src/jobs/fraudDetectionJob.ts`, `packages/backend/src/index.ts`

`fraudDetectionJob.ts` exists and contains a scheduled job (daily at 2 AM) for off-platform transaction detection. However, it is **not imported in `index.ts`** — the job is never registered with cron and never runs.

`index.ts` imports 14 other jobs (lines 167–184) but `fraudDetectionJob` is absent. The file has a `// TODO: Integrate with node-cron:` comment at line 23 confirming this was flagged but never resolved.

This means fraud detection for off-platform transactions has been silently inactive for an unknown number of sessions.

**Dispatch:** `findasale-dev` — Add `import './jobs/fraudDetectionJob';` to `packages/backend/src/index.ts` alongside other job imports. Verify the job file initializes cleanly (no TS errors).

```
AUTO-DISPATCH from daily-friction-audit
Agent: findasale-dev
Task: Mount fraudDetectionJob in packages/backend/src/index.ts.
Action: Add `import './jobs/fraudDetectionJob';` at line ~184 alongside other job imports.
Context files: packages/backend/src/index.ts, packages/backend/src/jobs/fraudDetectionJob.ts
Constraint: Single-line change. Run tsc --noEmit --skipLibCheck after. Zero errors required.
Changed files list: packages/backend/src/index.ts
```

---

### P3 — 15 Ownerless TODOs in packages/

**Category:** code-quality
**Source:** Grep of `packages/**/*.ts,*.tsx`

15 `// TODO` comments found across 10 files. No TypeScript errors (frontend + backend both clean). Most are Phase 2 stubs. Two worth flagging specifically:

1. `packages/backend/src/jobs/fraudDetectionJob.ts:23` — `// TODO: Integrate with node-cron:` — fraud detection job may not be running on a schedule. If `fraudDetectionJob.ts` is not mounted in `index.ts` cron setup, fraud detection is dead.

2. `packages/frontend/components/ShopperCartDrawer.tsx:212` — `// TODO: Navigate to hold-to-pay flow with pre-selected items` — "Pay for holds" button in cart drawer is a stub. Shoppers see a button that doesn't complete the action.

3. `packages/backend/src/helpers/itemQueries.ts:43` — `// TODO: Make draftStatus String? (optional) or backfill NULLs` — unresolved schema decision.

**Action for fraud detection:** Quick verify — grep `fraudDetectionJob` in `index.ts` to confirm it's mounted. If not, dispatch `findasale-dev` to mount it.

---

### P3 — Deprecated Docs Still Present

**Category:** doc-hygiene
**Source:** `claude_docs/session-log.md`, `claude_docs/next-session-prompt.md`

Both files have DEPRECATED headers and are no longer updated. `next-session-prompt.md` is frozen at S264 (2026-03-24 — 14 days stale). These won't cause operational issues but add confusion. CLAUDE.md §12 says "Existing instances of these files remain for now" — acceptable for now.

**Action:** None required this session. Monitor for deletion at major STATE.md archiving pass.

---

## Summary

| Severity | Count | Items |
|----------|-------|-------|
| P1 | 1 | Pending migrations (3 features schema-broken) |
| P2 | 5 | STATE.md size gate (repeat), Chrome QA overdue (9 sessions), Google Places API missing, orphan temp file, fraud detection job not mounted |
| P3 | 3 | OG-3 deferred, 15 ownerless TODOs, deprecated docs |

**Zero TypeScript errors** in frontend and backend — codebase is build-clean.
**No merge conflicts** found in tracked source files.
**No stale decisions** — decisions-log.md entries are all within 30-day window (oldest: 2026-03-24).
**All CLAUDE.md reference docs exist** — no 404s in reference table.
