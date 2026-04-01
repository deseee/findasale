# Daily Friction Audit — 2026-03-26

**AUTO-DISPATCH from daily-friction-audit**
Run: 2026-03-26 03:38 UTC (scheduled)
Session context: Post S289

---

## Summary

3 non-cosmetic findings. No TypeScript errors detected from file scan. No merge conflicts. All CLAUDE.md-referenced docs exist. STACK.md current. decisions-log.md entries all recent (2026-03-24). Git log clean. Skills fleet complete.

**One P1 requires Patrick action before S290 starts.**

---

## P1 — S289 Push Block Not Run

**Category:** doc-staleness / state-sync
**Severity:** P1

STATE.md (S289), patrick-dashboard.md (S289), and `packages/database/prisma/seed.ts` (rarity values) are updated on disk but NOT committed to GitHub. Most recent GitHub commit: `a13fe3e fix(qa-s288)` (2026-03-26 02:09 UTC). S289 work is invisible to Railway/Vercel and any future session that reads from GitHub.

**Patrick action required before S290:**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale

git add packages/database/prisma/seed.ts
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md

git commit -m "chore(s289): seed rarity values + Chrome QA docs update

- seed.ts: 5 items now get rarity values (COMMON/UNCOMMON/RARE/ULTRA_RARE/LEGENDARY)
- STATE.md: S289 results — #131/#84/#59/#37 Chrome verified
- patrick-dashboard.md: S289 wrap"

.\push.ps1
```

**Also needed for rarity badge visual verification (#57):**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx ts-node prisma/seed.ts
```

---

## P2 — Git Index Corruption in VM

**Category:** infrastructure
**Severity:** P2

Running `git status` inside the VM returns `fatal: unknown index entry format 0x00530000`. Git log and remote operations (GitHub MCP) work fine. This is likely the same git index.lock / staging area issue seen in prior sessions (S276, S287 recovery notes). Patrick's `push.ps1` self-heals on his machine, so this doesn't block pushes. However it means the VM cannot use git to detect uncommitted file drift.

**Note:** CLAUDE.md's push.ps1 script self-heals index.lock — Patrick should run it normally. If git status breaks on Patrick's machine (not just the VM), that's P0.

No subagent dispatch — VM-local issue only.

---

## P2 — Workspace Root Clutter (Subagent File Hygiene Violations)

**Category:** code-quality / file-hygiene
**Severity:** P2

The project root (`/sessions/.../FindaSale/`) contains:
- 14 `_tmp_*` files from prior subagent sessions (e.g., `_tmp_17008_08453a9272e81ddede29e697bc75df3b`)
- 7 loose `.skill` files (conversation-defaults.skill, findasale-dev.skill, findasale-qa.skill, etc.)
- Stray temp artifacts: `ziSe4sNr`, `zisZbNTx`, `context.md`, `camera-mode-mockup.jsx`
- `conversation-defaults-SKILL-v8.md.tmp.35852.1773930503120`

Per CLAUDE.md §10 subagent file hygiene rules, temp/working files must go to `/sessions/[session-id]/` (VM working dir), not project root. These are cluttering the workspace Patrick sees.

**Suggested dispatch (non-destructive audit only — Patrick confirms before delete):**
Recommend findasale-records audit and produce a delete manifest for Patrick to approve.

---

## P2 — Long-Outstanding Patrick Actions (Not Escalating, Tracking)

**Category:** doc-staleness / operational
**Severity:** P2

These have been in STATE.md / patrick-dashboard.md for multiple sessions without resolution. Flagging for visibility:

| Item | Outstanding Since | Blocker? |
|------|------------------|----------|
| Attorney review — register.tsx consent copy (`LEGAL_COPY_PLACEHOLDER_*`) | S272 | **Yes — required before beta launch** |
| `MAILERLITE_SHOPPERS_GROUP_ID=182012431062533831` not set on Railway | S272+ | Yes — email signup broken |
| `RESEND_API_KEY` + `RESEND_FROM_EMAIL` verify on Railway | S272+ | Yes — transactional email uncertain |
| Neon project deletion at console.neon.tech | S264 | No — cleanup only |
| Auction E2E (End Auction → Stripe → winner notification) | S278 | Verification only |

The attorney review + email env vars are pre-beta blockers. If beta testers are live this week (per memory note), these need resolution now.

---

## P3 — session-log.md Not Deprecated

**Category:** doc-staleness
**Severity:** P3

`claude_docs/session-log.md` still exists with content from S258–S262 (30+ sessions stale). Per CLAUDE.md §12, session log content should have moved into STATE.md "## Recent Sessions" and this file deprecated. Low risk — just adds confusion for any agent that reads it and assumes it's current.

**No dispatch needed** — findasale-records can handle at next session wrap.

---

## No Findings (Clean)

- STACK.md: current, matches actual package structure
- CLAUDE.md file references: all 8 referenced files confirmed present
- decisions-log.md: all entries from 2026-03-24, none stale
- Merge conflicts: none found in git log
- Skills fleet: all expected skills present in `.claude/skills/`
- Git log: clean commit history, no orphaned branches visible
- claude_docs/ active files: no TODO/FIXME markers in non-archived files

---

## Next Audit

Scheduled: 2026-03-27 03:38 UTC
