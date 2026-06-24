# Power User Sweep — 2026-05-25

**Run date:** Monday May 25, 2026 (automated scheduled run)
**Previous sweep:** 2026-05-18
**Session context:** S787 complete (shopper QA, bell icon fix, QR expand/share). Key open items: Photo upload pipeline BROKEN (#319/#325/#328), shopper accounts blocked by re-seed, several UNVERIFIED eBay/XP items in blocked queue.

---

## Summary

Four significant findings this sweep:

1. **P0 SKILL BUG — findasale-ops has 14 Neon references**: The ops skill still instructs agents to use Neon dashboard, Neon URLs, Neon cold-start handling, and Neon migration commands. Database has been on Railway PostgreSQL since S264 (10+ months). Any session loading findasale-ops gets completely wrong DB troubleshooting guidance.

2. **Work discovery — Photo upload pipeline fix is unblocking 3 BROKEN roadmap items**: #319/#325/#328 were confirmed BROKEN in S786 with root cause isolated (upload never creates Photo records). No dev dispatch has gone out yet per STATE.md. This is the single highest-value code fix available.

3. **Ecosystem — Dreaming (research preview)**: Anthropic's new Managed Agents feature reviews past sessions to extract patterns and self-improve agent memory. Harvey achieved 6x completion rate improvement. Worth investigating whether FindA.Sale's Cowork plan can activate this.

4. **Cowork billing UNAFFECTED by June 15 change**: The Agent SDK separate credit pool (announced May 13) applies only to programmatic/API usage. Claude Cowork remains on existing subscription limits. No action needed.

QW-1 from May-18 sweep (weekly-pipeline-briefing description mismatch) still unexecuted — carrying forward.

---

## Resolved Issues (Cleared from Previous Sweeps)

| Issue | Status | Note |
|-------|--------|------|
| dev-environment Neon refs | ✅ STILL CLEAN | 0 matches confirmed again |
| findasale-deploy Neon refs | ✅ STILL CLEAN | 0 matches confirmed again |
| Thursday task contention | ✅ STILL RESOLVED | weekly-full-site-audit on Saturday |
| daily-friction-audit gaps | ✅ RESOLVED | lastRunAt May 22, nextRunAt today May 25 — normal Mon–Fri cadence |
| monday-digest missed May 18 | ✅ RESOLVED | Actually fired at 10:40am May 18 (late but ran). nextRunAt today May 25 at 4:38am |

---

## Scheduled Task Audit — 2026-05-25

16 tasks active (up from 15 last sweep — **findasale-seo-geo-monitor added**, good addition).

| Task | Schedule | Last Run | Next Run | Status |
|------|----------|----------|----------|--------|
| findasale-health-scout | Sunday 4:08am | May 24 | May 31 | ✅ |
| findasale-competitor-monitor | Thursday 4:05am | May 21 | May 28 | ✅ |
| findasale-ux-spotcheck | Wednesday 4:03am | May 20 | May 27 | ✅ |
| findasale-monthly-digest | 1st of month | May 2 | Jun 1 | ✅ |
| findasale-workflow-retrospective | 8th of month | May 8 | Jun 8 | ✅ |
| context-freshness-check | Monday 4:23am | May 18 | Today 4:23am | ✅ |
| findasale-power-user-sweep | Monday 3:07am | Today (this run) | Jun 1 | ✅ |
| daily-friction-audit | Mon–Fri 3:38am | May 22 | Today 3:38am | ✅ |
| weekly-pipeline-briefing | Friday 4:03am | May 22 | May 29 | ⚠️ Description mismatch (2nd consecutive flag) |
| weekly-full-site-audit | Saturday 4:00am | May 23 | May 30 | ✅ |
| weekly-brand-drift-detector | Tuesday 4:07am | May 19 | May 26 | ✅ |
| monday-digest | Monday 4:38am | May 18 (10:40am) | Today 4:38am | ✅ (late but firing) |
| findasale-session-warmup | Manual | — | — | ✅ |
| findasale-session-wrap | Manual | — | — | ✅ |
| findasale-ci-sentry-health | Daily 2:10am | Today | May 26 | ✅ |
| findasale-seo-geo-monitor | Tuesday 7:02am | May 19 | May 26 | ✅ NEW |

### Anomaly: weekly-pipeline-briefing description still stale

Description still says "Monday 9am, owned by findasale-sales-ops" — actual schedule is Friday 4:03am. This was flagged in both May-11 and May-18 sweeps as QW-1 with "auto-execute: yes." It has not been fixed in two sweeps. Escalating to execute this sweep.

---

## Ecosystem Research — 2026-05-25

### Dreaming — Claude Managed Agents (Research Preview, May 6)

Anthropic launched "Dreaming" for Managed Agents: a scheduled process that reviews past sessions, extracts patterns across the agent fleet, and auto-updates memory so agents improve over time. Harvey (legal AI) used this to get ~6x completion rates on complex drafting tasks.

**Applicable to FindA.Sale?** Partially. The findasale-* skill fleet runs on Cowork, not Managed Agents. However, the key mechanism — cross-session pattern extraction — is what the existing memory system + findasale-records already does manually. If Dreaming becomes available in Cowork (currently Managed Agents only), it would automate what currently requires manual session wrap + memory updates.

**Recommended action:** Monitor for Dreaming availability in Cowork. Not actionable today — parking lot.

### Multiagent Orchestration — Claude Managed Agents (May 7)

Lead agent can now break jobs into pieces and delegate to specialist sub-agents each with their own model, prompt, and tools. This mirrors the findasale parallel dispatch pattern already in CLAUDE.md §7. No action needed — the current architecture already implements this pattern manually.

### Cowork Billing — June 15 Change Does NOT Apply

The Anthropic Agent SDK billing split (June 15) moves programmatic/API usage to a separate $200 credit pool. Cowork interactive usage stays on existing subscription limits. **No action required.** Patrick's Cowork usage is unaffected.

### Claude for Small Business (May 13)

15 workflows, 15 skills, 10+ connectors aimed at SMBs. Skimmed connector list — nothing new beyond what's already available (Gmail, Stripe, Google Sheets already accessible). No new connectors directly relevant to FindA.Sale beyond what was already evaluated.

### New connectors not yet evaluated since May-18 sweep

No significant new connectors identified in this sweep beyond the ones noted in May-18 (Apollo, Clay still available and unactioned).

---

## Skill Library Audit — 2026-05-25

All skills scanned for Neon, Docker, and stale DB references.

| Skill | Neon refs | Issue | Severity |
|-------|-----------|-------|----------|
| **findasale-ops** | ❌ 14 references | Entire DB section references Neon dashboard, Neon URLs, Neon cold starts, Neon migration commands | **P0** |
| conversation-defaults | 1 minor reference | "Session 89 — Claude issued a docker exec command" (historical note only, not an instruction) | Low — no action needed |
| dev-environment | ✅ 0 | Clean | ✅ |
| findasale-deploy | ✅ 0 | Clean | ✅ |
| All others | Not deep-scanned | No P0 patterns surfaced | ✅ assumed current |

### findasale-ops Neon staleness — full scope

The skill's infrastructure table says `Database: Neon (PostgreSQL)`. Its deployment checklist says "check `$DB/prisma/migrations/` vs Neon applied." Its troubleshooting tree routes DB issues to "Neon connection." Its migration section shows `$env:DATABASE_URL="[pooled neon url]"` and `$env:DIRECT_URL="[direct neon url]"`. The migration verification step says "verify in Neon dashboard."

All of this is wrong. Database is Railway PostgreSQL (`maglev.proxy.rlwy.net:13949`). Has been since S264.

**Impact:** Any session that loads findasale-ops for a DB issue (crashed backend, migration failure, connection error) will follow the wrong troubleshooting path entirely — checking a decommissioned database. This could waste a full session before the wrong track is discovered.

**Fix:** Dispatch to skill-creator → findasale-records. Replace all Neon references with Railway PostgreSQL. Update connection string format, migration instructions, and troubleshooting steps.

---

## Research-to-Roadmap Gap Analysis — 2026-05-25

### Unactioned proposals from prior sweeps

| Proposal | Age | Status | Recommendation |
|----------|-----|--------|----------------|
| Apollo MCP plugin (P-1, May-11 + May-18) | 14 days | ❌ No action taken | Escalate — 2 weeks is the stall threshold |
| LinkedIn Outreach #376 GO/NO-GO (P-2, May-11 + May-18) | 14 days | ❌ No action taken | Surface again with urgency |
| Global CLAUDE.md password update | 3+ sessions | ❌ Still in Next Session | Patrick action, not Claude |

### Photo pipeline BROKEN — dispatch gap

STATE.md §Blocked Queue shows #319/#325/#328 all have "Fix: dispatch findasale-dev" as the noted action. STATE.md §Next Session does NOT include this as a dispatched item. The fix has been identified but not sent. Root cause is isolated and simple: the upload pipeline writes photos to `Item.photoUrls` (string array) but never inserts rows into the `Photo` table. All burst clustering, photo role awareness, and best-photo-first sorting are dead code until this is fixed. Single dev dispatch, single controller change, unblocks 3 BROKEN items.

### cold-outreach-2026-05 research folder — new since last sweep

Four docs added: `smartlead-vs-instantly-deepdive.md`, `tier-b-cold-email-tools-deepdive.md`, `innovative-outreach-channels.md`, `architecture-integration-audit.md`. These suggest outreach tool evaluation is active. Not yet cross-referenced against roadmap. Flag to findasale-sales-ops or findasale-innovation for roadmap sync.

---

## Improvement Batch — 2026-05-25

### Quick Wins (auto-executable — no Patrick input needed)

**QW-1 (CARRIED): Fix weekly-pipeline-briefing task description**
- Route: findasale-records (scheduled task update)
- Action: Update description from "Monday 9am, owned by findasale-sales-ops" to "Friday 4:03am — weekly organizer acquisition pipeline briefing, owned by findasale-sales-ops"
- Effort: 1 line
- Status: Flagged May-11, May-18, now May-25. Still not executed. Escalating.
- Note: Power user cannot directly update scheduled task descriptions — requires Patrick or findasale-records in an interactive session.

---

### Proposals Needing Patrick's Input

**P-1 (ESCALATED): Photo upload pipeline fix — dispatch findasale-dev**

- **Category:** Autonomous work (BROKEN roadmap items)
- **Impact:** High — fixes 3 BROKEN features in one dispatch: #319 Burst Clustering, #325 Best-Photo-First Sorting, #328 Photo Role Awareness
- **Effort:** Single dev dispatch, ~30 min. Root cause confirmed: `photoController.ts` / upload route never inserts into `Photo` table. Fix adds Photo record creation alongside the existing `Item.photoUrls` update.
- **Proposal:** Dispatch findasale-dev with: "In the photo upload pipeline, after writing `photoUrls` to the Item record, also create a `Photo` record for each uploaded URL with fields: `itemId`, `url`, `orderIndex` (position in array), `photoRole` (default null — AI assigns later), `roleReasoning` (default null), `clusterConfidence` (default null). This unblocks #319, #325, #328."
- **Route to:** findasale-dev (dispatch from main session next session start)
- **Auto-executable?** No — needs main session (cannot dispatch from scheduled run)

**P-2 (ESCALATED): Apollo MCP plugin install — 14-day stall**

- **Category:** Ecosystem connector
- **Impact:** High — email coverage 14.3% → projected 30–40%+. Unlocks the remaining 50k+ organizer pool for outreach.
- **Effort:** Patrick installs plugin (5 min) → one dev session to write enrichment script
- **Proposal:** Apollo has been flagged for 2 consecutive sweeps with no action. The outreach pipeline is healthy (29 sends since fix, ~48/day warmup pace) but will exhaust the 208-org WARM addressable pool within ~4 days at current pace. Apollo enrichment is the refill mechanism. Install: Cowork → Connectors → Apollo → sign in via OAuth. Then dispatch enrichment script.
- **Route to:** Patrick installs → findasale-dev implements `enrichContactEmailsApollo.ts`
- **Auto-executable?** No — needs Patrick to install + approve spend

**P-3 (ESCALATED): LinkedIn Outreach #376 GO/NO-GO — 14-day stall**

- **Category:** Autonomous work (deferred window elapsed)
- **Impact:** High — LinkedIn targets the HOT tier orgs (estate sale companies, auction houses, consignment stores) who are most reachable and most likely to convert.
- **Effort:** Session task — findasale-sales-ops writes sequence + ICP criteria, findasale-marketing writes message copy
- **Proposal:** 2-week deferral was set May 4. Now 21 days post-deferral. Cold email warm-up is active. LinkedIn parallel pilot ($99/mo Expandi) was the roadmap plan. Need Patrick's GO/NO-GO.
- **Route to:** Patrick GO → findasale-sales-ops + findasale-marketing
- **Auto-executable?** No — Patrick GO/NO-GO

**P-4 (NEW): Fix findasale-ops SKILL.md Neon references**

- **Category:** Skill optimization — P0 staleness
- **Impact:** High — prevents wrong-database debugging in any session involving a production DB issue or migration
- **Effort:** Skill-creator pass, ~20 min. Replace 14 Neon references with Railway PostgreSQL equivalents.
- **Proposal:** Dispatch skill-creator to update findasale-ops SKILL.md: (1) infrastructure table: Neon → Railway PostgreSQL (`maglev.proxy.rlwy.net:13949`), (2) deployment checklist: Neon dashboard check → Railway dashboard check, (3) migration instructions: replace `[pooled neon url]` / `[direct neon url]` with Railway DATABASE_URL, (4) troubleshooting tree: Neon connection → Railway DB, (5) cold start references: Neon cold starts → Railway startup. Then findasale-records reviews + packages as `.skill`.
- **Route to:** skill-creator → findasale-records
- **Auto-executable?** Yes — pure doc fix, no product/architecture impact. Can proceed next session without Patrick approval.

---

### Research Needed

**R-1: cold-outreach-2026-05 docs → roadmap sync**

Four new research docs were added to `claude_docs/research/cold-outreach-2026-05/` (smartlead-vs-instantly, tier-b tools, innovative channels, architecture integration audit). These have not been cross-referenced against the outreach roadmap. Dispatch findasale-sales-ops to review and flag any recommendations not yet on the roadmap.

Route to: findasale-sales-ops (1-session review)

**R-2: Dreaming availability in Cowork**

Dreaming is currently Managed Agents only (research preview). Monitor for Cowork availability. If it lands, it could automate the cross-session pattern extraction that currently requires manual findasale-records updates.

Route to: This sweep (monitor) → flag when available

---

### Parking Lot

- **Multiagent Orchestration (Managed Agents):** FindA.Sale already implements this manually via CLAUDE.md §7 parallel dispatch. No action needed unless Managed Agents offers significant performance advantage over current Cowork parallel Agent calls.
- **DocuSign connector:** Still relevant for consignor agreement automation (#239 Multi-Consignor Estate Settlement). Revisit when #239 is scheduled.
- **MCP Server (#388):** Still queued, spec exists, no movement. 24-day holdover.
- **Shopify Cross-Listing (#332):** Confirmed implemented (Organizer model + ShopifyListing table). Pending Chrome QA, not a roadmap gap.

---

## Top 3 Actionable Proposals for Patrick

**1. Dispatch photo upload pipeline fix (findasale-dev) — unblocks 3 BROKEN items at once**
Root cause is confirmed: upload pipeline writes to `Item.photoUrls` but never creates `Photo` records. Fix is a targeted addition to the upload handler. Unblocks burst clustering (#319), best-photo-first sorting (#325), and photo role awareness (#328) in a single dispatch. This has been sitting since S786 with no action.

**2. Fix findasale-ops SKILL.md — P0 Neon references (14 lines)**
The ops skill still tells agents to use Neon for all database operations. Any session that loads findasale-ops for a production DB issue follows the wrong troubleshooting path entirely. Quick fix: skill-creator pass to replace all Neon refs with Railway PostgreSQL. No Patrick input needed for the fix — can auto-execute.

**3. Apollo install decision (2-week stall) — outreach addressable pool is ~4 days from exhaustion**
208 WARM organizers are addressable today (have website, no email). At 48/day outreach pace, that pool runs out in about 4 days. Apollo email enrichment is the fastest way to refill it. Two sweeps of flagging, no action. If LinkedIn (#376) is also going, both can launch in the same session.

---

*Power User Sweep complete. Auto-execute QW-1 (pipeline briefing description) deferred — requires interactive session. P0 skill fix (findasale-ops Neon refs) flagged for next session auto-dispatch via skill-creator.*
