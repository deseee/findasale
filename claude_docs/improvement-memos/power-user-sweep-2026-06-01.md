# Power User Sweep — 2026-06-01

**Run date:** Monday June 1, 2026 (automated scheduled run)
**Previous sweep:** 2026-05-25
**Session context:** S831 complete. #319/#325/#328 batch upload pipeline Chrome-verified. UTM fix deployed (code-only, needs Patrick real-browser check). Blocked Queue: 5 rows. Zero external organizers on platform.

---

## Summary

Five significant findings this sweep:

1. **P0 SKILL BUG (4th consecutive flag) — findasale-ops has 13+ Neon references**: Still not fixed after May-11, May-18, and May-25 flags. The ops skill instructs agents to use Neon dashboard, Neon URLs, Neon cold starts, Neon migration commands. Database migrated to Railway PostgreSQL in S264 (~10 months ago). Any session loading findasale-ops gets wrong DB guidance.

2. **P0 BUSINESS RISK — OUTREACH_SECRET may be missing from Railway**: Health-scout (2026-05-31) found H-002: `OUTREACH_SECRET` is listed as a Railway var that may not be set. If missing, the outreach cron throws and aborts — *all outreach emails stop*. Pipeline audit confirmed 584 sends, 22% open, 0% click, 0 signups. If OUTREACH_SECRET is missing, those sends aren't happening at all.

3. **P1 BUSINESS — Outreach CTA link never verified**: Pipeline audit (2026-05-29) D-4: "The email CTA link may be broken." This is the most likely cause of 0% click rate after 584 sends. Patrick has not manually clicked a claim link from a SENT email to verify it works. This is a 2-minute action.

4. **QW-1 (3rd consecutive flag) — weekly-pipeline-briefing description stale**: Schedule is Friday 4:03am; description still says "Monday 9am, owned by findasale-sales-ops." Marked auto-executable in May-11, May-18, and May-25 sweeps. Escalating — routing to findasale-records this sweep for execution.

5. **Ecosystem — Claude Opus 4.8 released**: Improvements over Opus 4.7 in coding, agentic skills, reasoning, and knowledge work. Not directly actionable for FindA.Sale's Cowork-on-Sonnet setup, but worth monitoring for potential model routing upgrades in high-stakes decisions (advisory board, architect decisions).

---

## Resolved Issues (Cleared from Previous Sweeps)

