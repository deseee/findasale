# Projects-First Workflow Proposal — FindA.Sale

**Date:** 2026-03-21
**Author:** Claude (Projects session, orchestrator context)
**Status:** PROPOSAL — requires Patrick approval before implementation
**Inputs:** Claude Projects documentation research, workflow agent analysis, power-user agent analysis, 225 sessions of pain data

---

## The Problem (Stated Honestly)

FindA.Sale has 30 conversation-defaults rules, 20+ custom skills, 11 scheduled tasks, checkpoint manifests, message boards, and session logs — all built to fight context loss. Despite this infrastructure:

1. **Claude still does surface-level QA** unless Patrick personally enforces depth
2. **Governance artifacts work for 1-2 sessions** then get ignored
3. **Compression destroys behavioral commitments** regardless of how many rules exist
4. **Patrick spends more time on workflow than product work**
5. **Every proposed solution becomes more infrastructure** that suffers the same fate

The counter-infrastructure has become a tax. It consumes tokens, creates maintenance burden, and doesn't reliably deliver what it promises.

---

## What Projects Actually Changes (And What It Doesn't)

### Projects Solves:
- **Between-session amnesia**: CLAUDE.md and MEMORY.md load automatically in every conversation. No manual init needed.
- **Session handoff ceremony**: next-session-prompt.md, session-log re-reading, and "where were we?" are handled by persistent conversation history.
- **Checkpoint manifests**: The conversation itself is the persistent record. JSON state files are redundant.

### Projects Does NOT Solve:
- **Within-session compression**: Still drops behavioral rules under context pressure.
- **Subagent isolation**: Subagents still get fresh context windows. They don't inherit Projects memories.
- **Self-directed thoroughness**: Claude still simplifies broad mandates ("audit the frontend") into shallow work unless structurally prevented from doing so.

---

## Proposal: Three Changes, Not Thirty

Instead of more infrastructure, this proposal makes three structural changes that reduce governance overhead while improving actual quality.

### Change 1: Consolidate Governance Into Two Files (Not Five)

**Current state:** Governance lives in CLAUDE.md (284 lines) + CORE.md (295 lines) + conversation-defaults (482 lines) + context-maintenance skill (379 lines) + various scheduled tasks. Total: ~1,440 lines of behavioral rules across 4+ files.

**Proposed state:** Two files total.

**File A: CLAUDE.md (~350 lines)** — The single authority document. Merge CORE.md into CLAUDE.md. Eliminate duplication (push rules appear in both currently). This is what Projects loads automatically. Structure:

```
§1  Project Purpose (from current CLAUDE.md §1)
§2  Monorepo Structure (from current CLAUDE.md §2)
§3  Cross-Layer Contracts (from current CLAUDE.md §3)
§4  Execution Rules (merge CORE.md §3 + current CLAUDE.md §4)
§5  Push Rules (consolidate CORE.md §4 + current CLAUDE.md §5 — one location)
§6  Schema Change Protocol (from current CLAUDE.md §6)
§7  Subagent-First Gate (from current CLAUDE.md §12)
§8  Schema-First Gate (from current CLAUDE.md §13)
§9  MCP Awareness (from current CLAUDE.md §5)
§10 Skill Routing (from CORE.md §1 skill routing note)
```

Things that move OUT of CLAUDE.md: session init ceremony (redundant with Projects), checkpoint manifest rules (delete), message board protocol (delete), context checkpoint rules (delete).

**File B: conversation-defaults (~300 lines)** — Trimmed from 482 to ~250. Only rules that are genuinely conversation-layer behavior:

```
Rule 1:  Use AskUserQuestion for structured clarifying questions
Rule 2:  Announce file modification approach before every write
Rule 4:  dev-environment gate before shell commands
Rule 6:  Expand abbreviated language smartly (not speculatively)
Rule 9:  Token budget briefing at session start
Rule 10: Checkpoint manifest reads/writes (modernized)
Rule 11: Pre-dispatch checkpoint before 3+ agents
Rule 12: Never output placeholder values
Rule 13: Route post-diagnosis implementation to subagent
Rule 25: Post-compression — re-read CLAUDE.md §5 (push rules)
Rule 26: Subagent output aggregation manifest
Rule 28: Scheduled task findings triage at session init (strengthened)
Rule 30: Never stop between subagent returns
```

**Kept (not listed above but retained):**
Rule 5:  Never hand off git issues to Patrick (move to CLAUDE.md as operational rule)
Rule 7:  File creation path validation (move to CLAUDE.md as operational rule)
Rule 9:  Token budget briefing at session start (still valuable — cheap, high-ROI)
Rule 10: Checkpoint manifest reads/writes (modernize mechanism but keep awareness)
Rule 11: Pre-dispatch checkpoint before 3+ agents (prevents budget blowouts)
Rule 24: Proactive gate check (collapse into Rule 1 as a sub-gate)
Rule 26: Subagent output aggregation manifest (still needed — coordinates parallel returns)
Rule 28: Scheduled task findings triage at session init (keep — strengthen per friction audit fix)

