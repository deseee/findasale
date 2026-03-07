# Feedback-to-Feature Pipeline — FindA.Sale

Defines how beta organizer/shopper feedback becomes shipped product.

---

## Pipeline Overview

```
User Feedback (email, direct, in-app)
        ↓
findasale-cx — captures, categorizes, adds to feedback-log
        ↓
findasale-rd — evaluates feasibility (effort vs. impact)
        ↓
findasale-architect — designs approach (if approved)
        ↓
findasale-dev — implements
        ↓
findasale-qa — tests
        ↓
Patrick pushes → findasale-ops confirms
        ↓
findasale-cx — closes loop with user ("your feedback shipped")
```

---

## Capture (findasale-cx)

When Patrick says "organizer wants X" or "user complained about Y":
1. Spawn **findasale-cx** to log to `claude_docs/beta-launch/beta-status.md` feedback section.
2. CX categorizes: UX friction / missing feature / bug / content issue.
3. CX drafts acknowledgment reply for Patrick to send.

---

## Feasibility (findasale-rd)

For new feature requests:
- Spawn **findasale-rd** with: feature description, user quote, frequency ("3 of 5 organizers said this").
- RD evaluates: effort (hours), risk, alignment with "reduce organizer manual work" directive.
- RD output: APPROVE (high value, low effort) / DEFER (low value or high risk) / REJECT (off-mission).

---

## Design (findasale-architect)

Only for APPROVED requests that touch schema, new services, or cross-layer contracts:
- Spawn **findasale-architect** with RD's recommendation.
- Architect produces: schema changes needed, API contract, component spec.
- Architect output is the source of truth for Dev.

For small UX changes (no schema changes): skip Architect, go straight to Dev.

---

## Implementation & QA

Standard dev flow. QA gates before push. See `guides/incident-response.md` for handoff format.

---

## Closing the Loop

After shipping:
- Spawn **findasale-cx** with: feature description, deploy date.
- CX drafts "your feedback made it in" email for Patrick to send to the organizer.

This single action builds more loyalty than any marketing campaign.

---

## Priority Scoring (to rank competing requests)

Score = (Frequency × Impact) / Effort

- **Frequency:** How many users asked? (1 = one user, 5 = all beta users)
- **Impact:** How much does it reduce organizer manual work? (1 = cosmetic, 5 = saves hours)
- **Effort:** Dev hours estimate (1 = hour, 5 = week+)

Anything scoring ≥ 5 is high priority. Anything ≤ 2 goes to the backlog.

---

Last Created: 2026-03-06 (Opus fleet audit)
