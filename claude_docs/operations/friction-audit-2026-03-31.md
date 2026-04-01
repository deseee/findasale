# Daily Friction Audit — 2026-03-31

**Run by:** daily-friction-audit scheduled task (automated)
**Session:** N/A (scheduled, no user present)
**State freshness:** STATE.md current as of S353 (2026-03-31) ✅

---

## Summary

5 findings. 1 × P1 beta blocker, 2 × P2 code gaps, 1 × P2 housekeeping, 1 × P3 housekeeping.
Yesterday's P2 CLAUDE.md WRAP path fix was applied and confirmed ✅.

---

## Findings

### [P1] Password reset email NEVER sent — beta users locked out
**Category:** code-quality / beta-blocker
**File:** `packages/backend/src/controllers/authController.ts:422`
**Detail:** The forgot-password endpoint generates a reset token and returns `{ message: "If that email exists, you'll receive a reset link" }` — but no email is ever sent. Line 422 has `// TODO: Send email with reset link (non-blocking)` with no implementation. Beta users who forget their password have no recovery path. The reset token is created but unreachable.
**Impact:** Any beta user who forgets their password is permanently locked out. High credibility risk during active beta week.
**Suggested fix:** Wire `sendPasswordResetEmail()` (Resend) to the token generation block in the forgot-password handler. Use the existing `resetToken` value.
**Subagent:** findasale-dev

```
AUTO-DISPATCH from daily-friction-audit (2026-03-31)

Task: Implement password reset email send in authController.ts (P1)

Context:
- File: packages/backend/src/controllers/authController.ts
- Line ~422: TODO comment marks where email send should happen
- A reset token is generated but no email is sent to the user
- Resend is the email provider (already wired for other emails)
- Pattern: look at any existing Resend call (e.g., organizer verification email) for send pattern

Required change:
- After generating the reset token, call the email service to send a "Reset your password" email
- Include a link: https://finda.sale/auth/reset-password?token={resetToken}
- Use brand-voice tone consistent with other FindA.Sale transactional emails
- Error should be non-blocking (catch and log, don't fail the API response)

Constraints:
- Do not change the API response shape
- Do not change the token generation logic
- TypeScript zero-error gate required before returning
- Return changed file list

Acceptance criteria: User who requests password reset receives an email with a working reset link
```

---

