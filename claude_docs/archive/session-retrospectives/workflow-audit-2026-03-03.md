# Workflow Audit — 2026-03-03

*Research-backed audit of the FindA.Sale AI workflow against power-user best practices.*

---

## Research Summary

Reviewed Anthropic's agent skills best practices, Addy Osmani's 2026 AI coding workflow guide, and autonomy pattern research. Three consistent themes across all sources:

1. **Progressive context loading** — load only what's needed, not everything upfront
2. **Self-reflection loops** — scheduled retrospectives catch drift before it costs sessions
3. **Skill composition over monoliths** — composable, triggerable skills beat large catch-all docs

Overall verdict: the FindA.Sale workflow is already in the top tier of Cowork setups. The gaps below are refinements, not structural problems.

---

## 1. Cleanup Tasks

### Orphaned files at project root
Three files sitting at `FindaSale/` root that don't belong there:

- **`Session Wrap — 2026-03-03.txt`** — leftover from Session 24 when the workspace went stale mid-session. Content appears already applied (session-log.md and STATE.md both reflect the rebrand). Safe to delete.
- **`context-maintenance.skill`** — binary ZIP skill package. Likely a download artifact from skill installation. If the skill is already active in Cowork, this can be deleted.
- **`claude_docs/test_write`** — empty test artifact, no content. Delete.

### Orphaned test artifacts in image-tagger
`packages/backend/services/image-tagger/` contains two stale files:
- `.coverage` — empty coverage artifact
- `.coverage.claude.pid10229.XQC9qibx.H0CrSzLFxgoh` — PID-stamped lockfile from a dead test run

These should be in `.gitignore` or deleted outright.

### Disabled salescout-* scheduled tasks
9 disabled tasks sitting in the queue (`salescout-context-refresh` through `salescout-monthly-digest`). They're harmless but add noise. No delete mechanism available via the scheduler UI — low priority, leave unless it becomes a problem.

---

## 2. Stale Context Issues

### context.md Docker section shows old container names
The `## Docker` section still shows `salescout-backend-1` etc. Root cause: `update-context.js` runs `docker ps` but the nightly VM task can't reach Docker (it runs in the Cowork VM, not the Windows host). The script has a "preserve existing if unreachable" fallback — so once the old names got cached, the nightly task keeps reusing them.

**Fix needed in `update-context.js`**: when Docker is unreachable, emit a fresh "unavailable" message rather than preserving the stale previous output.

**Workaround until then**: run `node scripts/update-context.js` manually at session start from Windows PowerShell (not via Cowork), where Docker is reachable.

### context.md health status still says "SaleScout's"
The health status narrative in context.md was generated from a pre-rebrand scan. Will auto-correct on the next Sunday health-scout run (2026-03-08). No action needed.

---

## 3. Self-Reflection Gap — The Biggest Miss

The workflow has health-scout (code quality), competitor-monitor (market), changelog-tracker (tech), ux-spotcheck (UX), and monthly-digest (features shipped). **What's missing is a meta-layer: a scheduled task that audits the workflow itself.**

Patrick just had to ask manually for this audit. That's a signal the pattern should be automated.

### Recommended: `findasale-workflow-retrospective` (monthly)

A new scheduled task, first of the month (or second — stagger from monthly-digest):

- Are the scheduled tasks producing usable output, or just running silently?
- Are skills firing on the right triggers? Any that are over/under-triggering?
- What patterns from the last 30 days should be added to `self_healing_skills.md`?
- Are any context docs stale (context.md Docker section, health status, etc.)?
- Is the `STATE.md` "Pending Manual Action" list getting longer or shorter?
- Check: is the AskUserQuestion bug (conversation-defaults skill) still active?

This is exactly what Anthropic recommends: "Ask Claude to self-reflect on what went wrong and capture successful approaches into reusable context."

---

## 4. self_healing_skills.md Is Reactive, Not Proactive

13 patterns documented. They're loaded *after* a bug appears (CORE.md Section 8: "Before debugging recurring errors, check..."). The patterns would be more valuable if they were also loaded *before* building new features.

