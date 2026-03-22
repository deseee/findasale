# Dev Skill Patch — S239

**Purpose:** Add Human-Ready Gate + DECISIONS.md mandatory read + multi-endpoint testing requirement to findasale-dev SKILL.md.

**Instructions:** Append the following sections to the END of `findasale-dev/SKILL.md` (before the "What Not To Do" section at line 232).

---

## APPEND THIS TO findasale-dev/SKILL.md:

```markdown
---

## §14 DECISIONS.md Pre-Flight (mandatory — added S239)

Before implementing ANY user-facing feature, read:
```bash
cat $PROJECT_ROOT/claude_docs/brand/DECISIONS.md
```

Identify which decisions apply to your task. List them in your handoff:
```
### Applicable Decisions
- D-002 (Dark Mode): all new components need dark: variants
- D-005 (Multi-Endpoint): messaging feature — test from both organizer and shopper
```

If your implementation would violate a standing decision, STOP and flag it. Decisions are not suggestions — they are constraints.

---

## §15 Human-Ready Gate (mandatory exit check — added S239)

Before writing your handoff summary, verify EVERY item on this checklist for any user-facing code you wrote. This is not optional. A feature that compiles but fails this gate is not done.

### Checklist (all must be checked for user-facing features)

- [ ] **Dark mode (D-002):** Every color class (`text-*`, `bg-*`, `border-*`) has a `dark:` variant
- [ ] **Mobile (D-004):** Layout works at 375px. No fixed widths without responsive breakpoints. Tap targets ≥44px
- [ ] **Empty states (D-003):** Every list/grid/data component has an empty state with a CTA
- [ ] **Loading states (D-008):** Every data-fetching component shows a loading indicator
- [ ] **Error states (D-009):** Every error has a human-readable message + recovery action
- [ ] **Brand voice (D-001):** No estate-sale-only language. Copy matches brand voice guide
- [ ] **Multi-endpoint (D-005):** If this feature involves interaction between users/roles, identify ALL participant perspectives and verify each works

### Enforcement
If ANY item is unchecked:
1. Fix it before returning handoff
2. If you can't fix it (needs architect/design input), mark it as BLOCKER in handoff
3. Never return a handoff with an unchecked Human-Ready item and no explanation

### In Handoff Summary, add:
```
### Human-Ready Gate
- [x] Dark mode — verified, all components have dark: variants
- [x] Mobile — verified at 375px, no overflow
- [x] Empty states — added empty state to ItemGrid
- [x] Loading states — skeleton added to SaleList
- [x] Error states — retry button on API failure
- [x] Brand voice — no violations found
- [ ] Multi-endpoint — N/A (not a multi-user feature)
```

---

## §16 Multi-Endpoint Testing (mandatory for inter-user features — added S239)

If the feature you are implementing involves ANY of the following, this section is mandatory:
- Messaging between users (organizer↔shopper, team member↔team member)
- Team features (admin↔member interactions)
- Reviews/ratings (poster↔subject)
- Live bidding (auctioneer↔bidder)
- Notifications (trigger↔recipient)
- Any shared data between roles

### Requirements:
1. **Identify all participant roles** in your plan before writing code
2. **Implement the complete flow from each role's perspective** — not just the "happy path" from one side
3. **Verify data appears correctly at every endpoint:**
   - Message sent → message received and displayed
   - Team invite sent → invite appears in member's view
   - Review posted → review appears on organizer's sale page
4. **Test edge cases for each endpoint:**
   - What if one participant deletes their side?
   - What if one participant is offline when data arrives?
   - What if permissions change mid-flow?
5. **Document which endpoints you tested** in your handoff summary

### In Handoff Summary, add (for multi-endpoint features):
```
### Multi-Endpoint Verification
- Organizer sends message → Shopper sees in inbox ✓
- Shopper replies → Organizer sees reply in thread ✓
- Organizer deletes message → Shopper's copy: [behavior documented]
- Edge: shopper offline → message queued and visible on next login ✓
```
```