**Deleted rules:** 3 (init ceremony → redundant with Projects), 8 (message board → delete). Rules 14-23 and 27 are already lost.

**Moved to CLAUDE.md (not deleted, just relocated):** 5, 7.

**Token savings:** ~500 lines removed from session load (dead rules, duplication between CORE.md and CLAUDE.md). At ~1.3 tokens/line, that's ~650 tokens saved per session.

### Change 2: Fix QA By Making It Structural, Not Aspirational

The QA depth problem won't be solved by better rules. It needs a structural change to how QA dispatches work.

**Current pattern:**
1. Patrick says "test this" or "audit the frontend"
2. Claude dispatches findasale-qa or findasale-dev with a broad mandate
3. Subagent does shallow work (page loads, no console errors = PASS)
4. Patrick catches the gaps and re-dispatches manually

**Proposed pattern — QA test matrix baked into the subagent dispatch:**

Instead of trusting the subagent to interpret "be thorough," the orchestrator (this Projects conversation) generates the specific test scenarios before dispatching. The key insight from our earlier conversation was right — specific dispatches prevent shallow work. The problem was that I suggested Patrick should write them. The fix is that this Projects conversation writes them.

When Patrick says "audit the frontend" or "QA this feature," the orchestrator:

1. Reads the feature's code to understand what roles/tiers it touches
2. Generates a concrete test scenario list (e.g., "Log in as user11, navigate to /favorites, verify items appear")
3. Dispatches each scenario as a narrow subagent task
4. Tracks results in this conversation (not in a JSON file that gets forgotten)

This works because Projects conversations persist. The test tracking doesn't need to be in a file that Claude forgets about — it's in the thread itself.

**Change to CLAUDE.md §7 (Subagent-First Gate):**
Add after the existing gate logic:

```
QA DISPATCH GATE (fires when orchestrator dispatches QA work):
Before dispatching any QA or audit task:
1. Identify which roles are affected (SHOPPER, ORGANIZER, ADMIN)
2. Identify which tiers are affected (FREE, SIMPLE, PRO, TEAMS)
3. Identify what data operations the feature performs (create, read, update, delete)
4. Generate specific test scenarios for each role × tier × operation combination
5. Batch scenarios by feature or page into focused dispatches (not one-per-scenario)
6. Do NOT dispatch a single "audit everything" task
```

**Change to findasale-qa SKILL.md:**
Add to the top of the Review Checklist:

```
## Pre-Audit: Role × Tier Matrix (MANDATORY)
Before checking any boxes below, first answer:
- Which test accounts am I using? (list specific emails)
- Which tier-gated features am I testing? (list specific features)
- What cross-role interaction am I verifying? (e.g., "shopper favorites item → organizer sees count")
If you cannot answer all three, STOP and ask the orchestrator for specifics.
```

### Change 3: Kill Infrastructure That Doesn't Earn Its Keep

**Delete entirely:**
- `.checkpoint-manifest.json` — Projects conversation history replaces this
- `MESSAGE_BOARD.json` + conversation-defaults Rule 8 — Never reliably used
- `context-maintenance` skill — Merge the essential 50 lines (STATE.md + session-log sync) into `findasale-records`
- `findasale-push-coordinator` skill — Push rules are in CLAUDE.md; a dedicated agent for "run these 3 MCP calls" adds overhead without value
- conversation-defaults Rules 14-23, 27 — Already lost, stop tracking them

**Keep as-is (after research — see rationale):**
- `findasale-advisory-board`, `findasale-steelman`, `findasale-devils-advocate`, `findasale-investor`, `findasale-competitor` — These are NOT redundant. The architecture is a deliberate three-layer system designed in Session 141's fleet redesign:
  - **Full 12-seat board** for strategic ensemble reviews (all perspectives, voting, synthesis)
  - **6 subcommittees** (Ship-Ready, Risk, Go-to-Market, Governance, Growth, Future Vision) as a middle gear — 3-4 targeted seats, faster than full board
  - **4 standalone agents** (DA, Steelman, Investor, Competitor) as lightweight quick-draw tools for everyday decisions without convening the board
  - DA and Steelman co-fire via shared preflight checklist in conversation-defaults — they're adversarial counterparts with different output formats and roles. Merging them loses the structured FOR/AGAINST dialectic.
  - Standalone agents explicitly retain their board seats — the standalone is the "quick-draw" version; the board seat is the "full ensemble" version. They serve different use cases at different scales of decision.
  - Consolidating would collapse three deliberate granularity levels into one, losing the ability to match review depth to decision weight.

