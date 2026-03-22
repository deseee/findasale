# FindA.Sale — Patrick's Dashboard
Last Updated: 2026-03-22 (Session 239 wrap)

## Build Status
- **Vercel (Frontend):** Live — [finda.sale](https://finda.sale)
- **Railway (Backend):** Live
- **Scheduled Tasks:** 3 active (weekly site audit, brand drift detector, Monday digest)

## What Just Happened (S239)

Two bugs fixed, plus a major workflow upgrade:

**Bug fixes:**
- NotificationBell dark mode — bell icon was invisible in dark mode, now visible with full dark: variants (deployed)
- Sale detail page — removed duplicate photos section, moved About description into left column next to sidebar, reordered so Items appear before UGC/Map (on your local disk, needs push)

**Workflow automation (the big one):**
- Created DECISIONS.md — a registry of 9 standing design rules that every dev and QA session must follow
- Created Polish Agent — a new quality gate that checks features for dark mode, mobile, empty states, brand voice, and multi-endpoint completeness before they ship
- Set up 3 automated tasks: weekly full-site audit (Sunday 10pm), brand drift detector (Monday 10am), Monday digest (8am)
- Wrote patches for dev and QA skills — adds Human-Ready Gate, Beta-Tester Perspective, and multi-endpoint testing requirements

## What You Need To Do

1. **Push the sale detail fix** — it's on your local disk (see next-session-prompt.md for exact commands)
2. **Install 3 skill files** from `claude_docs/skills-package/` (Polish Agent + dev/qa patches)
3. **Run the weekly site audit once manually** to pre-approve Chrome tools for automated Sunday runs
4. **Resolve 9 conflicting local files** — stale edits from previous sessions blocking git pull
5. **Decide: Teams tier member cap** — 10 or 15 members? Enterprise tier above it? (D-007 in DECISIONS.md)

## Automated Monitoring (NEW)

Your agent fleet now runs three scheduled tasks without you:
- **Sunday 10pm:** Full site audit — every route, every role, dark mode, mobile, empty states
- **Monday 10am:** Brand drift scan — checks all copy against brand voice guide
- **Monday 8am:** Weekly digest — summary of what happened, what needs attention

Results appear in `claude_docs/audits/` and get summarized here in this dashboard automatically.

## Pending Decisions
1. Teams tier member cap (D-007) — 10 or 15? Enterprise above?
2. Resend quota — Brevo (free) or Postmark ($15/mo)?
3. Innovation: Reputation + Condition Tags as P0 pre-beta?
4. Innovation: sale-type-aware discovery as Q3?

## Project Health
- **Features shipped:** 71 across 4 tiers
- **Beta status:** Live. Real customers evaluating this week.
- **Platform scope:** All secondary sales types (estate, garage, yard, auction, flea, consignment)
- **Automation:** DECISIONS.md + Polish Agent + 3 scheduled tasks = Claude catches drift without Patrick asking

---

**Note:** Updated by Records agent at every session wrap. This dashboard will also be updated automatically by the Monday digest task starting this week.
