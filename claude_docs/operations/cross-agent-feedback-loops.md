# Cross-Agent Feedback Loops — Async Intelligence Routing

**Status:** Active | **Updated:** 2026-03-11

---

## Purpose

Agents produce intelligence that matters to other agents. Feedback loops ensure signals flow without Patrick manually routing. This is the agent communication bus.

---

## Formal Feedback Loops

| From | To | Signal Type | Example |
|------|-----|------------|---------|
| **Rollback** | **Innovation** | Trial failure + lessons learned | "Competitor agent failed; next time explore X instead" |
| **Customer Champion** | **Sales-Ops** | Customer friction, churn patterns | "Customers frustrated by inventory lag — affects targeting" |
| **Competitor** | **Innovation** | Threat intelligence | "Competitor released feature X — threat-as-opportunity brainstorm" |
| **QA** | **Dev** | Test failures, regression patterns | "Auth endpoint flaky in 3 recent tests — investigate" |
| **Hacker** | **Architect** | Security findings | "S3 bucket misconfigured — revise data access policy" |
| **Workflow** | **[Owner]** | Friction audit findings | "Decision-making blocked by approval overhead — escalate to owner" |

---

## Implementation: MESSAGE_BOARD.json

Agents write feedback to `claude_docs/operations/MESSAGE_BOARD.json`:

```json
{
  "feedbackQueue": [
    {
      "from": "customer-champion",
      "to": "sales-ops",
      "type": "feedback-loop",
      "signal": "Organizers struggling with photo upload speed during peak hours",
      "evidence": "claude_docs/logs/session-log.md:2026-03-10-line-47",
      "priority": "P1",
      "timestamp": "2026-03-11T14:32:00Z"
    },
    {
      "from": "competitor",
      "to": "innovation",
      "type": "feedback-loop",
      "signal": "Competitor released mobile-first inventory sync — threat-as-opportunity",
      "evidence": "claude_docs/competitor-intel/competitor-analysis-2026-03-11.md",
      "priority": "P2",
      "timestamp": "2026-03-11T16:15:00Z"
    }
  ]
}
```

**Feedback Schema:**
- `from` — agent name (kebab-case)
- `to` — target agent name
- `type` — always "feedback-loop"
- `signal` — one-sentence summary of the intelligence
- `evidence` — file path or data reference (proof)
- `priority` — P0 (block), P1 (urgent), P2 (useful), P3 (nice-to-know)
- `timestamp` — ISO 8601, UTC

---

## Routing at Dispatch

Main session routes feedback when dispatching agents:

1. **Before dispatch:** Read MESSAGE_BOARD.json for entries targeting that agent
2. **Attach to context:** "You have X feedback items from Y agent(s) — prioritize these"
3. **Agent responds:** Acknowledges feedback, incorporates if relevant, or documents why not
4. **After dispatch:** Remove processed entries from queue

---

## P0 (Block) Feedback

P0 items halt normal operations. Examples:
- Security finding blocks deployment
- Customer emergency blocks feature work
- Data integrity issue blocks rollout

**Main session must surface P0 to Patrick immediately.** Do not proceed without acknowledgment.

---

## Example Flow

1. **QA finds:** Test suite failing in auth endpoint
2. **QA writes:** P0 feedback to Dev with test logs attached
3. **Main session sees P0** before dispatching Dev agent → flags to Patrick
4. **Dev agent receives:** Context includes QA feedback + test results
5. **Dev fixes** or escalates
6. **Main session removes** entry from queue after Dev response logged

