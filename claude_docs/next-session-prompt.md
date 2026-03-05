# Next Session Resume Prompt
*Written: 2026-03-05 (session 52 — Opus research)*
*Session ended: normally*

## Resume From

Two tracks available. Patrick chooses priority:

**Track A (Feature):** Sprint I — Phase 19 (Hunt Pass + shopper points). Full spec below.

**Track B (Workflow):** Build stress test suite skill + pre-commit validation skill from the Workflow & Infrastructure track in roadmap. Both are Sonnet-tier.

## What Was Completed This Session (52)

- **model-routing.md** — Decision matrix for Opus/Sonnet/Haiku session and sub-agent routing. Target: 60% Sonnet / 30% Haiku sub-agents / 10% Opus.
- **patrick-language-map.md** — Maps Patrick's common short commands ("check", "note", "ok", "wrap", "similar", etc.) to expected Claude actions. Reduces clarification round-trips.
- **session-safeguards.md** — Circuit breakers: 3 fix attempts per error, 2 rewrites per file per turn. Defenses for write-before-read, PowerShell syntax, Prisma non-interactive, MCP push overflow, Vercel deploy budget.
- **CORE.md §11–§13** — New sections referencing model-routing, session-safeguards, and language map.
- **self_healing_skills.md #21–#24** — PowerShell syntax confusion, Prisma non-interactive, repair loop halt, write-before-read defense.
- **Scheduled tasks:** `weekly-industry-intel` (Mondays 9am), `context-freshness-check` (daily 8am).
- **roadmap.md** — Added Workflow & Infrastructure track (parallel, no sprint slot).

## What Was NOT Done (Queued for Sonnet)

- **Stress test suite skill** — Schema drift detection, dead code scanning, stale doc detection. Build as a scheduled or on-demand skill.
- **Pre-commit validation skill** — Lint, type-check, test, schema validate, security audit. Runs before any GitHub push.
- **Uptime monitoring setup** — Needs Patrick to sign up for StatusGator or UptimeRobot (free tier). Then Claude creates the investigation task.
- **Sentry MCP** — Needs Patrick to create Sentry project. Then Claude connects the MCP.
- **Ollama embedding service** — Deferred to post-Phase 29 when search improvements land.

## New Files to Load (if relevant)

- `claude_docs/model-routing.md` — Consult before choosing sub-agent models
- `claude_docs/session-safeguards.md` — Consult when stuck or looping
- `claude_docs/patrick-language-map.md` — Consult when interpreting short Patrick commands

## Environment Notes

- **Vercel redeploy still pending** — rate-limited since session 47.
- **Phase 31 OAuth dormant** — env vars not yet in Vercel.
- Railway backend: healthy. GitHub MCP active.

---

## Sprint I — Phase 19: Hunt Pass + Shopper Points

### Schema (do first — requires Neon migration)

`User.points` (Int, default 0) already exists. Add to `schema.prisma`:

```prisma
model PointsTransaction {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  type        String   // "VISIT", "FAVORITE", "PURCHASE", "SHARE", "REVIEW"
  points      Int
  saleId      String?
  itemId      String?
  description String?
  createdAt   DateTime @default(now())
}
```

Also add relation to User: `pointsTransactions PointsTransaction[]`

Migration name: `phase19_points_transaction`

### Points Earning Rules

| Action | Points |
|--------|--------|
| Visit sale detail page | 1 pt (once per sale per day) |
| Favorite an item | 2 pts |
| Purchase an item | 10 pts |
| Leave a review | 5 pts |
| Share a sale | 3 pts |

### Backend — new files/edits

1. **`packages/backend/src/services/pointsService.ts`** (new)
   - `awardPoints(userId, type, points, saleId?, itemId?, description?)`
   - Wraps `prisma.pointsTransaction.create` + `prisma.user.update({ points: { increment: points } })`

2. **`packages/backend/src/routes/points.ts`** (new)
   - `GET /api/points` — returns `{ points, tier, transactions[] }` for auth'd user
   - `POST /api/points/track-visit` — body: `{ saleId }` — awards 1pt (idempotent: check for existing VISIT transaction for saleId today)

3. **`packages/backend/src/index.ts`** — add `app.use('/api/points', pointsRoutes)`

4. **`packages/backend/src/controllers/itemController.ts`** — in `purchaseItem`: fire-and-forget `pointsService.awardPoints(userId, 'PURCHASE', 10, saleId, itemId)`

5. **`packages/backend/src/controllers/saleController.ts`** — in favorite/unfavorite: award/deduct 2pts

### Frontend — new files/edits

1. **`packages/frontend/components/PointsBadge.tsx`** (new) — small amber badge showing points
2. **`packages/frontend/pages/profile.tsx`** (edit) — points card + transactions + tier label
3. **`packages/frontend/hooks/usePoints.ts`** (new) — fetch wrapper for GET /api/points
4. **`packages/frontend/components/BottomTabNav.tsx`** (edit) — PointsBadge in Profile tab
5. **`sales/[id].tsx`** — fire POST /api/points/track-visit on page load

---

## Sonnet Workflow Tasks (if Track B chosen)

### Stress Test Suite Skill
Create a skill at `.skills/skills/stress-test/SKILL.md` that:
1. Checks Prisma schema against controller field usage (drift detection)
2. Finds unreferenced exports in packages/ (dead code)
3. Compares STATE.md timestamps against session-log (staleness)
4. Runs `npm audit` for dependency vulnerabilities
5. Outputs a report to `claude_docs/health-reports/stress-test-{date}.md`

### Pre-Commit Validation Skill
Create a skill that runs deterministic checks before any GitHub push:
1. TypeScript compilation (`tsc --noEmit`)
2. No console.log in production paths
3. All mutation routes have auth middleware
4. All findMany have take limits
5. New env vars in .env.example