**Reduce scheduled tasks:**
- `context-freshness-check` (daily) → weekly (Projects auto-loads mean daily freshness checks are less critical)

**Fix (not reduce) scheduled tasks:**
- `daily-friction-audit` — Keep Mon-Fri frequency. The problem is not that it runs too often; the problem is that findings go unactioned. Research shows the same findings (e.g., stale checkpoint manifest, missing session-log entries) recurred across 4+ consecutive audits without being addressed. Root causes:
  1. **No auto-dispatch:** Audit recommends "dispatch findasale-records to fix X" but nothing actually dispatches the agent
  2. **No gating rule:** Sessions can start and proceed without addressing HIGH-severity findings
  3. **No recurrence escalation:** A finding that appears 3 days in a row should escalate, not just repeat

  **Fix:** Add a friction-audit action loop that actions ALL findings, not just HIGH:
  - **All findings** (HIGH, MEDIUM, LOW) auto-dispatch the appropriate agent (findasale-records for doc staleness, findasale-dev for code issues) as part of the audit task itself — detect AND fix in the same run. Chasing down small bugs later costs more than fixing them when found.
  - **Only the most minor findings** (cosmetic, non-functional) may persist 1-2 days without action. Everything else gets dispatched immediately.
  - If ANY finding persists across 3+ consecutive audits, escalate to Patrick with `## Patrick Direct` block — something is blocking the fix and needs human decision.
  - Surface unresolved findings in session start as a visible warning (strengthen Rule 28: "read last friction audit, flag any unresolved findings with a plan to address")

---

### Change 4: Fix Recurring Pain Points in CLAUDE.md Files

Session history audit (S164–S225, workflow retrospective S164–S168) surfaced four recurring pain patterns that need explicit fixes in the authority files.

**Global CLAUDE.md (`.claude/CLAUDE.md`):**
- **Remove stale Session Start section:** References `context.md` loading and `node scripts/update-context.js` — these are the old pre-Projects init ceremony. Replace with: "Load STATE.md before starting work. Projects handles the rest."
- **Update CORE.md reference:** If CORE.md merges into project CLAUDE.md (Change 1), remove the global reference to CORE.md as a separate file.

**Project CLAUDE.md — additions based on pain point evidence:**
- **§5 MCP Awareness — add large file guidance:** "If a single file exceeds ~500 lines, push it solo via `create_or_update_file`. If it exceeds ~800 lines, hand off to Patrick with PS1 block. Never batch a large file with other files." (Evidence: S215 Dockerfile truncated from 43→4 lines, S223 itemController.ts 939 lines blocked MCP.)
- **§6 Schema Change Protocol — strengthen:** Add explicit note that the DATABASE_URL override MUST appear in every Patrick instruction block involving migrations. Not just documented in §6 — it must be copy-paste-ready in the actual block Patrick receives. (Evidence: S216 almost missed it.)
- **§10 Push Instruction Block — add PowerShell escaping note:** "For paths containing brackets (e.g., `[saleId].tsx`), use `-LiteralPath` in Remove-Item commands. PowerShell interprets brackets as wildcards." (Evidence: S167 merge conflict required extra round due to bracket escaping.)

**Package-level CLAUDE.md files — minimal changes:**
- All 4 package files reference `CORE.md` as behavior rules. Update to reference root `CLAUDE.md` after the merge. (1-line edit per file.)
- **Frontend CLAUDE.md — add:** "Never import from `@findasale/shared` — always causes Vercel build failure. Use local type definitions instead." (Evidence: S196–S202 seven consecutive Vercel failures.)
- **Shared CLAUDE.md — add:** "This package's exports are not reliably resolved at Vercel build time. Frontend must not depend on shared imports."

---

## What This Does NOT Propose

- **No new skills.** Zero.
- **No new scheduled tasks.** One gets reduced in frequency; one gets an action loop added.
- **No new JSON files or tracking artifacts.**
- **No new rules in conversation-defaults.** It shrinks from 30 to 13 (the ones that work).
- **No manager agent.** The orchestrator (this Projects conversation) handles decomposition.

---

## Implementation Plan

All changes are non-destructive. Nothing gets deleted from git — only from the active skill roster.

