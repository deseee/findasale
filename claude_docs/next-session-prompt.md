# Next Session Resume Prompt
*Written: 2026-03-09*
*Session ended: normally*

## Resume From
1. Deploy 3 pending Neon migrations (command in STATE.md "In Progress" section — run from `packages/database`).
2. Dispatch fleet on remaining backlog items.
3. Run findasale-workflow to analyze Session 111 problems (see Workflow Audit below).

## What Was Completed This Session (111)
- Fixed Railway TS2322 build failure (itemSearchService.ts intersection types)
- Fixed Vercel build failure (add-items/[saleId].tsx form reset missing fields)
- Scrubbed live Neon credentials from next-session-prompt.md — pushed immediately
- Added CORE.md §17.3(c) credential hard gate
- Fixed coupons.ts ERR_ERL_KEY_GEN_IPV6 (`ipKeyGenerator(ip)` — took 3 iterations)
- Rotated Neon credentials (Patrick completed in Neon console)
- Fleet dispatched: B2 ✓, H1 ✓, D3 ✓, G-batch ✓ (rerun)
- conversation-defaults skill updated v1→v2 and reinstalled
- Vercel MCP connected
- STATE.md cleaned up (removed stale completed items, added migration command)

## What Was NOT Completed
- **3 Neon migrations not deployed** — Patrick ran command but it targeted wrong package (`packages/backend` instead of `packages/database`). Correct command is in STATE.md.
- **docker-compose.yml deletion** — still uncommitted. Run: `git add docker-compose.yml && git commit -m "chore: remove docker-compose.yml (Docker retired session 81)" && .\push.ps1`

## Workflow Audit — Session 111 Problems for findasale-workflow to Analyze

**Problem 1: Context loss on compression.** Session continued from a previous context window via summary. The summary was comprehensive but Claude still lost operational knowledge — specifically, that Prisma schema lives in `packages/database` not `packages/backend`, and that the package.json uses `db:generate`/`db:deploy` script names (not raw `prisma` commands). This is the SAME class of error the conversation-defaults skill and context-maintenance workflow are supposed to prevent. Root cause: compression summaries don't preserve operational muscle memory.

**Problem 2: Refusing to read .env and provide ready-to-paste commands.** Claude had direct access to `packages/backend/.env` and could read the commented-out Neon production URLs, but instead told Patrick to "go get the credentials himself" THREE TIMES before finally reading the file and building the command. This violates the core principle of reducing organizer manual work. Patrick should never have to manually extract values from files that Claude can read.

**Problem 3: coupons.ts ipKeyGenerator took 3 pushes to get right.** Each push triggered a Railway rebuild cycle (~2-3 min each). The sequence: (1) removed import entirely and used inline regex — passed TS but failed runtime validation, (2) imported ipKeyGenerator and called it with Request object — failed TS because signature is `(ip: string)` not `(req: Request)`, (3) finally read the TS error and passed `req.ip` string to `ipKeyGenerator`. Should have checked the function signature BEFORE the first push by reading the express-rate-limit type definitions or docs.

**Problem 4: Token burn from iterative fix pushes.** 3 MCP pushes for one file = 3 Railway rebuilds + 3 full read-edit-push cycles in context. Each cycle consumed ~500-800 tokens of context. Combined with the migration command iterations (wrong package, wrong script name, then correct), this session burned significant context on preventable errors.

**Recommendation for findasale-workflow:** Propose a pre-push verification step — before any MCP push of a TypeScript file, Claude should verify the fix compiles locally (or at minimum, check type signatures of any imported functions). Also propose a "ready-to-paste" rule: when Claude has file access and can read credentials/config values, ALWAYS build the complete command. Never tell Patrick to "go read the file himself."

## Next Priorities (in order)
1. **Deploy 3 Neon migrations** (command ready in STATE.md)
2. **docker-compose.yml cleanup** (one commit + push)
3. **A3.6** — Railway logs → diagnose → fix (findasale-dev)
4. **B2 implementation** — wire AI disclosure copy into UI (findasale-dev)
5. **H1 quick wins** — "How It Works" 4-step card + mobile compact header (findasale-dev)
6. **D3 implementation** — route planning backend API via OSRM (findasale-architect → findasale-dev)
7. **Workflow audit** — run findasale-workflow on the 4 problems above

## Environment Notes
- Railway: GREEN (build passing, backend running on port 5000)
- Neon: credentials rotated, 3 migrations pending
- Vercel MCP: connected
- coupons.ts on GitHub matches local (commit 45d76b4)
- docker-compose.yml: deleted locally but not committed
