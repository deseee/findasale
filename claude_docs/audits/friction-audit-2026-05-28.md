# Daily Friction Audit — 2026-05-28

**Run type:** Automated (daily-friction-audit scheduled task)
**Scope:** STATE.md freshness, DECISIONS.md staleness, codebase TODOs, merge conflicts, TypeScript health, Blocked Queue ceiling

---

## Summary

No new P0s. No auto-dispatches issued.
TypeScript: ✅ clean (0 errors, frontend + backend).
Blocked Queue: 6 items — below 8-item QA ceiling. Feature work is cleared to resume.
2 P1 carry-forward Patrick actions remain unresolved (global CLAUDE.md password + production re-seed).
1 P2 new finding: `patrick-dashboard.md` has 3 inconsistent Blocked Queue counts in a single file.

---

## 1. STATE.md Freshness

**Status: CURRENT.** Updated S795 (latest session, today). All sections populated. 5 recent sessions logged. Next Session block has clear Patrick actions and priority order. No stale timelines detected.

---

## 2. TypeScript Health

**Frontend:** 0 errors ✅
**Backend:** 0 errors ✅

No blockers for next push.

---

## 3. Merge Conflict Check

**Status: False positives only (same as prior audits).**

4 files matched the `=======` pattern:
- `fraudDetectionService.ts` — `// ========== RAPID_BID ==========` separator comments
- `subAreaConfig.ts` — same pattern
- `itemConstants.ts` — same pattern
- `label-composer/[saleId].tsx` — same pattern

No real git merge conflicts in the working tree.

---

## 4. Blocked Queue Ceiling

**Status: CLEARED.** Blocked Queue at 6 (below 8-item threshold). Feature work may resume per CLAUDE.md §4. Already reflected in STATE.md Next Session.

---

## 5. Roadmap — BROKEN Items

**4 items marked BROKEN (all from S786):**

```
BROKEN S786 (×3)
```

These are 3 rows flagged as BROKEN in S786 that have not been cleared or dispatched as of S795. Roadmap is binary-encoded (long-line Unicode), so full item names require Patrick to open the file directly. Worth asking: were these dispatched and the roadmap not updated, or are they still genuinely broken?

**Severity:** P2 — no auto-dispatch (need to confirm these aren't stale after 9 sessions without action)

---

## 6. NEW P2 — patrick-dashboard.md Inconsistent Blocked Queue Count

**Category:** doc-staleness
**Severity:** P2

`claude_docs/patrick-dashboard.md` contains 3 different Blocked Queue numbers in a single file:
- **Line 7 (header summary):** "Blocked Queue: 6" — correct (S795 state)
- **Line 46 (Beta Tester Impact section):** "Blocked Queue at 5 items" — stale (S793 state)
- **Line 56 (This Week's Priority section):** "Blocked Queue at 7" — stale (S794 state)

The Priority section also still references "S794 push ready — push block below" which implies S794 changes are pending, but S795 has already run. Patrick may read the stale section and think a push is still needed.

**Suggested fix:** findasale-records should update the Beta Tester Impact and This Week's Priority sections to reflect S795 current state at next session wrap. Low-urgency since the header is correct.

---

## 7. P1 (Carry-Forward) — Global CLAUDE.md DB Password Stale

**Category:** doc-staleness / session-friction
**Severity:** P1
**Unresolved since:** S780 (~4 days, 15+ sessions)

Railway DB password is `[REDACTED_DB_PW_ROTATE]` (rotated 2026-05-24). The global CLAUDE.md at `C:\Users\desee\AppData\Roaming\Claude\...\CLAUDE.md` still shows the old password on both DATABASE_URL lines.

Effect: any session that reads the global CLAUDE.md for a copy-paste DB command will hit auth failure against Railway. Sessions currently work around this by pulling the live password via Railway CLI, but the stale value creates unnecessary friction.

**Cannot auto-dispatch** — global CLAUDE.md is outside the git repo. Patrick must edit directly.

**Patrick action (same as prior sessions):** Search for old password in the file and replace with `[REDACTED_DB_PW_ROTATE]`. (Note: as of S780b the new password was documented in STATE.md; the global CLAUDE.md is the only remaining stale location.)

---

## 8. P1 (Carry-Forward) — Production DB Not Re-Seeded (Shopper QA Blocked)

**Category:** QA blocker
**Severity:** P1
**Unresolved since:** S787

Shopper test accounts (user12+) cannot log in — `Seedy2025!` password changed in S576 but production DB was never re-seeded. Blocks all shopper-role QA (#266 Explorer Profile Dropdown and others).

**Patrick action:**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="[Railway DATABASE_URL from Railway dashboard]"
npx prisma db seed
```
Back up "Barn Door QA Test Sale" first.

---

## 9. P2 (Carry-Forward) — #409 Migration Pending

**Category:** blocked QA
**Severity:** P2

`sneakPeekSentAt` field migration (`20260527000000_add_sale_sneak_peek_sent_at`) has not been deployed. Blocks #409 Pre-Sale Sneak Peek Email QA. Has been in the Next Session block since S794 (2 sessions).

**Patrick action block in STATE.md § Next Session** — same block, unchanged.

---

## 10. P3 — Nevada Scraper Dead

**Category:** scraper health
**Severity:** P3

`opendata.lasvegasnevada.gov` DNS has been dead since May 2026. NV scraper exits cleanly (no noise, no crash). Documented in roadmap but no replacement URL has been assigned. Low priority — NV scraper still exits gracefully.

---

## Conclusion

No new P0s. TypeScript clean. No real merge conflicts. Blocked Queue below ceiling. The only actionable new finding today is the `patrick-dashboard.md` queue count inconsistency (P2, cosmetic/doc). All P1 items are carry-forward Patrick manual actions that cannot be auto-dispatched. No dev dispatches issued.