**Phase 1 — Build & Fix (~2 hours, Patrick-approved):**
- Merge CORE.md into CLAUDE.md (careful — this touches authority docs)
- Add pain point fixes to project CLAUDE.md (large file MCP guidance, PowerShell escaping, schema block mandate)
- Update global CLAUDE.md (remove stale init ceremony, update CORE.md reference)
- Update 4 package-level CLAUDE.md files (CORE.md → root CLAUDE.md reference, add @findasale/shared ban to frontend + shared)
- Trim conversation-defaults from 30 rules to 13 (remove dead/lost/redundant rules)
- Update Rule 6 wording ("expand smartly" not "treat as precise")
- Update MEMORY.md with the consolidated governance model

**Phase 2 — Friction Audit + QA Validation (~1 hour):**
- Update `daily-friction-audit` scheduled task with auto-dispatch action loop and recurrence escalation logic
- Strengthen Rule 28 (scheduled task findings triage) to surface ALL unresolved findings at session start
- Reduce `context-freshness-check` to weekly
- Run a test audit using the new QA dispatch pattern to validate it works
- Verify Phase 1 changes haven't broken subagent routing or push workflows

**Phase 3 — Cleanup (only after Phase 1-2 are QA'd):**
- Delete `.checkpoint-manifest.json` from active use
- Delete `MESSAGE_BOARD.json` + conversation-defaults Rule 8
- Merge context-maintenance essential logic into findasale-records, then archive the standalone skill
- Archive push-coordinator skill
- Remove CORE.md from active use (content now lives in CLAUDE.md)

---

## Board Review Outcome (Session 226)

Full 12-seat board reviewed this proposal. Result: **11-0-1 (Go with modifications).**
Systems Thinker abstained pending auto-dispatch failure mode definition. All other seats +1.

**Board concerns addressed:**

**1. QA dispatch token cost (QA Gatekeeper):** Dozens of individual scenario dispatches would be expensive. **Fix:** Batch test scenarios by feature or page, not one-per-scenario. A single dispatch might cover "test /favorites as shopper FREE, shopper HUNT_PASS, organizer SIMPLE, organizer PRO" — grouped by page, not atomized.

**2. Projects feature stability (Devil's Advocate):** Projects is a research preview. **Fix:** All original files (CORE.md, full conversation-defaults, checkpoint manifest) remain in git history. If Projects changes, restore them with `git checkout`. The Phase 3 cleanup only removes files from active use, not from the repo.

**3. Friction audit auto-dispatch failure mode (Systems Thinker):** What happens when auto-dispatched agents error? **Fix:** If an auto-dispatched fix fails (agent errors, file conflict, TypeScript errors), the finding is re-classified as BLOCKED with the error reason appended, and escalated to Patrick in the next session start via Rule 28. The audit does not retry automatically — one attempt per finding per audit run.

**4. Orchestrator thoroughness enforcement (Devil's Advocate):** What enforces the orchestrator generates the QA matrix? **Fix:** The QA DISPATCH GATE is written into CLAUDE.md §7 as a hard gate with the same structure as the existing Subagent-First Gate. It fires before ANY QA dispatch — the orchestrator cannot skip it because it's in the authority file that Projects auto-loads every conversation.

**5. conversation-defaults line count (Technical Architect):** 13 rules with GATE sections will land ~300-320 lines, not 250. **Acknowledged.** Updated estimate to ~300 lines.

---

## Risk Assessment

**Risk 1: Merging CORE.md into CLAUDE.md makes the authority file too long.**
Mitigation: Target ≤350 lines. Current CLAUDE.md is 284, CORE.md is 295, but ~200 lines are duplicated or obsolete. Net should be 350-380.

**Risk 2: Trimming conversation-defaults loses enforcement rigor.**
Mitigation: The 13 retained rules are the ones that actually get enforced. The deleted rules either (a) are already lost (14-23, 27), (b) are redundant with Projects features (Rule 3 init ceremony), or (c) move into CLAUDE.md (Rules 5, 7). No working rule is removed — only dead weight.

**Risk 3: The QA dispatch pattern adds orchestrator overhead.**
Mitigation: The overhead is in this persistent Projects conversation, which has effectively unlimited persistence. It doesn't compress the way a single Cowork session does because each conversation in Projects starts fresh but has access to all prior context via memory + history search.

**Risk 4: Deleting checkpoint manifests loses session-to-session token tracking.**
Mitigation: Token tracking was already unreliable (last manifest entry was S216, 9 sessions ago). Projects conversation history provides better auditability than a JSON file that gets stale.

---

## Success Criteria

This proposal succeeds if, after implementation:

1. Patrick can say "audit the frontend" and get back results that tested multiple roles and tiers without having to specify them
2. Session init takes <5 seconds of overhead (no manual file loading ceremony)
3. conversation-defaults loads in <800 tokens instead of ~1,500
4. No new governance files are created for at least 10 sessions
5. Patrick spends ≥80% of session time on product work, not workflow maintenance