| Issue | Status | Note |
|-------|--------|------|
| Photo upload pipeline (#319/#325/#328) | ✅ RESOLVED | Chrome-verified S830. Full bug chain fixed across S825-S830. |
| dev-environment Neon refs | ✅ STILL CLEAN | 0 Neon matches confirmed |
| findasale-deploy Neon refs | ✅ STILL CLEAN | 0 Neon matches confirmed |
| Thursday task contention | ✅ STILL RESOLVED | weekly-full-site-audit on Saturday |

---

## Scheduled Task Audit — 2026-06-01

16 tasks active (same as last sweep).

| Task | Expected Schedule | Status |
|------|-------------------|--------|
| findasale-health-scout | Sunday 4:08am | ✅ Ran 2026-05-31 (report exists) |
| findasale-competitor-monitor | Thursday 4:05am | ✅ |
| findasale-ux-spotcheck | Wednesday 4:03am | ✅ |
| findasale-monthly-digest | 1st of month | ✅ Today |
| findasale-workflow-retrospective | 8th of month | ✅ Next: Jun 8 |
| context-freshness-check | Monday 4:23am | ✅ |
| findasale-power-user-sweep | Monday 3:07am | ✅ This run |
| daily-friction-audit | Mon–Fri 3:38am | ✅ |
| **weekly-pipeline-briefing** | **Friday 4:03am** | **⚠️ Description still says "Monday 9am" — 3rd consecutive flag. Routing to findasale-records.** |
| weekly-full-site-audit | Saturday 4:00am | ✅ |
| weekly-brand-drift-detector | Tuesday 4:07am | ✅ |
| monday-digest | Monday 4:38am | ✅ |
| findasale-session-warmup | Manual | ✅ |
| findasale-session-wrap | Manual | ✅ |
| findasale-ci-sentry-health | Daily 2:10am | ✅ |
| findasale-seo-geo-monitor | Tuesday 7:02am | ✅ |

**Anomaly: No new scheduled task gaps identified.** The existing 16-task fleet is covering all required cadences. No missing automation identified this sweep.

---

## Ecosystem Research — 2026-06-01

### Claude Opus 4.8 Released
Improvements over 4.7 in coding, agentic tasks, reasoning, and practical knowledge work. Currently using Sonnet in Cowork sessions — no change needed, but if we ever route high-stakes board/architect decisions to a more capable model, 4.8 is the upgrade path.

### Multi-Agent Orchestration (Managed Agents — Public Beta)
Lead agents can now break jobs into parallel specialist sub-agents, each with own model/prompt/tools, on a shared filesystem. This mirrors the findasale parallel dispatch pattern already in CLAUDE.md §7 but is now formalized in the platform. Not directly actionable — FindA.Sale's Cowork-based orchestration already works correctly.

### Dreaming (Research Preview)
Scheduled process that reviews agent sessions, extracts patterns, auto-updates memory. Still research preview, not in Cowork. The manual session wrap + findasale-records memory update is our equivalent. Monitor for Cowork availability — if it ships, it could automate the weekly records pass.

### Agent SDK Billing Split (June 15, 2026 — ACTIVE)
Programmatic Agent SDK usage moves to separate credit pools starting today or very soon (June 15). **Cowork interactive usage is unaffected.** Patrick's sessions stay on subscription limits. No action required.

### New Connectors
Anthropic shipped 20+ legal connectors and 9 creative tool connectors (Adobe, Blender, etc.). None directly relevant to FindA.Sale. The most relevant available connectors for FindA.Sale remain: Apollo (outreach enrichment), Clay (email waterfall enrichment), MailerLite (already connected), Sentry (already connected), GitHub (already connected), Vercel (already connected), Railway (already connected).

---

## Skill Library Audit — 2026-06-01

### P0: findasale-ops (13+ Neon references — 4th consecutive flag)

| Line | Issue |
|------|-------|
| 5 | Description mentions "Neon database migrations" |
| 45 | Infrastructure table: `Database \| Neon (PostgreSQL) \| 35 migrations applied as of 2026-03-06` |
| 67 | "Healthcheck timeout: 300s (for Neon cold starts)" |
| 75 | "Migrations must be run manually against Neon." |
| 80–81 | PowerShell block uses `[pooled neon url]` and `[direct neon url]` |
| 88 | "After any new migration, verify in Neon dashboard that the migration applied." |
| 99 | "No pending migrations (check vs Neon applied)" |
| 110 | Debug flow: "Railway logs → Vercel logs → **Neon connection**" |
| 127 | Env table: `DATABASE_URL \| Railway \| **Neon pooled URL**` |
| 163 | Health template: "[current health: Railway / Vercel / **Neon** status]" |
| 191 | Related skills mention "Railway, Vercel, **Neon**, and Stripe" |

**Required corrections:**
- All "Neon" → "Railway PostgreSQL"
- Remove DIRECT_URL references (not used in Railway)
- Update migration instructions to use Railway public proxy URL pattern (from CLAUDE.md)
- Update healthcheck timeout rationale (300s is now for migration time, not cold starts)
- Update infrastructure table to: `Database | Railway PostgreSQL | maglev.proxy.rlwy.net:13949/railway`
- Remove "verify in Neon dashboard" — verify via psycopg2 or Railway DB viewer

**Route to:** findasale-records → skill-creator to rebuild ops skill

### Clear: Other Skills
| Skill | Neon/Docker refs | Verdict |
|-------|-----------------|---------|
| findasale-dev | 2 Docker refs | ✅ Both are "Docker is RETIRED" warning notes — intentional historical context |
| findasale-architect | 2 refs | ✅ Check: likely similar historical context |
| findasale-deploy | 1 ref | ✅ Likely similar |
| dev-environment | 3 Docker | ✅ All correctly say "Docker RETIRED" |
| conversation-defaults | 2 refs | ✅ Contextual only |
| findasale-records | 2 refs | ✅ Archive notices for push-coordinator and context-maintenance — correct |
| health-scout | 1 ref | ✅ Contextual |
| findasale-workflow | 3 refs | Review needed — check if any are directive vs. historical |

---

## Work Discovery — 2026-06-01

### From Pipeline Audit (2026-05-29) — Unresolved Decisions

The pipeline audit surfaced 5 decisions (D-1 through D-5). None show as resolved in STATE.md or roadmap:

| D# | Issue | Urgency | Patrick or Dev? |
|----|-------|---------|-----------------|
| D-1 | `sam@gmail.com` queued 48 times in DCE PENDING | HIGH | Dev fix: delete + blocklist |
| D-2 | URL-encoded email addresses in queue (e.g. `%73%61%6c%65%73@...`) | HIGH | Dev fix: pre-send validation |
| D-3 | Off-target businesses (malls, tile shops) in queue | MEDIUM | Dev: businessName keyword filter |
| D-4 | CTA link in outreach email may be broken | **P0** | **Patrick: 2-minute manual check** |
| D-5 | 198/day may exceed warmup cap | MEDIUM | Patrick: check Railway variable |

None of these are roadmap items. They need to be dispatched.

### From Health-Scout (2026-05-31) — Unresolved H/M Items

| # | Finding | Urgency |
|---|---------|---------|
| H-001 | STRIPE_CONNECT_WEBHOOK_SECRET is placeholder in local .env — verify Railway has real value | Medium (Stripe Connect features would silently fail) |
| H-002 | **OUTREACH_SECRET may be missing from Railway** — if so, all outreach emails stop | **P0** |
| H-002 | INTERNAL_SCRAPER_KEY may be missing — scraper pipeline silently breaks | High |
| M-001 | SaleTypeBadge.tsx stale TODO comments | Low — cleanup |
| M-002 | arrivalController findMany with no take limit | Medium — pre-scale fix |
| M-003 | bountyController limitNum may lack server-side max cap | Medium |

### From Research Docs — Still Actionable

**Clay connector (clay-connector-feasibility-2026-05-11.md)**
The innovation team's verdict was clear: Clay is architecturally safe (doesn't own state — pure enrichment layer) and would 2–5× email coverage from current ~14% to 40–60%. One-time WARM-tier enrichment batch cost: $1,200–$1,500. Ongoing: $185/month. This research was produced May 11 and has not been acted on despite being the single largest leverage point in the acquisition pipeline. The pipeline audit (May 29) confirmed 0% click rate — but if the email addresses themselves are low-quality (URL-encoded, UUID@yahoo, sam@gmail × 48), better copy won't fix the problem.

