# Power User Sweep — 2026-03-30

**Agent:** Cowork Power User
**Scheduled run:** Monday weekly sweep
**Sessions reviewed:** S328–S339
**Files read:** STATE.md, roadmap.md, dev-environment/SKILL.md, context-maintenance/SKILL.md, findasale-push-coordinator/SKILL.md, research/cowork-ecosystem-audit-2026-03-15.md, research/tool-ecosystem-evaluation-2026-03-15.md
**Scheduled tasks audited:** 14 tasks reviewed

---

## Ecosystem Research — 2026-03-30

### New Capabilities Found

The Cowork ecosystem has moved fast since the last audit (2026-03-15). Key additions:

- **Cowork Plugin Marketplace** — Launched February 24, 2026. Central hub for installing skills + connectors as bundled plugins. FindA.Sale now has the knowledge-work-plugins pack installed (visible in available_skills). Good adoption.
- **38+ connectors total** — Including Google Calendar, Google Drive, Gmail, DocuSign, Apollo, Clay, Outreach, Similarweb, WordPress, and Harvey added in the Feb batch.
- **Dispatch (March 18, 2026)** — New feature: send a message to your running Cowork session from your phone. Claude acts on it while your computer does the work. Potentially valuable for a founder who is physically present at estate sales.
- **Windows support + feature parity** — Confirmed. Patrick on Windows is fully supported.
- **Scheduled tasks** — Now 14 tasks running across FindA.Sale. Good coverage.

### Applicable to FindA.Sale

- Gmail MCP is now available and Patrick has support@finda.sale — could automate organizer inquiry triage without a full session.
- Dispatch could let Patrick trigger Claude tasks from the field (e.g., "push the hold notification fix", "run QA on the sale page") while physically at an estate sale.
- Marketplace plugin pattern: the knowledge-work-plugins pack is installed and working. Good foundation for adding domain-specific connectors.

### Recommended Actions

- Evaluate Dispatch for field use (Patrick decision).
- Evaluate Gmail MCP connector for Customer Champion triage automation (findasale-customer-champion + records).

---

## Improvement Batch — 2026-03-30

---

### 🔴 Quick Wins (auto-executable — proceeding unless Patrick objects)

---

