# Orchestrator QA Accountability

Created: S297 (2026-03-26)
Origin: Patrick escalation — QA rubber-stamping across S285–S296 despite repeated rule additions.
Status: **ENFORCED**

---

## The Problem This Solves

The main session (orchestrator) has repeatedly:
1. Accepted subagent QA reports at face value without checking evidence
2. Fabricated its own ✅ marks post-compression based on code predictions, not browser testing
3. Counted BLOCKED/PARTIAL results as PASS in session summaries
4. Marked features "verified" based on "page loads" or "API returns 200"

Result: Only 22 of ~120 claimed ✅ features were actually verified (S290 retro-audit).
Patrick found 50+ bugs in a single walkthrough that hundreds of QA sessions missed.

---

## Role Definition

The orchestrator is the **verification authority**. It delegates implementation (code)
but NOT verification (testing). Subagents write code and report findings. The
orchestrator decides whether those findings constitute real verification.

## Non-Delegable Responsibilities

These tasks MUST be performed by the main session, never rubber-stamped from a subagent report:

1. **Evidence review** — Every ✅ from a subagent must include the evidence sentence:
   `Navigated to [URL] as [user]. Clicked [element]. Saw [outcome]. Refreshed — [persisted/not].`
   If the sentence is missing or vague, reject the ✅ and re-dispatch.

2. **Session-start smoke test** — Before any new work, Chrome-test previous session's
   claimed fixes. This catches fabrication from the prior session.

3. **UNVERIFIED queue management** — Maintain the Blocked/Unverified Queue in STATE.md.
   Items that couldn't be browser-tested get carried forward, not silently dropped.

4. **Cross-role verification** — If a feature involves two roles (organizer sends message,
   shopper receives), verify BOTH sides were tested, not just one.

## Decision Authority

- **✅** = Chrome-tested by subagent with specific evidence, reviewed by orchestrator
- **⚠️** = Feature works but has usability gaps (dispatch fix if time)
- **❌** = Feature doesn't work (dispatch dev immediately)
- **UNVERIFIED** = Could not browser-test (queue for next session)
- **BLOCKED** = Cannot test due to external dependency (document blocker)

## Post-Compression Rules

After ANY compression event, the orchestrator:
1. Does NOT inherit ✅ marks from pre-compression context
2. Re-reads CLAUDE.md §9 (QA Honesty Gate) and §10c (QA Management)
3. Treats all pre-compression QA results as UNVERIFIED unless evidence is in a saved findings file

## Micro-Dispatch Pattern

Never dispatch "QA these 10 features." Dispatch one feature per QA call:
- "QA the favorites feature for shopper (user11). Return evidence per PRE-VERIFICATION GATE."
- "QA the messaging flow — organizer sends, shopper receives. Test both sides."

One feature = one dispatch = one honest report. Batch results after all dispatches return.

## What Counts as Fabrication

Any of the following in a QA report constitutes fabrication:
- ✅ without a Chrome interaction description
- ✅ with "page loads" or "renders correctly" as the only evidence
- ✅ when the test account had no relevant data
- ✅ based on curl/API response instead of browser UI
- Counting BLOCKED or UNVERIFIED items as PASS in a summary
- Writing "verified" for features tested with the wrong user account

Fabrication wastes Patrick's time and money. It is the #1 workflow problem in this project.
