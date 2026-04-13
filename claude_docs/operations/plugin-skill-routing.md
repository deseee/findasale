# Plugin Skill Routing Matrix

**Owner:** findasale-records
**Last Updated:** 2026-03-11
**Purpose:** Routing reference for the main session and all subagents. Documents which plugin skills each agent can delegate to, and when to use plugin skills directly vs. routing through a findasale-* subagent.

---

## Routing Principle

**Always prefer findasale-* subagents** for FindA.Sale work. They carry project context, know the stack, and produce output calibrated to the codebase. Plugin skills are supplementary — they extend an agent's capabilities, not replace its judgment.

**Use a plugin skill directly** (without a findasale-* subagent) only when:
- The task is clearly generic (e.g., "write SQL for this one-off query")
- No findasale-* agent owns that domain
- Patrick explicitly asks for a plugin-level output

---

## Agent → Plugin Skill Map

### findasale-architect
- engineering:architecture — ADRs, decision records
- engineering:system-design — New service or cross-layer feature design
- engineering:incident-response — Post-mortems only (as lesson-learner, not executor)
- operations:compliance-tracking — Pre-design compliance checks (payments, auth, user data)
- operations:risk-assessment — Architectural risk evaluation
- operations:change-management — Significant multi-package architectural changes

### findasale-qa
- engineering:code-review — Deep security/performance review before ship
- engineering:testing-strategy — Test plan design for complex features
- design:accessibility-review — WCAG 2.1 AA audits on organizer/shopper UI
- customer-support:customer-research — Customer impact assessment for bug prioritization
- data:validate — Statistical validation for metrics/analytics correctness

### findasale-dev
- engineering:code-review — Pre-QA self-review
- engineering:testing-strategy — Test coverage strategy alongside implementation
- engineering:documentation — API docs, inline docs, README updates
- engineering:tech-debt — Flag and categorize tech debt found during implementation
- operations:runbook — Operational runbooks for new background jobs/crons/services
- productivity:update — Session memory sync after significant implementation work

### findasale-marketing
- marketing:brand-voice / brand-voice:brand-voice-enforcement — Brand voice validation
- marketing:content-creation / marketing:draft-content — Content across all channels
- marketing:competitive-analysis / marketing:competitive-brief — Competitive positioning
- marketing:campaign-planning / marketing:campaign-plan — Structured campaign briefs
- marketing:performance-analytics / marketing:performance-report — Campaign metrics
- marketing:seo-audit — Keyword research, on-page analysis, content gaps
- marketing:email-sequence — Nurture flows and onboarding drips
- data:validate — Validate messaging resonance against customer data before launch

### findasale-rd
- product-management:competitive-analysis — Feature comparison, competitive positioning
- product-management:feature-spec — Feasibility assessments in PRD format
- product-management:user-research-synthesis — Synthesize user interviews and beta feedback
- data:statistical-analysis — Statistical rigor on market/competitor data
- data:explore-data — Profile datasets before drawing conclusions
- sales:account-research — Profile competitor customers and segment patterns

### findasale-support
- customer-support:ticket-triage — Structured P1–P4 triage
- customer-support:response-drafting — Professional customer-facing responses
- customer-support:knowledge-management — KB articles from resolved issues
- customer-support:escalation — Escalation packages for engineering/product/leadership
- customer-support:customer-research — Multi-source research before responding
- data:validate — Validate customer claims before escalating

### findasale-cx
- customer-support:response-drafting — Proactive onboarding communications (not reactive)
- customer-support:knowledge-management — Help docs, tutorials, onboarding guides
- customer-support:customer-research — Beta feedback synthesis
- operations:process-doc — Onboarding process and beta program documentation
- operations:status-report — Beta health and activation pattern reporting
- marketing:email-sequence — Welcome and nurture sequences
- data:validate — Beta metrics validation

