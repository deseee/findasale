# Monthly Workflow Retrospective — May 2026
**Date:** 2026-05-08 | **Conducted by:** findasale-records (scheduled task) | **Sessions covered:** S667–S687 (April 8 – May 8, 2026)

---

## 1. Session Summary Analysis

### Volume

Approximately 21 sessions over 30 days. Sessions averaged 2–3 per workday with notable sprint clusters:

- **S667–S671 (April 8–10):** Heavy parallel dev + OAuth crisis — 5 sessions in 3 days
- **S673–S675 (April ~12–14):** OAuth diagnosis loop (2 sessions consumed entirely by one auth problem)
- **S676–S680 (April 15–22):** AI discoverability + MCP Server + WCAG sprint
- **S681–S685 (April 22 – May 2):** WCAG QA + full QA Sprint (S685 active)
- **S686–S687 (May 2–8):** Directory rebuild with 6 parallel agents

### Recent Session Patterns (5 most recent: S683–S687)

| Session | Work Type | Chrome QA | Notable |
|---------|-----------|-----------|---------|
| S687 | Directory rebuild — 3 new scrapers + corroboration schema | NOT RUN | 6 parallel agents |
| S686 | Directory rebuild specs + competitor legal research | NOT RUN | Research/planning |
| S685 | #393 Chrome QA Sprint: Holds, Settlement, Purchase Confirmation | ✅ ACTIVE | 3 features verified |
| S684 | WCAG error ARIA sprint + #310 Discount Rules fix | NOT RUN (dev) | 14 components fixed |
| S683 | WCAG #391 full codebase sweep + iCal QA | PARTIAL (iCal ✅) | 33 files, 50+ elements |

### Work-type breakdown (past 30 days)

- **Auth crisis:** S671–S674 (~4 sessions) consumed entirely by OAuth regression chain — redirect_uri_mismatch → bad revert → login bounce → 4-bug cleanup
- **WCAG/Accessibility sprint:** S680–S684 (~5 sessions) — systematic, well-structured, meaningful coverage gained
- **Feature dev:** S667 (16-item sweep), S676 (MCP Server), S677 (VoiceDescription), S687 (scrapers)
- **Auditing/planning:** S668, S669 (7-lens audit), S686 (research)
- **Pure QA:** S681, S685 (~2 sessions)

---

## 2. Recurring Patterns

### Pattern A: Auth regression chain (HIGH cost — 4 sessions)

S667 moved NextAuth from `/api/auth/` to `/api/oauth/` without verifying all downstream effects. This triggered a chain: S671 diagnosed redirect_uri_mismatch, a bad general-purpose agent then recommended reverting the move (wrong call) and broke `/api/auth/refresh` + `/api/auth/me` in production. S672 diagnosed the revert failure. S673 implemented Path C (beforeFiles rewrites). S674 fixed 4 remaining live bugs. Total: 4 sessions (est. 120–180k tokens) for one feature move that went wrong.

**Root cause:** No pre-dispatch verification step for auth-touching changes. The agent was dispatched to "fix routing" without a step that said "grep all routes that could conflict with the NextAuth catch-all pattern before moving the handler file."

**New self-healing candidate (SH-020):** Auth-touching changes must include a pre-move grep for all routes that match the new handler's catch-all pattern. See §6.

### Pattern B: Schema corruption by dev agents (recurring)

S675 found `schema.prisma` truncated mid-file — a dev agent's edit had corrupted the file at line 4549 (`OutreachAuditLog` model). This was caught and repaired using a Python merge script, but required a full session detour. Similar pattern occurred in S682 (WCAG agent corrupted ~86 files with 5 distinct corruption patterns including arrow function splits, self-closing tag splits, duplicate aria-labels, file truncations, and null bytes). S682 was consumed entirely by repair.

**Pattern confirmed:** Large-batch automated edits that touch 20+ files simultaneously produce corruption. SH-003 (functions dropped from itemController) is the predecessor pattern. Both S682 and S675 reinforce this.

