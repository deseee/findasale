# 96-Hour I/O Capture & Context Loss Analysis
**Findasale-Workflow Audit** | 2026-03-13 | Session 158

---

## Executive Summary

Patrick's sessions compress across 6–8 hour windows. Between sessions, context resets completely. The current system (STATE.md + session-log.md + next-session-prompt.md) **captures decisions post-hoc** but misses **real-time context drift, subagent dispatch losses, and work-in-progress abandonment**. A rolling 96-hour I/O capture file would expose:

1. **Subagent dispatch → result gap:** Skill dispatched, result never recorded in STATE.md
2. **Mid-session compression:** Claude hits token limit, resumes in continuation, doesn't sync state
3. **Orphaned work:** Code pushed to GitHub but not logged in session-log.md
4. **Lost decision rationale:** Decision recorded, but the problem it solved is missing
5. **File drift:** File changed, but STATE.md still references old version
6. **Async result loss:** Scheduled task runs (friction audit, migration deploy check) but result never makes it to next session start

---

## What Context Is Currently Being Lost?

### Pattern 1: Subagent Dispatch Without Result Capture
**Evidence:** Session 155 (2026-03-12)
- Dispatched findasale-innovation to research 10 creative lenses
- Retrieved results in innovation-round3-2026-03-13.md
- **BUT:** No entry in STATE.md documenting which lenses were evaluated or why 5 were promoted to Phase 4
- Next session (156, today) would have no trace of the research inputs

