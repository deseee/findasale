# Weekly Full-Site Audit — Methodology Update (S242)

## Previous Approach
The weekly audit focused on code-level QA: TypeScript compilation, dark mode class coverage, brand voice compliance, and security checklist items. This caught implementation issues but missed UX bugs that real users notice immediately.

**Result:** Patrick found 13 bugs in 10 minutes of clicking that two days of code-level audits missed.

## New Approach (Effective S242)

The weekly audit **prioritizes user-journey testing via Chrome MCP** over code-level checks. Real product health is measured by: Do the core flows work? Is data correct? Are CTAs clear? Does it feel finished?

### Updated Scheduled Task Description

```
task: weekly-full-site-audit
schedule: Every Monday 9:00 AM
dispatch: findasale-qa

Core flows to test each week (batched to stay within context):
1. Shopper flow: Browse → click sale → like item → verify like persists
2. Organizer flow: Create sale → add items → verify items appear
3. Messaging: Organizer sends → Shopper receives (test both sides)
4. Mobile & dark mode: All above flows on 375px viewport + dark mode toggle
5. Code-level gate: TypeScript compile + DECISIONS.md compliance only

Roles tested: Unauthenticated visitor, Shopper (user11@example.com),
Organizer (user2@example.com), TEAMS Organizer (user3@example.com),
Admin (user1@example.com) — all password123

Output: qa-findings-weekly-audit-[YYYY-MM-DD].md with P0/P1 findings,
screenshots, and shipping conditions.

BLOCKER STOP: If P0 found, pause new features. Fix before proceeding.
```

## What Changed

| Aspect | Before | After |
|--------|--------|-------|
| **Primary method** | Code review (grep, IDE) | Chrome MCP clickthrough |
| **What's tested** | Does code exist? | Does feature work for real users? |
| **Severity signal** | TypeScript errors | P0: User can't complete core task |
| **Test data** | Checked in code | Visible in UI — BLOCKER if exposed |
| **Mobile** | Optional | Mandatory (375px viewport) |
| **Multi-role** | If mentioned in PR | Mandatory for any inter-user feature |
| **Dark mode** | Component audit | Live toggle test + screenshot |
| **Output** | Table of errors | Findings with screenshots + severity |
| **Deployment gate** | Compiles = ship | P0 found = hold; P1 = ship-review |

## Why This Works for Beta

Beta testers (real estate sale organizers, shoppers) will spend 10 minutes
clicking around. If the product feels half-built, broken, or confusing, they
leave. Code compiling is table stakes — it doesn't prove the product works.

The new audit catches:
- Blank screens (empty search results with no CTA)
- Test data leaks ("Test Sale" visible to users)
- Silent failures (form submits, nothing happens, no error shown)
- Confusing flows (wrong button text, hidden features)
- Data mismatches (favorites show wrong sale, counts are off)
- Mobile breakage (buttons don't fit, horizontal scroll)
- Accessibility (form labels missing, dark mode text unreadable)

These are the issues that kill adoption.

## Batching (Context Efficiency)

Each weekly audit dispatch tests 2–3 user-journey flows plus cross-role
verification. Not "test everything" (that's 40k tokens), but:
- Week 1 (S242): Shopper flows + mobile
- Week 2 (S243): Organizer flows + TEAMS features
- Week 3 (S244): Messaging + cross-role interactions
- Week 4 (S245): Settings, profile, onboarding
- Rotate

After 4 weeks, all critical paths have been clickthrough-tested by QA.

## Handoff to Dev

If P0 found:
```
## BLOCKER GATE — findasale-dev dispatch required

P0: [clear description + screenshot]
User-journey test: [what broke + where]
Test data: [credentials used]
Environment: [live finda.sale]

Expected behavior: [what should happen]
Actual behavior: [what happens instead]

Fix conditions: [specific tests QA will run to verify]
```

Dev fixes and returns to QA for re-test same day.

## Meeting Notes

This shift aligns with Patrick's observation that code-level QA is necessary
but not sufficient. A feature can compile, have tests, follow patterns, and
still be broken for users. The new audit catches that gap.

Cost: Each audit dispatch uses Chrome MCP (interactive, slower than grep).
Benefit: Catches 13 bugs in 10 minutes vs. missing them for 2 days.

Net: More valuable QA signal per session.
