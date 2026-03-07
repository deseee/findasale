# Workflow Audit — Session 86 (2026-03-07)

Requested by Patrick mid-incident. Focus: friction patterns during Railway outage recovery.

---

## Sessions Reviewed
Session 86 (this session). Reference: sessions 83–85 for recurring pattern context.

---

## Incident Timeline (What Actually Happened)

| Time | Event | Cost |
|------|-------|------|
| Session start | Roadmap cleanup, feature integration, parallel agents | Clean ✅ |
| Mid-session | Railway backend crash reported | — |
| +1 turn | Wrong diagnosis: PORT env var | Wasted turn |
| +2 turns | Wrong diagnosis: JWT_SECRET startup guard | Wasted 2 turns + Patrick frustration |
| +3 turns | Patrick pasted actual logs → ERR_REQUIRE_ESM identified | Could have been turn 1 |
| +4 turns | uuid fix committed locally (e573ff1) | ✅ |
| +5 turns | MCP push of fix (74797533) | ✅ |
| +6–10 turns | Railway not rebuilding — empty commits, push.ps1 cycles | ~5 wasted turns |
| +11 turns | Dockerfile change via MCP → Railway triggered | ✅ |
| +12 turns | New error: Organizer.website P2022 | — |
| +13 turns | Patrick asked for credentials Claude already had | 1 wasted turn |
| +14 turns | Migration created and applied from VM | ✅ |

**Total recoverable waste: ~8 turns / ~30% of incident session.**

---

## Patterns Found

| Pattern | This Session | Fix |
|---------|-------------|-----|
| Diagnosing without evidence | 2 wrong guesses before reading logs | Rule: ask for logs first, never speculate on env vars |
| Asking for credentials Claude can find | Waited until Patrick said "you have them" | Rule: proactively read .env for credentials |
| Schema drift (field without migration) | Organizer.website — no migration generated | Self-healing entry + deploy checklist |
| ESM-only npm package in CJS build | uuid@13 → ERR_REQUIRE_ESM | Self-healing entry |
| package.json + lockfile out of sync | Removing uuid → frozen-lockfile Railway failure | Self-healing entry + must push both together |
| Railway webhook stuck | Multiple commits didn't trigger rebuild | Self-healing entry — Dockerfile change as escape hatch |
| MCP git divergence (recurring) | roadmap.md showing modified again this session | Entry #38 exists but keeps recurring — needs CORE.md enforcement |

---

## Root Cause Analysis

### #1 — Two wrong diagnoses (highest impact)

Claude guessed PORT and JWT_SECRET without evidence. Both were wrong. Patrick had
to paste the actual Railway logs before the real cause was found. The correct behavior:

> "The backend is crashing on startup. Can you paste the Railway logs? I can't
> diagnose this accurately without seeing the actual error."

One turn. Done. No PORT or JWT_SECRET speculation.

**Rule needed in CORE.md §12 (session safeguards):** "For production startup failures,
never speculate on env vars. Ask Patrick for the actual crash logs before proposing a fix."

### #2 — Credentials in .env not read proactively

When running `prisma migrate deploy`, Claude told Patrick to set env vars manually.
Patrick had to say "you have the credentials in memory already." The .env file is
always at `packages/backend/.env` and is accessible from the VM. There is no reason
to ask Patrick for credentials that exist in a readable file.

**Rule needed in CORE.md or ops skill:** "Before asking Patrick for credentials or
database URLs, check `packages/backend/.env` first."

### #3 — Schema drift (Organizer.website)

A field was added to `schema.prisma` without a corresponding migration. No deploy
checklist caught it. Only manifested at runtime as a P2022 error.

**Self-healing entry needed.** Also: the deploy checklist should include
`prisma migrate status` as a pre-deploy gate.

### #4 — package.json + lockfile not co-committed

Removing `uuid` from `package.json` via MCP did not also update `pnpm-lock.yaml`.
Railway's `--frozen-lockfile` treats this as a fatal mismatch. The rule is simple:
**whenever package.json changes, the lockfile must change in the same commit.**

**Self-healing entry needed. Also: CORE.md should state this explicitly.**

### #5 — Railway webhook stuck (recurring infra pattern)

After the first failed build, subsequent commits did not trigger new Railway builds.
Empty commits don't work. The escape hatch is: **push a real file change via MCP**
(Dockerfile worked). This is now documented but wasn't known at the time.

---

## Proposed Changes

### Self-Healing entries to add (41–44)
See self_healing_skills.md — 4 new entries queued below.

### CORE.md additions (Tier 1 — requires Patrick approval)

**§12 addition:**
> For production startup failures: never speculate on env vars or config.
> Ask Patrick for actual crash logs first. One turn of evidence is worth
> more than five turns of guessing.

**§10 or new §16 addition:**
> When package.json dependencies change (add or remove), regenerate and push
> pnpm-lock.yaml in the same commit. Never push a package.json change without
> its lockfile. Use `pnpm install` locally then include lockfile in the commit.

**Operations rule (findasale-ops skill or CORE.md):**
> Before asking Patrick for credentials (DATABASE_URL, API keys, etc.),
> check `packages/backend/.env` — it is always readable from the VM.

### Skill fixes (Tier 2 — no Patrick approval needed)

- **findasale-ops SKILL.md:** Add Railway webhook escape hatch pattern (push
  a Dockerfile change to force a new build trigger when empty commits don't work).
- **findasale-deploy SKILL.md:** Add `prisma migrate status` to pre-deploy checklist
  to catch schema drift before it hits production.

---

## Quick Wins (implement this session)

1. ✅ Add self-healing entries #41–44 to self_healing_skills.md
2. ✅ Propose CORE.md §12 addition to findasale-records

## For Next Session

- Restore `--frozen-lockfile` in Dockerfile.production (currently `--no-frozen-lockfile`)
  and push a clean lockfile — the escape hatch was correct but shouldn't stay permanent.
- Patrick: consider rotating Neon credentials (still on the list from session 83)

---

Audit by: Workflow Efficiency Agent
Session: 86
