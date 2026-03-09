# TROUBLESHOOTING & RECOVERY

Operational procedures only. For pattern-based fixes, see `self_healing_skills.md`.

---

## Decision Trees

Three critical production failure scenarios with explicit action paths.

### 1. Railway Backend Crash (500s / Won't Start)

**Symptom:** Backend HTTP endpoints return 500, or `pnpm --filter backend run dev` fails with error on startup.

**IF** error appears in console during startup:
- 🤖 SAFE-TO-AUTO: Check backend logs for exact error message (CircularDependencyError, ENOENT, parse error, etc.)
- 🤖 SAFE-TO-AUTO: If error is "Cannot find module" → run `cd packages/backend && pnpm install`
- 🤖 SAFE-TO-AUTO: If error is "ENOENT .env.local" → verify `.env.local` exists with DATABASE_URL set
- 👤 NEEDS-PATRICK: If error persists → post logs in Slack, await guidance before attempting fixes

**IF** backend starts but returns 500 on API calls:
- 🤖 SAFE-TO-AUTO: Check backend application logs (if Railway connected) for stack trace
- 🤖 SAFE-TO-AUTO: If error is Prisma schema mismatch → run `cd packages/database && npx prisma generate`
- 🤖 SAFE-TO-AUTO: If error is unhandled route → check server.ts for missing endpoint definition
- 👤 NEEDS-PATRICK: If error is database-level (UNIQUE constraint, foreign key, etc.) → post to Slack with full stack trace; do not attempt rollback without approval

**IF** deployment to Railway succeeds but production endpoint 500s:
- 👤 NEEDS-PATRICK: Environment variables differ between local and Railway → request Railway dashboard review and Slack confirmation before redeploying

---

### 2. Neon Database Unreachable (Connection Timeout / Migration Failure)

**Symptom:** Prisma logs "timeout at socket creation" or "ECONNREFUSED", migration hangs, or health check fails.

**IF** local dev (`pnpm --filter backend run dev`):
- 🤖 SAFE-TO-AUTO: Verify PostgreSQL is running locally (`psql -U postgres -c "SELECT version();"`)
- 🤖 SAFE-TO-AUTO: If offline → Open Windows Services → PostgreSQL → Restart
- 🤖 SAFE-TO-AUTO: Verify `.env.local` DATABASE_URL points to `localhost:5432`, not Neon
- 👤 NEEDS-PATRICK: If PostgreSQL restarts don't resolve timeout → request Docker Desktop restart or system reboot

**IF** local dev connects to Neon (staging/test database):
- 🤖 SAFE-TO-AUTO: Check Neon dashboard: is database online? (region, active connections)
- 🤖 SAFE-TO-AUTO: Test connection string manually: `psql postgres://[connection_string]`
- 🤖 SAFE-TO-AUTO: If timeout → run migration locally first (`cd packages/database && npx prisma migrate deploy`) to catch errors before Neon retries
- 👤 NEEDS-PATRICK: If Neon dashboard shows "offline" or "suspended" → contact Neon support via dashboard; do not attempt automatic failover

**IF** migration to production Neon fails mid-execution:
- 👤 NEEDS-PATRICK: Do NOT retry migration automatically — migration state may be corrupted. Request Patrick to inspect Neon transaction logs and determine rollback necessity before re-running.

---

### 3. Vercel Frontend Deploy Fails (Build Error / Blank Page)

**Symptom:** Deploy shows red X, or production URL loads blank page / 404.

**IF** build fails during Vercel deploy (error in logs):
- 🤖 SAFE-TO-AUTO: Check Vercel build logs for error type (TypeScript, import, environment variable missing)
- 🤖 SAFE-TO-AUTO: If "Cannot find module X" → verify import path matches actual file (case-sensitive on Linux)
- 🤖 SAFE-TO-AUTO: If "environment variable Y is not set" → request Patrick verify Vercel Project Settings > Environment Variables includes the missing key
- 🤖 SAFE-TO-AUTO: If TypeScript error → check `pnpm --filter frontend run build` locally first to catch before production retry
- 👤 NEEDS-PATRICK: If error is build configuration (next.config.js, tsconfig.json syntax) → post error snippet to Slack; do not redeploy until Patrick approves fix

