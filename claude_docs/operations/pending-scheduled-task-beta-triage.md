# Pending Scheduled Task: beta-feedback-triage

**Created by:** Power User sweep 2026-03-23
**Status:** Needs to be registered — run `Skill('schedule')` or dispatch findasale-records at the start of next session.

---

## Task Spec

**taskId:** `beta-feedback-triage`
**Description:** Daily beta-period feedback triage — scans for organizer signals and routes findings to the right agent
**Schedule:** Weekdays 9am (`0 9 * * 1-5`)

**Prompt:**
```
You are running the daily beta feedback triage for FindA.Sale.

Resolve the project root:
PROJECT_ROOT=$(ls -d /sessions/*/mnt/FindaSale 2>/dev/null | head -1)

## Your Job
Scan all available channels for incoming beta organizer feedback, flag anything actionable, and route it to the right agent. Patrick should not have to manually hunt for feedback signals.

## Step 1 — Load Context
Read $PROJECT_ROOT/claude_docs/STATE.md (active objective section only) to understand the current beta status and any known outstanding issues.

## Step 2 — Scan Feedback Channels

Check the following in order:

**MailerLite (via MCP):**
- List recent subscriber activity — any new organizer signups or unsubscribes in the last 24h?
- Check campaign performance if any were sent recently (open rate, clicks)
- Flag any unsubscribes with notes if available

**Contact form / support signals:**
- Check $PROJECT_ROOT/claude_docs/customer-signals.md if it exists — any new entries?
- Check $PROJECT_ROOT/claude_docs/beta-launch/ for any feedback log files

**Known carry-forward issues (from STATE.md):**
- Note any P0/P1 carry-forward items that are more than 3 sessions old — flag for Patrick

## Step 3 — Compile Triage Report

Write a short report to $PROJECT_ROOT/claude_docs/logs/beta-triage-YYYY-MM-DD.md:

# Beta Feedback Triage — [date]

## New Signals (last 24h)
[list any new feedback, signups, unsubscribes, or contact form entries]

## Routing
[for each signal: route to findasale-customer-champion, findasale-dev, or Patrick-direct]

## Carry-Forward Watch
[items stuck >3 sessions — flag for Patrick]

## Status: GREEN / YELLOW / RED
- GREEN: No new issues, all signals normal
- YELLOW: Minor feedback or friction, routed
- RED: P0/P1 identified — Patrick must act today

## Step 4 — If RED
Dispatch findasale-customer-champion with the specific issue details.

## Output
Print triage summary under 20 lines. If no signals yet: report GREEN with "No signals yet — beta acquisition phase."
```

---

**Register this task at the start of Session 246 before other work.**