### [P2] Fraud detection job never initialized — runs nowhere
**Category:** code-quality
**File:** `packages/backend/src/jobs/fraudDetectionJob.ts:23`
**Detail:** `initFraudDetectionSchedule()` exists but the cron is commented out and the function is never called from `index.ts`. Only the fraud API routes are registered (fraud detection as an API endpoint), not the automated daily job. Off-platform transaction detection (#109) never runs automatically.
**Impact:** Off-platform fraud (#109) is silently not monitored. The feature is "shipped" but the scheduled detection never fires.
**Suggested fix:** Import and call `initFraudDetectionSchedule()` from backend `index.ts` near the other cron initializations. Uncomment the node-cron schedule inside the function.
**Subagent:** findasale-dev

```
AUTO-DISPATCH from daily-friction-audit (2026-03-31)

Task: Wire fraud detection job to node-cron in index.ts (P2)

Context:
- File: packages/backend/src/jobs/fraudDetectionJob.ts
- initFraudDetectionSchedule() is defined but never called
- packages/backend/src/index.ts only registers fraud API routes, never calls initFraudDetectionSchedule()
- Cron schedule: 2 AM daily (already specified in the TODO comment inside the function)
- Pattern: follow same pattern as auctionCloseCron or reservationExpiryJob initialization in index.ts

Required change:
1. Uncomment the node-cron schedule inside initFraudDetectionSchedule() in fraudDetectionJob.ts
2. Import and call initFraudDetectionSchedule() in index.ts near other job initializations
3. Confirm node-cron is already a dependency (it is — other crons use it)

Constraints:
- TypeScript zero-error gate required before returning
- Return changed file list

Acceptance criteria: initFraudDetectionSchedule() is called at startup; cron runs daily at 2 AM
```

---

### [P2] OrganizerOnboardingModal not wired to dashboard — modal is orphaned
**Category:** code-quality
**File:** `packages/frontend/components/OrganizerOnboardingModal.tsx:60`
**Detail:** `OrganizerOnboardingModal.tsx` has `// TODO: import OrganizerOnboardingModal in organizer/dashboard.tsx for State 1 (new organizer)`. The modal is built and ready but never imported or used. S354 P3 is the dashboard redesign — this is directly relevant.
**Impact:** New organizers (State 1) never see the onboarding wizard modal. It exists in the codebase but is unreachable.
**Note:** Do not dispatch dev until S354 P2 (UX skill rewrite) and P3 (dashboard redesign) are complete — this should be integrated as part of the dashboard redesign, not bolted on separately.
**Subagent:** Queue for S354 P3 (dashboard dev dispatch)

---

### [P2] STATE.md approaching size limit — archive oldest section
**Category:** doc-staleness
**File:** `claude_docs/STATE.md`
**Detail:** STATE.md is 227 lines — approaching the 250-line limit defined in CLAUDE.md §11 T5. The file contains multiple completed "Next Session" blocks from older sessions (S351, S342, S347 push blocks) that should be pruned.
**Impact:** At current growth rate (~15 lines/session), STATE.md will exceed 250 lines in 1–2 sessions.
**Suggested fix:** findasale-records should archive completed "Next Session" blocks older than the current one (S354) into COMPLETED_PHASES.md or a session-archive. Keep only S354 next-session content.
**Subagent:** findasale-records

```
AUTO-DISPATCH from daily-friction-audit (2026-03-31)

Task: Archive stale "Next Session" blocks from STATE.md to keep it under 250 lines (P2)

Context:
- File: claude_docs/STATE.md (currently 227 lines — approaching 250-line limit per CLAUDE.md §11 T5)
- The file contains old "Next Session" blocks: S351 (COMPLETED), S342, S347 push block content
- Keep: "## Current Work" section, "## Blocked/Unverified Queue", "## Next Session (S354)" section, and "## Recent Sessions" entries
- Archive: any "## Next Session" blocks marked COMPLETED or referencing sessions older than S354
- Archive destination: claude_docs/COMPLETED_PHASES.md (append with [Session Wrap Archive: S351] header)

Constraints:
- Do NOT delete — move to COMPLETED_PHASES.md
- STATE.md must remain a valid compression anchor (Current Work section intact)
- Return both files in the changed-files list for wrap push block
```

---

### [P3] Stale git worktrees from dead session — carry-forward from 2026-03-30
**Category:** git-hygiene
**Detail:** 6 locked worktrees from session `happy-youthful-lamport` were flagged yesterday. These require Patrick to run `git worktree remove --force` from their Windows machine — cannot be fixed via MCP.
**Patrick action (carry-forward from yesterday's audit):**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git worktree remove --force .claude/worktrees/agent-a149904c
git worktree remove --force .claude/worktrees/agent-a29f7731
git worktree remove --force .claude/worktrees/agent-a2b4ad92
git worktree remove --force .claude/worktrees/agent-a39344c2
git worktree remove --force .claude/worktrees/agent-ad41a56d
git worktree remove --force .claude/worktrees/agent-ada8ad64
git worktree prune
```

---

## Context Check — Yesterday's Findings

| Finding | Status |
|---------|--------|
| P2: CLAUDE.md WRAP path fix | ✅ FIXED — confirmed `operations/WRAP_PROTOCOL_QUICK_REFERENCE.md` in table |
| P2: Stale git worktrees | ⏳ Carry-forward — Patrick action required |
| P2: hasSavedItems hardcoded false | ⏳ Carry-forward — dashboard redesign S354 P3 |
| P3: Rank badge not wired to XP | ⏳ Carry-forward — AvatarDropdown.tsx, low priority |

---

## STATE.md Impact

No STATE.md update triggered by this audit (automated run, no user present).
P1 finding (password reset email) should be flagged to Patrick at S354 session start.

**Next audit:** 2026-04-01 (automated)
