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

## Unified Tool Terminology (Updated 2026-03-15)

Patrick uses **"tools"** as a catch-all for all capabilities Claude can invoke:

**"Tools" = ALL of:**
- MCP tools (GitHub, Stripe, Vercel, MailerLite, Chrome, Scheduled Tasks, etc.)
- Skills (findasale-dev, findasale-qa, findasale-architect, cowork-power-user, etc.)
- Generic plugins (productivity, sales, writing, research)
- Browser agents (Chrome skill for automation)
- Third-party services (Ollama, autoresearch, Claude Code CLI)
- Anything discovered through research that extends Claude's capabilities

**When Patrick says "tools", do NOT ask "do you mean skills or plugins or MCP tools?"**
**Just say: "I can use the GitHub MCP for this, or dispatch findasale-dev skill."**

**CRITICAL RULE (S169):** Never expand "tools" into a yes/no question offering separate options. Patrick means ALL capabilities in a unified bucket. Just pick the best one(s) for the task and describe them specifically.

**Consolidated terminology (to reduce from 9 overlapping terms to 5):**

| Old term | Replacement | Example |
|----------|-------------|---------|
| "subagent" | Use specific skill name | "findasale-dev skill" not "dev subagent" |
| "agent" | Use skill name | "findasale-qa skill" not "qa agent" |
| "plugin" | Use skill name | "cowork-power-user skill" not "plugin" |
| "connector" | MCP | "GitHub MCP" not "GitHub connector" |
| "MCP tool" | MCP | "GitHub MCP" not "GitHub MCP tool" |
| "tool" | Context-dependent | "I can use the GitHub tool, or dispatch findasale-qa skill" |
| "scheduler" | Scheduled task | "I'll create a scheduled task" |
| "Chrome" | Chrome skill | "I'll use the Chrome skill" |
| "capability" | Specific action | "I'll search for X" not "I'll use that capability" |

**Why:** Reduces mental parsing overhead. When Patrick says "tools", he means "anything in Claude's kit."

---

## Shell & Environment Specifics

Patrick uses Windows PowerShell exclusively. Never give bash syntax. Key rules:
- Use `;` (semicolon) to chain commands on one line: `git fetch origin; git merge origin/main --no-edit`
- Or use separate lines (safer): put each command on its own line
- **NEVER use `&&`** — that's bash only. PowerShell parser rejects it with "token is not a valid statement separator"
- For line continuation in PowerShell, use backtick: `` `command `` (not backslash `\`)
- Always check context before giving git/pnpm commands. When in doubt, load dev-environment skill.
See self_healing_skills.md entry 40 for detailed examples.

## Session Patterns

- Patrick often batches 3–5 sprints in a single long session.
- He reviews output by looking at the site, not reading code. Visual confirmation > code review.
- He trusts Claude to make implementation decisions within the established architecture.
- He intervenes when: something breaks visually, a deploy fails, or docs get stale.
- He values session wraps highly — they're how he stays oriented across sessions.

---

Last Updated: 2026-03-15 (session 169 strategic audit — added unified tool terminology, consolidated 9 terms to 5, clarified "tools" catch-all meaning)
