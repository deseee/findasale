# Self-Healing Skills — FindA.Sale

Documented patterns for bugs that have recurred ≥2 times. When a matching trigger
appears, apply the fix directly without investigation.

---

## Pattern 1: Railway Stuck / Not Rebuilding

**Trigger:** Railway hasn't picked up recent commits, looping on stale error, or build seems hung.
**Environment:** Railway (backend deployment)
**Pattern:** Railway caches Docker layers aggressively. A stale layer can block a rebuild indefinitely.
**Known instances:** S165, S185, S188, multiple others
**Steps:**
1. Push a trivial change to `packages/backend/Dockerfile.production` — update the cache-bust comment at line 1 with today's date: `# S[N] — cache bust YYYY-MM-DD`
2. Use `mcp__github__push_files` for the single-file push
3. Railway picks up the commit and rebuilds from scratch
**Edge Cases:** Do NOT ask Patrick to check webhooks or GitHub settings — this always fixes it.
**Confidence:** 100% — seen every session since S165

---

## Pattern 2: prisma migrate deploy Runs Against Localhost

**Trigger:** Migration runs but Neon doesn't reflect the new column/table. Prod gets P2022 (column not found).
**Environment:** Windows PowerShell, packages/database/
**Pattern:** `packages/database/.env` points to localhost. Running `npx prisma migrate deploy` without overriding DATABASE_URL silently runs against localhost, leaving Neon out of sync.
**Known instances:** S185 (tokenVersion), recurring pattern
**Steps:**
1. Always prepend `$env:DATABASE_URL="postgresql://neondb_owner:npg_VYBnJs8Gt3bf@ep-plain-sound-aeefcq1y.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require"` before `npx prisma migrate deploy`
2. Use the non-pooled hostname (no `-pooler` suffix) — Prisma requires direct connection for migrations
3. Run `npx prisma generate` after `migrate deploy`
**Edge Cases:** Never run `prisma db push` in production — only `prisma migrate deploy`
**Test Command:** `npx prisma migrate status` (should show all applied)
**Confidence:** 100%

---

## Pattern 3: DATETIME Type in PostgreSQL Migrations

**Trigger:** Migration fails with `ERROR: type "datetime" does not exist` (PostgreSQL error 42704)
**Environment:** Neon PostgreSQL (any migration)
**Pattern:** LLM-generated migration SQL sometimes uses MySQL's `DATETIME` type, which doesn't exist in PostgreSQL.
**Known instances:** S190 — affected migrations 001700 (fraud), 001800 (passkey), 002000 (hubs)
**Steps:**
1. Find all occurrences: `grep -rn "DATETIME" packages/database/prisma/migrations/`
2. Replace with `TIMESTAMPTZ`: `sed -i 's/DATETIME/TIMESTAMPTZ/g' [file]`
3. Run `prisma migrate resolve --rolled-back [migration_name]` if the migration already failed
4. Re-run `prisma migrate deploy`
**Edge Cases:** Check all remaining migrations before re-deploying — DATETIME may appear in multiple files.
**Confidence:** 100%

---

## Pattern 4: Duplicate Index Name (Inline UNIQUE + Explicit CREATE UNIQUE INDEX)

**Trigger:** Migration fails with `ERROR: relation "[TableName_field_key]" already exists` (PostgreSQL error 42P07)
**Environment:** Neon PostgreSQL
**Pattern:** Column defined with inline `UNIQUE` constraint creates an index named `TableName_field_key`. If the migration also has an explicit `CREATE UNIQUE INDEX "TableName_field_key"`, the second statement fails because the index already exists from the inline constraint.
**Known instances:** S190 — TreasureTrail.shareToken (`VARCHAR(32) UNIQUE` + `CREATE UNIQUE INDEX "TreasureTrail_shareToken_key"`)
**Steps:**
1. Find the column with inline UNIQUE and also a matching explicit CREATE UNIQUE INDEX
2. Remove the `UNIQUE` keyword from the inline column definition
3. Keep the explicit `CREATE UNIQUE INDEX IF NOT EXISTS` statement
4. Add `IF NOT EXISTS` to ALL `CREATE INDEX` and `CREATE UNIQUE INDEX` statements in the migration as a general guard
5. Resolve and re-deploy: `prisma migrate resolve --rolled-back [name]` then `prisma migrate deploy`
**Edge Cases:** Also add `DROP TABLE IF EXISTS` guards for partially-applied migrations — the table may have been created before the duplicate index error fired.
**Confidence:** 100%

