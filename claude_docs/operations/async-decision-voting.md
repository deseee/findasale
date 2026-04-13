# Async Decision Voting — Non-Reversible Decision Protocol

**Status:** Active | **Updated:** 2026-03-11

---

## Purpose

Non-reversible decisions (locked architecture, feature deletion, pricing, security policy) require distributed consent. This protocol collects votes async within a session and surfaces dissent.

---

## Scope

**This protocol applies to:**
- Architecture decisions (locked design patterns, API contracts, schema)
- Feature deletion (once removed, recovery is expensive)
- Pricing changes (impacts customer relationships)
- Security policy (governs access, data handling)
- Public commitments (roadmap, SLA, brand statements)

**NOT for:**
- Implementation details (how to refactor a module)
- Formatting choices (variable names, code style)
- Reversible decisions (feature flags, temporary toggles)
- Routine operations (daily maintenance, standard bug fixes)

---

## Voting Mechanism

Each relevant agent votes:

| Vote | Meaning | Example |
|------|---------|---------|
| **+1** | Support the decision | "Yes, this aligns with customer needs" |
| **-1** | Oppose the decision | "This breaks our security model" |
| **0** | Abstain (not my domain) | "I don't have relevant expertise" |

Each vote includes a **one-sentence rationale** — why you voted that way.

---

## Vote Outcomes

| Result | Action | Example |
|--------|--------|---------|
| **Unanimous +1** | Proceed. Note strong consensus in decisions-log.md | All 5 agents agree: ship it |
| **Mostly +1, 0s** | Proceed. Note which abstained | 4 +1, 1 abstain: consensus clear |
| **Any -1** | **ALWAYS surface to Patrick**, even if outvoted | 4 +1, 1 -1: flag both the vote and the dissent to Patrick |
| **Majority -1** | Patrick decides; do not proceed without explicit approval | 3 -1, 2 +1: Patrick must choose |

**Critical rule:** Dissenting votes (-1) are MANDATORY to surface. Patrick sees the full picture.

---

## How It Works in Practice

1. **Decision proposed** — Agent or session identifies a non-reversible decision
2. **Scope check** — Is this in scope? (Use checklist above)
3. **Dispatch voting** — Main session sends decision to all relevant agents with ballot
4. **Agents respond** — Each agent votes (+1/0/-1) + one-sentence rationale
5. **Log votes** — All votes recorded in decisions-log.md with agent name and rationale
6. **Surface dissent** — If any -1, flag to Patrick with the dissenter's reasoning highlighted
7. **Patrick decides** — If consensus, proceed. If -1 present, Patrick acknowledges and either:
   - Accepts dissent, reconsiders decision
   - Accepts risk, proceeds with decision (and notes Patrick's override in log)
   - Defers decision pending more research

---

## Voting Format

In decisions-log.md, record as:

```markdown
### Decision: [Title]
**Date:** 2026-03-11
**Category:** [Architecture/Pricing/Security/Feature/Commitment]

**Votes:**
- Customer Champion: +1 "This removes a manual step for organizers"
- Dev: +1 "Doable within current stack"
- QA: -1 "Breaks existing test suite — needs migration plan"
- Architect: +1 "Aligns with long-term schema design"

**Outcome:** 3 +1, 1 -1 → **FLAG TO PATRICK** with QA dissent highlighted
**Patrick decision:** [proceed/defer/reconsider]
```

---

## Voting is Async Within Sessions Only

- Agents return votes as part of their output in the same session
- Votes do not carry across sessions
- If quorum unavailable (agent error, timeout), note in log and ask Patrick to proceed at own risk

