# TROUBLESHOOTING & RECOVERY

Operational procedures only. For pattern-based fixes, see `self_healing_skills.md`.

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

## 10. Docker Backend Crash Loop
See self_healing_skills.md #9 (pnpm/nodemon), #10 (circular deps), #18 (missing bind mount).
Also: ENUM→TEXT migration fix (P2032) and migration-not-applied restart sequence.

## 11. Docker Hot Reload Not Working (Windows 10)
Backend: nodemon `--legacy-watch`. Frontend: `WATCHPACK_POLLING=true` + `CHOKIDAR_USEPOLLING=true`.

## 12. Migration Drift
See self_healing_skills.md #10 context. Quick fix (local dev, wipes data):
`docker exec findasale-backend-1 sh -c "cd /app/packages/database && npx prisma migrate reset --force"`

## 13. PowerShell + Docker Quoting Issues
Assign SQL to variable first: `$sql = 'DELETE FROM "TableName";'` then pass to docker exec.
For JSON POST, use `Invoke-RestMethod` or browser fetch — never `curl` through `docker exec sh -c`.
See self_healing_skills.md #14, #15, #16.

## 14. npx prisma Picks Up Wrong Version
Never run `npx prisma` from Windows. All Prisma commands via Docker:
`docker exec findasale-backend-1 sh -c "cd /app/packages/database && npx prisma <cmd>"`

## 15. Docker-from-VM Gap
Claude VM cannot reach Docker Desktop daemon. Accepted workflow: Claude writes PowerShell command → Patrick pastes → Patrick returns output. Use Claude in Chrome for API smoke tests.

---

## Recovery Principle

Restore from backup. Reduce scope. Proceed incrementally.
