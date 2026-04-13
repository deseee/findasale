# QA Skill Patch — S239

**Purpose:** Add Beta-Tester Perspective gate + DECISIONS.md compliance check + multi-endpoint testing to findasale-qa SKILL.md.

**Instructions:** Append the following sections to the END of `findasale-qa/SKILL.md` (after the "Plugin Skill Delegation" section).

---

## APPEND THIS TO findasale-qa/SKILL.md:

```markdown
---

## DECISIONS.md Compliance Check (mandatory — added S239)

Before starting ANY QA review, read:
```bash
cat $PROJECT_ROOT/claude_docs/brand/DECISIONS.md
```

For each decision that applies to the feature under review, add a compliance row to your verdict:

```
### Decision Compliance
| Decision | Status | Notes |
|----------|--------|-------|
| D-002 (Dark Mode) | ✅ PASS | All components have dark: variants |
| D-005 (Multi-Endpoint) | ❌ FAIL | Only organizer side tested |
| D-001 (Brand Voice) | ⚠️ WARN | "estate sale" appears without other sale types |
```

A FAIL on any applicable decision = BLOCKER in your verdict.

---

## Beta-Tester Perspective Gate (mandatory exit check — added S239)

Before issuing your verdict, complete this additional review from the perspective of a first-time beta tester who has never seen FindA.Sale before:

### The Beta Tester Test
Imagine you are one of these people encountering this feature for the first time:
1. **Sarah** — estate sale company owner, 55, moderately tech-savvy, skeptical of new tools
2. **Mike** — weekend garage sale host, 35, uses his phone for everything, expects things to "just work"
3. **Jade** — treasure hunter/shopper, 28, browses on mobile while walking through sales

For each persona that would encounter this feature, ask:
- Would they understand what to do without instructions?
- Would anything confuse or frustrate them?
- Would they encounter a blank screen, missing state, or dead end?
- Does the feature look complete and intentional, or half-built?
- In dark mode at 10pm, can they read everything?
- On their phone at a sale, does the layout work?

### In Verdict, add:
```
### Beta Tester Perspective
- Sarah (organizer): Would understand the flow. Dashboard metric labels are clear. ✅
- Mike (host): Mobile layout breaks on sale creation — form buttons below fold. ❌ BLOCKER
- Jade (shopper): Empty search results show "No data" with no CTA. ⚠️ WARN
```

If ANY persona would have a bad experience = minimum WARN. If they'd be blocked from completing a core task = BLOCKER.

---

## Multi-Endpoint Testing (mandatory for inter-user features — added S239)

If the feature under review involves communication, interaction, or shared data between users/roles/teammates, this section is MANDATORY.

### Requirements:
1. **Identify ALL participant roles** for the feature (e.g., sender + receiver, admin + member, organizer + shopper)
2. **Verify the feature works from EVERY participant's perspective:**
   - Does data appear correctly on both/all sides?
   - Is the UI appropriate for each role?
   - Can each participant complete their part of the interaction?
3. **Test bidirectional flows:**
   - Message sent → appears in recipient's inbox
   - Review posted → appears on organizer's sale page
   - Team invite sent → appears in member's pending invites
   - Notification triggered → received by correct user
4. **Test edge cases at each endpoint:**
   - Deletion: what happens on the other side?
   - Offline: is data available when the other party comes back?
   - Permission changes: what if roles change mid-flow?
   - Capacity: for team features, test with 1 member, multiple members, and at team cap

### In Verdict, add:
```
### Multi-Endpoint Verification
| Flow | From | To | Status | Notes |
|------|------|----|--------|-------|
| Send message | Organizer | Shopper | ✅ | Appears in inbox |
| Reply | Shopper | Organizer | ✅ | Thread updates correctly |
| Delete message | Organizer | — | ⚠️ | Shopper's copy persists (is this intended?) |
| Team invite | Admin | Member | ❌ | Member sees no pending invites — BLOCKER |
```

Missing or broken endpoint = BLOCKER. Ambiguous behavior (delete propagation) = flag for decision by Patrick or Architect.
```
