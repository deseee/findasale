# E14: Model Selection Per Agent — Research & Recommendations

Created: Session 96 (2026-03-09)
Status: Complete
Backlog ref: E14

---

## Context

Forum advice: "Specify the model for each agent — for some, Sonnet or Haiku
is more than enough." Currently all subagents use the parent session's model.

## Cowork Model Routing Reality

### What's Possible

1. **Parent session model:** Set by Claude (Cowork defaults to the plan's model).
   Pro plan = Opus or Sonnet depending on availability/throttling.

2. **Subagent model (Agent tool):** The Agent tool documentation doesn't expose
   a `model` parameter for subagent type selection. Subagents inherit the parent's
   model. **Model routing per subagent is NOT currently possible in Cowork.**

3. **Skill tool:** Skills invoke subagents that inherit the parent model.
   No model override.

4. **Claude Code CLI (headless):** `claude -p "prompt" --model sonnet` would
   allow model selection, but this runs outside Cowork sessions.

### What CORE.md §12 Says

The existing model-routing.md says "Sub-agents accept `model: "haiku"` parameter
in the Task tool." This may be stale or aspirational — the `Agent` tool in Cowork
doesn't document this parameter. **Verify and correct if needed.**

## Recommendation Per Agent (If Routing Becomes Available)

| Agent | Recommended Model | Rationale |
|-------|------------------|-----------|
| findasale-architect | Opus | Novel design decisions, cross-layer reasoning |
| findasale-dev | Sonnet | Code implementation, well-defined patterns |
| findasale-qa | Sonnet | Test writing, verification against known patterns |
| findasale-ops | Haiku | Operational lookups, env var checks, log reading |
| findasale-records | Haiku | File audits, documentation updates |
| findasale-marketing | Sonnet | Content creation, tone matching |
| findasale-ux | Sonnet | UX analysis, flow design |
| findasale-rd | Opus | Research requiring synthesis across sources |
| findasale-hacker | Opus | Adversarial reasoning, creative threat modeling |
| findasale-pitchman | Opus | Creative ideation, lateral thinking |
| findasale-advisory-board | Sonnet | Structured analysis, perspective simulation |
| health-scout | Sonnet | Pattern matching against known vulnerability types |
| findasale-support | Haiku | Template-based responses, FAQ lookup |
| findasale-cx | Haiku | Onboarding templates, feedback collection |
| findasale-legal | Sonnet | Compliance analysis, risk flagging |
| findasale-workflow | Sonnet | Process analysis, rule design |
| findasale-deploy | Haiku | Checklist execution, pre-deploy verification |

### Cost Estimate

If model routing were available and used optimally:
- ~30% of subagent calls could use Haiku (4-5x cheaper)
- ~50% could use Sonnet (2-3x cheaper than Opus)
- ~20% need Opus (architecture, security, creative work)

Estimated token savings: 40-60% reduction in subagent costs.

## Current Actionable Steps

1. **Verify CORE.md §12 accuracy.** Does the Agent tool actually accept a model
   parameter? If not, update §12 to reflect reality.
2. **For now:** The skill routing priority (CORE.md §9) already helps — custom
   skills with tighter prompts produce better results regardless of model.
3. **Monitor:** When Cowork adds model selection for subagents, apply the
   table above immediately.
4. **GitHub Actions alternative:** For tasks that don't need interactive context
   (automated scans, scheduled reports), use Claude Code headless mode via
   GitHub Actions with explicit model selection. This IS possible today.