### findasale-ux
- design:accessibility-review — WCAG 2.1 AA compliance audits
- design:design-critique — Usability and visual hierarchy feedback
- design:design-handoff — Developer specs from designs
- design:design-system-management — Design tokens and component library
- design:ux-writing — Microcopy, error messages, empty states, CTAs
- design:user-research — Research planning and interview guides
- product-management:user-research-synthesis — Synthesize research into opportunity areas

### findasale-ops
- engineering:incident-response — Incident triage, communication, postmortem
- engineering:deploy-checklist — Pre-deployment verification
- operations:runbook — Railway, Vercel, Neon, and Stripe operational runbooks
- operations:status-report — Infrastructure and deployment status
- operations:change-management — Change requests with rollback plans
- operations:capacity-plan — Infrastructure capacity forecasting
- data:explore-data — Historical incident pattern analysis
- data:validate — Post-deploy health validation

### findasale-hacker
- engineering:code-review — Security-focused deep code review
- engineering:incident-response — Security incident response and postmortem
- engineering:testing-strategy — Adversarial test case design
- operations:risk-assessment — Formal threat modeling
- operations:compliance-tracking — PCI-DSS, GDPR-adjacent, and platform compliance gaps
- data:validate — Evidence-based vulnerability demonstration

### findasale-records
- operations:runbook — Create/update operational runbooks
- operations:process-doc — Business process documentation (flowcharts, RACI, SOPs)
- operations:status-report — Session summaries and audit reports
- operations:change-management — Behavioral and architectural change documentation
- operations:process-optimization — Identify doc/process inefficiencies during audits
- productivity:memory-management — Session memory and context preservation

### findasale-legal
- operations:compliance-tracking — PCI-DSS, state regulations, consumer protection
- operations:risk-assessment — Legal and regulatory exposure risk
- operations:vendor-management — Third-party vendor contract review (Stripe, Cloudinary, Railway, Neon)
- operations:change-management — Legal impact assessment for significant platform changes

### findasale-advisory-board
- product-management:competitive-analysis — Market reality grounding for strategic decisions
- product-management:roadmap-management — Forward strategic lens: challenge roadmap direction from risk/metrics/competitive synthesis
- product-management:metrics-tracking — Board-level metrics definition and review
- operations:risk-assessment — Strategic risk identification
- data:create-viz — Visual backing for board recommendations (dashboards, charts)

### findasale-pitchman
- marketing:draft-content / marketing:content-creation — Sketch pitch assets, landing page concepts
- marketing:campaign-plan / marketing:campaign-planning — Turn ideas into campaign concepts
- product-management:roadmap-update — Understand current trajectory before ideating
- data:analyze — Ground ideas in usage patterns and data
- customer-support:customer-research — Customer pain point discovery for product ideas
- sales:create-an-asset — Proof-of-concept assets to make ideas actionable

### findasale-deploy
- engineering:deploy-checklist — Pre-deployment verification checklist
- operations:change-management — Change documentation for risky deployments
- operations:runbook — Deployment runbooks for Railway, Vercel, Neon

---

## Main Session Routing (When NOT to use a subagent)

Invoke plugin skills **directly from the main session** for:
- One-off SQL queries → data:write-query
- Quick data exploration → data:explore-data
- Ad hoc content drafts → marketing:draft-content
- Single accessibility check → design:accessibility-review
- One-time schedule setup → anthropic-skills:schedule

Invoke findasale-* subagents for:
- Any multi-step or project-context-dependent task
- Anything touching the codebase, schema, or production infra
- Strategic decisions, security reviews, architectural choices
- Customer-facing content and communications

---

## Deferred: findasale-sales-ops (Post-Beta)

A sales-ops agent has been proposed to own organizer outreach, pipeline review, and trial-to-insight conversion. Proposed plugin stack: sales:call-prep, sales:pipeline-review, sales:daily-briefing, sales:account-research, customer-support:customer-research, data:explore-data. Flagged for next planning session after beta launch.

---

*Changes to this file route through findasale-records. Last audited: 2026-03-11 by cowork-power-user.*
