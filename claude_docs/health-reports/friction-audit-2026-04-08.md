# Daily Friction Audit — 2026-04-08
AUTO-DISPATCH from daily-friction-audit (scheduled task, 3:38am M-F)
Handled by: findasale-records

---

## Summary

No P0 or P1 blockers found. One P2 doc-staleness item actioned. Two P3 informational items noted.

---

## Findings

### P2 — Roadmap staleness (doc-staleness)

**Finding:** Roadmap was at v101 (last updated 2026-04-07, S412). Sessions S413, S414, S415, S416 all shipped new features and the roadmap header had not been updated — violating the CLAUDE.md §4 "Roadmap update gate" rule.

**Sessions affected:** S413 (nav audit, orphan cleanup), S414 (eBay category picker, map UX spec), S415 (tech debt Phase 1+2, account deletion), S416 (Map MVP, integration tests, bug fixes, pricing transparency, PRO nudge).

**Action taken:** Added v102 header note to `claude_docs/strategy/roadmap.md` summarizing S413–S416 changes and flagging that individual roadmap row updates are pending. Row-level updates require careful column-aligned edits — queued for S417 with Patrick present.

**Remaining work for S417:** Update individual feature rows in roadmap.md for:
- eBay category picker (new entry ~#288+)
- Account deletion (new entry)
- Map Treasure Trails badge on pins (update existing Treasure Trails entry)
- PRO upgrade nudge banner (update dashboard entry or new)
- Tech debt items that correspond to existing roadmap features (condition standardization, next/image, Zod validation)

---

### P3 — S410 deferred item still open (workflow-drift)

**Finding:** S410 deferred "Remove organizer rarity control from manual add-items form (rarity is auto-assigned — organizer dropdown there is now misleading)" — logged in STATE.md S410 section but never added to a tracked backlog or roadmap entry. Risk of silently disappearing.

**Action:** None taken (P3, Patrick not present). Flag for S417 — either add to roadmap as a small UX fix or explicitly mark as deferred-post-beta.

---

### P3 — Inline code TODOs (code-quality, informational)

**Finding:** 12 TODO comments found across backend/frontend source files. All have context and no owner tag. None are blockers. Examples:
- `appraisalController.ts:38` — PAID_ADDON billing check deferred
- `itemQueries.ts:43` — draftStatus optional field note
- `xpService.ts:556` — ANNIVERSARY_30DAY wiring deferred
- `encyclopedia/[slug].tsx:148` — vote endpoint not yet available
- `shopper/dashboard.tsx:264` — collection API not yet wired
- `AvatarDropdown.tsx:219` — XP rank badge needs real data

**Action:** None taken (informational). No owner tags, no P0/P1 risk. Routine cleanup can happen when adjacent files are touched.

---

## Health Checks (All Passing)

| Check | Result |
|-------|--------|
| STATE.md freshness | ✅ Updated S416 (2026-04-08) |
| patrick-dashboard.md freshness | ✅ Updated S416 (2026-04-08) |
| CLAUDE.md file references | ✅ All 13 referenced files exist |
| STACK.md | ✅ Present, matches active stack |
| decisions-log.md | ✅ 456 lines, most recent 2026-04-07. No entries >3 months old. |
| Merge conflicts | ✅ None found |
| TypeScript errors (frontend) | ✅ Zero errors |
| TypeScript errors (backend) | ✅ Zero errors |
| session-log.md / next-session-prompt.md | ℹ️ Deprecated files still exist (last modified Apr 2) — expected per CLAUDE.md §12 consolidation. Not flagged. |
| Blocked/Unverified Queue | ℹ️ 9 items tracked, oldest from S312. All have valid "acceptable unverified" or hardware-required reasons. |

---

## Records Handoff

### Files Updated
| File | Type of Change | Tier |
|------|---------------|------|
| `claude_docs/strategy/roadmap.md` | Added v102 header note for S413–S416 | Tier 2 |
| `claude_docs/health-reports/friction-audit-2026-04-08.md` | New audit report | Tier 3 |

### Tier 1 Changes Made
None.

### Drift Found
Roadmap header staleness (4 sessions, v101→v102). Corrected with lightweight header note. Row-level updates queued for S417.

### Flagged for Patrick
1. **S417 Priority 0 (before new work):** Run roadmap row-level update pass for S413–S416 features. Dispatch findasale-records or do inline — it's a roadmap-format pass.
2. **S417 backlog decision:** S410 rarity dropdown deferred item — schedule or close.

### Context Checkpoint
No — automated task, lightweight run.
