# QA Audit: Token Checkpoint & Session Init Failures

**Audit Date:** 2026-03-09 (Session 118)
**Trigger:** Mid-session turn counter reset — "[CHECKPOINT — Turn 9]" → "[CHECKPOINT — Turn 1 (resumed)]". Session 118 started without init announcement or token budget briefing.
**Scope:** CORE.md §2–3, conversation-defaults Rules 3 & 9, token-checkpoint-guide.md

---

## Summary

7 critical failure modes identified. 4 are design gaps (enforcement enforcement missing at enforcement layer). 3 are detection gaps (no self-evident signals to Patrick when init fails). Checkpoint logging works when Claude remembers to do it, but memory loss under compression is endemic.

---

## Failure Modes (Severity Rated)

### DESIGN FLAWS (Cannot be fixed by Claude memory alone)

**F1: Session Init Not Enforced at MCP Boundary**
- **Severity:** P0
- **What fails:** conversation-defaults Rule 3 (first message = session start) and CORE.md §2 (load context) are *instructions to Claude*, not enforced at the tool/MCP layer. If Claude forgets to load context on message 1, there is no checkpoint, no error, no rollback. Patrick sees normal conversation flow.
- **Why it happens:** Rules are in behavior docs, not in session initialization code. Cowork MCP can inject context at session start, but does not enforce Rule 3 verification.
- **Impact:** Session 118 started without budget briefing. Turn counter in checkpoints is meaningless (reset mid-session per compression). "Turn 1 (resumed)" suggests UUID-based turn tracking should exist but doesn't.
- **Root cause:** No automated session init validation. Claude's memory of "have I done init yet?" is compressed away.

**F2: Checkpoint Logging Lost on Auto-Compression**
- **Severity:** P0
- **What fails:** Token checkpoints are logged in conversation text (e.g., "[CHECKPOINT — Turn 9]"), not in a persistent structure. When context window auto-compresses, earlier checkpoints are deleted. Subsequent resumed session shows "[CHECKPOINT — Turn 1 (resumed)]" with no history of Turn 2–9.
- **Why it happens:** Checkpoints live in conversation history. Compression deletes non-essential history. No external checkpoint store (file, MESSAGE_BOARD.json, session metadata) exists.
- **Impact:** Loss of token burn history. Cannot predict when to wrap. Patrick cannot audit token usage across a compressed session.
- **Root cause:** Checkpoint guidance (token-checkpoint-guide.md) describes *logging format*, not *persistence*. No file-backed checkpoint archive is maintained.

**F3: Turn Counter Is Non-Persistent**
- **Severity:** P0
- **What fails:** CORE.md §3 logs checkpoints as "[CHECKPOINT — Turn N]" using conversation turn count. On auto-compression or session resume, turn counter resets to 1. No UUID, session ID, or monotonic counter persists across compression.
- **Why it happens:** Turn count is implicit in conversation order, not explicit in Claude state or session metadata.
- **Impact:** Resumed sessions cannot be correlated with pre-compression work. Token spend cannot be aggregated. Subagent dispatch tracking (Rule 9 in CORE.md: "3 agents max per batch") cannot be verified after compression.
- **Root cause:** No session-scoped checkpoint ID (e.g., `checkpoint_118_a`, `checkpoint_118_b`) exists.

**F4: Token Budget Briefing Not Validated**
- **Severity:** P1
- **What fails:** conversation-defaults Rule 9 requires token budget briefing at every session init. Session 118 did not include it. No automated check verifies the briefing was announced; no signature proof (like a logging entry in MESSAGE_BOARD.json) confirms it occurred.
- **Why it happens:** Briefing is a *conversational announcement*, not a logged event. If Claude skips it, Patrick has no way to notice until session is underway and he notices missing budget context.
- **Impact:** Patrick starts session blind to token spend thresholds. Cannot plan wrap timing. In Session 118, no warning was triggered when threshold was reached.
- **Root cause:** No audit trail. Briefing lives only in conversation text, which can be compressed or skipped without trace.

---

## ENFORCEMENT GAPS (Claude can be reminded but structure is weak)

**E1: Checkpoint Logging Skipped When Context Is High**
- **Severity:** P1
- **What fails:** token-checkpoint-guide.md (§"When to Log") lists triggers: file read batch, subagent dispatch, Turn 5, wrap, "when burn rate feels high." Last trigger is subjective. When context budget is ample (e.g., 150k tokens used of 200k available), Claude often skips checkpointing, reasoning "not urgent yet."
- **Why it happens:** No external signal reminds Claude "this is Turn 7, log a checkpoint." Guideline says "log at Turn 5" but Claude must remember to count turns and self-trigger.
- **Impact:** Gap in token history. If compression occurs at Turn 8 and no checkpoint was logged at Turn 5–7, token spend from those turns is invisible.
- **Root cause:** Checkpointing relies entirely on Claude's real-time awareness, which is fragile across long sessions.

**E2: Subagent Capacity Not Verified Post-Dispatch**
- **Severity:** P1
- **What fails:** CORE.md §4 and token-checkpoint-guide.md (§"Subagent Capacity Rule") limit 4 agents per parallel batch and 2 agents if budget <100k. After dispatching agents via `Skill` tool, Claude must verify that the number dispatched matches the rule. There is no automated enforcement; Claude must manually cross-check.
- **Why it happens:** Limits are documented guidance, not constraints in the Skill dispatcher. Claude can call `Skill` with 5 agents and the tool will accept it.
- **Impact:** Budget overruns. Sessions dispatch more agents than tokens permit, accelerating compression.
- **Root cause:** No pre-dispatch validation hook or post-dispatch audit.