**IF** build succeeds but production URL blank or 404:
- 🤖 SAFE-TO-AUTO: Check Vercel deployment status (green checkmark? all functions deployed?)
- 🤖 SAFE-TO-AUTO: Hard refresh in browser (`Ctrl+Shift+Delete` cache, then reload)
- 🤖 SAFE-TO-AUTO: Check browser console for errors (network tab, failed resource loads)
- 🤖 SAFE-TO-AUTO: If 404 on root `/` → verify `next.config.js` basePath not misconfigured
- 👤 NEEDS-PATRICK: If page loads but blank with no console errors → request inspection of Service Worker (might be cached stale version); post to Slack before forcing rebuild

**IF** specific routes 404 (e.g., `/dashboard` works but `/auction/[id]` doesn't):
- 🤖 SAFE-TO-AUTO: Check Next.js routing file structure — ensure dynamic route file exists at correct path
- 🤖 SAFE-TO-AUTO: If route exists locally but not in Vercel → rebuild and redeploy via Vercel dashboard (or re-push to trigger rebuild)
- 👤 NEEDS-PATRICK: If route never existed → request feature spec clarification before implementing

---

## 1. Context Overflow
Symptom: "Prompt too long" or mid-task execution stops.
Fix: Restart Claude Desktop, compress state, break into smaller steps, disable unused skills/connectors.

## 2. Cowork Tab Missing
Fix: Update Claude Desktop (v1.8+), confirm Pro/Max plan, restart app.

## 3. Slow Performance
Fix: Close heavy apps, ensure SSD, reduce folder file count (<500), check RAM.

## 4. Task Stops Mid-Execution
Fix: Wait 2–3 min. If stalled → cancel, restart in smaller batches.

## 5. File Permission Errors
Fix: Verify correct folder selected. Check Windows permissions. Avoid symlinked paths.

## 6. Stripe Issues
Check: application_fee_amount set, webhook secret correct, Stripe dashboard logs.

## 7. Geocoding Rate Limit
Fix: Ensure backend cache active, respect 1 req/sec, add fallback provider if needed.

## 8. Auction Polling (Socket.io Deferred)
Current: Polling via React Query (5-second intervals). Revisit when data shows >2s bid delays.

## 9. Service Worker Problems
Fix: Increment version, clear site data, hard refresh, verify offline.html exists.
For Stripe/third-party script blocking, see self_healing_skills.md #17.

## 10. Backend Crash Loop
Fix: Check nodemon error logs. Ensure `pnpm --filter backend run dev` is running (not `npx nodemon`).
See self_healing_skills.md #9 (pnpm/nodemon), #10 (circular deps).

## 11. Migration Drift (Local Dev)
Quick fix (wipes data):
```powershell
cd packages/database
npx prisma migrate reset --force
```

## 12. Native Dev Environment Issues

### 12a. Backend Won't Start (Node.js Error)
Check: Node.js 18+ installed, pnpm 8+, PostgreSQL running on port 5432.
```powershell
node --version  # Should be v18+
pnpm --version  # Should be 8+
psql -U postgres -c "SELECT version();"  # Verify PostgreSQL
```
If PostgreSQL offline: Open Windows Services → PostgreSQL → Restart.

### 12b. Frontend Hot Reload Not Working
Windows 10 native: Set polling environment variables before running:
```powershell
$env:WATCHPACK_POLLING = "true"
$env:CHOKIDAR_USEPOLLING = "true"
pnpm --filter frontend dev
```

### 12c. Prisma Client Mismatch After Schema Change
Regenerate after modifying schema:
```powershell
cd packages/database
npx prisma generate
```

### 12d. Port Already in Use
Check what's using port 3000 (frontend) or 5000 (backend):
```powershell
netstat -ano | findstr ":3000\|:5000"
# Kill by PID: taskkill /PID [PID] /F
```

---

## Recovery Principle

Restore from backup. Reduce scope. Proceed incrementally.
