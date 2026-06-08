# Monthly Workflow Retrospective — June 2026
**Session:** Automated (findasale-workflow-retrospective task)
**Date:** 2026-06-08 (S919)
**Coverage:** Sessions S887–S919 (approx. May–June 2026)
**Tool availability note:** Bash workspace was completely down ("No space left on device") during this audit run. All checks used file tools (Read, Glob, Grep) instead of shell commands. TypeScript health check and git diff check are UNVERIFIED this run.

---

## 1. Session Pattern Analysis

### Dominant Pattern: Email Infrastructure Blitz (7+ consecutive sessions)

Sessions S887–S919 were dominated by email system failures. At least 7 consecutive sessions (S912–S919) were classified as OPS or EMAIL_HARDENING, with no new feature dev. The chain:

- S887: Gmail OAuth failure detected → S888 attempted Gmail recovery → S889 outreach OUTREACH_ENABLED env var flip → S912 bounce suppression + email hardening → S913 email gates → S916 Gmail full OAuth recovery → S917 email audit + outreach suspension → S918 Resend transactional rail (22 call sites migrated) → S919 QA/WRAP reconciliation

**Root cause:** Single-point dependency on a Google Workspace outreach account with no fallback. Gmail API OAuth token expiry cascaded into outreach suspension, bounce backlog, OUTREACH_ENABLED flip-flop cycles, and ultimately a full email architecture overhaul. The Resend rail (S918) closes the architectural gap for transactional email, but outreach@finda.sale reactivation (BQ #335) is still a Patrick action pending.

**Recommendation (P1):** Add an SH entry for the outreach@finda.sale suspension pattern. Add a monitoring check or OUTREACH_ENABLED guard to the weekly friction audit so suspension is caught within 1 session, not 7.

---

### Pattern 2: Blocked Queue Oscillation

BQ trajectory over coverage period:
- S887: 4 items → S887 scraper audit added 13 items → ~17 items peak → QA ceiling triggered → S900–S919 QA mode recovery → S919: 5 items

The QA ceiling (≥8 = QA-only mode) is working mechanically. The failure mode is single-audit spikes: one scraper audit adding 13 BQ rows at once pushes recovery time to 7+ sessions. The ceiling enforcement generates the right behavior (QA mode) but the recovery path is slow because Chrome QA is sequential (one feature per dispatch).

**Recommendation:** When a single audit event creates ≥5 new BQ entries, the next session should batch-dispatch Chrome QA across the highest-priority items rather than processing them one per session.

---

### Pattern 3: QA False Positives on Unmet Preconditions

S907 flagged "Flash Deal button — no onClick" and "Social Posts — no onClick" as QA failures. S908 confirmed both work correctly — they are gated on PUBLISHED sale status, which S907 was not testing.

This recurred: QA agents test features without verifying the preconditions required for the feature to be accessible (sale published, tier requirement met, organizer account type). Each false positive costs one QA session + one correction session.

**Recommendation (CLAUDE.md addition):** Add to QA Dispatch Gate (§7): "Before testing any organizer-facing feature, verify the sale is in PUBLISHED status unless testing the non-published state specifically." Add to findasale-qa SKILL.md: precondition checklist (sale status, tier, account type) to run before each feature test.

---

### Pattern 4: Edit Tool Truncation Incident (S900)

13 tracked files were corrupted by Cowork Edit tool silent truncation. Patrick restored from GitHub HEAD. The Edit tool BAN in CLAUDE.md §4 was already in place but was violated in S900.

**Status:** Ban is now locked in CLAUDE.md and memory. This pattern should be added to self_healing_skills.md as a new entry (currently missing — SH-001 through SH-011 exist but none cover the Cowork Edit tool batch truncation specifically; SH-009 covers hash mismatch, not silent content drop).

---

### Pattern 5: Same-Session Chrome Column Update Violations

S907 applied roadmap Chrome column updates in the same session as QA (H-002). CLAUDE.md §10c explicitly prohibits same-session Chrome column updates. findasale-records caught this at S911 wrap.

The rule exists in CLAUDE.md but violations still occur. The cross-session Chrome column update rule needs reinforcement at session start (post-compression mandatory re-read covers it but the reminder is buried in §4).

---

## 2. Skill Effectiveness Assessment

### Active and Well-Utilized

- **findasale-dev**: Correctly dispatched for Resend rail (S918, 22 call sites), email gates (S913), and CF Worker attempt (S888). Following the <20 line threshold gate appropriately.
- **findasale-qa**: Chrome QA by orchestrator directly (not subagent) became the norm in S900+, which is correct per §10c (dev-QA separation). This is an improvement over prior sessions where Dev was self-verifying.
- **findasale-records**: Wrap passes and PCV application at session start are running consistently. Cross-session Chrome column updates being flagged.
- **findasale-ops**: Railway OPS, Gmail OAuth recovery — heavily used during the email blitz. Appropriately dispatched for infra work.
- **findasale-deploy**: Pre-deploy checklist gate working; referenced in S918 pushblock.

### Underutilized (flag for next quarter)

- **findasale-architect**: No dispatches in S912–S919. Last known use was schema-related decisions before S910. With Shopify integration (#332, BQ P0, 128+ sessions old) still parked and the Resend transactional rail having just been built, an architecture review of the email system and the Shopify plan is overdue.
- **findasale-hacker**: No dispatches in recent sessions. Last known security audit was S218. With production live, beta users active, and Stripe Connect/payout flow operational, a periodic red team pass is overdue. Recommended cadence: quarterly. Last ran ~S218, currently S919 — 700+ sessions without a security audit.
- **findasale-legal**: No dispatches in S887–S919 range. Last noted around S687. No GDPR/ToS updates flagged. With beta users being onboarded and Stripe payouts processing, a quarterly legal check is appropriate.
- **findasale-innovation**: No dispatches in recent sessions. The WARM enrichment BQ item (3.5% success rate, BQ P1) and GSF geocoding (80.7% un-geocoded, BQ P1) are prime candidates for an innovation pass — there may be better data sources or approaches.
- **health-scout**: Was heavily used through March–May 2026 (28 health-report files generated). Appears to have been partially replaced by friction-audit for daily checks. Both serve different purposes — health-scout for code quality scanning, friction-audit for session health. Confirm both are still being used intentionally.

### Archived Skills (confirmed not invoked)

- **context-maintenance**: Archived S227. Correctly never invoked.
- **findasale-push-coordinator**: Archived S227. Correctly never invoked.

---

## 3. Doc Freshness Assessment

### Tier 1 Docs

| Doc | Status | Notes |
|-----|--------|-------|
| STATE.md | ✅ Current | Last updated S919 (today). BQ = 5. "Next Session" block present. |
| STACK.md | ✅ Accurate | Email section correctly says "Resend" post-S918. No stale Neon references. Minor gap: Google Cloud Vision API not documented. |
| SECURITY.md | UNVERIFIED | Not read this session. Bash down — could not run grep checks. |
| RECOVERY.md | UNVERIFIED | Not read this session. |
| CLAUDE.md | ✅ Accurate | Edit tool BAN confirmed. Push rules confirmed. Session type rules confirmed. |
| decisions-log.md | ⚠️ Pruning needed | Last entry S687 (2026-05-08). 30-day pruning rule means entries before ~2026-05-09 are candidates. Entries go back to S141 (months old) — pruning not enforced. |

### Living Docs

| Doc | Status | Notes |
|-----|--------|-------|
| self_healing_skills.md | ⚠️ Stale entries | 11 entries (SH-001 to SH-011, with one duplicate SH-009 numbering). Last documented incident ~S173. Missing patterns: Edit tool batch truncation (S900), Railway env var propagation delay (reference doc exists but no SH entry), outreach@finda.sale suspension cascade. |
| file-creation-schema.md | ⚠️ Gap | No soft cap defined for `audits/`. 82 files in audits/ with no cleanup trigger. Recommend adding cap of 30 files. Unauthorized directories (UX/, UX_SPECS/, improvement-memos/) still exist in claude_docs/. |
| roadmap.md | ✅ Current | Last updated S911. 0 BROKEN items in BROKEN section. Chrome column update cross-session rule being enforced. |

### Directory File Counts vs Soft Caps

| Directory | Actual Count | Soft Cap | Status |
|-----------|-------------|----------|--------|
| workflow-retrospectives/ | 5 | 5 (archive all but 3) | ⚠️ AT CAP — archive 2 oldest before today's retro adds #6 |
| health-reports/ | 28 | 5 | 🔴 OVER CAP — 23 files need archiving |
| audits/ | 82 | None defined | ⚠️ BLOAT — no soft cap. Recommend adding cap = 30 |
| architecture/ | 18+ | None defined | MONITOR |

### Unauthorized Directories Still Present

Per file-creation-schema.md, these directories are flagged as not approved but have not been consolidated:
- `claude_docs/UX/` — content should move to ux-spotchecks/ or operations/
- `claude_docs/UX_SPECS/` — content should move to architecture/ or feature-notes/
- `claude_docs/improvement-memos/` — content should move to operations/ or archive/
- `claude_docs/marketing/` — content should move to brand/ or archive/

These have been flagged in prior retrospectives. Recommend scheduling a findasale-records consolidation pass.

---

## 4. Bottleneck Analysis

### Bottleneck 1: Email Infra Single Points of Failure (CRITICAL)

Severity: 7+ sessions of non-product-dev OPS work.
Root cause: outreach@finda.sale = sole cold-outreach sender; Gmail OAuth = sole transactional sender (now fixed with Resend). No monitoring of OUTREACH_ENABLED status.
Fix: Resend rail (S918) closes transactional gap. Outreach@finda.sale reactivation still pending. Add OUTREACH_ENABLED to daily friction audit health check.

### Bottleneck 2: Sequential Chrome QA Throughput

Severity: QA ceiling recovery takes 5–10 sessions for an 8-item queue.
Root cause: Chrome QA is strictly sequential (one feature per dispatch, by rule). With 5–17 BQ items, recovery requires 5–17 separate QA sessions.
Mitigation: Batch items by page/flow when possible — testing 3 items on the same organizer dashboard page in one Chrome session doesn't violate the "one feature per QA dispatch" rule if they share the same user path.

### Bottleneck 3: Bash Workspace Reliability

Severity: This entire session was hampered by "No space left on device."
Root cause: Cowork VM disk fills up over time. No automated cleanup or monitoring.
Impact: TypeScript health checks, git diff checks, and any bash-dependent audit steps were UNVERIFIED.
Recommendation: Patrick should investigate whether the Cowork VM has a disk cleanup option. As a workaround, file tools (Read, Glob, Grep) cover most audit checks that don't require compilation.

### Bottleneck 4: decisions-log.md Pruning Neglect

30-day pruning rule is documented but not enforced. Entries going back to S141 remain. The log grows unbounded. This isn't a blocking issue but adds noise and could affect session context loading.

---

## 5. Recommended Actions (Prioritized)

### P0 — Act this session or next

1. **BQ #332 Shopify (S791 = 128+ sessions old)**: This item has been in the BQ since S791. Per CLAUDE.md §4 age-floor rule: 128 sessions = P0 minimum. This is NOT being actioned. Next DEV session must either dispatch findasale-dev to implement the Shopify integration or Patrick must explicitly park it with a documented reason. Sitting at P0 for 128+ sessions without a documented decision is a process failure.

2. **Bash workspace disk full**: P1 infrastructure finding. Patrick should investigate Cowork workspace disk usage. All audit bash checks are UNVERIFIED until resolved.

### P1 — Address within 2 sessions

3. **health-reports/ archival**: 28 files vs. soft cap of 5. Dispatch findasale-records to archive all but the 5 most recent health reports (keep: 2026-06-07.md, 2026-05-31.md, 2026-05-24.md, 2026-05-17.md, friction-audit-2026-05-18.md).

4. **workflow-retrospectives/ archival**: 5 files at cap. Archive 2 oldest (2026-03-18-autocompact-checkpoint-confusion.md, 96h-io-capture-design.md) to make room for this retro file.

5. **Add SH entries for Edit tool truncation and outreach cascade**: `self_healing_skills.md` is missing two high-recurrence patterns from recent sessions.

6. **Add OUTREACH_ENABLED to friction audit health check**: Currently not monitored. S887–S919 email blitz would have been caught in session 1 if the daily friction audit checked OUTREACH_ENABLED status.

### P2 — Address within 5 sessions

7. **Add `audits/` soft cap to file-creation-schema.md**: 82 files with no cleanup trigger. Recommend cap = 30, archive oldest on add.

8. **Schedule findasale-hacker quarterly security audit**: Last run was ~S218. 700+ sessions without a red team pass is a gap for a production payment-processing platform.

9. **decisions-log.md pruning**: Enforce the 30-day pruning rule. Dispatch findasale-records to remove entries with effective dates before 2026-05-09.

10. **Consolidate unauthorized directories** (UX/, UX_SPECS/, improvement-memos/): Dispatch findasale-records for a single cleanup pass.

### P3 — Queue for future retrospective

11. **Add QA precondition checklist to findasale-qa SKILL.md**: Verify PUBLISHED sale status, tier, and account type before testing any organizer-facing feature.

12. **findasale-architect review for Shopify + email rail**: Review the Resend architecture and document the new dual-rail email system in an ADR before future agents touch the email stack.

13. **findasale-innovation pass on WARM enrichment**: 3.5% WARM lead success rate is a BQ P1. Innovation should evaluate alternative data sources or enrichment APIs.

---

## 6. Self-Healing Skills Gap Report

Current entries: SH-001 through SH-011 (with duplicate SH-009 numbering — fix needed).
Last documented incident: ~S173.
Current session: S919. Gap: ~746 sessions of undocumented patterns.

**Missing entries to add:**

**SH-NEW-1: Cowork Edit tool silent truncation (S900)**
Pattern: Edit tool silently drops trailing file content after ~250 lines or after stacked sequential edits. 13 files corrupted in S900. Fix: use Python via bash for large files; Write tool for new files. HIGH confidence — documented CLAUDE.md §4.

**SH-NEW-2: Railway env var propagation delay**
Pattern: Env var changes in Railway dashboard take effect only after service redeploys. Running processes hold stale values. Causes false positives when verifying env var changes ("OUTREACH_ENABLED is true" while the running process still has the old value). Reference: reference_railway_env_propagation.md. HIGH confidence — caused S889 outreach leak false alarm.

**SH-NEW-3: outreach@finda.sale suspension cascade**
Pattern: If outreach@finda.sale is suspended by Google, the Gmail API rail silently fails for ALL email sending (not just outreach). OUTREACH_ENABLED=false does not gate transactional emails on the Gmail rail. Resolution: Resend transactional rail (S918) removes dependency; but outreach account must be kept in good standing via bounce suppression and send frequency limits. HIGH confidence — 7-session blitz documented S887–S919.

---

## 7. Summary Table

| Area | Status | Severity |
|------|--------|----------|
| BQ Shopify #332 (128+ sessions) | 🔴 No decision documented | P0 |
| Bash workspace disk full | 🔴 Infrastructure down | P1 |
| health-reports/ 28 files vs cap of 5 | 🔴 Over cap | P1 |
| Email rail architecture (Resend) | ✅ Fixed S918 | — |
| BQ count (5 items) | ✅ DEV mode available | — |
| STATE.md freshness | ✅ Current | — |
| STACK.md accuracy | ✅ Accurate | — |
| roadmap.md (0 BROKEN) | ✅ Clean | — |
| workflow-retrospectives/ at cap | ⚠️ Archive 2 oldest | P2 |
| self_healing_skills.md (3 missing patterns) | ⚠️ Update needed | P2 |
| audits/ (82 files, no cap) | ⚠️ Add soft cap | P2 |
| decisions-log.md pruning | ⚠️ Unenforced | P2 |
| findasale-hacker cadence | ⚠️ 700+ sessions since last audit | P2 |
| unauthorized dirs (UX/, UX_SPECS/, etc.) | ⚠️ Not consolidated | P3 |
| QA precondition checklist | ⚠️ Not in findasale-qa skill | P3 |

---

*Report generated by findasale-workflow-retrospective scheduled task (8th of month, 9:00 AM). Next run: 2026-07-08.*