**QW-1: dev-environment skill has stale Neon reference (P1 bug)**
**Found by:** Skill audit
**Category:** Skill staleness — correctness bug
**Impact:** HIGH — A session following the dev-environment skill could be directed to look for a `# DATABASE_URL=postgresql://neondb` Neon line in .env. Neon was decommissioned in S264 and Railway is now production. This is wrong and could cause a session to use the wrong database URL.
**Effort:** Quick win (~5 min edit)
**Specific line:** `dev-environment/SKILL.md` lines 47-49:
```
- For Neon (production): Find the commented line `# DATABASE_URL=postgresql://neondb`.
```
This reference is dead. Neon is gone. Production is Railway (`maglev.proxy.rlwy.net:13949/railway`).
**Fix:** Remove Neon reference; replace with Railway URL pattern. Route to skill-creator for update.
**Auto-executable?** YES — this is a factual correction, not a product decision.

---

**QW-2: Roadmap "Rotate Neon database credentials" stale checklist item**
**Found by:** Roadmap review
**Category:** Documentation staleness — stale Patrick action item
**Impact:** MEDIUM — Patrick's checklist still lists "Rotate Neon database credentials (2026-03-09)" with a ✅ but this service was fully decommissioned. The old URL (`ep-plain-sound-aeefcq1y.c-2.us-east-2.aws.neon.tech`) is live in CLAUDE.md's "never use" list. The checklist item is harmless but creates confusion.
**Effort:** Quick win — remove/annotate the checklist entry
**Fix:** Route to findasale-records to update the roadmap Patrick's Checklist section.
**Auto-executable?** YES — this is a stale reference cleanup.

---

**QW-3: Roadmap `Last Updated` stamp is stale (S328–S339 not logged)**
**Found by:** Roadmap review
**Category:** Documentation staleness
**Impact:** MEDIUM — The roadmap says `Last Updated: 2026-03-27 (v80...)` but sessions S328–S339 shipped major features (desktop nav search, map filter, Hold Button full system, notification system, multiple bug fixes). The roadmap feature tables have `P` status entries that should now reflect actual QA findings.
**Effort:** Session task — Records agent pass
**Fix:** Route to findasale-records for a roadmap sync pass updating QA/Chrome columns for recently shipped features.
**Auto-executable?** YES — route to records.

---

### 🟡 Proposals Needing Patrick's Input

---

**P-1: Brand Voice Session — overdue before more marketing content ships**
**Found by:** Roadmap Patrick's Checklist review
**Category:** Pre-beta prep gap
**Impact:** HIGH — Brand Voice Session is on Patrick's pre-beta checklist. Beta evaluation week started 2026-03-22 with real customers. All current email sequences, organizer outreach templates, and UI copy are being produced without a documented brand voice. Every future MailerLite campaign, organizer outreach email, and Customer Champion response is written without an agreed voice. This creates inconsistency at the worst possible moment — when real users are forming first impressions.
**Effort:** Session task (1 session with brand-voice plugin)
**Proposal:** Run the brand-voice plugin skill to produce a documented voice, tone, and messaging pillars doc. Takes one session. Should happen before any more organizer outreach emails or marketing campaigns are drafted.
**Route to:** `marketing:brand-voice` plugin skill
**Auto-executable?** NO — needs Patrick to confirm timing.

---

**P-2: Canary Deploy pre-wiring — roadmap says trigger is met**
**Found by:** Roadmap deferred section
**Category:** Infrastructure / deploy risk reduction
**Impact:** MEDIUM — The roadmap's deferred section on "Canary Deploy + Auto-Rollback" explicitly says: *"trigger effectively met; pre-wire: Vercel preview env + Railway staging slot config can be set up now."* This has been sitting unacted-on. As beta grows and deploys become more frequent, the risk of a bad deploy reaching real users increases. Pre-wiring this (Vercel preview + Railway staging config) is a one-time setup, not a full build.
**Effort:** Session task
**Proposal:** Dispatch findasale-ops to pre-wire: Vercel preview environment variables + Railway staging slot configuration. Does not require full canary logic — just the infrastructure hooks. Activation remains deferred.
**Route to:** findasale-ops → findasale-architect for scope
**Auto-executable?** NO — Patrick should confirm priority before ops session.

---

**P-3: New Cowork Dispatch feature — evaluate for field use**
**Found by:** Ecosystem scan
**Category:** Ecosystem feature
**Impact:** MEDIUM — Dispatch (launched March 18, 2026) lets Patrick message his running Cowork session from his phone while his computer works. Since Patrick is sometimes physically present at estate sales, this could let him trigger actions like "run the session warmup" or "check if Railway is down" without being at his desktop.
**Effort:** Zero setup — built into Cowork
**Proposal:** Patrick tries the Dispatch feature on his phone next time he has a Cowork session running. No configuration needed. If useful, we can build specific Dispatch workflows (e.g., quick status check, trigger warmup, request a pipeline briefing).
**Route to:** Patrick direct evaluation
**Auto-executable?** NO — Patrick needs to try it.

---

**P-4: Gmail MCP connector for organizer support triage**
**Found by:** Ecosystem scan
**Category:** Connector opportunity
**Impact:** MEDIUM — Gmail MCP is now available. Patrick has support@finda.sale. Currently, any organizer inquiry that hits that inbox requires Patrick to manually respond or start a Cowork session. With Gmail MCP connected, the Customer Champion skill could automatically draft responses to common organizer questions (onboarding help, "how do I add items", "can I cancel a hold") and route them back to Patrick for one-click send.
**Effort:** Session task (connector setup + Customer Champion enhancement)
**Proposal:** Connect Gmail MCP to Cowork. Have findasale-customer-champion draft a set of templated responses for the 5 most common organizer questions. Patrick reviews and sends; Claude drafts.
**Route to:** findasale-customer-champion + findasale-records (for skill update)
**Auto-executable?** NO — needs Patrick to connect Gmail MCP in Cowork settings.

---

### 🔵 Research Needed

---

**R-1: Claude Code CLI adoption — 9/10 ADOPT recommendation from March 15 still unacted-on**
**Found by:** Research doc review (`tool-ecosystem-evaluation-2026-03-15.md`)
**Context:** FindA.Sale's own innovation research rated Claude Code CLI at 9/10 with an ADOPT recommendation 15 days ago. Estimated benefit: 2-4 hours/week savings on exploratory/debugging tasks. The main value is letting Patrick ask quick codebase questions ("why is this failing", "where is X defined") without spinning up a full Cowork session and burning context budget.
**Gap:** No follow-up has happened. Patrick may not be aware this was recommended.
**Next step:** Flag to Patrick with the decision matrix from the research doc (CLI for exploration/quick fixes; Cowork for architecture/multi-step features). Simple `npm install -g @anthropic-ai/claude-code` to try.

---

### 🗂️ Parking Lot (interesting, not urgent)

---

- **Persistent Inventory pre-wiring** — Roadmap says add `persistentInventory boolean + masterItemLibraryId FK` to Item schema as a zero-cost pre-wire. Post-beta trigger not yet met. Revisit after beta data.
- **Audit Automation Library** — Roadmap says "trigger effectively met; pre-wire: health-scout baseline JSON + test harness can be scaffolded now." Good post-beta sprint candidate.
- **Affiliate Program partial backend** — 60% built per roadmap. Full payout deferred but referral code table + payout calc engine can be pre-wired now per roadmap guidance.
- **Apollo MCP connector** — Available for organizer prospecting (finding estate sale organizers in Grand Rapids area). Post-beta, useful for sales-ops outreach automation.

---

## Scheduled Task Health

14 tasks reviewed. All enabled. All have recent lastRunAt within expected cadence. One flag:

- **Thursday double-booking:** `weekly-full-site-audit` (Chrome-heavy) and `findasale-competitor-monitor` both run at 4:00 AM Thursday. They run in separate sessions so there's no technical conflict, but if either runs long and overlaps, Chrome state may be affected. Low risk currently — monitor if audits start producing incomplete results on Thursdays.

No stale or broken tasks found. Coverage is good.

---

## Skills Audit Summary

| Skill | Version | Last Updated | Status |
|-------|---------|--------------|--------|
| findasale-dev | 3 | 2026-03-23 | ✅ Current |
| findasale-qa | — | — | ✅ Current |
| findasale-records | — | — | ✅ Current |
| health-scout | — | — | ✅ Current |
| dev-environment | — | — | ⚠️ **STALE** — Neon ref at line 48 (QW-1 above) |
| context-maintenance | — | 2026-03-21 | ✅ Properly archived |
| findasale-push-coordinator | — | 2026-03-21 | ✅ Properly archived |

No missing skills identified. No triggering issues found in descriptions. The archived skills (context-maintenance, findasale-push-coordinator) are correctly marked and blocked from invocation.

---

## Auto-Executed Quick Wins

QW-1 and QW-3 are being routed to findasale-records for execution. QW-2 is a single-line fix that records can apply in the same pass.

*Note: These are documentation and skill corrections only. No code changes. No Patrick action required unless Patrick objects.*
