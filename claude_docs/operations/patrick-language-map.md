# Patrick's Language Map

Quick-reference for interpreting Patrick's common phrases.
Reduces clarification round-trips. Updated as new patterns emerge.

---

## Command Words

| Patrick says | Claude should do |
|-------------|------------------|
| "hello" / "hi" / "hey" / [any opener ≤5 words with no task] | Session start signal. Reply with one warm sentence, then immediately load STATE.md + session-log.md + next-session-prompt.md and relay the session context. Start working on the first priority task. Do NOT ask "what would you like to work on?" |
| "check" | Verify something works. Run a scan, read a file, test an endpoint. Don't just describe — actually check. |
| "note" | Add to persistent docs (STATE.md, session-log, self-healing-skills, or relevant doc). Not just acknowledge — write it down. |
| "ok" | Acknowledged. Proceed to next step. Don't re-explain what was just said. |
| "that worked" | Confirmation. Move forward. Mark current task complete, start next. |
| "finished" / "done" / "wrap" | Trigger session wrap protocol: update STATE.md, session-log, push files, write next-session-prompt. |
| "prep" | Prepare for next session. Write next-session-prompt.md with full specs. |
| "remember" | Add to permanent documentation — CLAUDE.md, CORE.md, self-healing-skills, or a new skill. This is a locked instruction. |
| "remind" | Set up a future trigger — scheduled task, session-start note, or doc entry that surfaces at the right time. |
| "prefer" / "like" | This is becoming a locked decision. Update relevant docs (STACK.md for tech choices, CORE.md for behavior). |
| "similar" | Use an existing pattern as template. Find the closest prior implementation and adapt it. Don't start from scratch. |
| "clean up" | Remove dead code, consolidate duplicates, trim docs. Don't add anything new — subtract. |
| "what's next" | Read next-session-prompt.md and STATE.md, then present the next sprint/phase. |
| "run" / "try" | Execute the thing. Don't plan it, don't explain it — just do it and report the result. |
| "quick" | Keep scope tight. One file, one function, minimal overhead. Skip planning. |
| "deploy" | Load findasale-deploy skill. Run pre-deploy checklist. |
| "scan" / "health check" | Load health-scout skill. Run proactive scan. |
| "context is stale" | Load context-maintenance skill. Regenerate context.md and audit STATE.md. |

## Tone Preferences

- Patrick is a non-technical PM. Skip implementation rationale unless asked.
- Concise, direct. Plain prose, no bullet headers in conversation.
- Report completion status clearly: "Done — pushed to GitHub" not "I've completed the implementation."
- Flag errors immediately, don't bury them in paragraphs.
- When Patrick gives a thumbs-up or short "ok" — that means keep going, don't wait.

## Session Patterns

- Patrick often batches 3–5 sprints in a single long session.
- He reviews output by looking at the site, not reading code. Visual confirmation > code review.
- He trusts Claude to make implementation decisions within the established architecture.
- He intervenes when: something breaks visually, a deploy fails, or docs get stale.
- He values session wraps highly — they're how he stays oriented across sessions.

---

Last Updated: 2026-03-06 (session 84 — added session start signal rule for short openers)
