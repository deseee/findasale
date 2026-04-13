# findasale-push-coordinator Skill — Delivery Summary

**Date Created:** 2026-03-15
**Status:** Specification complete, ready for implementation
**Deliverables:** 3 files + implementation guidance
**Authority:** MANAGER_SUBAGENT_ARCHITECTURE.md (ADR 2026-03-15)

---

## Deliverables Overview

### 1. Protocol Document
**File:** `claude_docs/operations/push-coordinator-protocol.md` (15 KB)

Complete specification for the push coordinator workflow:
- When to dispatch (main context decision point)
- Handoff format (structured block with file manifests)
- Coordinator workflow (validate → batch → push → report)
- Output format (push summary for main context)
- Error handling (truncation risk, MCP failure, incomplete handoff)
- Integration with main context
- Example walkthroughs

**Audience:** Main context (before dispatching coordinator), coordinator skill itself (reference), Patrick (understanding the pattern)

**Authority:** CORE.md §4, CLAUDE.md §5

---

### 2. Skill Prompt Template
**File:** `claude_docs/feature-decisions/FINDASALE_PUSH_COORDINATOR_SKILL_TEMPLATE.md` (12 KB)

Complete SKILL.md prompt for the findasale-push-coordinator skill:
- Role definition (MCP push orchestration specialist)
- Responsibility (validate, batch, push, report)
- Setup section (project paths)
- Detailed workflow (4 phases: intake, truncation gate, batching, MCP execution)
- Output format with example
- Constraints (9 hard rules)
- Error handling procedures
- Example walkthroughs
- Integration notes

**Audience:** The skill itself (loaded at invocation)

**Action required:** Patrick must copy this to `.skills/skills/findasale-push-coordinator/SKILL.md` (see implementation notes below)

---

### 3. Implementation Notes
**File:** `claude_docs/feature-decisions/PUSH_COORDINATOR_IMPLEMENTATION_NOTES.md` (6.6 KB)

Guidance for manual skill registration and testing:
- File locations and what each does
- Step-by-step registration instructions (Windows PowerShell)
- Skill description for manifest
- Integration checklist (4 items)
- Fallback if skill registration fails
- Session planning (Sessions 169–171 validation)
- Success metrics
- Troubleshooting

**Audience:** Patrick (implementation), team leads (first invocation)

---

## How the Pieces Fit Together

### Main Session Context Workflow

```
Main context reads CORE.md §4 (Push Rules)
  ↓
Dispatches findasale-dev, findasale-qa, etc.
  ↓
Agents produce file outputs
  ↓
Main context prepares structured handoff
  (Uses format from: operations/push-coordinator-protocol.md §Handoff Format)
  ↓
Main context invokes: Skill('findasale-push-coordinator', handoff)
  ↓
[Coordinator skill loads FINDASALE_PUSH_COORDINATOR_SKILL_TEMPLATE.md as SKILL.md]
  ↓
Coordinator executes workflow (validate → batch → push → report)
  (Follows: FINDASALE_PUSH_COORDINATOR_SKILL_TEMPLATE.md §Workflow)
  ↓
Coordinator returns summary to main context
  (Format from: operations/push-coordinator-protocol.md §Output Format)
  ↓
Main context processes summary and continues work
```

### Reference Stack

For implementation and future reference:

| Document | Audience | Purpose |
|----------|----------|---------|
| MANAGER_SUBAGENT_ARCHITECTURE.md | Decision makers, architects | Why this pattern exists, token impact analysis, implementation plan |
| push-coordinator-protocol.md | Main context, coordinator | Detailed protocol and handoff format |
| FINDASALE_PUSH_COORDINATOR_SKILL_TEMPLATE.md | Coordinator skill | Skill instructions (becomes SKILL.md) |
| PUSH_COORDINATOR_IMPLEMENTATION_NOTES.md | Patrick, implementer | How to register skill, testing plan |
| CORE.md §4 | Authority | Push Rules (truncation gate, MCP limits) |
| CLAUDE.md §5 | Authority | When to use coordinator vs direct MCP |

---

## File Locations

```
claude_docs/
├── feature-decisions/
│   ├── MANAGER_SUBAGENT_ARCHITECTURE.md ← ADR (already exists)
│   ├── FINDASALE_PUSH_COORDINATOR_SKILL_TEMPLATE.md ← NEW (skill prompt)
│   ├── PUSH_COORDINATOR_IMPLEMENTATION_NOTES.md ← NEW (how to register)
│   └── PUSH_COORDINATOR_DELIVERY_SUMMARY.md ← NEW (this file)
│
└── operations/
    └── push-coordinator-protocol.md ← NEW (detailed protocol)
```

---

## Implementation Steps (for Patrick)

### Step 1: Review Specification
- Read: `feature-decisions/PUSH_COORDINATOR_IMPLEMENTATION_NOTES.md`
- Skim: `operations/push-coordinator-protocol.md` (reference)

