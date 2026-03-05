# Next Session Resume Prompt
*Written: 2026-03-05T (session 65 — wrap)*
*Session ended: normally*

## Resume From

Work autonomously through the CA/CC/CD paths in batches of 3–5 tasks. Pick the next unblocked batch, execute it, update STATE.md, and continue to the next batch. Keep going until Patrick interrupts or all paths are blocked on external dependencies.

---

## Autonomous Batch-Work Mode — Operating Instructions

**Default behavior for this session:**
1. Select 3–5 unblocked tasks from the path list below
2. Announce the batch to Patrick in one line: "Starting batch: CA1, CC1, CC3"
3. Execute each task. Use subagents, skills, and connectors when appropriate (see below)
4. After each task completes: update STATE.md In Progress section, add to session-log
5. Select the next batch and repeat
6. Stop only if: Patrick interrupts, a task needs a sync point Patrick must approve, or all remaining tasks are blocked

**Patrick does NOT need to approve each task individually** — he's authorized batch-mode execution. If a sync point is hit (⚡ in roadmap), pause and surface the decision clearly. Otherwise, keep moving.

---

## Path Status — What's Unblocked

### CA — Production Readiness (all unblocked except CA2)

| Task | Sessions | Notes |
|------|----------|-------|
| **CA1** — ToS & Privacy Policy | 1 | Start here. Draft + implement /terms and /privacy. Use competitor-standard language (research in `claude_docs/research/`). Add footer links + checkout checkbox. ⚡ Pause for Patrick review before going live. |
| CA3 — Payment Flow Stress Test | 2 | Map all Stripe paths, test 5%/7% fee logic, webhook failure recovery, edge cases |
| CA4 — User Flow Audit | 2 | Full shopper, organizer, creator journeys. Mobile + a11y pass. Edge cases. |
| CA5 — Performance & Security | 1 | Use **health-scout skill**. Lighthouse on key pages, auth middleware, Sentry verify, CSP/CORS |
| CA6 — Feature Polish | 3 | Photo upload UX, semantic search, push notifications, onboarding, empty states |
| CA7 — Human Documentation | 2 | Organizer guide, shopper FAQ, Zapier docs, in-app tooltips |
| ~~CA2~~ | blocked | 3 Neon migrations — Patrick must run `prisma migrate deploy` in PowerShell |

### CC — Business Intel & Content (all unblocked, fully autonomous)

| Task | Sessions | Notes |
|------|----------|-------|
| **CC1** — Investor Materials | 2 | Executive summary, pitch deck structure (10–15 slides), financial model, TAM/SAM/SOM |
| **CC2** — Marketing Content | ongoing | "How to Run an Estate Sale" guide, shopper guide, social templates, email templates |
| **CC3** — Pricing Model Analysis | 1 | Competitor fee deep dive, break-even by tier, A la carte AI pricing model. ⚡ Pause for Patrick pricing decision |

### CD — Innovation & Experience (partially unblocked)

| Task | Sessions | Notes |
|------|----------|-------|
| **CD2 Phase 1** — Quick Win Features | 1–2 | Live Scarcity Counter, Streak Challenges, Social Proof Live Feed — all low effort, high impact |
| **CD3** — Cross-Industry Research | ongoing | Spawn a research subagent to run a feature-innovation-scan across the monitored industries |
| **CD4** — Workflow Review Scheduled Task | 0.5 | Use **schedule skill** to set up bi-weekly workflow review task |
| ~~CD1~~ | blocked | Branding implementation — needs Patrick direction (P6) |

### CB — AI Tagging (all blocked)
Waiting on Patrick for Google Cloud Vision API key + Anthropic API key (P5). Skip CB entirely until Patrick unblocks.

---

## Recommended First Batch

**CA1 + CC3 + CD4** — all 3 complete in ~1–2 sessions, no overlapping dependencies:
- CA1 first (highest user-facing value, sets up legal compliance)
- CC3 in parallel or immediately after (pure research + doc, no code)
- CD4 last (5-min scheduled task setup using the schedule skill)

After that batch: **CA5 + CC1 + CD2-Phase1**

---

## Skills and Tools to Use

| Task | Use |
|------|-----|
| CA5 (security scan) | `health-scout` skill |
| CD4 (scheduled task) | `schedule` skill |
| CC1 (investor materials) | `docx` or `pdf` skill for final output |
| CC2 (marketing content) | `docx` skill for guides |
| Research subtasks | Spawn **Explore or general-purpose subagent** for parallel research |
| CA3/CA4 (flow testing) | Spawn subagent per journey type to parallelize |
| GitHub pushes | `mcp__github__push_files` — push after every meaningful task completion |

---

## Sync Points (Stop and Surface to Patrick)

These require Patrick input before proceeding:

| Point | Trigger | What to Present |
|-------|---------|----------------|
| CA1 complete | ToS/Privacy drafted + implemented | "Pages are live at /terms and /privacy — please review before I add footer links" |
| CC3 complete | Pricing analysis done | "Here are 3 pricing options with break-even analysis — which do you want to launch with?" |
| CA3 issues found | Critical payment bug discovered | Surface immediately, don't continue |

---

## Completed This Wrap Session

- Merged parallel-roadmap-v2 into roadmap.md (now v10)
- Updated STATE.md to parallel path model
- Audited claude_docs for stale Sprint T–X refs — all cleaned
- Pushed roadmap.md, STATE.md, session-log.md, next-session-prompt.md to GitHub

---

## Environment Notes

- **GitHub MCP active** — push after every batch: `mcp__github__push_files` to `deseee/findasale` main
- **3 Neon migrations pending** — CA2 blocked until Patrick runs `prisma migrate deploy`
- **Phase 31 OAuth env vars** — still needed in Vercel (`GOOGLE_CLIENT_ID` etc.)
- **CB path** — skip entirely until Patrick provides API keys
- **context.md** — 446 lines (healthy). Regenerate with `node scripts/update-context.js` at session start.