**E3: MCP GitHub Push Limits Not Enforced**
- **Severity:** P1
- **What fails:** CORE.md §4 caps MCP GitHub pushes at 3 files per `push_files` call and 25k tokens total. If Claude pushes 4 files or 30k tokens of content, MCP will succeed but violates the rule. No automated check catches this.
- **Why it happens:** Limits exist in CORE.md as "hard rules" but MCP tools have no awareness of CORE.md. Enforcement is manual: Claude must count files and estimate token cost before calling `push_files`.
- **Impact:** MCP pushes consume tokens beyond budget. Cumulative token waste over session. Potential for MCP to reject oversized payloads mid-push.
- **Root cause:** CORE.md rule does not map to MCP schema constraints.

---

## DETECTION GAPS (No Self-Evident Signals)

**D1: Session Init Failure Is Invisible to Patrick**
- **Severity:** P0
- **What fails:** If Claude skips session init (Rule 3: load context, announce budget, start priority task), Patrick sees a normal conversation response. No error, no warning, no diff in behavior that would alert him init was missed.
- **Why it happens:** Session init is a procedural step, not a returned value or state change. Claude's success or failure is not signaled back.
- **Impact:** Patrick assumes session is initialized properly. Actual state: no token budget announced, no next-session-prompt loaded, no STATE.md sync check done. Work proceeds on stale context.
- **Root cause:** No return value or visible artifact confirms init occurred.

**D2: Turn Counter Reset Not Signaled**
- **Severity:** P1
- **What fails:** When compression resets turn counter, the resumed session shows "[CHECKPOINT — Turn 1 (resumed)]" but provides no machine-readable signal (e.g., `compression_event: true`, `prior_session_id: 117`, `checkpoint_sequence_broken: yes`). Patrick must manually notice the "(resumed)" label and infer a compression occurred.
- **Why it happens:** Checkpoint format is plain text. No structured metadata (JSON, YAML) accompanies it.
- **Impact:** Checkpoint sequence appears contiguous in the checkpoint log file. Patrick cannot programmatically detect that Turn 7→9 were compressed out.
- **Root cause:** Checkpoint format spec (token-checkpoint-guide.md) is human-readable only, not machine-parseable.

**D3: Budget Threshold Breach Not Escalated**
- **Severity:** P1
- **What fails:** CORE.md §3 specifies warn at 170k used (85%) and hard stop at 190k (95%). These are announced as guidelines but not tied to any alert mechanism. If Claude reaches 170k, the expected behavior is "pause and plan wrap." But there is no automated reminder at 170k. Claude must self-track.
- **Why it happens:** Token count is not returned by MCP tools in a standardized field (each tool reports differently or not at all). Claude must estimate tokens burned and cross-reference against checkpoint history.
- **Impact:** Session 118 likely crossed 170k without a pause-and-plan announcement. Work continued into compression zone.
- **Root cause:** Token tracking is manual (Claude estimation), not automatic (MCP instrumentation).

---

## Summary Table

| Mode | Severity | Type | Fixable by Claude alone? |
|------|----------|------|--------------------------|
| F1: Session Init not enforced at MCP boundary | P0 | Design | No |
| F2: Checkpoint logging lost on compression | P0 | Design | No |
| F3: Turn counter non-persistent | P0 | Design | No |
| F4: Token budget briefing not validated | P1 | Design | No |
| E1: Checkpoint skipped when context high | P1 | Enforcement | Partial (reminder helps) |
| E2: Subagent capacity not verified | P1 | Enforcement | Partial (checklist helps) |
| E3: MCP push limits not enforced | P1 | Enforcement | Partial (pre-call review helps) |
| D1: Session init failure invisible to Patrick | P0 | Detection | No |
| D2: Turn counter reset not signaled | P1 | Detection | Partial (structured output helps) |
| D3: Budget threshold breach not escalated | P1 | Detection | Partial (automated reminder helps) |

---

## QA Checklist for Session Start

To catch init failures before work begins:

```
[ ] Session number announced (e.g., "Session 118")
[ ] Token budget briefing stated (200k window, 5k overhead, 195k available, 170k warn, 190k stop)
[ ] CORE.md and STATE.md context loaded (announce: "STATE.md last updated X, next-session-prompt loaded")
[ ] GitHub sync verified (compare local vs remote STATE.md Last Updated timestamps)
[ ] Active MCP tools listed (e.g., "GitHub MCP active. Stripe inactive. Vercel inactive.")
[ ] Next-session-prompt queue read (announce: "Priority queue: [P1], [P2], [P3]")
[ ] First priority task begun (or P1 blocked → P2 started)
[ ] No closing question (Rule 3 violation: never end init with "What next?")
```

**How to make failures self-evident:**
1. Require Patrick to explicitly confirm: "Session init confirmed?" in a visual (AskUserQuestion or banner).
2. Post init checklist to MESSAGE_BOARD.json on completion (Rule 8 protocol).
3. Log init completion as a structured event in session-log.md (not just prose).

---

## Recommended Mitigations (For Future Work)

**P0 Priority (Design):**
- Externalize checkpoint log to `claude_docs/operations/context-audit/checkpoint-archive-SESSION_N.json` (structured, persistent).
- Create persistent session manifest at session start: `session_id`, `start_time`, `init_checksum` (all required fields). Mismatch signals re-init needed.
- Require MCP tools to return structured token metadata (or add estimated overhead to each function signature).

**P1 Priority (Enforcement & Detection):**
- Add "Turn counter validation" step to checkpoint format: include hash of prior checkpoint UUID to ensure sequence integrity.
- Modify conversation-defaults Rule 3 to require MESSAGE_BOARD.json post on init completion (Rule 8 already exists; enforce it).
- Add automated budget warning at 85% via scheduled task (fire at 170k tokens burned; if not yet warned, post to MESSAGE_BOARD).

---

**Status:** QA findings complete. Ready for operations review.
