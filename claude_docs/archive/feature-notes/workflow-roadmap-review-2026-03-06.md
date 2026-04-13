# Roadmap Restructure Review — Parallel Paths vs. Subagent Fleet

**Date:** 2026-03-06
**Scope:** Assess whether the P/CA/CB/CC/CD parallel path mental model from ROADMAP.md (v15) still serves the project effectively, now that a 17-strong subagent fleet exists and does the work those abstract tracks used to describe.

---

## Context

**Roadmap Design (v15, current):**
5 parallel tracks: P (Patrick human tasks), CA (Production Readiness), CB (AI Image Processing), CC (Business Intel & Content), CD (Innovation & Experience). Each path contains work units. Sync points coordinate between paths.

**Subagent Fleet (as of 2026-03-06):**
17 dedicated agents now exist:
- `findasale-dev` — Feature coding
- `findasale-architect` — System design, refactoring
- `findasale-qa` — Testing, QA audits
- `findasale-ux` — UI/UX research, design specs
- `findasale-rd` — Feasibility research, tech spikes
- `findasale-ops` — Operations, infra, CI/CD
- `findasale-deploy` — Releases, production safety
- `findasale-cx` — Customer experience, support content
- `findasale-marketing` — Go-to-market, content creation
- `findasale-records` — Docs, changelog, skill management
- `findasale-legal` — Legal/compliance
- `findasale-support` — Customer support operations
- `findasale-workflow` — Meta process improvements
- `health-scout` — System health monitoring
- `context-maintenance` — Doc refresh, compression
- `dev-environment` — Shell/env setup
- Other utility agents (pdf, docx, pptx, conversation-defaults)

---

## Assessment

### The P/CA/CB/CC/CD Model

**Strengths:**
- Human-readable at a glance: Patrick can see his own blocking items in one place (P section)
- Conceptual clarity: CA (readiness) CB (AI) CC (biz) CD (features) are intuitive buckets
- Sync points force explicit coordination gates

**Weaknesses:**
- **Abstraction mismatch:** CA = "Production Readiness" now maps to tasks like "add ToS/Privacy Policy" and "health audit" — but those are really multiple job roles (legal, qa, ops, ux)
- **No skill-to-path mapping:** When a subagent finishes work, which CA/CB/CC/CD item does it close? The mapping is implicit and often missing
- **Planning gap:** The roadmap doesn't say which subagent owns which path item. Patrick doesn't see the agent fleet structure reflected in the roadmap
- **Mixed granularity:** CA has 7 items (some complete, some one-liners like "FAQ"). CB3 is one line ("AI tagging review panel"). CD has a 12-item pipeline with estimated sprints. Inconsistent level of detail
- **Stale template:** v15 still references "Phases 1–13" that are archived. The narrative is historical
- **CD pipeline is useful; CA/CB/CC are not.** The feature pipeline in CD2–4 (phases 2–4, 12-item roadmap with sprint estimates) is actively used for planning. CA/CB/CC read more like audit checklists after the fact

---

## Parallel Path vs. Agent Fleet Mapping

If we tried to map subagents to paths:

| CA (Production Readiness) | Maps to | Agents |
|---|---|---|
| ToS/Privacy | findasale-legal | |
| Health audit | findasale-qa, health-scout | |
| Rate limiting, Stripe tests | findasale-dev, findasale-qa | |
| UX audit | findasale-ux | |

| CB (AI Image Processing) | Maps to | Agents |
|---|---|---|
| Cloud AI service | findasale-dev, findasale-rd | |
| AI tagging review | findasale-ux, findasale-dev | |
| Tag feedback endpoint | findasale-dev | |

| CC (Business Intel & Content) | Maps to | Agents |
|---|---|---|
| Competitor analysis | findasale-rd, findasale-marketing | |
| Pricing analysis | findasale-rd, findasale-records | |
| Marketing materials | findasale-marketing | |
| Investor deck | findasale-marketing | |

| CD (Innovation & Experience) | Maps to | Agents |
|---|---|---|
| Feature pipeline | findasale-architect, findasale-dev | |
| Social templates, QR | findasale-marketing, findasale-dev | |

**Finding:** Paths CA/CB/CC were always cross-functional. CA "production readiness" required legal + QA + UX + dev. The agent fleet makes this visible — one agent can't complete an entire path. The paths obscure the real work structure.

---

## Recommendations

### Option 1: Keep P/CA/CB/CC/CD as Historical Archive
**Action:** Rename current ROADMAP.md → ROADMAP-ARCHIVE.md. Archive v15. Create new ROADMAP-ACTIVE.md with flat feature pipeline from CD only.

**Pro:** Clean historical record. Phase names become reference material, not planning doc.
**Con:** Patrick loses the overview of non-feature work (biz analysis, partner contact, legal).

### Option 2: Restructure Roadmap Around Agent Fleet + Feature Pipeline
**Action:** Replace CA/CB/CC/CD with:
- **P** — Patrick manual items (unchanged)
- **Features** — CD2–4 pipeline (useful, detailed)
- **Planned Research** — Feasibility items for findasale-rd
- **Ongoing Tasks** — CC4 scheduled intelligence (useful, running weekly)

Drop CA/CB/CC as planning constructs. They were audit bins, not roadmap tracks.

**Pro:** Aligns planning doc with actual agent fleet. Simpler mental model.
**Con:** Removes the "readiness audit" and "AI processing audit" framing that made those passes feel coherent.

### Option 3: Lightweight Sync — Keep Path Names, Simplify Content
**Action:** Compress CA/CB/CC into status bullets (not item lists). Focus on CD feature pipeline as the real roadmap. Paths become "areas we're tracking" not "work to do."

Example:
```
CA — Production Readiness: Green. Legal docs done (ToS/Privacy). Health: GREEN (findasale-qa audit 2026-03-06). Security fixes: ✅ shipped (JWT, rate limit, admin auth).

CB — AI: Green. Cloud AI + feedback loop shipped. Awaiting real data for next phase.

CC — Business: Market analysis complete (CC3 pricing 5% vs competitors 13–20%). Materials ready (deck, blogs, templates). Awaiting Patrick fee confirm.

CD — Feature Pipeline: Phase 2 (1–4) scoped. P2 Priority: Sale Description Writer (1–2 sprints).
```

**Pro:** Still gives overview; doesn't pretend paths are work units.
**Con:** Requires discipline to keep updated (risk of stale bullets).

---

## Recommendation

**Option 3 (lightweight) with a migration to Option 2 (restructure) in the next quarterly planning cycle.**

Immediate: Compress CA/CB/CC to status bullets. Keep CD feature pipeline detailed.
Q2 2026: Full restructure if the fleet continues to grow and paths feel increasingly artificial.

**Why:**
1. CA/CB/CC were one-time audits, not ongoing work. They've served their purpose (all items complete or shipped).
2. The feature pipeline (CD) is the real planning document going forward.
3. CC4 (ongoing intelligence) is valuable and should have its own line.
4. Patrick doesn't think in terms of "readiness paths" — he thinks "what's broken?" and "what's next to build?"
5. Subagent fleet visibility matters more than path abstraction at this scale.

---

## Next Steps (Not in this session)

1. **Records agent** (session 86+): Review this memo. Create Tier 1 change record for roadmap restructure.
2. **Patrick approval**: Confirm lightweight sync approach acceptable.
3. **Q2 review**: If agent fleet grows to 20+, trigger full restructure to agent-centric planning.

---

**Status:** FINDINGS DOCUMENT — awaiting findasale-records review and Patrick decision.