---

## Pattern 5: Partially-Applied Migration Leaves Stale Tables

**Trigger:** Migration fails mid-run (e.g., FK type mismatch, DATETIME error, duplicate index). On retry after resolve, fails again because the table was partially created in the first attempt.
**Environment:** Neon PostgreSQL
**Pattern:** When a CREATE TABLE succeeds but a subsequent statement (FK, index, constraint) fails, the table exists in Neon but Prisma thinks the migration was rolled back. Re-running the migration tries to CREATE TABLE again and fails with "relation already exists."
**Known instances:** S190 — UGCPhoto (itemId type mismatch), FraudSignal (DATETIME), TreasureTrail (duplicate index)
**Steps:**
1. Add `DROP TABLE IF EXISTS "TableName"` as the FIRST statement in the migration (before CREATE TABLE)
2. For tables with dependents, drop child tables first: `DROP TABLE IF EXISTS "ChildTable"; DROP TABLE IF EXISTS "ParentTable";`
3. For enum types, add `DROP TYPE IF EXISTS "EnumName"` before `CREATE TYPE`
4. Re-run `prisma migrate resolve --rolled-back [name]` then `prisma migrate deploy`
**Edge Cases:** DROP TABLE cascades drop associated indexes — safe to drop and recreate. Always add `IF NOT EXISTS` to CREATE INDEX statements as a secondary guard.
**Confidence:** 100%

---

## Pattern 6: ERR_PNPM_OUTDATED_LOCKFILE on Railway

**Trigger:** Railway deploy fails with `ERR_PNPM_OUTDATED_LOCKFILE`
**Environment:** Railway (production), pnpm workspaces
**Pattern:** A `package.json` was modified to add a dependency, but `pnpm install` wasn't run locally before committing, so `pnpm-lock.yaml` is out of sync.
**Known instances:** S188, S190
**Steps:**
1. Run `pnpm install` from repo root on Windows: `cd C:\Users\desee\ClaudeProjects\FindaSale && pnpm install`
2. Stage the updated lockfile: `git add pnpm-lock.yaml`
3. Include it in the next commit before pushing
**Edge Cases:** If `acorn-import-attributes` package.json is corrupt (ERR_PNPM_JSON_PARSE warning), this is a non-fatal warning — pnpm install still completes. Don't retry.
**Confidence:** 100%

---

## Pattern 7: S192-Style New-Page Type Errors (Auth, SSR, Component Props)

**Trigger:** Vercel build fails on new pages added by a large wave-build session with TypeScript errors referencing non-existent modules, wrong auth patterns, or wrong component prop names.
**Environment:** Vercel (Next.js frontend build)
**Pattern:** AI-generated wave builds commonly introduce a cluster of the same errors across multiple new pages. Fixing one at a time is slow — do a proactive full scan first.
**Known instances:** S192 (15+ pages), S193 (recovery)
**Steps:**
1. **Do NOT fix one error per Vercel build cycle.** Run a proactive scan across all new/modified pages first.
2. Check for `hooks/useAuth` imports → must be `import { useAuth } from '../../components/AuthContext'` (depth varies)
3. Check for `useSession` from `next-auth/react` → app uses custom `useAuth`, not NextAuth
4. Check `user.organizerId` references → correct field is `user.id`
5. Check `AuthContextType` destructure: `isLoading` not `loading`
6. Check `<EmptyState>` props: `heading`/`subtext`/`cta` — NOT `title`/`description`/`action`
7. Check `<Layout>` props: only accepts `{ children }` — no `title` prop; titles go in `<Head>` from `next/head`
8. Check `Skeleton` import: default import only (`import Skeleton from '...'`, NOT `import { Skeleton }`)
9. Check for synchronous `router.push()` at component top level → must be inside `useEffect`; also move all hooks BEFORE any conditional returns
10. Batch fixes by file grouping (≤3 files per MCP push) and push to GitHub
**Edge Cases:** `tsc --skipLibCheck` locally does NOT catch these errors — Next.js plugin + module resolution differ. Only Vercel build output is authoritative.
**Confidence:** 100%
