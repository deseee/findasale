# Canary Deploy & Auto-Rollback

**Owner:** Ops / Engineering
**Last updated:** Session current
**Script:** `scripts/canary-rollback.sh`

---

## How the canary flow works

```
PR opened
  └── Vercel auto-builds a preview URL (unique per commit)
        └── Preview env points NEXT_PUBLIC_API_URL at production backend
              └── Manual or Claude smoke test on preview URL
                    └── PR merged to main
                          ├── Vercel auto-deploys frontend to production
                          └── Railway auto-deploys backend to production
                                └── canary-rollback.sh runs (Claude or manual)
                                      ├── PASS → deployment confirmed healthy
                                      └── FAIL → auto-rollback triggered
```

> **Decision (2026-05-22):** No separate Railway staging service. Preview builds
> hit the production API. The canary script runs post-deploy against production.
> Rationale: solo founder, pre-revenue — staging overhead adds cost with no return.
> Revisit when team grows or revenue justifies the spend.

### Stage details

| Stage | Platform | Config file | Auto-triggered |
|-------|----------|-------------|----------------|
| Preview | Vercel | `packages/frontend/vercel.json` | Yes — every PR |
| Staging backend | Railway | `railway.staging.toml` | **Not provisioned** — reserved for future |
| Production frontend | Vercel | Vercel project settings | Yes — push to main |
| Production backend | Railway | `railway.toml` | Yes — push to main |

### Preview environment behaviour

- Every PR automatically gets a unique Vercel preview URL (`https://<hash>.vercel.app`).
- The preview build sets `NEXT_PUBLIC_API_URL` to the production backend URL via `vercel.json` `env` + `build.env`. No separate staging backend is provisioned.
- All preview responses include the header `X-Deployment-Type: preview` for easy identification in browser devtools or logs.
- Preview deploys are non-destructive — they use the production API but only for read testing. Destructive write testing should be done with test accounts.

---

## Staging vs production config differences

| Setting | Production (`railway.toml`) | Staging (`railway.staging.toml`) |
|---------|----------------------------|----------------------------------|
| Dockerfile | `packages/backend/Dockerfile.production` | Same |
| healthcheckPath | `/` | `/` |
| healthcheckTimeout | 300s | 120s |
| restartPolicyMaxRetries | 3 | 1 |
| Purpose | Tolerate transient slow starts | Surface failures immediately |

The staging slot uses the same Docker image as production so the only variable
being tested is the code change, not the build environment.

---

## Health check thresholds

Set via environment variables before running `canary-rollback.sh`.

| Variable | Default | Meaning |
|----------|---------|---------|
| `HEALTH_POLL_COUNT` | `6` | Number of sequential health checks |
| `HEALTH_POLL_INTERVAL` | `10` | Seconds between each poll |
| `RESPONSE_TIME_THRESHOLD` | `2000` | Max average response time in ms |
| `ERROR_RATE_THRESHOLD` | `5` | Max % of log lines containing error keywords |

### Tuning guidance

- **Increase `HEALTH_POLL_COUNT`** if you want more confidence before declaring healthy (costs more time per deploy).
- **Decrease `RESPONSE_TIME_THRESHOLD`** if the backend is consistently fast (sub-500ms) and you want tight regression detection.
- **Increase `ERROR_RATE_THRESHOLD`** only if the backend produces noisy non-critical logs that match the error keyword pattern. Prefer fixing the noise over raising the threshold.
- **`HEALTH_POLL_INTERVAL`** of 10s is appropriate post-Railway-start. If the service needs longer to warm up, increase to 20–30s.

---

## Running the health check

### Manual (local or Railway shell)

```bash
export BACKEND_URL="https://your-backend.up.railway.app"
export RAILWAY_SERVICE="backend"
export RAILWAY_TOKEN="<token from Railway dashboard>"

# Check backend only
./scripts/canary-rollback.sh backend

# Check both (frontend rollback requires Vercel creds)
export VERCEL_TOKEN="<token>"
export VERCEL_PROJECT_ID="<project-id>"
./scripts/canary-rollback.sh both
```

### In CI (GitHub Actions example)

```yaml
- name: Canary health check
  env:
    BACKEND_URL: ${{ secrets.BACKEND_URL }}
    RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
    RAILWAY_SERVICE: backend
    VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
    VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
  run: |
    chmod +x scripts/canary-rollback.sh
    ./scripts/canary-rollback.sh both
```

Exit codes: `0` = healthy, `1` = rollback triggered, `2` = configuration error.

---

## Triggering manual rollback

### Backend (Railway)

```bash
# Via Railway CLI
railway rollback --service backend

# If rollback subcommand unavailable (older CLI)
railway redeploy --service backend
```

Or: Railway dashboard → backend service → Deployments tab → select previous successful deployment → Redeploy.

### Frontend (Vercel)

```bash
vercel rollback --token $VERCEL_TOKEN --yes
```

Or: Vercel dashboard → project → Deployments → find the last healthy deployment → Promote to Production.

---

## Environment variable differences across envs

| Variable | Preview | Staging | Production |
|----------|---------|---------|------------|
| `NEXT_PUBLIC_API_URL` | Production backend URL (set in `vercel.json`) | N/A (not provisioned) | Production backend URL (Vercel project env) |
| `NODE_ENV` | `production` (Next.js build) | — | `production` |
| `DATABASE_URL` | — (frontend only) | — | Production Railway DB |

**Note:** No staging service is provisioned. If one is added later, it MUST have its own `DATABASE_URL` pointing to a separate database — never the production instance.

---

## What the script does NOT cover

- Blue/green switchover (Railway does not natively support traffic splitting as of this writing).
- Database migration rollback — schema migrations are one-way. Rollback restores the previous app binary but the DB schema stays at the new version. Write all migrations to be backward-compatible with N-1 app versions.
- Vercel frontend health polling — Vercel's own deployment pipeline handles build/deploy health. The script defers to Vercel's checks for the frontend and only triggers `vercel rollback` if called explicitly.
