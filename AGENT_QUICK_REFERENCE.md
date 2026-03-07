# Agent Quick Reference — FindA.Sale

The 12-agent fleet at a glance. When in doubt: **findasale-workflow** knows which agent to use.

---

## Feature Development Pipeline

**Full sequence for new user-facing features:**
```
findasale-ux (design) → findasale-architect (architecture) → findasale-dev (code) → findasale-qa (test)
```

**Skip architect** if the feature doesn't touch schema, new services, or cross-layer contracts.
**Skip ux** if it's a backend-only change or a well-spec'd bug fix.

---

## Agent → Task Map

| When Patrick says... | Trigger | Key phrases |
|---|---|---|
| Build / fix code | **findasale-dev** | implement, fix bug, add endpoint, create component |
| Test / verify code | **findasale-qa** | test, QA, does this work, is this safe to merge |
| New feature design | **findasale-architect** | schema change, design this feature, is this architecture sound |
| Server down / deploy broken | **findasale-ops** | Railway isn't deploying, set env var, check logs, migration |
| Ready to ship | **findasale-deploy** | deploy, push to production, release, go live |
| Write/review docs or rules | **findasale-records** | update STATE.md, audit docs, CLAUDE.md wrong, log what we did |
| Content / copy / brand | **findasale-marketing** | blog post, social posts, email campaign, ad copy |
| Research / feasibility | **findasale-rd** | research this, is this feasible, what are competitors doing |
| UX review / flow design | **findasale-ux** | does this flow make sense, wireframe, UX review |
| Beta onboarding / feedback | **findasale-cx** | onboard organizer, beta user not activating, collect feedback |
| Legal / compliance | **findasale-legal** | is this legal, compliance check, do we need a disclaimer |
| User has a problem | **findasale-support** | organizer emailed, user can't log in, write support response |

---

## Meta-Agents (Run Automatically or On Demand)

| Agent | Purpose | Frequency |
|---|---|---|
| **findasale-workflow** | Audit and fix workflow inefficiencies | Monthly or "why is this slow?" |
| **health-scout** | Security + code quality scan | Weekly auto (Sunday 11pm) |
| **context-maintenance** | Keep context.md / STATE.md accurate | Session wrap or "update docs" |
| **findasale-records** | Gate all behavior-shaping changes | "audit docs", "update CLAUDE.md" |

---

## Multi-Agent Patterns

**New feature:** UX spec → Architect review → Dev builds → QA tests → Deploy
**Schema change:** **Always architect first** — "add a field" routes to architect, not dev
**Beta launch prep:** CX (onboarding plan) + Legal (compliance check) + Deploy (checklist)
**Recurring bug:** Support (classify) → QA (audit) → Dev (fix)
**Improve a skill:** Proposing agent (draft) → Records (gate) → Patrick (approve) → Records (package)

---

## "Not Sure Which Agent?" Troubleshooting

- **"I want to change how Claude behaves"** → findasale-records
- **"I want to improve a skill"** → draft your suggestion → findasale-records reviews
- **"Claude keeps asking me things it should know"** → findasale-workflow
- **"The workflow feels broken"** → findasale-workflow
- **"I don't know which agent to use"** → findasale-workflow

---

## Scheduled Automation (no trigger needed)

| Task | Runs |
|---|---|
| Health scan | Weekly — Sunday 11pm |
| Market & tech intelligence | Weekly — Monday 8am |
| UX spot check | Weekly — Wednesday 9am |
| Monthly feature digest | Monthly — 1st at 9am |
| Context freshness check | Daily — 8am |
| Nightly context refresh | Daily — 2am |
| Workflow retrospective | Monthly — 8th at 9am |

---

*Last updated: 2026-03-06 (session 85 — Opus fleet audit implementation)*
