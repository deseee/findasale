# Daily Friction Audit — 2026-04-09
AUTO-DISPATCH from daily-friction-audit (scheduled task, 3:38am M-F)
Handled by: main session (findasale-friction-audit)

---

## Summary

2 P1 findings, 2 P2 findings, 3 P3/informational findings. One P1 requires Patrick action (push + migration). One P1 is a recurring skill staleness bug that has been flagged 3 times without a fix.

---

## Findings

### P1 — S420 Batch 2 NOT PUSHED (deployment-gap)

**Finding:** STATE.md explicitly documents "S420 Batch 2 (NOT YET PUSHED)" — 7 files containing XP sink endpoints, schema changes, and the new migration are sitting uncommitted in the VM, not on GitHub.

**Affected files:**
- `packages/database/prisma/schema.prisma` — customMapPin + showcaseSlots + UserShowcase model
- `packages/database/prisma/migrations/20260408_add_xp_sinks_showcase_mappin/migration.sql` — NEW
- `packages/backend/src/services/xpService.ts` — 4 new sinks
- `packages/backend/src/controllers/trailController.ts` — 100 XP gate on trail creation
- `packages/backend/src/routes/users.ts` — 4 new endpoints (custom-map-pin, showcase)
- `packages/frontend/pages/shopper/hunt-pass.tsx` — 3 new sink rows
- `claude_docs/feature-notes/ADR-guild-crew-creation-S420.md` — NEW

**Risk:** The Hunt Pass page references XP sink rows (Custom Map Pin, Profile Showcase Slot, Treasure Trail Sponsor) that require the migration and backend endpoints. These are blocked in dev until pushed. The migration (`20260408_add_xp_sinks_showcase_mappin`) also needs to run against Railway before the new UserShowcase/customMapPin fields can be used.

**Patrick action required:** Push Batch 2 in the next session, then run:
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

**Category:** deployment-gap
**Severity:** P1
**Suggested agent:** Main session surfaces to Patrick at next session start

---

### P1 (RECURRING) — dev-environment skill has stale Neon references (skill-staleness)

**Finding:** The `dev-environment` skill (at `/sessions/.../mnt/.claude/skills/dev-environment/SKILL.md`) still contains 8+ references to "Neon" as the production database. The database was migrated to Railway PostgreSQL in S264. This skill has been flagged as P1 in:
- power-user-sweep-2026-03-30.md (QW-1)
- power-user-sweep-2026-04-06.md (QW-1, marked "STILL NOT FIXED SINCE S264")
- This audit (2026-04-09, third flag)

**Active lines found:**
- Line 48: "For Neon (production): Find the commented line `# DATABASE_URL=postgresql://neondb`"
- Line 100: References Neon as production DB
- Lines 104, 106, 119, 141, 143, 145, 183, 217: All reference Neon URLs, credentials, migrate deploy instructions

**Risk:** Any agent loading dev-environment and following its DB instructions will look for Neon credentials that don't exist, potentially running migrations against a non-existent endpoint or the wrong DB.

**Category:** skill-staleness — correctness bug
**Severity:** P1 (recurring — 3rd flag)
**Suggested fix:** Update SKILL.md to replace all Neon references with Railway PostgreSQL. The correct connection string pattern is `postgresql://postgres:[password]@maglev.proxy.rlwy.net:13949/railway`. Skill update requires: edit SKILL.md, package as .skill zip, Patrick installs via Cowork UI (per CLAUDE.md §10 skill update protocol).
**Dispatch:** findasale-records to prepare the corrected SKILL.md; Patrick to re-package and install

---

### P2 — Roadmap staleness growing (doc-staleness)

**Finding:** Yesterday's audit (2026-04-08) added a v102 header note covering S413–S416. Since that audit ran, sessions S418, S419, S420, S421, and S422 have ALL shipped significant new features. The roadmap is now 9+ sessions stale at the row level (S413–S422 have no row-level entries).

**Sessions shipped since last roadmap row update (S412):**
| Session | Key Feature | Roadmap update? |
|---------|-------------|----------------|
| S413 | Nav audit, orphan cleanup, AI terminology | v101 row update only |
| S414 | eBay category picker, map UX spec | None |
| S415 | Tech debt Phase 1+2, account deletion | None |
| S416 | Map MVP, integration tests, pricing transparency, PRO nudge | None |
| S418 | Hunt Pass staleness audit, exchange-rate calibration, coupon system | None |
| S419 | BoostPurchase dual-rail, Lucky Roll spec | None |
| S420 | Lucky Roll full build, XP sinks (Custom Map Pin, Showcase, Treasure Trail Sponsor) | None |
| S421 | POS Send-to-Phone bug fix | None |
| S422 | POS split payment, dark mode, rate limit fixes | None |

**Category:** doc-staleness
**Severity:** P2
**Suggested dispatch:** findasale-records at next Patrick session to run roadmap update pass for S413–S422 features

---

### P2 — S421 Stripe Connect webhook not yet configured (ops-gap)

**Finding:** STATE.md documents a required Stripe Dashboard action from S421: "Configure Connect webhook in Stripe Dashboard" pointing to `payment_intent.succeeded` on connected accounts. Without this, POS sales will not mark items SOLD or create Purchase records after payment. This is a Patrick-only action (Stripe Dashboard UI) that is documented in STATE.md but has no visibility in patrick-dashboard.md.

