# Neon to Railway PostgreSQL Migration Plan

**Created:** 2026-03-24
**Status:** Planning & Research Complete — Ready for Patrick Review
**Backlog Reference:** (pending assignment)
**Estimated Migration Time:** 2–3 hours (includes verification)
**Risk Level:** Moderate (data backup + verification mitigates most risk)

---

## Executive Summary

Patrick has decided to migrate from Neon serverless Postgres ($19/month) to Railway Postgres to consolidate infrastructure and reduce costs. This plan documents every step, pre-migration checks, data transfer, configuration changes, and rollback procedures.

**Key Finding:** Railway Postgres costs approximately $0.55/month for low-traffic databases (well under Neon's $19), and supports both direct connections (for Prisma migrations) and connection pooling (PgBouncer for runtime queries).

---

## Current Architecture

| Component | Current | Provider |
|-----------|---------|----------|
| **Backend Database** | Neon Postgres Launch plan | Neon (ep-plain-sound-aeefcq1y.c-2.us-east-2.aws.neon.tech) |
| **Pooled Connection** | PgBouncer (Neon managed) | Neon |
| **Direct Connection** | Raw Postgres (Neon direct) | Neon |
| **Prisma Config** | `url` (pooled), `directUrl` (direct) | Defined in packages/database/schema.prisma |
| **Backend Hosting** | Express on Railway | Railway |
| **Frontend Hosting** | Next.js on Vercel | Vercel |
| **Dev Database** | Local Postgres (localhost:5432) | Docker or installed locally |

---

## Target Architecture

| Component | Target | Provider |
|-----------|--------|----------|
| **Backend Database** | Railway Postgres | Railway (same project as backend) |
| **Pooled Connection** | PgBouncer (optional, Railway template) | Railway |
| **Direct Connection** | Raw Postgres (Railway direct) | Railway |
| **Prisma Config** | Same `url` + `directUrl` pattern | Defined in packages/database/schema.prisma (no changes needed) |
| **Backend Hosting** | Express on Railway (unchanged) | Railway |
| **Frontend Hosting** | Next.js on Vercel (unchanged) | Vercel |
| **Dev Database** | Local Postgres (unchanged) | Docker or installed locally |

---

## Research Summary

### 1. Railway Postgres Pricing
**Source:** [Railway Pricing](https://docs.railway.com/pricing)

- **Base Plan:** Hobby ($5/month) or Pro ($20/month) includes usage credits
- **Per-Database Cost:** Approximately $0.55/month for low-traffic databases (usage-based, not per-DB fee)
- **Cost Drivers:** Memory usage > CPU > storage > network egress
- **Conclusion:** Railway Postgres is **included** in existing Railway project (no separate service fee), and usage cost is negligible (<$1/month). **Estimated savings: ~$18.50/month**.

### 2. Connection Pooling Support
**Source:** [Railway Database Connection Pooling](https://blog.railway.com/p/database-connection-pooling)

- **PgBouncer availability:** Railway offers PgBouncer as a managed template or side-by-side service
- **Setup:** Deploy the Postgres + PgBouncer template or add PgBouncer separately to existing Postgres
- **Pooled endpoint:** PgBouncer listens on port 5432 (or custom), forwards to Postgres on 5433
- **Current setup check:** Neon provides managed PgBouncer; Railway can replicate this with the same Prisma `url` + `directUrl` pattern
- **Prisma compatibility:** Full support — no code changes needed
- **Conclusion:** **No compatibility issues**. Prisma's existing dual-connection pattern will work identically.

### 3. Prisma + Railway Postgres SSL Configuration
**Source:** [Prisma SSL/TLS Documentation](https://github.com/prisma/prisma/issues/23390), [Direct Connections](https://www.prisma.io/docs/postgres/database/direct-connections)

- **Default SSL mode:** Railway Postgres requires `?sslmode=require` in connection strings
- **Prisma support:** Built-in driver supports `sslmode=require` without certificate validation issues
- **Migration impact:** Neon currently uses `?sslmode=require`; Railway will also use `?sslmode=require`
- **Gotcha avoided:** Prisma's built-in driver does NOT support `sslmode=verify-full` + `sslrootcert=system`, but Neon doesn't require this either — standard `sslmode=require` works on both
- **Conclusion:** **No SSL configuration changes needed**. Both Neon and Railway use identical SSL mode in connection strings.

---

## Pre-Migration Checklist

### Access & Permissions
- [ ] Patrick has access to Railway project dashboard (findasale team)
- [ ] Patrick has access to Neon account (database access)
- [ ] Current DATABASE_URL and DIRECT_URL credentials are documented (Patrick only)
- [ ] Current backup of Neon credentials in SECURITY.md or password manager

### Data Safety
- [ ] Neon database is not locked or under maintenance
- [ ] No active production writes during migration window (low-traffic time recommended)
- [ ] Backup of current schema.prisma is present (git HEAD)
- [ ] Backup of current packages/database/.env is present (local only, never committed)

### Testing Environment
- [ ] Local dev database is running (Docker Postgres on localhost:5432)
- [ ] Local dev connection string is verified and working
- [ ] `npx prisma db push` succeeds on local database (sanity check)
- [ ] Node.js and pnpm are current in dev environment

### Neon Snapshot
- [ ] Run `pg_dump` or equivalent to export schema + data (see steps below)
- [ ] Verify dump file is present and non-empty
- [ ] Store dump file in secure location (Patrick's desktop or encrypted drive)

---

## Migration Steps (Patrick or Ops to Execute)

### Phase 1: Export Data from Neon (1–5 minutes)

**1.1 — Connect to Neon and export**

```bash
# From a bash/terminal window with psql installed
# Use Neon's direct connection string (non-pooled)

NEON_DIRECT_URL="postgresql://neondb_owner:npg_VYBnJs8Gt3bf@ep-plain-sound-aeefcq1y.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require"

# Export full database (schema + data)
pg_dump "$NEON_DIRECT_URL" > findasale-neon-backup.sql
```

**1.2 — Verify export**
```bash
# Check file size and line count
ls -lh findasale-neon-backup.sql
wc -l findasale-neon-backup.sql

# Spot-check schema is present (should see many "CREATE TABLE" lines)
grep -c "CREATE TABLE" findasale-neon-backup.sql
```

**Expected output:** File size 5–50 MB (depending on data volume), thousands of lines, 30+ CREATE TABLE statements.

**Backup location:** Save `findasale-neon-backup.sql` to a safe location (Desktop, encrypted USB, or Patrick's secure folder).

---

### Phase 2: Set Up Railway Postgres (10–15 minutes)

**2.1 — Add Postgres to existing Railway project**

- [ ] Log in to [Railway Dashboard](https://railway.app)
- [ ] Open the findasale project
- [ ] Click "+ New" → Select "Database" → Select "PostgreSQL"
- [ ] Wait for Railway to provision the database (2–5 minutes)
- [ ] Note the generated Railway Postgres credentials (connection string will appear in the service panel)

**2.2 — Capture Railway connection strings**

Railway will auto-generate two connection strings in the Postgres service variables:

- `DATABASE_URL` (pooled, via PgBouncer if deployed) — **for runtime app queries**
- `DATABASE_URL_UNPOOLED` or similar (direct) — **for Prisma migrations**

**Alternative:** If Railway does NOT auto-provide pooling, use raw Postgres endpoints:
- Direct: `postgresql://postgres:password@internal-hostname:5432/neondb`
- If pooling needed: Deploy the Postgres + PgBouncer template separately (Railways docs: [Deploy PgBouncer](https://railway.app/deploy/OpUzwe))

**Example format (Railway Postgres):**
```
DATABASE_URL=postgresql://postgres:generatedpassword@roundhouse.proxy.rlwy.net:5432/railway?sslmode=require
DATABASE_URL_UNPOOLED=postgresql://postgres:generatedpassword@internal-hostname:5432/railway?sslmode=require
```

**2.3 — Verify Railway connection**

From a local bash terminal:
```bash
RAILWAY_DIRECT_URL="postgresql://postgres:generatedpassword@internal-hostname:5432/railway?sslmode=require"

# Test connection
psql "$RAILWAY_DIRECT_URL" -c "SELECT 1;"
```

Expected output: `(1 row)`

---

### Phase 3: Restore Data to Railway (10–15 minutes)

**3.1 — Import backup into Railway**

```bash
# Use the Railway direct connection string from Phase 2
RAILWAY_DIRECT_URL="postgresql://postgres:generatedpassword@internal-hostname:5432/railway?sslmode=require"

# First, create the database schema
psql "$RAILWAY_DIRECT_URL" < findasale-neon-backup.sql
```

**3.2 — Verify data integrity**

```bash
# Connect and verify table counts match Neon
psql "$RAILWAY_DIRECT_URL" -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';"

# Spot-check a few tables have data
psql "$RAILWAY_DIRECT_URL" -c "SELECT COUNT(*) FROM users;"
psql "$RAILWAY_DIRECT_URL" -c "SELECT COUNT(*) FROM sales;"
```

**Expected:** Table counts > 30, User and Sales rows > 0 (or appropriate for your dev/staging data).

---

### Phase 4: Update Environment Variables (5–10 minutes)

#### 4.1 — Update Railway Backend Service

In Railway dashboard:
1. Open findasale project → backend service
2. Go to "Variables" tab
3. Update (or create) these variables:
   - `DATABASE_URL` ← Use Railway pooled connection (from Phase 2)
   - `DIRECT_URL` ← Use Railway unpooled/direct connection (from Phase 2)
4. Save changes (Railway auto-restarts backend)

**Example values:**
```
DATABASE_URL=postgresql://postgres:password@roundhouse.proxy.rlwy.net:5432/railway?sslmode=require
DIRECT_URL=postgresql://postgres:password@internal-hostname:5432/railway?sslmode=require
```

#### 4.2 — Update Vercel Frontend Environment

Vercel frontend needs `NEXT_PUBLIC_API_URL` or similar to point to the backend. If the backend URL changed, update it in:

1. Vercel dashboard → findasale-frontend project
2. Settings → Environment Variables
3. Verify `NEXT_PUBLIC_API_URL` or custom backend endpoint (should not change if Railway backend service name is unchanged)

**Typical case:** Backend URL remains unchanged (Railway internal routing), so **no Vercel changes needed**.

#### 4.3 — Update Local Dev (.env)

In `packages/database/.env` (local, never committed):
```bash
DATABASE_URL=postgresql://findasale:findasale@localhost:5432/findasale
DIRECT_URL=postgresql://findasale:findasale@localhost:5432/findasale
```

**No changes needed** — this is local dev and stays on localhost.

---

### Phase 5: Run Prisma Migration & Generate (5–10 minutes)

**5.1 — Regenerate Prisma client (mandatory)**

```bash
cd /path/to/packages/database

# Regenerate client with new schema from Railway
npx prisma generate
```

This ensures TypeScript types match the Railway schema exactly.

**5.2 — Verify migration is not needed**

```bash
# Check if schema is in sync (should report no pending migrations)
npx prisma migrate status
```

Expected output: `Everything is up to date! No pending migrations.`

If migrations are pending, this indicates a schema drift. See "Rollback & Recovery" section.

---

### Phase 6: Smoke Test Backend & Frontend (10–15 minutes)

#### 6.1 — Test Backend Health

```bash
# SSH into Railway backend or curl the health endpoint
curl https://findasale-backend.railway.app/health

# Or from local dev:
curl http://localhost:3001/health
```

Expected: `{ "status": "ok" }`

#### 6.2 — Test Frontend + API Integration

1. Open https://finda.sale in browser
2. Navigate to key pages (home, listings, organizer dashboard)
3. Test read operations (load sales, user profile)
4. Test write operations (favorite sale, create comment)
5. Monitor browser console for errors

#### 6.3 — Monitor Backend Logs

In Railway dashboard → findasale backend service → Logs tab:
- Check for connection errors
- Check for query errors
- Verify no timeout warnings

#### 6.4 — Database Connection Verification

From local dev:
```bash
cd packages/backend

# If backend uses Prisma Client, test a query
npx ts-node -e "import { prisma } from '@findasale/database'; prisma.user.count().then(c => console.log('Users:', c));"
```

Expected: Connection succeeds, returns user count.

---

## Rollback & Recovery Plan

If any phase fails, follow this escalation path:

### Immediate (within 15 minutes of failure)

1. **Do not retry failed phase** — log the exact error and stop work
2. **Check Railway service status** — verify Postgres is running and healthy
3. **Verify Neon database is still online** — current production DB is untouched
4. **Revert Railway DATABASE_URL** to previous value if you changed it mid-test

### Rollback Scenario: Data Import Failed

**Symptoms:** Foreign key errors, constraint violations, or partial import

1. Delete the Railway Postgres database (Railway dashboard → Service → Delete)
2. Wait 30 seconds, then recreate: "+ New" → Database → PostgreSQL
3. Retry Phase 3 (data restore) or escalate to Patrick with the error log

### Rollback Scenario: Backend Fails to Connect

**Symptoms:** Backend logs show "connection refused" or "permission denied"

1. Verify `DATABASE_URL` and `DIRECT_URL` are correct in Railway Variables
2. Verify connection strings include `?sslmode=require`
3. Test connection manually: `psql "$DATABASE_URL" -c "SELECT 1;"`
4. If manual test fails, revert `DATABASE_URL` to Neon value in Railway (backend will reconnect to Neon automatically)

### Rollback Scenario: Frontend Broken After Migration

**Symptoms:** Page load errors, API 5xx responses

1. Check backend logs for query errors specific to the new schema
2. Run `npx prisma generate` again to resync types
3. Redeploy frontend: Vercel dashboard → Deployments → Redeploy latest
4. If still broken, revert `DATABASE_URL` in Railway and redeploy

### Full Abort (Return to Neon)

If migration cannot proceed:

1. Keep Railway Postgres running (don't delete it yet)
2. Revert `DATABASE_URL` and `DIRECT_URL` in Railway backend service to the original Neon values
3. Redeploy backend: Wait for Railway auto-restart or manually trigger
4. Verify backend reconnects to Neon via logs
5. Document the failure in STATE.md and escalate to Patrick
6. Railway Postgres can be deleted later or kept as a hot standby

---

## Post-Migration Verification Checklist

After Phase 6 smoke tests pass, complete final checks:

### Data Integrity
- [ ] Row counts match Neon (spot-check 5–10 tables)
- [ ] Foreign key relationships are intact (no orphaned records)
- [ ] Indexes are present and functional (run `ANALYZE` on Railway)
- [ ] No constraint violations in application logs

### Performance
- [ ] Query latency on Railway is acceptable (< 200ms median)
- [ ] Backend memory/CPU is stable (check Railway metrics)
- [ ] No connection pool exhaustion warnings

### Application Functionality
- [ ] User login works
- [ ] Create sale / create listing works
- [ ] Search and filtering works
- [ ] API endpoints respond within normal latency
- [ ] No 5xx errors on critical paths
- [ ] Email / notification systems work (if applicable)

### Cleanup
- [ ] Delete Neon database (optional, can wait until post-mortem confirms all is well)
- [ ] Cancel Neon subscription
- [ ] Document final costs in project budget
- [ ] Archive `findasale-neon-backup.sql` securely

---

## Timeline Estimate

| Phase | Task | Duration | Notes |
|-------|------|----------|-------|
| **Pre** | Checklist & backup | 15 min | Verify all access, run pg_dump |
| **1** | Export from Neon | 5 min | Depends on DB size |
| **2** | Set up Railway Postgres | 15 min | Includes provisioning wait |
| **3** | Restore to Railway | 15 min | Depends on DB size |
| **4** | Update env vars | 10 min | Railway + Vercel + local |
| **5** | Prisma regenerate | 5 min | Quick TypeScript sync |
| **6** | Smoke tests | 15 min | Manual testing + logs |
| **Post** | Verification + cleanup | 20 min | Final checks + archiving |
| **TOTAL** | | **2–3 hours** | Includes wait times, manual testing |

---

## Known Risks & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|-----------|
| **Data loss during import** | Low | Critical | Backup SQL file on local disk, test import on staging first |
| **Connection string format mismatch** | Low | High | Verify Railway format includes `?sslmode=require` and hostname is correct |
| **Foreign key constraints fail on import** | Low | High | Use `pg_dump --no-acl` to avoid permission issues; drop and recreate if needed |
| **PgBouncer not available on Railway** | Medium | Medium | Fallback: Use raw Postgres endpoint (slight increase in connection overhead) |
| **SSL certificate validation fails** | Low | High | Ensure `?sslmode=require` (not `verify-full`); Prisma's default supports this |
| **Backend timeout during migration** | Low | Medium | No production traffic during migration window; brief downtime acceptable |
| **Prisma type sync issues** | Low | Medium | Run `npx prisma generate` after restore; rebuild frontend if needed |
| **Neon not deleted, double billing** | High | Low | Add reminder to cancel Neon subscription after 1 week of successful Railway operation |

---

## Decision Gates for Patrick

**Gate 1: Pre-Migration Approval**
- [ ] Patrick confirms backup is complete and safe
- [ ] Patrick approves low-traffic migration window
- [ ] Patrick has read this plan and agreed to timeline

**Gate 2: Post-Smoke-Test Approval**
- [ ] Patrick or designated tester confirms functionality works
- [ ] Patrick approves deletion of Neon database (if desired)
- [ ] Patrick authorizes cancellation of Neon subscription

---

## Appendix: Command Reference

### Export Neon
```bash
pg_dump "postgresql://neondb_owner:npg_VYBnJs8Gt3bf@ep-plain-sound-aeefcq1y.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require" > findasale-neon-backup.sql
```

### Import Railway
```bash
psql "postgresql://postgres:PASSWORD@HOSTNAME:5432/DATABASE?sslmode=require" < findasale-neon-backup.sql
```

### Test Connection
```bash
psql "postgresql://postgres:PASSWORD@HOSTNAME:5432/DATABASE?sslmode=require" -c "SELECT 1;"
```

### Regenerate Prisma
```bash
cd packages/database && npx prisma generate
```

### Check Migration Status
```bash
cd packages/database && npx prisma migrate status
```

---

**Document Status:** Complete — Ready for Patrick Review & Execution
**Next Step:** Patrick reviews, schedules migration window, and executes phases 1–6 in order.
