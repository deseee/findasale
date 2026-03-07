# Next Session Resume Prompt
*Written: 2026-03-07 (session 88 — end of session)*
*Session ended: normally*

## Resume From

Patrick completes pre-work items below, then run **Sprint 3.5** (Grand Rapids
code deGR-ification, ~10 files, no schema changes) via findasale-dev → findasale-qa.
After that: Sprint 4 (Search by Item Type) → Sprint 5 (Seller Performance Dashboard).

## Patrick's Pre-Work (Complete Before Next Session)

### 1. Replace global CLAUDE.md entirely
Replace the full content of `C:\Users\desee\OneDrive\Documents\Claude\CLAUDE.md`
with the approved final version:

```
# Global Cowork Instructions — Patrick / FindA.Sale

## Communication
- Be concise and direct. Minimal explanation unless asked.
- Professional but friendly tone.
- Report completion status clearly. Flag errors immediately.
- Do not use bullet points or headers in conversational replies — plain prose only.

## Output
- When producing code changes: diff-only. No full file rewrites unless requested.
- When creating files: save to the selected project folder so Patrick can access them.
- Confirm destructive operations before executing. Never use `git add -A`.

## Repair Loop Prevention
- Stale documentation causes wasted sessions. Treat a stale fact as a bug.
- After completing any meaningful work batch, update STATE.md and session-log.md.
- Before giving database or environment commands, load the dev-environment skill.
- Before any production deploy, load the findasale-deploy skill.

## Session Start
- Load context.md and STATE.md before starting work.
- If context.md is older than 24 hours, regenerate it: `node scripts/update-context.js`
- Run the session warmup task when environment health is unclear.

## Project Context
- Project: FindA.Sale — PWA for estate sales, yard sales, auctions, and flea market organizers.
- Stack: Next.js 14 / Express / Prisma / PostgreSQL (Neon) / pnpm workspaces. Native Windows — no Docker.
- Patrick is a non-technical project manager. Skip implementation rationale unless asked.
- Primary goal (product): Reduce organizer manual work. Every feature suggestion should serve that.
- Primary goal (process): Use the subagent fleet to reduce friction, reduce token usage, and maintain context across sessions.
- Agent fleet: invoke findasale-* skills for architecture, dev, QA, ops, and deploy — do not handle these directly.

## Safety
- Always ask before deleting files.
- Never commit .env files or secrets.
- Never use `prisma db push` in production — use `prisma migrate deploy`.
- Full safety rules: claude_docs/SECURITY.md in the project folder.
```

### 2. Install 5 updated .skill packages
In your FindaSale workspace folder you'll find 5 `.skill` files. Click each → "Copy to your skills":
- `dev-environment.skill` — self-correction clause added
- `findasale-architect.skill` — env command hard gate added
- `findasale-dev.skill` — env command hard gate added
- `findasale-deploy.skill` — 4 stale Docker commands replaced with Railway/PowerShell workflow
- `findasale-marketing.skill` — Grand Rapids scope corrected; now covers all sale types

### 3. Commit and push Sprint 3 + doc changes
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/database/prisma/schema.prisma
git add packages/backend/src/controllers/couponController.ts
git add packages/backend/src/routes/coupons.ts
git add packages/backend/src/controllers/stripeController.ts
git add packages/backend/src/index.ts
git add packages/frontend/components/CheckoutModal.tsx
git add packages/frontend/pages/shopper/purchases.tsx
git add claude_docs/CORE.md
git add claude_docs/STATE.md
git add claude_docs/strategy/BUSINESS_PLAN.md
git add claude_docs/strategy/roadmap.md
git add claude_docs/logs/session-log.md
git add claude_docs/operations/next-session-prompt.md
git commit -m "feat: Sprint 3 — Shopper Loyalty Program; scope expanded; workflow hardening"
.\push.ps1
```

### 4. Run the Coupon migration
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
# Local first (creates migration file):
$env:DATABASE_URL="postgresql://findasale:findasale@localhost:5432/findasale"
npx prisma migrate dev --name add_coupon_model
# Then Neon production:
$env:DATABASE_URL="[pooled neon url from packages/backend/.env]"
$env:DIRECT_URL="[direct neon url from packages/backend/.env]"
npx prisma migrate deploy
```
Migration #63. After it runs: update STATE.md Known Gotchas count from 62 → 63.

## What Was Completed This Session (88)

- Sprint 3 — Shopper Loyalty Program (full pipeline, 7 files, QA passed)
- CORE.md §16 — Environment Command Hard Gate
- 5 .skill packages updated (see #2 above)
- Scope expanded: estate + yard + auction + flea market, GR = beta geography only
- BUSINESS_PLAN.md (6 edits), STATE.md Constraints, roadmap.md (2 edits) updated
- Global CLAUDE.md final version approved by records + workflow
- File naming convention documented: authority docs ALL-CAPS, everything else kebab-case

## Sprint Queue

- **Sprint 3.5** — Grand Rapids code deGR-ification (~10 files, no schema change)
  Files: cloudAIService.ts, plannerController.ts, feed.ts, index.tsx, about.tsx,
  contact.tsx, map.tsx, leaderboard.tsx, plan.tsx, terms.tsx, trending.tsx,
  emailTemplateService.ts (footer review), curatorEmailJob.ts
- **Sprint 4** — Search by Item Type
- **Sprint 5** — Seller Performance Dashboard

## Patrick's Manual Beta Items (Unchanged)

1. Confirm 5%/7% fee
2. Set up Stripe business account
3. Google Search Console verification
4. Order business cards (files in `claude_docs/brand/`)
5. Start beta organizer outreach (`claude_docs/beta-launch/organizer-outreach.md`)
6. Rotate Neon credentials (recommended since session 83)

## Environment Notes

- **Neon:** 62 migrations applied. Migration #63 (`add_coupon_model`) pending (see #4 above).
- **Railway:** Healthy.
- **Sprint 3 code:** Not yet committed/pushed — Patrick runs git commands in #3 above.
- **Skills:** Use `Skill` tool for findasale-* agents — NOT `Agent` tool (returns "agent type not found").