### Step 2: Register Skill
Follow instructions in `PUSH_COORDINATOR_IMPLEMENTATION_NOTES.md`:
```bash
# From PowerShell in C:\Users\desee\ClaudeProjects\FindaSale
mkdir -Force .\.skills\skills\findasale-push-coordinator
# Copy content of FINDASALE_PUSH_COORDINATOR_SKILL_TEMPLATE.md to:
#   .\.skills\skills\findasale-push-coordinator\SKILL.md
```

### Step 3: Verify Registration
- Skill appears in sidebar
- Can invoke: `Skill('findasale-push-coordinator', 'test handoff')`

### Step 4: Test (Sessions 169–171)
Follow testing plan in `PUSH_COORDINATOR_IMPLEMENTATION_NOTES.md`

---

## Key Design Decisions

### Why This Approach?

**Problem:** Main context bloats from MCP orchestration → compression events → token waste

**Solution:** Delegate MCP push coordination to specialized skill
- Keeps main context lean (60–75k vs 75–80k per session)
- Prevents compression events (~1 per 8 sessions vs 1 per 2 sessions)
- Saves ~5–12k tokens per 8-session cycle

### Why Not a Full Manager Subagent?

Cowork doesn't support nested agent spawning (skills can't spawn other skills). The lightweight coordinator pattern achieves 80% of the benefit at 5% of the complexity.

### Truncation Gate (Critical)

The mandatory truncation gate (currentLineCount < remoteLineCount × 0.8) is the #1 production safety measure:
- Session 166: schema.prisma truncated (418 → 89 lines) → build failed
- Session 167: itemController.ts truncated (939 → partial) → required recovery
- Coordinator enforces this check before every push

---

## Security & Compliance

### What the Coordinator Validates
- ✓ File integrity (truncation gate)
- ✓ MCP push success
- ✓ Commit integrity

### What the Coordinator Does NOT Validate
- ✗ Secret/credential checking (main context responsibility)
- ✗ Code quality (pre-push responsibility)
- ✗ Business logic (not the coordinator's role)

**Secret handling:** Main context is responsible for ensuring `.env` and API keys are not in push payloads. Coordinator pushes exactly as received — it's the last safety check but NOT the first.

---

## Token Budget Impact

### Before Coordinator
```
Session average: 75–80k tokens (main context only)
Compression event: 1 per 2 sessions (~13–17k overhead per event)
Push overhead: ~2–5k per MCP call (batching + validation in main)
Efficiency: 75–95% of budget per session
```

### After Coordinator
```
Session average: 60–75k tokens (main context)
Coordinator overhead: ~5–8k tokens per batch
Compression event: ~1 per 8 sessions (estimated)
Total efficiency: 35–45% of main context used per session
Net savings: ~5–12k per 8-session cycle
```

---

## Success Criteria (Session 169+)

### Functional
- [ ] Skill invokes and receives handoff without error
- [ ] Truncation gate validation executes
- [ ] MCP push_files calls execute successfully
- [ ] Summary returns to main context
- [ ] No files corrupted in push

### Efficiency
- [ ] Main context ≤75k tokens per session (baseline was 75–80k)
- [ ] Coordinator overhead ≤8k tokens per batch
- [ ] Net compression prevention (fewer compressions in 8 sessions)

### Reliability
- [ ] Truncation gate catches invalid files (test with intentional truncation)
- [ ] MCP failures handled gracefully
- [ ] Summary format consistent

---

## References & Authority Chain

```
MANAGER_SUBAGENT_ARCHITECTURE.md (ADR)
  ↓
  Specifies findasale-push-coordinator pattern
  ↓
  push-coordinator-protocol.md (detailed protocol)
  ↓
  FINDASALE_PUSH_COORDINATOR_SKILL_TEMPLATE.md (skill implementation)

CORE.md §4 (Push Rules)
  ↓
  Truncation gate mandatory
  ↓
  Embedded in coordinator validation workflow

CLAUDE.md §5 (MCP Tool Awareness)
  ↓
  When to use coordinator vs direct push
  ↓
  Integration with main context dispatcher
```

---

## Next Actions

### Immediate (this session)
- ✓ ADR complete
- ✓ Protocol document written
- ✓ Skill prompt template created
- ✓ Implementation guidance provided

### Patrick (local machine)
- Register skill (copy SKILL.md to `.skills` directory)
- Verify skill appears in sidebar
- Plan testing sessions (169–171)

### Session 169+
- Invoke coordinator on first subagent batch
- Validate truncation gate execution
- Measure token savings
- Log results

---

## Questions / Follow-up

If Patrick needs clarification:
- Protocol behavior: see `operations/push-coordinator-protocol.md`
- Skill instructions: see `FINDASALE_PUSH_COORDINATOR_SKILL_TEMPLATE.md`
- How to register: see `PUSH_COORDINATOR_IMPLEMENTATION_NOTES.md`
- Why this design: see `feature-decisions/MANAGER_SUBAGENT_ARCHITECTURE.md` (ADR)

---

**Status:** Ready for implementation
**Approval required:** Patrick (to register skill)
**Timeline:** Sessions 169–171 for validation and measurement
**Last updated:** 2026-03-15
