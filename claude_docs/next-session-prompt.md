# Next Session Resume Prompt
*Written: 2026-03-11*
*Session ended: normally — session 142 complete*

## Hard Gate Checklist
- [ ] Read context.md (regenerate if >24h old)
- [ ] Read STATE.md
- [ ] Read this file completely
- [ ] Check .checkpoint-manifest.json
- [ ] Read decisions-log.md (new — Rule 16)
- [ ] Note active MCP tools

## Resume From
Phase 1 of fleet redesign complete. All 6 items implemented. Patrick needs to install/uninstall skills and push to GitHub before Phase 2 begins.

## What Was Completed This Session (142)
- Merged findasale-cx + findasale-support → findasale-customer-champion (317 lines, Voice of Customer role)
- Merged findasale-rd + findasale-pitchman → findasale-innovation (213 lines, two-phase ideate→evaluate)
- CORE.md v3: §6 Escalation Channel, §7 Handoff Protocol, §8 Red-Flag Veto Gate
- conversation-defaults v5: Rules 14 (escalation surfacing), 15 (handoff pass-through), 16 (decisions-log at init)
- Created escalation-log.md (append-only)
- Created decisions-log.md (all 22 session 141 decisions)

## Patrick Action Required (Before Next Session)
1. **Install new skills via Cowork UI:**
   - `findasale-customer-champion` (source: `claude_docs/skills-package/findasale-customer-champion/`)
   - `findasale-innovation` (source: `claude_docs/skills-package/findasale-innovation/`)
   - Updated `conversation-defaults` (source: `claude_docs/skills-package/conversation-defaults/`)

2. **Uninstall old skills via Cowork UI:**
   - `findasale-cx`
   - `findasale-support`
   - `findasale-rd`
   - `findasale-pitchman`

3. **Push to GitHub:**
   ```powershell
   git add claude_docs/CORE.md claude_docs/escalation-log.md claude_docs/decisions-log.md claude_docs/skills-package/findasale-customer-champion/SKILL.md claude_docs/skills-package/findasale-innovation/SKILL.md claude_docs/skills-package/conversation-defaults/SKILL.md claude_docs/STATE.md claude_docs/logs/session-log.md claude_docs/next-session-prompt.md .checkpoint-manifest.json
   git commit -m "docs: session 142 — fleet redesign Phase 1 (merges, escalation, handoff, veto gate, decisions-log)"
   .\push.ps1
   ```

## Phase 2 — Two Weeks After Phase 1 Stabilizes
See `fleet-redesign-proposal-v1.md` Appendix for full plan. Key items:
- 5 new standalone agents (sales-ops, devils-advocate, steelman, investor, competitor)
- Advisory board restructure (12 seats + 6 subcommittees)
- Budget-first session planning
- Trial/rollback protocol
- Cross-agent feedback loops
- 2 new scheduled tasks (daily-friction-audit, weekly-pipeline-briefing)

## Carry-Forward Blockers
- Neon migration `20260311000002_add_item_draft_status` still pending deploy
- Patrick's 5 beta-blocking items: Stripe business account, Google Search Console, business cards, beta organizer outreach, Michigan attorney check
