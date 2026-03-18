# Skill & Plugin Roster Recommendation

*Created: 2026-03-09 (session 95, backlog E15). Tier 3 — archive after decision applied.*

---

## Current State

16+ plugin skill categories are enabled (marketing, engineering, product-management, sales, productivity, enterprise-search, customer-support, design, operations, brand-voice, finance, data). Each category has 3–7 individual skills. Combined with 19 FindA.Sale custom skills and 5 document creation skills, the available skills list exceeds 100 entries.

**Problem:** Skill bloat slows discovery, wastes tokens loading irrelevant descriptions, and creates confusion about which tool to use (e.g., `findasale-marketing` vs `marketing:content-creation` vs `marketing:brand-voice`).

---

## Audit: Which Skills Are Actually Used?

**Actively used (sessions 89–94):**
- All `findasale-*` custom skills — core fleet, used every session
- `health-scout` — weekly scans + pre-deploy
- `conversation-defaults` — every session (always-active)
- `dev-environment` — every session with shell commands
- `context-maintenance` — session wraps
- `skill-creator` — skill optimization (session 91)
- `docx`, `xlsx`, `pptx`, `pdf` — document creation as needed
- `schedule` — scheduled task creation

**Never invoked (sessions 89–94):**
- `marketing:*` (6 skills) — `findasale-marketing` covers this
- `engineering:*` (6 skills) — `findasale-dev` + `findasale-qa` + `health-scout` cover this
- `product-management:*` (6 skills) — Patrick + `findasale-architect` cover this
- `sales:*` (6 skills) — not applicable to FindA.Sale's current stage
- `productivity:*` (2 skills) — session-log + STATE.md serve this function
- `enterprise-search:*` (3 skills) — no enterprise data sources connected
- `customer-support:*` (5 skills) — `findasale-support` + `findasale-cx` cover this
- `design:*` (6 skills) — `findasale-ux` covers this
- `operations:*` (6 skills) — `findasale-ops` covers this
- `brand-voice:*` (3 skills) — `findasale-marketing` covers brand voice
- `finance:*` (6 skills) — not applicable (no accounting workflows)
- `data:*` (7 skills) — not applicable yet (no data warehouse)
- `cowork-plugin-management:*` (2 skills) — only needed when creating plugins

---

## Recommendation

### KEEP (always loaded)
- All `findasale-*` custom skills (19)
- `health-scout`, `conversation-defaults`, `dev-environment`, `context-maintenance`
- `docx`, `xlsx`, `pptx`, `pdf`, `schedule`
- `skill-creator` (needed for fleet improvement)
- `cowork-power-user`

### CONSIDER KEEPING (useful occasionally)
- `engineering:code-review` — could supplement `findasale-qa` for deep code reviews
- `data:explore-data` + `data:build-dashboard` — useful when analytics features ship
- `marketing:competitive-analysis` — useful for competitor research alongside `findasale-rd`

### RECOMMEND DISABLING (dead weight for FindA.Sale)
- `sales:*` — FindA.Sale is B2B2C, not a sales org running a pipeline
- `finance:*` — no accounting workflows
- `brand-voice:*` — `findasale-marketing` handles brand voice
- `customer-support:*` — `findasale-support` + `findasale-cx` cover this
- `operations:*` (generic) — `findasale-ops` covers this
- `enterprise-search:*` — no enterprise data sources
- `productivity:*` — session-log + STATE.md serve this function
- `design:*` (generic) — `findasale-ux` covers this
- Most `engineering:*` — `findasale-dev` + `findasale-qa` cover this
- Most `product-management:*` — `findasale-architect` + Patrick cover this
- Most `marketing:*` (generic) — `findasale-marketing` covers this

### Impact Estimate
Disabling ~60 unused skills would reduce the available skills list from 100+ to ~30. This means less noise in skill discovery, fewer tokens spent on skill descriptions in context, and clearer routing.

---

## Patrick Action Required

Plugin skills are managed in Cowork's plugin settings (not in repo files). Patrick would need to disable unused plugins from the Cowork UI. Alternatively, we can add a note to CLAUDE.md instructing Claude to prefer `findasale-*` skills over generic plugin equivalents — a soft routing rule rather than hard disabling.

---

## Soft Routing Rule (immediate, no Patrick action needed)

Add to CORE.md: "When a FindA.Sale custom skill exists for a domain (e.g., `findasale-marketing` for marketing, `findasale-ux` for design), always prefer the custom skill over generic plugin equivalents. Generic plugin skills are fallbacks only."