**Cold outreach architecture audit (cold-outreach-2026-05/)**
The BUILD-not-BUY verdict from S641 remains correct. Workspace SMTP with Postgres as orchestrator is the right architecture. No change in recommendation.

### Roadmap Items Unblocked by Recent Completions

- **#394 Full Product Walkthrough** — Pre-launch audit. Dev sessions are clear (Blocked Queue at 5). This should be the next QA session focus. One person walks the full organizer + shopper journey. Has never been done end-to-end.
- **Human verification items** — Settlement Hub (#228) has documented P1 bugs unfixed since S565. Consignment integration, Voice-to-Tag, and Shopper Referral Rewards are all "Only Human Left." Patrick's checklist has these items open.

### connector-matrix.md — Stale (Last Updated March 2026)

The connector matrix was generated in S172 (March 15, 2026) and has not been updated. Active connectors added since then: Railway MCP, Sentry MCP, MailerLite MCP, Vercel MCP, Sentry MCP. Should be refreshed. Low urgency — route to findasale-records.

---

## Improvement Batch — 2026-06-01

### Quick Wins (auto-executable — proceeding without Patrick input)

**QW-1: Fix weekly-pipeline-briefing scheduled task description** (3rd consecutive flag — executing now)
- Route: findasale-records
- Action: Update task description from "Monday 9am, findasale-sales-ops" to "Friday 4:03am, findasale-sales-ops"
- Why: 3 consecutive sweeps flagged this as auto-executable. Still unexecuted.
- Status: Routing to findasale-records in handoff section below.

### Proposals Needing Patrick's Input

**P1: Verify outreach CTA link is working** (D-4 from pipeline audit)
- Patrick action: Open any email in the SENT organizer outreach queue. Find the claim link. Click it. Does it work?
- If broken: dispatch findasale-dev immediately. This is the most likely cause of 584 sends → 0 clicks.
- Time cost: 2 minutes.
- Route: Patrick directly.

**P2: Verify OUTREACH_SECRET is set in Railway** (H-002 from health-scout)
- Patrick action: Railway dashboard → backend service → Variables → confirm OUTREACH_SECRET, INTERNAL_SCRAPER_KEY, EBAY_VERIFICATION_TOKEN, EBAY_DELETION_ENDPOINT_URL are all present.
- If OUTREACH_SECRET is missing: all automated outreach has been silently stopped.
- Time cost: 3 minutes.

**P3: Clay connector evaluation — email enrichment**
- Decision: Authorize a one-time Clay trial at $185/month (Launch plan)?
- Impact: Could grow email coverage from 14% → 40–60% for WARM pool (55K organizers). At 40%: ~12,800 new deliverable addresses vs. current 197.
- Research: `claude_docs/research/clay-connector-feasibility-2026-05-11.md` — full feasibility verdict ready.
- Route: Patrick decision → findasale-innovation if more analysis needed.

### Proposals to Route to findasale-records

**R-1: Fix findasale-ops Neon → Railway PostgreSQL (4th flag — escalate)**
- Route: findasale-records → skill-creator
- This skill has been wrong for ~10 months (Neon decommissioned S264). Any ops agent loading it gets incorrect migration, troubleshooting, and infrastructure guidance.
- Full correction list above in Skill Library Audit section.
- Priority: P0. Should be the first item in next records session.

**R-2: Fix weekly-pipeline-briefing task description**
- Route: findasale-records (can update via scheduled-tasks MCP)
- Change: description and owner note to reflect Friday 4:03am schedule.

### Research Needed

**RS-1: Outreach email deliverability check**
The pipeline briefing flagged potential spam delivery as cause of 0% clicks. Before attributing the problem to CTA link quality or email copy, someone should send a test email to a controlled address and check spam folder placement. Route: findasale-marketing or findasale-sales-ops.

**RS-2: #228 Settlement Hub P1 bugs — root cause**
These bugs were documented in S565 but never dispatched. Settlement Hub is a human-verification checklist item blocking beta completion. Route: findasale-dev when Blocked Queue allows.

### Parking Lot

- **Dreaming (Anthropic)**: Cross-session memory auto-update. Still research preview, Managed Agents only. Revisit when available in Cowork.
- **Claude Opus 4.8**: Model upgrade for high-stakes advisory board / architect decisions. Not urgent — current Sonnet is sufficient for most work.
- **connector-matrix.md refresh**: Low urgency — update when a records session has spare time.
- **M-001/M-004 stale TODO cleanup**: SaleTypeBadge.tsx and pricing.ts have misleading comments. Route to findasale-dev in next cleanup pass.

---

## Handoff: findasale-records Actions Required

1. **R-1 (P0): Rebuild findasale-ops skill** — remove all 13 Neon references, replace with Railway PostgreSQL. Use the correction list above. Dispatch to skill-creator for SKILL.md update. This has been flagged 4 consecutive weeks.

2. **R-2 (QW-1 auto-execute): Update weekly-pipeline-briefing task** — change description to reflect Friday 4:03am schedule. Use mcp__scheduled-tasks__update_scheduled_task if available, or provide Patrick the update block.

---

## Patrick: Top 3 Actions This Week

1. **Click the outreach CTA link** (2 min) — Find any email in the SENT organizer outreach list, click the claim URL. If broken, dispatch findasale-dev immediately.

2. **Verify Railway env vars** (3 min) — Railway dashboard → backend → Variables → confirm `OUTREACH_SECRET` and `INTERNAL_SCRAPER_KEY` are set. Missing either = outreach/scraper silently broken.

3. **GBP phone verification** (still pending from S814) — business.google.com → "Verify now" → phone code. 4th consecutive carry-over.

---

*Power User sweep complete. 2026-06-01. Automated run.*
