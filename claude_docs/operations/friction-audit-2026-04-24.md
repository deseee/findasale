# Daily Friction Audit — 2026-04-24

**AUTO-DISPATCH from daily-friction-audit**
**Scan time:** 2026-04-24 03:38 UTC
**Current session:** S561 (latest completed)

---

## Summary

4 actionable findings. 1 auto-dispatched. See dispatch block below.

---

## Finding 1 — P1: STATE.md "Next Session" section is 5 sessions stale

**Category:** doc-staleness  
**Severity:** P1

The `## Next Session` section in `claude_docs/STATE.md` is titled "**Next Session (S556)**" and contains full parallel dispatch planning for S556 — a session that completed ~5 sessions ago. The current session is S561. Any new session reading STATE.md will see S556 planning and potentially re-execute already-completed work or waste context parsing obsolete queues.

The section still occupies lines 221–299 and includes specific agent dispatch instructions, file paths, and token-budget estimates for ADR-069 Phase 1 — all of which have shipped.

**Recommended fix:** Records agent rewrites "Next Session" section to reflect S562 priorities:
- Dispatch the 3 P1 bugs from S561 queue (Hunt Pass CTA, TEAMS onboarding modal, Consignor /api/ prefix)
- Note pending Patrick actions (push S560 block + migrate deploy `20260424_add_comp_fetch_enhancements`)
- Prune the pre-S555 queue sections (lines 255–299 still contain S551 planning)

**→ AUTO-DISPATCHED to findasale-records (see dispatch block below)**

---

## Finding 2 — P1: 3 bugs from S561 logged but not dispatched

**Category:** code-quality (unpatched bugs blocking beta features)  
**Severity:** P1

The Blocked/Unverified Queue has three P1 bugs from S561 with no dispatch block written:

1. **Hunt Pass Active CTA** — `/shopper/hunt-pass` shows "Upgrade to Hunt Pass" for Karen who has an active subscription. Page doesn't check subscription status.
2. **TEAMS onboarding modal** — Fires on every login for Alice (user1), inputs non-functional, X/Escape don't close. Blocks organizer dashboard access.
3. **Consignor Portal double /api/ prefix** — `consignors.tsx` uses `api.get('/api/consignors')` but `api.ts` baseURL includes `/api`. All 4 API calls 404.

These were logged in STATE.md but no `findasale-dev` dispatch was issued to actually fix them.

**Action needed:** Next session should open with a 3-agent parallel dispatch to fix all three. Each touches different files (hunt-pass.tsx, onboarding modal component, consignors.tsx).

---

## Finding 3 — P2: CORE.md stale file present in claude_docs/

**Category:** doc-staleness  
**Severity:** P2

`claude_docs/CORE.md` (Behavioral Operating System v2, session 112) still exists in the repo. CLAUDE.md v5.0 (S226) contains the note that CORE.md was merged. The stale file won't break anything but could confuse sessions that read it, as it represents a much older behavioral spec (19-rule condensed to 5) that conflicts with the current CLAUDE.md hierarchy.

**Action needed:** Records agent or Patrick removes CORE.md from `claude_docs/` or archives it.

---

## Finding 4 — P2: bountyController.ts Stripe TODO may be unresolved post–Bounty Batch C

**Category:** code-quality  
**Severity:** P2

Line 514 of `packages/backend/src/controllers/bountyController.ts` contains:
```
checkoutUrl: null, // TODO: integrate Stripe
```

Bounty Batch C (`completeBountyPurchase` with Stripe PaymentIntent + CheckoutModal) shipped in S560. If this TODO is inside the `completeBountyPurchase` function, it may mean the Stripe checkout URL is not being returned to the frontend — which would explain why the "Complete Purchase" flow is UNVERIFIED in the queue (S561: "zero BountySubmissions in DB, requires seeding").

**Action needed:** Dev agent to read bountyController.ts line 514 context, confirm whether this is inside `completeBountyPurchase` or a different endpoint, and resolve or flag.

---

## TODOs in packages/ (informational, no dispatch needed)

34 TODO/FIXME occurrences across 20 backend files. Notable clusters:
- `saleController.ts` — 5 TODOs (no context/owner info; worth an owner-pass by dev)
- `bountyController.ts` — 4 TODOs (includes the Stripe issue above)
- `stripeController.ts` — 2 TODOs

These are tracked-but-dormant. Not flagging for dispatch unless the bounty Stripe issue (Finding 4) confirms impact.

---

## Dispatch Block — AUTO-DISPATCHED to findasale-records

**Task:** Rewrite STATE.md "Next Session" section to reflect S562 priorities.

**Context:**
- STATE.md is at `claude_docs/STATE.md` (27k+ tokens — read in sections)
- The stale section is `## Next Session` starting at line 221, containing S556 planning through line ~299
- Also prune the "Older queue (pre-S555)" section (lines 255–299) — all items have shipped

**What to write:**
```
## Next Session (S562)

**Patrick pending actions (do before or at session start):**
1. Push S560 combined block (see patrick-dashboard.md) + run `migrate deploy` + `prisma generate` for `20260424_add_comp_fetch_enhancements`
2. Confirm S558/S559 migration `20260424_add_photo_role` was deployed (STATE says "per Patrick" but S559 still listed it as pending)

**First session task — P1 bug dispatch (3 parallel agents):**
- Agent 1: Fix Hunt Pass CTA detection (`/shopper/hunt-pass` shows "Upgrade" for active subscribers) — hunt-pass.tsx, check subscription status from useXpProfile or useSubscription hook
- Agent 2: Fix TEAMS onboarding modal (fires every login, inputs non-functional, doesn't close) — find and fix modal dismissal logic; check OrganizerWorkspace creation
- Agent 3: Fix Consignor Portal double /api/ prefix — consignors.tsx uses api.get('/api/consignors') but baseURL already includes /api; remove /api/ prefix from all 4 api calls in that file

**After P1 fixes ship:**
- Chrome QA sweep for S561 cluster (focus: fixed features + #309/#310/#311)
- ADR-070 Mark Sold → POS: Patrick has reviewed ADR-070 decision that posController.ts already covers this — confirm no further dev work needed, close out roadmap item
- Affiliate Program: Patrick decision needed on Batch 7+ (1099 compliance before payout expansion)
```

**Subagent:** findasale-records  
**Constraint:** Records agent does NOT push to GitHub (subagent push ban). Return the updated STATE.md "Next Session" section as diff for main session to apply via Edit tool + push block.

---

## No Other Actionable Friction

- STACK.md exists at correct path ✅
- decisions-log.md exists, most recent entry 2026-04-22 (within 30-day window) ✅
- No stale git merge conflicts detectable from doc scan
- Skill health: cannot verify from docs-only scan (requires bash at session start)