**Required action:**
- URL: `https://backend-production-153c9.up.railway.app/api/webhooks/stripe`
- Listen to: Events on Connected accounts
- Event: `payment_intent.succeeded`
- Copy signing secret → Railway env var `STRIPE_CONNECT_WEBHOOK_SECRET`

**Note:** Backend also needs a handler update (separate webhook secret for Connect events). This is a half-done feature — the webhook infrastructure isn't complete without the handler update.

**Category:** ops-gap / incomplete-feature
**Severity:** P2
**Suggested dispatch:** findasale-ops + findasale-dev to spec the handler update; Patrick to configure webhook after

---

### P3 — New TODO in luckyRollController.ts (code-quality, informational)

**Finding:** S420 introduced a new `TODO` comment in `packages/backend/src/controllers/luckyRollController.ts`:
```
// TODO: Send notification to user with coupon code
```
Context exists, no owner. Routine cleanup when coupon notification system is built.

**Category:** code-quality — informational
**Severity:** P3
**Action:** None taken. Queue for when notification system is touched.

---

### P3 — next-session-brief.md still not archived (doc-staleness)

**Finding:** `claude_docs/next-session-brief.md` contains S199 content (from ~2026-03-18, 200+ sessions ago). Flagged in power-user-sweep-2026-04-06 (QW-2) as "could cause context confusion if loaded." Still present.

**Category:** doc-staleness
**Severity:** P3
**Action:** None taken (Patrick not present). Flag for findasale-records at next session.

---

## Health Checks

| Check | Result |
|-------|--------|
| STATE.md freshness | ✅ Updated S422 (2026-04-08) |
| patrick-dashboard.md freshness | Not checked (file too large to read in this context budget) |
| CLAUDE.md file references | ✅ No new 404 file references detected |
| STACK.md | ✅ Current — Railway PostgreSQL, Vercel, pnpm monorepo all match active stack |
| decisions-log.md | ✅ Most recent entry 2026-04-08 (S413 decision). No entries >3 months old detected (oldest scanned entries are 2026-03-09+) |
| Merge conflicts | ✅ No conflict markers found |
| TypeScript errors | ✅ All recent sessions (S415, S416, S420, S421, S422) confirm zero TS errors at handoff |
| Inline code TODOs | ✅ 13 known tracked TODOs (same set as prior audits + 1 new in luckyRollController.ts). No new P0/P1 blockers. |
| Blocked/Unverified Queue | ℹ️ 9 items tracked; all have valid reasons. No new items added from this scan. |
| Active skill count | ✅ 34 skills installed and present |
| dev-environment skill (Neon refs) | ❌ STILL STALE — 8+ Neon references. P1 recurring. Not fixed after 2 prior flags. |

---

## Dispatch Blocks

### DISPATCH 1 — findasale-records: Fix dev-environment SKILL.md (P1 — recurring)

**Task:** Update `dev-environment` SKILL.md to remove all Neon references and replace with Railway PostgreSQL instructions.

**Context files:**
- `/sessions/.../mnt/.claude/skills/dev-environment/SKILL.md` — active skill with stale Neon refs
- `claude_docs/improvement-memos/power-user-sweep-2026-04-06.md` — prior flag QW-1 with proposed fix
- CLAUDE.md §6 (Schema Change Protocol) — has correct Railway connection string pattern

**Locked decisions:**
- Database: Railway PostgreSQL at `maglev.proxy.rlwy.net:13949/railway` (since S264, locked)
- Neon is decommissioned — `ep-plain-sound-aeefcq1y.c-2.us-east-2.aws.neon.tech` must not appear anywhere

**Constraints:**
- Skill file is at `/sessions/.../mnt/.claude/skills/dev-environment/SKILL.md` (read-only in active session per CLAUDE.md §10)
- Update requires edit + package as .skill zip + Patrick install via Cowork UI
- Output a corrected SKILL.md file that Patrick can use to create the updated .skill package

**Acceptance criteria:**
- Zero "Neon" references in SKILL.md
- Railway connection string pattern documented correctly
- `migrate deploy` instructions use `$env:DATABASE_URL=` override with Railway URL
- "Never use Neon URL" warning present

**Tag:** AUTO-DISPATCH from daily-friction-audit

---

### DISPATCH 2 — Surfaces to Patrick at next session start

**Items requiring Patrick action:**

1. **S420 Batch 2 push + migration** — 7 files unpushed. See STATE.md for full list and migration commands.

2. **S421 Stripe Connect webhook** — Configure in Stripe Dashboard. Required before POS sales mark items SOLD. See STATE.md "S421 Ops action needed" section.

3. **Roadmap row-level update pass (S413–S422)** — 9 sessions of shipped features need roadmap rows. Dispatch findasale-records when Patrick is present.

---

## Files Updated This Run

| File | Type |
|------|------|
| `claude_docs/health-reports/friction-audit-2026-04-09.md` | New audit report |

No Tier 1 changes. No roadmap edits (row-level updates require Patrick present per yesterday's audit finding).