**New self-healing candidate (SH-021):** Bulk-edit agents touching >20 files must be split into batches of ≤10 with a TS check between batches. Never dispatch "apply X to all files" without a bounded scope. See §6.

### Pattern C: Schema/DB missing from production (recurring P0)

S668: `Item.moderationStatus` column missing from production DB → auctionAutoCloseCron crashing every 5 minutes.
S669: `Organizer.stripeOnboarded` column missing from production DB → crashing every login.
Both were caught by checking Railway logs, not proactively.

**Root cause:** Prisma migrations that were created but never deployed (or deployed to localhost only). The env var pattern in CLAUDE.md §6 addresses this, but agents aren't always checking whether a migration was deployed before marking a feature complete.

**Existing rule covers this (CLAUDE.md §6)** but is being violated or missed post-compression. Recommend adding to self_healing_skills.md as SH-022 for explicit pattern recognition.

### Pattern D: QA backlog growth vs clearance

S685 cleared 3 features (Holds, Settlement, Purchase Confirmation) with full Chrome evidence. But S682–S684, S686–S687 all shipped dev work with 0 QA coverage. The Blocked/Unverified Queue has 11 items, several dating back to S647 (late April) and S664. No QA sessions are blocking dev sessions.

April retro noted: "Dev sessions: ~20 in past month. QA sessions: 3. Ratio: 7:1." May ratio appears similar: 17 dev/planning sessions, 2 QA sessions.

**The April retro P0 recommendation (QA ceiling rule) was not added to CLAUDE.md §4.** This is the third month it has been recommended and not implemented.

### Pattern E: Google OAuth still broken at wrap (S687)

Google OAuth was last confirmed working before S655 (~April 1). After 30+ days and multiple dedicated sessions (S671, S672, S673, S674), it remains broken per patrick-dashboard.md. Email/password login works correctly. OAuth fix has been carried forward to Next Session every session since S671 without resolution.

The "root cause unclear" note in patrick-dashboard.md is concerning — this is a 30+ day open P0 with multiple failed fixes.

---

## 3. Subagent Usage Analysis

### Active (used in past 30 days)

