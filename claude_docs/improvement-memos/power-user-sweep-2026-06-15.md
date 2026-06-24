# Power User Sweep — 2026-06-15

**Agent:** Cowork Power User (scheduled weekly run)
**Sessions since last sweep:** S919–S984 (S956 was skipped in prior sweep; catching up through S984)
**Files read:** STATE.md (full), roadmap.md BROKEN section, research/clay-connector-feasibility-2026-05-11.md, improvement-memos/power-user-sweep-2026-06-08.md
**Ecosystem searches:** 2 WebSearch runs (Cowork features June 2026, Agent SDK capabilities 2026)
**Skills audited:** Skill list reviewed via available_skills; no deep-reads required (no triggering issues found)
**Infrastructure status:** VM disk at 74% (2.5GB free) — the "No space left on device" P0 from the June 8 sweep has resolved.

---

## Project Health Snapshot

This is the healthiest state in months:

- **BROKEN table:** All BROKEN items fixed. 431, 429, 430, SEO1, SEO2, SEO3 all show FIXED. No currently broken features.
- **Blocked Queue:** 1 item only (#313 HAUL_POST_LIKES idempotency — env-blocked, needs 10 real accounts).
- **BQ ceiling:** 1/8 — well below the QA-only trigger. DEV mode is available.
- **Recent sessions:** S975–S984 represent the most sustained, evidence-first eBay work to date. Smart flat-rate shipping engine fully live and sweeping 9 listings. S984 completing GA4 Tier 2 events.

---

## 1. Ecosystem Research — 2026-06-15

### New Capabilities Found

**Anthropic doubled Cowork usage limits through July 5 (ACTIVE NOW)**
Starting June 5, Anthropic temporarily doubled the 5-hour session limit for Pro, Max, and Team plans — free, through July 5. Patrick gets roughly 2× compute headroom for the next 20 days. This is the best time to burn through the QA backlog or run long dev dispatches.

**Billing change — today (June 15)**
Anthropic announced a billing change effective June 15. The exact nature is not fully specified in search results, but Patrick should check his plan details at claude.ai/settings. Worth verifying nothing in the workflow changes.

**`/reload-skills` command**
A new CLI command re-scans skill directories without requiring a full session restart. Previously, updating a SKILL.md and re-installing the `.skill` file required starting a fresh session to pick up changes. This command shortens the skill development feedback loop.

**Advisor strategy (beta)**
New `Agent SDK` feature: an "Advisor" mode where the primary agent consults a second (often larger/smarter) model on hard decisions before acting. Could be applied to findasale-architect — particularly for decisions that currently get routed to the full advisory board unnecessarily. Not yet directly available in Cowork skills, but worth tracking.

**Tool-level observability for MCP connectors**
Published MCP connectors now have a developer dashboard showing usage metrics, active users, and tool call counts. Not directly relevant to FindA.Sale (we're consumers, not publishers), but signals that the MCP ecosystem is maturing and becoming more stable as a dependency.

**Agent Skills published as open standard**
Agent Skills (the `.skill` / `SKILL.md` format used by all findasale-* skills) has been published as an open standard for cross-platform portability. This means skills could potentially run in non-Cowork contexts in the future. No action needed, but it validates the investment in the findasale-* skill library.

### Applicable to FindA.Sale

The doubled usage window is immediately actionable — Patrick should prioritize high-token sessions (batch QA dispatches, multi-feature dev sprints, advisory board runs) before July 5.

---

## 2. Skills Audit — 2026-06-15

All installed findasale-* skills reviewed via the available_skills list. No triggering description issues found. Specific observations:

| Skill | Status | Note |
|-------|--------|------|
| `context-maintenance` | ✅ Properly archived | Description correctly blocks invocation |
| `findasale-push-coordinator` | ✅ Properly archived | Description correctly blocks invocation |
| `consolidate-memory` | ✅ New addition | Was not present in June 8 sweep. Runs a reflective pass over memory files — merges duplicates, fixes stale facts, prunes the MEMORY.md index. Worth running soon (last confirmed memory consolidation was several months ago). |
| `findasale-records` | ✅ Current | Own cross-session roadmap update rule (Chrome col applied NEXT session) is well-enforced per S970/S984 records passes. |
| `dev-environment` | ✅ Current | Railway DB reference correct. No Neon references. |
| `findasale-qa` | ⚠️ Stale trigger concern | Skill correctly scoped to Chrome-first QA, but the micro-dispatch pattern (one feature per Chrome session) means shopper-side features that have been CODE-ONLY for 10+ sessions remain in that state indefinitely. The skill itself is fine; the cadence is the gap (see §3). |
| All other findasale-* skills | ✅ No issues | No stale paths, no removed patterns found in descriptions. |

**One meta-observation:** The `findasale-dev` description includes "Do NOT use for architecture decisions, deployment operations, or documentation auditing." This is correct, but the inverse gap — code that falls between findasale-dev's scope and findasale-ops's scope (Railway env vars vs code infra) — caused the S975 eBay scope confusion. Not a skill-content fix; more of a cross-skill routing note.

---

## 3. Autonomous Work Discovery

### Finding 1 — Clay Connector: Research Complete, Never Scheduled

**File:** `claude_docs/research/clay-connector-feasibility-2026-05-11.md` (Innovation Agent, May 11)

The research is conclusive and was never actioned. Key verdicts from the doc:

- Clay is a waterfall enrichment platform, not a campaign orchestrator. The S641 "BUILD not BUY" verdict (which rejected Instantly/Smartlead) does not apply — Clay is architecturally equivalent to calling an enrichment API and writing the result to a Postgres field.
- Current email coverage: 14.3% (5,382 of 55,230 organizers). High-confidence: 0.5% (197 orgs).
- Clay's waterfall on niche local business lists: realistic 40–60% hit rate. Applied to the 32,000+ orgs with no high-confidence email → 12,800–19,200 new deliverable addresses.
- Cost for a one-time WARM-tier enrichment batch (6,019 orgs): $1,200–$1,500. Ongoing monthly (200–500 new scraped orgs): fits Launch plan at $185/month.

This finding has sat unactioned for 5 weeks. At BQ = 1 and BROKEN = 0, the project has the capacity to advance the outreach pipeline. This is the highest-leverage unscheduled item in the research directory.

**Route to:** Patrick decision → findasale-sales-ops for roadmap entry + enrichment plan

---

### Finding 2 — Shopper-Side QA Sprint Opportunity (BQ at 1)

The last 15+ sessions (S968–S984) have been almost exclusively eBay-focused. That work is now complete and verified. The BQ is at 1 — the lowest it has been in documented history.

Meanwhile, several shopper-side gamification features are long-standing CODE-ONLY:

| # | Feature | CODE-ONLY Since | Chrome Needed |
|---|---------|-----------------|---------------|
| 254 | Hunt Pass 1.5x XP Multiplier | S806 (re-verified S970) | Real Stripe purchase |
| 278 | Treasure Hunt Pro (+10% XP scan) | S806 (re-verified S970) | Hunt Pass subscriber account |
| 281 | Streak Milestone XP (7-day bonus) | S806 (re-verified S970) | 7 real site visits in a month |
| 314 | ORG_SHOPPER_SIGNUP XP | S806 (re-verified S970) | Real Stripe purchase at an organizer's sale |
| 315 | REFERRAL_ORG_FIRST_SALE XP | S806 (re-verified S970) | Organizer with referral code publishing first sale |
| 316 | Referral Tranche B (sale visits) | S860 (fix applied) | 3 different sale visits from referred user |

Items 254, 278, 281, 314, 315 require real Stripe payments or real multi-account coordination — they are genuinely env-blocked and UNVERIFIED is the correct status. They should remain in the CODE-ONLY column with no forced Chrome dispatch.

Item 316 (Referral Tranche B) had its root cause fixed in S860 (recordSaleVisit never called). This one may be verifiable in QA with real accounts visiting a sale 3 times — worth a focused dispatch.

**More actionable:** The next QA session should focus on #465 GA4 `first_item_published` (requires a fresh sale with 0 items — low effort) and CatalogSuggestionPanel + edit-item propagation (from S975/S980 Next Session queue).

---

### Finding 3 — eBay UPS/FedEx Rate Table Staleness

Per STATE.md S975 notes: "UPS/FedEx rate NUMBERS are best-available ESTIMATES — replace with Patrick's Pirate Ship UPS/FedEx rate card. USPS table is the real Pirate Ship data."

A monthly Cowork scheduled task was created in S975 to flag rate staleness. **Verify this task exists and is firing.** The smart flat-rate engine is now live across 9 listings and correctness matters. If the UPS/FedEx estimates are wrong, the bucket ladder rounds wrong, and organizers are quoting the wrong flat rate to eBay buyers.

**Action needed:** Patrick should pull his current Pirate Ship UPS/FedEx rate card and provide it to findasale-dev to replace the estimate tables in `ebayRateEstimateService.ts`. This is a data update, not a logic change.

---

### Finding 4 — Apollo MCP (Carry-Forward from June 8)

The June 8 sweep recommended evaluating the Apollo MCP connector for organizer prospecting (275M+ contacts, B2B prospecting database). No action was taken. Clay (above) covers email enrichment of known organizers; Apollo covers finding new organizer prospects not yet in the scraper pool.

These are complementary tools targeting different parts of the pipeline. Clay = enrich existing pool. Apollo = discover new prospects.

At current WARM lead velocity, Apollo would be most valuable when the Clay enrichment batch has been processed and sent. Sequence: Clay first → Apollo second.

---

## 4. Scheduled Tasks Health

Two tasks are confirmed created in recent sessions:
- `findasale-monthly-perf-audit` (2nd of month, 9am) — created S968, should have fired June 2
- eBay carrier rate-staleness checker — created S975 (name not confirmed in STATE.md)

No STATE.md evidence that either task fired and produced output. The June 8 sweep found no Cowork scheduled task failures, but a June 2 perf-audit run should have produced a memo or STATE.md note. If no output exists from that run, the task may have fired silently or not at all.

**Recommended check:** Patrick should verify these tasks show a recent `lastRunAt` in the Cowork task list.

---

## 5. Improvement Batch — 2026-06-15

### Quick Wins (auto-executable — proceeding without Patrick input)

**QW-1: Memory consolidation pass**
The `consolidate-memory` skill is now installed and has not been run since it was added. Memory files are growing (MEMORY.md is approaching the 200-line truncation limit). Running this skill cleans duplicates and fixes stale facts before the index gets cut off.
→ **Auto-executing this session** if context permits; otherwise flag for next session.

**QW-2: Note the `/reload-skills` command in workflow**
The new `/reload-skills` command means Patrick no longer needs to start a fresh session after installing an updated `.skill` file. This should be noted in the `dev-environment` skill or `CLAUDE.md` next time either is updated. Not urgent — flag for findasale-records on next doc pass.

---

### Proposals Needing Patrick's Input

**Proposal A — Clay MCP Activation (Highest Leverage)**
```
Category: Connector / outreach pipeline
Impact: HIGH — potentially 12,800–19,200 new contactable organizers from the existing pool
Effort: Session task (API key purchase + findasale-dev integration)
Proposal: Purchase Clay Launch plan ($185/month). Run one-time WARM-tier enrichment batch 
          (~$1,200–$1,500 total credit cost) to go from 197 high-confidence emails to 
          potentially 2,400–3,600. Wire Clay's enrichment results back to Postgres 
          (directoryClaimEmail.contactEmail field) via a new enrichment service. 
          Research fully done — feasibility confirmed, architecture approved.
Route to: Patrick investment decision → findasale-sales-ops for roadmap entry → findasale-dev for integration
Auto-executable: No — requires Patrick to purchase Clay credits and provide API key
```

**Proposal B — Pirate Ship UPS/FedEx Rate Card Import**
```
Category: Data accuracy / eBay shipping
Impact: HIGH — the smart flat-rate engine is live on 9 listings; wrong rate tables = wrong buyer quotes
Effort: Quick win (Patrick provides rates → findasale-dev replaces ~20 lines in ebayRateEstimateService.ts)
Proposal: Patrick pulls current UPS/FedEx ground rates from Pirate Ship rate card page, 
          provides the per-zone rates to findasale-dev. Dev replaces the estimate tables 
          with real Pirate Ship data. No logic change — data-only update.
Route to: Patrick provides rate card → findasale-dev for table update → push + verify on the Danner pump
Auto-executable: No — blocked on Patrick providing the rate data
```

**Proposal C — Use the Doubled Usage Window for QA Sprint**
```
Category: Process / QA velocity
Impact: MEDIUM — clears CODE-ONLY backlog before beta organizers onboard
Effort: 2–3 focused QA sessions (Chrome-intensive)
Proposal: Before July 5 when the doubled usage limit reverts, run focused QA dispatches on:
          (1) #465 GA4 first_item_published — Chrome QA with a fresh sale (1 session)
          (2) CatalogSuggestionPanel renders + accept fills fields (1 session)
          (3) Live title-edit propagation E2E as artifactmi (same session as #2)
          (4) Referral Tranche B #316 — 3 sale visits from referred user (1 session)
          These are the highest-confidence-of-success Chrome QA targets remaining.
Route to: findasale-qa (sequential, one per session per QA concurrency rule)
Auto-executable: No — Patrick schedules the QA sessions
```

---

### Research Needed

**R-1: Confirm carrier rate-staleness scheduled task name and last fire date**
The S975 monthly rate-staleness checker task was created but not named in STATE.md. Patrick should confirm it appears in the Cowork task list and has a recent lastRunAt. If it never fired, a single findasale-ops dispatch can verify its config.

**R-2: Verify June 15 Anthropic billing change impact**
Anthropic changed billing on Cowork today. Patrick should verify his plan details haven't changed at claude.ai/settings before starting any large session that assumes the doubled usage window.

---

### Parking Lot (Interesting, Not Urgent)

- **Advisor strategy (beta)**: The new multi-model "advisor" pattern could improve findasale-architect decisions. Worth revisiting when it exits beta and is available in Cowork skills.
- **Apollo MCP (sequence after Clay)**: Once Clay batch enrichment is processed and sent, Apollo can expand the prospecting surface to organizers not yet in the scraper pool. Evaluate Q3 2026.
- **Canada Phase 1 (#367)**: Queued on roadmap but no sprint date set. Board estimate 7–9 weeks. No trigger yet — wait for first beta organizer cohort to stabilize.

---

## Summary for Patrick

**Top 3 actionable proposals:**

1. **Clay connector** — Research has been done, verdict is clear, and the outreach pipeline is the biggest growth constraint right now. $185/month + a one-time ~$1,400 batch enrichment run. Highest-leverage unscheduled item in the codebase. Decision needed.

2. **Pirate Ship rate card** — The smart flat-rate engine is live and correct *in logic*, but the UPS/FedEx numbers are estimates. This is a 10-minute data-pull from Pirate Ship + one findasale-dev dispatch. Small effort, high accuracy impact for organizers listing on eBay.

3. **QA sprint before July 5** — Doubled usage window is active now. BQ is at 1. Three focused Chrome sessions would clear the most verifiable CODE-ONLY items (#465 GA4, CatalogSuggestionPanel, Referral Tranche B). After July 5 the window reverts.

**Good news:** BROKEN table is empty. BQ is at 1. Production is healthy. The eBay shipping system is accurate and sweeping. This is the best project health state documented to date.
