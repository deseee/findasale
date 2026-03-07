# Next Session Resume Prompt
*Written: 2026-03-07T05:30:00Z*
*Session ended: normally*

## Resume From

Restore `--frozen-lockfile` in Dockerfile.production: run `pnpm install` locally to regenerate a clean lockfile, commit both `Dockerfile.production` and `pnpm-lock.yaml`, push via `.\push.ps1`.

## What Was In Progress

- **Dockerfile.production** — still on `--no-frozen-lockfile` (emergency escape hatch). Must be reverted. Steps:
  1. Patrick runs `pnpm install` from monorepo root
  2. `git add packages/backend/Dockerfile.production pnpm-lock.yaml`
  3. `git commit -m "fix: restore --frozen-lockfile after uuid removal cleanup"`
  4. `.\push.ps1`

## What Was Completed This Session (86)

- Production outage resolved: ERR_REQUIRE_ESM from `uuid@13.0.0` → `crypto.randomUUID()` in wishlistController + userController
- Railway lockfile unblocked via `--no-frozen-lockfile` Dockerfile change (commit d77dcbd)
- Organizer.website schema drift fixed: migration `20260307000038_add_organizer_website` applied to Neon (62 total)
- Workflow audit: 8 recoverable wasted turns documented, 5 root causes identified
- Self-healing entries #41–45 added (commit aec2521b)
- CORE.md lockfile co-commit rule (commit 9ce4a620)
- session-safeguards.md Production Startup Failures section (commit a2c152de)

## Patrick's Manual Items (Unchanged — Still Block Beta Launch)

1. Confirm 5%/7% fee
2. Set up Stripe business account
3. Google Search Console verification
4. Order business cards (files in `claude_docs/brand/`)
5. Start beta organizer outreach (`claude_docs/beta-launch/organizer-outreach.md`)
6. Rotate Neon credentials (recommended since session 83)

## Environment Notes

- **Neon:** 62 migrations applied. No pending migrations.
- **Railway:** Online and healthy on port 5000.
- **Patrick's local repo is behind GitHub** — run `git fetch origin` then `git merge origin/main --no-edit` before any local commits (or just `.\push.ps1`).
- **GitHub commits this session (all MCP):** 74797533, d77dcbd, dbc812d, 9ce4a620, a2c152de, aec2521b, ee380ff1
- **context.md** — 690 lines, over 500-line threshold. Flag for trim at next maintenance session.

## Next Features (After Dockerfile Fix)

1. AI sale description writer (80% infra in cloudAIService.ts, est. 1–2 sprints)
2. Branded social sharing templates (1 sprint)

Full research: `claude_docs/research/feature-research-2026-03-06.md`
