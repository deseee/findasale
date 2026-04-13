# Power User Sweep — 2026-04-06

**Agent:** Cowork Power User (scheduled run)
**Trigger:** findasale-power-user-sweep weekly task
**Sessions reviewed:** S388–S399 (STATE.md)
**Files read:** STATE.md, next-session-brief.md, monthly-digest-2026-04.md, operations/connector-matrix.md, improvement-memos/power-user-sweep-2026-03-30.md, dev-environment/SKILL.md
**Scheduled tasks audited:** 14 tasks
**Ecosystem search:** Claude Cowork features, MCP connectors, plugins April 2026

---

## Ecosystem Research — 2026-04-06

### New Capabilities Found

- **Feb 24, 2026 batch (active):** 12 new MCP connectors added to the Cowork connector library: Google Calendar, Google Drive, Gmail, DocuSign, Apollo, Clay, Outreach, Similarweb, MSCI, LegalZoom, FactSet, WordPress, Harvey. All available via `mcp__mcp-registry__suggest_connectors`.
- **Private plugin marketplaces:** Enterprise admins can now create private plugin marketplaces via the new "Customize" menu. Not yet relevant for solo FindA.Sale usage but worth tracking.
- **Dispatch (March 2026):** Send messages to a running Cowork session from your phone. Claude acts autonomously. Could let Patrick trigger agent tasks from the field (e.g. at an actual estate sale).
- **Square MCP connector:** Available at claude.com/connectors/square. Square handles payments, inventory, POS, transaction reporting. FindA.Sale uses Stripe for POS — but Square's connector shows Anthropic is investing in commerce/POS connectors.
- **April 2026 bug fixes:** Official marketplace plugin scripts "Permission denied" on macOS/Linux fixed. MCP OAuth now follows RFC 9728.

### Applicable to FindA.Sale

- **Gmail MCP** is now available. Patrick has support@finda.sale. A connected Gmail MCP would let findasale-customer-champion triage, draft, and send support responses directly — no copy-paste. Current setup requires Patrick to manually send emails drafted by agents.
- **Dispatch field use:** Patrick physically attends estate sales. Dispatch would let him say "run QA on the add-items page" or "check if the Railway build is green" from his phone mid-sale without being at his computer.
- **Square connector:** Low relevance — FindA.Sale is already Stripe-native. No action recommended.

### Recommended Actions

- Evaluate Gmail MCP for Customer Champion triage automation (Patrick decision — see Proposal P-1 below).
- Evaluate Dispatch for field use (Patrick decision — mentioned in March 30 sweep, still unactioned — see Proposal P-2 below).

---

## Skill Audit — 2026-04-06

### ⚠️ Critical: dev-environment skill has multiple stale Neon references (P1 — NOT FIXED SINCE S264)

Flagged in power-user-sweep-2026-03-30.md as QW-1. Still present. The `dev-environment/SKILL.md` file has **8 live references** to Neon as the production database:

- Line 48: "For Neon (production): Find the commented line # DATABASE_URL=postgresql://neondb"
- Line 100: Table shows "Neon PostgreSQL (cloud)" as production
- Lines 104, 106: ⚠️ warnings about Neon URL format
- Lines 119, 141, 143: `migrate deploy` instructions say "Apply to Neon"
- Line 183: Migration table says "Production (Neon)"
- Line 217: Troubleshooting says "Confirm .env points to local vs Neon"

Neon was decommissioned in S264. Production is Railway (`maglev.proxy.rlwy.net:13949/railway`). Any session that loads dev-environment and follows its migration instructions will attempt to run `prisma migrate deploy` against a dead database. This has been a known bug for 200+ sessions. **This is the most impactful quick win in this sweep.**

### ⚠️ Stale: next-session-brief.md shows S199 content

`claude_docs/next-session-brief.md` still contains the S199 next-session brief (from ~2026-03-18). We are now at S399/S400. Per CLAUDE.md §12, this file's content should have moved INTO STATE.md "## Next Session" as of the consolidation. The file is not updated and contains stale sprint priorities (Sale Ripples, Passkey re-QA) that have long since shipped. It could cause context confusion if loaded. Should be archived.

