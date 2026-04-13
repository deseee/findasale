# Push Coordinator Skill — Implementation Notes

**Status:** Specification complete, ready for manual registration
**Date:** 2026-03-15
**ADR:** MANAGER_SUBAGENT_ARCHITECTURE.md

---

## Files Created

1. **`operations/push-coordinator-protocol.md`**
   - Full protocol specification for handoff format, workflow, error handling
   - Reference for main context integration
   - Location: writable, integrated into project docs

2. **`feature-decisions/FINDASALE_PUSH_COORDINATOR_SKILL_TEMPLATE.md`** (this file's sibling)
   - Skill prompt and instructions (SKILL.md format)
   - Ready to be moved to `.skills/skills/findasale-push-coordinator/SKILL.md`
   - Cannot be created directly in `.skills` (read-only filesystem)

3. **`feature-decisions/PUSH_COORDINATOR_IMPLEMENTATION_NOTES.md`** (this file)
   - Implementation guidance (you're reading it now)

---

## Next Steps — Manual Skill Registration

The `.skills` directory is read-only in the Cowork VM. To complete skill registration, **Patrick must perform this step locally:**

### On Windows PowerShell (from C:\Users\desee\ClaudeProjects\FindaSale)

```powershell
# 1. Copy skill template to correct location
$skillDir = ".\.skills\skills\findasale-push-coordinator"
mkdir -Force $skillDir

# 2. Copy template content to SKILL.md
# Read the template file:
#   claude_docs\feature-decisions\FINDASALE_PUSH_COORDINATOR_SKILL_TEMPLATE.md
# Copy its full content into:
#   .\.skills\skills\findasale-push-coordinator\SKILL.md

# 3. Verify skill is registered
git status
# Should show:
# 	new file:   .skills/skills/findasale-push-coordinator/SKILL.md
```

### Or Use Claude Code (one-line equivalent)

```bash
cp -r claude_docs/feature-decisions/FINDASALE_PUSH_COORDINATOR_SKILL_TEMPLATE.md \
      .skills/skills/findasale-push-coordinator/SKILL.md
```

### Verify Registration

After placement, the skill should:
- Appear in Cowork sidebar under "Skills" or "findasale-*"
- Be callable via `Skill('findasale-push-coordinator', handoff)`
- Appear in skill manifest at `.skills/manifest.json`

---

## Skill Description (for registration)

```
name: findasale-push-coordinator
description: >
  MCP push orchestration specialist. Validates file integrity using truncation
  gates, executes batched MCP pushes (≤3 files per call, ≤25k tokens total),
  and returns push summary. Delegate all file push coordination to this skill
  when main context has completed subagent work. Keeps main context lean by
  specializing in MCP orchestration only. Triggers: "push these files",
  "coordinate the push", "batch push", "push coordinator".
```

---

## Integration Checklist

After skill is registered, verify these items:

### [ ] Skill can be invoked
- Test: `Skill('findasale-push-coordinator', '## Handoff: [minimal test]')`
- Expected: Skill accepts input and returns "Validation failed: incomplete handoff" or similar

### [ ] Protocol document is findable
- Location: `operations/push-coordinator-protocol.md`
- Verify main context can reference it when preparing handoffs

### [ ] CORE.md updated (Phase 2 of ADR)
- **Optional in Session 169+** — can defer to next session
- Update §3 (Execution Rules) with MCP push delegation guidance
- Reference push-coordinator skill

### [ ] CLAUDE.md §5 updated (Phase 2 of ADR)
- **Optional in Session 169+** — can defer to next session
- Add note about pushing via findasale-push-coordinator instead of direct MCP

### [ ] Testing in Sessions 169–171
- Session 169: Dispatch findasale-dev (3 files) → coordinator → verify push
- Session 170: Multiple agents → coordinator → verify batching
- Session 171: Intentional truncation test → coordinator should catch and escalate

---

## Fallback (If Skill Registration Fails)

If the skill cannot be registered or invoked:

1. **Do NOT attempt to code around it** — this defeats the purpose
2. **Instead, revert to manual push pattern:**
   - Main context reads the protocol document
   - Main context performs truncation gate check locally
   - Main context calls `mcp__github__push_files` directly
   - Reduced efficiency (~75–80k per session), but functional

3. **Escalate to Patrick:**
   - "Skill registration didn't complete. Recommend manual review of .skills manifest."

---

## Session Planning

### Session 169 (first with skill)

**Goal:** Validate end-to-end coordinator workflow

1. Load `operations/push-coordinator-protocol.md` (reference)
2. Dispatch findasale-dev with 3 small files
3. After dev completes, invoke `findasale-push-coordinator` with handoff
4. Verify push succeeds and summary is received
5. Log: "findasale-push-coordinator: operational, 1 batch, 3 files pushed"

### Sessions 170–171

**Goal:** Validate batching, truncation gate, error handling

1. Session 170: Dispatch 2 agents in parallel → 5 files total → coordinator → verify batching (2 batches)
2. Session 171: Intentionally truncate a file, queue it → coordinator should catch and error → main context re-reads → re-queue → verify fix

---

## Documentation References

- **Full ADR:** `feature-decisions/MANAGER_SUBAGENT_ARCHITECTURE.md`
- **Protocol:** `operations/push-coordinator-protocol.md` (living reference)
- **Skill prompt:** `feature-decisions/FINDASALE_PUSH_COORDINATOR_SKILL_TEMPLATE.md` (→ becomes SKILL.md)
- **CORE.md §4:** Push Rules (authority on truncation gate, MCP limits)
- **CLAUDE.md §5:** MCP Tool Awareness (authority on when to use coordinator)

---

## Success Metrics

Once skill is active, measure these in session wraps:

| Metric | Baseline | Target |
|--------|----------|--------|
| Main context tokens per session | 75–80k | 60–75k |
| Compression events per 8 sessions | ~4 | ~1 |
| Average push batch time | 3–5k tokens | 5–8k tokens (coordinator overhead) |
| Net savings per 8-session cycle | — | ~5–12k tokens |

If metrics don't show improvement by Session 172, revisit skill design with Patrick.

---

## Questions or Blockers?

If issues arise during skill registration or testing:

1. **Check skill manifest** — `cat .skills/manifest.json | grep findasale-push`
2. **Verify file placement** — `ls -la .skills/skills/findasale-push-coordinator/`
3. **Test invocation** — `Skill('findasale-push-coordinator', 'test')`
4. **Escalate to Patrick** if skill doesn't appear or throws errors

---

**Status:** Ready for implementation
**Next action:** Manual skill registration (Patrick)
**Timeline:** Sessions 169–171 for validation