| Agent | Sessions Used | Role |
|-------|--------------|------|
| findasale-dev | S667, S676, S677, S680–S684, S687 | Dominant — every feature/fix session |
| findasale-qa | S681, S685 | Browser testing; well-scoped, good evidence |
| findasale-competitor | S687 | Legal research on scraper targets |
| findasale-records | Scheduled tasks (this task) | Doc maintenance |
| health-scout | S683 (#390 findings) | Unbounded query audit |

### Dormant (not used in past 30 days)

| Agent | Status | Flag |
|-------|--------|------|
| findasale-hacker | ❌ Unused | Auth has been rebuilt 4+ times this month. Never security-tested. |
| findasale-sales-ops | ❌ Unused | Outreach pipeline still "coming soon" (schema ready, no service built) |
| findasale-marketing | ❌ Unused | No content, no social, no beta-user recruitment |
| findasale-legal | ❌ Unused | 3 new scrapers shipped without legal review (though competitor agent cleared Sale Seeker) |
| findasale-advisory-board | ❌ Unused | No strategic review in 30 days |
| findasale-investor | ❌ Unused | Last used S416 (April 8) |
| findasale-gamedesign | ❌ Unused | Guild system dormant |
| findasale-polish | ❌ Unused | WCAG sprint shipped without polish pass |
| findasale-architect | ❌ Unused | New scrapers + corroboration schema added without architect review |
| findasale-ux | One mention S677 | UX audit of audio notes — brief |
| findasale-devils-advocate/steelman | ❌ Unused | No strategic decisions challenged |
| findasale-workflow | ❌ Unused | Ironically unused given auth regression cost |
| cowork-power-user | ❌ Unused | |
| findasale-innovation | S686 | Competitor research framing only |
| findasale-customer-champion | ❌ Unused | |
| findasale-deploy | ❌ Unused (should be used pre-deploy) | Scrapers deployed to Railway without deploy checklist |

**The fleet remains running as a dev-QA machine with occasional research dispatches.** The pattern from April is unchanged in May. Three new scrapers shipped and were deployed without findasale-legal review, findasale-architect review, or findasale-deploy checklist.

---

## 4. Skill Effectiveness Assessment

### Working well

- **findasale-dev** — parallel batch dispatch (6 agents in S687) is effective. Quality output, respects dispatch prompts, TS checks enforced.
- **findasale-qa** — when dispatched one feature at a time with a specific user/flow, produces real Chrome evidence with screenshot IDs. S685 is the model session.
- **health-scout** — S683 unbounded query audit found 8 real vulnerabilities. High signal-to-noise ratio.
- **findasale-competitor** — S687 research on EstateSales.org/EstatePros legal status was fast and decisive.

### Needs attention

**findasale-deploy** — Should be invoked before every Railway/Vercel production deploy. Not being used. The scraper deployment in S687 went directly to Railway without a pre-deploy checklist. CLAUDE.md §3 ("Before any production deploy, load the findasale-deploy skill") is the rule, but it's being skipped.

**findasale-architect** — The corroboration schema (14 new fields, 3 indexes) and merge algorithm added in S687 are exactly the cross-layer contract changes the Architect skill is designed to review. Not dispatched. No ADR created.

**findasale-legal** — Sale Seeker scraper was cleared via competitor agent (quick "no ToS found" check), but OSM/Indiana scrapers were shipped without any legal review of data collection practices, storage of personal/business data, or state licensing board scraping policies.

**The `context-maintenance` and `findasale-push-coordinator` skills are marked ARCHIVED** in their descriptions. They appear in the skills directory but should not be invoked. No session in the past 30 days accidentally invoked them — good.

---

## 5. Doc Freshness Audit

### CLAUDE.md ✅ (v5.0, current)
The merge of CORE.md into CLAUDE.md in S226 was thorough. No deprecated sections visible. The QA ceiling rule (add to §4) and auth pre-dispatch verification step (add to §7) are still missing — both recommended by April retro, neither implemented.

### STACK.md ✅
Current. Railway PostgreSQL noted. MCP Server package now exists (packages/mcp-server) — STACK.md does not mention it. Minor gap, not blocking.

### DECISIONS.md / decisions-log.md ✅
Most recent entry: 2026-05-02 (S626). No entries from S627–S687 visible — this is appropriate if no new product-direction decisions were made, but the 6 parallel-dispatch S687 session included locked decisions (e.g., EstateSales.org PROHIBITED, EstatePros PROHIBITED). These are data-source decisions that should be in decisions-log.md for permanence. Currently only in STATE.md — will be lost on rotation.

**Recommendation:** Add a `2026-05-08 (S687) — Scraper source decisions` entry to decisions-log.md.

### CORE.md ⚠️ — STILL PRESENT, STILL NEEDS ACTION
CORE.md (283 lines) was the predecessor to the merged CLAUDE.md v5.0. April retro flagged it for archiving. It is still in the root. Has not been updated since S226 (March 2026). Should be moved to `claude_docs/archive/`.

### session-log.md ⚠️ — DEPRECATED, STALE
Last updated: S251 (March 23, 2026). Content now lives in STATE.md "## Recent Sessions". The file is 173 lines of stale content. April retro flagged for archiving. Still present, still not archived.

### next-session-prompt.md ⚠️ — DEPRECATED, STALE
Last updated: S251 (March 23, 2026). Contains old Neon DB test account passwords (`password123`) that are now wrong (seed password changed to `Seedy2025!` in S576). Active misinformation. Should be archived immediately.

### next-session-brief.md ⚠️ — UNKNOWN PROVENANCE
41 lines. Not in locked folder map. April retro flagged for investigation. Still in root.

### Root directory violations — STILL PRESENT (13 violating files + 3 new)
All 11 files flagged in April retro are still in the root. Three new additions since April:

**Existing (from April retro, still not moved):**
ARCHITECT_ASSESSMENT_FEEDBACK_SCHEMA.md, ARCHITECT_PATRICK_SUMMARY.md, FEEDBACK_DEV_QUICKSTART.md, FEEDBACK_SURVEY_MAPPING.md, FEEDBACK_SYSTEM_HANDOFF.md, FEEDBACK_SYSTEM_SPEC.md, PRICING_PAGE_UX_SPEC_S392.md, UX_MODERNIZATION_SPEC.md, legal-hold-to-pay-risk-review.md, human-QA-walkthrough-findings.md, S248-walkthrough-findings.md, patrick-walkthrough-S248.md

**New since April retro:**
- `innovation-shopper-engagement-ideas.md` → should be in `strategy/` or `feature-specs/`
- `monthly-digest-2026-04.md` + `monthly-digest-2026-04-archive.md` → should be in `logs/` or `archive/`
- `payment-testing-content-package.md`, `pre-sale-payment-testing-guide.md` → `operations/` or `beta-launch/`
- `pricing-data-sources-research.md` → `research/`
- `ux-shopper-engagement-ecosystem.md` → `ux-audits/`
- `escalation-log.md` → `logs/`

**Unauthorized directories — STILL PRESENT (from April retro):**
`UX/`, `UX_SPECS/`, `improvement-memos/` remain. No cleanup has occurred.

### patrick-dashboard.md ✅
Current through S687. Accurate.

### self-healing/self_healing_skills.md ✅
Updated through SH-019 (confirmed added from April retro recommendations SH-017, SH-018, SH-019). No new entries since April. Two new patterns from this month need to be added (SH-020, SH-021) — see §6.

---

## 6. Self-Healing Recommendations

### SH-020: Auth handler relocation breaks backend route catch-all

**Trigger:** After moving a NextAuth handler file (e.g., `/api/auth/[...nextauth].ts` or `/api/oauth/[...nextauth].ts`), backend routes that share the same path prefix return 400 or are intercepted by the catch-all.

**Pattern confirmed:** S667 moved NextAuth to `/api/oauth/`. S671 a general-purpose agent moved it back to `/api/auth/` — which intercepted `/api/auth/refresh`, `/api/auth/me`, and `/api/auth/logout` (all backend Railway routes), breaking every login. Cascaded into S671→S672→S673→S674 repair chain.

**Fix (pre-dispatch gate):**
1. Before ANY NextAuth handler relocation, run: `grep -r "'/auth/" packages/backend/src/routes/ | head -30` to list all backend auth routes.
2. Compare the NextAuth catch-all path against all backend routes that share the prefix.
3. If any backend route matches the catch-all prefix: use `beforeFiles` rewrites in `next.config.js` (not a handler move) to protect those routes.
4. Test with: `curl -I https://finda.sale/api/auth/refresh` — must return 200/401 (backend), NOT a NextAuth JSON response.

**Cost if missed:** S671–S674 = ~4 sessions (est. 150k tokens, 2+ days).

**Confidence:** HIGH — catch-all pattern is deterministic; any handler at `/api/auth/[...nextauth].ts` will intercept ALL `/api/auth/*` requests before backend routes.

---

### SH-021: Bulk-edit agent corrupts files when scope > 20 files

**Trigger:** After a bulk-edit agent pass, Vercel or Railway fails to build. TypeScript errors appear in files that weren't the primary targets. Files have null bytes, truncated content, or syntactically broken constructs (e.g., `=>` split, `/>` split, duplicate attributes).

**Pattern confirmed:** S682 — WCAG bulk-label agent modified ~86 files in one pass, introducing 5 distinct corruption patterns (arrow function splits, self-closing tag splits, duplicate aria-labels, file truncations, null bytes). Entire S682 session consumed by repair.

**Fix:**
1. Never dispatch "apply X to all files in the codebase" without a file count estimate first.
2. If file count > 20: split into batches of ≤10 files per agent call, with `npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS"` between each batch.
3. After any large-batch edit: run `git diff --stat HEAD` to review change scope before pushing.
4. If null bytes found: `python3 -c "content = open(f).read(); open(f, 'w').write(content.replace(chr(0), ''))"` strips them.
5. For corrupted arrow functions (`= >` split): regex fix `re.sub(r'= >(?!\s)', '=>', content)`.

**Cost if missed:** S682 = one full recovery session (~50k tokens).

**Confidence:** HIGH — bulk-edit token budget issues are deterministic for large file counts.

---

### SH-022: Schema field missing from production DB (silent P0)

**Trigger:** Railway logs show `column "X" does not exist` on a specific endpoint. That endpoint crashes for all users. The schema.prisma has the field; the migration was created but never deployed to Railway.

**Pattern confirmed:** S668 (`Item.moderationStatus`), S669 (`Organizer.stripeOnboarded`). Both were schema fields added in migration files that were never deployed with `prisma migrate deploy` before the code went live.

**Fix (mandatory post-feature check):**
1. After any feature that adds a new schema field: grep STATE.md for the migration name.
2. Verify Railway deployment followed this sequence: (a) `prisma migrate deploy` with Railway DB URL, (b) `git push` with new code.
3. If a field is missing in production: the sequence ran out of order (code deployed before migration).
4. Repair: Run `prisma migrate deploy` with Railway DATABASE_URL from CLAUDE.md. Restart Railway service.

**Confidence:** HIGH — two confirmed instances in one month. The fix is always `prisma migrate deploy` on the Railway DB.

---

## 7. Bottleneck Analysis

### Bottleneck 1: OAuth P0 carrying forward 4+ weeks

Google OAuth broken since ~S655 (April 1). Four sessions (S671–S674) spent on it with partial repairs. Still marked "root cause unclear" in patrick-dashboard.md. Every session the issue carries forward adds ~2k STATE.md tokens and erodes context quality. This is the single most expensive open issue on the board.

**Recommendation:** Dedicate one focused session to OAuth root-cause diagnosis only — read git log between S655 and S667, identify the exact commit that broke OAuth, and fix that specific commit's change rather than layering new architecture on top of broken state.

### Bottleneck 2: Doc hygiene debt compounds monthly

April retro listed 11 root violations and 3 unauthorized directories. May retro lists 16+ root violations and the same 3 unauthorized directories. The recommendations aren't being actioned between retrospectives. This is now a compound problem — each session that creates a new file in root adds ~1 more violation to a backlog that requires manual moves.

**Recommendation:** One root-of-problem fix: add a pre-wrap file placement check to the session wrap protocol in CLAUDE.md §12. If a new file was created during the session, require findasale-records to verify its path against `file-creation-schema.md` before the push block is written.

### Bottleneck 3: Auth regression risk is structurally unmitigated

Auth has been modified in S667 (NextAuth move), S668 (login loop fix), S669 (stripeOnboarded P0), S670 (SameSite cookie fix), S671–S674 (OAuth chain). findasale-hacker has not run a security scan in this entire period. Given that every login attempt goes through this code, the risk of an undetected regression or vulnerability is high.

**Recommendation:** Dispatch findasale-hacker for a focused auth-only review (authController.ts, AuthContext.tsx, api.ts interceptor, csrf.ts, _app.tsx OAuthBridge). Not the whole codebase — just the 6 files that changed in the auth chain.

### Bottleneck 4: Lead scoring service 3 sessions overdue

S687 STATE.md "Next Session Priority 2" says: "Schema fields are live. Build `leadScoringService.ts`." This item has been in Next Session for multiple sessions without dispatch. The entire outreach pipeline (#374) is gated on it. findasale-sales-ops has never been dispatched despite being flagged as critical in every monthly retro since March.

### Bottleneck 5: QA ceiling rule still not in CLAUDE.md

April retro: "Recommendation: QA ceiling rule — if >8 items are in 'PENDING Chrome QA' status, the next session must be a dedicated QA session." May retro: the Blocked/Unverified Queue has 11 items. Still no ceiling rule in CLAUDE.md. The rule was recommended in March, April, and now May. Three consecutive retros without action.

---

## 8. Recommended Actions (Prioritized by Impact)

| Priority | Action | Who | Urgency |
|----------|--------|-----|---------|
| P0 | Diagnose Google OAuth root cause (git bisect S655→S667) | Main session | Next session |
| P0 | Add SH-020, SH-021, SH-022 to self_healing_skills.md | findasale-records | Immediate (this session) |
| P1 | Archive CORE.md, session-log.md, next-session-prompt.md | findasale-records | This session |
| P1 | Add scraper source decisions to decisions-log.md (S687 EstateSales.org/EstatePros PROHIBITED) | findasale-records | This session |
| P1 | Add QA ceiling rule to CLAUDE.md §4 (3rd recommendation — must happen) | findasale-records | This session |
| P1 | Dispatch findasale-hacker: auth-only security review (6 files) | findasale-hacker | Next session |
| P1 | Dispatch findasale-dev: build leadScoringService.ts | findasale-dev | Next session |
| P2 | Clean-sweep claude_docs root: 16+ violating files to correct directories | findasale-records | This session |
| P2 | Add file placement verification step to CLAUDE.md §12 wrap protocol | findasale-records | This session |
| P2 | Add auth pre-dispatch grep step to CLAUDE.md §7 dev dispatch template | findasale-records | This session |
| P3 | Add MCP Server to STACK.md | findasale-records | Next session |
| P3 | Remove unauthorized directories: improvement-memos/, UX/, UX_SPECS/ | findasale-records | Cleanup pass |

---

## 9. April Retro Action Follow-Through

Comparing April recommendations against May state:

| April P0/P1 Action | Status |
|-------------------|--------|
| Dedicated QA session (clear S412–S416) | ✅ Done — S681, S685 cleared the bulk |
| Dispatch findasale-sales-ops outreach pipeline | ❌ NOT DONE — schema built but no service, no dispatch |
| Add SH-017/018/019 to self_healing_skills.md | ✅ Done — present in file |
| Clean-sweep claude_docs root (11 violations) | ❌ NOT DONE — 16+ violations now |
| Archive deprecated files (session-log, next-session-prompt) | ❌ NOT DONE — still present, stale |
| Add QA ceiling rule to CLAUDE.md §4 | ❌ NOT DONE (3rd month) |
| Add wiring checklist to CLAUDE.md §7 (P2) | ❌ NOT DONE |
| Dispatch findasale-hacker (P2) | ❌ NOT DONE — auth rebuilt 4x since then |
| Archive CORE.md | ❌ NOT DONE |

**4 of 9 April P0/P1 recommendations were completed. 5 carried forward to May.** The 5 unactioned items are all doc/process hygiene tasks. They cluster around the same root cause: Records tasks don't get dispatched mid-session; they require a dedicated doc-maintenance session that hasn't been scheduled.

---

## 10. Positive Signals

- **WCAG sprint was disciplined.** S680–S684 produced systematic accessibility coverage: 33 files, 50+ elements, clear TS checks between batches. The error ARIA work in S684 completed the sprint cleanly.
- **S685 QA session was high quality.** Holds, Settlement, and Purchase Confirmation all verified with real Chrome interactions, screenshot evidence, and per-step outcome tracking. This is the QA standard working as designed.
- **Directory rebuild (S687) was efficient.** 6 parallel agents, comprehensive schema + 3 scrapers, all shipped green. Corroboration scoring architecture is well-structured.
- **Self-healing skills were acted on from April.** SH-017/018/019 were added correctly. The pattern of "identify in retro, add next session" is working for the SH document.
- **Competitor legal research was decisive.** S687's competitor research on EstateSales.org explicitly found and respected the anti-scraping clause rather than proceeding. Good judgment.
- **MCP Server live.** mcp.finda.sale is confirmed healthy with 7 tools. This is a meaningful distribution/discoverability milestone.

---

*Retrospective generated by findasale-records scheduled task. Next retrospective: 2026-06-08.*