### ✅ context-maintenance and findasale-push-coordinator: already archived

Both are correctly marked ARCHIVED in their descriptions. No cleanup needed.

### ✅ All other custom findasale-* skills: descriptions appear current

Quick-scan of skill descriptions shows triggering language, routing, and descriptions are coherent with current project state (S388–S399 features shipped). No other staleness found.

### ✅ Scheduled tasks: 14 tasks, all healthy

All 14 tasks are enabled with appropriate cadences. One note: `findasale-competitor-monitor` description says "Monday 8am" but runs Thursday 4am — minor description mismatch. Harmless but worth correcting.

---

## Autonomous Work Discovery — 2026-04-06

### QA Backlog is Growing Faster Than It's Being Cleared

STATE.md "## Next Session (S400)" shows a carry-forward QA queue spanning S397, S396, S395 (partial), S394, and now S398/S399. This is 4+ sessions of unverified Chrome QA. The `weekly-full-site-audit` and `findasale-ux-spotcheck` tasks run scheduled QA, but they audit code — not the specific interaction tests from each session's QA Queue. The individual per-feature Chrome interaction tests are only done in live sessions, and they keep getting deferred.

This is a structural problem: implementation sessions ship 5–10 features per session, QA capacity is 1–2 features per live session, and the backlog compounds.

### Survey Trigger Integrations Deferred (S399 Priority 1)

S399 built the complete feedback collection infrastructure but left 10 survey trigger integrations unimplemented (OG-1 through SH-5). These are the actual `showSurvey()` calls in 10 specific pages. Without them, the entire S398+S399 feedback system ships zero surveys to users. This is a dev dispatch task, not a scheduled task — needs a live session to action.

### Roadmap.md Opens as Binary File

`claude_docs/strategy/roadmap.md` is being detected as a binary file by grep, which means it contains non-text characters (likely null bytes — same pattern that caused Vercel build failures in S392/S396). This could cause issues if the roadmap is ever included in a context window or processed by tools expecting clean UTF-8. The `perl -pi -e 's/\x00//g'` null byte sweep that ran in S361 may not have covered doc files.

---

## Improvement Batch — 2026-04-06

---

### 🔴 Quick Wins (auto-executable — proceeding unless Patrick objects)

---

**QW-1: dev-environment skill has 8 stale Neon references — STILL NOT FIXED**
**Category:** Skill staleness — correctness bug
**Impact:** HIGH — Any session that loads dev-environment and follows migration instructions will attempt `prisma migrate deploy` against a decommissioned Neon database. Flagged March 30, not actioned.
**Effort:** Quick win (~10 min skill update)
**Route to:** skill-creator → findasale-records (Tier 1 review)
**Auto-executable?:** YES — factual correction, no product decision needed.
**Status:** Routing to skill-creator this sweep.

---

**QW-2: next-session-brief.md should be archived (S199 content, 200 sessions stale)**
**Category:** Documentation staleness
**Impact:** MEDIUM — File shows S199 priorities (Sale Ripples, Passkey). Both shipped hundreds of sessions ago. Risks contaminating a context window if loaded.
**Effort:** Quick win — file rename/archive
**Route to:** findasale-records
**Auto-executable?:** YES — stale reference cleanup, no product decision.
**Status:** Flagging for records at next session.

---

**QW-3: findasale-competitor-monitor task description mismatch**
**Category:** Scheduled task cleanup
**Impact:** LOW — Description says "Monday 8am" but schedule is Thursday 4am. Confusing when reading task list.
**Effort:** 5-min description update
**Route to:** findasale-records (owns scheduled tasks)
**Auto-executable?:** YES
**Status:** Flagging for records.

---

**QW-4: roadmap.md null byte check**
**Category:** Doc hygiene
**Impact:** MEDIUM — roadmap.md is being read as a binary file. Null bytes could cause tool failures when the file is processed.
**Effort:** 2 min — run perl null-byte sweep on claude_docs/strategy/roadmap.md
**Auto-executable?:** YES — same perl command that fixed frontend files. Will execute inline.

