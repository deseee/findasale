# Friction Audit — 2026-04-22
**Run by:** daily-friction-audit (automated, S540)
**Scope:** Doc freshness, codebase TODOs, reference 404s, skill health

---

## Summary

No new blocking friction detected. STATE.md is current (updated S540 today). Previously flagged P2 (STACK.md fee structure stale) was resolved — STACK.md now correctly documents tiered rates. One tracking note on growing blocked/unverified queue. One pre-existing P2 open gap (Organizer Insights runtime error). No dispatch needed.

---

## ✅ Passing Checks

- **STATE.md:** Current — last updated S540 (2026-04-22, today). "Current Work", "Recent Sessions", "Next Session", "Blocked/Unverified Queue" sections all present and fresh.
- **patrick-dashboard.md:** Current — reflects S540 complete, clear push block for Patrick, QA scenarios documented.
- **STACK.md fee structure (yesterday's P2):** RESOLVED — now correctly shows 10% default (SIMPLE/ALA CARTE), 8% discounted (PRO/TEAMS), source of truth = `Organizer.commissionRate`. No longer stale.
- **CLAUDE.md reference files:** All 16 referenced docs confirmed present in yesterday's audit (S539/S540 sessions added no new dead links).
- **decisions-log.md:** Entries current through 2026-04-11 (11 days ago). Well within 3-month review threshold. No stale decisions needing action.
- **STACK.md architecture:** Matches current monorepo structure (frontend/backend/database/shared). No drift detected.
- **Monorepo package structure:** All four packages (frontend, backend, database, shared) present and intact.
- **S540 push block:** Properly documented in patrick-dashboard.md with complete git add lines. Patrick action — not a friction issue.

---

## ⚠️ Tracking Notes (Non-Blocking)

### P2 — Organizer Insights Runtime Error (Pre-Existing, Unresolved)

**Status:** Carried from S528. Not new.
**Issue:** `/organizer/insights` throws "failed to load" runtime error for some users (Alice/user1). Bob loads fine. User-specific error — needs Railway log check with Alice's account.
**Tracked in STATE.md:** Yes — under "Known Issues & Debt".
**Action:** Already in the QA backlog. No dispatch needed today — session-level investigation required when Patrick is present.

---

### P3 — Blocked/Unverified Queue Growing (Queue Management)

**Status:** Queue now has 25+ items (up from 12 in yesterday's audit).
**Context:** Rapid feature development across S534–S540 (7 sessions in one day) has outpaced Chrome QA capacity. All items are properly tracked with session and context in STATE.md.
**Risk:** If the queue continues growing without QA passes, verified status becomes increasingly uncertain and future sessions may re-introduce bugs in areas not recently verified.
**Recommendation:** S541 priorities correctly list Chrome QA as first priority. No additional dispatch needed — monitoring only.

---

### P3 — phoneVerified Gap (Known Open Schema Gap)

**Status:** Carried from S536. Not new.
**Issue:** `phoneVerified` field does not exist on User model. REFERRAL_FIRST_PURCHASE (500 XP) phone verification gate from gamedesign spec is not enforced. Fraudulent referral claims cannot be phone-gated until phone verification feature ships.
**Tracked in STATE.md and patrick-dashboard.md:** Yes.
**Action:** Requires phone verification feature design — not a friction audit issue.

---

### P3 — Code TODOs Without Owners (Background Debt)

**Files with contextual TODOs:**
- `bountyController.ts` — distance sorting, Stripe integration, Order record creation (Phase 2 deferred)
- `heatmapController.ts` — specific heatmap feature extensions
- `luckyRollController.ts` — lucky roll enhancements

These are all known deferred items from prior feature planning. Not blocking. Consistent with yesterday's audit finding of similar scope.

---

## No Dispatch Needed

All findings are pre-existing, tracked, or non-actionable without Patrick present. No new P0/P1 issues detected. System is in a healthy push-pending state after S540.

**Monitoring continues — next audit runs tomorrow.**