### Recommended: `findasale-pre-feature` skill

A lightweight pre-feature checklist skill that loads before any new feature work and asks:

- Does this route need `authenticate` middleware? (Skill 6)
- Does this Prisma query need a `take` limit? (Skill 7)
- Does this add a `process.env` var? (Skill 8 — add to .env.example)
- Does this use browser globals in a Next.js page? (Skill 1 — guard with useEffect)
- Does this add a User model field? (Skill 2 — update JWT payload)

Takes 30 seconds of context load but prevents the most common classes of bugs.

---

## 5. Missing Weekly Digest

The monthly-digest runs on the 1st. There's a gap between that and day-to-day work. As a non-technical PM, Patrick would benefit from a lightweight Friday end-of-week summary:

- What features shipped this week
- What's in progress
- Any blockers

### Recommended: `findasale-weekly-digest` (Fridays 9am)

Lighter than the monthly — just scans session-log.md for the past 7 days and writes a 3-bullet summary to `claude_docs/weekly-digests/`. Takes ~2 minutes.

---

## 6. beta-monitor Task Never Created

SESSION 20 (STATE.md) mentions "4 scheduled research tasks created" including what appears to have been a beta-monitor concept. No `findasale-beta-monitor` task appears in the active task list. If the intent was to monitor for beta user sign-ups, organic mentions, or App Store/PWA install tracking, this was dropped during the rebrand chaos.

Worth deciding: is this still wanted? If yes, define what it monitors (GitHub issues? Stripe test transactions? Analytics?) and create it.

---

## 7. Known Seed Bugs Still Unresolved

STATE.md lists two known bugs under "Known Seed Bugs" with no assigned task or timeline:

1. Organizer users created with `role: 'USER'` — workaround exists (`_fixRoles.ts`) but seed.ts not fixed
2. Fake `stripeConnectId` causes Stripe 403 — workaround exists (null it out) but seed.ts not fixed

These are pre-beta blockers once real organizers start testing. They'll cause confusion when a fresh environment is set up for a new user. Should be fixed before real-user beta.

---

## 8. Power User Patterns Not Yet in Use

From Addy Osmani's 2026 workflow guide and Anthropic's agent research:

**Multi-model validation** — when stuck on a bug, test the same prompt across different models. Not currently in any skill or workflow doc. Low overhead to add as a note to the dev-environment skill.

**Test-driven automation** — run backend test suite as part of the weekly health-scout. Currently health-scout does static analysis; adding `pnpm test` output would catch regressions between manual sessions.

**Commit frequency as save points** — already doing this well (commits stamped with session numbers). No change needed.

**Autonomy interrupt calibration** — Anthropic research shows experienced users interrupt more, not less (~9% of turns vs 5% for new users). This is healthy — it means Patrick is getting better at catching when Claude is about to go in the wrong direction. Worth knowing this is a feature, not a bug.

---

## Summary Table

| Priority | Item | Effort | Value |
|----------|------|--------|-------|
| High | Fix `update-context.js` Docker stale fallback | 30 min | Eliminates daily stale context |
| High | Fix seed bugs (role + stripeConnectId) | 1 hr | Prevents beta confusion |
| High | Create `findasale-workflow-retrospective` task | 30 min | Closes the self-reflection loop |
| Medium | Delete orphaned root files (3 files) | 5 min | Reduces noise |
| Medium | Create `findasale-pre-feature` skill | 45 min | Proactive bug prevention |
| Medium | Create `findasale-weekly-digest` task | 30 min | PM visibility |
| Low | Add test suite run to health-scout | 20 min | Catches regressions |
| Low | Decide on beta-monitor task | — | Depends on beta launch plan |
| Low | Delete orphaned image-tagger artifacts | 5 min | Hygiene |

---

*Generated: 2026-03-03 — Research sources: Anthropic Agent Skills blog, Addy Osmani AI Workflow 2026, Anthropic agent autonomy research*