---

### 🟡 Proposals Needing Patrick's Input

---

**P-1: Connect Gmail MCP for Customer Champion automation**
**Category:** Ecosystem connector
**Impact:** MEDIUM — findasale-customer-champion currently drafts responses that Patrick must manually send. Gmail MCP would let the agent send directly from support@finda.sale — closing the automation loop on support triage.
**Effort:** Session task — connect Gmail MCP + update findasale-customer-champion skill with send permissions
**Route to:** findasale-records (config), findasale-customer-champion (skill update)
**Auto-executable?:** NO — Patrick must authorize outbound email sending from his domain.

---

**P-2: Evaluate Dispatch for field use at estate sales**
**Category:** Ecosystem feature
**Impact:** MEDIUM — Patrick is physically present at estate sales where bugs surface. Dispatch would let him queue Claude tasks from his phone mid-sale ("QA the POS flow", "check if Railway is green") without returning to his desktop. Flagged in March 30 sweep, not yet evaluated.
**Effort:** 30-min evaluation + Dispatch setup
**Route to:** Patrick decision only
**Auto-executable?:** NO — requires Patrick to install Dispatch and evaluate fit.

---

**P-3: Dedicated QA-backlog clearing task (Thursday Chrome session)**
**Category:** Process improvement
**Impact:** HIGH — QA carry-forward queue now spans 4+ sessions (S394–S399 unverified Chrome tests). Weekly-full-site-audit audits code quality, not the specific interaction scenarios from each session's QA Queue. A dedicated scheduled Chrome QA task that reads STATE.md's QA Queue and works through it systematically would prevent the backlog from compounding.
**Effort:** Session task — create new scheduled task + brief skill update to findasale-qa
**Route to:** findasale-records (scheduled task creation)
**Auto-executable?:** NO — Patrick should decide if he wants automated Chrome QA dispatches or prefers to queue these in live sessions.

---

### 🔵 Research Needed

**R-1: Gmail MCP connector capability deep-dive**
Before recommending Gmail MCP to Patrick, need to confirm: (a) send-from-alias support (support@finda.sale vs. personal Gmail), (b) OAuth scope requirements, (c) whether it requires admin consent for a custom domain. Route to findasale-innovation for 30-min research.

---

### 🅿️ Parking Lot

- **Fantastical MCP connector** (calendar feature, March 2026 launch): Could be useful for scheduling estate sale events, but FindA.Sale has its own sale scheduling built in. No immediate value. Revisit post-beta.
- **BatchData real estate MCP**: Property data, ownership records, contact lookup. Potentially useful for organizer prospecting (finding estate sale organizers by property owner type). Revisit when sales-ops needs lead data.
- **Private plugin marketplace**: Not relevant at current scale. Revisit if FindA.Sale adds team members or enterprise clients.

---

## Auto-Executed Quick Wins

### QW-4 Execution — roadmap.md null byte check ✅ DONE

`perl -pi -e 's/\x00//g'` run against `claude_docs/strategy/roadmap.md`. Result: file is now clean Unicode UTF-8 text, 568 lines intact, grep functional (22 status hits verified). Roadmap was previously detected as binary — null bytes stripped.

---

## Summary for Patrick

**Top 3 Actionable Proposals:**

1. **Dev-environment skill is still broken (Neon references — 8 occurrences).** This was flagged March 30 and not fixed. Any session that loads it and runs a migration will fail or hit a dead database. Routing to skill-creator for immediate repair.

2. **Gmail MCP could close the Customer Champion automation loop.** Right now agents draft support responses but Patrick has to manually send them. Gmail MCP would let the agent send from support@finda.sale directly. Needs your authorization — see P-1.

3. **QA backlog is 4 sessions deep.** S394–S399 all have Chrome QA queues that haven't been worked. The weekly audits don't clear these. A dedicated Thursday Chrome QA task would systematically drain the backlog instead of letting it compound. See P-3.

---

*Next sweep scheduled: 2026-04-13*
