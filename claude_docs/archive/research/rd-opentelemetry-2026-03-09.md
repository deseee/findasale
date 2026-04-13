# RD: Claude Cowork OpenTelemetry — Session Token & Cost Tracking Feasibility

**Date:** 2026-03-09
**Author:** R&D Agent
**Status:** Complete

---

## Summary Recommendation

**MONITOR** — OTel support is real but **enterprise-gated**; solo Cowork users cannot access session-level token counts via OTel. Existing E2 solutions (`/cost`, `/context` commands) remain primary. Revisit if Anthropic releases per-user OTel access.

---

## What OTel Actually Exposes

Anthropic Claude Code / Cowork now exports OpenTelemetry metrics & events via OTLP (OpenTelemetry Protocol):

| Data | Available? | Notes |
|------|-----------|-------|
| **Per-session token counts** | ✅ Yes | Metrics: `claude_code.token.usage` (input/output/cache breakdown) |
| **Per-session costs** | ✅ Yes | Metric: `claude_code.cost.usage` (in USD) |
| **Tool call details** | ✅ Yes | Events: tool names, execution time, success/fail |
| **Session duration** | ✅ Yes | `claude_code.active_time.total` (user vs. CLI time) |
| **Model identification** | ✅ Yes | Attribute: `model` (e.g., `claude-sonnet-4-6`) |

The data is **granular and real** — not estimates.

---

## Is It Accessible to Solo Cowork Users?

**No — currently enterprise/admin-only.**

**Evidence:**

1. **Admin configuration required:** All OTel setup requires environment variables (`CLAUDE_CODE_ENABLE_TELEMETRY=1`, OTLP endpoints, auth headers). These **must be configured by administrators** via managed settings files or MDM (Mobile Device Management).

2. **OTLP collector backend required:** To export telemetry, you need a running OTLP collector service (e.g., Docker Otel Collector, Honeycomb, Datadog). Solo users cannot unilaterally add this to their local Cowork setup.

3. **No built-in dashboard:** OTel exports raw metrics/events to backends. There's no "View my session tokens" UI within Cowork for individual users.

4. **Docs focus on teams/orgs:** The monitoring guide emphasizes "cost per team," "multi-team attributes," "cost centers," and centralized billing — all organizational concepts.

**Status:** OTel is **infrastructure-level observability** for teams managing Claude Code at scale, not a personal tool.

---

## Impact on E12.5 (Token Efficiency Ratio Tracking)

**Cannot replace current TER estimates.**

E2 research showed:
- `/cost` provides per-session spend ($ + token estimate)
- `/context` shows context window breakdown
- These are **already available to solo users** now

OTel would provide more precise token accounting **if deployed**, but requires external infrastructure (collector, backend, etc.) that FindA.Sale doesn't have.

**E12.5 should:**
- Continue using `/cost` + `/context` output at session wrap
- Record manually in session-log.md (low overhead)
- Not pursue OTel for solo operator use case

---

## Could We Wire OTel Into findasale-records or cowork-power-user?

**Not practically.** A skill cannot:
- Configure environment variables for the Cowork session process itself
- Require a user to spin up external OTLP infrastructure (Docker Collector, Honeycomb account, etc.)
- Access or parse telemetry exports that live outside the Cowork session

**Workaround if enterprise deployment happens:** If FindA.Sale ever becomes a team/SaaS product with multiple users, OTel could be wired into deployment scripts. But for solo operator, stick with E2 methods.

---

## Next Steps

1. **Update E2 findings:** Note that OTel exists but is not solo-user accessible (Feb 2026 status).
2. **Keep E12.5 simple:** Use `/cost` at session wrap; record TER manually in session-log.md per E2 recommendations.
3. **Flag for re-evaluation:** If Anthropic releases per-user OTel access or a public dashboard in future releases, revisit.

---

## Sources

- [Claude Code Monitoring Docs](https://code.claude.com/docs/en/monitoring-usage) — Official OpenTelemetry integration guide (Feb 2026)
- [Anthropic Cowork OTel Enterprise Announcement](https://www.eesel.ai/blog/claude-cowork-plugins-updates) — Enterprise focus confirmed
- E2 research (Session 96, 2026-03-09) — Current solo-user token monitoring solutions

---