**Impact:** If a promoted idea (#29, #30, #31, #32) needs rollback or clarification, we lose the research context that justified it.

### Pattern 2: Compression Boundary Artifacts
**Evidence:** Session 153 (2026-03-12) → Session 154 (same day)
- Session 153 implemented POS v2 cash flow, created migration, but **migration not deployed to Neon**
- Session 154 started not knowing migration was pending — had to diagnose Railway P2022 error
- **Actual problem:** Migration mentioned in STATE.md as "pending" but no timestamp or reason

**Impact:** 1.5 hours lost debugging something that could have been flagged at session start.

### Pattern 3: File Changes Not Appearing in Session Log
**Evidence:** Session 127 (2026-03-10) → Session 128 (same day)
- Session 127 notes say "add-items full rewrite (session 127 carry-forward): committed c0831bf"
- But session-log.md entry for 127 says "FINDING-3 (stale 5%/7% fee copy on organizer settings.tsx) → fixed"
- **Discrepancy:** The 989-line rewrite is recorded in STATE.md "Completed Phases" but not in session-log
- No indication in next-session-prompt whether the rewrite was tested or blocked

**Impact:** Session 128 had to verify the rewrite with Chrome QA because session-log didn't record what was actually built.

### Pattern 4: Decision Made But Rationale Lost
**Evidence:** Session 155 roadmap strategic review
- Decision: "Organizer Mode Tiers is the framework answer to 'simple on the surface, complex for large organizers'"
- **But:** No link to what problem triggered this decision, which feature ideas depend on it, or what trade-offs were accepted
- If a future session re-opens the decision, we have no rationale trail

**Impact:** Architectural decisions drift because we can't see why they were made — only that they were.

### Pattern 5: Migration Deploy Async to Session
**Evidence:** Sessions 153–154 (2026-03-12)
- Session 153: "Migration 20260312_add_cash_fee_balance_to_organizer deployed to Neon (session 154)"
- Session 154: Message board doesn't show Patrick actually ran `prisma migrate deploy`
- Current STATE.md says "✅ Deployed (Session 153)" but that's aspirational — the actual deploy happened in 154

**Impact:** STATE.md and MESSAGE_BOARD are out of sync. Session 155 reads stale deployment status.

### Pattern 6: Scheduled Task Results Not Propagated
**Evidence:** Session 149 (2026-03-12)
- Daily friction audit ran automatically (not during session)
- Found P0: "Vercel GitHub App integration disconnected"
- Placed report at `claude_docs/operations/friction-audit-2026-03-12.md`
- **But:** next-session-prompt.md for session 150 doesn't mention this P0
- Session 150 notes started fresh, no reference to friction audit

**Impact:** Friction audit is running but its results aren't propagating into session starts. Scheduled tasks exist in isolation.

---

## Capture File Design: What Should It Record?

### Schema v1: Event Stream
```json
{
  "session_id": "s-158",
  "captured_at": "2026-03-13T14:22:00Z",
  "events": [
    {
      "timestamp": "2026-03-13T14:00:00Z",
      "type": "user_input",
      "content": "Build a rolling 96-hour I/O capture file",
      "tags": ["workflow", "meta"],
      "session_phase": "dispatch"
    },
    {
      "timestamp": "2026-03-13T14:02:00Z",
      "type": "skill_dispatch",
      "skill_name": "findasale-innovation",
      "dispatch_reason": "Research 10 creative lenses",
      "expected_output_file": "innovation-round3-2026-03-13.md",
      "tags": ["strategy", "research"],
      "session_phase": "active"
    },
    {
      "timestamp": "2026-03-13T14:45:00Z",
      "type": "skill_result",
      "skill_name": "findasale-innovation",
      "result_status": "completed",
      "output_file": "innovation-round3-2026-03-13.md",
      "integration_status": "recorded-in-STATE",
      "integration_file": "claude_docs/STATE.md",
      "tags": ["strategy", "research"],
      "session_phase": "active"
    },
    {
      "timestamp": "2026-03-13T15:30:00Z",
      "type": "file_change",
      "file_path": "packages/frontend/pages/organizer/pos.tsx",
      "change_type": "created",
      "size_bytes": 8211,
      "commit_hash": "afa28c1",
      "git_status": "pushed",
      "recorded_in_session_log": false,
      "tags": ["pos", "code"],
      "session_phase": "active"
    },
    {
      "timestamp": "2026-03-13T16:15:00Z",
      "type": "decision",
      "decision_id": "d-cash-fee-policy",
      "content": "10% fee on cash sales tracked as cashFeeBalance on Organizer",
      "rationale": "Matches online platform fee structure; deducted from next payout",
      "recorded_in": "decisions-log.md",
      "dependencies": ["migration-20260312"],
      "tags": ["cash", "fees", "policy"],
      "session_phase": "active"
    },
    {
      "timestamp": "2026-03-13T16:50:00Z",
      "type": "compression_event",
      "token_used": 167000,
      "token_limit": 200000,
      "remaining_tokens": 33000,
      "action": "resume",
      "session_phase": "continuation"
    }
  ]
}
```

### Minimal Event Types
- **user_input**: Patrick asks a question or gives a task
- **skill_dispatch**: Claude spawns a subagent with task + expected output
- **skill_result**: Subagent returns result; record whether it was integrated into STATE/decision-log
- **file_change**: Code or doc file created/modified; record git commit, push status
- **decision**: Strategic or architectural choice made; record rationale + dependencies
- **migration_event**: Database migration created, deployed, or pending
- **scheduled_task_result**: Friction audit, token checkpoint, etc. finishes; record summary
- **compression_event**: Token limit hit, session resume, context checkpoint
- **state_sync**: STATE.md or session-log.md explicitly updated (timestamps + what changed)
- **integration_gap**: Subagent result completed but NOT added to STATE/decisions/session-log (FLAG)

---

## Patterns That Signal Context Loss

### Heuristic 1: Skill Dispatch → No Integration Record
**Rule:** If event log contains `skill_dispatch` + `skill_result/completed`, but the result file is not mentioned in STATE.md or session-log.md within 30 minutes of completion, **flag as "orphaned skill result"**.

**Example triggering case:**
- Session 155: findasale-innovation returns 30 ideas in innovation-round3-2026-03-13.md
- STATE.md records "30 new ideas across 10 lenses" but doesn't list which lenses or which ideas made Phase 4
- Next session analyst script checks: "findasale-innovation dispatched; result file exists; no decision-log entry linking ideas to Phase 4 promotions"
- **FLAG:** "Orphaned idea evaluation — innovation-round3-2026-03-13.md generated but selection rationale not in decisions-log.md"

### Heuristic 2: File Changed But Not in Session Log
**Rule:** If git event shows file committed with hash X, but session-log.md entry for that session doesn't mention the file, **flag as "unlogged code change"**.

**Example triggering case:**
- Session 127: commit c0831bf is `add-items/[saleId].tsx` 989-line rewrite
- SESSION 127 session-log entry: "FINDING-3 (stale 5%/7% fee copy) → fixed"
- **FLAG:** "Large rewrite (989 lines) committed but not mentioned in session log — test coverage unclear"

### Heuristic 3: Pending Async Work Without Deadline
**Rule:** If STATE.md contains "migration pending Neon deploy" or "Patrick must run X before next session", but no timestamp + no reminder in next-session-prompt.md, **flag as "orphaned blocking action"**.

**Example triggering case:**
- Session 153: "migration 20260312_add_cash_fee_balance_to_organizer deployed to Neon (session 154)"
- Session 154 next-session-prompt.md doesn't mention this as a prerequisite for session 155
- **FLAG:** "Blocking action completed async to session — not propagated to session 155 start context"

### Heuristic 4: Decision Without Rationale Link
**Rule:** If decisions-log.md contains a decision entry but the linked feature file or session context doesn't explain why, **flag as "orphaned decision rationale"**.

**Example triggering case:**
- Decision: "Organizer Mode Tiers (Simple/Pro/Enterprise) is framework answer to complexity"
- No link to: what problem was it solving? Which 11 Phase 4 ideas depend on it? What trade-offs were made?
- **FLAG:** "Architectural decision exists but rationale chain is broken — next session can't evaluate trade-offs"

### Heuristic 5: Compression Boundary (Context Reset)
**Rule:** When token usage crosses 75% of session limit, and continuation happens, **flag as "compression event"** and check whether STATE.md was updated before reset.

**Example triggering case:**
- Session 150 hit context limit mid-Stripe Terminal implementation
- Session 151 resumed
- STATE.md doesn't have explicit "resuming from session 150, state is X" marker
- **FLAG:** "Compression boundary crossed; state continuity unclear"

### Heuristic 6: Scheduled Task Result Exists But Not Propagated
**Rule:** If a scheduled task (friction-audit, token-checkpoint, etc.) completes and writes a report, but the report is not mentioned in next-session-prompt.md, **flag as "isolated async result"**.

**Example triggering case:**
- Session 149: daily-friction-audit runs (automatic, not during session)
- Report: `claude_docs/operations/friction-audit-2026-03-12.md` (P0 Vercel issue)
- Session 150 next-session-prompt.md: no mention of friction audit
- **FLAG:** "Scheduled task completed but result not propagated — P0 blocked visibility"

### Heuristic 7: File Referenced in Decision But Not Committed
**Rule:** If next-session-prompt.md says "Files changed: X, Y, Z" but git shows only 2 were committed, **flag as "uncommitted work"**.

**Example triggering case:**
- Session 155: "Files changed: roadmap.md, STATE.md, session-log.md, next-session-prompt.md"
- next-session-prompt.md notes: "Patrick needs to push doc changes via push.ps1"
- **FLAG:** "Session ended with uncommitted files — next session cannot assume state is clean"

---

## 12-Hour Analysis Task Design

### Analysis Script (pseudocode)
```python
def analyze_96h_capture(capture_file, reference_docs):
    """Run every 12 hours (daily 8am + 8pm). Takes ~5 min."""

    findings = []

    # Load last 96 hours of capture events
    events = capture_file.events[-N:]  # N ≈ 500–1000 events per 96h

    # Run heuristic checks
    for skill_dispatch in events[type == 'skill_dispatch']:
        result = find_matching_result(skill_dispatch)
        if not result:
            findings.append({
                'type': 'orphaned_dispatch',
                'severity': 'warn',
                'skill': skill_dispatch.skill_name,
                'dispatched_at': skill_dispatch.timestamp,
                'age_hours': now - skill_dispatch.timestamp
            })
        elif result.status == 'completed':
            if not is_in_state_log(result.output_file):
                findings.append({
                    'type': 'integration_gap',
                    'severity': 'warn',
                    'result_file': result.output_file,
                    'completed_at': result.timestamp,
                    'not_in_state_since': now - result.timestamp
                })

    for file_change in events[type == 'file_change']:
        if file_change.git_status == 'committed':
            in_session_log = file_change.file_path in session_log[file_change.session_id]
            if not in_session_log and file_change.size_bytes > 2000:
                findings.append({
                    'type': 'unlogged_large_change',
                    'severity': 'info',
                    'file': file_change.file_path,
                    'size_kb': file_change.size_bytes / 1024,
                    'session_id': file_change.session_id
                })

    for decision in events[type == 'decision']:
        if not has_rationale_link(decision.decision_id):
            findings.append({
                'type': 'orphaned_decision_rationale',
                'severity': 'warn',
                'decision_id': decision.decision_id,
                'content': decision.content[:80],  # Truncate for readability
                'missing_links': ['feature_reference', 'trade_off_analysis']
            })

    # Check async tasks
    for scheduled_result in events[type == 'scheduled_task_result']:
        in_next_prompt = scheduled_result.summary in next_session_prompt()
        if not in_next_prompt and scheduled_result.severity >= 'warn':
            findings.append({
                'type': 'isolated_async_result',
                'severity': 'warn',
                'task': scheduled_result.task_name,
                'completed_at': scheduled_result.timestamp,
                'report_file': scheduled_result.report_path,
                'not_propagated_hours': (now - scheduled_result.timestamp) / 3600
            })

    # Check state sync gaps
    for i, event in enumerate(events):
        if event.type == 'compression_event':
            time_since_last_sync = event.timestamp - find_last_state_sync(events[:i])
            if time_since_last_sync > 1800:  # 30 min
                findings.append({
                    'type': 'large_sync_gap',
                    'severity': 'warn',
                    'gap_seconds': time_since_last_sync,
                    'compression_at': event.timestamp
                })

    return findings

def generate_12h_report(findings):
    """Create human-readable analysis report."""

    report = {
        'analysis_timestamp': now.isoformat(),
        'lookback_hours': 12,
        'total_events_analyzed': len(findings.all_events),
        'findings_by_severity': {
            'critical': [f for f in findings if f.severity == 'critical'],
            'warn': [f for f in findings if f.severity == 'warn'],
            'info': [f for f in findings if f.severity == 'info']
        },
        'summary': {
            'orphaned_dispatch_count': count(findings, 'orphaned_dispatch'),
            'integration_gaps': count(findings, 'integration_gap'),
            'unlogged_changes_kb': sum(f.size_kb for f in findings[type='unlogged_large_change']),
            'decision_rationale_gaps': count(findings, 'orphaned_decision_rationale'),
            'async_result_isolation': count(findings, 'isolated_async_result')
        }
    }

    return report
```

### Report Template
```markdown
## 12-Hour Capture Analysis Report
Generated: 2026-03-13 14:00Z | Period: 2026-03-11 14:00Z — 2026-03-13 14:00Z

### Summary
| Finding Type | Count | Severity | Action |
|---|---|---|---|
| Orphaned Skill Dispatch | 2 | warn | Check next session start context |
| Integration Gaps | 3 | warn | Add to decisions-log.md |
| Unlogged Large Changes | 1 (989 KB) | info | Audit test coverage |
| Decision Rationale Missing | 4 | warn | Link to feature files + trade-off docs |
| Isolated Async Results | 1 | warn | Add friction-audit P0 to next-session-prompt |

### Critical Findings
None this period.

### Warnings
1. **Orphaned Decision Rationale (Organizer Mode Tiers)**
   - Decision: "Simple/Pro/Enterprise is framework answer to complexity"
   - Missing: Feature dependencies, trade-off analysis, cost-benefit
   - Recommendation: Add decision-link to feature #65 + architecture rationale

2. **Integration Gap (innovation-round3-2026-03-13.md)**
   - Research completed but selection rationale not in decisions-log
   - 5 ideas promoted (#29, #30, #31, #32, #17) but why these 5?
   - Recommendation: Add entry to decisions-log linking each promoted idea to research notes

3. **Isolated Async Result (friction-audit-2026-03-12.md)**
   - Friction audit found P0 (Vercel GitHub App disconnected)
   - Not propagated to session 150 start context
   - Recommendation: Add friction audit summary to next-session-prompt for all high-severity findings

### Info-Level Findings
1. **Unlogged Large Change (add-items/[saleId].tsx)**
   - 989 KB rewrite in session 127, not mentioned in session-log
   - Change was tested in session 128 (QA pass)
   - Recommendation: Log large rewrites (>500 KB) in session-log as code-review item

### Recommendations for Next Session
1. Update decisions-log.md with rationale for all Organizer Mode Tiers dependencies
2. Add innovation-round3 selection rationale to decisions-log
3. Add friction-audit-2026-03-12 P0 summary to next-session-prompt
4. Record async task results (friction audit) in capture file with propagation status

---

**Next Report:** 2026-03-13 20:00Z
```

---

## CLAUDE.md Implications: Minimal Enforcement Needed

### Capture File Entry Points
No new rules needed. Capture happens at these 3 automatic checkpoints:

1. **Session start** (conversation-defaults skill)
   ```
   Before work begins, read:
   - Last 96h capture file summary
   - Analyze for integration gaps + orphaned work
   - Report gaps to Patrick in session start briefing
   ```

2. **Skill dispatch** (automatically logged in findasale-records)
   ```
   When Claude calls Skill(), capture file auto-records:
   - skill_name
   - dispatch_reason (from chat context)
   - expected_output_file
   - timestamp
   ```

3. **Session wrap** (findasale-records SKILL.md)
   ```
   Before session ends, add to capture file:
   - state_sync event (STATE.md updated? Y/N, what changed)
   - all file_change events logged during session (git commits)
   - integration_status for all subagent results
   ```

### No New CORE.md Rules Required
The capture happens **passively** through:
- GitHub MCP commit hashes (already logged)
- Skill dispatch already routed through findasale-records
- File change tracking in wrap phase (already exists)

**Single lightweight addition to conversation-defaults:**
```markdown
## Session Start Capture Check
Before work begins, findasale-workflow (or findasale-records) reads the 96h capture file and flags:
- Orphaned skill results (skill completed, not in STATE)
- Uncommitted work from prior session
- Async blocking actions (migrations pending, scheduled task results)
- Decision rationale gaps (decisions logged, but feature link missing)

Report all WARN+ severity findings to Patrick as session blockers.
```

---

## Summary of Findings

### What Context Is Currently Lost
1. **Subagent research outputs** — Skill fires, returns result, but selection rationale not captured
2. **Async work** — Migrations deployed, scheduled tasks run, results not propagated to next session start
3. **Large code rewrites** — Committed but not mentioned in session-log; test coverage unclear
4. **Decision rationale** — Decisions logged, but the problem they solved + trade-offs missing
5. **Compression boundaries** — Context resets, but no explicit "state as of X time" checkpoint

### What the Capture File Should Record
Minimal schema with 9 event types:
- user_input, skill_dispatch, skill_result
- file_change, decision, migration_event
- scheduled_task_result, compression_event, state_sync, integration_gap

Per event: timestamp, type, content summary, tags, session_phase, key metadata.

### Patterns That Trigger Analysis
7 heuristics designed to flag real problems:
1. Skill result not integrated into STATE within 30 min → **orphaned dispatch**
2. Large file changed but not in session-log → **unlogged change**
3. Pending action without deadline → **orphaned blocking action**
4. Decision without rationale link → **broken decision chain**
5. Token compression without state sync → **context loss boundary**
6. Scheduled task result not propagated → **isolated async result**
7. Uncommitted files at session end → **work stranded**

### 12-Hour Analysis Task
Reads 96h capture file, runs heuristics, produces:
- Summary table (finding counts by severity)
- Critical + Warn findings with context + fix
- Info findings (patterns for future reference)
- Actionable recommendations for next session

**Execution:** Every 12 hours (daily 8am + 8pm UTC), takes ~5 min, writes markdown report.

### CLAUDE.md Changes Needed
**None.** Capture happens automatically via:
- conversation-defaults session-start checkpoint (reads last 96h capture, flags gaps)
- Skill dispatch already routed through findasale-records (captures request + result)
- Session wrap already includes file sync (captures git commits + STATE changes)

Only add one lightweight rule: **Session Start Capture Check** — findasale-records reads 96h capture, reports WARN+ findings to Patrick before work begins.

---

## Implementation Roadmap

### Phase 1: Capture Infrastructure (Week 1)
- Create `/claude_docs/logs/capture-96h.jsonl` (append-only event log)
- Add event capture calls to findasale-records SKILL.md (skill dispatch + result)
- Add event capture calls to conversation-defaults (session start + wrap)
- Test with 1 real session, verify events are accurate

### Phase 2: Analysis Task (Week 2)
- Write Python analyzer (heuristic checks)
- Create report template + markdown generator
- Schedule as daily task at 8am + 8pm UTC
- Store reports in `claude_docs/operations/capture-analysis-[date].md`

### Phase 3: Integration (Week 3)
- Add "Capture Check" section to session-start briefing (findasale-records)
- Add "Next Session Capture Flags" section to next-session-prompt.md
- Test with 3 real sessions, verify findings are actionable

### Phase 4: Dashboard (Optional, Week 4)
- Weekly capture summary: orphaned items, integration gaps, compression trends
- Add to MESSAGE_BOARD as standing report
- Patrick reviews weekly to spot workflow drift early

---

## Conclusion

The rolling 96-hour capture file is **minimal infrastructure that pays immediate dividends**. It exposes patterns that currently hide between sessions. The 12-hour analysis task acts as an early-warning system for context loss — giving Patrick visibility into where the workflow breaks.

No new CLAUDE.md rules required. The captures happen passively, the analysis is automated, and findings are surfaced at session start where they can actually be acted on.

**Ready for implementation. Recommend starting Phase 1 this week.**
